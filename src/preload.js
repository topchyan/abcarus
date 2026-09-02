// preload.js
const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");

let musicXmlBatchRequestId = 0;
const pendingMusicXmlBatchRequests = new Map();

ipcRenderer.on("export:musicxml-all:result", (_event, message) => {
  const requestId = message && message.requestId ? String(message.requestId) : "";
  const pending = pendingMusicXmlBatchRequests.get(requestId);
  if (!pending) return;
  pendingMusicXmlBatchRequests.delete(requestId);
  pending(message.result);
});

function requestMusicXmlBatchExport(payload) {
  musicXmlBatchRequestId += 1;
  const requestId = `${Date.now()}-${musicXmlBatchRequestId}`;
  return new Promise((resolve) => {
    pendingMusicXmlBatchRequests.set(requestId, resolve);
    ipcRenderer.send("export:musicxml-all", { requestId, payload: payload || {} });
  });
}

contextBridge.exposeInMainWorld("api", {
  // Dev-only startup profiling flag (used by renderer.js). Enable via:
  // `ABCARUS_DEV_STARTUP_PERF=1 npm start`
  startupPerfEnabled: process.env.ABCARUS_DEV_STARTUP_PERF === "1",
  readFileBase64: async (fileUrl) => {
    const p = fileURLToPath(fileUrl);
    const buf = await fs.promises.readFile(p);
    return buf.toString("base64");
  },
  showOpenFolderDialog: async () => ipcRenderer.invoke("dialog:open-folder"),
  showOpenDialog: async () => ipcRenderer.invoke("dialog:open"),
  showSaveDialog: async (suggestedName, suggestedDir) =>
    ipcRenderer.invoke("dialog:save", suggestedName, suggestedDir),
  showOpenSetListDialog: async () => ipcRenderer.invoke("dialog:set-list-open"),
  showSaveSetListDialog: async (suggestedName, suggestedDir) =>
    ipcRenderer.invoke("dialog:set-list-save", suggestedName, suggestedDir),
  confirmUnsavedChanges: async (contextLabel) =>
    ipcRenderer.invoke("dialog:confirm-unsaved", contextLabel),
  confirmOverwrite: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-overwrite", filePath),
  confirmAppendToFile: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-append", filePath || ""),
  confirmAppendToFileDetailed: async (filePath, tuneLabel) =>
    ipcRenderer.invoke("dialog:confirm-append", { filePath: filePath || "", tuneLabel: tuneLabel || "" }),
  confirmImportMusicXmlTarget: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-import-musicxml-target", filePath || ""),
  confirmRemoveSoundfont: async (label) =>
    ipcRenderer.invoke("dialog:confirm-remove-sf2", label),
  confirmDeleteTune: async (label) =>
    ipcRenderer.invoke("dialog:confirm-delete-tune", label),
  confirmReloadFromDisk: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-reload-from-disk", filePath || ""),
  confirmMissingOnDisk: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-missing-on-disk", filePath || ""),
  confirmSaveAsForPermissionDenied: async (filePath, message) =>
    ipcRenderer.invoke("dialog:confirm-save-as-for-permission-denied", {
      filePath: filePath || "",
      message: message == null ? "" : String(message),
    }),
  getMakamDnaUser: async () => ipcRenderer.invoke("makam-dna:user:get"),
  saveMakamDnaUser: async (text) => ipcRenderer.invoke("makam-dna:user:save", { text: text == null ? "" : String(text) }),
  clearMakamDnaUser: async () => ipcRenderer.invoke("makam-dna:user:clear"),
  showSaveError: async (message) =>
    ipcRenderer.invoke("dialog:show-save-error", message),
  showTransformError: async (message) =>
    ipcRenderer.invoke("dialog:show-transform-error", message),
  showOpenError: async (message) =>
    ipcRenderer.invoke("dialog:show-open-error", message),
  importMusicXml: async () => ipcRenderer.invoke("import:musicxml"),
  importMidi: async () => ipcRenderer.invoke("import:midi"),
  pickMusicXmlFiles: async () => ipcRenderer.invoke("import:musicxml:pick"),
  convertMusicXmlFile: async (filePath) => ipcRenderer.invoke("import:musicxml:convert-one", filePath),
  exportMusicXml: async (abcText, suggestedName) =>
    ipcRenderer.invoke("export:musicxml", abcText, suggestedName),
  exportMusicXmlAll: async (payload) => requestMusicXmlBatchExport(payload),
  exportMidi: async (midiBytes, suggestedName) =>
    ipcRenderer.invoke("export:midi", midiBytes, suggestedName),
  exportMp3: async (midiBytes, suggestedName) =>
    ipcRenderer.invoke("export:mp3", midiBytes, suggestedName),
  exportChordProPdf: async (inputPath, outputPath) =>
    ipcRenderer.invoke("chordpro:pdf", inputPath, outputPath),
  previewChordProPdf: async (payload) =>
    ipcRenderer.invoke("chordpro:preview", payload || {}),
  checkChordPro: async () => ipcRenderer.invoke("chordpro:check"),
  checkConversionTools: async () => ipcRenderer.invoke("tools:check"),
  readFile: async (filePath) => ipcRenderer.invoke("file:read", filePath),
  writeFile: async (filePath, data, options) => ipcRenderer.invoke("file:write", filePath, data, options || {}),
  publishSetListForMobile: async (document, filePath) =>
    ipcRenderer.invoke("set-list-sync:publish", document, filePath),
  listMobileSetLists: async () => ipcRenderer.invoke("set-list-sync:list"),
  renameFile: async (oldPath, newPath) => ipcRenderer.invoke("file:rename", oldPath, newPath),
  fileExists: async (filePath) => ipcRenderer.invoke("file:exists", filePath),
  mkdirp: async (dirPath) => ipcRenderer.invoke("file:mkdirp", dirPath),
  scanLibrary: async (rootDir, options) => ipcRenderer.invoke("library:scan", rootDir, options),
  scanLibraryDiscover: async (rootDir, options) => ipcRenderer.invoke("library:scan-discover", rootDir, options),
  cancelLibraryScan: async () => ipcRenderer.invoke("library:cancel-scan"),
  parseLibraryFile: async (filePath, options) => ipcRenderer.invoke("library:parse-file", filePath, options),
  shareLibraryWithMobile: async (rootDir) => ipcRenderer.invoke("mobile-library:share", rootDir),
  getTemplatesInfo: async () => ipcRenderer.invoke("templates:get-info"),
  pickTemplatesFolder: async () => ipcRenderer.invoke("templates:pick-folder"),
  openTemplatesFolder: async () => ipcRenderer.invoke("templates:open-folder"),
  openTemplatesFile: async (filePath) => ipcRenderer.invoke("templates:open-file", filePath),
  scanTemplates: async () => ipcRenderer.invoke("templates:scan"),
  addRecentTune: async (entry) => ipcRenderer.invoke("recent:add", entry),
  addRecentFile: async (entry) => ipcRenderer.invoke("recent:file", entry),
  addRecentFolder: async (entry) => ipcRenderer.invoke("recent:folder", entry),
  printPreview: async (svgMarkup, suggestedName) => ipcRenderer.invoke("print:preview", svgMarkup, suggestedName),
  printDialog: async (svgMarkup, suggestedName) => ipcRenderer.invoke("print:dialog", svgMarkup, suggestedName),
  exportPdf: async (svgMarkup, suggestedName) =>
    ipcRenderer.invoke("print:pdf", svgMarkup, suggestedName),
  listSoundfonts: async () => ipcRenderer.invoke("sf2:list"),
  pickSoundfont: async () => ipcRenderer.invoke("sf2:pick"),
  getSoundfontInfo: async (name) => ipcRenderer.invoke("sf2:info", name),
  getSoundfontStreamUrl: async (name) => ipcRenderer.invoke("sf2:stream-url", name),
  quitApplication: async () => ipcRenderer.invoke("app:quit"),
  getSettings: async () => ipcRenderer.invoke("settings:get"),
  getSettingsSchema: async () => ipcRenderer.invoke("settings:schema"),
  updateSettings: async (patch) => ipcRenderer.invoke("settings:update", patch),
  getFontDirs: async () => ipcRenderer.invoke("fonts:dirs"),
  listFonts: async () => ipcRenderer.invoke("fonts:list"),
  pickFont: async () => ipcRenderer.invoke("fonts:pick"),
  installFont: async (srcPath) => ipcRenderer.invoke("fonts:install", srcPath),
  removeFont: async (fileName) => ipcRenderer.invoke("fonts:remove", fileName),
  getSettingsPaths: async () => ipcRenderer.invoke("settings:paths"),
  readGlobalHeader: async () => ipcRenderer.invoke("settings:global-header-read"),
  writeGlobalHeader: async (text) => ipcRenderer.invoke("settings:global-header-write", text),
  exportSettings: async () => ipcRenderer.invoke("settings:export"),
  importSettings: async () => ipcRenderer.invoke("settings:import"),
  openSettingsFolder: async () => ipcRenderer.invoke("settings:open-folder"),
  getLastRecent: async () => ipcRenderer.invoke("recent:last"),
  getRecentCandidates: async () => ipcRenderer.invoke("recent:candidates"),
  openExternal: async (url) => ipcRenderer.invoke("shell:open-external", url),
  previewYouTubeSource: async (url) => ipcRenderer.invoke("source:preview-youtube", url),
  fetchYouTubeMetadata: async (url) => ipcRenderer.invoke("source:youtube-metadata", url),
  confirmYouTubeMetadataUpdate: async (payload) => ipcRenderer.invoke("source:confirm-youtube-metadata", payload || {}),
  getAboutInfo: async () => ipcRenderer.invoke("app:about"),
  cancelQuitRequest: async () => ipcRenderer.invoke("app:cancel-quit"),
  reportStartupStatus: async (text) => ipcRenderer.invoke("app:startup-status", text),
  getRecoveryDir: async () => ipcRenderer.invoke("app:recovery-dir"),
  pathBasename: (inputPath) => path.basename(String(inputPath || "")),
  pathDirname: (inputPath) => path.dirname(String(inputPath || "")),
  pathJoin: (...parts) => path.join(...parts.map((part) => String(part || ""))),
  onMenuAction: (handler) => {
    ipcRenderer.on("menu:action", (_evt, action) => handler(action));
  },
  onAppRequestQuit: (handler) => {
    ipcRenderer.on("app:request-quit", () => handler());
  },
  onLibraryProgress: (handler) => {
    ipcRenderer.on("library:progress", (_evt, payload) => handler(payload));
  },
  onImportMusicXmlProgress: (handler) => {
    ipcRenderer.on("import:musicxml:progress", (_evt, payload) => handler(payload));
  },
  onImportMidiProgress: (handler) => {
    ipcRenderer.on("import:midi:progress", (_evt, payload) => handler(payload));
  },
  onExportMusicXmlAllProgress: (handler) => {
    ipcRenderer.on("export:musicxml-all:progress", (_evt, payload) => handler(payload));
  },
  onSettingsChanged: (handler) => {
    ipcRenderer.on("settings:changed", (_evt, settings) => handler(settings));
  },
  onMobileSetListsChanged: (handler) => {
    ipcRenderer.on("set-list-sync:changed", (_evt, payload) => handler(payload));
  },
  getDevConfig: () => {
    const cfg = {};
    for (const [k, v] of Object.entries(process.env || {})) {
      if (!k.startsWith("ABCARUS_DEV_")) continue;
      cfg[k] = String(v || "");
    }
    return cfg;
  },
});
