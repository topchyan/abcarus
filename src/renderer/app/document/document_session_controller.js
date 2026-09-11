const SAVE_INTENT = Object.freeze({
  NONE: "none",
  REPLACE_TUNE: "replace_tune",
  APPEND_TO_FILE: "append_to_file",
  FULL_FILE: "full_file",
});

function createBlankDocument(content = "") {
  return {
    path: null,
    dirty: false,
    content: String(content || ""),
  };
}

function serializeDocument(doc) {
  return doc ? String(doc.content || "") : "";
}

function deserializeToDocument(data) {
  return {
    path: null,
    dirty: false,
    content: String(data || ""),
  };
}

function createDocumentSessionController({
  api = null,
  state = {},
  actions = {},
} = {}) {
  const {
    getCurrentDoc: externalGetCurrentDoc = null,
    setCurrentDoc: externalSetCurrentDoc = null,
    getActiveFilePath = () => "",
    getActiveTuneMeta = () => null,
    getActiveTuneUid = () => "",
    getCurrentNavFilePath = () => "",
    getHeaderDirty = () => false,
    getLibraryFiles = () => [],
    hasUnsavedChangesInActiveEditContext = () => false,
    isChordProEnabled = () => false,
    isChordProFilePath = () => false,
    isChordProText = () => false,
    isNewTuneDraft = () => false,
    isPayloadMode = () => false,
    isRawMode = () => false,
    getRawModeFilePath = () => "",
  } = state;

  const {
    discardFileChangesForActiveFile = async () => false,
    discardChordProChangesForActiveFile = async () => false,
    discardRawChangesForActiveFile = async () => false,
    flushLibraryPrefsSave = async () => {},
    loadLibraryFileIntoEditor = null,
    loadSingleLibraryFile = async () => null,
    markHeaderClean = () => {},
    openChordProFile = async () => {},
    performRawSaveFlow = async () => false,
    performSaveAsFlow = async () => false,
    performSaveFlow = async () => false,
    readFile = async () => ({ ok: false }),
    selectTune = async () => {},
    setDirtyIndicator = () => {},
    setActiveTuneText = () => {},
    setChordProMode = () => {},
    showToast = () => {},
    showOpenDialog: showOpenDialogAction = null,
    clearCurrentDocument = () => {},
    addRecentFolder = () => {},
    updateHeaderStateUI = () => {},
    pathsEqual = (a, b) => String(a || "") === String(b || ""),
    safeDirname = () => "",
  } = actions;

  let abandonFlowInProgress = false;
  let currentDocument = null;

  function getCurrentDoc() {
    return typeof externalGetCurrentDoc === "function"
      ? externalGetCurrentDoc()
      : currentDocument;
  }

  function setCurrentDoc(doc) {
    const nextDoc = doc || null;
    if (typeof externalSetCurrentDoc === "function") {
      externalSetCurrentDoc(nextDoc);
      return getCurrentDoc();
    }
    currentDocument = nextDoc;
    return currentDocument;
  }

  function getCurrentDocument() {
    return getCurrentDoc();
  }

  function hasCurrentDocument() {
    return Boolean(getCurrentDoc());
  }

  function getCurrentDocumentPath() {
    const doc = getCurrentDoc();
    return doc && doc.path ? String(doc.path) : "";
  }

  function isCurrentDocumentDirty() {
    const doc = getCurrentDoc();
    return Boolean(doc && doc.dirty);
  }

  function replaceCurrentDocument(doc) {
    setCurrentDoc(doc || null);
    return getCurrentDoc();
  }

  function ensureCurrentDocument(content = "") {
    let doc = getCurrentDoc();
    if (!doc) {
      doc = createBlankDocument(content);
      setCurrentDoc(doc);
    }
    return doc;
  }

  function patchCurrentDocument(patch = {}, options = {}) {
    const create = options.create !== false;
    const doc = create ? ensureCurrentDocument(options.content || "") : getCurrentDoc();
    if (!doc) return null;
    if (Object.prototype.hasOwnProperty.call(patch, "path")) doc.path = patch.path || null;
    if (Object.prototype.hasOwnProperty.call(patch, "content")) doc.content = String(patch.content || "");
    if (Object.prototype.hasOwnProperty.call(patch, "dirty")) doc.dirty = Boolean(patch.dirty);
    return doc;
  }

  function setCurrentDocumentContent(content, options = {}) {
    return patchCurrentDocument({ content }, { create: Boolean(options.create) });
  }

  function setCurrentDocumentDirty(dirty, options = {}) {
    return patchCurrentDocument({ dirty: Boolean(dirty) }, { create: Boolean(options.create) });
  }

  function markCurrentDocumentClean() {
    return setCurrentDocumentDirty(false, { create: false });
  }

  function hasOpenEditContext() {
    if (getCurrentDoc()) return true;
    if (getActiveFilePath()) return true;
    if (getCurrentDocumentPath()) return true;
    if (getRawModeFilePath()) return true;
    return Boolean(getActiveTuneMeta());
  }

  async function showOpenDialog() {
    if (typeof showOpenDialogAction === "function") return showOpenDialogAction();
    if (!api || typeof api.showOpenDialog !== "function") return null;
    return api.showOpenDialog();
  }

  function resolveSaveIntent() {
    const currentDoc = getCurrentDoc();
    const activeFilePath = String(getActiveFilePath() || "");
    const activeTuneMeta = getActiveTuneMeta();
    const activeTuneUid = String(getActiveTuneUid() || "");
    const currentNavFilePath = String(getCurrentNavFilePath() || "");

    if (isChordProEnabled()) {
      const path = String(activeFilePath || (currentDoc && currentDoc.path) || currentNavFilePath || "");
      if (path) return { intent: SAVE_INTENT.FULL_FILE, targetPath: path, targetTuneUid: "", source: "chordpro" };
    }
    if (isRawMode()) {
      const path = String(getRawModeFilePath() || activeFilePath || (currentDoc && currentDoc.path) || currentNavFilePath || "");
      if (path) return { intent: SAVE_INTENT.FULL_FILE, targetPath: path, targetTuneUid: "", source: "raw" };
    }
    if (isNewTuneDraft()) {
      const path = String(activeFilePath || currentNavFilePath || "");
      if (path) return { intent: SAVE_INTENT.APPEND_TO_FILE, targetPath: path, targetTuneUid: "", source: "draft" };
    }
    if (activeTuneMeta && activeTuneMeta.path) {
      const path = String(activeTuneMeta.path || "");
      if (path) {
        return {
          intent: SAVE_INTENT.REPLACE_TUNE,
          targetPath: path,
          targetTuneUid: activeTuneUid,
          source: "active_tune",
        };
      }
    }
    if (currentDoc && currentDoc.path) {
      return { intent: SAVE_INTENT.FULL_FILE, targetPath: String(currentDoc.path), targetTuneUid: "", source: "doc_path" };
    }
    return { intent: SAVE_INTENT.NONE, targetPath: "", targetTuneUid: "", source: "" };
  }

  async function confirmUnsavedChanges(contextLabel) {
    if (!api || typeof api.confirmUnsavedChanges !== "function") return "cancel";
    return api.confirmUnsavedChanges(contextLabel);
  }

  async function confirmAbandonIfDirty(contextLabel) {
    const currentDoc = getCurrentDoc();
    const tuneDirty = Boolean(currentDoc && currentDoc.dirty);
    const hdrDirty = Boolean(getHeaderDirty());
    const fileDirty = Boolean(hasUnsavedChangesInActiveEditContext());
    if (!tuneDirty && !hdrDirty && !fileDirty) return true;

    const choice = await confirmUnsavedChanges(contextLabel);
    if (choice === "cancel") return false;
    if (choice === "dont_save") {
      const isSpecialFileMode = isRawMode() || isChordProEnabled();
      if (isRawMode() && (tuneDirty || hdrDirty || fileDirty)) {
        const discarded = await discardRawChangesForActiveFile();
        if (!discarded) return false;
        markHeaderClean();
        updateHeaderStateUI();
      } else if (isChordProEnabled() && (tuneDirty || fileDirty)) {
        const discarded = await discardChordProChangesForActiveFile();
        if (!discarded) return false;
        markHeaderClean();
        updateHeaderStateUI();
      } else if (!isSpecialFileMode && (tuneDirty || hdrDirty)) {
        const discarded = await discardFileChangesForActiveFile();
        if (!discarded) return false;
      } else {
        markHeaderClean();
        updateHeaderStateUI();
      }
      return true;
    }

    const ok = isRawMode() ? await performRawSaveFlow() : await performSaveFlow();
    return Boolean(ok);
  }

  async function ensureSafeToAbandonCurrentDoc(actionLabel) {
    return confirmAbandonIfDirty(actionLabel);
  }

  async function fileSave() {
    if (!getCurrentDoc()) return;
    if (isPayloadMode()) {
      showToast("Payload Mode is diagnostics-only (no saves).", 2600);
      return;
    }
    if (isRawMode()) {
      await performRawSaveFlow();
      return;
    }
    await performSaveFlow();
  }

  async function fileSaveAs() {
    if (!getCurrentDoc()) return;
    if (isPayloadMode()) {
      showToast("Exit Payload Mode to Save As.", 2400);
      return;
    }
    await performSaveAsFlow();
  }

  async function requestCloseDocument() {
    if (abandonFlowInProgress) return;
    if (!hasOpenEditContext()) {
      showToast("No file is open.", 1800);
      return;
    }
    abandonFlowInProgress = true;
    try {
      const ok = await confirmAbandonIfDirty("closing this file");
      if (!ok) return;
      clearCurrentDocument();
      setDirtyIndicator(false);
      showToast("Closed file.", 1400);
    } finally {
      abandonFlowInProgress = false;
    }
  }

  async function requestQuitApplication() {
    if (abandonFlowInProgress) return;
    abandonFlowInProgress = true;
    let quitRequested = false;
    try {
      if (api && typeof api.cancelQuitRequest === "function") {
        try { await api.cancelQuitRequest(); } catch {}
      }
      const ok = await confirmAbandonIfDirty("quitting");
      if (!ok) return;
      await flushLibraryPrefsSave();
      if (api && typeof api.quitApplication === "function") {
        quitRequested = true;
        await api.quitApplication();
      }
    } finally {
      if (!quitRequested && api && typeof api.cancelQuitRequest === "function") {
        try { await api.cancelQuitRequest(); } catch {}
      }
      abandonFlowInProgress = false;
    }
  }

  async function fileClose() {
    await requestCloseDocument();
  }

  async function fileOpen() {
    const ok = await ensureSafeToAbandonCurrentDoc("opening a file");
    if (!ok) return;

    const filePath = await showOpenDialog();
    if (!filePath) return;
    const folder = safeDirname(filePath);
    if (folder) addRecentFolder({ path: folder, label: folder });

    const readRes = await readFile(filePath);
    if (readRes && readRes.ok && (isChordProText(readRes.data) || isChordProFilePath(filePath))) {
      await openChordProFile(filePath, readRes.data);
      return;
    }

    setChordProMode(false);
    if (typeof loadLibraryFileIntoEditor === "function") {
      const loaded = await loadLibraryFileIntoEditor(filePath, { skipConfirm: true });
      if (loaded && loaded.ok) return;
      setActiveTuneText("", null);
      return;
    }
    const fileEntry = await loadSingleLibraryFile(filePath, {
      content: readRes && readRes.ok ? readRes.data : null,
    });
    if (fileEntry && Array.isArray(fileEntry.tunes) && fileEntry.tunes.length) {
      await selectTune(fileEntry.tunes[0].id);
    } else {
      setActiveTuneText("", null);
    }
  }

  return {
    confirmAbandonIfDirty,
    confirmUnsavedChanges,
    deserializeToDocument,
    ensureSafeToAbandonCurrentDoc,
    ensureCurrentDocument,
    fileClose,
    fileOpen,
    fileSave,
    fileSaveAs,
    getCurrentDocument,
    getCurrentDocumentPath,
    hasCurrentDocument,
    isCurrentDocumentDirty,
    markCurrentDocumentClean,
    patchCurrentDocument,
    replaceCurrentDocument,
    resolveSaveIntent,
    requestCloseDocument,
    requestQuitApplication,
    serializeDocument,
    setCurrentDocumentContent,
    setCurrentDocumentDirty,
  };
}

export {
  SAVE_INTENT,
  createBlankDocument,
  createDocumentSessionController,
  deserializeToDocument,
  serializeDocument,
};
