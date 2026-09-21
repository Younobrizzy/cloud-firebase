import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const loginButton = document.getElementById("loginButton");

let auth;
let db;

function setMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? "#dc2626" : "#15803d";
}

async function initializeFirebase() {
  const response = await fetch("/api/config", {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Configuration endpoint returned HTTP ${response.status}${body ? `: ${body}` : ""}`
    );
  }

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(
      `Configuration endpoint did not return JSON. Received: ${body.slice(0, 100)}`
    );
  }

  const firebaseConfig = await response.json();

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  return { app, auth, db };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!auth) {
    setMessage("Firebase is still initializing. Please try again.");
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setMessage("");
  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setMessage("Login successful.", false);
  } catch (error) {
    console.error("Login error:", error);

    const messages = {
      "auth/invalid-credential": "Invalid email or password.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/too-many-requests": "Too many attempts. Please try again later."
    };

    setMessage(messages[error.code] || error.message || "Unable to log in.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
});

initializeFirebase().catch((error) => {
  console.error("Firebase initialization error:", error);
  setMessage(error.message || "Unable to initialize the application.");
});
