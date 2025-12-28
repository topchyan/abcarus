// main.js
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, Menu } = require("electron");
const { applyMenu } = require("./menu");
const { registerIpcHandlers } = require("./ipc");
const { resolveThirdPartyRoot } = require("./conversion");

let mainWindow = null;
let isQuitting = false;
const appState = {
  lastFolder: null,
  recentTunes: [],
  recentFiles: [],
  recentFolders: [],
  settings: null,
};

function resolveAppIconPath() {
  const appRoot = app.getAppPath();
  return path.join(appRoot, "assets", "icons", "abcarus_512.png");
}

function getDefaultSettings() {
  return {
    renderZoom: 1,
    editorZoom: 1,
    editorFontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    editorFontSize: 13,
    editorNotesBold: true,
    editorLyricsBold: true,
    abc2xmlArgs: "",
    xml2abcArgs: "",
    globalHeaderText: "",
    globalHeaderEnabled: true,
    soundfontName: "TimGM6mb.sf2",
    soundfontPaths: [],
    drumVelocityMap: {},
    disclaimerSeen: false,
  };
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

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function getDialogParent() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

function showOpenDialog() {
  focusMainWindow();
  const parent = getDialogParent();
  const result = dialog.showOpenDialogSync(parent, {
    modal: true,
    properties: ["openFile"],
    filters: [
      { name: "ABC", extensions: ["abc"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!result || !result.length) return null;
  return result[0];
}

function showOpenFolderDialog() {
  focusMainWindow();
  const parent = getDialogParent();
  const result = dialog.showOpenDialogSync(parent, {
    modal: true,
    properties: ["openDirectory"],
    defaultPath: appState.lastFolder || undefined,
  });
  if (!result || !result.length) return null;
  appState.lastFolder = result[0];
  saveState();
  return result[0];
}

function showSaveDialog(suggestedName, suggestedDir) {
  focusMainWindow();
  const parent = getDialogParent();
  const defaultName = suggestedName || "Untitled.abc";
  const defaultPath = suggestedDir ? path.join(suggestedDir, defaultName) : defaultName;
  const result = dialog.showSaveDialogSync(parent, {
    modal: true,
    title: "Save As",
    defaultPath,
    filters: [
      { name: "ABC", extensions: ["abc"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return result || null;
}

function confirmUnsavedChanges(contextLabel) {
  focusMainWindow();
  const parent = getDialogParent();
  const response = dialog.showMessageBoxSync(parent, {
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

function confirmOverwrite(filePath) {
  focusMainWindow();
  const parent = getDialogParent();
  const response = dialog.showMessageBoxSync(parent, {
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
  focusMainWindow();
  const parent = getDialogParent();
  const response = dialog.showMessageBoxSync(parent, {
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
  focusMainWindow();
  const parent = getDialogParent();
  const response = dialog.showMessageBoxSync(parent, {
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
  const parent = getDialogParent();
  dialog.showMessageBoxSync(parent, {
    type: "error",
    buttons: ["OK"],
    message: "Unable to save file.",
    detail: message || "Unknown error.",
  });
}

function showOpenError(message) {
  const parent = getDialogParent();
  dialog.showMessageBoxSync(parent, {
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
  const fontCss = `@font-face {
  font-family: "music";
  src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
  font-weight: normal;
  font-style: normal;
}
.f3 { font-family: "music" !important; }`;
  const cleaned = String(svgMarkup).replace(/@font-face\\s*\\{[^}]*\\}/g, "");
  return cleaned.replace(/<svg\\b([^>]*)>/g, (match, attrs) => {
    return `<svg${attrs}><style>${fontCss}</style>`;
  });
}

function buildPrintHtml(svgMarkup, fontBase64) {
  const safeSvg = injectFontIntoSvg(svgMarkup || "", fontBase64);
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
    </style>
  </head>
  <body>
    ${safeSvg}
    <script>
      (function () {
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
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await win.loadURL(dataUrl);
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
    return { ok: true };
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
  const res = await withMainPrintMode(async (contents) => {
    const pdfData = await contents.printToPDF({ printBackground: true, marginsType: 0 });
    await fs.promises.writeFile(tmpPath, pdfData);
    return { ok: true, path: tmpPath };
  });
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
  return Math.min(3, Math.max(0.5, value));
}

function updateSettings(patch) {
  const next = { ...getDefaultSettings(), ...appState.settings, ...patch };
  next.renderZoom = clampZoom(Number(next.renderZoom));
  next.editorZoom = clampZoom(Number(next.editorZoom));
  next.editorFontSize = Math.min(32, Math.max(8, Number(next.editorFontSize) || 13));
  next.editorNotesBold = Boolean(next.editorNotesBold);
  next.editorLyricsBold = Boolean(next.editorLyricsBold);
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

function buildTunesFromContent(absPath, content) {
  const { lines, lineStarts } = splitLinesWithOffsets(content);
  const tunes = [];
  let currentStart = null;
  let tuneIndex = 0;
  const xRe = /^X:\s*\d+/;
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
    const xMatch = xLine.match(/^X:\s*(\d+)/);
    const xNumber = xMatch ? xMatch[1] : "";
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

  return { tunes, headerText, headerEndOffset };
}

async function parseSingleFile(filePath, sender) {
  let content = "";
  let stat = null;
  try {
    content = await fs.promises.readFile(filePath, "utf8");
    stat = await fs.promises.stat(filePath);
  } catch (e) {
    if (sender) {
      sender.send("library:progress", {
        phase: "parse",
        current: filePath,
        index: 1,
        total: 1,
        error: e && e.message ? e.message : String(e),
      });
    }
    return null;
  }
  const parsed = buildTunesFromContent(filePath, content);
  return {
    root: path.dirname(filePath),
    files: [
      {
        path: filePath,
        basename: path.basename(filePath),
        updatedAtMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
        headerText: parsed.headerText || "",
        headerEndOffset: parsed.headerEndOffset || 0,
        tunes: parsed.tunes,
      },
    ],
  };
}

async function scanLibrary(rootDir, sender) {
  const absRoot = path.resolve(rootDir);
  const stack = [absRoot];
  const abcFiles = [];
  let scannedDirs = 0;

  while (stack.length) {
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
    if (sender) {
      sender.send("library:progress", {
        phase: "discover",
        scannedDirs,
        filesFound: abcFiles.length,
      });
    }
  }

  abcFiles.sort((a, b) => a.localeCompare(b));
  const files = [];

  for (let i = 0; i < abcFiles.length; i += 1) {
    const filePath = abcFiles[i];
    let content = "";
    let stat = null;
    try {
      content = await fs.promises.readFile(filePath, "utf8");
      stat = await fs.promises.stat(filePath);
    } catch (e) {
      if (sender) {
        sender.send("library:progress", {
          phase: "parse",
          current: filePath,
          index: i + 1,
          total: abcFiles.length,
          error: e && e.message ? e.message : String(e),
        });
      }
      continue;
    }
    const parsed = buildTunesFromContent(filePath, content);
    files.push({
      path: filePath,
      basename: path.basename(filePath),
      updatedAtMs: stat && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
      headerText: parsed.headerText || "",
      headerEndOffset: parsed.headerEndOffset || 0,
      tunes: parsed.tunes,
    });
    if (sender) {
      sender.send("library:progress", {
        phase: "parse",
        current: filePath,
        index: i + 1,
        total: abcFiles.length,
        tuneCount: parsed.tunes.length,
      });
    }
  }

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
      sandbox: false, // <-- ВАЖНО: иначе preload без fs
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  mainWindow = win;
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.maximize();
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
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
  await migrateStatePaths();
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
  parseSingleFile,
  withMainPrintMode,
  printViaPdf,
  getDialogParent,
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
