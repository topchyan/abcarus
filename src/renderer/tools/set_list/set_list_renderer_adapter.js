import { buildPrintTuneLabel } from "../../print/error_markup.js";
import { hashSetListAbc, resolveSetListItem, sourcePathsEquivalent } from "./set_list_document.js";

function createSetListRendererAdapter({
  getCurrentDocDirty = () => false,
  getActiveTuneId = () => "",
  getActiveFilePath = () => "",
  getHeaderText = () => "",
  confirmUnsavedChanges = async () => "cancel",
  performSaveFlow = async () => false,
  findTuneById = () => null,
  getLibraryIndex = () => null,
  getTuneText = async () => "",
  selectTune = async () => false,
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
  async function resolveItemSource(item) {
    const snapshot = item && item.tune ? item.tune : {};
    const source = snapshot.source || {};
    const index = getLibraryIndex();
    const files = index && Array.isArray(index.files) ? index.files : [];
    const all = [];
    for (const file of files) {
      for (const tune of Array.isArray(file && file.tunes) ? file.tunes : []) {
        all.push({
          tuneId: String(tune.id || ""),
          sourcePath: String(file.path || ""),
          xNumber: String(tune.xNumber || ""),
          title: String(tune.title || ""),
          composer: String(tune.composer || ""),
          tune,
          file,
        });
      }
    }

    const locator = String(source.locatorHint || "");
    const direct = locator ? findTuneById(locator) : null;
    let candidates = direct
      ? [{
          tuneId: String(direct.tune.id || locator),
          sourcePath: String(direct.file.path || ""),
          xNumber: String(direct.tune.xNumber || ""),
          title: String(direct.tune.title || ""),
          composer: String(direct.tune.composer || ""),
          tune: direct.tune,
          file: direct.file,
        }]
      : all.filter((candidate) => source.pathHint && source.xNumberHint
        && (pathsEqual(candidate.sourcePath, source.pathHint)
          || sourcePathsEquivalent(candidate.sourcePath, source.pathHint))
        && candidate.xNumber === String(source.xNumberHint));

    if (!candidates.length) {
      const title = String(snapshot.title || "").trim().toLocaleLowerCase("en");
      const composer = String(snapshot.composer || "").trim().toLocaleLowerCase("en");
      candidates = all.filter((candidate) => {
        if (!title || candidate.title.trim().toLocaleLowerCase("en") !== title) return false;
        return !composer || candidate.composer.trim().toLocaleLowerCase("en") === composer;
      });
    }

    for (const candidate of candidates) {
      try {
        const abc = await getTuneText(candidate.tune, candidate.file);
        candidate.contentHash = await hashSetListAbc(abc || "");
      } catch {
        candidate.contentHash = "";
      }
    }
    return resolveSetListItem(item, candidates);
  }

  async function activateItemSource(item) {
    const resolution = await resolveItemSource(item);
    if (!resolution || !resolution.candidate) return resolution;
    const trustedSourceMatch = resolution.status === "FOUND_STRONG" && resolution.matchedBy === "source";
    if (!["FOUND_EXACT", "FOUND_MODIFIED"].includes(resolution.status) && !trustedSourceMatch) return resolution;
    const opened = await selectTune(resolution.candidate.tuneId, { origin: "set-list" });
    return { ...resolution, opened: opened !== false };
  }

  async function buildItemForTuneId(
    tuneId,
    { fallbackTitle = "", fallbackComposer = "" } = {}
  ) {
    const id = String(tuneId || "").trim();
    if (!id) throw new Error("Missing tune id.");

    if (getCurrentDocDirty() && getActiveTuneId() && id === getActiveTuneId()) {
      const choice = await confirmUnsavedChanges("adding this tune to Set List");
      if (choice !== "save") return null;
      const ok = await performSaveFlow();
      if (!ok) return null;
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
    activateItemSource,
    buildItemForTuneId,
    outputPrint,
    resolveItemSource,
    renderItemToSvg,
    saveAbc,
  };
}

export {
  createSetListRendererAdapter,
};
