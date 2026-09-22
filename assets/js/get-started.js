import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const accountCard = document.getElementById("accountCard");
const avatar = document.getElementById("avatar");
const displayName = document.getElementById("displayName");
const email = document.getElementById("email");
const continueButton = document.getElementById("continueButton");
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
      return;
    }

    const name = user.displayName?.trim() || "Cloud Firebase user";
    const userEmail = user.email || "Signed in";
    const initial = name.charAt(0).toUpperCase() || "C";

    displayName.textContent = name;
    email.textContent = userEmail;
    avatar.textContent = initial;
    accountCard.hidden = false;
  });

  continueButton.addEventListener("click", () => {
    // Reserved for the next authenticated destination.
    continueButton.textContent = "Ready";
    continueButton.disabled = true;
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
