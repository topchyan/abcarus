function stripFileExtension(name) {
  const value = String(name || "");
  return value.replace(/\.[^.]+$/, "");
}

function buildTuneMetaLabel(metadata) {
  if (!metadata) return "Untitled";
  const xPart = metadata.xNumber ? `X:${metadata.xNumber}` : "";
  const title = metadata.title || "";
  const label = `${xPart} ${title}`.trim();
  return label || "Untitled";
}

function createStatusController({
  documentRef = typeof document !== "undefined" ? document : null,
  statusElement = null,
  bufferStatusElement = null,
  fileNameMetaElement = null,
  editorPaneElement = null,
  safeBasename = (value) => String(value || "").split(/[\\/]/).pop() || "",
  safeDirname = (value) => {
    const raw = String(value || "");
    const idx = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
    return idx > 0 ? raw.slice(0, idx) : "";
  },
  untitledLabel = "Untitled",
  formatPathTail = (value) => String(value || ""),
  getCurrentDoc = () => null,
  getRawMode = () => false,
  getRawModeFilePath = () => "",
  getActiveFilePath = () => "",
  getActiveTuneMeta = () => null,
  getIsNewTuneDraft = () => false,
  getHeaderDirty = () => false,
  getLibraryRoot = () => "",
  getLibraryVisible = () => true,
  hasDiskConflictPath = () => false,
} = {}) {
  let tuneBadgeText = "";
  let bufferStatusText = "";
  let appStatusText = "Ready";
  let startupUiLoading = true;
  let startupSettingsApplied = false;
  let startupAutoLoadStarted = false;
  let startupRecentOpenStarted = false;

  function updateWindowTitle() {
    if (!documentRef) return;
    const currentDoc = getCurrentDoc();
    const tuneDirty = Boolean(currentDoc && currentDoc.dirty) || Boolean(getIsNewTuneDraft());
    const dirtyTag = (tuneDirty || Boolean(getHeaderDirty())) ? "*" : "";
    const filePath = (currentDoc && currentDoc.path) ? String(currentDoc.path) : "";
    const fileNameWithExt = filePath ? safeBasename(filePath) : untitledLabel;
    const libraryRoot = getLibraryRoot();
    const dirPath = filePath ? safeDirname(filePath) : (libraryRoot ? String(libraryRoot) : "");
    const dirShort = formatPathTail(dirPath, 3);
    const display = dirShort ? `${dirShort}/${fileNameWithExt}` : fileNameWithExt;
    documentRef.title = `ABCarus — ${display}${dirtyTag}`;
  }

  function setFileNameMeta(name) {
    if (fileNameMetaElement) fileNameMetaElement.textContent = name || "Untitled";
    updateWindowTitle();
  }

  function markStartupUiReady() {
    if (!startupUiLoading) return;
    startupUiLoading = false;
    renderUnifiedStatus();
  }

  function markStartupSettingsApplied() {
    if (startupSettingsApplied) return;
    startupSettingsApplied = true;
    if (!startupRecentOpenStarted && !startupAutoLoadStarted) {
      markStartupUiReady();
    } else {
      renderUnifiedStatus();
    }
  }

  function markStartupAutoLoadStarted() {
    startupAutoLoadStarted = true;
    renderUnifiedStatus();
  }

  function markStartupRecentOpenStarted() {
    startupRecentOpenStarted = true;
    renderUnifiedStatus();
  }

  function computeFileState() {
    const currentDoc = getCurrentDoc();
    const activeTuneMeta = getActiveTuneMeta();
    const filePath = getRawMode()
      ? (getRawModeFilePath() || (currentDoc && currentDoc.path) || getActiveFilePath() || "")
      : ((activeTuneMeta && activeTuneMeta.path) || (currentDoc && currentDoc.path) || getActiveFilePath() || "");
    if (!filePath) return { kind: "ready", label: "Ready", filePath: "" };

    const tuneDirty = Boolean(currentDoc && currentDoc.dirty) || Boolean(getIsNewTuneDraft());
    const hdrDirty = Boolean(getHeaderDirty());
    const conflict = hasDiskConflictPath(filePath);

    if (editorPaneElement) {
      editorPaneElement.classList.toggle("unsaved", Boolean(tuneDirty));
      editorPaneElement.classList.toggle("conflict", Boolean(conflict));
    }

    if (conflict) return { kind: "conflict", label: "Changed on disk", filePath };
    if (tuneDirty || hdrDirty) return { kind: "dirty", label: "Unsaved changes", filePath };
    return { kind: "saved", label: "Saved", filePath };
  }

  function renderUnifiedStatus() {
    if (!statusElement) return;

    const raw = String(appStatusText || "");
    const normalized = raw.trim();
    const display = normalized === "OK" ? "Ready" : raw;
    const displayNorm = String(display || "").trim();

    const fileState = computeFileState();

    const isNeutral = !displayNorm || /^ready\b/i.test(displayNorm);
    const label = startupUiLoading && isNeutral
      ? "Loading..."
      : (isNeutral ? fileState.label : display);
    const kind = startupUiLoading && isNeutral
      ? "loading"
      : (isNeutral ? fileState.kind : (fileState.kind === "conflict" ? "conflict" : (fileState.kind === "dirty" ? "dirty" : "ready")));

    statusElement.textContent = label || "Ready";

    statusElement.classList.toggle("status-ready", kind === "ready");
    statusElement.classList.toggle("status-saved", kind === "saved");
    statusElement.classList.toggle("status-dirty", kind === "dirty");
    statusElement.classList.toggle("status-conflict", kind === "conflict");

    const loading = kind === "loading" || String(label || "").toLowerCase().startsWith("loading the sound font");
    statusElement.classList.toggle("status-loading", loading);
  }

  function renderBufferStatus() {
    if (!bufferStatusElement) return;
    if (bufferStatusText) {
      bufferStatusElement.textContent = bufferStatusText;
      return;
    }
    if (!getLibraryVisible() && tuneBadgeText) {
      bufferStatusElement.textContent = tuneBadgeText;
      return;
    }
    bufferStatusElement.textContent = "";
  }

  function setTuneMetaText(text) {
    tuneBadgeText = String(text || "");
    renderBufferStatus();
  }

  function setStatus(text) {
    appStatusText = String(text || "");
    renderUnifiedStatus();
  }

  function setBufferStatus(text) {
    bufferStatusText = String(text || "");
    renderBufferStatus();
  }

  function getBufferStatusText() {
    return bufferStatusText;
  }

  return {
    buildTuneMetaLabel,
    computeFileState,
    getBufferStatusText,
    markStartupAutoLoadStarted,
    markStartupRecentOpenStarted,
    markStartupSettingsApplied,
    markStartupUiReady,
    renderBufferStatus,
    renderUnifiedStatus,
    setBufferStatus,
    setFileNameMeta,
    setStatus,
    setTuneMetaText,
    stripFileExtension,
    updateWindowTitle,
  };
}

export {
  buildTuneMetaLabel,
  createStatusController,
  stripFileExtension,
};
