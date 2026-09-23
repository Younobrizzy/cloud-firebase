import { requireAuth, logout } from "/assets/js/auth-guard.js";

const firestoreButton = document.getElementById("firestoreButton");
const formatterButton = document.getElementById("formatterButton");
const importerButton = document.getElementById("importerButton");
const logoutButton = document.getElementById("logoutButton");

firestoreButton?.addEventListener("click", () => {
  window.location.href = "/firestore/";
});

formatterButton?.addEventListener("click", () => {
  window.location.href = "/formatter/";
});

importerButton?.addEventListener("click", () => {
  window.location.href = "/importer/";
});

let auth = null;

requireAuth({
  onUser: (user, authInstance) => {
    auth = authInstance;
    const emailElement = document.getElementById("userEmail");
    if (emailElement) {
      emailElement.textContent = user.email || "Signed-in user";
    }
  }
});

logoutButton?.addEventListener("click", () => logout(auth, logoutButton));
