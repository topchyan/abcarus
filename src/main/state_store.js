const PROFILE_VERSION = 1;
const STATE_VERSION = PROFILE_VERSION;
let temporaryPathSequence = 0;

const KNOWN_STATE_KEYS = new Set([
  "stateVersion",
  "profileVersion",
  "lastFolder",
  "lastDialogDir",
  "dialogPreferences",
  "recentTunes",
  "recentFiles",
  "recentFolders",
  "settings",
  "settingsFile",
  "globalHeaderMigrationVersion",
  "windowState",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseProfileDocument(text) {
  const parsed = JSON.parse(String(text || ""));
  const hasSettings = isPlainObject(parsed && parsed.settings);
  const hasVersion = parsed && (Number.isFinite(Number(parsed.profileVersion)) || Number.isFinite(Number(parsed.stateVersion)));
  if (!isPlainObject(parsed) || (!hasSettings && !hasVersion)) {
    throw new Error("The selected JSON file is not an ABCarus profile.");
  }
  return parsed;
}

function serializeProfileDocument(document) {
  if (!isPlainObject(document)) throw new TypeError("Invalid ABCarus profile document.");
  return `${JSON.stringify(document, null, 2)}\n`;
}

function splitStateDocument(value) {
  if (!isPlainObject(value)) return { known: {}, extras: {} };
  const known = {};
  const extras = {};
  for (const [key, entry] of Object.entries(value)) {
    if (KNOWN_STATE_KEYS.has(key)) known[key] = entry;
    else extras[key] = entry;
  }
  return { known, extras };
}

function composeStateDocument(known, extras = {}) {
  const safeExtras = isPlainObject(extras) ? extras : {};
  const safeKnown = isPlainObject(known) ? known : {};
  const document = {
    ...safeExtras,
    ...safeKnown,
    profileVersion: PROFILE_VERSION,
  };
  delete document.stateVersion;
  delete document.settingsFile;
  return document;
}

function isMissingFileError(err) {
  const code = err && err.code ? String(err.code) : "";
  return code === "ENOENT" || code === "ENOTDIR";
}

async function syncFile(fs, filePath) {
  let handle = null;
  try {
    handle = await fs.promises.open(filePath, "r");
    await handle.sync();
  } finally {
    if (handle) await handle.close();
  }
}

async function syncDirectory(fs, dirPath) {
  let handle = null;
  try {
    handle = await fs.promises.open(dirPath, "r");
    await handle.sync();
  } catch {
    // Some platforms do not permit fsync on directories.
  } finally {
    if (handle) {
      try { await handle.close(); } catch {}
    }
  }
}

function temporaryPath(path, filePath, suffix) {
  temporaryPathSequence += 1;
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${temporaryPathSequence}.${suffix}`,
  );
}

function isTransientFileError(error) {
  const code = error && error.code ? String(error.code) : "";
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

async function retryTransientFileOperation(operation, { attempts = 5 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientFileError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError || new Error("File operation failed.");
}

async function replaceFileAtomically(fs, path, filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = temporaryPath(path, filePath, "tmp");
  const displacedPath = temporaryPath(path, filePath, "displaced");
  await fs.promises.writeFile(tmpPath, data);
  await syncFile(fs, tmpPath);

  try {
    await retryTransientFileOperation(() => fs.promises.rename(tmpPath, filePath));
  } catch (initialRenameError) {
    let displaced = false;
    try {
      await retryTransientFileOperation(() => fs.promises.rename(filePath, displacedPath));
      displaced = true;
      await retryTransientFileOperation(() => fs.promises.rename(tmpPath, filePath));
    } catch (replaceError) {
      if (displaced) {
        try { await retryTransientFileOperation(() => fs.promises.rename(displacedPath, filePath)); } catch {}
      }
      try { await fs.promises.unlink(tmpPath); } catch {}
      throw replaceError || initialRenameError;
    }
    if (displaced) {
      try { await fs.promises.unlink(displacedPath); } catch {}
    }
  }
  await syncDirectory(fs, dir);
}

async function saveStateDocument({ fs, path, filePath, data, skipBackup = false }) {
  const dir = path.dirname(filePath);
  const backupPath = `${filePath}.bak`;
  await fs.promises.mkdir(dir, { recursive: true });

  if (!skipBackup) {
    try {
      const previous = await fs.promises.readFile(filePath);
      await replaceFileAtomically(fs, path, backupPath, previous);
    } catch (err) {
      // A stale/locked backup must not prevent writing the canonical profile.
      // The primary replacement below still has its own atomicity and retries.
      if (!isMissingFileError(err) && process.env.ABCARUS_DEBUG_SETTINGS === "1") {
        console.warn("Unable to refresh profile backup:", err && err.message ? err.message : err);
      }
    }
  }

  await replaceFileAtomically(fs, path, filePath, JSON.stringify(data, null, 2));
}

async function readJsonObject(fs, filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    return isPlainObject(data) ? { ok: true, data } : { ok: false, error: new Error("State is not an object.") };
  } catch (error) {
    return { ok: false, error };
  }
}

async function loadStateDocument({ fs, filePath }) {
  const primary = await readJsonObject(fs, filePath);
  if (primary.ok) return { data: primary.data, source: "primary", recovered: false };

  const backup = await readJsonObject(fs, `${filePath}.bak`);
  if (backup.ok) return { data: backup.data, source: "backup", recovered: true, error: primary.error };

  return { data: null, source: "none", recovered: false, error: primary.error };
}

async function loadProfileDocument({ fs, profilePath, legacyStatePath }) {
  const profile = await loadStateDocument({ fs, filePath: profilePath });
  if (profile.data) return { ...profile, legacy: false };
  const legacy = await loadStateDocument({ fs, filePath: legacyStatePath });
  if (legacy.data) return { ...legacy, legacy: true, profileError: profile.error };
  return { ...profile, legacy: false, legacyError: legacy.error };
}

module.exports = {
  PROFILE_VERSION,
  STATE_VERSION,
  composeStateDocument,
  loadStateDocument,
  loadProfileDocument,
  parseProfileDocument,
  saveStateDocument,
  serializeProfileDocument,
  splitStateDocument,
};
