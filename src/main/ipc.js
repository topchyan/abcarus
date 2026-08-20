const {
  convertFileToAbc,
  convertAbcBatchToMusicXml,
  convertAbcToMusicXml,
  checkConversionTools,
} = require("./conversion");
const { resolvePythonExecutable, pythonEnvForExecutable } = require("./conversion/utils");
const { getSettingsSchema } = require("./settings_schema");
const { parseSettingsPatchFromProperties } = require("./properties");
const { parseProfileDocument, serializeProfileDocument } = require("./state_store");
const { decodeAbcTextFromBuffer, encodeAbcTextToBuffer } = require("./abcCharset");
const { normalizeAllowedExternalUrl } = require("./url_security");

const os = require("os");
const { execFile } = require("child_process");
const { fileURLToPath } = require("url");
const { getVersionInfo } = require("../version");
function sanitizeSuggestedFileBaseName(value, fallback) {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\p{Control}+/gu, " ")
    .replace(/[. ]+$/g, "")
    .replace(/^[. ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback || "tune").slice(0, 120);
}

async function readOsRelease(fs) {
  try {
    const raw = await fs.promises.readFile("/etc/os-release", "utf8");
    const out = {};
    for (const line of raw.split(/\r\n|\n|\r/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      value = value.replace(/^"/, "").replace(/"$/, "");
      out[key] = value;
    }
    return {
      prettyName: out.PRETTY_NAME || "",
      name: out.NAME || "",
      version: out.VERSION || "",
      id: out.ID || "",
      versionId: out.VERSION_ID || "",
    };
  } catch {
    return null;
  }
}

function parseAbc2svgVersionText(raw) {
  const text = String(raw || "");
  const versionMatch = text.match(/abc2svg\.version\s*=\s*"([^"]+)"/);
  const dateMatch = text.match(/abc2svg\.vdate\s*=\s*"([^"]+)"/);
  return {
    version: versionMatch ? String(versionMatch[1] || "").trim() : "",
    date: dateMatch ? String(dateMatch[1] || "").trim() : "",
  };
}

async function readAbc2svgVersionInfo({ fs, path, app }) {
  const appPath = app && typeof app.getAppPath === "function" ? String(app.getAppPath() || "") : "";
  const candidates = [
    path.resolve(__dirname, "../../third_party/abc2svg/abc2svg-1.js"),
    appPath ? path.join(appPath, "third_party", "abc2svg", "abc2svg-1.js") : "",
    path.join(process.cwd(), "third_party", "abc2svg", "abc2svg-1.js"),
    path.resolve(__dirname, "../../third_party/abc2svg/version.txt"),
    appPath ? path.join(appPath, "third_party", "abc2svg", "version.txt") : "",
    path.join(process.cwd(), "third_party", "abc2svg", "version.txt"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const raw = await fs.promises.readFile(candidate, "utf8");
      const parsed = parseAbc2svgVersionText(raw);
      if (parsed.version || parsed.date) {
        return { ...parsed, source: candidate };
      }
    } catch {}
  }
  return { version: "", date: "", source: "" };
}

function execVersion(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 1200 }, (err, stdout, stderr) => {
      if (err) return resolve("");
      const text = String(stdout || stderr || "").trim();
      resolve(text);
    });
  });
}

function splitPathEnv(pathValue, pathModule) {
  return String(pathValue || "")
    .split(pathModule.delimiter)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

function normalizeExecutablePath(rawPath) {
  return String(rawPath || "").trim();
}

function executableNameCandidates(baseName) {
  const name = String(baseName || "").trim();
  if (!name) return [];
  if (process.platform !== "win32") return [name];
  const extRaw = String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM");
  const extList = extRaw
    .split(";")
    .map((ext) => String(ext || "").trim().toLowerCase())
    .filter(Boolean);
  const lower = name.toLowerCase();
  if (extList.some((ext) => lower.endsWith(ext))) return [name];
  return [name, ...extList.map((ext) => `${name}${ext}`)];
}

async function hasExecutableAccess(fs, absPath) {
  const target = normalizeExecutablePath(absPath);
  if (!target) return false;
  try {
    if (process.platform === "win32") {
      await fs.promises.access(target, fs.constants.F_OK);
    } else {
      await fs.promises.access(target, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutablePath({ fs, pathModule, configuredPath, names }) {
  const configured = normalizeExecutablePath(configuredPath);
  if (configured && await hasExecutableAccess(fs, configured)) return configured;
  const dirs = splitPathEnv(process.env.PATH, pathModule);
  const baseNames = Array.isArray(names) ? names : [names];
  for (const baseName of baseNames) {
    for (const name of executableNameCandidates(baseName)) {
      for (const dir of dirs) {
        const candidate = pathModule.join(dir, name);
        if (await hasExecutableAccess(fs, candidate)) return candidate;
      }
    }
  }
  return "";
}

function runExecFile(execPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(execPath, args, { timeout: timeoutMs }, (err, _stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message || "").trim();
        return reject(new Error(detail || "Process failed."));
      }
      return resolve();
    });
  });
}

async function resolveMp3Toolchain({ fs, pathModule, settings }) {
  const timidity = await resolveExecutablePath({
    fs,
    pathModule,
    configuredPath: settings && settings.mp3ExportTimidityPath,
    names: ["timidity", "timidity++"],
  });
  const ffmpeg = await resolveExecutablePath({
    fs,
    pathModule,
    configuredPath: settings && settings.mp3ExportFfmpegPath,
    names: ["ffmpeg"],
  });
  return {
    ok: Boolean(timidity && ffmpeg),
    timidity,
    ffmpeg,
  };
}

async function removeDirBestEffort(fs, dirPath) {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch {}
}

async function resolveChordProCommand({ app, fs, path, settings } = {}) {
  const configuredBin = settings && settings.chordproBinPath ? String(settings.chordproBinPath).trim() : "";
  if (configuredBin && await hasExecutableAccess(fs, configuredBin)) return { cmd: configuredBin, argsPrefix: [] };

  const envBin = process.env.CHORDPRO_BIN ? String(process.env.CHORDPRO_BIN) : "";
  if (envBin && await hasExecutableAccess(fs, envBin)) return { cmd: envBin, argsPrefix: [] };

  if (process.platform === "win32") {
    const programFiles = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].map((v) => String(v || "").trim()).filter(Boolean);
    for (const base of programFiles) {
      const candidate = path.join(base, "ChordPro.ORG", "ChordPro", "chordpro.exe");
      if (await hasExecutableAccess(fs, candidate)) return { cmd: candidate, argsPrefix: [] };
    }
  }

  const configuredRepo = settings && settings.chordproRepoPath ? String(settings.chordproRepoPath).trim() : "";
  const repoEnv = process.env.CHORDPRO_REPO ? String(process.env.CHORDPRO_REPO) : "";
  const candidates = [];
  if (configuredRepo) candidates.push(configuredRepo);
  if (repoEnv) candidates.push(repoEnv);
  if (app && typeof app.getAppPath === "function") {
    candidates.push(path.resolve(app.getAppPath(), "..", "chordpro"));
  }
  if (app && typeof app.getPath === "function") {
    candidates.push(path.join(app.getPath("home"), "Projects", "GitHub", "chordpro"));
  }
  for (const base of candidates) {
    if (!base) continue;
    const scriptPath = path.join(base, "script", "chordpro.pl");
    const libPath = path.join(base, "lib");
    try {
      await fs.promises.access(scriptPath, fs.constants.F_OK);
      return { cmd: "perl", argsPrefix: ["-I", libPath, scriptPath] };
    } catch {}
  }

  return { cmd: "chordpro", argsPrefix: [] };
}

async function runChordProPdf({ app, fs, path, inputPath, outputPath, settings }) {
  const inPath = String(inputPath || "");
  const outPath = String(outputPath || "");
  if (!inPath || !outPath) throw new Error("Missing input or output path.");
  const outDir = path.dirname(outPath);
  await fs.promises.mkdir(outDir, { recursive: true });
  const { cmd, argsPrefix } = await resolveChordProCommand({ app, fs, path, settings });
  const args = [...(argsPrefix || []), "--output", outPath, inPath];
  await new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        const code = err && err.code ? String(err.code) : "";
        if (code === "ENOENT") {
          return reject(new Error("ChordPro CLI not found. Install chordpro or set ChordPro paths in Settings or CHORDPRO_BIN/CHORDPRO_REPO."));
        }
        const detail = String(stderr || err.message || "").trim();
        return reject(new Error(detail || "ChordPro export failed."));
      }
      return resolve();
    });
  });
}

async function checkChordProAvailable({ app, fs, path, settings }) {
  const { cmd, argsPrefix } = await resolveChordProCommand({ app, fs, path, settings });
  const runCheck = (args) => new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) {
        const code = err && err.code ? String(err.code) : "";
        if (code === "ENOENT") {
          return resolve({
            ok: false,
            code,
            error: "ChordPro CLI not found. Install chordpro or set ChordPro paths in Settings or CHORDPRO_BIN/CHORDPRO_REPO.",
          });
        }
        const detail = String(stderr || err.message || "").trim();
        return resolve({
          ok: false,
          code,
          error: detail || "ChordPro check failed.",
        });
      }
      const text = String(stdout || stderr || "").trim();
      return resolve({ ok: true, version: text });
    });
  });

  const first = await runCheck([...(argsPrefix || []), "--version"]);
  if (first.ok) return first;
  if (first.code === "ENOENT") return first;
  const fallback = await runCheck([...(argsPrefix || []), "--help"]);
  if (fallback.ok) return fallback;
  return first;
}

async function atomicWriteFileWithRetry(fs, path, filePath, data, { attempts = 5 } = {}) {
  const absPath = String(filePath || "");
  if (!absPath) throw new Error("Missing file path.");
  const isMissing = (err) => {
    const code = err && err.code ? String(err.code) : "";
    return code === "ENOENT" || code === "ENOTDIR";
  };
  const tmpPath = path.join(
    path.dirname(absPath),
    `.${path.basename(absPath)}.${process.pid}.${Date.now()}.tmp`
  );
  const backupPath = path.join(
    path.dirname(absPath),
    `.${path.basename(absPath)}.${process.pid}.${Date.now()}.bak`
  );
  await fs.promises.writeFile(tmpPath, data);
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
          if (!isMissing(backupErr)) throw backupErr;
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

async function getPythonVersion() {
  try {
    const pythonPath = await resolvePythonExecutable();
    return await new Promise((resolve) => {
      execFile(
        pythonPath,
        ["--version"],
        { timeout: 1500, env: { ...process.env, ...pythonEnvForExecutable(pythonPath) } },
        (err, stdout, stderr) => {
          if (err) return resolve("");
          resolve(String(stdout || stderr || "").trim());
        }
      );
    });
  } catch {
    return "";
  }
}

async function atomicCopyFileWithRetry(fs, path, srcPath, destPath, { attempts = 5 } = {}) {
  const absSrc = String(srcPath || "");
  const absDest = String(destPath || "");
  if (!absSrc || !absDest) throw new Error("Missing file path.");
  const isMissing = (err) => {
    const code = err && err.code ? String(err.code) : "";
    return code === "ENOENT" || code === "ENOTDIR";
  };
  const tmpPath = path.join(
    path.dirname(absDest),
    `.${path.basename(absDest)}.${process.pid}.${Date.now()}.tmp`
  );
  const backupPath = path.join(
    path.dirname(absDest),
    `.${path.basename(absDest)}.${process.pid}.${Date.now()}.bak`
  );
  await fs.promises.copyFile(absSrc, tmpPath);
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      try {
        await fs.promises.rename(tmpPath, absDest);
        return;
      } catch (e) {
        let backedUp = false;
        try {
          await fs.promises.rename(absDest, backupPath);
          backedUp = true;
        } catch (backupErr) {
          if (!isMissing(backupErr)) throw backupErr;
        }
        try {
          await fs.promises.rename(tmpPath, absDest);
          if (backedUp) {
            try { await fs.promises.unlink(backupPath); } catch {}
          }
          return;
        } catch (replaceErr) {
          if (backedUp) {
            try { await fs.promises.rename(backupPath, absDest); } catch {}
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
  throw lastErr || new Error("Unable to copy file.");
}

function sanitizeFontFileName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) return "";
  if (/[\x00-\x1f]/.test(raw)) return "";
  if (!/^[^/\\]+\.(otf|ttf|woff2?)$/i.test(raw)) return "";
  return raw;
}

function classifyFontName(name) {
  const raw = String(name || "");
  if (!raw) return "notation";
  const stem = raw.replace(/\.(otf|ttf|woff2?)$/i, "");
  // Treat text/script families as text fonts even when embedded in CamelCase names,
  // e.g. "FinaleMaestroText-Regular.otf".
  if (/(text|script)(?:[._\-\s]|$)/i.test(stem)) return "text";
  return "notation";
	}

	function shouldReversePortalMultiSelection(settings) {
	  try {
	    if (process.platform !== "linux") return false;
	    return Boolean(settings && settings.usePortalFileDialogs);
	  } catch {
	    return false;
	  }
	}

function registerIpcHandlers(ctx) {
  const {
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
	    confirmAppendToFile,
	    confirmImportMusicXmlTarget,
	    confirmDeleteTune,
	    showSaveError,
	    showTransformError,
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
	    addRecentTune,
	    addRecentFile,
	    addRecentFolder,
	    getSettings,
	    getSettingsPaths,
      getDialogDefaultPath,
      getDialogFilterIndex,
      rememberDialogSelection,
      getProfileSnapshot,
      importProfileSnapshot,
	    updateSettings,
	    requestQuit,
	    getLastRecent,
      getRecentCandidates,
      reportStartupStatus,
      soundfontProtocol,
	  } = ctx;

  function readXdgTemplatesDir() {
    if (process.platform !== "linux") return "";
    try {
      const configPath = path.join(app.getPath("home"), ".config", "user-dirs.dirs");
      const text = fs.readFileSync(configPath, "utf8");
      const match = text.match(/^\s*XDG_TEMPLATES_DIR\s*=\s*"([^"]*)"/m);
      if (!match || !match[1]) return "";
      return String(match[1])
        .replace(/\$\{HOME\}/g, app.getPath("home"))
        .replace(/\$HOME/g, app.getPath("home"));
    } catch {
      return "";
    }
  }

  function existingDirectory(candidate) {
    const dir = String(candidate || "").trim();
    if (!dir) return "";
    try {
      return fs.statSync(dir).isDirectory() ? dir : "";
    } catch {
      return "";
    }
  }

  function resolvePlatformTemplatesFolder() {
    const home = app.getPath("home");
    const candidates = [
      readXdgTemplatesDir(),
      process.platform === "win32" ? path.join(app.getPath("appData"), "Microsoft", "Windows", "Templates") : "",
      path.join(home, "Templates"),
    ];
    for (const candidate of candidates) {
      const dir = existingDirectory(candidate);
      if (dir && path.resolve(dir) === path.resolve(home)) continue;
      if (dir) return dir;
    }
    return "";
  }

  const resolveTemplatesFolder = () => {
    const settings = getSettings ? getSettings() : {};
    const configured = settings && typeof settings.templatesFolder === "string" ? settings.templatesFolder.trim() : "";
    const fallback = path.join(app.getPath("userData"), "templates");
    const platformDefault = configured ? "" : resolvePlatformTemplatesFolder();
    const folder = configured || platformDefault || fallback;
    return { folder, configured, fallback, platformDefault };
  };

  async function scanTemplatesFolder(rootDir) {
    const absRoot = path.resolve(String(rootDir || ""));
    const files = [];
    const stack = [absRoot];
    while (stack.length) {
      const dir = stack.pop();
      if (!dir) continue;
      let entries = [];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry || !entry.name) continue;
        const name = String(entry.name);
        if (name === "." || name === "..") continue;
        const fullPath = path.join(dir, name);
        if (entry.isDirectory()) {
          if (name.startsWith(".")) continue;
          stack.push(fullPath);
        } else if (entry.isFile() && name.toLowerCase().endsWith(".abc")) {
          files.push(fullPath);
        }
      }
    }
    files.sort((a, b) => a.localeCompare(b));
    return { root: absRoot, files };
  }

  const sourcePreviewWindows = new Set();
  const isAllowedYouTubePreviewUrl = (rawUrl) => {
    try {
      const parsed = new URL(String(rawUrl || ""));
      const protocol = String(parsed.protocol || "").toLowerCase();
      if (protocol !== "https:" && protocol !== "http:") return false;
      const host = String(parsed.hostname || "").replace(/^www\./i, "").toLowerCase();
      return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
    } catch {
      return false;
    }
  };
  const normalizeYouTubeWatchUrl = (rawUrl) => {
    try {
      const parsed = new URL(String(rawUrl || ""));
      const host = String(parsed.hostname || "").replace(/^www\./i, "").toLowerCase();
      let videoId = "";
      if (host === "youtu.be") {
        videoId = String(parsed.pathname || "").replace(/^\/+/, "").split(/[/?#]/)[0] || "";
      } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        videoId = String(parsed.searchParams.get("v") || "").trim();
        if (!videoId) {
          const parts = String(parsed.pathname || "").split("/").filter(Boolean);
          if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && parts[1]) videoId = parts[1];
        }
      }
      if (!videoId) return "";
      return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    } catch {
      return "";
    }
  };
  const guardSourcePreviewNavigation = (win) => {
    if (!win || !win.webContents) return;
    win.webContents.on("will-navigate", (event, navUrl) => {
      if (isAllowedYouTubePreviewUrl(navUrl)) return;
      event.preventDefault();
      if (shell && typeof shell.openExternal === "function") shell.openExternal(String(navUrl || "")).catch(() => {});
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedYouTubePreviewUrl(url)) {
        return { action: "allow" };
      }
      if (shell && typeof shell.openExternal === "function") shell.openExternal(String(url || "")).catch(() => {});
      return { action: "deny" };
    });
  };

  const getParentForDialog = (event, reason) => {
    try {
      if (typeof prepareDialogParent === "function") return prepareDialogParent(event, reason);
      if (typeof getDialogParent === "function") return getDialogParent(event);
    } catch {}
    return null;
  };

  const getDialogPath = (opts) => {
    try {
      if (typeof getDialogDefaultPath === "function") return getDialogDefaultPath(opts || {});
    } catch {}
    return undefined;
  };

  const getDialogFilter = (dialogId, filterCount, fallback = 0) => {
    try {
      if (typeof getDialogFilterIndex === "function") return getDialogFilterIndex(dialogId, filterCount, fallback);
    } catch {}
    return fallback;
  };

  const orderDialogFilters = (filters, preferredIndex) => {
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
  };

  const getDialogOriginalFilterIndex = (filters, displayedIndex) => {
    const filter = Array.isArray(filters) ? filters[Number(displayedIndex)] : null;
    const originalIndex = filter && Number(filter.__abcarusOriginalIndex);
    return Number.isInteger(originalIndex) ? originalIndex : Number(displayedIndex);
  };

  const rememberDialogPath = (selectedPath, opts) => {
    try {
      if (typeof rememberDialogSelection === "function") rememberDialogSelection(selectedPath, opts || {});
    } catch {}
  };

  ipcMain.handle("dialog:open", async (event) => await showOpenDialog(event));
  ipcMain.handle("dialog:open-folder", async (event) => await showOpenFolderDialog(event));
  ipcMain.handle("dialog:save", async (event, suggestedName, suggestedDir) =>
    await showSaveDialog(suggestedName, suggestedDir, event)
  );
  ipcMain.handle("dialog:confirm-unsaved", async (event, contextLabel) =>
    confirmUnsavedChanges(contextLabel, event)
  );
  ipcMain.handle("dialog:confirm-overwrite", async (event, filePath) =>
    confirmOverwrite(filePath, event)
  );
  ipcMain.handle("dialog:confirm-append", async (_e, payload) => {
    const raw = payload;
    const filePath = typeof raw === "string"
      ? String(raw || "")
      : (raw && raw.filePath ? String(raw.filePath) : "");
    const tuneLabel = (typeof raw === "object" && raw && raw.tuneLabel) ? String(raw.tuneLabel) : "";
    return await confirmAppendToFile(filePath, tuneLabel);
  });
  ipcMain.handle("dialog:confirm-import-musicxml-target", async (event, filePath) =>
    confirmImportMusicXmlTarget(filePath, event)
  );
  ipcMain.handle("dialog:confirm-remove-sf2", async (event, label) => {
    const parent = getParentForDialog(event, "confirm-remove-sf2");
    const response = dialog.showMessageBoxSync(parent || undefined, {
      type: "warning",
      buttons: ["Remove", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: "Remove soundfont?",
      detail: `Remove "${label}" from the list? This will not delete the file.`,
    });
    return response === 0;
  });

  ipcMain.handle("dialog:confirm-delete-tune", async (_e, label) =>
    confirmDeleteTune(label)
  );


  ipcMain.handle("dialog:confirm-missing-on-disk", async (event, filePath) => {
    const parent = getParentForDialog(event, "confirm-missing-on-disk");
    const p = String(filePath || "");
    const base = p ? path.basename(p) : "file";
    const response = dialog.showMessageBoxSync(parent || undefined, {
      type: "warning",
      buttons: ["Recreate", "Save As…", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      message: "File missing",
      detail: `“${base}” was deleted from disk. Recreate it, Save As… to another path, or cancel.`,
    });
    if (response === 0) return "recreate";
    if (response === 1) return "save_as";
    return "cancel";
  });

  ipcMain.handle("dialog:confirm-save-as-for-permission-denied", async (event, payload) => {
    const parent = getParentForDialog(event, "confirm-save-as-for-permission-denied");
    const data = payload && typeof payload === "object" ? payload : {};
    const p = String(data.filePath || "");
    const base = p ? path.basename(p) : "file";
    const message = data.message ? String(data.message) : "";
    const response = dialog.showMessageBoxSync(parent || undefined, {
      type: "warning",
      buttons: ["Save As…", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: "Original file is not writable",
      detail: message
        ? `ABCarus cannot write “${base}”. Save a copy to another location?\n\n${message}`
        : `ABCarus cannot write “${base}”. Save a copy to another location?`,
    });
    return response === 0 ? "save_as" : "cancel";
  });

  ipcMain.handle("dialog:confirm-reload-from-disk", async (event, filePath) => {
    const parent = getParentForDialog(event, "confirm-reload-from-disk");
    const p = String(filePath || "");
    const base = p ? path.basename(p) : "file";
    const response = dialog.showMessageBoxSync(parent || undefined, {
      type: "warning",
      buttons: ["Reload from disk", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: "Reload from disk?",
      detail: `Reload “${base}” from disk and discard unsaved changes in ABCarus?`,
    });
    return response === 0;
  });
  ipcMain.handle("dialog:show-save-error", async (_e, message) => {
    showSaveError(message);
  });
  ipcMain.handle("dialog:show-transform-error", async (_e, message) => {
    showTransformError(message);
  });
  ipcMain.handle("dialog:show-open-error", async (_e, message) => {
    showOpenError(message);
  });

  ipcMain.handle("source:youtube-metadata", async (_event, rawUrl) => {
    const targetUrl = normalizeYouTubeWatchUrl(rawUrl);
    if (!targetUrl) return { ok: false, error: "Not a supported YouTube video URL." };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
      const response = await fetch(endpoint, { signal: controller.signal, redirect: "follow" });
      if (!response.ok) {
        const unavailable = response.status === 401 || response.status === 403 || response.status === 404;
        return { ok: false, unavailable, status: response.status, error: unavailable ? "Video is unavailable, private, or deleted." : `YouTube returned HTTP ${response.status}.` };
      }
      const text = await response.text();
      if (text.length > 1024 * 1024) return { ok: false, error: "YouTube metadata response is unexpectedly large." };
      const data = JSON.parse(text);
      const title = String(data && data.title ? data.title : "").replace(/\s+/g, " ").trim();
      const channel = String(data && data.author_name ? data.author_name : "").replace(/\s+/g, " ").trim();
      if (!title) return { ok: false, error: "YouTube did not return a video title." };
      return { ok: true, title, channel };
    } catch (error) {
      return { ok: false, error: error && error.name === "AbortError" ? "YouTube metadata request timed out." : (error && error.message ? error.message : "Unable to retrieve YouTube metadata.") };
    } finally {
      clearTimeout(timer);
    }
  });

  ipcMain.handle("source:confirm-youtube-metadata", async (event, payload) => {
    const data = payload && typeof payload === "object" ? payload : {};
    const parent = getParentForDialog(event, "source:confirm-youtube-metadata");
    const detail = String(data.detail || "").slice(0, 12000);
    const canUpdate = Number(data.updateCount) > 0;
    const response = dialog.showMessageBoxSync(parent || undefined, {
      type: canUpdate ? "question" : "info",
      buttons: canUpdate ? ["Update file", "Cancel"] : ["OK"],
      defaultId: 0,
      cancelId: canUpdate ? 1 : 0,
      message: canUpdate ? "Update YouTube metadata?" : "YouTube metadata report",
      detail,
      noLink: true,
    });
    return canUpdate && response === 0;
  });
  ipcMain.handle("sf2:list", async () => {
    try {
      const sf2Dir = path.join(app.getAppPath(), "third_party", "sf2");
      const entries = await fs.promises.readdir(sf2Dir, { withFileTypes: true });
      const bundled = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sf2"))
        .map((entry) => entry.name);
      const settings = ctx && typeof ctx.getSettings === "function" ? ctx.getSettings() : {};
      const extra = Array.isArray(settings.soundfontPaths) ? settings.soundfontPaths : [];
      const extras = [];
      for (const p of extra) {
        try {
          if (!p || typeof p !== "string") continue;
          if (!p.toLowerCase().endsWith(".sf2")) continue;
          const stat = await fs.promises.stat(p);
          if (stat && stat.isFile()) extras.push(p);
        } catch {}
      }
      return Array.from(new Set([...bundled, ...extras])).map((name) => ({
        name,
        source: bundled.includes(name) ? "bundled" : "user",
      }));
    } catch {
      return [];
    }
  });
  ipcMain.handle("sf2:pick", async (event) => {
    const parent = getParentForDialog(event, "sf2:pick");
    const filters = orderDialogFilters([
      { name: "SoundFont", extensions: ["sf2"] },
      { name: "All Files", extensions: ["*"] },
    ], getDialogFilter("soundfont", 2));
    const result = await dialog.showOpenDialog(parent || undefined, {
      modal: true,
      properties: ["openFile"],
      defaultPath: getDialogPath({ dialogId: "soundfont" }),
      filters,
    });
    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return null;
    const selected = String(result.filePaths[0] || "");
    if (selected) rememberDialogPath(selected, { dialogId: "soundfont", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });
    return selected || null;
  });
  ipcMain.handle("sf2:info", async (_e, name) => {
    try {
      const raw = String(name || "");
      let sf2Path = "";
      if (raw.startsWith("file://")) {
        sf2Path = fileURLToPath(raw);
      } else if (path.isAbsolute(raw)) {
        sf2Path = raw;
      } else {
        const safeName = path.basename(raw);
        if (!safeName.toLowerCase().endsWith(".sf2")) return null;
        sf2Path = path.join(app.getAppPath(), "third_party", "sf2", safeName);
      }
      if (!sf2Path.toLowerCase().endsWith(".sf2")) return null;
      const stat = await fs.promises.stat(sf2Path);
      if (!stat.isFile()) return null;
      return { name: path.basename(sf2Path), size: stat.size };
    } catch {
      return null;
    }
  });
  ipcMain.handle("sf2:stream-url", async (_e, name) => {
    if (!soundfontProtocol || typeof soundfontProtocol.exposeFile !== "function") {
      throw new Error("External soundfont streaming is unavailable.");
    }
    const raw = String(name || "").trim();
    const candidate = raw.startsWith("file://") ? fileURLToPath(raw) : raw;
    if (!path.isAbsolute(candidate) || !candidate.toLowerCase().endsWith(".sf2")) {
      throw new Error("Invalid external soundfont path.");
    }
    const requested = await fs.promises.realpath(candidate);
    const settings = ctx && typeof ctx.getSettings === "function" ? ctx.getSettings() : {};
    const configured = Array.isArray(settings.soundfontPaths) ? settings.soundfontPaths : [];
    let allowed = false;
    for (const configuredPath of configured) {
      try {
        if (await fs.promises.realpath(String(configuredPath || "")) === requested) {
          allowed = true;
          break;
        }
      } catch {}
    }
    if (!allowed) throw new Error("Soundfont is not registered in ABCarus settings.");
    return soundfontProtocol.exposeFile(requested);
  });
	  ipcMain.handle("import:musicxml", async (event) => {
	    const parent = getParentForDialog(event, "import:musicxml");
	    const filters = orderDialogFilters([
	      { name: "MusicXML", extensions: ["xml", "musicxml", "mxl"] },
	      { name: "All Files", extensions: ["*"] },
	    ], getDialogFilter("importMusicXml", 2));
    const result = await dialog.showOpenDialog(parent || undefined, {
      modal: true,
      properties: ["openFile", "multiSelections"],
      defaultPath: getDialogPath({ dialogId: "importMusicXml" }),
      filters,
    });
	    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
	    try {
	      const settings = getSettings ? getSettings() : {};
	      const selected = Array.from(result.filePaths).map(String);
	        if (selected[0]) rememberDialogPath(selected[0], { dialogId: "importMusicXml", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });
	      if (selected.length > 1 && shouldReversePortalMultiSelection(settings)) selected.reverse();
	      const total = selected.length;
	      let lastProgressAt = 0;
	      const sendProgress = (done, filePath) => {
	        try {
          const now = Date.now();
          if (done !== 0 && done !== total && now - lastProgressAt < 150) return;
          lastProgressAt = now;
          event.sender.send("import:musicxml:progress", { done, total, sourcePath: filePath || "" });
        } catch {}
      };
      sendProgress(0, "");
      const items = [];
      for (let i = 0; i < selected.length; i += 1) {
        const filePath = selected[i];
        sendProgress(i, filePath);
        const ext = path.extname(filePath || "").toLowerCase();
        const kind = ext === ".mxl" ? "mxl" : "musicxml";
        const converted = await convertFileToAbc({
          kind,
	          inputPath: filePath,
	          args: settings.xml2abcArgs || "",
	        });
	        items.push({
	          abcText: converted.abcText,
	          warnings: converted.warnings || null,
	          sourcePath: filePath,
	        });
      }
      sendProgress(total, "");
      return { ok: true, items };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        detail: e && e.detail ? e.detail : "",
        code: e && e.code ? e.code : "",
      };
    }
	  });

  ipcMain.handle("import:midi", async (event) => {
    const parent = getParentForDialog(event, "import:midi");
    const filters = orderDialogFilters([
      { name: "MIDI", extensions: ["mid", "midi"] },
      { name: "All Files", extensions: ["*"] },
    ], getDialogFilter("importMidi", 2));
    const result = await dialog.showOpenDialog(parent || undefined, {
      modal: true,
      properties: ["openFile", "multiSelections"],
      defaultPath: getDialogPath({ dialogId: "importMidi" }),
      filters,
    });
    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
    try {
      const settings = getSettings ? getSettings() : {};
      const selected = Array.from(result.filePaths).map(String);
      if (selected[0]) rememberDialogPath(selected[0], { dialogId: "importMidi", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });
      if (selected.length > 1 && shouldReversePortalMultiSelection(settings)) selected.reverse();
      const items = [];
      const total = selected.length;
      let lastProgressAt = 0;
      const sendProgress = (done, filePath) => {
        try {
          const now = Date.now();
          if (done !== 0 && done !== total && now - lastProgressAt < 150) return;
          lastProgressAt = now;
          event.sender.send("import:midi:progress", { done, total, sourcePath: filePath || "" });
        } catch {}
      };
      sendProgress(0, "");
      for (let i = 0; i < selected.length; i += 1) {
        const filePath = selected[i];
        sendProgress(i, filePath);
        const converted = await convertFileToAbc({
          kind: "midi",
          inputPath: filePath,
          args: settings.midi2abcArgs || "",
          midiBackend: settings.midiImportBackend || "auto",
          xmlArgs: settings.xml2abcArgs || "",
        });
        items.push({
          abcText: converted.abcText,
          warnings: converted.warnings || null,
          backend: converted.backend || "",
          sourcePath: filePath,
        });
      }
      sendProgress(total, "");
      return { ok: true, items };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        detail: e && e.detail ? e.detail : "",
        code: e && e.code ? e.code : "",
      };
    }
  });

	  ipcMain.handle("import:musicxml:pick", async (event) => {
	    const parent = getParentForDialog(event, "import:musicxml:pick");
	    const filters = orderDialogFilters([
	      { name: "MusicXML", extensions: ["xml", "musicxml", "mxl"] },
	      { name: "All Files", extensions: ["*"] },
	    ], getDialogFilter("importMusicXml", 2));
    const result = await dialog.showOpenDialog(parent || undefined, {
      modal: true,
      properties: ["openFile", "multiSelections"],
      defaultPath: getDialogPath({ dialogId: "importMusicXml" }),
      filters,
    });
	    if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, canceled: true };
	    const settings = getSettings ? getSettings() : {};
	    const paths = Array.from(result.filePaths).map(String);
	      if (paths[0]) rememberDialogPath(paths[0], { dialogId: "importMusicXml", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });
	    if (paths.length > 1 && shouldReversePortalMultiSelection(settings)) paths.reverse();
	    return { ok: true, paths };
	  });

  ipcMain.handle("import:musicxml:convert-one", async (_event, inputPath) => {
    const filePath = String(inputPath || "");
    if (!filePath) return { ok: false, error: "No input file path." };
    try {
      const settings = getSettings ? getSettings() : {};
      const ext = path.extname(filePath || "").toLowerCase();
      const kind = ext === ".mxl" ? "mxl" : "musicxml";
      const converted = await convertFileToAbc({
        kind,
        inputPath: filePath,
        args: settings.xml2abcArgs || "",
      });
      return {
        ok: true,
        abcText: converted.abcText,
        warnings: converted.warnings || null,
        sourcePath: filePath,
      };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        detail: e && e.detail ? e.detail : "",
        code: e && e.code ? e.code : "",
      };
    }
  });
  ipcMain.handle("export:musicxml", async (event, abcText, suggestedName) => {
    if (!abcText || !String(abcText).trim()) {
      return { ok: false, error: "No notation to export." };
    }
    const safeName = suggestedName && String(suggestedName).trim()
      ? String(suggestedName).trim()
      : "tune";
    const parent = getParentForDialog(event, "export:musicxml");
    const filters = orderDialogFilters([
      { name: "MusicXML", extensions: ["musicxml", "xml"] },
      { name: "All Files", extensions: ["*"] },
    ], getDialogFilter("exportMusicXml", 2));
    let filePath = null;
    try {
      const result = await dialog.showSaveDialog(parent || undefined, {
        title: "Export MusicXML",
        defaultPath: getDialogPath({ dialogId: "exportMusicXml", suggestedName: `${safeName}.musicxml`, preferFileNameOnPortal: true }),
        filters,
      });
      filePath = result && !result.canceled ? result.filePath : null;
      if (filePath) rememberDialogPath(filePath, { dialogId: "exportMusicXml", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : "Unable to open save dialog.",
      };
    }
    if (!filePath) return { ok: false, canceled: true };
    try {
      const settings = getSettings ? getSettings() : {};
      const converted = await convertAbcToMusicXml({
        abcText: String(abcText),
        args: settings.abc2xmlArgs || "",
      });
      await fs.promises.writeFile(filePath, converted.xmlText, "utf8");
      return { ok: true, warnings: converted.warnings || null };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        detail: e && e.detail ? e.detail : "",
        code: e && e.code ? e.code : "",
      };
    }
  });
  const exportMusicXmlAll = async (event, payload) => {
    const data = payload && typeof payload === "object" ? payload : {};
    const rawItems = Array.isArray(data.items) ? data.items : [];
    if (!rawItems.length) return { ok: false, error: "No tunes to export." };
    if (rawItems.length > 10000) return { ok: false, error: "Too many tunes to export at once." };
    const items = rawItems.map((item, index) => ({
      abcText: String(item && item.abcText ? item.abcText : ""),
      xNumber: String(item && item.xNumber ? item.xNumber : ""),
      title: String(item && item.title ? item.title : ""),
      ordinal: index + 1,
    }));
    const totalChars = items.reduce((sum, item) => sum + item.abcText.length, 0);
    if (totalChars > 100 * 1024 * 1024) return { ok: false, error: "ABC export payload is too large." };
    const parent = getParentForDialog(event, "export:musicxml-all");
    const result = await dialog.showOpenDialog(parent || undefined, {
      title: "Choose Folder for MusicXML Tunes",
      defaultPath: getDialogPath({
        dialogId: "exportMusicXmlAll",
        suggestedDir: app.getPath("desktop"),
        directoryOnly: true,
        useSharedFallback: false,
      }),
      properties: ["openDirectory", "createDirectory"],
    });
    const parentDir = result && !result.canceled && result.filePaths && result.filePaths[0]
      ? String(result.filePaths[0])
      : "";
    if (!parentDir) return { ok: false, canceled: true };
    rememberDialogPath(parentDir, { dialogId: "exportMusicXmlAll", isDirectory: true });

    const sourceBase = sanitizeSuggestedFileBaseName(data.sourceName, "ABC tunes");
    let outputDir = path.join(parentDir, `${sourceBase} - MusicXML`);
    for (let suffix = 2; fs.existsSync(outputDir); suffix += 1) {
      outputDir = path.join(parentDir, `${sourceBase} - MusicXML (${suffix})`);
    }
    try {
      event.sender.send("export:musicxml-all:progress", { phase: "convert", done: 0, total: items.length });
      const settings = getSettings ? getSettings() : {};
      const converted = await convertAbcBatchToMusicXml({ items, args: settings.abc2xmlArgs || "" });
      await fs.promises.mkdir(outputDir, { recursive: false });
      const width = Math.max(3, String(items.length).length);
      let written = 0;
      for (const output of converted.converted || []) {
        const index = Number(output && output.index);
        if (!Number.isInteger(index) || index < 0 || index >= items.length) continue;
        const item = items[index];
        const xPart = item.xNumber ? `-X${sanitizeSuggestedFileBaseName(item.xNumber, "tune").slice(0, 24)}` : "";
        const titlePart = sanitizeSuggestedFileBaseName(item.title, "Untitled").slice(0, 70);
        const fileName = `${String(index + 1).padStart(width, "0")}${xPart}-${titlePart}.musicxml`;
        await atomicWriteFileWithRetry(fs, path, path.join(outputDir, fileName), String(output.xmlText || ""));
        written += 1;
        if (written === items.length || written % 10 === 0) {
          event.sender.send("export:musicxml-all:progress", { phase: "write", done: written, total: items.length });
        }
      }
      const failures = Array.isArray(converted.failures) ? converted.failures : [];
      if (failures.length) {
        const report = [
          `ABCarus MusicXML batch export`,
          `Exported: ${written}/${items.length}`,
          "",
          "Failed tunes:",
        ];
        for (const failure of failures) {
          const index = Number(failure && failure.index);
          const item = Number.isInteger(index) && items[index] ? items[index] : null;
          const label = item ? `${index + 1}. X:${item.xNumber || "?"} ${item.title || "Untitled"}` : `Tune ${index + 1}`;
          report.push(`${label}: ${String(failure && failure.error ? failure.error : "Conversion failed.")}`);
          if (failure && failure.detail) report.push(`  ${String(failure.detail).replace(/\s+/g, " ").trim()}`);
        }
        await atomicWriteFileWithRetry(fs, path, path.join(outputDir, "export-report.txt"), `${report.join("\n")}\n`);
      }
      return {
        ok: true,
        outputDir,
        exported: written,
        failed: failures.length,
        warnings: converted.warnings || null,
      };
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? String(error.message) : String(error),
        detail: error && error.detail ? String(error.detail) : "",
        code: error && error.code ? String(error.code) : "",
      };
    }
  };
  ipcMain.on("export:musicxml-all", (event, envelope) => {
    const requestId = envelope && envelope.requestId ? String(envelope.requestId) : "";
    if (!/^\d+-\d+$/.test(requestId)) return;
    const payload = envelope && envelope.payload && typeof envelope.payload === "object"
      ? envelope.payload
      : {};
    exportMusicXmlAll(event, payload)
      .then((result) => {
        if (!event.sender.isDestroyed()) {
          event.reply("export:musicxml-all:result", { requestId, result });
        }
      })
      .catch((error) => {
        if (!event.sender.isDestroyed()) {
          event.reply("export:musicxml-all:result", {
            requestId,
            result: {
              ok: false,
              error: error && error.message ? String(error.message) : String(error),
            },
          });
        }
      });
  });
  ipcMain.handle("export:midi", async (event, midiBytes, suggestedName) => {
    const toBuffer = (value) => {
      if (!value) return null;
      if (Buffer.isBuffer(value)) return value;
      if (value instanceof Uint8Array) return Buffer.from(value);
      if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
      if (typeof value === "string") return Buffer.from(value, "base64");
      return null;
    };
    const buf = toBuffer(midiBytes);
    if (!buf || !buf.length) {
      return { ok: false, error: "No MIDI data to export." };
    }
    const safeName = suggestedName && String(suggestedName).trim()
      ? String(suggestedName).trim()
      : "tune";
    const parent = getParentForDialog(event, "export:midi");
    const filters = orderDialogFilters([
      { name: "MIDI", extensions: ["mid", "midi"] },
      { name: "All Files", extensions: ["*"] },
    ], getDialogFilter("exportMidi", 2));
    const result = await dialog.showSaveDialog(parent || undefined, {
      title: "Export MIDI",
      defaultPath: getDialogPath({ dialogId: "exportMidi", suggestedName: `${safeName}.mid`, preferFileNameOnPortal: true }),
      filters,
    });
    const filePath = result && !result.canceled ? result.filePath : null;
    if (!filePath) return { ok: false, canceled: true };
    rememberDialogPath(filePath, { dialogId: "exportMidi", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });
    try {
      await atomicWriteFileWithRetry(fs, path, filePath, buf);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        detail: e && e.detail ? e.detail : "",
        code: e && e.code ? e.code : "",
      };
    }
  });
  ipcMain.handle("export:mp3", async (event, midiBytes, suggestedName) => {
    const toBuffer = (value) => {
      if (!value) return null;
      if (Buffer.isBuffer(value)) return value;
      if (value instanceof Uint8Array) return Buffer.from(value);
      if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
      if (typeof value === "string") return Buffer.from(value, "base64");
      return null;
    };
    const buf = toBuffer(midiBytes);
    if (!buf || !buf.length) {
      return { ok: false, error: "No MIDI data to export." };
    }
    const settings = getSettings ? getSettings() : {};
    const toolchain = await resolveMp3Toolchain({ fs, pathModule: path, settings });
    if (!toolchain.ok) {
      return {
        ok: false,
        error: "MP3 export is unavailable. Configure FFmpeg and TiMidity++ in Settings -> Options -> Import/Export.",
      };
    }
    const safeName = suggestedName && String(suggestedName).trim()
      ? String(suggestedName).trim()
      : "tune";
    const parent = getParentForDialog(event, "export:mp3");
    const filters = orderDialogFilters([
      { name: "MP3", extensions: ["mp3"] },
      { name: "All Files", extensions: ["*"] },
    ], getDialogFilter("exportMp3", 2));
    const result = await dialog.showSaveDialog(parent || undefined, {
      title: "Export MP3",
      defaultPath: getDialogPath({ dialogId: "exportMp3", suggestedName: `${safeName}.mp3`, preferFileNameOnPortal: true }),
      filters,
    });
    const filePath = result && !result.canceled ? result.filePath : null;
    if (!filePath) return { ok: false, canceled: true };
    rememberDialogPath(filePath, { dialogId: "exportMp3", filterIndex: getDialogOriginalFilterIndex(filters, result.filterIndex) });

    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tempDir = path.join(os.tmpdir(), `abcarus-mp3-${token}`);
    const tempMidi = path.join(tempDir, "source.mid");
    const tempWav = path.join(tempDir, "source.wav");
    const tempMp3 = path.join(tempDir, "out.mp3");
    try {
      await fs.promises.mkdir(tempDir, { recursive: true });
      await atomicWriteFileWithRetry(fs, path, tempMidi, buf);
      await runExecFile(toolchain.timidity, [tempMidi, "-Ow", "-o", tempWav], 180000);
      await runExecFile(toolchain.ffmpeg, ["-y", "-i", tempWav, "-acodec", "libmp3lame", "-ab", "64k", tempMp3], 180000);
      await atomicCopyFileWithRetry(fs, path, tempMp3, filePath);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
      };
    } finally {
      await removeDirBestEffort(fs, tempDir);
    }
  });
  ipcMain.handle("chordpro:pdf", async (_event, inputPath, outputPath) => {
    try {
      const settings = getSettings ? getSettings() : {};
      await runChordProPdf({ app, fs, path, inputPath, outputPath, settings });
      await shell.openPath(String(outputPath || ""));
      return { ok: true, path: String(outputPath || "") };
    } catch (e) {
      return { ok: false, error: e && e.message ? String(e.message) : String(e) };
    }
  });
  ipcMain.handle("chordpro:preview", async (_event, payload) => {
    try {
      const settings = getSettings ? getSettings() : {};
      const data = payload && typeof payload === "object" ? payload : { inputPath: payload };
      const inPathRaw = data && data.inputPath ? String(data.inputPath || "") : "";
      const text = data && data.text != null ? String(data.text) : null;
      const baseFromSource = data && data.sourcePath ? path.basename(String(data.sourcePath || ""), path.extname(String(data.sourcePath || ""))) : "";
      const baseName = baseFromSource || (inPathRaw ? path.basename(inPathRaw, path.extname(inPathRaw)) : "") || "chordpro";
      let inPath = inPathRaw;
      if (text != null) {
        const tokenInput = Math.random().toString(16).slice(2);
        const inputName = `${baseName}-${Date.now()}-${tokenInput}.cho`;
        inPath = path.join(os.tmpdir(), inputName);
        await atomicWriteFileWithRetry(fs, path, inPath, text);
      }
      if (!inPath) return { ok: false, error: "Missing input path." };
      const base = path.basename(inPath, path.extname(inPath)) || "chordpro";
      const token = Math.random().toString(16).slice(2);
      const fileName = `${base}-${Date.now()}-${token}.pdf`;
      const outputPath = path.join(os.tmpdir(), fileName);
      await runChordProPdf({ app, fs, path, inputPath: inPath, outputPath, settings });
      await shell.openPath(String(outputPath || ""));
      return { ok: true, path: String(outputPath || "") };
    } catch (e) {
      return { ok: false, error: e && e.message ? String(e.message) : String(e) };
    }
  });
  ipcMain.handle("chordpro:check", async () => {
    try {
      const settings = getSettings ? getSettings() : {};
      return await checkChordProAvailable({ app, fs, path, settings });
    } catch (e) {
      return { ok: false, error: e && e.message ? String(e.message) : String(e) };
    }
  });
  ipcMain.handle("tools:check", async () => {
    try {
      const tools = await checkConversionTools();
      return { ok: true, tools };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        detail: e && e.detail ? e.detail : "",
        code: e && e.code ? e.code : "",
      };
    }
  });
  ipcMain.handle("file:read", async (_e, filePath) => {
    try {
      const p = filePath ? String(filePath) : "";
      if (!p) return { ok: false, error: "Missing file path." };
      const raw = await fs.promises.readFile(p);
      if (p.toLowerCase().endsWith(".abc")) {
        return { ok: true, data: decodeAbcTextFromBuffer(raw).text };
      }
      return { ok: true, data: raw.toString("utf8") };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("file:write", async (_e, filePath, data, options) => {
    try {
      const p = filePath ? String(filePath) : "";
      if (!p) return { ok: false, error: "Missing file path." };
      const opts = options && typeof options === "object" ? options : {};
      if (Object.prototype.hasOwnProperty.call(opts, "expectedData")) {
        let currentText = "";
        try {
          const currentBuffer = await fs.promises.readFile(p);
          currentText = p.toLowerCase().endsWith(".abc")
            ? decodeAbcTextFromBuffer(currentBuffer).text
            : currentBuffer.toString("utf8");
        } catch (e) {
          return { ok: false, error: e && e.message ? e.message : String(e), code: e && e.code ? e.code : "" };
        }
        if (currentText !== String(opts.expectedData == null ? "" : opts.expectedData)) {
          return { ok: false, conflict: true, error: "File changed on disk." };
        }
      }
      if (p.toLowerCase().endsWith(".abc")) {
        const encoded = encodeAbcTextToBuffer(String(data == null ? "" : data));
        await atomicWriteFileWithRetry(fs, path, p, encoded.buffer);
      } else {
        await atomicWriteFileWithRetry(fs, path, p, String(data == null ? "" : data));
      }
      const verifyBuffer = await fs.promises.readFile(p);
      const verifyText = p.toLowerCase().endsWith(".abc")
        ? decodeAbcTextFromBuffer(verifyBuffer).text
        : verifyBuffer.toString("utf8");
      if (verifyText !== String(data == null ? "" : data)) {
        return { ok: false, error: "Save verification failed: on-disk content does not match the requested text." };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("file:rename", async (_e, oldPath, newPath) => {
    const sourcePath = String(oldPath || "");
    const targetPath = String(newPath || "");
    if (!sourcePath || !targetPath) return { ok: false, error: "Missing file path." };
    if (sourcePath === targetPath) return { ok: true };
    try {
      await fs.promises.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
      const [sourceData, targetData] = await Promise.all([
        fs.promises.readFile(sourcePath),
        fs.promises.readFile(targetPath),
      ]);
      if (!sourceData.equals(targetData)) {
        try { await fs.promises.unlink(targetPath); } catch {}
        return { ok: false, error: "Rename verification failed; source file was preserved." };
      }
      // Do not delete a source that changed after the copy was verified.
      const sourceBeforeDelete = await fs.promises.readFile(sourcePath);
      if (!sourceData.equals(sourceBeforeDelete)) {
        try { await fs.promises.unlink(targetPath); } catch {}
        return { ok: false, conflict: true, error: "Source file changed during rename; source file was preserved." };
      }
      try {
        await fs.promises.unlink(sourcePath);
      } catch (e) {
        try { await fs.promises.unlink(targetPath); } catch {}
        return {
          ok: false,
          error: `Unable to remove source file after verified copy: ${e && e.message ? e.message : String(e)}`,
          code: e && e.code ? e.code : "",
        };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), code: e && e.code ? e.code : "" };
    }
  });
  ipcMain.handle("file:exists", async (_e, filePath) => {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("file:mkdirp", async (_e, dirPath) => {
    try {
      await fs.promises.mkdir(String(dirPath || ""), { recursive: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("library:scan", async (event, rootDir, options) => {
    if (!rootDir) return { root: "", files: [] };
    return scanLibrary(rootDir, event.sender, options || {});
  });
  ipcMain.handle("library:scan-discover", async (event, rootDir, options) => {
    if (!rootDir) return { root: "", files: [] };
    if (typeof scanLibraryDiscover === "function") {
      return scanLibraryDiscover(rootDir, event.sender, options || {});
    }
    return { root: "", files: [] };
  });
  ipcMain.handle("library:cancel-scan", async (event) => {
    if (typeof cancelLibraryScan === "function") cancelLibraryScan(event.sender);
    return true;
  });
  ipcMain.handle("library:parse-file", async (event, filePath, options) => {
    if (!filePath) return { root: "", files: [] };
    const res = await parseSingleFile(filePath, event.sender, options);
    return res || { root: "", files: [] };
  });

  ipcMain.handle("templates:get-info", async () => {
    try {
      const resolved = resolveTemplatesFolder();
      return {
        ok: true,
        folder: resolved.folder,
        configured: resolved.configured,
        fallback: resolved.fallback,
        platformDefault: resolved.platformDefault,
      };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("templates:pick-folder", async (event) => {
    const parent = getParentForDialog(event, "templates:pick-folder");
    try {
      const resolved = resolveTemplatesFolder();
      const res = dialog.showOpenDialogSync(parent || undefined, {
        title: "Choose Templates Folder",
        defaultPath: getDialogPath({ dialogId: "templatesFolder", suggestedPath: resolved.folder, directoryOnly: true }),
        properties: ["openDirectory", "createDirectory"],
      });
      if (!res || !res.length) return { ok: true, canceled: true };
      const selected = String(res[0] || "");
      if (!selected) return { ok: true, canceled: true };
      rememberDialogPath(selected, { isDirectory: true, dialogId: "templatesFolder" });
      if (typeof updateSettings === "function") {
        await updateSettings({ templatesFolder: selected });
      }
      return { ok: true, folder: selected };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("templates:open-folder", async () => {
    try {
      const resolved = resolveTemplatesFolder();
      await fs.promises.mkdir(resolved.folder, { recursive: true });
      await shell.openPath(resolved.folder);
      return { ok: true, folder: resolved.folder };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("templates:open-file", async (_event, filePath) => {
    try {
      const p = String(filePath || "");
      if (!p) return { ok: false, error: "Missing file path." };
      const err = await shell.openPath(p);
      if (err) return { ok: false, error: String(err) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("templates:scan", async () => {
    try {
      const resolved = resolveTemplatesFolder();
      await fs.promises.mkdir(resolved.folder, { recursive: true });
      const discovered = await scanTemplatesFolder(resolved.folder);
      const outFiles = [];
      for (const filePath of discovered.files) {
        const parsed = await parseSingleFile(filePath, null, { force: true });
        if (!parsed || !parsed.files || !parsed.files.length) continue;
        const file = parsed.files[0];
        if (file) {
          try {
            const stat = await fs.promises.stat(filePath);
            if (Number.isFinite(stat.size)) file.length = stat.size;
          } catch {}
        }
        outFiles.push(file);
      }
      return { ok: true, root: discovered.root, files: outFiles };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("print:preview", async (_event, svgMarkup, suggestedName) => {
    if (!svgMarkup) return { ok: false, error: "No notation to print." };
    const safeName = sanitizeSuggestedFileBaseName(suggestedName, "abc-preview");
    if (typeof previewPdf === "function") return previewPdf(svgMarkup, safeName);
    const tmpName = `${safeName}-${Date.now()}.pdf`;
    const tmpPath = path.join(app.getPath("temp"), tmpName);
    const res = await withMainPrintMode(async (contents) => {
      const pdfData = await contents.printToPDF({ printBackground: true, margins: { marginType: "custom", top: 0, bottom: 0, left: 0, right: 0 } });
      await fs.promises.writeFile(tmpPath, pdfData);
      return { ok: true, path: tmpPath };
    });
    if (res.ok && res.path) await shell.openPath(res.path);
    return res;
  });
  ipcMain.handle("print:dialog", async (_event, svgMarkup, suggestedName) => {
    if (!svgMarkup) return { ok: false, error: "No notation to print." };
    const safeName = sanitizeSuggestedFileBaseName(suggestedName, "abc-print");
    if (os.platform() === "linux") {
      return printViaPdf(svgMarkup, safeName);
    }
    if (typeof printWithDialog === "function") return printWithDialog(svgMarkup, safeName);
    return withMainPrintMode((contents) =>
      new Promise((resolve) => {
        contents.print({ printBackground: true, silent: false, margins: { marginType: "custom", top: 0, bottom: 0, left: 0, right: 0 } }, (success, failureReason) => {
          if (!success) return resolve({ ok: false, error: failureReason || "Print failed" });
          resolve({ ok: true });
        });
      })
    );
  });
  ipcMain.handle("print:pdf", async (event, svgMarkup, suggestedName) => {
    if (!svgMarkup) return { ok: false, error: "No notation to export." };
    const safeName = sanitizeSuggestedFileBaseName(suggestedName, "tune");
    const parent = getParentForDialog(event, "print:pdf");
    const filePath = dialog.showSaveDialogSync(parent || undefined, {
      title: "Export PDF",
      defaultPath: getDialogPath({ dialogId: "printPdf", suggestedName: `${safeName}.pdf`, preferFileNameOnPortal: true }),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!filePath) return { ok: false, error: "Canceled" };
    rememberDialogPath(filePath, { dialogId: "printPdf" });
    if (typeof exportPdf === "function") return exportPdf(svgMarkup, filePath);
    return withMainPrintMode(async (contents) => {
      try {
        const pdfData = await contents.printToPDF({ printBackground: true, margins: { marginType: "custom", top: 0, bottom: 0, left: 0, right: 0 } });
        await fs.promises.writeFile(filePath, pdfData);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    });
  });
  ipcMain.handle("recent:add", async (_event, entry) => {
    addRecentTune(entry);
    return true;
  });
  ipcMain.handle("recent:file", async (_event, entry) => {
    addRecentFile(entry);
    return true;
  });
  ipcMain.handle("recent:folder", async (_event, entry) => {
    addRecentFolder(entry);
    return true;
  });
  ipcMain.handle("app:quit", async () => {
    await requestQuit();
  });
  ipcMain.handle("app:recovery-dir", async () => {
    try {
      const userData = app && typeof app.getPath === "function" ? app.getPath("userData") : "";
      return userData ? path.join(userData, "recovery") : "";
    } catch {
      return "";
    }
  });
  ipcMain.handle("app:cancel-quit", async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && win.__abcarusForceQuitTimer) {
        clearTimeout(win.__abcarusForceQuitTimer);
        win.__abcarusForceQuitTimer = null;
      }
    } catch {}
    return true;
  });
  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });
  ipcMain.handle("settings:schema", async () => {
    try {
      return { ok: true, schema: getSettingsSchema() };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  async function resolveFontDirs() {
    const appRoot = (app && typeof app.getAppPath === "function") ? app.getAppPath() : process.cwd();
    const bundledDir = path.join(appRoot, "assets", "fonts", "notation");
    const userData = (app && typeof app.getPath === "function") ? app.getPath("userData") : "";
    const settingsPaths = (typeof getSettingsPaths === "function") ? getSettingsPaths() : null;
    const profilePath = settingsPaths && settingsPaths.profilePath ? String(settingsPaths.profilePath) : "";
    const profileDir = profilePath ? path.dirname(profilePath) : userData;
    const userDir = profileDir ? path.join(profileDir, "fonts", "notation") : "";
    if (userDir) {
      try { await fs.promises.mkdir(userDir, { recursive: true }); } catch {}
    }
    return { bundledDir, userDir };
  }

  ipcMain.handle("fonts:dirs", async () => {
    try {
      const { bundledDir, userDir } = await resolveFontDirs();
      return { ok: true, bundledDir, userDir };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), bundledDir: "", userDir: "" };
    }
  });

  async function readFontDirFonts(dirPath) {
    if (!dirPath) return [];
    let names = [];
    try {
      names = await fs.promises.readdir(dirPath);
    } catch {
      names = [];
    }
    return (names || [])
      .map((name) => String(name || ""))
      .filter((name) => /\.(otf|ttf|woff2?)$/i.test(name))
      .filter((name) => !name.startsWith("."))
      .sort((a, b) => a.localeCompare(b));
  }

  ipcMain.handle("fonts:list", async () => {
    try {
      const { bundledDir, userDir } = await resolveFontDirs();
      const bundledFiles = await readFontDirFonts(bundledDir);
      const userFiles = await readFontDirFonts(userDir);

      const split = (files) => {
        const notation = [];
        const text = [];
        for (const f of files) {
          if (classifyFontName(f) === "text") text.push(f);
          else notation.push(f);
        }
        return { notation, text };
      };
      return { ok: true, bundled: split(bundledFiles), user: split(userFiles) };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), bundled: { notation: [], text: [] }, user: { notation: [], text: [] } };
    }
  });

  ipcMain.handle("fonts:pick", async (event) => {
    try {
      const parent = getParentForDialog(event, "fonts:pick");
      const result = await dialog.showOpenDialog(parent || undefined, {
        modal: true,
        title: "Add font",
        properties: ["openFile"],
        defaultPath: getDialogPath(),
        filters: [{ name: "Fonts", extensions: ["otf", "ttf", "woff", "woff2"] }, { name: "All Files", extensions: ["*"] }],
      });
      if (!result || result.canceled || !Array.isArray(result.filePaths) || !result.filePaths[0]) return { ok: false, error: "Canceled" };
      const selected = String(result.filePaths[0] || "");
      if (selected) rememberDialogPath(selected);
      return { ok: true, path: selected };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("fonts:install", async (_event, srcPath) => {
    try {
      const { userDir } = await resolveFontDirs();
      if (!userDir) return { ok: false, error: "Fonts directory is unavailable." };

      const source = String(srcPath || "");
      if (!source) return { ok: false, error: "Missing font path." };
      const baseName = sanitizeFontFileName(path.basename(source));
      if (!baseName) return { ok: false, error: "Unsupported font filename." };

      const targetPath = path.join(userDir, baseName);
      await atomicCopyFileWithRetry(fs, path, source, targetPath);
      return { ok: true, name: baseName };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("fonts:remove", async (_event, fileName) => {
    try {
      const { userDir } = await resolveFontDirs();
      if (!userDir) return { ok: false, error: "Fonts directory is unavailable." };

      const safeName = sanitizeFontFileName(fileName);
      if (!safeName) return { ok: false, error: "Invalid font filename." };
      const targetPath = path.join(userDir, safeName);
      await fs.promises.unlink(targetPath).catch((e) => {
        if (e && e.code === "ENOENT") return;
        throw e;
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("settings:paths", async () => {
    if (ctx && typeof ctx.getSettingsPaths === "function") return ctx.getSettingsPaths();
    return { globalPath: "", userPath: "" };
  });
  ipcMain.handle("settings:global-header-read", async () => {
    try {
      const paths = (typeof getSettingsPaths === "function") ? getSettingsPaths() : { userPath: "" };
      const filePath = paths && paths.userPath ? String(paths.userPath) : "";
      if (!filePath) return { ok: false, error: "Global Header path is unavailable." };
      try {
        const text = await fs.promises.readFile(filePath, "utf8");
        return { ok: true, path: filePath, exists: true, text };
      } catch (error) {
        if (error && error.code === "ENOENT") {
          return { ok: true, path: filePath, exists: false, text: "" };
        }
        throw error;
      }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  });
  ipcMain.handle("settings:global-header-write", async (event, value) => {
    try {
      const paths = (typeof getSettingsPaths === "function") ? getSettingsPaths() : { userPath: "" };
      const filePath = paths && paths.userPath ? String(paths.userPath) : "";
      if (!filePath) return { ok: false, error: "Global Header path is unavailable." };
      const text = String(value == null ? "" : value);
      let exists = false;
      try {
        const stat = await fs.promises.stat(filePath);
        exists = Boolean(stat && stat.isFile());
      } catch (error) {
        if (!(error && error.code === "ENOENT")) throw error;
      }
      if (!exists && !text.trim()) {
        return { ok: true, path: filePath, exists: false, text: "" };
      }
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await atomicWriteFileWithRetry(fs, path, filePath, text);
      try { event.sender.send("settings:changed", getSettings()); } catch {}
      return { ok: true, path: filePath, exists: true, text };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  });
  ipcMain.handle("settings:update", async (_event, patch) => {
    return updateSettings(patch || {});
  });
  ipcMain.handle("settings:export", async (event) => {
    try {
      const parent = getParentForDialog(event, "export-settings");
      const documentsDir = (app && typeof app.getPath === "function") ? app.getPath("documents") : "";
      const suggestedDir = documentsDir ? path.join(documentsDir, "ABCarus") : "";
      if (suggestedDir) {
        try { await fs.promises.mkdir(suggestedDir, { recursive: true }); } catch {}
      }
      const defaultPath = suggestedDir ? path.join(suggestedDir, "abcarus-profile.json") : "abcarus-profile.json";
      const result = await dialog.showSaveDialog(parent || undefined, {
        modal: true,
        title: "Export ABCarus Profile",
        defaultPath: getDialogPath({
          suggestedName: "abcarus-profile.json",
          suggestedDir: suggestedDir || "",
          suggestedPath: defaultPath,
          preferFileNameOnPortal: true,
        }),
        filters: [{ name: "ABCarus Profile", extensions: ["json"] }, { name: "All Files", extensions: ["*"] }],
      });
      if (!result || result.canceled || !result.filePath) return { ok: false, error: "Canceled" };
      const filePath = String(result.filePath);
      rememberDialogPath(filePath);

      const profile = typeof getProfileSnapshot === "function" ? getProfileSnapshot() : null;
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw new Error("ABCarus profile is unavailable.");
      }
      await atomicWriteFileWithRetry(fs, path, filePath, serializeProfileDocument(profile));

      const paths = (typeof getSettingsPaths === "function") ? getSettingsPaths() : { userPath: "" };
      const userHeaderPath = paths && paths.userPath ? String(paths.userPath) : "";
      const exportDir = path.dirname(filePath);
      const exportHeaderPath = path.join(exportDir, "user_settings.abc");
      let userHeaderText = "";
      let userHeaderExists = false;
      try {
        if (userHeaderPath) {
          userHeaderText = await fs.promises.readFile(userHeaderPath, "utf8");
          userHeaderExists = true;
        }
      } catch (error) {
        const code = error && error.code ? String(error.code) : "";
        if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      }
      if (userHeaderExists) {
        await atomicWriteFileWithRetry(fs, path, exportHeaderPath, userHeaderText);
      }

      let exportedFonts = 0;
      const { userDir: userFontsDir } = await resolveFontDirs();
      const userFontFiles = await readFontDirFonts(userFontsDir);
      const exportFontsDir = path.join(exportDir, "fonts", "notation");
      for (const fontFile of userFontFiles) {
        const sourcePath = path.join(userFontsDir, fontFile);
        const targetPath = path.join(exportFontsDir, fontFile);
        if (path.resolve(sourcePath) === path.resolve(targetPath)) continue;
        await fs.promises.mkdir(exportFontsDir, { recursive: true });
        await atomicCopyFileWithRetry(fs, path, sourcePath, targetPath);
        exportedFonts += 1;
      }
      return { ok: true, path: filePath, exportedHeader: userHeaderExists, exportedFonts };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("settings:import", async (event) => {
    try {
      const parent = getParentForDialog(event, "import-settings");
      const documentsDir = (app && typeof app.getPath === "function") ? app.getPath("documents") : "";
      const suggestedDir = documentsDir ? path.join(documentsDir, "ABCarus") : "";
      const result = await dialog.showOpenDialog(parent || undefined, {
        modal: true,
        title: "Import ABCarus Profile",
        properties: ["openFile"],
        defaultPath: getDialogPath({
          suggestedPath: suggestedDir || "",
          directoryOnly: true,
        }),
        filters: [
          { name: "ABCarus Profile", extensions: ["json"] },
          { name: "Legacy Properties", extensions: ["properties"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!result || result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, error: "Canceled" };
      const filePath = String(result.filePaths[0]);
      rememberDialogPath(filePath);
      const raw = await fs.promises.readFile(filePath, "utf8");
      const schema = getSettingsSchema();
      let profile = null;
      try {
        profile = parseProfileDocument(raw);
      } catch (error) {
        if (/\.json$/i.test(filePath)) throw error;
      }
      const patch = profile ? null : parseSettingsPatchFromProperties(raw, schema);

      const importDir = path.dirname(filePath);
      const importedHeaderPath = path.join(importDir, "user_settings.abc");
      const paths = (typeof getSettingsPaths === "function") ? getSettingsPaths() : { userPath: "" };
      const userHeaderPath = paths && paths.userPath ? String(paths.userPath) : "";
      let importedHeader = false;
      let importedHeaderText = "";
      let hasImportedHeader = false;
      try {
        importedHeaderText = await fs.promises.readFile(importedHeaderPath, "utf8");
        hasImportedHeader = true;
      } catch (error) {
        const code = error && error.code ? String(error.code) : "";
        if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      }

      // New exports use the sidecar. Embedded text is accepted only for
      // backward compatibility with older .properties files.
      const embeddedHeader = profile && profile.settings && typeof profile.settings === "object"
        ? profile.settings.globalHeaderText
        : patch && patch.globalHeaderText;
      const hasEmbeddedHeader = embeddedHeader != null;
      if (!hasImportedHeader && hasEmbeddedHeader && String(embeddedHeader || "").trim()) {
        importedHeaderText = String(embeddedHeader || "");
        hasImportedHeader = true;
      }
      if (hasImportedHeader) {
        if (userHeaderPath) {
          await atomicWriteFileWithRetry(fs, path, userHeaderPath, importedHeaderText);
          importedHeader = true;
        }
      }
      if (profile && profile.settings && typeof profile.settings === "object") {
        delete profile.settings.globalHeaderText;
      }
      if (patch) delete patch.globalHeaderText;

      let importedFonts = 0;
      const importFontsDir = path.join(importDir, "fonts", "notation");
      const importedFontFiles = await readFontDirFonts(importFontsDir);
      if (importedFontFiles.length) {
        const { userDir: userFontsDir } = await resolveFontDirs();
        for (const fontFile of importedFontFiles) {
          const sourcePath = path.join(importFontsDir, fontFile);
          const targetPath = path.join(userFontsDir, fontFile);
          if (path.resolve(sourcePath) === path.resolve(targetPath)) continue;
          await atomicCopyFileWithRetry(fs, path, sourcePath, targetPath);
          importedFonts += 1;
        }
      }

      const next = profile && typeof importProfileSnapshot === "function"
        ? await importProfileSnapshot(profile)
        : updateSettings(patch || {});
      return { ok: true, path: filePath, importedHeader, importedFonts, settings: next };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("settings:open-folder", async () => {
    try {
      const paths = (typeof getSettingsPaths === "function") ? getSettingsPaths() : { userPath: "" };
      const userHeaderPath = paths && paths.userPath ? String(paths.userPath) : "";
      const settingsDir = userHeaderPath ? path.dirname(userHeaderPath) : "";
      if (!settingsDir) return { ok: false, error: "Unavailable." };
      await fs.promises.mkdir(settingsDir, { recursive: true });
      await shell.openPath(settingsDir);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  function resolveMakamDnaUserPath() {
    if (!app || typeof app.getPath !== "function") return "";
    const userData = app.getPath("userData");
    if (!userData) return "";
    return path.join(String(userData), "makam_dna_user.json");
  }

  function extractMakamDnaEntriesFromParsed(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== "object") return null;
    if (Array.isArray(parsed.entries)) return parsed.entries;
    if (parsed.rawTable && Array.isArray(parsed.rawTable.entries)) return parsed.rawTable.entries;
    return null;
  }

  ipcMain.handle("makam-dna:user:get", async () => {
    try {
      const filePath = resolveMakamDnaUserPath();
      if (!filePath) return { ok: false, error: "Unavailable." };
      try {
        const text = await fs.promises.readFile(filePath, "utf8");
        return { ok: true, exists: true, text: String(text || "") };
      } catch (e) {
        const code = e && e.code ? String(e.code) : "";
        if (code === "ENOENT") return { ok: true, exists: false, text: "" };
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("makam-dna:user:save", async (_event, payload) => {
    try {
      const filePath = resolveMakamDnaUserPath();
      if (!filePath) return { ok: false, error: "Unavailable." };
      const text = payload && payload.text != null ? String(payload.text) : "";
      if (!text.trim()) return { ok: false, error: "Empty JSON." };
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : "Invalid JSON." };
      }
      const entries = extractMakamDnaEntriesFromParsed(parsed);
      if (!Array.isArray(entries)) return { ok: false, error: "Expected an array (or an object with entries/rawTable.entries)." };
      const hasMakam = entries.some((e) => e && typeof e === "object" && String(e.makam || "").trim());
      if (!hasMakam) return { ok: false, error: "No valid entries (each entry must include a non-empty makam)." };
      await atomicWriteFileWithRetry(fs, path, filePath, text);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle("makam-dna:user:clear", async () => {
    try {
      const filePath = resolveMakamDnaUserPath();
      if (!filePath) return { ok: false, error: "Unavailable." };
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        const code = e && e.code ? String(e.code) : "";
        if (code !== "ENOENT") throw e;
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  // Note: we intentionally do not expose attach/detach/reload controls in the UI.
  // The file-backed mode is activated by Export/Import and silently falls back to internal if the file disappears.
  ipcMain.handle("recent:last", async () => getLastRecent());
  ipcMain.handle("recent:candidates", async () => (
    typeof getRecentCandidates === "function" ? getRecentCandidates() : []
  ));
  ipcMain.handle("app:startup-status", async (_event, text) => {
    try {
      if (typeof reportStartupStatus === "function") {
        const label = String(text || "").trim().slice(0, 120);
        if (label) reportStartupStatus(label);
      }
    } catch {}
    return { ok: true };
  });
  ipcMain.handle("shell:open-external", async (_event, url) => {
    try {
      const target = normalizeAllowedExternalUrl(url);
      if (!target) return { ok: false, error: "Only HTTP(S) links may be opened externally." };
      await shell.openExternal(target);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("source:preview-youtube", async (event, url) => {
    try {
      if (!BrowserWindow) return { ok: false, error: "BrowserWindow is unavailable." };
      const targetUrl = normalizeYouTubeWatchUrl(url);
      if (!targetUrl) return { ok: false, error: "Preview is available only for YouTube video links." };
      const parent = getDialogParent ? getDialogParent(event, "source:preview-youtube") : null;
      const win = new BrowserWindow({
        width: 960,
        height: 720,
        minWidth: 640,
        minHeight: 420,
        parent: parent || undefined,
        modal: false,
        autoHideMenuBar: false,
        title: "YouTube Source Preview",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      sourcePreviewWindows.add(win);
      win.on("closed", () => sourcePreviewWindows.delete(win));
      guardSourcePreviewNavigation(win);
      await win.loadURL(targetUrl);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("app:about", async () => {
    const versionInfo = getVersionInfo();
    const buildDate = process.env.ABCARUS_BUILD_DATE || "";
    const env = process.env || {};
    const osReleaseInfo = await readOsRelease(ctx.fs);
    const pythonVersion = await getPythonVersion();
    const abc2svg = await readAbc2svgVersionInfo({ fs, path, app });
    return {
      appName: app.getName ? app.getName() : "ABCarus",
      appVersion: app.getVersion ? app.getVersion() : "",
      commit: versionInfo.commit,
      build: versionInfo.build,
      channel: versionInfo.channel,
      buildDate: String(buildDate),
      electron: process.versions.electron || "",
      electronBuildId: process.env.ELECTRON_BUILD_ID || "",
      chrome: process.versions.chrome || "",
      node: process.versions.node || "",
      v8: process.versions.v8 || "",
      platform: process.platform || "",
      arch: process.arch || "",
      osRelease: os.release(),
      distroPrettyName: osReleaseInfo ? osReleaseInfo.prettyName : "",
      distroName: osReleaseInfo ? osReleaseInfo.name : "",
      distroVersion: osReleaseInfo ? osReleaseInfo.version : "",
      distroId: osReleaseInfo ? osReleaseInfo.id : "",
      distroVersionId: osReleaseInfo ? osReleaseInfo.versionId : "",
      desktop: String(env.XDG_CURRENT_DESKTOP || env.DESKTOP_SESSION || env.GDMSESSION || ""),
      xdgCurrentDesktop: String(env.XDG_CURRENT_DESKTOP || ""),
      desktopSession: String(env.DESKTOP_SESSION || ""),
      sessionType: String(env.XDG_SESSION_TYPE || ""),
      display: String(env.DISPLAY || ""),
      waylandDisplay: String(env.WAYLAND_DISPLAY || ""),
      lang: String(env.LANG || ""),
      lcAll: String(env.LC_ALL || ""),
      pythonVersion,
      abc2svgVersion: abc2svg.version,
      abc2svgDate: abc2svg.date,
    };
  });
}

module.exports = { registerIpcHandlers };
