import { requireAuth, logout } from "/assets/js/auth-guard.js";

const formatterButton = document.getElementById("formatterButton");
const importerButton = document.getElementById("importerButton");
const logoutButton = document.getElementById("logoutButton");


formatterButton?.addEventListener("click", () => {
  window.location.href = "/formatter/";
});

importerButton?.addEventListener("click", () => {
  window.location.href = "/importer/";
});

let auth = null;

requireAuth({
  onUser: (_user, authInstance) => {
    auth = authInstance;
  }
});

logoutButton?.addEventListener("click", () => logout(auth, logoutButton));
