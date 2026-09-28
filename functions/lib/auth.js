const encoder = new TextEncoder();
const decoder = new TextDecoder();

let publicKeysCache = null;
let publicKeysExpires = 0;

export async function requireFirebaseUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) throw unauthorized();
  const token = header.slice(7).trim();
  if (!token) throw unauthorized();
  return verifyFirebaseIdToken(token, requiredEnv(env, "FIREBASE_PROJECT_ID"));
}

export async function verifyFirebaseIdToken(token, projectId) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw unauthorized();

  let header;
  let payload;
  try {
    header = JSON.parse(decoder.decode(base64UrlToBytes(parts[0])));
    payload = JSON.parse(decoder.decode(base64UrlToBytes(parts[1])));
  } catch {
    throw unauthorized();
  }

  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || !header.kid) throw unauthorized();
  if (payload.aud !== projectId) throw unauthorized();
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw unauthorized();
  if (typeof payload.sub !== "string" || !payload.sub) throw unauthorized();
  if (Number(payload.exp) <= now) throw unauthorized();
  if (Number(payload.iat) > now + 60) throw unauthorized();

  const keys = await getGooglePublicKeys();
  const jwk = keys[header.kid];
  if (!jwk || jwk.kty !== "RSA" || jwk.alg !== "RS256") throw unauthorized();

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64UrlToBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw unauthorized();
  return payload;
}

async function getGooglePublicKeys() {
  if (publicKeysCache && Date.now() < publicKeysExpires) return publicKeysCache;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error(`Unable to retrieve Firebase verification keys (HTTP ${response.status}).`);
  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  const body = await response.json();
  if (!body?.keys?.length) throw new Error("Firebase verification key response was invalid.");
  publicKeysCache = Object.fromEntries(body.keys.filter(k => k?.kid && k?.kty === "RSA" && k?.alg === "RS256").map(k => [k.kid, k]));
  publicKeysExpires = Date.now() + Math.min(maxAge, 21600) * 1000;
  return publicKeysCache;
}

function requiredEnv(env, key) {
  if (!env[key]) { const e = new Error(`Missing server configuration: ${key}`); e.status = 500; throw e; }
  return String(env[key]);
}

function unauthorized() { const e = new Error("Authentication required."); e.status = 401; return e; }

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
