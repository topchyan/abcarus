import { createPrintAllOptionsController } from "./print_all_options_controller.js";
import { buildPrintTuneLabel } from "./error_markup.js";
import { composeHeaderPrefixPayload } from "../abc/header_prefix_model.js";

function createPrintAllFeature({
  elements = {},
  api,
  readStorage = () => null,
  writeStorage = () => false,
  storageKey = "abcarus.printAllOptions.v1",
  getActiveFileEntry = () => null,
  getCurrentDocDirty = () => false,
  confirmUnsavedChanges = async () => "cancel",
  performSaveFlow = async () => false,
  getFileContent = async () => ({ ok: false, error: "Unable to read file." }),
  getEffectiveHeaderText = () => "",
  sanitizeHeaderText = (text) => text,
  buildHeaderPrefix = (_header, _forRender, tuneText) => ({ text: "", offset: 0, tuneText }),
  collectHeaderKeys = () => new Set(),
  pathsEqual = (a, b) => String(a || "") === String(b || ""),
  getActiveFilePath = () => "",
  renderAbcToSvgMarkup = async () => ({ ok: false, error: "Unable to render." }),
  buildSourceLinkMarkup = async () => "",
  applyPrintDebugMarkup = (markup) => markup,
  getPrintBaseName = () => "songbook",
  setErrorLineOffsetFromHeader = () => {},
  setLibraryErrorIndexForTune = () => {},
  setStatus = () => {},
  showToast = () => {},
  logError = () => {},
  getDebugEnabled = () => false,
  onDebug = () => {},
} = {}) {
  const optionsController = createPrintAllOptionsController({
    modal: elements.optionsModal,
    pageBreaksSelect: elements.pageBreaksSelect,
    rememberCheckbox: elements.rememberCheckbox,
    closeButton: elements.closeButton,
    cancelButton: elements.cancelButton,
    okButton: elements.okButton,
  });

  function loadOptionsFromStorage() {
    optionsController.applySavedOptions(readStorage(storageKey));
  }

  function persistOptionsToStorageNow() {
    const patch = optionsController.getPatch();
    writeStorage(storageKey, {
      version: "1",
      savedAtMs: Date.now(),
      pageBreaks: patch.printAllPageBreaks,
      askEachTime: !!patch.printAllAskEachTime,
    });
  }

  async function getPageBreaksForAction() {
    const res = await optionsController.getPageBreaksForAction();
    if (!res || !res.pageBreaks) return null;

    if (res.patch) {
      try {
        if (api && typeof api.updateSettings === "function") {
          await api.updateSettings(res.patch);
        }
      } catch {}
      persistOptionsToStorageNow();
    }
    return res.pageBreaks;
  }

  async function renderAllSvgMarkup(entry, content, options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const pageBreaks = String(options.pageBreaks || "perTune");
    if (!entry || !entry.tunes || !entry.tunes.length) {
      return { ok: false, error: "No tunes to print." };
    }
    const debug = Boolean(getDebugEnabled());
    const debugInfo = debug ? {
      file: entry.path || "",
      totalTunes: entry.tunes.length,
      rendered: 0,
      skipped: 0,
      tunes: [],
    } : null;
    const blocks = [];
    let current = [];
    const flush = () => {
      if (!current.length) return;
      blocks.push(current);
      current = [];
    };
    const summary = [];
    for (let i = 0; i < entry.tunes.length; i += 1) {
      const tune = entry.tunes[i];
      if (onProgress && (i % 5 === 0 || i === entry.tunes.length - 1)) {
        onProgress(i + 1, entry.tunes.length);
      }
      if (!tune || !Number.isFinite(tune.startOffset) || !Number.isFinite(tune.endOffset)) {
        if (debugInfo) debugInfo.skipped += 1;
        continue;
      }
      const tuneText = String(content || "").slice(tune.startOffset, tune.endOffset);
      if (!tuneText.trim()) {
        if (debugInfo) debugInfo.skipped += 1;
        continue;
      }

      const breakBefore = (pageBreaks === "perTune") ? (i > 0) : false;
      if (breakBefore) flush();

      const effectiveHeader = (entry && entry.path && pathsEqual(entry.path, getActiveFilePath()))
        ? getEffectiveHeaderText(entry)
        : (entry.headerText || "");
      const headerText = sanitizeHeaderText(effectiveHeader);
      const prefix = buildHeaderPrefix(headerText, false, tuneText);
      const block = composeHeaderPrefixPayload(prefix, tuneText);
      const meta = debugInfo ? {
        id: tune.id,
        xNumber: tune.xNumber,
        title: tune.title || "",
        startOffset: tune.startOffset,
        endOffset: tune.endOffset,
        hasX: /^\s*X:/.test(tuneText),
        headerKeys: collectHeaderKeys(tuneText).size,
        blockLength: block.length,
      } : null;
      const context = {
        tuneId: tune.id,
        filePath: entry.path || null,
        fileBasename: entry.basename || "",
        tuneLabel: buildPrintTuneLabel(tune),
        xNumber: tune.xNumber || "",
        title: tune.title || "",
        skipMeasureRange: true,
      };
      setErrorLineOffsetFromHeader(prefix.lineOffsetText || prefix.text);
      const res = await renderAbcToSvgMarkup(block, { errorContext: context, pageFormat: true });
      const tuneErrors = res.errors ? res.errors.slice() : [];
      if (!res.ok && res.error) {
        tuneErrors.push({ message: res.error });
        logError(res.error, null, context);
      }
      const tuneMarkup = [];
      if (res.svg && res.svg.trim()) {
        tuneMarkup.push(res.svg.trim());
      }
      const sourceMarkup = await buildSourceLinkMarkup(block);
      if (sourceMarkup) tuneMarkup.push(sourceMarkup);
      if (tuneErrors.length) {
        const uniqueKeys = new Set(tuneErrors.map((err) => {
          const msg = err && err.message ? err.message : "Unknown error";
          const loc = err && err.loc ? `Line ${err.loc.line}, Col ${err.loc.col}` : "";
          return `${msg}|${loc}`;
        }));
        summary.push({ tune, count: uniqueKeys.size });
        setLibraryErrorIndexForTune(tune.id, uniqueKeys.size);
      } else {
        setLibraryErrorIndexForTune(tune.id, 0);
      }
      if (tuneMarkup.length) {
        current.push(tuneMarkup.join("\n"));
        if (debugInfo && meta) {
          meta.svgLength = String(res.svg || "").length;
          debugInfo.rendered += 1;
          debugInfo.tunes.push(meta);
        }
      } else if (debugInfo && meta) {
        meta.svgLength = 0;
        debugInfo.tunes.push(meta);
        debugInfo.skipped += 1;
      }
    }
    setErrorLineOffsetFromHeader("");
    flush();
    if (!blocks.length) return { ok: false, error: "No SVG output produced." };
    const svg = blocks.map((block) => `<div class="print-tune">${block.join("\n")}</div>`).join("\n");
    if (debugInfo) {
      debugInfo.pageBreaks = pageBreaks;
      debugInfo.svgParts = blocks.length;
      onDebug(debugInfo, svg);
    }
    return { ok: true, svg };
  }

  async function outputPrintMarkup(type, svgMarkup, suggestedName) {
    if (!api) return null;
    if (type === "preview" && typeof api.printPreview === "function") {
      return api.printPreview(svgMarkup, suggestedName);
    }
    if (type === "print" && typeof api.printDialog === "function") {
      return api.printDialog(svgMarkup, suggestedName);
    }
    if (type === "pdf" && typeof api.exportPdf === "function") {
      return api.exportPdf(svgMarkup, suggestedName);
    }
    return null;
  }

  async function runAction(type) {
    if (!api) return;
    const pageBreaks = await getPageBreaksForAction();
    if (!pageBreaks) return;
    const entry = getActiveFileEntry();
    if (!entry || !entry.path) {
      setStatus("No active file to print.");
      return;
    }
    if (getCurrentDocDirty()) {
      const choice = await confirmUnsavedChanges("printing all tunes");
      if (choice === "cancel") return;
      if (choice === "save") {
        const ok = await performSaveFlow();
        if (!ok) return;
      }
    }

    const contentRes = await getFileContent(entry.path);
    if (!contentRes.ok) {
      setStatus("Error");
      logError(contentRes.error || "Unable to read file.");
      return;
    }
    setStatus("Rendering...");
    const renderRes = await renderAllSvgMarkup(entry, contentRes.data || "", {
      pageBreaks,
      onProgress: (current, total) => {
        setStatus(`Rendering tunes... ${current}/${total}`);
      },
    });
    if (!renderRes.ok) {
      setStatus("Error");
      logError(renderRes.error || "Unable to render.");
      return;
    }
    const svgMarkup = applyPrintDebugMarkup(renderRes.svg);
    const res = await outputPrintMarkup(type, svgMarkup, getPrintBaseName());

    if (res && res.ok) {
      setStatus("OK");
      if (type === "pdf" && res.path) {
        showToast(`Exported PDF: ${res.path}`);
      }
    } else if (res && res.error) {
      setStatus("Error");
      logError(res.error);
    }
  }

  return {
    applySettings: (settings) => optionsController.applySettings(settings),
    loadOptionsFromStorage,
    renderAllSvgMarkup,
    runAction,
  };
}

export {
  createPrintAllFeature,
};
