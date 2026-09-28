import { firestoreGet, firestoreQueryEqual, firestoreIncrement, firestoreUpdateFields, getBooleanField, getStringField, getIntegerField, timestampField } from "../../lib/firestore.js";
import { decryptSecret } from "../../lib/crypto.js";
import { sendSmtp } from "../../lib/smtp.js";

export async function onRequestPost(context) {
  const key = context.params.key;
  try {
    if (!key || !/^[A-Za-z0-9-]{16,128}$/.test(key)) return json({ error: "Invalid API key." }, 400);
    const matches = await firestoreQueryEqual(context.env, "userApiKeys", "key", key, 1);
    const apiDoc = matches[0] || null;
    if (!apiDoc || !getBooleanField(apiDoc, "enabled", false)) return json({ error: "API key is invalid or disabled." }, 401);
    const userId = getStringField(apiDoc, "userId");
    if (!userId) return json({ error: "API key configuration is incomplete." }, 500);

    const smtpDoc = await firestoreGet(context.env, "smtpConfigs", userId);
    if (!smtpDoc) return json({ error: "Missing configuration." }, 409);
    const ciphertext = getStringField(smtpDoc, "passwordCiphertext");
    const iv = getStringField(smtpDoc, "passwordIv");
    if (!ciphertext || !iv) return json({ error: "SMTP password is not configured." }, 409);

    const raw = await context.request.text();
    if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) return json({ error: "Request body is too large." }, 413);
    let payload;
    try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
    validatePayload(payload);

    const port = Number(getStringField(smtpDoc, "port", "465"));
    const security = getStringField(smtpDoc, "security", "ssl");
    const password = await decryptSecret(ciphertext, iv, context.env);
    const smtpOptions = {
      host: getStringField(smtpDoc, "host"),
      port, security,
      user: getStringField(smtpDoc, "username"),
      fromEmail: getStringField(smtpDoc, "fromEmail"),
      password,
      fromName: getStringField(smtpDoc, "fromName"),
      ehloName: getStringField(smtpDoc, "ehloName", "localhost")
    };

    const requestedRecipients = normalizeEmails(payload.to, false);
    const senderEmail = smtpOptions.user.trim().toLowerCase();

    // Without `to`, the authenticated SMTP account remains the recipient.
    // With `to`, the main email is delivered to the requested recipient(s).
    await sendSmtp({
      ...smtpOptions,
      payload
    });

    // When a different recipient is requested, send the authenticated user a small notice.
    if (requestedRecipients.length && !allSameEmail(requestedRecipients, senderEmail)) {
      try {
        const labels = await Promise.all(requestedRecipients.map(email => getRecipientLabel(context.env, email)));
        const recipientLabel = labels.join(", ");
        await sendSmtp({
          ...smtpOptions,
          payload: {
            subject: "Email sent successfully",
            message: `Email was sent to ${recipientLabel}.`,
            to: senderEmail
          }
        });
      } catch (noticeError) {
        // The original email was already sent successfully. A notice failure must not make the request fail.
        console.error("Unable to send recipient notice:", noticeError);
      }
    }

    // Count only successful endpoint sends. The count is atomic so concurrent requests do not overwrite it.
    try {
      await firestoreIncrement(context.env, "userApiKeys", userId, "usageCount", 1);
    } catch (e) {
      console.error("Unable to update API usage count", e);
    }
    try {
      await firestoreUpdateFields(context.env, "userApiKeys", userId, { lastUsedAt: timestampField() });
    } catch (e) {
      console.error("Unable to update lastUsedAt", e);
    }
    return json({ success: true, message: "Email sent successfully." });
  } catch (error) {
    console.error("API send error:", error);
    return json({ error: publicError(error) }, error?.status || 502);
  }
}

function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw clientError("JSON body must be an object.");
  }
  if (typeof body.subject !== "string" || !body.subject.trim()) {
    throw clientError("A non-empty 'subject' is required.");
  }
  const hasMessage = typeof body.message === "string" && body.message.length > 0;
  const hasHtml = typeof body.html === "string" && body.html.length > 0;
  if (!hasMessage && !hasHtml) {
    throw clientError("A non-empty 'message' or 'html' is required.");
  }
  if (body.name !== undefined && typeof body.name !== "string") {
    throw clientError("'name' must be a string.");
  }
  if (body.cc !== undefined && !normalizeEmails(body.cc).length) {
    throw clientError("Invalid 'cc' value.");
  }
  if (body.bcc !== undefined && !normalizeEmails(body.bcc).length) {
    throw clientError("Invalid 'bcc' value.");
  }
  if (body.email !== undefined && !normalizeEmails(body.email).length) {
    throw clientError("Invalid 'email' value.");
  }
  if (body.to !== undefined && !normalizeEmails(body.to).length) {
    throw clientError("Invalid 'to' value.");
  }
  if (body.html !== undefined && typeof body.html !== "string") {
    throw clientError("'html' must be a string.");
  }
  for (const [field, max] of [["subject", 998], ["message", 1024 * 1024], ["html", 1024 * 1024]]) {
    if (body[field] !== undefined && String(body[field]).length > max) {
      throw clientError(`'${field}' is too long.`);
    }
  }
}
function normalizeEmails(value) {
  const input = Array.isArray(value) ? value : [value];
  const result = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    for (const part of item.split(/[;,]/).map(v => v.trim()).filter(Boolean)) {
      if (part.length <= 320 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(part)) result.push(part);
    }
  }
  return [...new Set(result)];
}

async function getRecipientLabel(env, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return email;

  try {
    const matches = await firestoreQueryEqual(env, "users", "email", normalizedEmail, 1);
    const doc = matches[0];
    if (!doc) return normalizedEmail;

    const firstName = getStringField(doc, "firstName", "").trim();
    const lastName = getStringField(doc, "lastName", "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    return fullName ? `${fullName} (${normalizedEmail})` : normalizedEmail;
  } catch (error) {
    console.error("Unable to look up recipient profile:", error);
    return normalizedEmail;
  }
}

function allSameEmail(emails, reference) {
  const cleanReference = String(reference || "").trim().toLowerCase();
  return emails.length > 0 && emails.every(email => String(email).trim().toLowerCase() === cleanReference);
}

function clientError(message) { const e = new Error(message); e.status = 400; return e; }
function publicError(error) {
  if (Number(error?.smtpCode) === 535) return "Bad Credentials";
  if (error?.code === "SMTP_TIMEOUT") return "SMTP request timed out.";
  if ([400,401,409,413].includes(error?.status)) return error.message;
  if (error?.smtpCode) return "SMTP server rejected the request.";
  if (error?.status && error.status >= 500) return "SMTP connection failed.";
  const message = String(error?.message || "").trim();
  return message || "SMTP connection failed.";
}
function json(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
