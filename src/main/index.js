// main.js
const fs = require("fs");
const path = require("path");
const { fileURLToPath, pathToFileURL } = require("url");
const childProcess = require("child_process");
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, Menu, screen, protocol } = require("electron");
const { applyMenu } = require("./menu");
const { registerIpcHandlers } = require("./ipc");
const { createSoundfontProtocol, registerSoundfontScheme } = require("./soundfontProtocol");
const { resolveThirdPartyRoot } = require("./conversion");
const { getSettingsSchema, getDefaultSettings: getDefaultSettingsFromSchema } = require("./settings_schema");
const { normalizeMicrotonalSettings } = require("./settings_normalize");
const { parseSettingsPatchFromProperties } = require("./properties");
const {
  PORTABLE_MARKER_FILE,
  migrateLegacyGlobalHeader,
  resolveGlobalHeaderPath,
} = require("./global_header_store");
const { decodeAbcTextFromBuffer, detectAbcTextEncodingFromText } = require("./abcCharset");
const { extractTuneHeader } = require("./library_metadata");
const { normalizeAllowedExternalUrl } = require("./url_security");
const {
  printPageBodyPadding,
  printPageMarginsUseChromiumDefaults,
} = require("./print_layout");
const {
  composeStateDocument,
  loadProfileDocument,
  saveStateDocument,
  splitStateDocument,
} = require("./state_store");

registerSoundfontScheme(protocol);
const soundfontProtocol = createSoundfontProtocol({ protocol, fs, path });

let mainWindow = null;
let splashWindow = null;
let splashPendingStatus = "Starting…";
let splashShownAtMs = 0;
let isQuitting = false;
let quitPromise = null;
let startupSplashMinVisibleMs = 3000;
let pendingCliOpenFile = "";
let singleInstanceOpenRequestedBeforeReady = false;

const DEFAULT_MAIN_WINDOW_BOUNDS = {
  width: 1200,
  height: 800,
};

const STARTUP_PERF_ENABLED = process.env.ABCARUS_DEV_STARTUP_PERF === "1";
const UI_SMOKE_ENABLED = process.env.ABCARUS_DEV_UI_SMOKE === "1";
const DEV_NO_CACHE_ENABLED = process.env.ABCARUS_DEV_NO_CACHE !== "0";
const PRINT_CAPTURE_ENABLED = process.env.ABCARUS_DEBUG_PRINT_CAPTURE === "1";
const DEV_SOUNDFONT_PATH = UI_SMOKE_ENABLED
  ? String(process.env.ABCARUS_DEV_SOUNDFONT_PATH || "").trim()
  : "";
const DEV_USER_DATA_PATH = UI_SMOKE_ENABLED
  ? String(process.env.ABCARUS_DEV_USER_DATA || "").trim()
  : "";
if (DEV_USER_DATA_PATH) app.setPath("userData", path.resolve(DEV_USER_DATA_PATH));
function withDevSoundfont(settings) {
  const smokeSettings = UI_SMOKE_ENABLED
    ? { ...settings, disclaimerSeen: true }
    : settings;
  if (!DEV_SOUNDFONT_PATH) return smokeSettings;
  return {
    ...smokeSettings,
    soundfontName: DEV_SOUNDFONT_PATH,
    soundfontPaths: Array.from(new Set([
      ...(Array.isArray(settings.soundfontPaths) ? settings.soundfontPaths : []),
      DEV_SOUNDFONT_PATH,
    ])),
  };
}
const STARTUP_T0_MS = Date.now();
function logStartupPerf(label, data) {
  if (!STARTUP_PERF_ENABLED) return;
  try {
    const ms = Date.now() - STARTUP_T0_MS;
    // eslint-disable-next-line no-console
    console.log(`[startup] +${ms}ms ${label}`, data || "");
  } catch {}
}
const appState = {
  lastFolder: null,
  lastDialogDir: null,
  dialogPreferences: {},
  recentTunes: [],
  recentFiles: [],
  recentFolders: [],
  settings: null,
  globalHeaderMigrationVersion: 0,
  debugFlags: {
    showMessages: false,
    autoDump: false,
  },
  windowState: {
    bounds: null,
    isMaximized: false,
    isFullScreen: false,
  },
};
let stateDocumentExtras = {};
let stateRecoveredFromBackup = false;
let stateSaveQueue = Promise.resolve();

function parseCliOptions(argv) {
  let args = Array.isArray(argv) ? argv.slice(1) : [];
  const isLikelyElectronLauncherArg = (value) => {
    const raw = String(value || "").trim();
    if (!raw || raw.startsWith("-")) return false;
    if (raw === ".") return true;
    const normalized = raw.replace(/\\/g, "/").toLowerCase();
    const base = path.posix.basename(normalized);
    if (base === "electron" || base === "electron.exe") return true;
    return (
      normalized.endsWith(".asar")
      || normalized.endsWith(".js")
      || normalized.endsWith(".cjs")
      || normalized.endsWith(".mjs")
    );
  };
  // Electron dev runs often pass an app launcher path after the executable
  // (e.g. ".", "src/main/index.js", "app.asar"). Drop only that known pattern.
  if (args.length) {
    const first = args[0];
    if (isLikelyElectronLauncherArg(first)) args = args.slice(1);
  }
  let inputPath = "";
  let showVersion = false;
  let factorySettings = false;
  let enableLog = false;
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i] || "").trim();
    if (!a) continue;
    const lower = a.toLowerCase();
    if (lower === "--version" || lower === "-version") {
      showVersion = true;
      continue;
    }
    if (lower === "--factorysettings" || lower === "-factorysettings") {
      factorySettings = true;
      continue;
    }
    if (lower === "--log" || lower === "-log") {
      enableLog = true;
      continue;
    }
    if (lower === "--input" || lower === "-input") {
      const next = String(args[i + 1] || "").trim();
      if (next && !next.startsWith("-")) {
        inputPath = next;
        i += 1;
      }
      continue;
    }
    if (!a.startsWith("-")) positionals.push(a);
  }
  if (!inputPath && positionals.length) inputPath = positionals[positionals.length - 1];
  return { inputPath, showVersion, factorySettings, enableLog };
}
const CLI_OPTIONS = parseCliOptions(process.argv);

function queueOrOpenCliInputPath(rawPath) {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return false;
  let resolved = trimmed;
  if (/^file:\/\//i.test(resolved)) {
    try { resolved = fileURLToPath(resolved); } catch {}
  }
  const abs = path.resolve(resolved);
  pendingCliOpenFile = abs;
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
  } catch {}
  try { mainWindow.show(); } catch {}
  try { mainWindow.focus(); } catch {}
  try {
    sendMenuAction({
      type: "openRecentFile",
      entry: {
        path: abs,
        basename: path.basename(abs),
        forceReload: true,
      },
    });
    pendingCliOpenFile = "";
    return true;
  } catch {}
  return false;
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  const opts = parseCliOptions(Array.isArray(argv) ? argv : []);
  if (opts && opts.inputPath) {
    const opened = queueOrOpenCliInputPath(opts.inputPath);
    if (!opened) singleInstanceOpenRequestedBeforeReady = true;
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (mainWindow.isMinimized()) mainWindow.restore();
    } catch {}
    try { mainWindow.show(); } catch {}
    try { mainWindow.focus(); } catch {}
  }
});

async function resetFactoryStateOnDisk() {
  try {
    await fs.promises.rm(getProfilePath(), { force: true });
    await fs.promises.rm(`${getProfilePath()}.bak`, { force: true });
    await fs.promises.rm(getLegacyStatePath(), { force: true });
    await fs.promises.rm(`${getLegacyStatePath()}.bak`, { force: true });
  } catch {}
  try {
    const settingsPaths = getSettingsPaths();
    await fs.promises.rm(settingsPaths.userPath, { force: true });
  } catch {}
}

function normalizeWindowState(raw) {
  const out = {
    bounds: null,
    isMaximized: false,
    isFullScreen: false,
  };
  if (!raw || typeof raw !== "object") return out;
  const b = raw.bounds && typeof raw.bounds === "object" ? raw.bounds : null;
  if (b) {
    const x = Number(b.x);
    const y = Number(b.y);
    const width = Number(b.width);
    const height = Number(b.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width >= 500 && height >= 350) {
      out.bounds = {
        x: Number.isFinite(x) ? Math.round(x) : undefined,
        y: Number.isFinite(y) ? Math.round(y) : undefined,
        width: Math.round(width),
        height: Math.round(height),
      };
    }
  }
  out.isMaximized = Boolean(raw.isMaximized);
  out.isFullScreen = Boolean(raw.isFullScreen);
  return out;
}

function installSessionLogger(logPath) {
  if (!logPath) return;
  try {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  const writeLine = (level, parts) => {
    try {
      const ts = new Date().toISOString();
      const msg = parts.map((p) => {
        if (typeof p === "string") return p;
        try { return JSON.stringify(p); } catch { return String(p); }
      }).join(" ");
      fs.appendFileSync(logPath, `[${ts}] [${level}] ${msg}\n`, "utf8");
    } catch {}
  };
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origErr = console.error.bind(console);
  console.log = (...parts) => { writeLine("INFO", parts); origLog(...parts); };
  console.warn = (...parts) => { writeLine("WARN", parts); origWarn(...parts); };
  console.error = (...parts) => { writeLine("ERROR", parts); origErr(...parts); };
  writeLine("INFO", [`Session logger enabled: ${logPath}`]);
}

// Optional Linux portal file chooser, controlled via:
// - env: `ABCARUS_USE_PORTAL=1` (preferred, effective immediately)
// - setting: `usePortalFileDialogs` (best-effort; may depend on GTK/Electron behavior)
if (process.platform === "linux" && process.env.ABCARUS_USE_PORTAL === "1") {
  process.env.GTK_USE_PORTAL = "1";
}

function resolveAppIconPath() {
  const appRoot = app.getAppPath();
  if (process.platform === "win32") {
    return path.join(appRoot, "assets", "icons", "abcarus.ico");
  }
  return path.join(appRoot, "assets", "icons", "abcarus_256.png");
}

function detectLinuxPrefersDarkTheme() {
  // Best-effort heuristic for Linux desktops where Electron may not reliably reflect GTK theme darkness.
  // Returns true/false, or null if unknown.
  const envTheme = String(process.env.GTK_THEME || "").toLowerCase();
  if (envTheme) {
    if (envTheme.includes("dark")) return true;
    if (envTheme.includes("light")) return false;
  }

  try {
    const raw = childProcess.execFileSync("gsettings", ["get", "org.gnome.desktop.interface", "color-scheme"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    // e.g. "'prefer-dark'" / "'default'"
    if (raw && raw.toLowerCase().includes("prefer-dark")) return true;
    if (raw && raw.toLowerCase().includes("default")) return false;
  } catch {}

  // Cinnamon usually encodes darkness in the GTK theme name, e.g. "Mint-Y-Dark".
  try {
    const raw = childProcess.execFileSync("gsettings", ["get", "org.cinnamon.desktop.interface", "gtk-theme"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (raw && raw.toLowerCase().includes("dark")) return true;
  } catch {}

  return null;
}

function resolveWindowIconPath() {
  const appRoot = app.getAppPath();
  // On Linux, the window icon must remain visible against both light/dark titlebar themes.
  // Prefer the regular app icon for consistency across launchers/panels/taskbars.
  // When needed, allow forcing a flat monochrome silhouette via `ABCARUS_LINUX_WINDOW_ICON_VARIANT=dark|light`.
  if (process.platform === "linux") {
    const forced = String(process.env.ABCARUS_LINUX_WINDOW_ICON_VARIANT || "").trim().toLowerCase();
    if (forced !== "dark" && forced !== "light") {
      return resolveAppIconPath();
    }
    const detected = detectLinuxPrefersDarkTheme();
    // Linux desktop environments vary widely, and Electron's `nativeTheme` is not always reliable
    // (especially for titlebar theme darkness). To avoid an invisible titlebar icon, default to
    // the "dark" (gold) icon unless explicitly forced to "light".
    let shouldUseDark;
    if (forced === "light") shouldUseDark = false;
    else if (forced === "dark") shouldUseDark = true;
    else if (detected === true) shouldUseDark = true;
    else if (detected === false) shouldUseDark = false;
    else shouldUseDark = Boolean(nativeTheme.shouldUseDarkColors);
    const candidate = shouldUseDark
      ? path.join(appRoot, "assets", "icons", "abcarus_window_dark.png")
      : path.join(appRoot, "assets", "icons", "abcarus_window_light.png");
    if (process.env.ABCARUS_DEBUG_THEME === "1") {
      try {
        // eslint-disable-next-line no-console
        console.log(
          "[theme] nativeTheme.shouldUseDarkColors=%s detected=%s forced=%s icon=%s",
          nativeTheme.shouldUseDarkColors,
          detected,
          forced || "(none)",
          path.basename(candidate)
        );
      } catch {}
    }
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return resolveAppIconPath();
}

function escapeForInlineHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSplashLogoDataUrl() {
  try {
    const logoPath = path.join(app.getAppPath(), "assets", "icons", "abcarus_256.png");
    const b64 = fs.readFileSync(logoPath).toString("base64");
    if (!b64) return "";
    return `data:image/png;base64,${b64}`;
  } catch {
    return "";
  }
}

function createSplashWindow() {
  if (startupSplashMinVisibleMs <= 0) return null;
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;
  const logoUrl = getSplashLogoDataUrl();
  const logoMarkup = logoUrl
    ? `<img class="logo" src="${escapeForInlineHtml(logoUrl)}" alt="" />`
    : "";
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ABCarus</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #f3f4f6;
      color: #1f2937;
      display: grid;
      place-items: center;
    }
    .wrap { text-align: center; user-select: none; }
    .logo { width: 88px; height: 88px; object-fit: contain; margin-bottom: 14px; }
    .title { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
    .status { font-size: 13px; color: #4b5563; min-height: 20px; }
  </style>
</head>
<body>
  <div class="wrap">
    ${logoMarkup}
    <div class="title">ABCarus</div>
    <div id="status" class="status">Starting…</div>
  </div>
</body>
</html>`;

  splashWindow = new BrowserWindow({
    width: 360,
    height: 250,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: "#f3f4f6",
    icon: resolveWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashWindow.once("closed", () => { splashWindow = null; });
  splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`).catch(() => {});
  splashWindow.once("ready-to-show", () => {
    splashShownAtMs = Date.now();
    try { splashWindow.show(); } catch {}
  });
  return splashWindow;
}

function updateSplashStatus(text) {
  splashPendingStatus = String(text || "Starting…");
  const win = splashWindow;
  if (!win || win.isDestroyed()) return;
  const safe = JSON.stringify(splashPendingStatus);
  win.webContents.executeJavaScript(
    `(() => {
      const el = document.getElementById("status");
      if (el) el.textContent = ${safe};
    })();`,
    true
  ).catch(() => {});
}

function closeSplashWindow() {
  const win = splashWindow;
  splashWindow = null;
  if (!win || win.isDestroyed()) return;
  const minVisible = Math.max(0, Number(startupSplashMinVisibleMs) || 0);
  const shownAt = Number(splashShownAtMs) || 0;
  splashShownAtMs = 0;
  const elapsed = shownAt > 0 ? (Date.now() - shownAt) : minVisible;
  const waitMs = Math.max(0, minVisible - elapsed);
  if (waitMs > 0) {
    setTimeout(() => {
      try { if (!win.isDestroyed()) win.close(); } catch {}
    }, waitMs);
    return;
  }
  try { win.close(); } catch {}
}

function getDefaultSettings() {
  // Source of truth: `src/main/settings_schema.js`.
  return getDefaultSettingsFromSchema();
}

function getLegacyStatePath() {
  return path.join(app.getPath("userData"), "state.json");
}

function getProfilePath() {
  return getSettingsPaths().profilePath;
}

async function removeLegacyStateFiles() {
  await Promise.all([
    fs.promises.rm(getLegacyStatePath(), { force: true }),
    fs.promises.rm(`${getLegacyStatePath()}.bak`, { force: true }),
  ]);
}

function readStartupSplashSecondsPreferenceSync() {
  try {
    let raw = "";
    try {
      raw = fs.readFileSync(getProfilePath(), "utf8");
    } catch {
      raw = fs.readFileSync(getLegacyStatePath(), "utf8");
    }
    const data = JSON.parse(raw);
    const settings = data && data.settings ? data.settings : null;
    const secsRaw = settings ? settings.startupSplashSeconds : undefined;
    const secs = Number(secsRaw);
    if (Number.isFinite(secs)) return Math.max(0, Math.min(30, secs));
    // Backward compatibility: old boolean setting.
    if (settings && typeof settings.startupSplashEnabled === "boolean") {
      return settings.startupSplashEnabled ? 3 : 0;
    }
  } catch {}
  return 0;
}

function getSettingsPaths() {
  const executablePath = String(process.execPath || "");
  const portableMarkerPath = executablePath
    ? path.join(path.dirname(executablePath), PORTABLE_MARKER_FILE)
    : "";
  const userPath = resolveGlobalHeaderPath({
    path,
    userDataPath: app.getPath("userData"),
    executablePath,
    portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR || process.env.ABCARUS_PORTABLE_DIR || "",
    portableMarkerPresent: Boolean(portableMarkerPath && fs.existsSync(portableMarkerPath)),
  });
  return {
    globalPath: path.join(app.getAppPath(), "assets", "global_settings.abc"),
    userPath,
    profilePath: path.join(path.dirname(userPath), "abcarus-profile.json"),
  };
}

async function migrateLegacyGlobalHeaderAtStartup() {
  const previousVersion = appState.globalHeaderMigrationVersion;
  try {
    const result = await migrateLegacyGlobalHeader({
      fs,
      path,
      headerPath: getSettingsPaths().userPath,
      legacyText: appState.settings && appState.settings.globalHeaderText,
      migrationVersion: appState.globalHeaderMigrationVersion,
    });
    appState.globalHeaderMigrationVersion = result.migrationVersion;
    if (appState.globalHeaderMigrationVersion !== previousVersion) await saveState();
  } catch (error) {
    console.warn("Unable to migrate legacy Global Header; the legacy value remains available for a later retry.", error);
  }
}

async function readLegacyAttachedSettings(state) {
  const base = state && state.settings && typeof state.settings === "object" ? state.settings : null;
  const legacyFile = state && state.settingsFile && state.settingsFile.mode === "file"
    ? String(state.settingsFile.path || "")
    : "";
  if (!legacyFile) return base;
  try {
    const raw = await fs.promises.readFile(legacyFile, "utf8");
    const patch = parseSettingsPatchFromProperties(raw, getSettingsSchema());
    return { ...(base || {}), ...(patch || {}) };
  } catch {
    return base;
  }
}

async function loadState() {
  const loaded = await loadProfileDocument({
    fs,
    profilePath: getProfilePath(),
    legacyStatePath: getLegacyStatePath(),
  });
  const loadedLegacyState = Boolean(loaded.legacy && loaded.data);
  const data = loaded.data;
  if (data) {
    const { known, extras } = splitStateDocument(data);
    stateDocumentExtras = extras;
    stateRecoveredFromBackup = loaded.recovered;
    if (loaded.recovered) {
      console.warn("Recovered application state from backup after the primary state file could not be read.");
    }
    const state = known;
    const persistedSettings = await readLegacyAttachedSettings(state);
    appState.lastFolder = state.lastFolder || null;
    appState.lastDialogDir = state.lastDialogDir || state.lastDialogPath || null;
    appState.dialogPreferences = state.dialogPreferences && typeof state.dialogPreferences === "object" && !Array.isArray(state.dialogPreferences)
      ? state.dialogPreferences
      : {};
    appState.recentTunes = Array.isArray(state.recentTunes) ? state.recentTunes : [];
    appState.recentFiles = Array.isArray(state.recentFiles) ? state.recentFiles : [];
    appState.recentFolders = Array.isArray(state.recentFolders) ? state.recentFolders : [];
    appState.globalHeaderMigrationVersion = Number(state.globalHeaderMigrationVersion) || 0;
    if (persistedSettings && typeof persistedSettings === "object") {
      const merged = { ...getDefaultSettings(), ...persistedSettings };
      if (persistedSettings.zoomFactor && !persistedSettings.renderZoom && !persistedSettings.editorZoom) {
        merged.renderZoom = persistedSettings.zoomFactor;
        merged.editorZoom = persistedSettings.zoomFactor;
      }
      // Default portal dialogs ON for Linux unless explicitly set by the user.
      if (process.platform === "linux" && merged.usePortalFileDialogsSetByUser !== true) {
        merged.usePortalFileDialogs = true;
      }
      // Errors feature is intentionally session-only and defaults to off.
      merged.errorsEnabled = false;
      // Per-split zoom migration: keep old single zoom for both orientations.
      if (!Object.prototype.hasOwnProperty.call(persistedSettings, "layoutRenderZoomVertical")) {
        merged.layoutRenderZoomVertical = merged.renderZoom;
      }
      if (!Object.prototype.hasOwnProperty.call(persistedSettings, "layoutRenderZoomHorizontal")) {
        merged.layoutRenderZoomHorizontal = merged.renderZoom;
      }
      // Migration: old builds defaulted MIDI import backend to bundled midi2abc.
      // If the backend was never explicitly chosen, move to auto mode.
      if (!Object.prototype.hasOwnProperty.call(persistedSettings, "midiImportBackendSetByUser")) {
        if (String(merged.midiImportBackend || "").trim() === "midi2abc") {
          merged.midiImportBackend = "auto";
        }
      }
      appState.settings = merged;
    } else {
      appState.settings = getDefaultSettings();
    }
    appState.windowState = normalizeWindowState(state.windowState);
  }
  if (!appState.settings) appState.settings = getDefaultSettings();
  if (!appState.windowState) appState.windowState = normalizeWindowState(null);
  await migrateLegacyGlobalHeaderAtStartup();
  if (loadedLegacyState) {
    const migrated = await saveState();
    if (migrated) await removeLegacyStateFiles();
  } else if (data) {
    // Migration is one-way. A stale state.json must never become authoritative
    // again if the canonical profile is later removed or damaged.
    await removeLegacyStateFiles();
  }
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

async function clearDevRuntimeCaches() {
  if (app.isPackaged || !DEV_NO_CACHE_ENABLED) return;
  const userData = app.getPath("userData");
  if (!userData) return;
  const candidates = [
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnCache",
    "blob_storage",
    "Service Worker",
  ];
  for (const name of candidates) {
    const target = path.join(userData, name);
    try {
      await fs.promises.rm(target, { recursive: true, force: true });
    } catch {}
  }
}

async function migrateStatePaths() {
  const validLastFolder = await pathExists(appState.lastFolder);
  if (!validLastFolder) appState.lastFolder = null;
  const validLastDialogDir = await pathExists(appState.lastDialogDir);
  if (!validLastDialogDir) {
    appState.lastDialogDir = null;
  } else {
    try {
      const st = await fs.promises.stat(appState.lastDialogDir);
      if (st && st.isFile()) appState.lastDialogDir = path.dirname(appState.lastDialogDir);
    } catch {
      appState.lastDialogDir = null;
    }
  }

  for (const preference of Object.values(appState.dialogPreferences)) {
    if (!preference || typeof preference !== "object") continue;
    const dir = typeof preference.dir === "string" ? preference.dir : "";
    if (!dir || !(await pathExists(dir))) {
      delete preference.dir;
      continue;
    }
    try {
      const st = await fs.promises.stat(dir);
      if (st && st.isFile()) delete preference.dir;
    } catch {
      delete preference.dir;
    }
    if (preference.file) {
      try {
        const fileStat = await fs.promises.stat(String(preference.file));
        if (!fileStat.isFile()) delete preference.file;
      } catch {
        delete preference.file;
      }
    }
  }

  // Do not destructively prune recents during startup. Files or folders may be
  // temporarily unavailable, externally deleted, or opened through file
  // association. Keeping the remembered paths is safer than replacing the
  // user's navigation history with an empty state.
  appState.recentFolders = Array.isArray(appState.recentFolders)
    ? appState.recentFolders.filter((entry) => entry && entry.path)
    : [];
  appState.recentFiles = Array.isArray(appState.recentFiles)
    ? appState.recentFiles.filter((entry) => entry && entry.path)
    : [];
  appState.recentTunes = Array.isArray(appState.recentTunes)
    ? appState.recentTunes.filter((entry) => entry && entry.path)
    : [];

  await saveState();
}

async function persistState() {
  try {
    const payload = buildProfileDocument();
    await saveStateDocument({
      fs,
      path,
      filePath: getProfilePath(),
      data: payload,
      skipBackup: stateRecoveredFromBackup,
    });
    stateRecoveredFromBackup = false;
  } catch (error) {
    console.error("Unable to persist application state:", error && error.message ? error.message : error);
    return false;
  }
  return true;
}

function buildProfileDocument() {
  const settings = { ...(appState.settings || getDefaultSettings()) };
  delete settings.globalHeaderText;
  return composeStateDocument(
    {
      lastFolder: appState.lastFolder,
      lastDialogDir: appState.lastDialogDir,
      dialogPreferences: appState.dialogPreferences,
      recentTunes: appState.recentTunes,
      recentFiles: appState.recentFiles,
      recentFolders: appState.recentFolders,
      settings,
      globalHeaderMigrationVersion: appState.globalHeaderMigrationVersion,
      windowState: appState.windowState,
    },
    stateDocumentExtras,
  );
}

function saveState() {
  const next = stateSaveQueue.then(() => persistState());
  stateSaveQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function captureWindowState(win) {
  if (!win || win.isDestroyed()) return;
  let bounds = null;
  let isMaximized = false;
  let isFullScreen = false;
  try { isMaximized = win.isMaximized(); } catch {}
  try { isFullScreen = win.isFullScreen(); } catch {}
  try {
    if ((isMaximized || isFullScreen) && typeof win.getNormalBounds === "function") {
      bounds = win.getNormalBounds();
    } else {
      bounds = win.getBounds();
    }
  } catch {}
  const normalized = normalizeWindowState({ bounds, isMaximized, isFullScreen });
  appState.windowState = normalized;
  saveState();
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

function getDialogDefaultPath({
  dialogId,
  suggestedName,
  suggestedDir,
  suggestedPath,
  directoryOnly,
  preferFileNameOnPortal = false,
  useSharedFallback = true,
} = {}) {
  const normalizeFsPath = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^file:\/\//i.test(raw)) {
      try { return fileURLToPath(raw); } catch { return ""; }
    }
    return raw;
  };
  const existingDirectory = (value) => {
    const candidate = normalizeFsPath(value);
    if (!candidate) return "";
    try {
      return fs.statSync(candidate).isDirectory() ? candidate : "";
    } catch {
      return "";
    }
  };
  const scopedPreference = dialogId && appState.dialogPreferences && appState.dialogPreferences[dialogId];
  const scopedDir = existingDirectory(scopedPreference && scopedPreference.dir);
  const scopedFile = (() => {
    const candidate = normalizeFsPath(scopedPreference && scopedPreference.file);
    try { return candidate && fs.statSync(candidate).isFile() ? candidate : ""; } catch { return ""; }
  })();
  const rememberedDir = scopedDir || (useSharedFallback ? existingDirectory(appState.lastDialogDir) : "");
  const explicitDir = normalizeFsPath(suggestedDir);
  const explicitPath = normalizeFsPath(suggestedPath);
  const explicitPathAbs = explicitPath && path.isAbsolute(explicitPath) ? explicitPath : "";
  const explicitPathDir = explicitPathAbs ? path.dirname(explicitPathAbs) : "";
  const explicitPathBase = explicitPathAbs ? path.basename(explicitPathAbs) : "";

  let fallbackDir = "";
  try {
    fallbackDir = existingDirectory(app.getPath("documents")) || existingDirectory(app.getPath("home"));
  } catch {}
  const baseDir = rememberedDir || explicitDir || existingDirectory(explicitPathDir) || fallbackDir;
  const portalLikelyActive = (
    process.platform === "linux"
    && (process.env.ABCARUS_USE_PORTAL === "1" || (appState.settings && appState.settings.usePortalFileDialogs))
  );
  if (directoryOnly) return baseDir || undefined;

  const fileName = String(suggestedName || "").trim() || explicitPathBase;
  if (!fileName && scopedFile) return scopedFile;
  // Linux portal dialogs often ignore defaultPath when a filename is included.
  // Prefer a directory default there to keep navigation stable.
  if (portalLikelyActive && baseDir && !preferFileNameOnPortal) return baseDir;
  if (baseDir && fileName) return path.join(baseDir, fileName);
  if (baseDir) return baseDir;
  if (explicitPathAbs) return explicitPathAbs;
  return fileName || undefined;
}

function getDialogFilterIndex(dialogId, filterCount, fallback = 0) {
  const raw = appState.dialogPreferences && appState.dialogPreferences[dialogId]
    ? appState.dialogPreferences[dialogId].filterIndex
    : undefined;
  const index = Number(raw);
  if (Number.isInteger(index) && index >= 0 && index < filterCount) return index;
  return fallback;
}

function orderDialogFilters(filters, preferredIndex) {
  if (!Array.isArray(filters) || !filters.length) return filters;
  const index = Number(preferredIndex);
  const indices = filters.map((_filter, originalIndex) => originalIndex);
  if (Number.isInteger(index) && index >= 0 && index < filters.length && index !== 0) {
    indices.unshift(indices.splice(index, 1)[0]);
  }
  return indices.map((originalIndex) => ({
    ...filters[originalIndex],
    __abcarusOriginalIndex: originalIndex,
  }));
}

function getDialogOriginalFilterIndex(filters, displayedIndex) {
  const filter = Array.isArray(filters) ? filters[Number(displayedIndex)] : null;
  const originalIndex = filter && Number(filter.__abcarusOriginalIndex);
  return Number.isInteger(originalIndex) ? originalIndex : Number(displayedIndex);
}

function rememberDialogSelection(selectedPath, { isDirectory = false, dialogId = "", filterIndex } = {}) {
  const raw = String(selectedPath || "").trim();
  if (!raw) return;
  let resolved = raw;
  if (/^file:\/\//i.test(resolved)) {
    try { resolved = fileURLToPath(resolved); } catch { return; }
  }
  const nextDir = isDirectory ? resolved : path.dirname(resolved);
  if (!nextDir) return;
  appState.lastDialogDir = nextDir;
  if (dialogId) {
    const previous = appState.dialogPreferences[dialogId];
    const next = previous && typeof previous === "object" && !Array.isArray(previous) ? { ...previous } : {};
    next.dir = nextDir;
    if (!isDirectory) next.file = resolved;
    if (Number.isInteger(Number(filterIndex))) next.filterIndex = Number(filterIndex);
    appState.dialogPreferences[dialogId] = next;
  }
  saveState().catch(() => {});
}

function showOpenDialog(senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "open-file");
  const filters = orderDialogFilters([
    { name: "ABC", extensions: ["abc"] },
    { name: "ChordPro", extensions: ["cho", "crd", "chopro", "chordpro", "chord", "pro"] },
    { name: "All Files", extensions: ["*"] },
  ], getDialogFilterIndex("openFile", 3));
  return dialog.showOpenDialog(parent || undefined, {
    modal: true,
    properties: ["openFile"],
    defaultPath: getDialogDefaultPath({ dialogId: "openFile" }),
    filters,
  }).then((result) => {
    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return null;
    const selected = result.filePaths[0];
    rememberDialogSelection(selected, { dialogId: "openFile", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });
    return selected;
  });
}

function showOpenFolderDialog(senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "open-folder");
  return dialog.showOpenDialog(parent || undefined, {
    modal: true,
    properties: ["openDirectory"],
    defaultPath: getDialogDefaultPath({
      dialogId: "openFolder",
      suggestedPath: appState.lastFolder || "",
      directoryOnly: true,
    }),
  }).then((result) => {
    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return null;
    const selected = result.filePaths[0];
    appState.lastFolder = selected;
    rememberDialogSelection(selected, { isDirectory: true, dialogId: "openFolder" });
    return selected;
  });
}

function showSaveDialog(suggestedName, suggestedDir, senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "save-file");
  const defaultName = suggestedName || "Untitled.abc";
  const defaultPath = getDialogDefaultPath({
    dialogId: "saveFile",
    suggestedName: defaultName,
    suggestedDir,
    preferFileNameOnPortal: true,
  });
  const ext = path.extname(defaultName || "").replace(/^\./, "").trim().toLowerCase();
  const filters = (() => {
    if (ext === "json") {
      return [
        { name: "JSON", extensions: ["json"] },
        { name: "ABC", extensions: ["abc"] },
        { name: "All Files", extensions: ["*"] },
      ];
    }
    return [
      { name: "ABC", extensions: ["abc"] },
      { name: "All Files", extensions: ["*"] },
    ];
  })();
  const orderedFilters = orderDialogFilters(filters, getDialogFilterIndex("saveFile", filters.length));
  return dialog.showSaveDialog(parent || undefined, {
    modal: true,
    title: "Save As",
    defaultPath,
    filters: orderedFilters,
  }).then((result) => {
    if (!result || result.canceled) return null;
    const filePath = result.filePath || null;
    if (filePath) rememberDialogSelection(filePath, { dialogId: "saveFile", filterIndex: getDialogOriginalFilterIndex(orderedFilters, result.filterIndex) });
    return filePath;
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

async function confirmAppendToFile(filePath, tuneLabel) {
  if (appState && appState.settings && appState.settings.confirmAppendToActiveFile === false) {
    return "append";
  }
  const parent = prepareDialogParent(null, "confirm-append-to-file");
  const label = String(tuneLabel || "").trim();
  const res = await dialog.showMessageBox(parent || undefined, {
    type: "question",
    buttons: ["Append", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    message: "Append tune?",
    detail: label
      ? `Append “${label}” to the active file “${path.basename(filePath)}”?`
      : `Append to the active file “${path.basename(filePath)}”?`,
    checkboxLabel: "Do not show again",
    checkboxChecked: false,
  });
  const response = res && typeof res.response === "number" ? res.response : 1;
  const doNotShowAgain = Boolean(res && res.checkboxChecked);
  if (response === 0) {
    if (doNotShowAgain) {
      try { updateSettings({ confirmAppendToActiveFile: false }); } catch {}
    }
    return "append";
  }
  return "cancel";
}

function confirmImportMusicXmlTarget(filePath, senderOrEvent) {
  const parent = prepareDialogParent(senderOrEvent, "confirm-import-musicxml-target");
  const hasTarget = Boolean(filePath);
  const buttons = hasTarget ? ["This file", "New file…", "Cancel"] : ["New file…", "Cancel"];
  const cancelId = buttons.length - 1;
  const response = dialog.showMessageBoxSync(parent || undefined, {
    type: "question",
    buttons,
    defaultId: 0,
    cancelId,
    message: "Import MusicXML",
    detail: hasTarget
      ? `Import into “${path.basename(filePath)}”?`
      : "Create a new .abc file to import into.",
  });
  if (hasTarget) {
    if (response === 0) return "this_file";
    if (response === 1) return "new_file";
    return "cancel";
  }
  if (response === 0) return "new_file";
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

function showTransformError(message) {
  const parent = prepareDialogParent(null, "transform-error");
  dialog.showMessageBoxSync(parent || undefined, {
    type: "error",
    buttons: ["OK"],
    message: "Unable to transform notation.",
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
  // Keep user-selected/custom music fonts embedded by abc2svg.
  // Inject fallback only when no "music" font-face is present.
  const hasMusicFontFace = /@font-face[\s\S]*?font-family\s*:\s*["']?music["']?/i.test(raw);
  if (hasMusicFontFace) return raw;
  const fontCss = `@font-face {
  font-family: "music";
  src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
  font-weight: normal;
  font-style: normal;
}
.f3 { font-family: "music" !important; }`;
  return raw.replace(/<svg\\b([^>]*)>/g, (match, attrs) => {
    return `<svg${attrs}><style>${fontCss}</style>`;
  });
}

function normalizeSvgFontUrlsForPrint(svgMarkup) {
  const raw = String(svgMarkup || "");
  if (!raw) return raw;
  const notationDir = path.join(app.getAppPath(), "assets", "fonts", "notation");
  // Rewrite bundled relative font URLs to absolute file:// URLs so temp print HTML can resolve them.
  return raw.replace(/url\((['"]?)(\.\.\/\.\.\/assets\/fonts\/notation\/([^)'"]+))\1\)/gi, (_m, quote, _fullRel, filePart) => {
    const originalName = String(filePart || "").trim();
    if (!originalName) return _m;
    const decodeName = (value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    let fileName = decodeName(originalName);
    // Backward-compat with historical values like bundled:Leland.otf or user:*.otf leaked into bundled URL.
    fileName = fileName.replace(/^(bundled|user):/i, "");
    if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return _m;
    const absPath = path.join(notationDir, fileName);
    if (!fs.existsSync(absPath)) return _m;
    const absUrl = pathToFileURL(absPath).href;
    const q = quote || '"';
    return `url(${q}${absUrl}${q})`;
  });
}

function sanitizePrintFileBaseName(value, fallback = "tune") {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\p{Control}+/gu, " ")
    .replace(/[. ]+$/g, "")
    .replace(/^[. ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 120);
}

function escapeHtmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPrintHtml(svgMarkup, fontBase64, suggestedName) {
  const rawMarkup = String(svgMarkup || "");
  const normalizedMarkup = normalizeSvgFontUrlsForPrint(rawMarkup);
  const safeSvg = injectFontIntoSvg(normalizedMarkup, fontBase64);
  const forceRaster = rawMarkup.includes("<!--abcarus:force-raster-->");
  const skipRaster = rawMarkup.includes("<!--abcarus:no-raster-->") || !forceRaster;
  const skipNormalizeSvgBounds = rawMarkup.includes("<!--abcarus:no-normalize-svg-bounds-->");
  const title = sanitizePrintFileBaseName(suggestedName, "Print");
  const pageBodyPadding = printPageBodyPadding(rawMarkup);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtmlText(title)}</title>
    <style>
      html, body { margin: 0; padding: 0; }
      body { padding: ${pageBodyPadding}; font-family: sans-serif; }
      svg { max-width: 100%; height: auto; display: block; overflow: visible; }
      img { max-width: 100%; height: auto; display: block; }
      .nobrk { page-break-inside: avoid; break-inside: avoid; }
      .newpage { page-break-before: always; break-before: page; }
      .newpage:first-of-type { page-break-before: auto; break-before: auto; }
      .print-tune { page-break-after: always; break-after: page; overflow: visible; }
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
        var skipNormalizeSvgBounds = ${skipNormalizeSvgBounds ? "true" : "false"};
        function waitForFonts() {
          if (!document.fonts || !document.fonts.load) return Promise.resolve();
          return Promise.all([
            document.fonts.load('12px "music"').catch(function () { return null; }),
            document.fonts.ready.catch(function () { return null; }),
          ]);
        }
        function normalizeSvgBounds() {
          const svgs = Array.from(document.querySelectorAll("svg"));
          for (const svg of svgs) {
            try {
              if (!svg || !svg.getBBox) continue;
              const bbox = svg.getBBox();
              if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) continue;
              const vb = svg.viewBox && svg.viewBox.baseVal;
              const curX = vb ? Number(vb.x) || 0 : 0;
              const curY = vb ? Number(vb.y) || 0 : 0;
              const curW = vb && Number(vb.width) > 0 ? Number(vb.width) : (Number.parseFloat(svg.getAttribute("width")) || bbox.width);
              const curH = vb && Number(vb.height) > 0 ? Number(vb.height) : (Number.parseFloat(svg.getAttribute("height")) || bbox.height);
              const pad = 3;
              const minX = Math.min(curX, Math.floor(bbox.x - pad));
              const minY = Math.min(curY, Math.floor(bbox.y - pad));
              const maxX = Math.max(curX + curW, Math.ceil(bbox.x + bbox.width + pad));
              const maxY = Math.max(curY + curH, Math.ceil(bbox.y + bbox.height + pad));
              const nextW = Math.max(1, maxX - minX);
              const nextH = Math.max(1, maxY - minY);
              if (minX !== curX || minY !== curY || nextW > curW || nextH > curH) {
                svg.setAttribute("viewBox", minX + " " + minY + " " + nextW + " " + nextH);
                svg.setAttribute("width", nextW + "px");
                svg.setAttribute("height", nextH + "px");
              }
            } catch (_e) {}
          }
        }
        function alignSourceSections() {
          const sections = Array.from(document.querySelectorAll(".abcarus-print-source"));
          for (const section of sections) {
            try {
              let node = section.previousElementSibling;
              while (node && String(node.tagName || "").toLowerCase() !== "svg") {
                node = node.previousElementSibling;
              }
              let svg = node;
              if (!svg) {
                const scope = section.closest(".print-tune") || section.parentElement || document;
                const preceding = Array.from(scope.querySelectorAll("svg"))
                  .filter(function (candidate) { return Boolean(candidate.compareDocumentPosition(section) & 4); });
                svg = preceding.length ? preceding[preceding.length - 1] : null;
              }
              if (!svg || !svg.getBBox) continue;
              const bbox = svg.getBBox();
              const vb = svg.viewBox && svg.viewBox.baseVal;
              const rect = svg.getBoundingClientRect();
              if (!vb || !rect.width || !vb.width || !Number.isFinite(bbox.x)) continue;
              const contentLeft = rect.left + ((bbox.x - vb.x) * rect.width / vb.width);
              const sectionLeft = section.getBoundingClientRect().left;
              const inset = Math.max(0, Math.min(rect.width * 0.25, contentLeft - sectionLeft));
              if (inset > 0.5) section.style.marginLeft = inset.toFixed(2) + "px";
            } catch (_e) {}
          }
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
        window._rasterReadyPromise = waitForFonts().then(function () {
          if (!skipNormalizeSvgBounds) normalizeSvgBounds();
          alignSourceSections();
          if (skipRaster) return null;
          return rasterizeAll();
        });
      })();
    </script>
  </body>
</html>`;
}

async function withPrintWindow(svgMarkup, action, options) {
  const win = new BrowserWindow({
    show: Boolean(options && options.show),
    autoHideMenuBar: true,
    icon: resolveWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  const fontBase64 = await getMusicFontBase64().catch(() => null);
  const suggestedName = sanitizePrintFileBaseName(options && options.suggestedName, "abc-print");
  const html = buildPrintHtml(svgMarkup, fontBase64, suggestedName);
  const captureStamp = Date.now();
  const tmpName = `${suggestedName}-${captureStamp}.html`;
  const tmpPath = path.join(app.getPath("temp"), tmpName);
  await fs.promises.writeFile(tmpPath, html);
  let captureBasePath = "";
  if (PRINT_CAPTURE_ENABLED) {
    try {
      const captureDir = path.join(app.getPath("temp"), "abcarus-print-debug");
      await fs.promises.mkdir(captureDir, { recursive: true });
      captureBasePath = path.join(captureDir, `${suggestedName}-${captureStamp}`);
      await Promise.all([
        fs.promises.writeFile(`${captureBasePath}-input.html`, String(svgMarkup || "")),
        fs.promises.writeFile(`${captureBasePath}-initial.html`, html),
      ]);
    } catch (error) {
      captureBasePath = "";
      console.warn("[print-capture] unable to save initial artifacts", error);
    }
  }
  await win.loadFile(tmpPath);
  try {
    await win.webContents.executeJavaScript("window._rasterReadyPromise || Promise.resolve()", true);
  } catch {}
  if (captureBasePath) {
    try {
      const readyHtml = await win.webContents.executeJavaScript("document.documentElement.outerHTML", true);
      await fs.promises.writeFile(`${captureBasePath}-ready.html`, String(readyHtml || ""));
      console.info(`[print-capture] ${captureBasePath}-{input,initial,ready}.html`);
    } catch (error) {
      console.warn("[print-capture] unable to save ready DOM", error);
    }
  }
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

async function printWithDialog(svgMarkup, suggestedName) {
  return withPrintWindow(svgMarkup, (contents) =>
    new Promise((resolve) => {
      const marginType = printPageMarginsUseChromiumDefaults(svgMarkup) ? "default" : "none";
      contents.print({ printBackground: true, silent: false, margins: { marginType } }, (success, failureReason) => {
        if (!success) return resolve({ ok: false, error: failureReason || "Print failed" });
        resolve({ ok: true });
      });
    })
  , { show: true, suggestedName });
}

async function exportPdf(svgMarkup, filePath) {
  return withPrintWindow(svgMarkup, async (contents) => {
    const marginsType = printPageMarginsUseChromiumDefaults(svgMarkup) ? 0 : 1;
    const pdfData = await contents.printToPDF({ printBackground: true, marginsType });
    await fs.promises.writeFile(filePath, pdfData);
    return { ok: true, path: filePath };
  }, { show: false, suggestedName: filePath ? path.basename(filePath, path.extname(filePath)) : "" });
}

async function previewPdf(svgMarkup, suggestedName) {
  const safeName = sanitizePrintFileBaseName(suggestedName, "abc-preview");
  const tmpName = `${safeName}-${Date.now()}.pdf`;
  const tmpPath = path.join(app.getPath("temp"), tmpName);
  const res = await withPrintWindow(svgMarkup, async (contents) => {
    const marginsType = printPageMarginsUseChromiumDefaults(svgMarkup) ? 0 : 1;
    const pdfData = await contents.printToPDF({ printBackground: true, marginsType });
    await fs.promises.writeFile(tmpPath, pdfData);
    return { ok: true, path: tmpPath };
  }, { show: false, suggestedName: safeName });
  if (res && res.ok && res.path) {
    await shell.openPath(res.path);
  }
  return res;
}

async function printViaPdf(svgMarkup, suggestedName) {
  const safeName = sanitizePrintFileBaseName(suggestedName, "abc-print");
  const tmpName = `${safeName}-${Date.now()}.pdf`;
  const tmpPath = path.join(app.getPath("temp"), tmpName);
  const res = await withPrintWindow(svgMarkup, async (contents) => {
    const marginsType = printPageMarginsUseChromiumDefaults(svgMarkup) ? 0 : 1;
    const pdfData = await contents.printToPDF({ printBackground: true, marginsType });
    await fs.promises.writeFile(tmpPath, pdfData);
    return { ok: true, path: tmpPath };
  }, { show: false, suggestedName: safeName });
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

function isMissingFileError(err) {
  const code = err && err.code ? String(err.code) : "";
  return code === "ENOENT" || code === "ENOTDIR";
}

async function atomicWriteFileWithRetry(filePath, data, { attempts = 5 } = {}) {
  const absPath = String(filePath || "");
  if (!absPath) throw new Error("Missing file path.");
  const dir = path.dirname(absPath);
  const tmpPath = path.join(dir, `.${path.basename(absPath)}.${process.pid}.${Date.now()}.tmp`);
  const backupPath = path.join(dir, `.${path.basename(absPath)}.${process.pid}.${Date.now()}.bak`);
  await fs.promises.writeFile(tmpPath, data, "utf8");
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      try {
        await fs.promises.rename(tmpPath, absPath);
        return;
      } catch (e) {
        let backedUp = false;
        try {
          await fs.promises.rename(absPath, backupPath);
          backedUp = true;
        } catch (backupErr) {
          if (!isMissingFileError(backupErr)) throw backupErr;
        }
        try {
          await fs.promises.rename(tmpPath, absPath);
          if (backedUp) {
            try { await fs.promises.unlink(backupPath); } catch {}
          }
          return;
        } catch (replaceErr) {
          if (backedUp) {
            try { await fs.promises.rename(backupPath, absPath); } catch {}
          }
          throw replaceErr;
        }
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

function applySettingsPatch(patch) {
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
  next.layoutRenderZoomVertical = clampZoom(Number(next.layoutRenderZoomVertical));
  next.layoutRenderZoomHorizontal = clampZoom(Number(next.layoutRenderZoomHorizontal));
  // Keep per-split render zoom in sync with the active orientation whenever `renderZoom` changes.
  // This ensures split zoom restores correctly across restarts even if the user never toggles away.
  if (patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "renderZoom")) {
    if (next.layoutSplitOrientation === "horizontal") next.layoutRenderZoomHorizontal = next.renderZoom;
    else next.layoutRenderZoomVertical = next.renderZoom;
  }
  next.editorFontSize = Math.min(32, Math.max(8, Number(next.editorFontSize) || 13));
  next.uiFontSize = Math.min(28, Math.max(10, Number(next.uiFontSize) || 13));
  const defaultUiFontFamily = "system-ui, -apple-system, \"Segoe UI\", Roboto, Ubuntu, Cantarell, \"Noto Sans\", sans-serif";
  next.uiFontFamily = String(next.uiFontFamily || "").trim() || defaultUiFontFamily;
  next.libraryUiFontSize = Math.min(40, Math.max(10, Number(next.libraryUiFontSize) || (Math.max(10, Math.round(next.uiFontSize) - 1))));
  next.libraryUiFontFamily = String(next.libraryUiFontFamily || "").trim() || next.uiFontFamily;
  next.editorNotesBold = Boolean(next.editorNotesBold);
  next.editorLyricsBold = Boolean(next.editorLyricsBold);
  next.confirmAppendToActiveFile = Boolean(next.confirmAppendToActiveFile);
  next.autoAlignBarsAfterTransforms = Boolean(next.autoAlignBarsAfterTransforms);
  next.stripImportedMeasureComments = Boolean(next.stripImportedMeasureComments);
  next.autoFormatImportedAbc = Boolean(next.autoFormatImportedAbc);
  next.editorHelpEnabled = Boolean(next.editorHelpEnabled);
  normalizeMicrotonalSettings(next, patch);
  next.payloadModeEnabled = Boolean(next.payloadModeEnabled);
  {
    const rawMidiBackend = String(next.midiImportBackend || "").trim();
    const allowed = new Set(["auto", "midi2abc", "music21-xml2abc"]);
    next.midiImportBackend = allowed.has(rawMidiBackend) ? rawMidiBackend : "auto";
  }
  next.midiImportBackendSetByUser = Boolean(next.midiImportBackendSetByUser);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "usePortalFileDialogs")) {
    next.usePortalFileDialogsSetByUser = true;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "midiImportBackend")) {
    next.midiImportBackendSetByUser = true;
  }
  // Errors feature is intentionally session-only and always persisted as off.
  next.errorsEnabled = false;
  appState.settings = next;
  saveState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("settings:changed", withDevSoundfont(next));
  }
  if (patch && (
    Object.prototype.hasOwnProperty.call(patch, "supportMicrotonalNotation")
    || Object.prototype.hasOwnProperty.call(patch, "makamToolsEnabled")
    || Object.prototype.hasOwnProperty.call(patch, "studyToolsEnabled")
    || Object.prototype.hasOwnProperty.call(patch, "payloadModeEnabled")
    || Object.prototype.hasOwnProperty.call(patch, "mp3ExportTimidityPath")
    || Object.prototype.hasOwnProperty.call(patch, "mp3ExportFfmpegPath")
  )) {
    refreshMenu();
  }
  return next;
}

function updateSettings(patch) {
  return applySettingsPatch(patch);
}

async function importProfileSnapshot(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new TypeError("Invalid ABCarus profile document.");
  }
  const { known, extras } = splitStateDocument(document);
  stateDocumentExtras = extras;
  appState.lastFolder = known.lastFolder || null;
  appState.lastDialogDir = known.lastDialogDir || null;
  appState.dialogPreferences = known.dialogPreferences && typeof known.dialogPreferences === "object" && !Array.isArray(known.dialogPreferences)
    ? known.dialogPreferences
    : {};
  appState.recentTunes = Array.isArray(known.recentTunes) ? known.recentTunes : [];
  appState.recentFiles = Array.isArray(known.recentFiles) ? known.recentFiles : [];
  appState.recentFolders = Array.isArray(known.recentFolders) ? known.recentFolders : [];
  appState.globalHeaderMigrationVersion = Number(known.globalHeaderMigrationVersion) || 0;
  appState.windowState = normalizeWindowState(known.windowState);
  appState.settings = getDefaultSettings();
  const settings = applySettingsPatch(known.settings && typeof known.settings === "object" ? known.settings : {});
  await saveState();
  refreshMenu();
  return settings;
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
      composers: header.composers,
      key: header.key,
      meter: header.meter,
      unitLength: header.unitLength,
      tempo: header.tempo,
      rhythm: header.rhythm,
      source: header.source,
      origin: header.origin,
      group: header.group,
      groups: header.groups,
      catalogFacets: header.catalogFacets,
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

const PERSISTED_LIBRARY_INDEX_VERSION = 2;
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
  const backupPath = `${filePath}.${process.pid}.${Date.now()}.bak`;
  await fs.promises.writeFile(tmpPath, data, "utf8");
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      try {
        await fs.promises.rename(tmpPath, filePath);
        return;
      } catch (e) {
        let backedUp = false;
        try {
          await fs.promises.rename(filePath, backupPath);
          backedUp = true;
        } catch (backupErr) {
          if (!isMissingFileError(backupErr)) throw backupErr;
        }
        try {
          await fs.promises.rename(tmpPath, filePath);
          if (backedUp) {
            try { await fs.promises.unlink(backupPath); } catch {}
          }
          return;
        } catch (replaceErr) {
          if (backedUp) {
            try { await fs.promises.rename(backupPath, filePath); } catch {}
          }
          throw replaceErr;
        }
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
    // Charset-aware parsing: older cache entries may have been decoded as utf8 even when the file declares %%abc-charset.
    // If the header declares a non-utf8 charset but the cache entry lacks encoding metadata, treat it as stale and re-parse.
    try {
      if (!parsed.encoding) {
        const detected = detectAbcTextEncodingFromText(parsed.headerText || "");
        if (detected && detected.encoding && detected.encoding !== "utf8") return null;
      }
    } catch {}
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

function setPersistedEntry(filePath, stat, parsed, encodingInfo = null) {
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
  const enc = encodingInfo && typeof encodingInfo === "object" ? String(encodingInfo.encoding || "") : "";
  const declared = encodingInfo && typeof encodingInfo === "object" ? String(encodingInfo.declared || "") : "";
  persistedLibraryIndex.files[key] = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    updatedAtMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
    discover: {
      tuneCount,
      xIssues: parsed.xIssues || undefined,
    },
    parsed: {
      encoding: enc || undefined,
      charsetDeclared: declared || undefined,
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
  let encodingInfo = { text: "", encoding: "utf8", declared: "" };
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
    const raw = await fs.promises.readFile(filePath);
    encodingInfo = decodeAbcTextFromBuffer(raw);
    content = encodingInfo.text;
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
  setPersistedEntry(filePath, stat, parsed, encodingInfo);
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
        const raw = await fs.promises.readFile(filePath);
        const content = decodeAbcTextFromBuffer(raw).text;
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
	        const raw = await fs.promises.readFile(filePath);
	        const encodingInfo = decodeAbcTextFromBuffer(raw);
	        parsed = buildTunesFromContent(filePath, encodingInfo.text);
	        setCachedParse(filePath, stat, parsed);
	        setPersistedEntry(filePath, stat, parsed, encodingInfo);
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

async function createWindow() {
  logStartupPerf("createWindow()");
  updateSplashStatus("Creating window…");
  // Default to following the OS theme (also used for picking a visible window icon on Linux).
  nativeTheme.themeSource = "system";
  const ws = normalizeWindowState(appState.windowState);
  const initialBounds = ws.bounds || DEFAULT_MAIN_WINDOW_BOUNDS;
  const win = new BrowserWindow({
    width: Number(initialBounds.width) || DEFAULT_MAIN_WINDOW_BOUNDS.width,
    height: Number(initialBounds.height) || DEFAULT_MAIN_WINDOW_BOUNDS.height,
    ...(Number.isFinite(Number(initialBounds.x)) ? { x: Number(initialBounds.x) } : {}),
    ...(Number.isFinite(Number(initialBounds.y)) ? { y: Number(initialBounds.y) } : {}),
    show: false,
    icon: resolveWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // IMPORTANT: otherwise preload has no fs
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  mainWindow = win;
  win.webContents.on("will-navigate", (event, targetUrl) => {
    event.preventDefault();
    const externalUrl = normalizeAllowedExternalUrl(targetUrl);
    if (externalUrl) shell.openExternal(externalUrl).catch(() => {});
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = normalizeAllowedExternalUrl(url);
    if (externalUrl) shell.openExternal(externalUrl).catch(() => {});
    return { action: "deny" };
  });
  if (process.platform === "linux") {
    // Best-effort: update the window icon if the OS theme flips light/dark.
    // Not all Linux desktops propagate this to Electron consistently.
    nativeTheme.on("updated", () => {
      try {
        if (typeof win.setIcon === "function") win.setIcon(resolveWindowIconPath());
      } catch {}
    });
  }
  try { win.setAlwaysOnTop(false); } catch {}
  try {
    if (STARTUP_PERF_ENABLED) {
      win.once("ready-to-show", () => logStartupPerf("window ready-to-show"));
      win.webContents.once("did-start-loading", () => logStartupPerf("renderer did-start-loading"));
      win.webContents.once("dom-ready", () => logStartupPerf("renderer dom-ready"));
      win.webContents.once("did-stop-loading", () => logStartupPerf("renderer did-stop-loading"));
      win.webContents.once("render-process-gone", (_event, details) => {
        logStartupPerf("renderer render-process-gone", details || "");
      });
    }
    win.webContents.once("did-finish-load", () => {
      logStartupPerf("renderer did-finish-load");
      // Ensure renderer-side debug toggles are in sync with the menu checkboxes on startup.
      // The renderer gates non-critical toasts and extra diagnostics behind these flags.
      try {
        win.webContents.send("menu:action", { type: "toggleDebugMessages", value: Boolean(appState.debugFlags && appState.debugFlags.showMessages) });
      } catch {}
      try {
        win.webContents.send("menu:action", { type: "toggleAutoDump", value: Boolean(appState.debugFlags && appState.debugFlags.autoDump) });
      } catch {}
      if (pendingCliOpenFile) {
        const cliPath = pendingCliOpenFile;
        setTimeout(() => {
          try {
            sendMenuAction({
              type: "openRecentFile",
              entry: {
                path: cliPath,
                basename: path.basename(cliPath),
                forceReload: true,
              },
            });
          } catch {}
        }, 250);
      }
      if (UI_SMOKE_ENABLED) {
        runUiSmoke(win).catch((err) => {
          try {
            // eslint-disable-next-line no-console
            console.error("[ui-smoke] FAIL (runtime):", err && err.message ? err.message : String(err));
          } catch {}
          process.exitCode = 1;
          isQuitting = true;
          try { app.exit(1); } catch { process.exit(1); }
        });
      }
    });
  } catch {}
  if (!app.isPackaged && DEV_NO_CACHE_ENABLED) {
    try {
      const ses = win.webContents.session;
      if (ses && typeof ses.clearCache === "function") {
        await ses.clearCache();
      }
      if (ses && typeof ses.clearStorageData === "function") {
        await ses.clearStorageData({
          storages: ["serviceworkers", "cachestorage", "shadercache"],
        });
      }
    } catch {}
  }
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  logStartupPerf("loadFile(index.html) queued");
  // Avoid maximizing before the renderer is ready: it can make the initial window paint feel sluggish.
  const hasPersistedBounds = Boolean(
    ws
    && ws.bounds
    && Number.isFinite(Number(ws.bounds.width))
    && Number.isFinite(Number(ws.bounds.height))
  );
  const shouldMaximizeByDefault = !hasPersistedBounds && process.env.ABCARUS_DEV_NO_MAXIMIZE !== "1";
  win.once("ready-to-show", () => {
    updateSplashStatus("Opening main window…");
    if (ws.isFullScreen) {
      try { win.setFullScreen(true); } catch {}
    } else if (ws.isMaximized || shouldMaximizeByDefault) {
      try { win.maximize(); } catch {}
    }
    try { win.show(); } catch {}
    closeSplashWindow();
  });
  let windowStateTimer = null;
  const scheduleWindowStateCapture = (immediate = false) => {
    if (windowStateTimer) {
      clearTimeout(windowStateTimer);
      windowStateTimer = null;
    }
    if (immediate) {
      captureWindowState(win);
      return;
    }
    windowStateTimer = setTimeout(() => {
      windowStateTimer = null;
      captureWindowState(win);
    }, 250);
  };
  win.on("move", () => scheduleWindowStateCapture(false));
  win.on("resize", () => scheduleWindowStateCapture(false));
  win.on("maximize", () => scheduleWindowStateCapture(true));
  win.on("unmaximize", () => scheduleWindowStateCapture(true));
  win.on("enter-full-screen", () => scheduleWindowStateCapture(true));
  win.on("leave-full-screen", () => scheduleWindowStateCapture(true));
  const shouldForwardConsole = (process.env.ABCARUS_DEV_FORWARD_CONSOLE === "1")
    || (process.env.NODE_ENV !== "production" && !app.isPackaged);
  if (shouldForwardConsole) {
    win.webContents.on("console-message", ({ level, message, lineNumber, sourceId }) => {
      try {
        const tag = String(level || "?");
        // eslint-disable-next-line no-console
        console.log(`[renderer:${tag}] ${message} (${sourceId}:${lineNumber})`);
      } catch {}
    });
    win.webContents.on("render-process-gone", (_event, details) => {
      try {
        // eslint-disable-next-line no-console
        console.error("[renderer] render-process-gone:", details);
      } catch {}
    });
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      try {
        // eslint-disable-next-line no-console
        console.error("[renderer] did-fail-load:", { errorCode, errorDescription, validatedURL });
      } catch {}
    });
  }
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    // Use best-effort key handling for tune navigation.
    // Notes:
    // - Some platforms/layouts may report AltGr as Ctrl+Alt.
    // - `input.key` may be "PageDown"/"PageUp" or legacy "Next"/"Prior".
    // - Prefer not to require `!input.control` to avoid "stuck Ctrl" edge cases after accelerators.
    if (input.alt && !input.meta && !input.shift) {
      const key = String(input.key || "");
      const code = String(input.code || "");
      const isPgUp = key === "PageUp" || key === "Prior" || code === "PageUp";
      const isPgDn = key === "PageDown" || key === "Next" || code === "PageDown";
      if (process.env.ABCARUS_DEBUG_KEYS === "1") {
        try {
          // eslint-disable-next-line no-console
          console.log("[keys] alt=%s ctrl=%s shift=%s meta=%s key=%s code=%s", input.alt, input.control, input.shift, input.meta, key, code);
        } catch {}
      }
      if (isPgUp) {
        event.preventDefault();
        sendMenuAction("navTunePrev");
        return;
      }
      if (isPgDn) {
        event.preventDefault();
        sendMenuAction("navTuneNext");
        return;
      }
    }
    const hasMod = input.control || input.meta;
    if (!hasMod || !input.shift || input.alt) return;
    const key = String(input.key || "");
    const code = String(input.code || "");
    const isArrowUp = key === "ArrowUp" || key === "Up" || code === "ArrowUp" || code === "Up";
    const isArrowDown = key === "ArrowDown" || key === "Down" || code === "ArrowDown" || code === "Down";
    const isArrowRight = key === "ArrowRight" || key === "Right" || code === "ArrowRight" || code === "Right";
    const isArrowLeft = key === "ArrowLeft" || key === "Left" || code === "ArrowLeft" || code === "Left";
    if (isArrowUp) {
      event.preventDefault();
      sendMenuAction("transformTransposeUp");
    } else if (isArrowDown) {
      event.preventDefault();
      sendMenuAction("transformTransposeDown");
    } else if (isArrowRight) {
      event.preventDefault();
      sendMenuAction("transformDouble");
    } else if (isArrowLeft) {
      event.preventDefault();
      sendMenuAction("transformHalf");
    } else if (key === "A" || key === "a") {
      event.preventDefault();
      sendMenuAction("alignBars");
    }
  });
  win.on("close", (e) => {
    try { captureWindowState(win); } catch {}
    if (isQuitting) return;
    e.preventDefault();
    win.webContents.send("app:request-quit");
    // If the renderer is hung/crashed, it won't ack quit via IPC.
    // Avoid forcing users to `xkill`: fall back to quitting after a short grace period.
    try {
      if (win.__abcarusForceQuitTimer) return;
      win.__abcarusForceQuitTimer = setTimeout(() => {
        win.__abcarusForceQuitTimer = null;
        if (isQuitting) return;
        isQuitting = true;
        try { app.quit(); } catch { process.exit(0); }
      }, 1500);
    } catch {}
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
}

async function runUiSmoke(win) {
  const exitUiSmoke = (ok, label, result) => {
    try {
      const prefix = ok ? "PASS" : "FAIL";
      const log = ok ? console.log : console.error;
      log(`[ui-smoke] ${prefix} ${label}`, JSON.stringify(result || {}));
    } catch {}
    process.exitCode = ok ? 0 : 1;
    isQuitting = true;
    try { app.exit(process.exitCode || 0); } catch { process.exit(process.exitCode || 0); }
  };

  if (process.env.ABCARUS_DEV_PAYLOAD_SMOKE === "1") {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const payloadResult = await win.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const hook = window.__abcarusDevUiSmoke;
        if (
          !hook
          || typeof hook.preparePayloadTune !== "function"
          || typeof hook.dispatchAction !== "function"
          || typeof hook.snapshot !== "function"
        ) {
          return { ok: false, reason: "payload smoke hook unavailable" };
        }
        const source = "X:1\\nT:Payload Smoke\\nK:C\\nC D E F|\\n";
        hook.setPayloadModeSettingEnabled(true);
        hook.preparePayloadTune(source);
        await hook.dispatchAction({ type: "openPayloadMode" });
        await wait(120);
        const entered = hook.snapshot();
        await hook.dispatchAction({ type: "openPayloadMode" });
        await wait(120);
        const exited = hook.snapshot();
        return {
          ok: Boolean(
            entered
            && entered.payloadMode
            && entered.payloadBarHidden === false
            && exited
            && !exited.payloadMode
            && exited.payloadBarHidden === true
            && exited.editorText === source
          ),
          entered: {
            payloadMode: Boolean(entered && entered.payloadMode),
            payloadBarHidden: Boolean(entered && entered.payloadBarHidden),
            editorChars: entered && entered.editorText ? entered.editorText.length : 0,
            toast: entered ? entered.toast : "",
          },
          exited: {
            payloadMode: Boolean(exited && exited.payloadMode),
            payloadBarHidden: Boolean(exited && exited.payloadBarHidden),
            restored: Boolean(exited && exited.editorText === source),
            toast: exited ? exited.toast : "",
          },
        };
      })()`,
      true
    );
    exitUiSmoke(Boolean(payloadResult && payloadResult.ok), "payload", payloadResult);
    return;
  }

  if (process.env.ABCARUS_DEV_PLAYBACK_SMOKE === "1") {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const requireFirstNote = process.env.ABCARUS_DEV_SOUNDFONT_SMOKE === "1";
    const playbackResult = await win.webContents.executeJavaScript(
      `(async () => {
        const requireFirstNote = ${requireFirstNote ? "true" : "false"};
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate, timeoutMs, stepMs = 100) => {
          const start = Date.now();
          let last = null;
          while (Date.now() - start < timeoutMs) {
            last = predicate();
            if (last && last.ok) return last;
            await wait(stepMs);
          }
          return last || { ok: false };
        };
        const compactSnapshot = (snap) => ({
          isPlaying: !!(snap && snap.isPlaying),
          isPaused: !!(snap && snap.isPaused),
          waitingForFirstNote: !!(snap && snap.waitingForFirstNote),
          playbackStartArmed: !!(snap && snap.playbackStartArmed),
          playText: snap ? snap.playText : "",
          playActive: !!(snap && snap.playActive),
          playDisabled: !!(snap && snap.playDisabled),
          stopDisabled: !!(snap && snap.stopDisabled),
          status: snap ? snap.status : "",
          toast: snap ? snap.toast : "",
          hasSvg: !!(snap && snap.hasSvg),
          debugSymbols: snap && snap.playbackDebug ? snap.playbackDebug.symbols : undefined,
          debugMeasures: snap && snap.playbackDebug ? snap.playbackDebug.measures : undefined,
          soundfont: snap ? snap.soundfont : null,
        });
        const hook = window.__abcarusDevUiSmoke;
        if (!hook || typeof hook.setText !== "function" || typeof hook.snapshot !== "function") {
          return { ok: false, phase: "setup", reason: "missing-ui-hook" };
        }
        const abc = [
          "X:1",
          "T:UI Playback Smoke",
          "M:4/4",
          "L:1/4",
          "Q:1/4=96",
          "K:C",
          "C D E F | G A B c | c B A G | F E D C |",
          "C D E F | G A B c | c B A G | F E D C |]"
        ].join("\\n") + "\\n";
        hook.setText(abc);
        const rendered = await waitFor(() => {
          const snap = hook.snapshot();
          return { ok: !!(snap && snap.hasSvg), snap: compactSnapshot(snap) };
        }, 8000, 120);
        if (!rendered.ok) {
          return { ok: false, phase: "render", reason: "missing-svg", last: rendered.snap };
        }
        if (typeof hook.clickPlay !== "function") {
          return { ok: false, phase: "setup", reason: "missing-click-play" };
        }
        const audioProbe = {
          starts: 0,
          bufferedStarts: 0,
          nonZeroStarts: 0,
          lastBufferLength: 0,
        };
        if (requireFirstNote && window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype) {
          const proto = window.AudioBufferSourceNode.prototype;
          const originalStart = proto.start;
          proto.start = function (...args) {
            audioProbe.starts += 1;
            const buffer = this.buffer;
            const length = buffer && Number(buffer.length) > 1 ? Number(buffer.length) : 0;
            if (length > 0) {
              audioProbe.bufferedStarts += 1;
              audioProbe.lastBufferLength = length;
              try {
                const data = buffer.getChannelData(0);
                const step = Math.max(1, Math.floor(data.length / 256));
                for (let i = 0; i < data.length; i += step) {
                  if (Math.abs(Number(data[i]) || 0) > 1e-8) {
                    audioProbe.nonZeroStarts += 1;
                    break;
                  }
                }
              } catch {}
            }
            return originalStart.apply(this, args);
          };
        }
        hook.clickPlay();
        const failurePattern = /Playback failed|Playback parse error|failed to start|not mappable|invalid/i;
        const startSamples = [];
        const started = await waitFor(() => {
          const snap = hook.snapshot();
          const compact = compactSnapshot(snap);
          startSamples.push(compact);
          if (startSamples.length > 10) startSamples.shift();
          const text = String((compact.status || "") + " " + (compact.toast || ""));
          if (failurePattern.test(text)) {
            return { ok: false, failed: true, snap: compact };
          }
          const active = !!(
            compact.isPlaying
            || compact.waitingForFirstNote
            || compact.playbackStartArmed
            || compact.playActive
            || /Pause|Resume/i.test(String(compact.playText || ""))
          );
          const firstNoteStarted = compact.isPlaying
            && !compact.waitingForFirstNote
            && /Playing/i.test(String(compact.status || ""));
          return { ok: requireFirstNote ? firstNoteStarted : active, snap: compact };
        }, requireFirstNote ? 90000 : 7000, 120);
        if (!started.ok) {
          return {
            ok: false,
            phase: "start",
            reason: started.failed ? "playback-failed" : "playback-did-not-start",
            last: started.snap,
            samples: startSamples,
          };
        }
        if (requireFirstNote) {
          const audible = await waitFor(() => ({
            ok: audioProbe.bufferedStarts > 0 && audioProbe.nonZeroStarts > 0,
          }), 90000, 150);
          if (!audible.ok) {
            return {
              ok: false,
              phase: "audio",
              reason: "no-nonzero-audio-buffer-started",
              audioProbe,
              started: started.snap,
            };
          }
        }
        if (typeof hook.clickStop === "function") hook.clickStop();
        const stopped = await waitFor(() => {
          const snap = hook.snapshot();
          const compact = compactSnapshot(snap);
          return {
            ok: !compact.isPlaying && !compact.waitingForFirstNote && !compact.playbackStartArmed && !compact.playActive,
            snap: compact,
          };
        }, 4000, 120);
        if (!stopped.ok) {
          return { ok: false, phase: "stop", reason: "playback-did-not-stop", last: stopped.snap };
        }
        const soundfontSource = window.p && typeof window.p.set_sfu === "function"
          ? window.p.set_sfu()
          : "";
        const runtimeSettings = window.api && typeof window.api.getSettings === "function"
          ? await window.api.getSettings()
          : null;
        const configuredSoundfont = runtimeSettings ? String(runtimeSettings.soundfontName || "") : "";
        if (
          requireFirstNote
          && (/^[/]|^[A-Za-z]:\\\\/.test(configuredSoundfont))
          && !String(soundfontSource || "").startsWith("abcarus-sf2://")
        ) {
          return {
            ok: false,
            phase: "soundfont",
            reason: "external-soundfont-was-not-applied",
            configuredSoundfont,
            soundfontSource,
            soundfont: stopped.snap ? stopped.snap.soundfont : null,
          };
        }
        return {
          ok: true,
          rendered: rendered.snap,
          started: started.snap,
          stopped: stopped.snap,
          soundfontSource,
          configuredSoundfont,
          audioProbe: requireFirstNote ? audioProbe : null,
        };
      })()`,
      true
    );
    exitUiSmoke(Boolean(playbackResult && playbackResult.ok), "playback", playbackResult);
    return;
  }

  if (process.env.ABCARUS_DEV_CLOSE_SMOKE === "1") {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const closeResult = await win.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate, timeoutMs, stepMs = 100) => {
          const start = Date.now();
          let last = null;
          while (Date.now() - start < timeoutMs) {
            last = predicate();
            if (last && last.ok) return last;
            await wait(stepMs);
          }
          return last || { ok: false };
        };
        const compactSnapshot = (snap) => ({
          editorChars: snap && snap.editorText ? String(snap.editorText).length : 0,
          hasSvg: !!(snap && snap.hasSvg),
          status: snap ? snap.status : "",
          toast: snap ? snap.toast : "",
          closeDisabled: !!(snap && snap.closeDisabled),
          tuneSelectDisabled: !!(snap && snap.tuneSelectDisabled),
          tuneSelectValue: snap ? snap.tuneSelectValue : "",
          tuneSelectText: snap ? snap.tuneSelectText : "",
        });
        const hook = window.__abcarusDevUiSmoke;
        if (!hook || typeof hook.setText !== "function" || typeof hook.clickClose !== "function" || typeof hook.snapshot !== "function") {
          return { ok: false, phase: "setup", reason: "missing-ui-hook" };
        }
        let rendered = await waitFor(() => {
          const snap = hook.snapshot();
          return { ok: !!(snap && snap.hasSvg), snap: compactSnapshot(snap) };
        }, 2500, 120);
        if (!rendered.ok) {
          hook.setCleanDocument("X:1\\nT:Close Smoke\\nM:4/4\\nL:1/4\\nK:C\\nC D E F |]\\n");
          rendered = await waitFor(() => {
            const snap = hook.snapshot();
            return { ok: !!(snap && snap.hasSvg), snap: compactSnapshot(snap) };
          }, 8000, 120);
        }
        if (!rendered.ok) return { ok: false, phase: "render", reason: "missing-svg", last: rendered.snap };
        if (rendered.snap && rendered.snap.closeDisabled) {
          return { ok: false, phase: "close", reason: "close-button-disabled", last: rendered.snap };
        }
        hook.clickClose();
        const closed = await waitFor(() => {
          const snap = hook.snapshot();
          const compact = compactSnapshot(snap);
          return {
            ok: compact.editorChars === 0 && !compact.hasSvg && compact.tuneSelectDisabled,
            snap: compact,
          };
        }, 4000, 120);
        if (!closed.ok) return { ok: false, phase: "close", reason: "document-did-not-close", last: closed.snap };
        return { ok: true, rendered: rendered.snap, closed: closed.snap };
      })()`,
      true
    );
    exitUiSmoke(Boolean(closeResult && closeResult.ok), "close", closeResult);
    return;
  }

  if (process.env.ABCARUS_DEV_TRANSFORM_KEYS_SMOKE === "1") {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const setupResult = await win.webContents.executeJavaScript(
      `(async () => {
        const hook = window.__abcarusDevTransformSmoke;
        if (!hook || typeof hook.setText !== "function" || typeof hook.getText !== "function") {
          return { ok: false, reason: "missing-transform-hook" };
        }
        hook.setText("X:1\\nT:Test\\nM:4/4\\nL:1/8\\nK:C\\nC2 D E F | G A B c |]\\n");
        return { ok: true, text: hook.getText() || "" };
      })()`,
      true
    );
    if (!setupResult || !setupResult.ok) {
      exitUiSmoke(false, "transform keys setup", setupResult);
      return;
    }
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right", modifiers: ["control", "shift"] });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right", modifiers: ["control", "shift"] });
    await new Promise((resolve) => setTimeout(resolve, 450));
    const afterDouble = await win.webContents.executeJavaScript(
      `window.__abcarusDevTransformSmoke?.getText?.() || ""`,
      true
    );
    const afterDoubleText = String(afterDouble || "");
    const result = {
      ok: afterDoubleText.includes("L:1/16") && afterDoubleText.includes("C4"),
      afterDouble: afterDoubleText.slice(0, 160),
    };
    exitUiSmoke(Boolean(result.ok), "transform keys", result);
    return;
  }

  if (process.env.ABCARUS_DEV_TRANSFORM_SMOKE === "1") {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const transformResult = await win.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const hook = window.__abcarusDevTransformSmoke;
        if (!hook || typeof hook.setText !== "function" || typeof hook.getText !== "function") {
          return { ok: false, reason: "missing-transform-hook" };
        }
        hook.setText("X:1\\nT:Test\\nM:4/4\\nL:1/8\\nK:C\\nC2 D E F | G A B c |]\\n");
        await wait(200);
        return { ok: true, text: hook.getText() || "" };
      })()`,
      true
    );
    if (!transformResult || !transformResult.ok) {
      exitUiSmoke(false, "transform setup", transformResult);
      return;
    }
    sendMenuAction("transformDouble");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const afterDouble = await win.webContents.executeJavaScript(
      `window.__abcarusDevTransformSmoke?.getText?.() || ""`,
      true
    );
    sendMenuAction("transformTransposeUp");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const afterTranspose = await win.webContents.executeJavaScript(
      `window.__abcarusDevTransformSmoke?.getText?.() || ""`,
      true
    );
    const afterDoubleText = String(afterDouble || "");
    const afterTransposeText = String(afterTranspose || "");
    const result = {
      ok: afterDoubleText.includes("L:1/16")
        && afterDoubleText.includes("C4")
        && afterTransposeText
        && afterTransposeText !== afterDoubleText,
      afterDouble,
      afterTranspose,
    };
    if (result.ok) {
      exitUiSmoke(true, "transform", {
        afterDouble: String(afterDouble || "").slice(0, 80),
        afterTranspose: String(afterTranspose || "").slice(0, 80),
      });
    } else {
      exitUiSmoke(false, "transform", result);
    }
    return;
  }

  // Keep this smoke tiny and deterministic: verify the exact UI contracts we keep regressing.
  const result = await win.webContents.executeJavaScript(
    `(async () => {
      const byId = (id) => document.getElementById(id);
      const focusBtn = byId("btnFocusMode");
      const followBtn = byId("btnToggleFollow");
      const errorsBtn = byId("btnToggleErrors");
      const selectionLoopWrap = byId("selectionLoopWrap");
      const libOpenBtn = byId("libOpen");
      const groupBySelect = byId("groupBy");
      const tuneSelect = byId("fileTuneSelect");
      const tempoSelect = byId("practiceTempo");
      const tempoWrap = byId("practiceTempoWrap");
      const scoreToolbar = document.querySelector(".score-toolbar");
      const libraryCatalogButton = byId("btnLibraryCatalog");
      const openFolderAsLibraryButton = byId("btnOpenFolderAsLibrary");
      const missing = [];
      if (!focusBtn) missing.push("btnFocusMode");
      if (!followBtn) missing.push("btnToggleFollow");
      if (!errorsBtn) missing.push("btnToggleErrors");
      if (!selectionLoopWrap) missing.push("selectionLoopWrap");
      if (!libOpenBtn) missing.push("libOpen");
      if (!groupBySelect) missing.push("groupBy");
      if (!tuneSelect) missing.push("fileTuneSelect");
      if (!tempoSelect) missing.push("practiceTempo");
      if (!tempoWrap) missing.push("practiceTempoWrap");
      if (!scoreToolbar) missing.push("score-toolbar");
      if (!libraryCatalogButton) missing.push("btnLibraryCatalog");
      if (!openFolderAsLibraryButton) missing.push("btnOpenFolderAsLibrary");
      if (missing.length) {
        return { ok: false, reason: "missing-elements", missing };
      }

      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const errorsRight = errorsBtn.getBoundingClientRect().right;
      const followLeft = followBtn.getBoundingClientRect().left;
      const visualGapPx = Math.max(0, followLeft - errorsRight);
      const errorsDisplay = getComputedStyle(errorsBtn).display;
      const followDisplay = getComputedStyle(followBtn).display;
      const toggles = byId("btnToggleGlobals") ? byId("btnToggleGlobals").parentElement : null;
      const togglesGapPx = toggles ? (Number.parseFloat(getComputedStyle(toggles).gap || "0") || 0) : 0;
      const errorsVisible = errorsDisplay !== "none";
      const followVisible = followDisplay !== "none";
      const libRadiusPx = Number.parseFloat(getComputedStyle(libOpenBtn).borderRadius || "0") || 0;
      const selGroupRadiusPx = Number.parseFloat(getComputedStyle(groupBySelect).borderRadius || "0") || 0;
      const selTuneRadiusPx = Number.parseFloat(getComputedStyle(tuneSelect).borderRadius || "0") || 0;
      const selTempoHeightPx = tempoWrap.getBoundingClientRect().height;
      const transportInScore = Boolean(byId("btnPlayPause") && byId("btnPlayPause").closest(".score-toolbar") === scoreToolbar);
      const libraryDropdownOk = Boolean(
        libraryCatalogButton.closest(".toolbar-dropdown-menu")
        && openFolderAsLibraryButton.closest(".toolbar-dropdown-menu")
      );
      const librarySplitControl = byId("btnToggleLibrary").closest(".library-split-control");
      const normalRightPane = document.querySelector("main > .pane.right");
      const normalRightPaneWidthPx = normalRightPane
        ? Math.round(normalRightPane.getBoundingClientRect().width)
        : 0;
      const normalRightPaneVisible = Boolean(
        normalRightPane
        && normalRightPaneWidthPx >= 300
        && normalRightPane.getClientRects().length > 0
      );
      const hook = window.__abcarusDevUiSmoke;
      if (hook && typeof hook.setText === "function") {
        hook.setText([
          "X:1",
          "T:Focus Score Selection Smoke",
          "M:4/4",
          "L:1/4",
          "Q:1/4=96",
          "K:C",
          "C D E F | G A B c | c B A G | F E D C |]",
        ].join("\\n") + "\\n");
        await wait(450);
        for (let attempt = 0; attempt < 30; attempt += 1) {
          if (document.querySelectorAll("#out .note-hl[data-start]").length >= 2) break;
          await wait(80);
        }
      }

      const isHidden = () => Boolean(selectionLoopWrap.hidden || selectionLoopWrap.hasAttribute("hidden"));
      const body = document.body;
      const initialFocus = body.classList.contains("focus-mode");
      if (!initialFocus) {
        focusBtn.click();
        await wait(120);
      }
      const hiddenInFocus = isHidden();
      const libraryHiddenInFocus = Boolean(
        librarySplitControl
        && librarySplitControl.getClientRects().length === 0
      );
      const focusToolbarUnified = Boolean(
        focusBtn.closest(".score-toolbar") === scoreToolbar
        && byId("btnSettings").closest(".score-toolbar") === scoreToolbar
        && byId("practiceFocusRangeGroup").closest(".score-toolbar") === scoreToolbar
        && getComputedStyle(document.querySelector("header")).display === "none"
      );
      const focusControlsAligned = Math.abs(
        focusBtn.getBoundingClientRect().top
        - byId("btnPlayPause").getBoundingClientRect().top
      ) <= 1;
      let focusDoubleClickSelectionOk = false;
      let focusSingleClickClearOk = false;
      let focusScoreSelectionDiagnostics = null;
      const scoreNotes = Array.from(document.querySelectorAll("#out .note-hl[data-start]"));
      if (scoreNotes.length >= 2) {
        scoreNotes.sort((a, b) => Number(a.getAttribute("data-start")) - Number(b.getAttribute("data-start")));
        const dispatchScoreMouse = (element, type) => {
          const rect = element.getBoundingClientRect();
          element.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + (rect.width / 2),
            clientY: rect.top + (rect.height / 2),
          }));
        };
        dispatchScoreMouse(scoreNotes[0], "dblclick");
        await wait(80);
        const firstFrom = Number(byId("practiceLoopFrom").value);
        const firstTo = Number(byId("practiceLoopTo").value);
        const firstSelected = firstFrom >= 1 && firstTo === firstFrom;
        dispatchScoreMouse(scoreNotes[scoreNotes.length - 1], "dblclick");
        await wait(80);
        const rangeFrom = Number(byId("practiceLoopFrom").value);
        const rangeTo = Number(byId("practiceLoopTo").value);
        const overlayCount = document.querySelectorAll("#out .svg-focus-selection").length;
        focusDoubleClickSelectionOk = Boolean(
          firstSelected
          && rangeFrom === firstFrom
          && rangeTo > rangeFrom
          && overlayCount > 0
        );
        dispatchScoreMouse(scoreNotes[0], "click");
        await wait(420);
        focusSingleClickClearOk = Number(byId("practiceLoopFrom").value) === 0
          && Number(byId("practiceLoopTo").value) === 0
          && !document.querySelector("#out .svg-focus-selection");
        focusScoreSelectionDiagnostics = {
          noteCount: scoreNotes.length,
          firstNoteStart: scoreNotes[0] ? scoreNotes[0].getAttribute("data-start") : null,
          lastNoteStart: scoreNotes.length ? scoreNotes[scoreNotes.length - 1].getAttribute("data-start") : null,
          firstFrom,
          firstTo,
          rangeFrom,
          rangeTo,
          overlayCount,
          clearedFrom: Number(byId("practiceLoopFrom").value),
          clearedTo: Number(byId("practiceLoopTo").value),
          clearedOverlayCount: document.querySelectorAll("#out .svg-focus-selection").length,
        };
      }
      if (!initialFocus) {
        focusBtn.click();
        await wait(120);
      }
      let normalDoubleClickSelectionOk = initialFocus;
      let normalSingleClickClearOk = initialFocus;
      if (!initialFocus && scoreNotes.length >= 2) {
        const dispatchScoreMouse = (element, type) => {
          const rect = element.getBoundingClientRect();
          element.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + (rect.width / 2),
            clientY: rect.top + (rect.height / 2),
          }));
        };
        dispatchScoreMouse(scoreNotes[0], "dblclick");
        await wait(60);
        dispatchScoreMouse(scoreNotes[scoreNotes.length - 1], "dblclick");
        await wait(80);
        const normalSelection = window.__abcarusDevUiSmoke.snapshot().selection;
        normalDoubleClickSelectionOk = Boolean(
          normalSelection
          && normalSelection.to > normalSelection.from
          && document.querySelector("#out .svg-focus-selection")
        );
        document.querySelector("#out").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await wait(420);
        const clearedSelection = window.__abcarusDevUiSmoke.snapshot().selection;
        normalSingleClickClearOk = Boolean(
          clearedSelection
          && clearedSelection.to === clearedSelection.from
          && !document.querySelector("#out .svg-focus-selection")
        );
      }
      const hiddenWithoutSelection = isHidden();
      const editorContent = document.querySelector("#abc-editor .cm-content");
      let shownWithSelection = false;
      if (editorContent) {
        editorContent.focus();
        const isMacPlatform = /Mac/.test(navigator.platform || "");
        editorContent.dispatchEvent(new KeyboardEvent("keydown", {
          key: "a",
          code: "KeyA",
          ctrlKey: !isMacPlatform,
          metaKey: isMacPlatform,
          bubbles: true,
        }));
        await wait(80);
        shownWithSelection = !isHidden();
      }
      let fontChoicesOk = false;
      let interfaceFontPresetsOk = false;
      let interfaceFontSelections = [];
      let fontSelectWidths = [];
      let fontRemoveLabels = [];
      let modalCloseButtonsOk = false;
      let modalBackdropSafe = false;
      let compactModalOk = false;
      let toolbarDomainsOk = false;
      let setListDocumentUiOk = false;
      let resetViewLayoutOk = false;
      let scoreCenteredAfterReset = false;
      let resetViewRatio = null;
      let scoreCenterGeometry = null;
      if (hook && typeof hook.dispatchAction === "function") {
        await hook.dispatchAction({ type: "fonts" });
        await wait(250);
        const fontsPanel = document.querySelector('[data-settings-panel="fonts"].active');
        const chooserRows = fontsPanel
          ? Array.from(fontsPanel.querySelectorAll(".settings-select-row"))
          : [];
        fontSelectWidths = chooserRows.map((row) => {
          const select = row.querySelector("select");
          return select ? Math.round(select.getBoundingClientRect().width) : 0;
        });
        fontRemoveLabels = chooserRows.map((row) => {
          const buttons = row.querySelectorAll("button");
          const remove = buttons.length ? buttons[buttons.length - 1] : null;
          return remove ? String(remove.textContent || "").trim() : "";
        });
        fontChoicesOk = chooserRows.length >= 4
          && fontSelectWidths.every((width) => width >= 140)
          && fontRemoveLabels.every((label) => label === "Remove");
        const interfaceFontKeys = ["uiFontFamily", "libraryUiFontFamily"];
        interfaceFontPresetsOk = interfaceFontKeys.every((key) => {
          const select = fontsPanel.querySelector('select[data-settings-key="' + key + '"]');
          const labels = select ? Array.from(select.options).map((option) => String(option.textContent || "").trim()) : [];
          interfaceFontSelections.push(select && select.selectedOptions[0]
            ? String(select.selectedOptions[0].textContent || "").trim()
            : "");
          return labels.includes("System default")
            && labels.includes("Sans serif")
            && labels.includes("Serif")
            && labels.includes("Monospace");
        });

        const modalCloseIds = [
          "templatesClose",
          "makamDnaClose",
          "settingsClose",
          "moveTuneClose",
          "libraryMetadataClose",
          "aboutClose",
          "setListClose",
          "setListHeaderClose",
          "setListSnapshotClose",
          "setListTargetClose",
          "xIssuesClose",
          "printAllOptionsClose",
          "disclaimerClose",
        ];
        modalCloseButtonsOk = modalCloseIds.every((id) => {
          const button = byId(id);
          if (!button || button.hidden) return false;
          const style = getComputedStyle(button);
          return String(button.textContent || "").trim() === "×"
            && Math.round(Number.parseFloat(style.width || "0")) === 32
            && Math.round(Number.parseFloat(style.height || "0")) === 32;
        });
        const settingsModal = byId("settingsModal");
        if (settingsModal && settingsModal.classList.contains("open")) {
          settingsModal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await wait(30);
          modalBackdropSafe = settingsModal.classList.contains("open");
          const cancel = byId("settingsCancel");
          if (cancel) cancel.click();
        }

        const rawButton = byId("btnToggleRaw");
        const settingsButton = byId("btnSettings");
        const splitButton = byId("btnToggleSplit");
        const resetButton = byId("btnResetLayout");
        const focusGroup = focusBtn ? focusBtn.closest(".segmented") : null;
        toolbarDomainsOk = Boolean(
          rawButton
          && rawButton.closest(".file-header-bar")
          && Number.parseFloat(getComputedStyle(rawButton).minWidth || "0") >= 60
          && settingsButton
          && !byId("btnFonts")
          && focusGroup
          && focusGroup.getAttribute("aria-label") === "Playback and input modes"
          && followBtn.closest(".segmented") === focusGroup
          && splitButton
          && splitButton.closest(".file-header-toggles")
          && resetButton
          && followBtn.getBoundingClientRect().left < resetButton.getBoundingClientRect().left
        );

        hook.dispatchAction({ type: "playGotoMeasure" });
        await wait(80);
        const compactModal = document.querySelector(".compact-modal-card");
        const compactBackdrop = compactModal ? compactModal.closest(".modal") : null;
        const compactClose = compactModal ? compactModal.querySelector(".modal-close") : null;
        compactModalOk = Boolean(
          compactModal
          && compactBackdrop
          && compactBackdrop.classList.contains("open")
          && compactModal.getAttribute("aria-modal") === "true"
          && compactClose
        );
        if (compactClose) compactClose.click();

        await hook.dispatchAction({ type: "setList" });
        await wait(80);
        const setListPanel = byId("setListPanel");
        const setListTitle = byId("setListTitle");
        const setListSave = byId("setListSave");
        const setListSaveAs = byId("setListSaveAs");
        const setListTarget = byId("setListTargetModal");
        if (setListTitle) {
          setListTitle.value = "Smoke Set List";
          setListTitle.dispatchEvent(new Event("change", { bubbles: true }));
          await wait(30);
        }
        setListDocumentUiOk = Boolean(
          setListPanel
          && setListPanel.classList.contains("open")
          && setListPanel.classList.contains("set-list-panel")
          && !setListPanel.closest(".modal")
          && document.body.classList.contains("set-list-visible")
          && setListTitle
          && setListTitle.value === "Smoke Set List *"
          && setListSave
          && !setListSave.disabled
          && setListSaveAs
          && !setListSaveAs.disabled
          && setListTarget
          && setListTarget.getAttribute("aria-hidden") === "true"
        );
        const setListClose = byId("setListClose");
        if (setListClose) {
          setListClose.click();
          await wait(120);
          setListDocumentUiOk = setListDocumentUiOk
            && !document.body.classList.contains("set-list-visible")
            && setListTitle.value === "Smoke Set List *";
          const rightSplit = document.querySelector(".right-split");
          const editorPane = document.querySelector(".editor-pane");
          const renderPane = document.querySelector(".render-pane");
          const horizontal = document.body.classList.contains("right-split-horizontal");
          if (rightSplit && editorPane && renderPane) {
            const editorRect = editorPane.getBoundingClientRect();
            const renderRect = renderPane.getBoundingClientRect();
            const occupied = horizontal
              ? editorRect.height + renderRect.height
              : editorRect.width + renderRect.width;
            resetViewRatio = occupied > 0
              ? (horizontal ? renderRect.height : editorRect.width) / occupied
              : null;
            const expected = horizontal ? 0.62 : 0.44;
            resetViewLayoutOk = Number.isFinite(resetViewRatio) && Math.abs(resetViewRatio - expected) <= 0.03;
            const scoreSvg = document.querySelector("#out svg");
            const out = byId("out");
            if (scoreSvg && out) {
              const svgRect = scoreSvg.getBoundingClientRect();
              const outRect = out.getBoundingClientRect();
              scoreCenterGeometry = {
                svgLeft: Math.round(svgRect.left),
                svgWidth: Math.round(svgRect.width),
                outLeft: Math.round(outRect.left),
                outWidth: Math.round(outRect.width),
              };
              scoreCenteredAfterReset = svgRect.width > outRect.width
                || Math.abs((svgRect.left + svgRect.right) - (outRect.left + outRect.right)) <= 6;
            }
          }
        }
      }
      return {
        ok: errorsVisible
          && followVisible
          && togglesGapPx >= 6
          && libRadiusPx >= 7
          && selGroupRadiusPx >= 7
          && selTuneRadiusPx >= 7
          && selTempoHeightPx >= 27
          && hiddenInFocus
          && libraryHiddenInFocus
          && focusToolbarUnified
          && focusControlsAligned
          && focusDoubleClickSelectionOk
          && focusSingleClickClearOk
          && normalDoubleClickSelectionOk
          && normalSingleClickClearOk
          && hiddenWithoutSelection
          && shownWithSelection
          && transportInScore
          && libraryDropdownOk
          && fontChoicesOk
          && interfaceFontPresetsOk
          && modalCloseButtonsOk
          && modalBackdropSafe
          && compactModalOk
          && toolbarDomainsOk
          && normalRightPaneVisible
          && resetViewLayoutOk
          && scoreCenteredAfterReset
          && setListDocumentUiOk,
        visualGapPx,
        togglesGapPx,
        libRadiusPx,
        selGroupRadiusPx,
        selTuneRadiusPx,
        selTempoHeightPx,
        errorsDisplay,
        followDisplay,
        hiddenInFocus,
        libraryHiddenInFocus,
        focusToolbarUnified,
        focusControlsAligned,
        focusDoubleClickSelectionOk,
        focusSingleClickClearOk,
        normalDoubleClickSelectionOk,
        normalSingleClickClearOk,
        focusScoreSelectionDiagnostics,
        hiddenWithoutSelection,
        shownWithSelection,
        transportInScore,
        libraryDropdownOk,
        fontChoicesOk,
        interfaceFontPresetsOk,
        interfaceFontSelections,
        fontSelectWidths,
        fontRemoveLabels,
        modalCloseButtonsOk,
        modalBackdropSafe,
        compactModalOk,
        toolbarDomainsOk,
        normalRightPaneVisible,
        normalRightPaneWidthPx,
        resetViewLayoutOk,
        resetViewRatio,
        scoreCenteredAfterReset,
        scoreCenterGeometry,
        setListDocumentUiOk,
      };
    })()`,
    true
  );

  exitUiSmoke(Boolean(result && result.ok), "layout", result);
}

app.whenReady().then(async () => {
  if (CLI_OPTIONS.showVersion) {
    try {
      // eslint-disable-next-line no-console
      console.log(app.getVersion ? app.getVersion() : "");
    } catch {}
    app.exit(0);
    return;
  }
  if (!singleInstanceLock) return;
  soundfontProtocol.register();
  logStartupPerf("app.whenReady()");
  if (CLI_OPTIONS.enableLog) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = path.join(app.getPath("userData"), `abcarus-session-${stamp}.log`);
    installSessionLogger(logPath);
  }
  if (CLI_OPTIONS.factorySettings) {
    await resetFactoryStateOnDisk();
  }
  if (CLI_OPTIONS.inputPath) queueOrOpenCliInputPath(CLI_OPTIONS.inputPath);
  const startupSplashSeconds = readStartupSplashSecondsPreferenceSync();
  startupSplashMinVisibleMs = Math.round(Math.max(0, startupSplashSeconds) * 1000);
  if (startupSplashMinVisibleMs > 0) {
    createSplashWindow();
    updateSplashStatus("Initializing…");
  }
  app.setName("ABCarus");
  if (process.platform === "win32") {
    app.setAppUserModelId("com.abcarus.app");
  }
  logStartupPerf("loadState() start");
  updateSplashStatus("Loading settings…");
  await loadState();
  logStartupPerf("loadState() done");
  if (process.platform === "linux" && appState.settings && appState.settings.usePortalFileDialogs) {
    process.env.GTK_USE_PORTAL = "1";
  }
  logStartupPerf("migrateStatePaths() start");
  updateSplashStatus("Migrating state…");
  await migrateStatePaths();
  logStartupPerf("migrateStatePaths() done");
  logStartupPerf("clearDevRuntimeCaches() start");
  updateSplashStatus("Preparing runtime cache…");
  await clearDevRuntimeCaches();
  logStartupPerf("clearDevRuntimeCaches() done");
  cleanupTempPrintFiles().catch(() => {});
  logStartupPerf("cleanupTempPrintFiles() queued");
  updateSplashStatus("Starting UI…");
  await createWindow();
  refreshMenu();
  logStartupPerf("refreshMenu() done");
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(() => {});
    }
  });
  if (singleInstanceOpenRequestedBeforeReady && pendingCliOpenFile) {
    singleInstanceOpenRequestedBeforeReady = false;
    queueOrOpenCliInputPath(pendingCliOpenFile);
  }
});

app.on("window-all-closed", () => {
  closeSplashWindow();
  if (process.platform !== "darwin") app.quit();
});

registerIpcHandlers({
  ipcMain,
  BrowserWindow,
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
  getDialogDefaultPath,
  getDialogFilterIndex,
  rememberDialogSelection,
  confirmAppendToFile,
  confirmImportMusicXmlTarget,
  confirmDeleteTune,
  addRecentTune,
  addRecentFile,
  addRecentFolder,
  getSettingsPaths,
  getProfileSnapshot: () => buildProfileDocument(),
  importProfileSnapshot,
  getSettings: () => {
    const settings = appState.settings || getDefaultSettings();
    return withDevSoundfont(settings);
  },
  updateSettings,
  showTransformError,
  getLastRecent: () => {
    if (appState.recentTunes && appState.recentTunes.length) {
      return { type: "tune", entry: appState.recentTunes[0] };
    }
    if (appState.recentFiles && appState.recentFiles.length) {
      return { type: "file", entry: appState.recentFiles[0] };
    }
    return null;
  },
  getRecentCandidates: () => {
    const out = [];
    const add = (type, entries) => {
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (entry && entry.path) out.push({ type, entry });
      }
    };
    add("tune", appState.recentTunes);
    add("file", appState.recentFiles);
    add("folder", appState.recentFolders);
    return out;
  },
  requestQuit: async () => {
    if (quitPromise) return quitPromise;
    isQuitting = true;
    quitPromise = (async () => {
      await saveState();
      app.quit();
    })();
    try {
      await quitPromise;
    } catch {
      try { app.quit(); } catch { process.exit(0); }
    }
    return quitPromise;
  },
  reportStartupStatus: (text) => {
    updateSplashStatus(text);
  },
  soundfontProtocol,
});
