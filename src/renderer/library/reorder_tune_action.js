export function createReorderTuneAction({
  state = {},
  actions = {},
} = {}) {
  const {
    getActiveTuneId = () => "",
    getActiveTuneIndex = () => null,
    getActiveTuneMeta = () => null,
    getActiveTuneUid = () => "",
    getRawMode = () => false,
  } = state;

  const {
    findTuneById = () => null,
    markDiskConflictPath = () => {},
    pathsEqual = (left, right) => String(left || "") === String(right || ""),
    readFile = async () => ({ ok: false }),
    refreshLibraryFile = async () => null,
    requireCleanForFileOp = async () => false,
    selectTune = async () => ({ ok: false }),
    setStatus = () => {},
    showSaveError = async () => {},
    showToast = () => {},
    withFileLock = async (_path, operation) => operation(),
    writeFile = async () => ({ ok: false }),
  } = actions;

  function matchesTuneId(tune, tuneId) {
    const wanted = String(tuneId || "");
    return Boolean(tune && wanted && (
      String(tune.id || "") === wanted
      || (tune.tuneUid && String(tune.tuneUid) === wanted)
    ));
  }

  function findTuneIndex(tunes, tuneId) {
    return tunes.findIndex((tune) => matchesTuneId(tune, tuneId));
  }

  function getTuneXNumber(text) {
    const match = String(text || "").match(/^\s*X:\s*(\d+)/i);
    return match ? match[1] : "";
  }

  function setTuneXNumber(text, xNumber) {
    return String(text || "").replace(/^(\s*X:\s*)\d+/i, `$1${xNumber}`);
  }

  async function reorderTune(tuneId, options = {}) {
    if (getRawMode()) {
      showToast("Raw mode: exit before changing tune order.", 2400);
      return { ok: false, cancelled: true };
    }
    const source = findTuneById(tuneId);
    if (!source || !source.file || !source.file.path || !source.tune) return { ok: false, error: "Tune not found." };
    const filePath = String(source.file.path);
    const tunes = Array.isArray(source.file.tunes) ? source.file.tunes : [];
    const sourceIndex = findTuneIndex(tunes, tuneId);
    if (sourceIndex < 0 || tunes.length < 2) return { ok: false, boundary: true };

    let targetIndex = -1;
    let placement = options.placement === "after" ? "after" : "before";
    const direction = Number(options.direction);
    if (direction === -1 || direction === 1) {
      targetIndex = sourceIndex + direction;
      placement = direction < 0 ? "before" : "after";
    } else if (options.targetTuneId) {
      const target = findTuneById(options.targetTuneId);
      if (!target || !target.file || !pathsEqual(target.file.path, filePath)) {
        await showSaveError("Tunes can only be reordered within the same file.");
        return { ok: false, error: "Different target file." };
      }
      targetIndex = findTuneIndex(tunes, options.targetTuneId);
    }

    if (targetIndex < 0 || targetIndex >= tunes.length) {
      showToast(direction < 0 ? "Tune is already first." : "Tune is already last.", 1800);
      return { ok: false, boundary: true };
    }
    if (targetIndex === sourceIndex) return { ok: false, boundary: true };

    const movingTune = tunes[sourceIndex];
    const targetTune = tunes[targetIndex];
    const reorderedTunes = tunes.filter((_tune, index) => index !== sourceIndex);
    const targetRemainingIndex = reorderedTunes.indexOf(targetTune);
    const insertAt = targetRemainingIndex + (placement === "after" ? 1 : 0);
    reorderedTunes.splice(insertAt, 0, movingTune);
    const destinationIndex = reorderedTunes.indexOf(movingTune);
    const orderChanged = reorderedTunes.some((tune, index) => tune !== tunes[index]);
    if (!orderChanged) return { ok: false, boundary: true };
    if (!(await requireCleanForFileOp(filePath, "reordering tunes"))) return { ok: false, cancelled: true };

    try {
      let nextActiveIndex = null;
      const activeMeta = getActiveTuneMeta();
      const activeInFile = Boolean(activeMeta && activeMeta.path && pathsEqual(activeMeta.path, filePath));
      const activeKey = getActiveTuneUid() || getActiveTuneId();
      let activeIndex = activeKey ? findTuneIndex(tunes, activeKey) : -1;
      if (activeIndex < 0 && activeInFile && Number.isInteger(Number(getActiveTuneIndex()))) {
        activeIndex = Number(getActiveTuneIndex());
      }

      await withFileLock(filePath, async () => {
        const readResult = await readFile(filePath);
        if (!readResult || !readResult.ok) throw new Error((readResult && readResult.error) || "Unable to read file.");
        const before = String(readResult.data || "");

        const slices = tunes.map((tune) => {
          const start = Number(tune && tune.startOffset);
          const end = Number(tune && tune.endOffset);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > before.length) {
            throw new Error("Refusing to reorder: tune offsets are stale. Refresh the Library and try again.");
          }
          const text = before.slice(start, end);
          if (!/^\s*X:/i.test(text)) {
            throw new Error("Refusing to reorder: tune boundaries are stale. Refresh the Library and try again.");
          }
          const xNumber = getTuneXNumber(text);
          if (!xNumber) {
            throw new Error("Refusing to reorder: every tune must have a numeric X: value.");
          }
          return { tune, start, end, text, xNumber };
        });
        for (let index = 1; index < slices.length; index += 1) {
          if (slices[index - 1].end !== slices[index].start) {
            throw new Error("Refusing to reorder: tune boundaries are not contiguous. Refresh the Library and try again.");
          }
        }

        const reordered = reorderedTunes.map((tune) => slices[tunes.indexOf(tune)]);

        if (activeIndex >= 0) {
          const activeTune = slices[activeIndex] && slices[activeIndex].tune;
          nextActiveIndex = reordered.findIndex((slice) => slice.tune === activeTune);
        }

        const preamble = before.slice(0, slices[0].start);
        const suffix = before.slice(slices[slices.length - 1].end);
        const reorderedText = `${preamble}${reordered
          .map((slice, index) => setTuneXNumber(slice.text, slices[index].xNumber))
          .join("")}${suffix}`;
        const writeResult = await writeFile(filePath, reorderedText, { expectedData: before });
        if (!writeResult || !writeResult.ok) {
          if (writeResult && writeResult.conflict) markDiskConflictPath(filePath, true);
          throw new Error((writeResult && writeResult.error) || "Unable to reorder tune.");
        }
      });

      const updatedFile = await refreshLibraryFile(filePath, { force: true });
      const updatedTunes = updatedFile && Array.isArray(updatedFile.tunes) ? updatedFile.tunes : [];
      const restoreIndex = activeInFile && nextActiveIndex != null ? nextActiveIndex : null;
      if (restoreIndex != null && updatedTunes[restoreIndex]) {
        const activeTune = updatedTunes[restoreIndex];
        await selectTune(activeTune.tuneUid || activeTune.id, { skipConfirm: true, suppressRecent: true });
      }
      const oldX = tunes[sourceIndex] && tunes[sourceIndex].xNumber ? String(tunes[sourceIndex].xNumber) : "";
      const newX = updatedTunes[destinationIndex] && updatedTunes[destinationIndex].xNumber
        ? String(updatedTunes[destinationIndex].xNumber)
        : "";
      const xChange = oldX && newX && oldX !== newX ? ` (X:${oldX} -> X:${newX})` : "";
      setStatus(`${destinationIndex < sourceIndex ? "Moved tune up" : "Moved tune down"}${xChange}.`);
      return { ok: true, index: destinationIndex };
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      await showSaveError(message);
      return { ok: false, error: message };
    }
  }

  return { reorderTune };
}
