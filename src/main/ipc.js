const {
  convertFileToAbc,
  convertAbcToMusicXml,
  transformAbcWithAbc2abc,
  checkConversionTools,
} = require("./conversion");

const os = require("os");
const { execFile } = require("child_process");
const { fileURLToPath } = require("url");
const { getVersionInfo } = require("../version");

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

function execVersion(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 1200 }, (err, stdout, stderr) => {
      if (err) return resolve("");
      const text = String(stdout || stderr || "").trim();
      resolve(text);
    });
  });
}

async function atomicWriteFileWithRetry(fs, path, filePath, data, { attempts = 5 } = {}) {
  const absPath = String(filePath || "");
  if (!absPath) throw new Error("Missing file path.");
  const tmpPath = path.join(
    path.dirname(absPath),
    `.${path.basename(absPath)}.${process.pid}.${Date.now()}.tmp`
  );
  await fs.promises.writeFile(tmpPath, data, "utf8");
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      try {
        await fs.promises.rename(tmpPath, absPath);
        return;
      } catch (e) {
        // Windows often fails rename when target exists; remove and retry.
        try { await fs.promises.unlink(absPath); } catch {}
        await fs.promises.rename(tmpPath, absPath);
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

async function getPythonVersion() {
  const python3 = await execVersion("python3", ["--version"]);
  if (python3) return python3;
  const python = await execVersion("python", ["--version"]);
  if (python) return python;
  return "";
}

function registerIpcHandlers(ctx) {
  const {
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
    confirmAppendToFile,
    confirmDeleteTune,
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
    addRecentTune,
    addRecentFile,
    addRecentFolder,
    getSettings,
    updateSettings,
    requestQuit,
    getLastRecent,
  } = ctx;

  const getParentForDialog = (event, reason) => {
    try {
      if (typeof prepareDialogParent === "function") return prepareDialogParent(event, reason);
      if (typeof getDialogParent === "function") return getDialogParent(event);
    } catch {}
    return null;
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
  ipcMain.handle("dialog:confirm-append", async (_e, filePath) =>
    confirmAppendToFile(filePath)
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
  ipcMain.handle("dialog:show-save-error", async (_e, message) => {
    showSaveError(message);
  });
  ipcMain.handle("dialog:show-open-error", async (_e, message) => {
    showOpenError(message);
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
    const result = dialog.showOpenDialogSync(parent || undefined, {
      modal: true,
      properties: ["openFile"],
      filters: [
        { name: "SoundFont", extensions: ["sf2"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (!result || !result.length) return null;
    return result[0];
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
  ipcMain.handle("import:musicxml", async (event) => {
    const parent = getParentForDialog(event, "import:musicxml");
    const result = dialog.showOpenDialogSync(parent || undefined, {
      modal: true,
      properties: ["openFile"],
      filters: [
        { name: "MusicXML", extensions: ["xml", "musicxml", "mxl"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (!result || !result.length) return { ok: false, canceled: true };
    try {
      const settings = getSettings ? getSettings() : {};
      const ext = path.extname(result[0] || "").toLowerCase();
      const kind = ext === ".mxl" ? "mxl" : "musicxml";
      const converted = await convertFileToAbc({
        kind,
        inputPath: result[0],
        args: settings.xml2abcArgs || "",
      });
      return {
        ok: true,
        abcText: converted.abcText,
        warnings: converted.warnings || null,
        sourcePath: result[0],
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
    const filePath = dialog.showSaveDialogSync(parent || undefined, {
      title: "Export MusicXML",
      defaultPath: `${safeName}.musicxml`,
      filters: [
        { name: "MusicXML", extensions: ["musicxml", "xml"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
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
  ipcMain.handle("abc2abc:run", async (_event, abcText, options) => {
    try {
      const res = await transformAbcWithAbc2abc({ abcText, options: options || {} });
      return { ok: true, abcText: res.abcText, warnings: res.warnings || null };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        detail: e && e.detail ? e.detail : "",
        code: e && e.code ? e.code : "",
      };
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
      const data = await fs.promises.readFile(filePath, "utf8");
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("file:write", async (_e, filePath, data) => {
    try {
      await atomicWriteFileWithRetry(fs, path, filePath, data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.handle("file:rename", async (_e, oldPath, newPath) => {
    try {
      await fs.promises.access(newPath, fs.constants.F_OK);
      return { ok: false, error: "File already exists.", code: "EEXIST" };
    } catch {}
    try {
      await fs.promises.rename(oldPath, newPath);
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
  ipcMain.handle("print:preview", async (_event, svgMarkup) => {
    if (!svgMarkup) return { ok: false, error: "No notation to print." };
    if (typeof previewPdf === "function") return previewPdf(svgMarkup);
    const tmpName = `abc-preview-${Date.now()}.pdf`;
    const tmpPath = path.join(app.getPath("temp"), tmpName);
    const res = await withMainPrintMode(async (contents) => {
      const pdfData = await contents.printToPDF({ printBackground: true, marginsType: 0 });
      await fs.promises.writeFile(tmpPath, pdfData);
      return { ok: true, path: tmpPath };
    });
    if (res.ok && res.path) await shell.openPath(res.path);
    return res;
  });
  ipcMain.handle("print:dialog", async (_event, svgMarkup) => {
    if (!svgMarkup) return { ok: false, error: "No notation to print." };
    if (os.platform() === "linux") {
      return printViaPdf(svgMarkup);
    }
    if (typeof printWithDialog === "function") return printWithDialog(svgMarkup);
    return withMainPrintMode((contents) =>
      new Promise((resolve) => {
        contents.print({ printBackground: true, silent: false }, (success, failureReason) => {
          if (!success) return resolve({ ok: false, error: failureReason || "Print failed" });
          resolve({ ok: true });
        });
      })
    );
  });
  ipcMain.handle("print:pdf", async (event, svgMarkup, suggestedName) => {
    if (!svgMarkup) return { ok: false, error: "No notation to export." };
    const safeName = suggestedName && String(suggestedName).trim()
      ? String(suggestedName).trim()
      : "tune";
    const parent = getParentForDialog(event, "print:pdf");
    const filePath = dialog.showSaveDialogSync(parent || undefined, {
      title: "Export PDF",
      defaultPath: `${safeName}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!filePath) return { ok: false, error: "Canceled" };
    if (typeof exportPdf === "function") return exportPdf(svgMarkup, filePath);
    return withMainPrintMode(async (contents) => {
      try {
        const pdfData = await contents.printToPDF({ printBackground: true, marginsType: 0 });
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
    requestQuit();
  });
  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });
  ipcMain.handle("settings:paths", async () => {
    if (ctx && typeof ctx.getSettingsPaths === "function") return ctx.getSettingsPaths();
    return { globalPath: "", userPath: "" };
  });
  ipcMain.handle("settings:update", async (_event, patch) => {
    return updateSettings(patch || {});
  });
  ipcMain.handle("recent:last", async () => getLastRecent());
  ipcMain.handle("shell:open-external", async (_event, url) => {
    try {
      if (!url) return { ok: false, error: "Missing URL." };
      await shell.openExternal(String(url));
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
    };
  });
}

module.exports = { registerIpcHandlers };
