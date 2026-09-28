import { requireFirebaseUser } from "../lib/auth.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { firestoreGet, firestoreSet, getStringField, stringField, integerField, timestampField } from "../lib/firestore.js";
import { verifySmtpSender } from "../lib/smtp.js";

export async function onRequestGet(context) {
  try {
    const user = await requireFirebaseUser(context.request, context.env);
    const doc = await firestoreGet(context.env, "smtpConfigs", user.sub);
    if (!doc) return json({ configured: false, smtp: null });
    return json({
      configured: true,
      smtp: {
        host: getStringField(doc, "host"),
        port: Number(getStringField(doc, "port", "465")),
        security: getStringField(doc, "security", "ssl"),
        username: getStringField(doc, "username"),
        fromEmail: getStringField(doc, "fromEmail"),
        fromName: getStringField(doc, "fromName")
      },
      passwordSaved: Boolean(doc.fields?.passwordCiphertext?.stringValue)
    });
  } catch (error) { return handleError(error); }
}

export async function onRequestPut(context) {
  try {
    const user = await requireFirebaseUser(context.request, context.env);
    const body = await readJson(context.request);
    validate(body);
    const existing = await firestoreGet(context.env, "smtpConfigs", user.sub);
    let encrypted = null;
    if (typeof body.password === "string" && body.password.length) encrypted = await encryptSecret(body.password, context.env);
    else if (existing?.fields?.passwordCiphertext?.stringValue && existing?.fields?.passwordIv?.stringValue) {
      encrypted = { ciphertext: existing.fields.passwordCiphertext.stringValue, iv: existing.fields.passwordIv.stringValue };
    } else throw clientError("SMTP password is required the first time you save the configuration.");

    const normalizedHost = body.host.trim();
    const normalizedPort = Number(body.port);
    const normalizedSecurity = normalizeSecurity(body.security, normalizedPort);
    const normalizedUsername = body.username.trim();
    const normalizedFromEmail = normalizeFromEmail(body.fromEmail);

    if (normalizedFromEmail && normalizedFromEmail.toLowerCase() !== normalizedUsername.toLowerCase()) {
      await verifySmtpSender({
        host: normalizedHost,
        port: normalizedPort,
        security: normalizedSecurity,
        user: normalizedUsername,
        password: await decryptSecret(encrypted.ciphertext, encrypted.iv, context.env),
        fromEmail: normalizedFromEmail,
        ehloName: "localhost"
      });
    }

    const fields = {
      host: stringField(normalizedHost),
      port: stringField(String(normalizedPort)),
      security: stringField(normalizedSecurity),
      username: stringField(normalizedUsername),
      fromEmail: stringField(normalizedFromEmail),
      passwordCiphertext: stringField(encrypted.ciphertext),
      passwordIv: stringField(encrypted.iv),
      fromName: stringField(String(body.fromName || "").trim()),
      updatedAt: timestampField()
    };
    await firestoreSet(context.env, "smtpConfigs", user.sub, fields);
    return json({ success: true, message: "SMTP configuration saved.", passwordSaved: true });
  } catch (error) { return handleError(error); }
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 64 * 1024) throw clientError("Request body is too large.");
  try { return JSON.parse(text); } catch { throw clientError("Invalid JSON."); }
}
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw clientError("JSON body must be an object.");
  }
  for (const field of ["host", "username"]) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      throw clientError(`'${field}' is required.`);
    }
  }
  const port = Number(body.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw clientError("SMTP port must be a valid TCP port.");
  }
  if (
    body.username.trim().length > 320 ||
    body.host.trim().length > 253 ||
    String(body.fromEmail || "").trim().length > 320
  ) {
    throw clientError("SMTP configuration contains a value that is too long.");
  }
}
function normalizeFromEmail(value) {
  const email = String(value || "").trim();
  if (!email) return "";
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw clientError("'fromEmail' must be a valid email address when provided.");
  }
  return email;
}

function normalizeSecurity(value, port) {
  const v = String(value || "").toLowerCase();
  if (["ssl", "starttls", "off"].includes(v)) return v;
  if (port === 465) return "ssl";
  if (port === 587 || port === 2525) return "starttls";
  return "off";
}
function clientError(message) { const e = new Error(message); e.status = 400; return e; }
function handleError(error) {
  console.error(error);
  if (Number(error?.smtpCode) === 535) {
    return json({ error: "Bad Credentials" }, 502);
  }
  return json({ error: error?.message || "Request failed." }, error?.status || 500);
}
function json(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
