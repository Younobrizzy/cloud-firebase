import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function headerValue(value, max = 254) {
  return String(value ?? "").replace(/[\r\n]/g, " ").trim().slice(0, max);
}

function bodyValue(value, max = 5000) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, max);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readReply(reader) {
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("SMTP connection closed unexpectedly.");

    buffer += decoder.decode(value, { stream: true });

    let newline;
    while ((newline = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 2);
      full += line + "\n";

      // SMTP multiline responses end with "250 " (space), not "250-".
      if (/^\d{3} /.test(line)) {
        const code = Number(line.slice(0, 3));
        if (code >= 400) throw new Error(`SMTP ${code}: ${line.slice(4)}`);
        return { code, text: full.trim() };
      }
    }
  }
}

async function command(writer, reader, text, expected) {
  await writer.write(encoder.encode(text + "\r\n"));
  const reply = await readReply(reader);
  if (!expected.includes(reply.code)) {
    throw new Error(`SMTP ${reply.code}: ${reply.text}`);
  }
  return reply;
}

export async function onRequestPost(context) {
  const env = context.env;

  const missing = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "CONTACT_TO"
  ].filter((key) => !env[key]);

  if (missing.length) {
    return response({
      error: "SMTP configuration is incomplete.",
      missing
    }, 500);
  }

  let data;
  try {
    data = await context.request.json();
  } catch {
    return response({ error: "Invalid request body." }, 400);
  }

  if (data.website) return response({ success: true, message: "Message received." });

  const name = headerValue(data.name, 120);
  const email = headerValue(data.email, 254);
  const message = bodyValue(data.message, 5000);
  const host = String(env.SMTP_HOST).trim();
  const port = Number(env.SMTP_PORT);
  const username = String(env.SMTP_USERNAME).trim();
  const password = String(env.SMTP_PASSWORD);
  const recipient = headerValue(env.CONTACT_TO, 254);

  if (!name || !email || !message) {
    return response({ error: "Name, email, and message are required." }, 400);
  }

  if (!validEmail(email)) {
    return response({ error: "Please enter a valid email address." }, 400);
  }

  if (!Number.isInteger(port) || port !== 465) {
    return response({
      error: "Set SMTP_PORT to 465 for Gmail SSL."
    }, 500);
  }

  let socket;
  let reader;
  let writer;

  try {
    // Gmail port 465 uses implicit TLS, so there is no STARTTLS upgrade.
    socket = connect(
      { hostname: host, port: 465 },
      { secureTransport: "on" }
    );

    await socket.opened;

    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();

    await readReply(reader);

    await command(writer, reader, "EHLO cloudflare-pages", [250]);

    await command(writer, reader, "AUTH LOGIN", [334]);
    await command(writer, reader, btoa(username), [334]);
    await command(writer, reader, btoa(password), [235]);

    await command(writer, reader, `MAIL FROM:<${username}>`, [250]);
    await command(writer, reader, `RCPT TO:<${recipient}>`, [250, 251]);
    await command(writer, reader, "DATA", [354]);

    const subject = `New contact message from ${name}`;
    const safeMessage = message.replace(/^\./gm, "..");

    const mail = [
      `From: ${username}`,
      `To: ${recipient}`,
      `Reply-To: ${email}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "Message:",
      safeMessage,
      ""
    ].join("\r\n");

    await writer.write(encoder.encode(mail + "\r\n.\r\n"));
    await readReply(reader);

    await command(writer, reader, "QUIT", [221]);

    reader.releaseLock();
    writer.releaseLock();
    await socket.close();

    return response({
      success: true,
      message: "Message sent successfully."
    });
  } catch (error) {
    console.error("Gmail SMTP error:", error);

    try { reader?.releaseLock(); } catch {}
    try { writer?.releaseLock(); } catch {}
    try { await socket?.close(); } catch {}

    // Return the SMTP error while debugging. Remove detail later if desired.
    return response({
      error: `Gmail SMTP error: ${error?.message || "Unknown SMTP error."}`
    }, 502);
  }
}
