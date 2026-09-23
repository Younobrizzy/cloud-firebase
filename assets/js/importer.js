
import { requireAuth } from "/assets/js/auth-guard.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const configInput = document.getElementById("configInput");
const configError = document.getElementById("configError");
const nextButton = document.getElementById("nextButton");
const backButton = document.getElementById("backButton");
const jsonInput = document.getElementById("jsonInput");
const fileName = document.getElementById("fileName");
const collectionPreview = document.getElementById("collectionPreview");
const collectionName = document.getElementById("collectionName");
const fileError = document.getElementById("fileError");
const importButton = document.getElementById("importButton");
const step1Panel = document.getElementById("step1Panel");
const step2Panel = document.getElementById("step2Panel");
const successPanel = document.getElementById("successPanel");
const stepPill1 = document.getElementById("stepPill1");
const stepPill2 = document.getElementById("stepPill2");
const successSummary = document.getElementById("successSummary");
const successCollection = document.getElementById("successCollection");
const createdCount = document.getElementById("createdCount");
const updatedCount = document.getElementById("updatedCount");
const doneButton = document.getElementById("doneButton");

let firebaseConfig = null;
let importerDb = null;
let selectedFile = null;
let parsedRecords = null;

const configKeys = [
  ["apiKey", "FIREBASE_API_KEY"],
  ["authDomain", "FIREBASE_AUTH_DOMAIN"],
  ["projectId", "FIREBASE_PROJECT_ID"],
  ["storageBucket", "FIREBASE_STORAGE_BUCKET"],
  ["messagingSenderId", "FIREBASE_MESSAGING_SENDER_ID"],
  ["appId", "FIREBASE_APP_ID"]
];

function showError(element, message) {
  element.textContent = message || "";
}

function extractFirebaseConfig(source) {
  const clean = source
    .replace(/\uFEFF/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/.*$/gm, "");

  const values = {};
  for (const [key] of configKeys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:["']?${escapedKey}["']?)\\s*:\\s*["']([^"'\\n\\r]*)["']`,
      "m"
    );
    const match = clean.match(pattern);
    if (match) values[key] = match[1].replace(/\\:/g, ":");
  }

  const missing = configKeys.filter(([key]) => !values[key]).map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing Firebase config fields: ${missing.join(", ")}`);
  }

  return values;
}

function setStep(step) {
  const isFirst = step === 1;
  step1Panel.hidden = !isFirst;
  step2Panel.hidden = isFirst;
  successPanel.hidden = true;
  stepPill1.classList.toggle("is-active", isFirst);
  stepPill2.classList.toggle("is-active", !isFirst);
}

function setImportButtonState() {
  importButton.disabled = !(selectedFile && parsedRecords);
}

function collectionNameFromFile(file) {
  const name = file.name.trim();
  if (!name.toLowerCase().endsWith(".json")) {
    throw new Error("Please choose a .json file.");
  }
  const base = name.slice(0, -5).trim();
  if (!base) throw new Error("The JSON filename must contain a collection name.");
  return base;
}

async function buildFirestore(config) {
  const appName = `importer-${Date.now()}`;
  const app = initializeApp(config, appName);
  return getFirestore(app);
}

function validateRecords(payload) {
  if (Array.isArray(payload)) {
    if (!payload.length) throw new Error("The JSON file contains no records.");
    return payload;
  }
  if (payload && typeof payload === "object") return [payload];
  throw new Error("The JSON root must be an object or an array of objects.");
}

async function upsertRecord(db, collectionId, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Every JSON record must be an object.");
  }

  const collectionRef = collection(db, collectionId);

  if (record.id !== undefined && record.id !== null && String(record.id).trim() !== "") {
    const idValue = String(record.id).trim();

    // First support datasets whose Firestore document ID is the same as `id`.
    const idRef = doc(collectionRef, idValue);
    const idSnap = await getDoc(idRef);
    if (idSnap.exists()) {
      await updateDoc(idRef, record);
      return "updated";
    }

    // Also support existing documents that use an auto-generated document ID
    // but store the same top-level `id` field as the source JSON.
    const existingQuery = query(collectionRef, where("id", "==", record.id));
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      await updateDoc(existingSnap.docs[0].ref, record);
      return "updated";
    }
  }

  await addDoc(collectionRef, record);
  return "created";
}

async function importRecords(db, collectionId, records) {
  let created = 0;
  let updated = 0;

  // Sequential writes keep matching deterministic and avoid requesting more
  // writes than needed for each incoming record.
  for (const record of records) {
    const result = await upsertRecord(db, collectionId, record);
    if (result === "created") created += 1;
    else updated += 1;
  }

  return { created, updated };
}

nextButton.addEventListener("click", async () => {
  showError(configError, "");
  const source = configInput.value.trim();

  if (!source) {
    showError(configError, "Paste your Firebase Web config first.");
    configInput.focus();
    return;
  }

  try {
    firebaseConfig = extractFirebaseConfig(source);
    importerDb = await buildFirestore(firebaseConfig);
    setStep(2);
  } catch (error) {
    console.error(error);
    showError(configError, error?.message || "The Firebase config could not be initialized.");
    importerDb = null;
  }
});

backButton.addEventListener("click", () => {
  showError(fileError, "");
  setStep(1);
});

jsonInput.addEventListener("change", async () => {
  selectedFile = jsonInput.files?.[0] || null;
  parsedRecords = null;
  showError(fileError, "");
  collectionPreview.hidden = true;
  setImportButtonState();

  if (!selectedFile) {
    fileName.textContent = "No file selected";
    return;
  }

  fileName.textContent = selectedFile.name;

  try {
    const derivedCollection = collectionNameFromFile(selectedFile);
    const text = await selectedFile.text();
    const payload = JSON.parse(text);
    parsedRecords = validateRecords(payload);
    collectionName.textContent = derivedCollection;
    collectionPreview.hidden = false;
    setImportButtonState();
  } catch (error) {
    selectedFile = null;
    parsedRecords = null;
    collectionPreview.hidden = true;
    setImportButtonState();
    showError(fileError, error?.message || "The JSON file could not be read.");
  }
});

importButton.addEventListener("click", async () => {
  showError(fileError, "");
  if (!selectedFile || !parsedRecords || !importerDb) return;

  importButton.disabled = true;
  const originalText = importButton.textContent;
  importButton.textContent = "Importing…";

  try {
    const targetCollection = collectionNameFromFile(selectedFile);
    const result = await importRecords(importerDb, targetCollection, parsedRecords);

    successCollection.textContent = targetCollection;
    createdCount.textContent = String(result.created);
    updatedCount.textContent = String(result.updated);

    const total = result.created + result.updated;
    successSummary.textContent =
      `${total} ${total === 1 ? "record" : "records"} processed successfully.`;
    step1Panel.hidden = true;
    step2Panel.hidden = true;
    stepPill1.classList.remove("is-active");
    stepPill2.classList.remove("is-active");
    successPanel.hidden = false;
  } catch (error) {
    console.error(error);
    showError(
      fileError,
      error?.message || "Import failed. Check your Firestore security rules and Firebase configuration."
    );
  } finally {
    importButton.disabled = !(selectedFile && parsedRecords);
    importButton.textContent = originalText;
  }
});

doneButton.addEventListener("click", () => {
  window.location.assign("/get-started/");
});

requireAuth({
  onUser: () => document.body.classList.add("ready")
});
