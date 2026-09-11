export function createTuneClipboardController({
  state = {},
  actions = {},
} = {}) {
  const {
    getLibraryIndex = () => null,
  } = state;

  const {
    readFile = async () => ({ ok: false }),
    setBufferStatus = () => {},
    setStatus = () => {},
    showSaveError = async () => {},
  } = actions;

  let clipboardTune = null;

  function getClipboardTune() {
    return clipboardTune;
  }

  function setClipboardTune(next) {
    clipboardTune = next && typeof next === "object" ? { ...next } : null;
    return clipboardTune;
  }

  function clearClipboardTune() {
    clipboardTune = null;
    setBufferStatus("");
  }

  function findTuneById(tuneId) {
    const libraryIndex = getLibraryIndex();
    if (!libraryIndex || !tuneId) return null;
    for (const file of libraryIndex.files || []) {
      const tune = (file.tunes || []).find((t) => (
        t
        && (t.id === tuneId || (t.tuneUid && t.tuneUid === tuneId))
      ));
      if (tune) return { tune, file };
    }
    return null;
  }

  async function getTuneText(tune, fileMeta) {
    if (!fileMeta || !fileMeta.path) throw new Error("Tune file path is missing.");
    const res = await readFile(fileMeta.path);
    if (!res.ok) throw new Error(res.error || "Unable to read file.");
    const content = String(res.data || "");
    const start = Number(tune && tune.startOffset);
    const end = Number(tune && tune.endOffset);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > content.length) {
      throw new Error("Tune location is stale. Refresh the library and try again.");
    }
    const slice = content.slice(start, end);
    const match = slice.replace(/^\s+/, "").match(/^X:\s*([^\r\n]*)/);
    const actualX = match ? String(match[1] || "").trim() : "";
    const expectedX = tune && tune.xNumber != null ? String(tune.xNumber).trim() : "";
    if (!actualX || (expectedX && actualX !== expectedX)) {
      throw new Error("Tune identity changed on disk. Refresh the library and try again.");
    }
    return slice;
  }

  async function copyTuneById(tuneId, mode) {
    const res = findTuneById(tuneId);
    if (!res) return;
    try {
      const text = await getTuneText(res.tune, res.file);
      setClipboardTune({
        text,
        sourcePath: res.file.path,
        tuneId,
        tuneUid: res.tune ? res.tune.tuneUid || null : null,
        tuneIndex: Number.isFinite(Number(res.tune && res.tune.tuneIndex)) ? Number(res.tune.tuneIndex) : null,
        startOffset: Number.isFinite(Number(res.tune && res.tune.startOffset)) ? Number(res.tune.startOffset) : null,
        mode,
      });
      setStatus(mode === "move" ? "Tune cut to buffer." : "Tune copied to buffer.");
      setBufferStatus(mode === "move" ? "Buffer: cut tune" : "Buffer: copied tune");
    } catch (e) {
      await showSaveError(e && e.message ? e.message : String(e));
    }
  }

  return {
    clearClipboardTune,
    copyTuneById,
    findTuneById,
    getClipboardTune,
    getTuneText,
    setClipboardTune,
  };
}
