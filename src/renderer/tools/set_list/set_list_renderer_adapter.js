import { buildPrintTuneLabel } from "../../print/error_markup.js";

function createSetListRendererAdapter({
  getCurrentDocDirty = () => false,
  getActiveTuneId = () => "",
  getActiveFilePath = () => "",
  getHeaderText = () => "",
  confirmUnsavedChanges = async () => "cancel",
  performSaveFlow = async () => false,
  findTuneById = () => null,
  readFile = async () => ({ ok: false, error: "Unable to read file." }),
  writeFile = async () => ({ ok: false, error: "Unable to write file." }),
  pathsEqual = (a, b) => String(a || "") === String(b || ""),
  sanitizeHeaderText = (text) => text,
  buildHeaderPrefix = (_header, _includeCheckbars, tuneText) => ({ text: "", offset: 0, tuneText }),
  setErrorLineOffsetFromHeader = () => {},
  renderAbcToSvgMarkup = async () => ({ ok: false, error: "Unable to render." }),
  getDefaultSaveDir = () => "",
  showSaveDialog = async () => null,
  showSaveError = async () => {},
  withFileLock = async (_filePath, operation) => operation(),
} = {}) {
  async function buildItemForTuneId(
    tuneId,
    { fallbackTitle = "", fallbackComposer = "" } = {}
  ) {
    const id = String(tuneId || "").trim();
    if (!id) throw new Error("Missing tune id.");

    if (getCurrentDocDirty() && getActiveTuneId() && id === getActiveTuneId()) {
      const choice = await confirmUnsavedChanges("adding this tune to Set List");
      if (choice === "cancel") return null;
      if (choice === "save") {
        const ok = await performSaveFlow();
        if (!ok) return null;
      }
    }

    const res = findTuneById(id);
    if (!res) throw new Error("Tune not found in library.");

    const readRes = await readFile(res.file.path);
    if (!readRes || !readRes.ok) throw new Error(readRes && readRes.error ? readRes.error : "Unable to read file.");
    const content = String(readRes.data || "");
    const activeFilePath = getActiveFilePath();
    const entryHeader = (activeFilePath && pathsEqual(activeFilePath, res.file.path))
      ? getHeaderText()
      : (res.file.headerText || "");

    const startOffset = Number(res.tune.startOffset);
    const endOffset = Number(res.tune.endOffset);
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset < 0 || endOffset <= startOffset || endOffset > content.length) {
      throw new Error("Refusing to add: tune offsets look stale. Refresh the library and try again.");
    }
    const slice = content.slice(startOffset, endOffset);
    const trimmed = slice.replace(/^\s+/, "");
    const xMatch = trimmed.match(/^X:\s*(\d+)/);
    if (!xMatch) {
      throw new Error("Refusing to add: tune offsets look stale. Refresh the library and try again.");
    }
    const expectedX = String(res.tune.xNumber || "");
    if (expectedX && xMatch[1] !== expectedX) {
      throw new Error(`Refusing to add: tune offsets look stale (expected X:${expectedX}). Refresh the library and try again.`);
    }

    return {
      sourceTuneId: id,
      sourcePath: res.file.path,
      xNumber: res.tune.xNumber || "",
      title: res.tune.title || fallbackTitle || "",
      composer: res.tune.composer || fallbackComposer || "",
      key: res.tune.key || "",
      rhythm: res.tune.rhythm || "",
      origin: res.tune.origin || "",
      groups: Array.isArray(res.tune.groups)
        ? res.tune.groups.slice()
        : (res.tune.group ? [res.tune.group] : []),
      sourceFileModifiedAt: Number.isFinite(Number(res.file.updatedAtMs)) && Number(res.file.updatedAtMs) > 0
        ? new Date(Number(res.file.updatedAtMs)).toISOString()
        : "",
      headerText: entryHeader,
      text: slice,
    };
  }

  async function renderItemToSvg({ abcText, headerText, tune } = {}) {
    const body = String(abcText || "");
    const sanitizedHeader = sanitizeHeaderText(headerText);
    const prefix = buildHeaderPrefix(sanitizedHeader, false, body);
    const block = prefix.text ? `${prefix.text}${body}` : body;
    const context = { tuneLabel: buildPrintTuneLabel(tune || {}) };
    setErrorLineOffsetFromHeader(prefix.text);
    const res = await renderAbcToSvgMarkup(block, { errorContext: context, pageFormat: true });
    return { ...res, blockText: block };
  }

  async function saveAbc({ suggestedName, content } = {}) {
    const suggestedDir = getDefaultSaveDir();
    const filePath = await showSaveDialog(suggestedName || "set-list.abc", suggestedDir);
    if (!filePath) return false;
    return withFileLock(filePath, async () => {
      const res = await writeFile(filePath, content);
      if (res && res.ok) return true;
      await showSaveError((res && res.error) ? res.error : "Unable to export set list.");
      return false;
    });
  }

  async function outputPrint({ type, svgMarkup, suggestedName } = {}) {
    const api = window.api;
    if (!api) return null;
    if (type === "print" && typeof api.printDialog === "function") {
      return api.printDialog(svgMarkup, suggestedName);
    }
    if (type === "pdf" && typeof api.exportPdf === "function") {
      return api.exportPdf(svgMarkup, suggestedName);
    }
    if (type === "preview" && typeof api.printPreview === "function") {
      return api.printPreview(svgMarkup, suggestedName);
    }
    return null;
  }

  return {
    buildItemForTuneId,
    outputPrint,
    renderItemToSvg,
    saveAbc,
  };
}

export {
  createSetListRendererAdapter,
};
