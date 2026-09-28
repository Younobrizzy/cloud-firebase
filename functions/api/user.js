import { requireFirebaseUser } from "../lib/auth.js";
import {
  firestoreGet,
  firestoreSet,
  getStringField,
  stringField
} from "../lib/firestore.js";

export async function onRequestGet(context) {
  try {
    const user = await requireFirebaseUser(context.request, context.env);
    const doc = await firestoreGet(context.env, "users", user.sub);

    if (!doc) {
      return json({ configured: false, user: null });
    }

    return json({
      configured: true,
      user: {
        userId: getStringField(doc, "userId", user.sub),
        firstName: getStringField(doc, "firstName"),
        lastName: getStringField(doc, "lastName"),
        email: getStringField(doc, "email", user.email || ""),
        role: getStringField(doc, "role", "subscriber")
      }
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost(context) {
  try {
    const user = await requireFirebaseUser(context.request, context.env);
    const existing = await firestoreGet(context.env, "users", user.sub);

    if (existing) {
      return json({
        success: true,
        configured: true,
        user: profileFromDocument(existing, user)
      });
    }

    const body = await context.request.json().catch(() => null);
    validate(body);

    const firstName = normalizeName(body.firstName);
    const lastName = normalizeName(body.lastName);
    const email = String(user.email || "").trim().toLowerCase();

    if (!email) {
      const error = new Error("Your account does not have an email address.");
      error.status = 400;
      throw error;
    }

    const fields = {
      userId: stringField(user.sub),
      firstName: stringField(firstName),
      lastName: stringField(lastName),
      email: stringField(email),
      role: stringField("subscriber")
    };

    const saved = await firestoreSet(context.env, "users", user.sub, fields);

    return json({
      success: true,
      configured: true,
      user: profileFromDocument(saved, user)
    });
  } catch (error) {
    return handleError(error);
  }
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw bad("JSON body must be an object.");
  }
  for (const field of ["firstName", "lastName"]) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      throw bad(`'${field}' is required.`);
    }
    if (body[field].trim().length > 80) {
      throw bad(`'${field}' is too long.`);
    }
  }
}

function normalizeName(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function profileFromDocument(doc, user) {
  return {
    userId: getStringField(doc, "userId", user.sub),
    firstName: getStringField(doc, "firstName"),
    lastName: getStringField(doc, "lastName"),
    email: getStringField(doc, "email", user.email || ""),
    role: getStringField(doc, "role", "subscriber")
  };
}

function bad(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function handleError(error) {
  console.error(error);
  return json({ error: error?.message || "Request failed." }, error?.status || 500);
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}
