// main.js
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, Menu, screen } = require("electron");
const { applyMenu } = require("./menu");
const { registerIpcHandlers } = require("./ipc");
const { resolveThirdPartyRoot } = require("./conversion");
const { getDefaultSettings: getDefaultSettingsFromSchema } = require("./settings_schema");

let mainWindow = null;
let isQuitting = false;
const appState = {
  lastFolder: null,
  recentTunes: [],
  recentFiles: [],
  recentFolders: [],
  settings: null,
};

// Optional Linux portal file chooser, controlled via:
// - env: `ABCARUS_USE_PORTAL=1` (preferred, effective immediately)
// - setting: `usePortalFileDialogs` (best-effort; may depend on GTK/Electron behavior)
if (process.platform === "linux" && process.env.ABCARUS_USE_PORTAL === "1") {
  process.env.GTK_USE_PORTAL = "1";
}

function resolveAppIconPath() {
  const appRoot = app.getAppPath();
  return path.join(appRoot, "assets", "icons", "abcarus_512.png");
}

function getDefaultSettings() {
  // Source of truth: `src/main/settings_schema.js`.
  return getDefaultSettingsFromSchema();
}

function getStatePath() {
  return path.join(app.getPath("userData"), "state.json");
}

function getSettingsPaths() {
  return {
    globalPath: path.join(app.getAppPath(), "assets", "global_settings.abc"),
    userPath: path.join(app.getPath("userData"), "user_settings.abc"),
  };
}

async function loadState() {
  try {
    const raw = await fs.promises.readFile(getStatePath(), "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      appState.lastFolder = data.lastFolder || null;
      appState.recentTunes = Array.isArray(data.recentTunes) ? data.recentTunes : [];
      appState.recentFiles = Array.isArray(data.recentFiles) ? data.recentFiles : [];
      appState.recentFolders = Array.isArray(data.recentFolders) ? data.recentFolders : [];
      if (data.settings && typeof data.settings === "object") {
        const merged = { ...getDefaultSettings(), ...data.settings };
        if (data.settings.zoomFactor && !data.settings.renderZoom && !data.settings.editorZoom) {
          merged.renderZoom = data.settings.zoomFactor;
          merged.editorZoom = data.settings.zoomFactor;
        }
        // Default portal dialogs ON for Linux unless explicitly set by the user.
        if (process.platform === "linux" && merged.usePortalFileDialogsSetByUser !== true) {
          merged.usePortalFileDialogs = true;
        }
        // Errors feature is intentionally session-only and defaults to off.
        merged.errorsEnabled = false;
        appState.settings = merged;
      } else {
        appState.settings = getDefaultSettings();
      }
    }
  } catch {}
  if (!appState.settings) appState.settings = getDefaultSettings();
}

async function pathExists(p) {
  if (!p) return false;
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function migrateStatePaths() {
  const validLastFolder = await pathExists(appState.lastFolder);
  if (!validLastFolder) appState.lastFolder = null;

  const validFolderEntries = [];
  for (const entry of appState.recentFolders) {
    if (entry && entry.path && await pathExists(entry.path)) {
      if (await folderHasAbc(entry.path)) validFolderEntries.push(entry);
    }
  }
  appState.recentFolders = validFolderEntries;

  const validFileEntries = [];
  for (const entry of appState.recentFiles) {
    if (entry && entry.path && await pathExists(entry.path)) validFileEntries.push(entry);
  }
  appState.recentFiles = validFileEntries;

  const validTuneEntries = [];
  for (const entry of appState.recentTunes) {
    if (entry && entry.path && await pathExists(entry.path)) validTuneEntries.push(entry);
  }
  appState.recentTunes = validTuneEntries;

  await saveState();
}

async function folderHasAbc(rootDir) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".abc")) {
        return true;
      }
    }
  }
  return false;
}

async function saveState() {
  try {
    const payload = JSON.stringify(
      {
        lastFolder: appState.lastFolder,
        recentTunes: appState.recentTunes,
        recentFiles: appState.recentFiles,
        recentFolders: appState.recentFolders,
        settings: appState.settings,
      },
      null,
      2
    );
    await fs.promises.writeFile(getStatePath(), payload, "utf8");
  } catch {}
}

function focusWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  try { win.setAlwaysOnTop(false); } catch {}
  win.show();
  win.focus();
}

const DEBUG_DIALOGS = process.env.ABCARUS_DEBUG_DIALOGS === "1";

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return value;
  return Math.max(min, Math.min(max, value));
}

function getWindowDebugSnapshot(win) {
  if (!win || win.isDestroyed()) return null;
  try {
    const bounds = win.getBounds();
    const isMaximized = win.isMaximized();
    const isFullScreen = win.isFullScreen();
    const center = {
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2),
    };
    const display = screen.getDisplayNearestPoint(center);
    const workArea = display && display.workArea ? display.workArea : null;
    return {
      id: win.id,
      bounds,
      isMaximized,
      isFullScreen,
      workArea,
    };
  } catch {
    return null;
  }
}

function ensureWindowOnScreen(win, reason) {
  if (!win || win.isDestroyed()) return;
  let bounds = null;
  try { bounds = win.getBounds(); } catch {}
  if (!bounds) return;

  let isMaximized = false;
  let isFullScreen = false;
  try { isMaximized = win.isMaximized(); } catch {}
  try { isFullScreen = win.isFullScreen(); } catch {}

  const center = {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  };
  const display = screen.getDisplayNearestPoint(center);
  const workArea = display && display.workArea ? display.workArea : null;
  if (!workArea) return;

  const minVisibleWidth = Math.min(bounds.width, workArea.width);
  const minVisibleHeight = Math.min(bounds.height, workArea.height);
  const maxX = workArea.x + workArea.width - minVisibleWidth;
  const maxY = workArea.y + workArea.height - minVisibleHeight;

  const outside =
    bounds.x > workArea.x + workArea.width ||
    bounds.x + bounds.width < workArea.x ||
    bounds.y > workArea.y + workArea.height ||
    bounds.y + bounds.height < workArea.y;

  // Avoid moving maximized/fullscreen windows unless they are completely off-screen.
  if (!outside && (isMaximized || isFullScreen)) return;

  const nextX = outside
    ? Math.round(workArea.x + (workArea.width - minVisibleWidth) / 2)
    : clampNumber(bounds.x, workArea.x, maxX);
  const nextY = outside
    ? Math.round(workArea.y + (workArea.height - minVisibleHeight) / 2)
    : clampNumber(bounds.y, workArea.y, maxY);

  if (nextX === bounds.x && nextY === bounds.y) return;

  if (DEBUG_DIALOGS) {
    console.log("[dialogs]", reason || "normalize", {
      before: bounds,
      after: { ...bounds, x: nextX, y: nextY },
      workArea,
    });
  }

  try {
    win.setBounds({ ...bounds, x: nextX, y: nextY });
  } catch {}
}

function getDialogParent(senderOrEvent) {
  try {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && !focused.isDestroyed()) return focused;
  } catch {}
  try {
    const sender = senderOrEvent && senderOrEvent.sender ? senderOrEvent.sender : senderOrEvent;
    if (sender) {
      const win = BrowserWindow.fromWebContents(sender);
      if (win && !win.isDestroyed()) return win;
    }
  } catch {}
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

function prepareDialogParent(senderOrEvent, reason) {
  if (
    process.platform === "linux" &&
    (process.env.ABCARUS_USE_PORTAL === "1" || (appState.settings && appState.settings.usePortalFileDialogs))
  ) {
    process.env.GTK_USE_PORTAL = "1";
  }
  const parent = getDialogParent(senderOrEvent);
  if (!parent || parent.isDestroyed()) return null;
  if (DEBUG_DIALOGS) {
    console.log("[dialogs] parent:before", {
      reason: reason || "dialog",
      portalEnv: process.platform === "linux" ? (process.env.GTK_USE_PORTAL || "") : "",
      snapshot: getWindowDebugSnapshot(parent),
    });
  }
  ensureWindowOnScreen(parent, reason || "dialog");
  focusWindow(parent);
  if (DEBUG_DIALOGS) {
    console.log("[dialogs] parent:after", {
      reason: reason || "dialog",
      snapshot: getWindowDebugSnapshot(parent),
    });
  }
  return parent;
}

function showOpenDialog(senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "open-file");
  return dialog.showOpenDialog(parent || undefined, {
    modal: true,
    properties: ["openFile"],
    filters: [
      { name: "ABC", extensions: ["abc"] },
      { name: "All Files", extensions: ["*"] },
    ],
  }).then((result) => {
    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}

function showOpenFolderDialog(senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "open-folder");
  return dialog.showOpenDialog(parent || undefined, {
    modal: true,
    properties: ["openDirectory"],
    defaultPath: appState.lastFolder || undefined,
  }).then((result) => {
    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return null;
    appState.lastFolder = result.filePaths[0];
    saveState();
    return result.filePaths[0];
  });
}

function showSaveDialog(suggestedName, suggestedDir, senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "save-file");
  const defaultName = suggestedName || "Untitled.abc";
  const defaultPath = suggestedDir ? path.join(suggestedDir, defaultName) : defaultName;
  return dialog.showSaveDialog(parent || undefined, {
    modal: true,
    title: "Save As",
    defaultPath,
    filters: [
      { name: "ABC", extensions: ["abc"] },
      { name: "All Files", extensions: ["*"] },
    ],
  }).then((result) => {
    if (!result || result.canceled) return null;
    return result.filePath || null;
  });
}

function confirmUnsavedChanges(contextLabel, senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "confirm-unsaved");
  const response = dialog.showMessageBoxSync(parent || undefined, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "You have unsaved changes.",
    detail: `Do you want to save before ${contextLabel}?`,
  });
  if (response === 0) return "save";
  if (response === 1) return "dont_save";
  return "cancel";
}

function confirmOverwrite(filePath, senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "confirm-overwrite");
  const response = dialog.showMessageBoxSync(parent || undefined, {
    type: "warning",
    buttons: ["Replace", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    message: "File already exists.",
    detail: `Replace “${path.basename(filePath)}”?`,
  });
  if (response === 0) return "replace";
  return "cancel";
}

function confirmDeleteTune(label) {
  const parent = prepareDialogParent(null, "confirm-delete-tune");
  const response = dialog.showMessageBoxSync(parent || undefined, {
    type: "warning",
    buttons: ["Delete", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    message: "Delete this tune?",
    detail: label ? `Delete “${label}”?` : "This action cannot be undone.",
  });
  if (response === 0) return "delete";
  return "cancel";
}

function confirmAppendToFile(filePath) {
  const parent = prepareDialogParent(null, "confirm-append-to-file");
  const response = dialog.showMessageBoxSync(parent || undefined, {
    type: "question",
    buttons: ["Append", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    message: "Append tune?",
    detail: `Append to “${path.basename(filePath)}”?`,
  });
  if (response === 0) return "append";
  return "cancel";
}

function showSaveError(message) {
  const parent = prepareDialogParent(null, "save-error");
  dialog.showMessageBoxSync(parent || undefined, {
    type: "error",
    buttons: ["OK"],
    message: "Unable to save file.",
    detail: message || "Unknown error.",
  });
}

function showOpenError(message) {
  const parent = prepareDialogParent(null, "open-error");
  dialog.showMessageBoxSync(parent || undefined, {
    type: "error",
    buttons: ["OK"],
    message: "Unable to open file.",
    detail: message || "Unknown error.",
  });
}

function sendMenuAction(action) {
  if (!mainWindow) return;
  mainWindow.webContents.send("menu:action", action);
}

let cachedMusicFont = null;

async function getMusicFontBase64() {
  if (cachedMusicFont) return cachedMusicFont;
  const fontPath = path.join(resolveThirdPartyRoot(), "abc2svg", "abc2svg.ttf");
  const buf = await fs.promises.readFile(fontPath);
  cachedMusicFont = buf.toString("base64");
  return cachedMusicFont;
}

function injectFontIntoSvg(svgMarkup, fontBase64) {
  if (!fontBase64 || !svgMarkup) return svgMarkup || "";
  const raw = String(svgMarkup);
  const fontCss = `@font-face {
  font-family: "music";
  src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
  font-weight: normal;
  font-style: normal;
}
.f3 { font-family: "music" !important; }`;
  const cleaned = raw.replace(/@font-face\\s*\\{[^}]*\\}/g, "");
  return cleaned.replace(/<svg\\b([^>]*)>/g, (match, attrs) => {
    return `<svg${attrs}><style>${fontCss}</style>`;
  });
}

function buildPrintHtml(svgMarkup, fontBase64) {
  const rawMarkup = String(svgMarkup || "");
  const safeSvg = injectFontIntoSvg(rawMarkup, fontBase64);
  const forceRaster = rawMarkup.includes("<!--abcarus:force-raster-->");
  const skipRaster = rawMarkup.includes("<!--abcarus:no-raster-->") || !forceRaster;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Print</title>
    <style>
      html, body { margin: 0; padding: 0; }
      body { padding: 24px; font-family: sans-serif; }
      svg { width: 100%; height: auto; display: block; }
      img { width: 100%; height: auto; display: block; }
      .print-tune { page-break-after: always; break-after: page; }
      .print-tune:last-of-type { page-break-after: auto; break-after: auto; }
      .print-error-summary,
      .print-error-card {
        border: 1px solid #e5b5b5;
        background: #fff5f0;
        color: #6b1c1c;
        border-radius: 8px;
        padding: 12px 14px;
        margin: 0 0 14px;
        font-size: 12px;
      }
      .print-error-title {
        font-weight: 700;
        margin-bottom: 6px;
      }
      .print-error-meta {
        margin-bottom: 8px;
        color: #7a2a2a;
      }
      .print-error-list {
        margin: 0;
        padding-left: 16px;
      }
      .print-error-list li {
        margin: 4px 0;
      }
      .print-error-loc {
        font-size: 11px;
        color: #8a4b4b;
      }
      .print-error-msg {
        margin-top: 2px;
      }
    </style>
  </head>
  <body>
    ${safeSvg}
    <script>
      (function () {
        var skipRaster = ${skipRaster ? "true" : "false"};
        if (skipRaster) {
          window._rasterReadyPromise = Promise.resolve();
          return;
        }
        function waitForFonts() {
          if (!document.fonts || !document.fonts.load) return Promise.resolve();
          return Promise.all([
            document.fonts.load('12px "music"').catch(function () { return null; }),
            document.fonts.ready.catch(function () { return null; }),
          ]);
        }
        function rasterizeSvg(svg) {
          const xml = new XMLSerializer().serializeToString(svg);
          const svg64 = btoa(unescape(encodeURIComponent(xml)));
          const imgSrc = "data:image/svg+xml;base64," + svg64;
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = function () {
              const width = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
                ? svg.viewBox.baseVal.width
                : svg.getBoundingClientRect().width;
              const height = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height
                ? svg.viewBox.baseVal.height
                : svg.getBoundingClientRect().height;
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.ceil(width));
              canvas.height = Math.max(1, Math.ceil(height));
              const ctx = canvas.getContext("2d");
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const png = canvas.toDataURL("image/png");
              const out = document.createElement("img");
              out.src = png;
              resolve(out);
            };
            img.onerror = function () { resolve(null); };
            img.src = imgSrc;
          });
        }
        function rasterizeAll() {
          const svgs = Array.from(document.querySelectorAll("svg"));
          if (!svgs.length) return Promise.resolve();
          return Promise.all(svgs.map(rasterizeSvg)).then((images) => {
            document.body.innerHTML = "";
            for (const img of images) {
              if (img) document.body.appendChild(img);
            }
          });
        }
        window._rasterReadyPromise = waitForFonts().then(rasterizeAll);
      })();
    </script>
  </body>
</html>`;
}

async function withPrintWindow(svgMarkup, action, options) {
  const win = new BrowserWindow({
    show: Boolean(options && options.show),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  const fontBase64 = await getMusicFontBase64().catch(() => null);
  const html = buildPrintHtml(svgMarkup, fontBase64);
  const tmpName = `abc-print-${Date.now()}.html`;
  const tmpPath = path.join(app.getPath("temp"), tmpName);
  await fs.promises.writeFile(tmpPath, html);
  await win.loadFile(tmpPath);
  try {
    await win.webContents.executeJavaScript("window._rasterReadyPromise || Promise.resolve()", true);
  } catch {}
  if (options && options.show && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
  const result = await action(win.webContents);
  setTimeout(() => {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch {}
    fs.promises.unlink(tmpPath).catch(() => {});
  }, 750);
  return result;
}

async function printWithDialog(svgMarkup) {
  return withPrintWindow(svgMarkup, (contents) =>
    new Promise((resolve) => {
      contents.print({ printBackground: true, silent: false }, (success, failureReason) => {
        if (!success) return resolve({ ok: false, error: failureReason || "Print failed" });
        resolve({ ok: true });
      });
    })
  , { show: true });
}

async function exportPdf(svgMarkup, filePath) {
  return withPrintWindow(svgMarkup, async (contents) => {
    const pdfData = await contents.printToPDF({ printBackground: true, marginsType: 0 });
    await fs.promises.writeFile(filePath, pdfData);
    return { ok: true, path: filePath };
  }, { show: false });
}

async function previewPdf(svgMarkup) {
  const tmpName = `abc-preview-${Date.now()}.pdf`;
  const tmpPath = path.join(app.getPath("temp"), tmpName);
  const res = await withPrintWindow(svgMarkup, async (contents) => {
    const pdfData = await contents.printToPDF({ printBackground: true, marginsType: 0 });
    await fs.promises.writeFile(tmpPath, pdfData);
    return { ok: true, path: tmpPath };
  }, { show: false });
  if (res && res.ok && res.path) {
    await shell.openPath(res.path);
  }
  return res;
}

async function printViaPdf(svgMarkup) {
  const tmpName = `abc-print-${Date.now()}.pdf`;
  const tmpPath = path.join(app.getPath("temp"), tmpName);
  const res = await withPrintWindow(svgMarkup, async (contents) => {
    const pdfData = await contents.printToPDF({ printBackground: true, marginsType: 0 });
    await fs.promises.writeFile(tmpPath, pdfData);
    return { ok: true, path: tmpPath };
  }, { show: false });
  if (res.ok && res.path) await shell.openPath(res.path);
  return res;
}

async function withMainPrintMode(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: "Main window not available." };
  }
  const prevMenu = Menu.getApplicationMenu();
  const prevMenuVisible = typeof mainWindow.isMenuBarVisible === "function"
    ? mainWindow.isMenuBarVisible()
    : true;
  try {
    if (typeof mainWindow.setMenuBarVisibility === "function") {
      mainWindow.setMenuBarVisibility(false);
    }
    Menu.setApplicationMenu(null);
    await mainWindow.webContents.executeJavaScript(
      'document.body.classList.add("print-mode")'
    );
    await mainWindow.webContents.executeJavaScript(
      'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
    );
    const res = await action(mainWindow.webContents);
    await mainWindow.webContents.executeJavaScript(
      'document.body.classList.remove("print-mode")'
    );
    Menu.setApplicationMenu(prevMenu);
    if (typeof mainWindow.setMenuBarVisibility === "function") {
      mainWindow.setMenuBarVisibility(prevMenuVisible);
    }
    return res;
  } catch (e) {
    try {
      await mainWindow.webContents.executeJavaScript(
        'document.body.classList.remove("print-mode")'
      );
    } catch {}
    try {
      Menu.setApplicationMenu(prevMenu);
      if (typeof mainWindow.setMenuBarVisibility === "function") {
        mainWindow.setMenuBarVisibility(prevMenuVisible);
      }
    } catch {}
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function refreshMenu() {
  applyMenu(appState, sendMenuAction);
}

function clampZoom(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(8, Math.max(0.5, value));
}

function updateSettings(patch) {
  const next = { ...getDefaultSettings(), ...appState.settings, ...patch };
  if (patch && patch.libraryUiStateByRoot && typeof patch.libraryUiStateByRoot === "object") {
    const prev = appState.settings && appState.settings.libraryUiStateByRoot && typeof appState.settings.libraryUiStateByRoot === "object"
      ? appState.settings.libraryUiStateByRoot
      : {};
    const merged = { ...prev };
    for (const [rootKey, value] of Object.entries(patch.libraryUiStateByRoot)) {
      const prevRoot = prev[rootKey] && typeof prev[rootKey] === "object" ? prev[rootKey] : {};
      const nextRoot = value && typeof value === "object" ? value : {};
      merged[rootKey] = { ...prevRoot, ...nextRoot };
    }
    next.libraryUiStateByRoot = merged;
  }
  next.renderZoom = clampZoom(Number(next.renderZoom));
  next.editorZoom = clampZoom(Number(next.editorZoom));
  next.editorFontSize = Math.min(32, Math.max(8, Number(next.editorFontSize) || 13));
  next.editorNotesBold = Boolean(next.editorNotesBold);
  next.editorLyricsBold = Boolean(next.editorLyricsBold);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "usePortalFileDialogs")) {
    next.usePortalFileDialogsSetByUser = true;
  }
  // Errors feature is intentionally session-only and always persisted as off.
  next.errorsEnabled = false;
  appState.settings = next;
  saveState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("settings:changed", next);
  }
  return next;
}

function addRecentTune(entry) {
  if (!entry || !entry.path || entry.startOffset == null || entry.endOffset == null) return;
  const key = `${entry.path}::${entry.startOffset}`;
  appState.recentTunes = appState.recentTunes.filter(
    (item) => `${item.path}::${item.startOffset}` !== key
  );
  appState.recentTunes.unshift({
    path: entry.path,
    basename: entry.basename || path.basename(entry.path),
    xNumber: entry.xNumber || "",
    title: entry.title || "",
    startLine: entry.startLine || 1,
    endLine: entry.endLine || 1,
    startOffset: entry.startOffset,
    endOffset: entry.endOffset,
  });
  appState.recentTunes = appState.recentTunes.slice(0, 10);
  saveState();
  refreshMenu();
}

function addRecentFile(entry) {
  if (!entry || !entry.path) return;
  appState.recentFiles = appState.recentFiles.filter((item) => item.path !== entry.path);
  appState.recentFiles.unshift({
    path: entry.path,
    basename: entry.basename || path.basename(entry.path),
  });
  appState.recentFiles = appState.recentFiles.slice(0, 10);
  saveState();
  refreshMenu();
}

function addRecentFolder(entry) {
  if (!entry || !entry.path) return;
  appState.recentFolders = appState.recentFolders.filter((item) => item.path !== entry.path);
  appState.recentFolders.unshift({
    path: entry.path,
    label: entry.label || entry.path,
  });
  appState.recentFolders = appState.recentFolders.slice(0, 10);
  saveState();
  refreshMenu();
}

async function cleanupTempPrintFiles() {
  const dir = app.getPath("temp");
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return;
  }
  const patterns = [
    /^abc-print-\d+\.html$/,
    /^abc-print-\d+\.pdf$/,
    /^abc-preview-\d+\.pdf$/,
  ];
  const deletions = entries
    .filter((name) => patterns.some((re) => re.test(name)))
    .map((name) => fs.promises.unlink(path.join(dir, name)).catch(() => {}));
  if (deletions.length) await Promise.all(deletions);
}

function splitLinesWithOffsets(content) {
  const lines = content.split(/\r\n|\n|\r/);
  const lineStarts = [];
  let idx = 0;
  for (let i = 0; i < lines.length; i += 1) {
    lineStarts.push(idx);
    idx += lines[i].length;
    if (idx < content.length) {
      if (content[idx] === "\r" && content[idx + 1] === "\n") idx += 2;
      else if (content[idx] === "\r" || content[idx] === "\n") idx += 1;
    }
  }
  return { lines, lineStarts };
}

function extractTuneHeader(lines, startIdx, endIdx) {
  let title = "";
  let composer = "";
  let key = "";
  let meter = "";
  let unitLength = "";
  let tempo = "";
  let rhythm = "";
  let source = "";
  let origin = "";
  let group = "";
  let sawHeader = false;
  for (let i = startIdx; i <= endIdx; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    const isBlank = trimmed === "";
    const isHeader = /^[A-Za-z]:/.test(line) || /^%/.test(line);
    if (isHeader) sawHeader = true;
    if (!title && /^T:/.test(line)) title = line.slice(2).trim();
    if (!composer && /^C:/.test(line)) composer = line.slice(2).trim();
    if (!key && /^K:/.test(line)) key = line.slice(2).trim();
    if (!meter && /^M:/.test(line)) meter = line.slice(2).trim();
    if (!unitLength && /^L:/.test(line)) unitLength = line.slice(2).trim();
    if (!tempo && /^Q:/.test(line)) tempo = line.slice(2).trim();
    if (!rhythm && /^R:/.test(line)) rhythm = line.slice(2).trim();
    if (!source && /^S:/.test(line)) source = line.slice(2).trim();
    if (!origin && /^O:/.test(line)) origin = line.slice(2).trim();
    if (!group && /^G:/.test(line)) group = line.slice(2).trim();
    if (sawHeader && isBlank) break;
    if (!isHeader && !isBlank) break;
  }
  return { title, composer, key, meter, unitLength, tempo, rhythm, source, origin, group };
}

function analyzeTuneXIssues(tunes) {
  const duplicates = {};
  const seen = new Map();
  let invalid = 0;
  let missing = 0;

  for (const tune of tunes || []) {
    const xNumber = tune && tune.xNumber != null ? String(tune.xNumber) : "";
    const isValid = Boolean(tune && tune._xValid);
    if (!xNumber) {
      if (isValid) missing += 1;
      else invalid += 1;
      continue;
    }
    const prev = seen.get(xNumber) || 0;
    seen.set(xNumber, prev + 1);
  }

  for (const [x, count] of seen.entries()) {
    if (count > 1) duplicates[x] = count;
  }

  const duplicateCount = Object.keys(duplicates).length;
  return {
    ok: missing === 0 && invalid === 0 && duplicateCount === 0,
    missing,
    invalid,
    duplicates: duplicateCount ? duplicates : undefined,
  };
}

function buildTunesFromContent(absPath, content) {
  const { lines, lineStarts } = splitLinesWithOffsets(content);
  const tunes = [];
  let currentStart = null;
  let tuneIndex = 0;
  const xRe = /^\s*X:/;
  let headerEndOffset = content.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*X:/.test(lines[i] || "")) {
      headerEndOffset = lineStarts[i] ?? 0;
      break;
    }
  }
  const headerText = content.slice(0, headerEndOffset);

  const finalize = (startIdx, endIdx) => {
    const xLine = lines[startIdx] || "";
    const xMatch = xLine.match(/^\s*X:\s*(\d+)/);
    const xNumber = xMatch ? xMatch[1] : "";
    const xValid = /^\s*X:\s*\d+/.test(xLine);
    const header = extractTuneHeader(lines, startIdx, endIdx);
    const title = header.title;
    let preview = title;
    if (!preview) {
      for (let i = startIdx + 1; i <= endIdx; i += 1) {
        const trimmed = (lines[i] || "").trim();
        if (trimmed) {
          preview = trimmed;
          break;
        }
      }
    }
    const startOffset = lineStarts[startIdx] ?? 0;
    const endOffset =
      endIdx + 1 < lineStarts.length ? lineStarts[endIdx + 1] : content.length;
    tuneIndex += 1;
    tunes.push({
      id: `${absPath}::${startOffset}`,
      indexInFile: tuneIndex,
      xNumber,
      _xValid: xValid,
      title,
      composer: header.composer,
      key: header.key,
      meter: header.meter,
      unitLength: header.unitLength,
      tempo: header.tempo,
      rhythm: header.rhythm,
      source: header.source,
      origin: header.origin,
      group: header.group,
      preview: preview || "",
      startLine: startIdx + 1,
      endLine: endIdx + 1,
      startOffset,
      endOffset, // exclusive
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (xRe.test(lines[i] || "")) {
      if (currentStart != null) finalize(currentStart, i - 1);
      currentStart = i;
    }
  }

  if (currentStart != null) {
    finalize(currentStart, lines.length - 1);
  }

  const xIssues = analyzeTuneXIssues(tunes);
  for (const tune of tunes) delete tune._xValid;
  return { tunes, headerText, headerEndOffset, xIssues };
}

const MAX_PARSE_CACHE_ENTRIES = 250;
const parseCache = new Map();
const activeScanTokens = new WeakMap();

function isPersistedLibraryIndexEnabled() {
  return process.env.ABCARUS_DISABLE_LIBRARY_INDEX !== "1";
}

function getScanTokenFromOptions(options) {
  if (!options || typeof options !== "object") return "";
  const token = options.token;
  if (typeof token === "string" || typeof token === "number") return String(token);
  return "";
}

function setActiveScanToken(sender, token) {
  if (!sender || !token) return;
  try { activeScanTokens.set(sender, token); } catch {}
}

function isScanTokenActive(sender, token) {
  if (!sender || !token) return true;
  try { return activeScanTokens.get(sender) === token; } catch { return true; }
}

function cancelLibraryScan(sender) {
  if (!sender) return;
  const token = `cancel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setActiveScanToken(sender, token);
}

function lruGet(map, key) {
  if (!map.has(key)) return undefined;
  const value = map.get(key);
  map.delete(key);
  map.set(key, value);
  return value;
}

function lruSet(map, key, value, maxEntries) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > maxEntries) {
    const firstKey = map.keys().next().value;
    if (firstKey == null) break;
    map.delete(firstKey);
  }
}

const PERSISTED_LIBRARY_INDEX_VERSION = 1;
let persistedLibraryIndex = null;
let persistedIndexLoadAttempted = false;
let persistedIndexSaveTimer = null;
let persistedIndexDirty = false;

function getPersistedLibraryIndexPath() {
  try {
    const dir = app.getPath("userData");
    return path.join(dir, `library-index-v${PERSISTED_LIBRARY_INDEX_VERSION}.json`);
  } catch {
    return "";
  }
}

async function loadPersistedLibraryIndex() {
  if (!isPersistedLibraryIndexEnabled()) return null;
  if (persistedIndexLoadAttempted) return persistedLibraryIndex;
  persistedIndexLoadAttempted = true;
  const filePath = getPersistedLibraryIndexPath();
  if (!filePath) return null;
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PERSISTED_LIBRARY_INDEX_VERSION || typeof parsed.files !== "object") {
      persistedLibraryIndex = null;
      return null;
    }
    persistedLibraryIndex = parsed;
    return persistedLibraryIndex;
  } catch {
    persistedLibraryIndex = null;
    return null;
  }
}

function ensurePersistedLibraryIndexLoaded() {
  if (!isPersistedLibraryIndexEnabled()) return;
  if (persistedIndexLoadAttempted) return;
  // Fire and forget; callers tolerate a null index until loaded.
  loadPersistedLibraryIndex().catch(() => {});
}

async function atomicWriteFileWithRetry(filePath, data, { attempts = 5 } = {}) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, data, "utf8");
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      try {
        await fs.promises.rename(tmpPath, filePath);
        return;
      } catch (e) {
        // Windows often fails rename when target exists; remove and retry.
        try { await fs.promises.unlink(filePath); } catch {}
        await fs.promises.rename(tmpPath, filePath);
        return;
      }
    } catch (e) {
      lastErr = e;
      const code = e && e.code ? String(e.code) : "";
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") break;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
  try { await fs.promises.unlink(tmpPath); } catch {}
  throw lastErr || new Error("Unable to write file.");
}

function schedulePersistedLibraryIndexSave() {
  if (!isPersistedLibraryIndexEnabled()) return;
  if (persistedIndexSaveTimer) return;
  persistedIndexSaveTimer = setTimeout(async () => {
    persistedIndexSaveTimer = null;
    if (!persistedIndexDirty) return;
    persistedIndexDirty = false;
    const filePath = getPersistedLibraryIndexPath();
    if (!filePath || !persistedLibraryIndex) return;
    try {
      const json = JSON.stringify(persistedLibraryIndex);
      await atomicWriteFileWithRetry(filePath, json);
    } catch {
      // Ignore: cache is best-effort and should never block library usage.
    }
  }, 900);
}

function getPersistedEntry(filePath, stat) {
  if (!isPersistedLibraryIndexEnabled()) return null;
  if (!persistedLibraryIndex || !persistedLibraryIndex.files || !stat) return null;
  const key = path.resolve(filePath);
  const entry = persistedLibraryIndex.files[key];
  if (!entry) return null;
  if (entry.mtimeMs === stat.mtimeMs && entry.size === stat.size) {
    const parsed = entry.parsed || null;
    if (!parsed) return null;
    if (!parsed.xIssues && Array.isArray(parsed.tunes)) {
      // Backfill xIssues for older cache entries where we didn't persist it yet.
      const tunes = parsed.tunes || [];
      const xIssues = (() => {
        const duplicates = {};
        const seen = new Map();
        let invalid = 0;
        for (const tune of tunes) {
          const x = tune && tune.xNumber != null ? String(tune.xNumber) : "";
          if (!x) {
            invalid += 1;
            continue;
          }
          seen.set(x, (seen.get(x) || 0) + 1);
        }
        for (const [x, count] of seen.entries()) {
          if (count > 1) duplicates[x] = count;
        }
        const duplicateCount = Object.keys(duplicates).length;
        return {
          ok: invalid === 0 && duplicateCount === 0,
          missing: 0,
          invalid,
          duplicates: duplicateCount ? duplicates : undefined,
        };
      })();
      parsed.xIssues = xIssues;
      entry.parsed = parsed;
      if (!entry.discover) {
        entry.discover = {
          tuneCount: Array.isArray(parsed.tunes) ? parsed.tunes.length : 0,
          xIssues,
        };
      }
      persistedIndexDirty = true;
      schedulePersistedLibraryIndexSave();
    }
    return parsed;
  }
  return null;
}

function getPersistedDiscoverEntry(filePath, stat) {
  if (!isPersistedLibraryIndexEnabled()) return null;
  if (!persistedLibraryIndex || !persistedLibraryIndex.files || !stat) return null;
  const key = path.resolve(filePath);
  const entry = persistedLibraryIndex.files[key];
  if (!entry) return null;
  if (entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) return null;

  if (entry.discover && typeof entry.discover === "object") {
    const tuneCount = Number(entry.discover.tuneCount);
    return {
      tuneCount: Number.isFinite(tuneCount) ? tuneCount : 0,
      xIssues: entry.discover.xIssues || undefined,
    };
  }

  const parsed = entry.parsed || null;
  if (parsed && typeof parsed === "object") {
    const tuneCount = Array.isArray(parsed.tunes) ? parsed.tunes.length : 0;
    const xIssues = parsed.xIssues || undefined;
    entry.discover = { tuneCount, xIssues };
    persistedIndexDirty = true;
    schedulePersistedLibraryIndexSave();
    return { tuneCount, xIssues };
  }

  return null;
}

function analyzeXIssuesFromLines(lines) {
  const xStartRe = /^\s*X:\s*(.*)$/;
  const xNumberRe = /^\s*X:\s*(\d+)/;
  let tuneCount = 0;
  let invalid = 0;
  const seen = new Map();

  for (const line of lines) {
    const text = line == null ? "" : String(line);
    if (!xStartRe.test(text)) continue;
    tuneCount += 1;
    const match = text.match(xNumberRe);
    if (!match || !match[1]) {
      invalid += 1;
      continue;
    }
    const x = String(match[1]);
    seen.set(x, (seen.get(x) || 0) + 1);
  }

  const duplicates = {};
  for (const [x, count] of seen.entries()) {
    if (count > 1) duplicates[x] = count;
  }
  const duplicateCount = Object.keys(duplicates).length;
  const xIssues = {
    ok: invalid === 0 && duplicateCount === 0,
    missing: 0,
    invalid,
    duplicates: duplicateCount ? duplicates : undefined,
  };

  return { tuneCount, xIssues };
}

function computeDiscoverFromContent(content) {
  const lines = String(content || "").split(/\r\n|\n|\r/);
  return analyzeXIssuesFromLines(lines);
}

function setPersistedDiscoverEntry(filePath, stat, discover) {
  if (!isPersistedLibraryIndexEnabled()) return;
  if (!stat || !discover) return;
  if (!persistedLibraryIndex) {
    persistedLibraryIndex = { version: PERSISTED_LIBRARY_INDEX_VERSION, files: {} };
  }
  if (!persistedLibraryIndex.files) persistedLibraryIndex.files = {};
  const key = path.resolve(filePath);
  const prev = persistedLibraryIndex.files[key] && typeof persistedLibraryIndex.files[key] === "object"
    ? persistedLibraryIndex.files[key]
    : {};
  persistedLibraryIndex.files[key] = {
    ...prev,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    updatedAtMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
    discover: {
      tuneCount: Number.isFinite(Number(discover.tuneCount)) ? Number(discover.tuneCount) : 0,
      xIssues: discover.xIssues || undefined,
    },
    // Invalidate stale parsed payload when the file changes.
    parsed: null,
  };
  persistedIndexDirty = true;
  schedulePersistedLibraryIndexSave();
}

function setPersistedEntry(filePath, stat, parsed) {
  if (!isPersistedLibraryIndexEnabled()) return;
  if (!stat || !parsed) return;
  if (!persistedLibraryIndex) {
    persistedLibraryIndex = { version: PERSISTED_LIBRARY_INDEX_VERSION, files: {} };
  }
  if (!persistedLibraryIndex.files) persistedLibraryIndex.files = {};
  const key = path.resolve(filePath);
  const headerText = parsed.headerText ? String(parsed.headerText) : "";
  const cappedHeaderText = headerText.length > 200000 ? headerText.slice(0, 200000) : headerText;
  const tuneCount = Array.isArray(parsed.tunes) ? parsed.tunes.length : 0;
  persistedLibraryIndex.files[key] = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    updatedAtMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
    discover: {
      tuneCount,
      xIssues: parsed.xIssues || undefined,
    },
    parsed: {
      headerEndOffset: parsed.headerEndOffset || 0,
      headerText: cappedHeaderText,
      xIssues: parsed.xIssues || undefined,
      tunes: Array.isArray(parsed.tunes) ? parsed.tunes : [],
    },
  };
  persistedIndexDirty = true;
  schedulePersistedLibraryIndexSave();
}

function createProgressEmitter(sender, intervalMs = 150) {
  let lastSentAt = 0;
  let timer = null;
  let pending = null;

  const flush = () => {
    if (!sender || !pending) return;
    const payload = pending;
    pending = null;
    lastSentAt = Date.now();
    try {
      sender.send("library:progress", payload);
    } catch {}
  };

  const schedule = () => {
    if (timer) return;
    const wait = Math.max(0, intervalMs - (Date.now() - lastSentAt));
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, wait);
  };

  return {
    send(payload) {
      if (!sender) return;
      pending = payload;
      if (Date.now() - lastSentAt >= intervalMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        flush();
        return;
      }
      schedule();
    },
    finish(payload) {
      if (payload) pending = payload;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    },
  };
}

function getCachedParse(filePath, stat) {
  if (!stat) return null;
  const key = path.resolve(filePath);
  const cached = lruGet(parseCache, key);
  if (!cached) return null;
  if (cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.parsed;
  return null;
}

function setCachedParse(filePath, stat, parsed) {
  if (!stat || !parsed) return;
  const key = path.resolve(filePath);
  lruSet(parseCache, key, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    parsed,
  }, MAX_PARSE_CACHE_ENTRIES);
}

async function parseSingleFile(filePath, sender, options = {}) {
  ensurePersistedLibraryIndexLoaded();
  const progress = createProgressEmitter(sender);
  let stat = null;
  let content = "";
  try {
    stat = await fs.promises.stat(filePath);
    if (!options || !options.force) {
      const cached = getCachedParse(filePath, stat);
      if (cached) {
        return {
          root: path.dirname(filePath),
          files: [
            {
              path: filePath,
              basename: path.basename(filePath),
              updatedAtMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
              headerText: cached.headerText || "",
              headerEndOffset: cached.headerEndOffset || 0,
              tunes: cached.tunes,
            },
          ],
        };
      }
    }
    content = await fs.promises.readFile(filePath, "utf8");
  } catch (e) {
    progress.finish({
      phase: "parse",
      current: filePath,
      index: 1,
      total: 1,
      error: e && e.message ? e.message : String(e),
    });
    return null;
  }
  const parsed = buildTunesFromContent(filePath, content);
  setCachedParse(filePath, stat, parsed);
  setPersistedEntry(filePath, stat, parsed);
  return {
    root: path.dirname(filePath),
    files: [
      {
        path: filePath,
        basename: path.basename(filePath),
        updatedAtMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
        mtimeMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
        size: stat && Number.isFinite(stat.size) ? stat.size : 0,
        headerText: parsed.headerText || "",
        headerEndOffset: parsed.headerEndOffset || 0,
        xIssues: parsed.xIssues || undefined,
        tunes: parsed.tunes,
      },
    ],
  };
}

async function scanLibraryDiscover(rootDir, sender, options = {}) {
  ensurePersistedLibraryIndexLoaded();
  const absRoot = path.resolve(rootDir);
  const token = getScanTokenFromOptions(options);
  setActiveScanToken(sender, token);
  const stack = [absRoot];
  const abcFiles = [];
  let scannedDirs = 0;
  const progress = createProgressEmitter(sender);

  while (stack.length) {
    if (!isScanTokenActive(sender, token)) {
      progress.finish({ phase: "done", cancelled: true, scannedDirs, filesFound: abcFiles.length });
      return { root: absRoot, files: [], cancelled: true };
    }
    const dir = stack.pop();
    if (!dir) continue;
    scannedDirs += 1;
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".abc")) {
        abcFiles.push(fullPath);
      }
    }
    progress.send({
      phase: "discover",
      scannedDirs,
      filesFound: abcFiles.length,
    });
  }

  abcFiles.sort((a, b) => a.localeCompare(b));
  const files = [];
  const seenFiles = new Set();
  for (let i = 0; i < abcFiles.length; i += 1) {
    const filePath = abcFiles[i];
    if (!isScanTokenActive(sender, token)) {
      progress.finish({ phase: "done", cancelled: true, scannedDirs, filesFound: files.length });
      return { root: absRoot, files, cancelled: true };
    }
    try {
      const stat = await fs.promises.stat(filePath);
      const cached = getPersistedDiscoverEntry(filePath, stat);
      let tuneCount = cached && Number.isFinite(cached.tuneCount) ? cached.tuneCount : null;
      let xIssues = cached && cached.xIssues ? cached.xIssues : undefined;
      const allowMetaRefresh = options && options.computeMeta === true;
      if (tuneCount == null && allowMetaRefresh) {
        // New or changed file: compute minimal metadata without full parse.
        const content = await fs.promises.readFile(filePath, "utf8");
        const discovered = computeDiscoverFromContent(content);
        tuneCount = discovered.tuneCount;
        xIssues = discovered.xIssues || undefined;
        setPersistedDiscoverEntry(filePath, stat, { tuneCount, xIssues });
      }
      files.push({
        path: filePath,
        basename: path.basename(filePath),
        updatedAtMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
        mtimeMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
        size: stat && Number.isFinite(stat.size) ? stat.size : 0,
        tuneCount: Number.isFinite(tuneCount) ? tuneCount : undefined,
        xIssues,
      });
      seenFiles.add(path.resolve(filePath));
      if (i % 25 === 0) {
        progress.send({
          phase: "discover",
          scannedDirs,
          filesFound: files.length,
        });
      }
    } catch {
      // skip unreadable files
    }
  }

  // Best-effort prune: remove deleted .abc entries under this root from the persisted index.
  try {
    if (isPersistedLibraryIndexEnabled() && persistedLibraryIndex && persistedLibraryIndex.files && seenFiles.size) {
      const prefix = absRoot.endsWith(path.sep) ? absRoot : `${absRoot}${path.sep}`;
      let removed = 0;
      for (const key of Object.keys(persistedLibraryIndex.files)) {
        if (!key || typeof key !== "string") continue;
        if (!key.startsWith(prefix)) continue;
        if (seenFiles.has(key)) continue;
        delete persistedLibraryIndex.files[key];
        removed += 1;
      }
      if (removed) {
        persistedIndexDirty = true;
        schedulePersistedLibraryIndexSave();
      }
    }
  } catch {}

  progress.finish({ phase: "done", scannedDirs, filesFound: files.length });
  return { root: absRoot, files };
}

async function scanLibrary(rootDir, sender, options = {}) {
  ensurePersistedLibraryIndexLoaded();
  const absRoot = path.resolve(rootDir);
  const token = getScanTokenFromOptions(options);
  setActiveScanToken(sender, token);
  const stack = [absRoot];
  const abcFiles = [];
  let scannedDirs = 0;
  const progress = createProgressEmitter(sender);

  while (stack.length) {
    if (!isScanTokenActive(sender, token)) {
      progress.finish({ phase: "done", cancelled: true, scannedDirs, filesFound: abcFiles.length });
      return { root: absRoot, files: [], cancelled: true };
    }
    const dir = stack.pop();
    if (!dir) continue;
    scannedDirs += 1;
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".abc")) {
        abcFiles.push(fullPath);
      }
    }
    progress.send({
      phase: "discover",
      scannedDirs,
      filesFound: abcFiles.length,
    });
  }

  abcFiles.sort((a, b) => a.localeCompare(b));
  const files = [];
  const seenFiles = new Set();
  let cachedCount = 0;
  let parsedCount = 0;

  for (let i = 0; i < abcFiles.length; i += 1) {
    if (!isScanTokenActive(sender, token)) {
      progress.finish({ phase: "done", cancelled: true, scannedDirs, filesFound: files.length });
      return { root: absRoot, files, cancelled: true };
    }
    const filePath = abcFiles[i];
    let stat = null;
    let parsed = null;
    try {
      stat = await fs.promises.stat(filePath);
      const cached = getCachedParse(filePath, stat);
      if (cached) {
        parsed = cached;
        cachedCount += 1;
      } else {
        const persisted = getPersistedEntry(filePath, stat);
        if (persisted) {
          parsed = persisted;
          setCachedParse(filePath, stat, parsed);
          cachedCount += 1;
        } else {
        const content = await fs.promises.readFile(filePath, "utf8");
        parsed = buildTunesFromContent(filePath, content);
        setCachedParse(filePath, stat, parsed);
        setPersistedEntry(filePath, stat, parsed);
        parsedCount += 1;
        }
      }
    } catch (e) {
      progress.send({
        phase: "parse",
        current: filePath,
        index: i + 1,
        total: abcFiles.length,
        cachedCount,
        parsedCount,
        error: e && e.message ? e.message : String(e),
      });
      continue;
    }
    files.push({
      path: filePath,
      basename: path.basename(filePath),
      updatedAtMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
      mtimeMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
      size: stat && Number.isFinite(stat.size) ? stat.size : 0,
      headerText: parsed.headerText || "",
      headerEndOffset: parsed.headerEndOffset || 0,
      xIssues: parsed.xIssues || undefined,
      tunes: parsed.tunes,
    });
    seenFiles.add(path.resolve(filePath));
    progress.send({
      phase: "parse",
      current: filePath,
      index: i + 1,
      total: abcFiles.length,
      tuneCount: parsed.tunes.length,
      cachedCount,
      parsedCount,
    });

    if (i % 10 === 0) {
      await new Promise((r) => setImmediate(r));
    }
  }

  // Best-effort prune: remove deleted .abc entries under this root from the persisted index.
  try {
    if (isPersistedLibraryIndexEnabled() && persistedLibraryIndex && persistedLibraryIndex.files && seenFiles.size) {
      const prefix = absRoot.endsWith(path.sep) ? absRoot : `${absRoot}${path.sep}`;
      let removed = 0;
      for (const key of Object.keys(persistedLibraryIndex.files)) {
        if (!key || typeof key !== "string") continue;
        if (!key.startsWith(prefix)) continue;
        if (seenFiles.has(key)) continue;
        delete persistedLibraryIndex.files[key];
        removed += 1;
      }
      if (removed) {
        persistedIndexDirty = true;
        schedulePersistedLibraryIndexSave();
      }
    }
  } catch {}

  progress.finish({ phase: "done", scannedDirs, filesFound: abcFiles.length });
  return {
    root: absRoot,
    files,
  };
}

function createWindow() {
  nativeTheme.themeSource = "light";
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: resolveAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // IMPORTANT: otherwise preload has no fs
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  mainWindow = win;
  try { win.setAlwaysOnTop(false); } catch {}
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.maximize();
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.alt && !input.control && !input.meta && !input.shift) {
      const key = input.key;
      if (key === "PageUp") {
        event.preventDefault();
        sendMenuAction("navTunePrev");
        return;
      }
      if (key === "PageDown") {
        event.preventDefault();
        sendMenuAction("navTuneNext");
        return;
      }
    }
    const hasMod = input.control || input.meta;
    if (!hasMod || !input.shift || input.alt) return;
    const key = input.key;
    if (key === "ArrowUp") {
      event.preventDefault();
      sendMenuAction("transformTransposeUp");
    } else if (key === "ArrowDown") {
      event.preventDefault();
      sendMenuAction("transformTransposeDown");
    } else if (key === "ArrowRight") {
      event.preventDefault();
      sendMenuAction("transformDouble");
    } else if (key === "ArrowLeft") {
      event.preventDefault();
      sendMenuAction("transformHalf");
    } else if (key === "A" || key === "a") {
      event.preventDefault();
      sendMenuAction("alignBars");
    }
  });
  win.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    win.webContents.send("app:request-quit");
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.whenReady().then(async () => {
  app.setName("ABCarus");
  if (process.platform === "win32") {
    app.setAppUserModelId("com.abcarus.app");
  }
  await loadState();
  if (process.platform === "linux" && appState.settings && appState.settings.usePortalFileDialogs) {
    process.env.GTK_USE_PORTAL = "1";
  }
  await migrateStatePaths();
  cleanupTempPrintFiles().catch(() => {});
  createWindow();
  refreshMenu();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

registerIpcHandlers({
  ipcMain,
  app,
  dialog,
  fs,
  path,
  shell,
  showOpenDialog,
  showOpenFolderDialog,
  showSaveDialog,
  confirmUnsavedChanges,
  confirmOverwrite,
  showSaveError,
  showOpenError,
  scanLibrary,
  scanLibraryDiscover,
  cancelLibraryScan,
  parseSingleFile,
  withMainPrintMode,
  printWithDialog,
  previewPdf,
  exportPdf,
  printViaPdf,
  getDialogParent,
  prepareDialogParent,
  confirmAppendToFile,
  confirmDeleteTune,
  addRecentTune,
  addRecentFile,
  addRecentFolder,
  getSettingsPaths,
  getSettings: () => appState.settings || getDefaultSettings(),
  updateSettings,
  getLastRecent: () => {
    if (appState.recentTunes && appState.recentTunes.length) {
      return { type: "tune", entry: appState.recentTunes[0] };
    }
    if (appState.recentFiles && appState.recentFiles.length) {
      return { type: "file", entry: appState.recentFiles[0] };
    }
    return null;
  },
  requestQuit: () => {
    isQuitting = true;
    app.quit();
  },
});
