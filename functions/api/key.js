import { requireFirebaseUser } from "../lib/auth.js";
import { firestoreGet, firestoreQueryEqual, firestoreSet, getBooleanField, getIntegerField, getStringField, stringField, booleanField, integerField, timestampField } from "../lib/firestore.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-";

export async function onRequestGet(context) {
  try {
    const user = await requireFirebaseUser(context.request, context.env);
    const doc = await firestoreGet(context.env, "userApiKeys", user.sub);
    if (!doc) return json({ configured: false, key: null, enabled: false });
    const key = getStringField(doc, "key");
    if (!key) return json({ configured: false, key: null, enabled: false });
    return json({
      configured: true,
      key,
      enabled: getBooleanField(doc, "enabled", true),
      usageCount: getIntegerField(doc, "usageCount", 0)
    });
  } catch (error) { return handleError(error); }
}

export async function onRequestPost(context) {
  try {
    const user = await requireFirebaseUser(context.request, context.env);
    const old = await firestoreGet(context.env, "userApiKeys", user.sub);
    const oldKey = getStringField(old, "key");
    let key = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateKey(32);
      const matches = await firestoreQueryEqual(context.env, "userApiKeys", "key", candidate, 1);
      if (!matches.length) { key = candidate; break; }
    }
    if (!key) throw new Error("Unable to generate a unique API key. Please try again.");

    await firestoreSet(context.env, "userApiKeys", user.sub, {
      userId: stringField(user.sub),
      key: stringField(key),
      enabled: booleanField(true),
      usageCount: integerField(0),
      lastUsedAt: timestampField()
    });

    return json({
      success: true,
      key,
      enabled: true,
      usageCount: 0,
      endpoint: `${new URL(context.request.url).origin}/api/send/${key}`
    });
  } catch (error) { return handleError(error); }
}

export async function onRequestPatch(context) {
  try {
    const user = await requireFirebaseUser(context.request, context.env);
    const doc = await firestoreGet(context.env, "userApiKeys", user.sub);
    const key = getStringField(doc, "key");
    if (!key) return json({ error: "No API key exists for this account." }, 404);
    const body = await context.request.json().catch(() => null);
    if (typeof body?.enabled !== "boolean") return json({ error: "'enabled' must be true or false." }, 400);
    await firestoreSet(context.env, "userApiKeys", user.sub, {
      ...doc.fields,
      userId: stringField(user.sub),
      key: stringField(key),
      enabled: booleanField(body.enabled)
    });
    return json({ success: true, key, enabled: body.enabled });
  } catch (error) { return handleError(error); }
}

function generateKey(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  let out = "";
  for (const byte of bytes) { out += ALPHABET[byte % ALPHABET.length]; if (out.length === length) break; }
  return out;
}
function handleError(error) { console.error(error); return json({ error: error?.message || "Request failed." }, error?.status || 500); }
function json(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
