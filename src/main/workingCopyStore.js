const crypto = require("crypto");
const fs = require("fs");
const { EventEmitter } = require("events");
const { statFingerprint } = require("./fsFingerprint");
const { segmentTunes } = require("../common/abc/tuneSegmenter");

const emitter = new EventEmitter();

let state = null;

function makeTuneUid() {
  try {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `tune_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function firstNonEmptyLine(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (const line of lines) {
    if (String(line || "").trim()) return String(line || "");
  }
  return "";
}

function beginsWithXLine(text) {
  const first = firstNonEmptyLine(text);
  return /^\s*X:/.test(first);
}

function freezeSnapshot(obj) {
  try {
    return Object.freeze(obj);
  } catch {
    return obj;
  }
}

function isMissingFileError(err) {
  const code = err && err.code ? String(err.code) : "";
  return code === "ENOENT";
}

function getWorkingCopySnapshot() {
  if (!state) return null;
  return freezeSnapshot({
    path: state.path,
    text: state.text,
    version: state.version,
    dirty: state.dirty,
    diskFingerprintOnOpen: state.diskFingerprintOnOpen ? { ...state.diskFingerprintOnOpen } : null,
    preambleSlice: state.preambleSlice ? { ...state.preambleSlice } : null,
    tunes: (state.tunes || []).map((t) => ({
      tuneIndex: t.tuneIndex,
      tuneUid: t.tuneUid,
      start: t.start,
      end: t.end,
      xLabel: t.xLabel || "",
    })),
  });
}

function getWorkingCopyMetaSnapshot() {
  if (!state) return null;
  return freezeSnapshot({
    path: state.path,
    version: state.version,
    dirty: state.dirty,
    diskFingerprintOnOpen: state.diskFingerprintOnOpen ? { ...state.diskFingerprintOnOpen } : null,
    tuneCount: state.tunes ? state.tunes.length : 0,
  });
}

async function atomicWriteFileWithRetry(filePath, data, { attempts = 5 } = {}) {
  const absPath = String(filePath || "");
  if (!absPath) throw new Error("Missing file path.");
  const tmpPath = `${absPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, data, "utf8");
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      try {
        await fs.promises.rename(tmpPath, absPath);
        return;
      } catch (e) {
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

function notifyChanged() {
  try {
    emitter.emit("changed", getWorkingCopyMetaSnapshot());
  } catch {}
}

async function openWorkingCopyFromPath(filePath) {
  const p = String(filePath || "");
  if (!p) throw new Error("Missing file path.");
  if (state && state.path === p) return getWorkingCopyMetaSnapshot();

  const text = await fs.promises.readFile(p, "utf8");
  const fp = await statFingerprint(p);
  const seg = segmentTunes(text);
  const tunes = [];
  for (let i = 0; i < seg.tunes.length; i += 1) {
    const t = seg.tunes[i];
    const xLabelRaw = t && t.rawXLine ? String(t.rawXLine).trim() : "";
    tunes.push({
      tuneIndex: i,
      tuneUid: makeTuneUid(),
      start: Number(t.start) || 0,
      end: Number(t.end) || 0,
      xLabel: xLabelRaw,
    });
  }

  state = {
    path: p,
    text,
    version: 0,
    dirty: false,
    diskFingerprintOnOpen: fp,
    preambleSlice: seg.preambleSlice,
    tunes,
    tuneUidToIndex: new Map(tunes.map((t) => [t.tuneUid, t.tuneIndex])),
  };

  notifyChanged();
  return getWorkingCopyMetaSnapshot();
}

async function closeWorkingCopy() {
  state = null;
  notifyChanged();
  return true;
}

async function reloadWorkingCopyFromDisk() {
  if (!state || !state.path) throw new Error("No working copy open.");
  const p = String(state.path || "");
  const text = await fs.promises.readFile(p, "utf8");
  const fp = await statFingerprint(p);
  const seg = segmentTunes(text);

  const prevTunes = state.tunes || [];
  const nextTunes = [];
  for (let i = 0; i < seg.tunes.length; i += 1) {
    const t = seg.tunes[i];
    const prev = prevTunes[i];
    const tuneUid = prev && prev.tuneUid ? prev.tuneUid : makeTuneUid();
    const xLabelRaw = t && t.rawXLine ? String(t.rawXLine).trim() : "";
    nextTunes.push({
      tuneIndex: i,
      tuneUid,
      start: Number(t.start) || 0,
      end: Number(t.end) || 0,
      xLabel: xLabelRaw,
    });
  }

  state.text = text;
  state.version += 1;
  state.dirty = false;
  state.diskFingerprintOnOpen = fp;
  state.preambleSlice = seg.preambleSlice;
  state.tunes = nextTunes;
  state.tuneUidToIndex = new Map(nextTunes.map((t) => [t.tuneUid, t.tuneIndex]));
  try {
    state.lastMutationMeta = { kind: "reloadFromDisk" };
  } catch {}

  notifyChanged();
  return getWorkingCopyMetaSnapshot();
}

async function commitWorkingCopyToDisk({ force = false } = {}) {
  if (!state || !state.path) throw new Error("No working copy open.");
  const p = String(state.path || "");
  const fpOnOpen = state.diskFingerprintOnOpen || null;

  let fpNow = null;
  let missingOnDisk = false;
  try {
    fpNow = await statFingerprint(p);
  } catch (err) {
    if (isMissingFileError(err)) missingOnDisk = true;
    else throw err;
  }
  if (missingOnDisk && !force) {
    return { ok: false, missingOnDisk: true, diskFingerprintOnOpen: fpOnOpen };
  }

  const hasConflict = Boolean(
    fpOnOpen
    && fpNow
    && (Number(fpOnOpen.mtimeMs) !== Number(fpNow.mtimeMs) || Number(fpOnOpen.size) !== Number(fpNow.size))
  );
  // By policy, the in-app working copy session is authoritative for its file.
  // If the file changed on disk while a working copy is open, we overwrite on Save.
  // (Callers may pass `force=true` for explicitness, but the default behavior is the same.)
  const overwroteExternalChanges = Boolean(hasConflict && !force);

  const text = String(state.text || "");
  try {
    await atomicWriteFileWithRetry(p, text);
  } catch (err) {
    if (isMissingFileError(err) && !force) {
      return { ok: false, missingOnDisk: true, diskFingerprintOnOpen: fpOnOpen };
    }
    throw err;
  }
  const fpAfter = await statFingerprint(p);
  state.diskFingerprintOnOpen = fpAfter;
  state.dirty = false;
  try {
    state.lastMutationMeta = { kind: "commitToDisk", forced: Boolean(force), overwroteExternalChanges };
  } catch {}
  notifyChanged();
  return { ok: true, diskFingerprint: fpAfter, overwroteExternalChanges };
}

async function writeWorkingCopyToPath(targetPath) {
  if (!state) throw new Error("No working copy open.");
  const p = String(targetPath || "");
  if (!p) throw new Error("Missing file path.");
  const text = String(state.text || "");
  await atomicWriteFileWithRetry(p, text);
  return true;
}

async function writeWorkingCopyToPathAndSwitch(targetPath) {
  if (!state) throw new Error("No working copy open.");
  const p = String(targetPath || "");
  if (!p) throw new Error("Missing file path.");
  const text = String(state.text || "");
  await atomicWriteFileWithRetry(p, text);
  const fp = await statFingerprint(p);
  state.path = p;
  state.diskFingerprintOnOpen = fp;
  state.dirty = false;
  state.version += 1;
  try {
    state.lastMutationMeta = { kind: "writeToPathAndSwitch" };
  } catch {}
  notifyChanged();
  return getWorkingCopyMetaSnapshot();
}

function onWorkingCopyChanged(listener) {
  emitter.on("changed", listener);
  return () => emitter.off("changed", listener);
}

function mutateWorkingCopy(mutatorFn, meta) {
  if (!state) throw new Error("No working copy open.");
  if (typeof mutatorFn !== "function") throw new Error("mutatorFn must be a function.");

  const prevVersion = state.version;
  const prevTunes = state.tunes || [];
  const draft = {
    path: state.path,
    text: state.text,
    diskFingerprintOnOpen: state.diskFingerprintOnOpen,
  };

  let result;
  try {
    result = mutatorFn(draft);
  } catch (e) {
    throw e;
  }

  const nextText = (result && typeof result.text === "string") ? result.text : draft.text;
  if (typeof nextText !== "string") throw new Error("mutateWorkingCopy: text must be a string.");

  state.text = nextText;
  state.version = prevVersion + 1;
  state.dirty = true;

  const seg = segmentTunes(state.text);
  state.preambleSlice = seg.preambleSlice;

  // Preserve tuneUid mapping when it is safe to do so:
  // - Same tune count: preserve by index (stable segmentation).
  // - Delete one tune (count-1) and we know the deleted index: shift mapping accordingly.
  // - Insert one tune (count+1) and we know the insertion index: shift mapping accordingly.
  // Otherwise: regenerate tuneUids (safest).
  const nextTunes = [];
  const metaKind = meta && meta.kind ? String(meta.kind) : "";
  const forceRegenerateTuneUids = Boolean(meta && meta.regenerateTuneUids);
  const deletedIndex = (metaKind === "deleteTune" && meta && Number.isFinite(Number(meta.resolvedIndex)))
    ? Number(meta.resolvedIndex)
    : null;
  const insertIndex = (metaKind === "insertTune" && meta && Number.isFinite(Number(meta.insertIndex)))
    ? Number(meta.insertIndex)
    : null;
  const canPreserveByIndex = !forceRegenerateTuneUids && prevTunes.length === seg.tunes.length;
  const canPreserveDeleteShift = (
    !forceRegenerateTuneUids
    && deletedIndex != null
    && deletedIndex >= 0
    && deletedIndex < prevTunes.length
    && prevTunes.length === seg.tunes.length + 1
  );
  const canPreserveInsertShift = (
    !forceRegenerateTuneUids
    && insertIndex != null
    && insertIndex >= 0
    && insertIndex <= prevTunes.length
    && prevTunes.length + 1 === seg.tunes.length
  );
  for (let i = 0; i < seg.tunes.length; i += 1) {
    const t = seg.tunes[i];
    let tuneUid = null;
    if (canPreserveDeleteShift) {
      const srcIdx = i < deletedIndex ? i : i + 1;
      const prev = prevTunes[srcIdx];
      tuneUid = prev && prev.tuneUid ? prev.tuneUid : null;
    } else if (canPreserveInsertShift) {
      if (i === insertIndex) {
        tuneUid = null;
      } else {
        const srcIdx = i < insertIndex ? i : i - 1;
        const prev = prevTunes[srcIdx];
        tuneUid = prev && prev.tuneUid ? prev.tuneUid : null;
      }
    } else if (canPreserveByIndex) {
      const prev = prevTunes[i];
      tuneUid = prev && prev.tuneUid ? prev.tuneUid : null;
    }
    if (!tuneUid) tuneUid = makeTuneUid();
    const xLabelRaw = t && t.rawXLine ? String(t.rawXLine).trim() : "";
    nextTunes.push({
      tuneIndex: i,
      tuneUid,
      start: Number(t.start) || 0,
      end: Number(t.end) || 0,
      xLabel: xLabelRaw,
    });
  }
  state.tunes = nextTunes;
  state.tuneUidToIndex = new Map(nextTunes.map((t) => [t.tuneUid, t.tuneIndex]));

  if (state.version !== prevVersion + 1) {
    throw new Error("mutateWorkingCopy: version invariant violated.");
  }

  try {
    state.lastMutationMeta = meta ? { ...meta } : null;
  } catch {}

  notifyChanged();
  return getWorkingCopyMetaSnapshot();
}

function applyHeaderText(headerText) {
  const nextHeader = String(headerText == null ? "" : headerText);
  return mutateWorkingCopy((draft) => {
    const fullText = String(draft.text || "");
    const match = fullText.match(/^\s*X:/m);
    const headerEnd = match && Number.isFinite(match.index) ? match.index : fullText.length;
    const suffix = fullText.slice(headerEnd);

    let header = nextHeader;
    if (header && !/[\r\n]$/.test(header) && /^\s*X:/.test(suffix)) header += "\n";
    draft.text = `${header}${suffix}`;
    return { text: draft.text };
  }, { kind: "applyHeaderText" });
}

function renumberXStartingAt1() {
  if (!state) throw new Error("No working copy open.");
  return mutateWorkingCopy((draft) => {
    const text = String(draft.text || "");
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r\n|\n|\r/);
    let foundAny = false;
    let n = 0;
    const out = [];

    for (const line of lines) {
      const match = String(line || "").match(/^(\s*X:\s*)(.*)$/);
      if (!match) {
        out.push(line);
        continue;
      }
      foundAny = true;
      n += 1;
      const prefix = match[1] || "X:";
      out.push(`${prefix}${n}`);
    }

    if (!foundAny) throw new Error("No X: headers found in file.");
    draft.text = out.join(newline);
    return { text: draft.text };
  }, { kind: "renumberXStartingAt1", regenerateTuneUids: true });
}

function deleteTune({ tuneUid, tuneIndex } = {}) {
  const uid = tuneUid != null ? String(tuneUid) : "";
  const idx = Number.isFinite(Number(tuneIndex)) ? Number(tuneIndex) : null;
  if (!uid && idx == null) throw new Error("Missing tuneUid/tuneIndex.");

  const tunes = state && Array.isArray(state.tunes) ? state.tunes : [];
  let resolvedIndex = idx;
  if (resolvedIndex == null) {
    const found = state && state.tuneUidToIndex && uid ? state.tuneUidToIndex.get(uid) : null;
    resolvedIndex = Number.isFinite(Number(found)) ? Number(found) : null;
  }

  return mutateWorkingCopy((draft) => {
    if (resolvedIndex == null || resolvedIndex < 0 || resolvedIndex >= tunes.length) {
      throw new Error("Tune not found.");
    }
    const tune = tunes[resolvedIndex];
    const start = Number(tune && tune.start);
    const end = Number(tune && tune.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      throw new Error("Tune slice is invalid.");
    }
    const fullText = String(draft.text || "");
    if (end > fullText.length) throw new Error("Tune slice is out of bounds.");

    let before = fullText.slice(0, start);
    let after = fullText.slice(end);
    if (/\r?\n$/.test(before) && /^\r?\n/.test(after)) {
      after = after.replace(/^\r?\n/, "");
    }
    draft.text = `${before}${after}`;
    return { text: draft.text };
  }, { kind: "deleteTune", tuneUid: uid || null, tuneIndex: idx, resolvedIndex });
}

function applyTuneText({ tuneUid, tuneIndex, text } = {}) {
  const uid = tuneUid != null ? String(tuneUid) : "";
  const idx = Number.isFinite(Number(tuneIndex)) ? Number(tuneIndex) : null;
  const nextTuneText = (text != null) ? String(text) : "";
  if (!uid && idx == null) throw new Error("Missing tuneUid/tuneIndex.");

  return mutateWorkingCopy((draft) => {
    const tunes = state && Array.isArray(state.tunes) ? state.tunes : [];
    // Prefer tuneUid over tuneIndex. tuneIndex is inherently unstable across reparses.
    let resolvedIndex = null;
    const byUid = state && state.tuneUidToIndex && uid ? state.tuneUidToIndex.get(uid) : null;
    if (Number.isFinite(Number(byUid))) resolvedIndex = Number(byUid);
    if (resolvedIndex == null && idx != null) resolvedIndex = idx;
    if (resolvedIndex == null || resolvedIndex < 0 || resolvedIndex >= tunes.length) {
      throw new Error("Tune not found.");
    }
    const tune = tunes[resolvedIndex];
    const start = Number(tune && tune.start);
    const end = Number(tune && tune.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      throw new Error("Tune slice is invalid.");
    }
    const fullText = String(draft.text || "");
    if (end > fullText.length) throw new Error("Tune slice is out of bounds.");
    const oldSlice = fullText.slice(start, end);
    if (beginsWithXLine(oldSlice) && !beginsWithXLine(nextTuneText)) {
      throw new Error("Refusing to save: tune must start with an X: header.");
    }
    draft.text = `${fullText.slice(0, start)}${nextTuneText}${fullText.slice(end)}`;
    return { text: draft.text };
  }, { kind: "applyTuneText", tuneUid: uid || null, tuneIndex: idx });
}

function applyFullText(text) {
  const next = String(text == null ? "" : text);
  if (!state) throw new Error("No working copy open.");
  return mutateWorkingCopy((draft) => {
    draft.text = next;
    return { text: draft.text };
  }, { kind: "applyFullText" });
}

function insertTuneAfter({ afterTuneIndex, text } = {}) {
  if (!state) throw new Error("No working copy open.");
  const tunes = state && Array.isArray(state.tunes) ? state.tunes : [];
  const afterIdx = Number.isFinite(Number(afterTuneIndex)) ? Number(afterTuneIndex) : null;
  const insertIdx = afterIdx == null ? tunes.length : Math.max(0, Math.min(tunes.length, afterIdx + 1));
  const tuneText = String(text == null ? "" : text);
  if (!tuneText.trim()) throw new Error("Missing tune text.");

  const newline = state.text && String(state.text).includes("\r\n") ? "\r\n" : "\n";
  const insertOffset = (() => {
    if (insertIdx <= 0) {
      const preEnd = state.preambleSlice && Number.isFinite(Number(state.preambleSlice.end))
        ? Number(state.preambleSlice.end)
        : 0;
      return Math.max(0, Math.min(String(state.text || "").length, preEnd));
    }
    const prevTune = tunes[insertIdx - 1];
    const end = prevTune && Number.isFinite(Number(prevTune.end)) ? Number(prevTune.end) : String(state.text || "").length;
    return Math.max(0, Math.min(String(state.text || "").length, end));
  })();

  return mutateWorkingCopy((draft) => {
    const fullText = String(draft.text || "");
    let before = fullText.slice(0, insertOffset);
    let after = fullText.slice(insertOffset);
    let prepared = String(tuneText || "");
    if (prepared && !/\r?\n$/.test(prepared)) prepared += newline;
    if (before && !/\r?\n$/.test(before)) before += newline;
    if (/^\r?\n/.test(prepared) && /\r?\n$/.test(before)) prepared = prepared.replace(/^\r?\n/, "");
    if (/^\r?\n/.test(after) && /\r?\n$/.test(prepared)) after = after.replace(/^\r?\n/, "");
    draft.text = `${before}${prepared}${after}`;
    return { text: draft.text };
  }, { kind: "insertTune", insertIndex: insertIdx });
}

module.exports = {
  openWorkingCopyFromPath,
  closeWorkingCopy,
  reloadWorkingCopyFromDisk,
  commitWorkingCopyToDisk,
  writeWorkingCopyToPath,
  writeWorkingCopyToPathAndSwitch,
  getWorkingCopySnapshot,
  getWorkingCopyMetaSnapshot,
  onWorkingCopyChanged,
  mutateWorkingCopy,
  applyHeaderText,
  applyFullText,
  insertTuneAfter,
  renumberXStartingAt1,
  deleteTune,
  applyTuneText,
};
