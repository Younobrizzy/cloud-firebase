import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const logoutButton = document.getElementById("logoutButton");

async function initializeFirebase() {
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
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("/");
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out...";

    try {
      await signOut(auth);
      window.location.replace("/");
    } catch (error) {
      console.error(error);
      logoutButton.disabled = false;
      logoutButton.textContent = "Sign out";
    }
  });
}

initializeFirebase().catch((error) => {
  console.error(error);
  window.location.replace("/");
});
