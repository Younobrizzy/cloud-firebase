import { requireAuth, getFirebaseApp } from "/assets/js/auth-guard.js";
    import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
    import {
      getFirestore,
      collection,
      getDocs,
      doc,
      writeBatch
    } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

    const configField = document.getElementById("firebaseConfig");
    const configStatus = document.getElementById("configStatus");
    const nextButton = document.getElementById("nextButton");
    const previousButton = document.getElementById("previousButton");
    const jsonFile = document.getElementById("jsonFile");
    const uploadArea = document.getElementById("uploadArea");
    const uploadTitle = document.getElementById("uploadTitle");
    const uploadText = document.getElementById("uploadText");
    const fileMeta = document.getElementById("fileMeta");
    const fileName = document.getElementById("fileName");
    const collectionName = document.getElementById("collectionName");
    const documentCount = document.getElementById("documentCount");
    const fileStatus = document.getElementById("fileStatus");
    const importButton = document.getElementById("importButton");
    const step1 = document.getElementById("step1");
    const step2 = document.getElementById("step2");
    const successState = document.getElementById("successState");
    const anotherButton = document.getElementById("anotherButton");
    const successSummary = document.getElementById("successSummary");
    const successCollection = document.getElementById("successCollection");
    const createdCount = document.getElementById("createdCount");
    const updatedCount = document.getElementById("updatedCount");
    const stepDots = [...document.querySelectorAll("[data-step-dot]")];
    const stepCount = document.getElementById("stepCount");

    let targetConfig = null;
    let targetDb = null;
    let selectedFile = null;
    let parsedDocuments = null;
    let derivedCollection = "";

    function setStatus(element, message, isError = false) {
      element.textContent = message;
      element.classList.toggle("is-error", isError);
    }

    function extractConfigValue(source, key) {
      const escapedKey = key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `(?:["']?${escapedKey}["']?)\\s*:\\s*["']([^"'\\n\\r]*)["']`,
        "m"
      );
      const match = source.match(pattern);
      return match ? match[1].replace(/\\:/g, ":") : "";
    }

    function parseFirebaseConfig(source) {
      const clean = source
        .replace(/\uFEFF/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\n)\s*\/\/.*$/gm, "");

      const config = {
        apiKey: extractConfigValue(clean, "apiKey"),
        authDomain: extractConfigValue(clean, "authDomain"),
        projectId: extractConfigValue(clean, "projectId"),
        storageBucket: extractConfigValue(clean, "storageBucket"),
        messagingSenderId: extractConfigValue(clean, "messagingSenderId"),
        appId: extractConfigValue(clean, "appId")
      };

      const missing = Object.entries(config)
        .filter(([, value]) => !value)
        .map(([key]) => key);

      if (missing.length) {
        throw new Error(`Missing Firebase config: ${missing.join(", ")}`);
      }

      return config;
    }

    function getCollectionName(filename) {
      const name = filename.replace(/\.[^.]+$/, "").trim();
      if (!name || name.includes("/")) {
        throw new Error("The JSON filename cannot be used as a collection name.");
      }
      return name;
    }

    function showStep(step) {
      const isFirst = step === 1;
      step1.hidden = !isFirst;
      step2.hidden = isFirst;
      successState.hidden = true;
      if (stepCount) stepCount.textContent = `Step ${step} of 2`;
      stepDots.forEach((dot) => {
        const current = Number(dot.dataset.stepDot);
        dot.classList.toggle("is-active", current === step);
        dot.classList.toggle("is-complete", current < step);
      });
    }

    function showSuccess() {
      step1.hidden = true;
      step2.hidden = true;
      successState.hidden = false;
      if (stepCount) stepCount.textContent = "Complete";
      stepDots.forEach((dot) => dot.classList.add("is-complete"));
      stepDots.forEach((dot) => dot.classList.remove("is-active"));
    }

    function resetStep2() {
      selectedFile = null;
      parsedDocuments = null;
      derivedCollection = "";
      jsonFile.value = "";
      fileMeta.hidden = true;
      uploadArea.hidden = false;
      uploadTitle.textContent = "Choose a JSON file";
      uploadText.textContent = "Tap here to select a .json file";
      setStatus(fileStatus, "");
      importButton.disabled = true;
    }

    async function connectFirestore() {
      const existingApp = await getFirebaseApp();
      const existingProjectId = existingApp?.options?.projectId || "";

      if (existingProjectId && existingProjectId === targetConfig.projectId) {
        targetDb = getFirestore(existingApp);
      } else {
        const secondaryName = `importer-${Date.now()}`;
        const secondaryApp = initializeApp(targetConfig, secondaryName);
        targetDb = getFirestore(secondaryApp);
      }
    }

    configField.addEventListener("input", () => {
      try {
        targetConfig = parseFirebaseConfig(configField.value);
        nextButton.disabled = false;
        setStatus(configStatus, "Firebase config is valid.");
      } catch (error) {
        targetConfig = null;
        nextButton.disabled = true;
        setStatus(configStatus, configField.value.trim() ? error.message : "", Boolean(configField.value.trim()));
      }
    });

    nextButton.addEventListener("click", async () => {
      if (!targetConfig) return;
      nextButton.disabled = true;
      nextButton.textContent = "Connecting...";
      setStatus(configStatus, "Connecting to Firestore...");

      try {
        await connectFirestore();
        resetStep2();
        showStep(2);
      } catch (error) {
        console.error(error);
        setStatus(configStatus, error?.message || "Unable to connect to Firestore.", true);
      } finally {
        nextButton.disabled = !targetConfig;
        nextButton.textContent = "Next";
      }
    });

    previousButton.addEventListener("click", () => showStep(1));

    uploadArea.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadArea.classList.add("is-dragging");
    });

    uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("is-dragging"));

    uploadArea.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadArea.classList.remove("is-dragging");
      const file = event.dataTransfer?.files?.[0];
      if (file) loadJsonFile(file);
    });

    jsonFile.addEventListener("change", () => {
      const file = jsonFile.files?.[0];
      if (file) loadJsonFile(file);
    });

    async function loadJsonFile(file) {
      try {
        if (!file.name.toLowerCase().endsWith(".json")) {
          throw new Error("Please choose a JSON file.");
        }

        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          throw new Error("The JSON root must be an array of documents.");
        }

        if (!parsed.length) {
          throw new Error("The JSON file does not contain any documents.");
        }

        if (parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
          throw new Error("Each JSON item must be an object.");
        }

        derivedCollection = getCollectionName(file.name);
        selectedFile = file;
        parsedDocuments = parsed;

        fileName.textContent = file.name;
        collectionName.textContent = derivedCollection;
        documentCount.textContent = String(parsed.length);
        fileMeta.hidden = false;
        uploadArea.hidden = true;
        uploadTitle.textContent = "JSON ready";
        uploadText.textContent = "Tap to choose a different file";
        importButton.disabled = false;
        setStatus(fileStatus, "JSON is ready to import.");
      } catch (error) {
        selectedFile = null;
        parsedDocuments = null;
        derivedCollection = "";
        fileMeta.hidden = true;
        importButton.disabled = true;
        setStatus(fileStatus, error?.message || "Unable to read the JSON file.", true);
      }
    }

    importButton.addEventListener("click", async () => {
      if (!targetDb || !parsedDocuments || !derivedCollection) return;

      importButton.disabled = true;
      importButton.textContent = "Importing...";
      setStatus(fileStatus, "Reading existing documents and importing...");

      try {
        const collectionRef = collection(targetDb, derivedCollection);
        const existingSnapshot = await getDocs(collectionRef);
        const existingById = new Map();

        existingSnapshot.forEach((snapshot) => {
          const data = snapshot.data() || {};
          if (typeof data.id === "string" && data.id.trim()) {
            existingById.set(data.id, snapshot.ref);
          }
          if (!existingById.has(snapshot.id)) {
            existingById.set(snapshot.id, snapshot.ref);
          }
        });

        let created = 0;
        let updated = 0;
        let batch = writeBatch(targetDb);
        let batchCount = 0;
        const batches = [];

        for (const item of parsedDocuments) {
          const itemId = typeof item.id === "string" && item.id.trim() ? item.id.trim() : "";
          const existingRef = itemId ? existingById.get(itemId) : null;
          const targetRef = existingRef || (itemId ? doc(collectionRef, itemId) : doc(collectionRef));

          batch.set(targetRef, item, { merge: Boolean(existingRef) });
          batchCount += 1;

          if (existingRef) updated += 1;
          else created += 1;

          if (batchCount === 500) {
            batches.push(batch.commit());
            batch = writeBatch(targetDb);
            batchCount = 0;
          }
        }

        if (batchCount) batches.push(batch.commit());
        await Promise.all(batches);

        successCollection.textContent = derivedCollection;
        createdCount.textContent = String(created);
        updatedCount.textContent = String(updated);
        successSummary.textContent = `${parsedDocuments.length} document${parsedDocuments.length === 1 ? "" : "s"} imported from ${selectedFile.name}.`;
        showSuccess();
      } catch (error) {
        console.error(error);
        setStatus(fileStatus, error?.message || "Import failed. Check your Firebase configuration and Firestore rules.", true);
      } finally {
        importButton.disabled = !parsedDocuments;
        importButton.textContent = "Import";
      }
    });

    anotherButton.addEventListener("click", () => {
      resetStep2();
      showStep(2);
    });

    requireAuth({
      onUser: () => document.body.classList.add("ready")
    });
