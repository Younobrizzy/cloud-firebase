const encoder = new TextEncoder();

export async function encryptSecret(secret, env) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(String(secret))
  );
  return {
    ciphertext: base64UrlEncodeBytes(new Uint8Array(ciphertext)),
    iv: base64UrlEncodeBytes(iv)
  };
}

export async function decryptSecret(ciphertext, iv, env) {
  const key = await getKey(env);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64Bytes(iv, "encrypted IV") },
      key,
      decodeBase64Bytes(ciphertext, "encrypted password")
    );
  } catch {
    const e = new Error(
      "Unable to decrypt the saved SMTP password. Check that SMTP_ENCRYPTION_KEY has not changed since the password was saved."
    );
    e.status = 500;
    throw e;
  }
  return new TextDecoder().decode(plaintext);
}

async function getKey(env) {
  const raw = String(env.SMTP_ENCRYPTION_KEY ?? "").trim();
  if (!raw) {
    const e = new Error("Missing server configuration: SMTP_ENCRYPTION_KEY");
    e.status = 500;
    throw e;
  }

  // Accept:
  // 1) standard base64
  // 2) base64url
  // 3) 64-character hex
  // 4) any other sufficiently long secret, deterministically hashed with SHA-256
  // The last option avoids fragile atob() errors when users paste a normal secret.
  let bytes;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    bytes = hexToBytes(raw);
  } else if (looksLikeBase64(raw)) {
    try {
      bytes = decodeBase64Bytes(raw, "SMTP_ENCRYPTION_KEY");
    } catch {
      bytes = null;
    }
    if (bytes?.byteLength !== 32) bytes = null;
  }

  if (!bytes) {
    if (raw.length < 16) {
      const e = new Error(
        "SMTP_ENCRYPTION_KEY must be at least 16 characters long, or be a valid 32-byte base64/base64url/hex value."
      );
      e.status = 500;
      throw e;
    }
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
    bytes = new Uint8Array(digest);
  }

  if (bytes.byteLength !== 32) {
    const e = new Error("SMTP_ENCRYPTION_KEY must resolve to exactly 32 bytes.");
    e.status = 500;
    throw e;
  }

  return crypto.subtle.importKey(
    "raw",
    bytes,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
}

function looksLikeBase64(value) {
  const normalized = value
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!normalized || normalized.length % 4 === 1) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(normalized);
}

function decodeBase64Bytes(value, label) {
  let normalized = String(value)
    .trim()
    .replace(/^"(.*)"$/s, "$1")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (normalized.length % 4 === 1) {
    throw new Error(`${label} is not valid base64.`);
  }

  normalized += "=".repeat((4 - (normalized.length % 4)) % 4);

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`${label} is not valid base64.`);
  }

  let binary;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error(`${label} is not valid base64.`);
  }

  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function hexToBytes(value) {
  const result = new Uint8Array(value.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
