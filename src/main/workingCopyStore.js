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

function freezeSnapshot(obj) {
  try {
    return Object.freeze(obj);
  } catch {
    return obj;
  }
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

function onWorkingCopyChanged(listener) {
  emitter.on("changed", listener);
  return () => emitter.off("changed", listener);
}

function mutateWorkingCopy(mutatorFn, meta) {
  if (!state) throw new Error("No working copy open.");
  if (typeof mutatorFn !== "function") throw new Error("mutatorFn must be a function.");

  const prevVersion = state.version;
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

  // Preserve tuneUid mapping by index when counts match; otherwise reset to safest stable state.
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

function applyTuneText({ tuneUid, tuneIndex, text } = {}) {
  const uid = tuneUid != null ? String(tuneUid) : "";
  const idx = Number.isFinite(Number(tuneIndex)) ? Number(tuneIndex) : null;
  const nextTuneText = (text != null) ? String(text) : "";
  if (!uid && idx == null) throw new Error("Missing tuneUid/tuneIndex.");

  return mutateWorkingCopy((draft) => {
    const tunes = state && Array.isArray(state.tunes) ? state.tunes : [];
    let resolvedIndex = idx;
    if (resolvedIndex == null) {
      const found = state && state.tuneUidToIndex && uid ? state.tuneUidToIndex.get(uid) : null;
      resolvedIndex = Number.isFinite(Number(found)) ? Number(found) : null;
    }
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
    draft.text = `${fullText.slice(0, start)}${nextTuneText}${fullText.slice(end)}`;
    return { text: draft.text };
  }, { kind: "applyTuneText", tuneUid: uid || null, tuneIndex: idx });
}

module.exports = {
  openWorkingCopyFromPath,
  closeWorkingCopy,
  reloadWorkingCopyFromDisk,
  getWorkingCopySnapshot,
  getWorkingCopyMetaSnapshot,
  onWorkingCopyChanged,
  mutateWorkingCopy,
  applyTuneText,
};
