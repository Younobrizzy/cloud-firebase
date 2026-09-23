import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

let appPromise;
let authPromise;

async function getFirebaseAppInstance() {
  if (appPromise) return appPromise;

  appPromise = (async () => {
    const response = await fetch("/api/config", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      throw new Error(`Configuration endpoint returned HTTP ${response.status}.`);
    }

    if (!contentType.includes("application/json")) {
      throw new Error("Configuration endpoint did not return JSON.");
    }

    const firebaseConfig = await response.json();
    return initializeApp(firebaseConfig);
  })();

  return appPromise;
}

async function getAuthInstance() {
  if (authPromise) return authPromise;

  authPromise = (async () => {
    const app = await getFirebaseAppInstance();
    return getAuth(app);
  })();
  return authPromise;
}

export async function getFirebaseApp() {
  return getFirebaseAppInstance();
}

export async function requireAuth({ onUser, onReady, onError } = {}) {
  try {
    const auth = await getAuthInstance();

    onAuthStateChanged(auth, (user) => {
      if (!user) {
        const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const target = `/?next=${encodeURIComponent(next)}`;
        window.location.replace(target);
        return;
      }

      document.documentElement.classList.add("auth-ready");
      onUser?.(user, auth);
      onReady?.(user, auth);
    });

    return auth;
  } catch (error) {
    console.error(error);
    onError?.(error);
    window.location.replace("/");
    return null;
  }
}

export async function logout(auth, button) {
  if (!auth) return;

  if (button) {
    button.disabled = true;
    button.textContent = "Signing out...";
  }

  try {
    await signOut(auth);
    window.location.replace("/");
  } catch (error) {
    console.error(error);
    if (button) {
      button.disabled = false;
      button.textContent = "Sign out";
    }
  }
}
