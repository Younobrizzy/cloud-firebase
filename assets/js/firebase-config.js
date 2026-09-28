// Firebase configuration is loaded at runtime from /api/config.
// No Firebase configuration values are hardcoded in this file.

export async function getFirebaseConfig() {
  const response = await fetch("/api/config", {
    method: "GET",
    headers: { "Accept": "application/json" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Unable to load Firebase configuration.");
  }

  return response.json();
}
