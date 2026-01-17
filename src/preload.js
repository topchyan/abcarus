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
  confirmImportMusicXmlTarget: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-import-musicxml-target", filePath || ""),
  confirmRemoveSoundfont: async (label) =>
    ipcRenderer.invoke("dialog:confirm-remove-sf2", label),
  confirmDeleteTune: async (label) =>
    ipcRenderer.invoke("dialog:confirm-delete-tune", label),
  confirmSaveConflict: async (filePath) =>
    ipcRenderer.invoke("dialog:confirm-save-conflict", filePath || ""),
  openWorkingCopy: async (filePath) => ipcRenderer.invoke("workingcopy:open", filePath),
  getWorkingCopySnapshot: async () => ipcRenderer.invoke("workingcopy:get"),
  getWorkingCopyMeta: async () => ipcRenderer.invoke("workingcopy:get-meta"),
  reloadWorkingCopyFromDisk: async () => ipcRenderer.invoke("workingcopy:reload"),
  commitWorkingCopyToDisk: async (payload) => ipcRenderer.invoke("workingcopy:commit", payload || {}),
  writeWorkingCopyToPath: async (filePath) => ipcRenderer.invoke("workingcopy:write-to-path", { filePath: filePath || "" }),
  applyWorkingCopyTuneText: async (payload) => ipcRenderer.invoke("workingcopy:apply-tune-text", payload),
  showSaveError: async (message) =>
    ipcRenderer.invoke("dialog:show-save-error", message),
  showOpenError: async (message) =>
    ipcRenderer.invoke("dialog:show-open-error", message),
  importMusicXml: async () => ipcRenderer.invoke("import:musicxml"),
  pickMusicXmlFiles: async () => ipcRenderer.invoke("import:musicxml:pick"),
  convertMusicXmlFile: async (filePath) => ipcRenderer.invoke("import:musicxml:convert-one", filePath),
  exportMusicXml: async (abcText, suggestedName) =>
    ipcRenderer.invoke("export:musicxml", abcText, suggestedName),
  checkConversionTools: async () => ipcRenderer.invoke("tools:check"),
  readFile: async (filePath) => ipcRenderer.invoke("file:read", filePath),
  writeFile: async (filePath, data) => ipcRenderer.invoke("file:write", filePath, data),
  renameFile: async (oldPath, newPath) => ipcRenderer.invoke("file:rename", oldPath, newPath),
  fileExists: async (filePath) => ipcRenderer.invoke("file:exists", filePath),
  mkdirp: async (dirPath) => ipcRenderer.invoke("file:mkdirp", dirPath),
  scanLibrary: async (rootDir, options) => ipcRenderer.invoke("library:scan", rootDir, options),
  scanLibraryDiscover: async (rootDir, options) => ipcRenderer.invoke("library:scan-discover", rootDir, options),
  cancelLibraryScan: async () => ipcRenderer.invoke("library:cancel-scan"),
  parseLibraryFile: async (filePath, options) => ipcRenderer.invoke("library:parse-file", filePath, options),
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
  getSettingsSchema: async () => ipcRenderer.invoke("settings:schema"),
  updateSettings: async (patch) => ipcRenderer.invoke("settings:update", patch),
  getFontDirs: async () => ipcRenderer.invoke("fonts:dirs"),
  listFonts: async () => ipcRenderer.invoke("fonts:list"),
  pickFont: async () => ipcRenderer.invoke("fonts:pick"),
  installFont: async (srcPath) => ipcRenderer.invoke("fonts:install", srcPath),
  removeFont: async (fileName) => ipcRenderer.invoke("fonts:remove", fileName),
  getSettingsPaths: async () => ipcRenderer.invoke("settings:paths"),
  exportSettings: async () => ipcRenderer.invoke("settings:export"),
  importSettings: async () => ipcRenderer.invoke("settings:import"),
  openSettingsFolder: async () => ipcRenderer.invoke("settings:open-folder"),
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
  onImportMusicXmlProgress: (handler) => {
    ipcRenderer.on("import:musicxml:progress", (_evt, payload) => handler(payload));
  },
  onSettingsChanged: (handler) => {
    ipcRenderer.on("settings:changed", (_evt, settings) => handler(settings));
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
