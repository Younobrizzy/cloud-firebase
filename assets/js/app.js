import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const loginView = document.getElementById("loginView");
const contactView = document.getElementById("contactView");
const loginForm = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const message = document.getElementById("message");
const loginButton = document.getElementById("loginButton");
const googleButton = document.getElementById("googleButton");
const contactForm = document.getElementById("contactForm");
const contactStatus = document.getElementById("contactStatus");

let auth;
let db;

const googleButtonHTML = googleButton.innerHTML;

function setMessage(element, text, error = true) {
  element.textContent = text;
  element.style.color = error ? "#dc2626" : "#15803d";
}

function showContact() {
  loginView.classList.add("hidden");
  contactView.classList.remove("hidden");
  document.title = "Cloud Firebase";
  document.getElementById("name").focus();
}

async function initializeFirebase() {
  const response = await fetch("/api/config", {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(
      `Configuration endpoint returned HTTP ${response.status}: ${await response.text()}`
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Configuration endpoint did not return JSON. Received: ${(await response.text()).slice(0, 100)}`
    );
  }

  const firebaseConfig = await response.json();
  const app = initializeApp(firebaseConfig);

  auth = getAuth(app);
  db = getFirestore(app);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!auth) {
    setMessage(message, "Firebase is still initializing. Please try again.");
    return;
  }

  setMessage(message, "");
  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";

  try {
    await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
    showContact();
  } catch (error) {
    const errors = {
      "auth/invalid-credential": "Invalid email or password.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/too-many-requests": "Too many attempts. Please try again later."
    };

    setMessage(message, errors[error.code] || error.message || "Unable to log in.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
});

googleButton.addEventListener("click", async () => {
  if (!auth) {
    setMessage(message, "Firebase is still initializing. Please try again.");
    return;
  }

  setMessage(message, "");
  googleButton.disabled = true;
  googleButton.textContent = "Signing in...";

  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    showContact();
  } catch (error) {
    const errors = {
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
      "auth/popup-blocked": "Your browser blocked the Google sign-in popup.",
      "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication."
    };

    setMessage(message, errors[error.code] || error.message || "Unable to sign in with Google.");
  } finally {
    googleButton.disabled = false;
    googleButton.innerHTML = googleButtonHTML;
  }
});

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setMessage(
    contactStatus,
    "Message form is ready. Connect the submit action to your backend to send it.",
    false
  );
});

initializeFirebase().catch((error) => {
  console.error(error);
  setMessage(message, error.message || "Unable to initialize the application.");
});
