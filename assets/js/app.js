import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const loginView = document.getElementById("loginView");
const contactView = document.getElementById("contactView");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("email");
const loginPassword = document.getElementById("password");
const loginMessage = document.getElementById("message");
const loginButton = document.getElementById("loginButton");
const contactForm = document.getElementById("contactForm");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactMessage = document.getElementById("contactMessage");
const website = document.getElementById("website");
const contactStatus = document.getElementById("contactStatus");
const contactButton = document.getElementById("contactButton");

let auth;
let db;

function setMessage(element, text, error = true) {
  element.textContent = text;
  element.style.color = error ? "#dc2626" : "#15803d";
}

function showContactForm() {
  loginView.classList.add("hidden");
  contactView.classList.remove("hidden");
  document.title = "Contact";
  contactName.focus();
}

async function initializeFirebase() {
  const response = await fetch("/api/config", {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const type = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`Configuration endpoint returned HTTP ${response.status}.`);
  if (!type.includes("application/json")) throw new Error("Configuration endpoint did not return JSON.");
  const firebaseConfig = await response.json();
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth) return setMessage(loginMessage, "Firebase is still initializing. Please try again.");
  setMessage(loginMessage, "");
  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
    showContactForm();
  } catch (error) {
    const messages = {
      "auth/invalid-credential": "Invalid email or password.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/too-many-requests": "Too many attempts. Please try again later."
    };
    setMessage(loginMessage, messages[error.code] || "Unable to log in.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (website.value.trim()) return;

  setMessage(contactStatus, "");
  contactButton.disabled = true;
  contactButton.textContent = "Sending...";

  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: contactName.value.trim(),
        email: contactEmail.value.trim(),
        message: contactMessage.value.trim(),
        website: website.value
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to send the message.");

    contactForm.reset();
    setMessage(contactStatus, data.message || "Message sent successfully.", false);
  } catch (error) {
    console.error(error);
    setMessage(contactStatus, error.message || "Unable to send the message.");
  } finally {
    contactButton.disabled = false;
    contactButton.textContent = "Send message";
  }
});

initializeFirebase().catch((error) => {
  console.error(error);
  setMessage(loginMessage, error.message || "Unable to initialize the application.");
});
