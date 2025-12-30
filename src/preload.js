// preload.js
const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");

contextBridge.exposeInMainWorld("api", {
  readFileBase64: async (fileUrl) => {
    const p = fileURLToPath(fileUrl);
    const buf = await fs.promises.readFile(p);
    return buf.toString("base64");
  },
  showOpenFolderDialog: async () => ipcRenderer.invoke("dialog:open-folder"),
  showOpenDialog: async () => ipcRenderer.invoke("dialog:open"),
  showSaveDialog: async (suggestedName, suggestedDir) =>
    ipcRenderer.invoke("dialog:save", suggestedName, suggestedDir),
  confirmUnsavedChanges: async (contextLabel) =>
    ipcRenderer.invoke("dialog:confirm-unsaved", contextLabel),
  confirmOverwrite: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-overwrite", filePath),
  confirmAppendToFile: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-append", filePath),
  confirmRemoveSoundfont: async (label) =>
    ipcRenderer.invoke("dialog:confirm-remove-sf2", label),
  confirmDeleteTune: async (label) =>
    ipcRenderer.invoke("dialog:confirm-delete-tune", label),
  showSaveError: async (message) =>
    ipcRenderer.invoke("dialog:show-save-error", message),
  showOpenError: async (message) =>
    ipcRenderer.invoke("dialog:show-open-error", message),
  importMusicXml: async () => ipcRenderer.invoke("import:musicxml"),
  exportMusicXml: async (abcText, suggestedName) =>
    ipcRenderer.invoke("export:musicxml", abcText, suggestedName),
  runAbc2abc: async (abcText, options) =>
    ipcRenderer.invoke("abc2abc:run", abcText, options),
  checkConversionTools: async () => ipcRenderer.invoke("tools:check"),
  readFile: async (filePath) => ipcRenderer.invoke("file:read", filePath),
  writeFile: async (filePath, data) => ipcRenderer.invoke("file:write", filePath, data),
  renameFile: async (oldPath, newPath) => ipcRenderer.invoke("file:rename", oldPath, newPath),
  fileExists: async (filePath) => ipcRenderer.invoke("file:exists", filePath),
  scanLibrary: async (rootDir) => ipcRenderer.invoke("library:scan", rootDir),
  parseLibraryFile: async (filePath) => ipcRenderer.invoke("library:parse-file", filePath),
  addRecentTune: async (entry) => ipcRenderer.invoke("recent:add", entry),
  addRecentFile: async (entry) => ipcRenderer.invoke("recent:file", entry),
  addRecentFolder: async (entry) => ipcRenderer.invoke("recent:folder", entry),
  printPreview: async (svgMarkup) => ipcRenderer.invoke("print:preview", svgMarkup),
  printDialog: async (svgMarkup) => ipcRenderer.invoke("print:dialog", svgMarkup),
  exportPdf: async (svgMarkup, suggestedName) =>
    ipcRenderer.invoke("print:pdf", svgMarkup, suggestedName),
  listSoundfonts: async () => ipcRenderer.invoke("sf2:list"),
  pickSoundfont: async () => ipcRenderer.invoke("sf2:pick"),
  getSoundfontInfo: async (name) => ipcRenderer.invoke("sf2:info", name),
  quitApplication: async () => ipcRenderer.invoke("app:quit"),
  getSettings: async () => ipcRenderer.invoke("settings:get"),
  updateSettings: async (patch) => ipcRenderer.invoke("settings:update", patch),
  getSettingsPaths: async () => ipcRenderer.invoke("settings:paths"),
  getLastRecent: async () => ipcRenderer.invoke("recent:last"),
  openExternal: async (url) => ipcRenderer.invoke("shell:open-external", url),
  getAboutInfo: async () => ipcRenderer.invoke("app:about"),
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
  onSettingsChanged: (handler) => {
    ipcRenderer.on("settings:changed", (_evt, settings) => handler(settings));
  },
});
