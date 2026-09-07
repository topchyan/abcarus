export function createRenumberXAction({
  api = null,
  state = {},
  actions = {},
} = {}) {
  const {
    getActiveFilePath = () => "",
    getActiveTuneMeta = () => null,
    getCurrentDocumentPath = () => "",
    getHeaderDirty = () => false,
    getIsNewTuneDraft = () => false,
    getRawMode = () => false,
    isCurrentDocumentDirty = () => false,
  } = state;

  const {
    requireCleanForFileOp = async () => true,
    markCurrentDocumentClean = () => {},
    patchCurrentDocument = () => {},
    readFile = async () => ({ ok: false }),
    refreshLibraryFile = async () => null,
    loadLibraryFileIntoEditor = async () => ({ ok: false }),
    renumberXLinesConsecutive = () => ({ ok: false }),
    pathsEqual = (left, right) => String(left || "") === String(right || ""),
    setDirtyIndicator = () => {},
    setStatus = () => {},
    showSaveError = async () => {},
    showToast = () => {},
    withFileLock = async (_path, fn) => fn(),
    writeFile = async () => ({ ok: false }),
  } = actions;

  async function renumberXInActiveFile(explicitFilePath) {
    const activeTuneMeta = getActiveTuneMeta();
    const filePath = explicitFilePath
      || ((activeTuneMeta && activeTuneMeta.path) ? activeTuneMeta.path : null)
      || (getActiveFilePath() || getCurrentDocumentPath() || null);
    if (!filePath) {
      showToast("No active file selected.", 2200);
      return;
    }

    if (getRawMode()) {
      showToast("Raw mode: switch to tune mode to renumber.", 2400);
      return;
    }

    if (!(await requireCleanForFileOp(filePath, "renumbering X"))) return;

    try {
      await withFileLock(filePath, async () => {
        const readRes = await readFile(filePath);
        if (!readRes || !readRes.ok) throw new Error((readRes && readRes.error) ? readRes.error : "Unable to read file.");
        const before = String(readRes.data || "");
        const ren = renumberXLinesConsecutive(before);
        if (!ren || !ren.ok) throw new Error((ren && ren.error) ? ren.error : "Unable to renumber X.");
        const writeRes = await writeFile(filePath, ren.text, { expectedData: before });
        if (!writeRes || !writeRes.ok) {
          if (writeRes && writeRes.conflict) throw new Error("Refusing to renumber: file changed on disk. Refresh/reopen and try again.");
          throw new Error((writeRes && writeRes.error) ? writeRes.error : "Unable to write file.");
        }
      });
      await refreshLibraryFile(filePath, { force: true });
      if (getCurrentDocumentPath() && pathsEqual(getCurrentDocumentPath(), filePath)) {
        await loadLibraryFileIntoEditor(filePath, { skipConfirm: true, suppressRecent: true });
      }
      setStatus("Renumbered X.");
    } catch (e) {
      await showSaveError(e && e.message ? e.message : String(e));
    }
  }

  return {
    renumberXInActiveFile,
  };
}
