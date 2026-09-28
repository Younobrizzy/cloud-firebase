let accessToken = null;
let accessTokenExpires = 0;

const encoder = new TextEncoder();

export async function firestoreGet(env, collection, documentId) {
  const response = await firestoreRequest(env, "GET", firestoreDocumentUrl(env, collection, documentId));
  if (response.status === 404) return null;
  if (!response.ok) throw await firestoreError(response, "Firestore read failed");
  return await response.json();
}

export async function firestoreQueryEqual(env, collection, fieldPath, value, limit = 10) {
  const project = requiredEnv(env, "FIREBASE_PROJECT_ID");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: stringField(value) } },
      limit: Math.max(1, Math.min(Number(limit) || 10, 100))
    }
  };
  const response = await firestoreRequest(env, "POST", url, body);
  if (!response.ok) throw await firestoreError(response, "Firestore query failed");
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(row => row?.document).filter(Boolean) : [];
}

export async function firestoreSet(env, collection, documentId, fields) {
  const response = await firestoreRequest(env, "PATCH", firestoreDocumentUrl(env, collection, documentId), { fields });
  if (!response.ok) throw await firestoreError(response, "Firestore write failed");
  return await response.json();
}

export async function firestoreUpdateFields(env, collection, documentId, fields) {
  const baseUrl = firestoreDocumentUrl(env, collection, documentId);
  const params = new URLSearchParams();
  for (const fieldPath of Object.keys(fields)) params.append("updateMask.fieldPaths", fieldPath);
  const response = await firestoreRequest(env, "PATCH", `${baseUrl}?${params.toString()}`, { fields });
  if (!response.ok) throw await firestoreError(response, "Firestore field update failed");
  return await response.json();
}

export async function firestoreIncrement(env, collection, documentId, fieldPath, amount = 1) {
  const project = requiredEnv(env, "FIREBASE_PROJECT_ID");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents:commit`;
  const document = firestoreDocumentUrl(env, collection, documentId)
    .replace(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/`, `projects/${encodeURIComponent(project)}/databases/(default)/documents/`);
  const body = {
    writes: [{
      transform: {
        document,
        fieldTransforms: [{
          fieldPath,
          increment: integerField(amount)
        }]
      }
    }]
  };
  const response = await firestoreRequest(env, "POST", url, body);
  if (!response.ok) throw await firestoreError(response, "Firestore increment failed");
  return await response.json();
}

export async function firestoreDelete(env, collection, documentId) {
  const response = await firestoreRequest(env, "DELETE", firestoreDocumentUrl(env, collection, documentId));
  if (response.status === 404) return;
  if (!response.ok) throw await firestoreError(response, "Firestore delete failed");
}

export function stringField(value) { return { stringValue: String(value) }; }
export function booleanField(value) { return { booleanValue: Boolean(value) }; }
export function integerField(value) { return { integerValue: String(Math.trunc(Number(value))) }; }
export function timestampField(date = new Date()) { return { timestampValue: date.toISOString() }; }

export function getStringField(doc, name, fallback = "") {
  return doc?.fields?.[name]?.stringValue ?? fallback;
}
export function getBooleanField(doc, name, fallback = false) {
  const value = doc?.fields?.[name]?.booleanValue;
  return value === undefined ? fallback : Boolean(value);
}
export function getIntegerField(doc, name, fallback = 0) {
  const value = doc?.fields?.[name]?.integerValue ?? doc?.fields?.[name]?.doubleValue;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function firestoreDocumentUrl(env, collection, documentId) {
  const project = requiredEnv(env, "FIREBASE_PROJECT_ID");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/${collection}/${encodeURIComponent(documentId)}`;
}

async function firestoreRequest(env, method, url, body) {
  const token = await getGoogleAccessToken(env);
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function firestoreError(response, fallback) {
  const text = await response.text().catch(() => "");
  let detail = "";
  try { detail = JSON.parse(text)?.error?.message || ""; } catch {}
  const error = new Error(detail ? `${fallback}: ${detail}` : `${fallback} (HTTP ${response.status}).`);
  error.status = response.status >= 500 ? 502 : 500;
  return error;
}

function getServiceAccount(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(String(env.FIREBASE_SERVICE_ACCOUNT_JSON));
      if (!parsed?.client_email || !parsed?.private_key) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain client_email and private_key.");
      }
      return {
        email: String(parsed.client_email),
        privateKey: String(parsed.private_key)
      };
    } catch (error) {
      if (error?.message?.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON")) throw error;
      const e = new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
      e.status = 500;
      throw e;
    }
  }

  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      email: String(env.FIREBASE_CLIENT_EMAIL),
      privateKey: String(env.FIREBASE_PRIVATE_KEY)
    };
  }

  const e = new Error(
    "Missing server configuration: add FIREBASE_SERVICE_ACCOUNT_JSON (recommended), or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
  );
  e.status = 500;
  throw e;
}

async function getGoogleAccessToken(env) {
  if (accessToken && Date.now() < accessTokenExpires - 60000) return accessToken;

  const serviceAccount = getServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const key = await importPrivateKey(serviceAccount.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    encoder.encode(unsigned)
  );
  const assertion = `${unsigned}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google service-account authentication failed (HTTP ${response.status})${text ? `: ${text.slice(0, 300)}` : "."}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("Google service-account response did not include an access token.");
  accessToken = data.access_token;
  accessTokenExpires = Date.now() + Number(data.expires_in || 3600) * 1000;
  return accessToken;
}

async function importPrivateKey(pem) {
  const original = String(pem ?? "").trim();
  const clean = original
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  if (!clean || clean.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    const e = new Error(
      "Firebase service-account private key is malformed. Use the private_key value exactly as downloaded from the service-account JSON."
    );
    e.status = 500;
    throw e;
  }

  let binary;
  try {
    binary = atob(clean);
  } catch {
    const e = new Error(
      "Firebase service-account private key is not valid base64. Re-download the service-account JSON and paste the complete file into FIREBASE_SERVICE_ACCOUNT_JSON."
    );
    e.status = 500;
    throw e;
  }

  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      bytes.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch {
    const e = new Error(
      "Firebase service-account private key could not be imported. Make sure FIREBASE_SERVICE_ACCOUNT_JSON contains the complete downloaded service-account JSON."
    );
    e.status = 500;
    throw e;
  }
}

function base64UrlEncode(value) { return base64UrlEncodeBytes(new TextEncoder().encode(value)); }

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function requiredEnv(env, key) {
  if (!env[key]) {
    const e = new Error(`Missing server configuration: ${key}`);
    e.status = 500;
    throw e;
  }
  return String(env[key]);
}
