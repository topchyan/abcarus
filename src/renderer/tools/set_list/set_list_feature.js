import {
  DEFAULT_SET_LIST_HEADER_TEXT,
  convertLegacySetListState,
  hashSetListAbc,
  insertSetListDocumentItem,
  moveSetListDocumentItems,
  removeSetListDocumentItem,
} from "./set_list_document.js";
import {
  createEmptySetListDocument,
  createSetListSession,
} from "./set_list_session.js";
import { createSetListController } from "./set_list_controller.js";
import {
  buildSetListExportAbc,
  getPrintableSetListItems,
  getSetListFileHeaderText,
  shouldInjectNewPageBeforeTune,
} from "../../print/set_list_markup.js";
import {
  buildPrintErrorCard,
  buildPrintErrorSummary,
} from "../../print/error_markup.js";

const DEFAULT_STORAGE_KEY = "abcarus.setList.v1";

function hasItems(items) {
  return Array.isArray(items) && items.length > 0;
}

function createSetListFeature({
  elements = {},
  storageKey = DEFAULT_STORAGE_KEY,
  readStorage = () => null,
  writeStorage = () => false,
  readFile = async () => ({ ok: false, error: "Read unavailable." }),
  writeFile = async () => ({ ok: false, error: "Write unavailable." }),
  showOpenSetListDialog = async () => null,
  showSaveSetListDialog = async () => null,
  getDefaultSaveDir = () => "",
  getActiveTuneId = () => "",
  safeBasename = (value) => String(value || "").split(/[\\/]/).pop() || "",
  buildItemForTuneId = async () => null,
  activateItemSource = async () => ({ status: "MISSING", candidate: null }),
  resolveItemSource = async () => ({ status: "MISSING", candidate: null }),
  onPanelVisibilityChange = () => {},
  renderItemToSvg = async () => ({ ok: false, error: "Render unavailable." }),
  buildSourceLinkMarkup = async () => "",
  outputPrint = async () => ({ ok: false, error: "Print unavailable." }),
  saveAbc = async () => false,
  getExportBaseName = () => "set-list",
  getPrintBaseName = () => "set-list",
  ensureXNumberInAbc = (text) => text,
  appendTuneToContent = (content, tune) => `${content || ""}${tune || ""}`,
  applyPrintDebugMarkup = (text) => text,
  sanitizeFileBaseName = (text) => String(text || ""),
  setStatus = () => {},
  showToast = () => {},
  logError = () => {},
  confirm = (message) => window.confirm(message),
  confirmUnsavedChanges = async () => "cancel",
  enableDraggable = null,
  nowIso = () => new Date().toISOString(),
} = {}) {
  const makeId = () => globalThis.crypto.randomUUID();
  let controller = null;
  let activeItemId = "";
  const itemResolutions = new Map();
  const session = createSetListSession({
    makeId,
    readFile,
    writeFile,
    readStorage,
    writeStorage,
    onChange: () => { if (controller) controller.render(); },
  });

  const legacy = convertLegacySetListState(readStorage(storageKey), { makeId });
  let legacyImported = Boolean(legacy && legacy.items.length);
  if (legacyImported) {
    legacy.title = "Previous Set List";
    session.replaceDocument(legacy, { nextDirty: false });
  }

  const getDocumentState = () => session.getState();
  const getDocument = () => getDocumentState().document;
  const getItems = () => getDocument().items;
  const getState = () => {
    const state = getDocumentState();
    return {
      items: getExportItems(),
      pageBreaks: state.document.print.pageBreaks,
      compact: state.document.print.compact,
      title: state.document.title,
      dirty: state.dirty,
      filePath: state.filePath,
      notice: legacyImported
        ? "Imported from the previous ABCarus Set List. Use Save As to keep it as a portable document."
        : "",
      canAddCurrentTune: Boolean(String(getActiveTuneId() || "").trim()),
      activeItemId,
      resolutions: Object.fromEntries(itemResolutions),
    };
  };
  const getHeaderText = () => getDocument().print.headerText;

  function getExportItems() {
    return getItems().map((item) => ({
      id: item.id,
      sourceTuneId: item.tune.source.locatorHint || `${item.tune.source.pathHint}::${item.tune.source.xNumberHint}`,
      sourcePath: item.tune.source.pathHint,
      xNumber: item.tune.source.xNumberHint,
      title: item.tune.title,
      composer: item.tune.composer,
      headerText: item.embeddedHeaderAbc || "",
      text: item.embeddedAbc || "",
      export: { ...item.export },
    }));
  }

  const getFileHeaderText = () => getSetListFileHeaderText(getHeaderText());

  const shouldUseZeroPageMargins = () => {
    const header = String(getHeaderText() || "");
    const hasLeft0 = /^\s*%%\s*leftmargin\s+0(\s|$)/im.test(header);
    const hasRight0 = /^\s*%%\s*rightmargin\s+0(\s|$)/im.test(header);
    return hasLeft0 && hasRight0;
  };

  controller = createSetListController({
    modal: elements.modal,
    closeButton: elements.closeButton,
    titleInput: elements.titleInput,
    newButton: elements.newButton,
    openButton: elements.openButton,
    saveButton: elements.saveButton,
    saveAsButton: elements.saveAsButton,
    addCurrentButton: elements.addCurrentButton,
    empty: elements.empty,
    itemsList: elements.itemsList,
    headerButton: elements.headerButton,
    clearButton: elements.clearButton,
    saveAbcButton: elements.saveAbcButton,
    exportPdfButton: elements.exportPdfButton,
    printButton: elements.printButton,
    pageBreaksSelect: elements.pageBreaksSelect,
    compactCheckbox: elements.compactCheckbox,
    headerModal: elements.headerModal,
    headerCloseButton: elements.headerCloseButton,
    headerText: elements.headerText,
    headerResetButton: elements.headerResetButton,
    headerSaveButton: elements.headerSaveButton,
    snapshotModal: elements.snapshotModal,
    snapshotCloseButton: elements.snapshotCloseButton,
    snapshotTitle: elements.snapshotTitle,
    snapshotPreview: elements.snapshotPreview,
    targetModal: elements.targetModal,
    targetCloseButton: elements.targetCloseButton,
    targetSelect: elements.targetSelect,
    targetNewButton: elements.targetNewButton,
    targetCancelButton: elements.targetCancelButton,
    targetAddButton: elements.targetAddButton,
    defaultHeaderText: DEFAULT_SET_LIST_HEADER_TEXT,
    getState,
    getHeaderText,
    onMoveItem: (fromIndex, toIndex) => {
      session.mutate((document) => {
        document.items = moveSetListDocumentItems(document.items, fromIndex, toIndex);
      });
    },
    onRemoveItem: (index) => {
      const item = getItems()[Number(index)];
      session.mutate((document) => { document.items = removeSetListDocumentItem(document.items, index); });
      if (item) itemResolutions.delete(item.id);
      if (item && activeItemId === item.id) activeItemId = "";
    },
    onDuplicateItem: (index) => {
      const item = getItems()[Number(index)];
      if (!item) return false;
      const duplicate = structuredClone(item);
      duplicate.id = makeId();
      session.mutate((document) => {
        document.items = insertSetListDocumentItem(document.items, duplicate, Number(index) + 1);
      });
      itemResolutions.set(duplicate.id, itemResolutions.get(item.id) || "");
      activeItemId = duplicate.id;
      return true;
    },
    onPreviewSnapshot: async (index) => {
      const item = getItems()[Number(index)];
      if (!item || !item.embeddedAbc) {
        controller.openSnapshotPreview({ error: "This Set List item does not contain an embedded snapshot." });
        return false;
      }
      const result = await renderItemToSvg({
        abcText: item.embeddedAbc,
        headerText: `${getFileHeaderText()}${item.embeddedHeaderAbc || ""}`,
        tune: { id: item.id, title: item.tune.title || "Snapshot" },
      });
      controller.openSnapshotPreview({
        title: `${item.tune.title || "Untitled"} - stored snapshot`,
        svg: result && result.svg ? result.svg : "",
        error: result && result.svg ? "" : (result && result.error ? result.error : "Unable to render snapshot."),
      });
      return Boolean(result && result.svg);
    },
    onUpdateSnapshot: async (index) => {
      const item = getItems()[Number(index)];
      if (!item) return false;
      const resolution = await resolveItemSource(item);
      if (!resolution || !resolution.candidate) {
        showToast("The source tune could not be resolved. Snapshot was not changed.", 4000);
        return false;
      }
      const replacement = await buildDocumentItem(resolution.candidate.tuneId);
      if (!replacement) return false;
      replacement.id = item.id;
      replacement.performance = structuredClone(item.performance);
      replacement.notes = item.notes;
      replacement.links = structuredClone(item.links);
      replacement.export = structuredClone(item.export);
      session.mutate((document) => { document.items[Number(index)] = replacement; });
      itemResolutions.set(item.id, "FOUND_EXACT");
      showToast("Set List snapshot updated from the Library source.", 3000);
      return true;
    },
    onAddTune: async (tuneId, options = {}) => {
      await addTuneById(tuneId, options);
    },
    onActivateItem: async (index) => {
      const item = getItems()[Number(index)];
      if (!item) return false;
      const result = await activateItemSource(item);
      const status = String(result && result.status || "MISSING");
      itemResolutions.set(item.id, status);
      if (result && result.opened) {
        activeItemId = item.id;
        const source = item.tune && item.tune.source ? item.tune.source : {};
        const sourceLabel = source.pathHint
          ? `${safeBasename(source.pathHint)}${source.xNumberHint ? ` X:${source.xNumberHint}` : ""}`
          : "Library source";
        setStatus(`Set List: ${getDocument().title} · ${Number(index) + 1} of ${getItems().length} · source ${sourceLabel}`);
        if (status === "FOUND_MODIFIED") showToast("Opened the Library source. It differs from the stored Set List snapshot.", 3600);
        return true;
      }
      if (status === "FOUND_STRONG") {
        showToast("A possible source was found, but it must be relinked explicitly.", 4200);
      } else if (status === "AMBIGUOUS") {
        showToast("Several possible Library sources were found. Relink is required.", 4200);
      } else {
        showToast("Library source not found. The stored snapshot remains available for export and recovery.", 4200);
      }
      return false;
    },
    onVisibilityChange: onPanelVisibilityChange,
    onClear: () => {
      session.mutate((document) => { document.items = []; });
    },
    onPageBreaksChange: (value) => {
      session.mutate((document) => { document.print.pageBreaks = value; });
    },
    onCompactChange: (value) => {
      session.mutate((document) => { document.print.compact = Boolean(value); });
    },
    onHeaderTextChange: (value) => {
      session.mutate((document) => { document.print.headerText = String(value || ""); });
    },
    onTitleChange: (value) => session.mutate((document) => { document.title = String(value || "Untitled Set List"); }),
    onNew: () => { newSetList().catch(logError); },
    onOpen: () => { openSetList().catch(logError); },
    onSave: () => { saveSetList(false).catch(logError); },
    onSaveAs: () => { saveSetList(true).catch(logError); },
    onAddCurrent: () => {
      const tuneId = String(getActiveTuneId() || "").trim();
      if (!tuneId) return;
      addTuneById(tuneId).then((added) => {
        if (added) showToast(`Added to ${getDocument().title}.`, 2400);
      }).catch(logError);
    },
    onSaveAbc: () => {
      exportAbc().catch(() => {});
    },
    onExportPdf: () => {
      runPrintAction("pdf").catch(() => {});
    },
    onPrint: () => {
      runPrintAction("print").catch(() => {});
    },
    confirm,
    showToast,
    enableDraggable,
  });

  const render = () => controller.render();
  async function refreshItemResolutions() {
    for (const item of getItems()) {
      try {
        const result = await resolveItemSource(item);
        itemResolutions.set(item.id, String(result && result.status || "MISSING"));
      } catch {
        itemResolutions.set(item.id, "MISSING");
      }
    }
    render();
  }
  const open = () => {
    controller.open();
    refreshItemResolutions().catch(() => {});
  };
  const close = () => controller.close();
  const openHeaderEditor = () => controller.openHeaderEditor();
  const closeHeaderEditor = () => controller.closeHeaderEditor();

  const insertItem = (item, index) => {
    session.mutate((document) => {
      document.items = insertSetListDocumentItem(document.items, item, index);
    });
    return true;
  };

  async function addTuneById(tuneId, options = {}) {
    const id = String(tuneId || "").trim();
    if (!id) throw new Error("Missing tune id.");
    const item = await buildDocumentItem(id, options);
    if (!item) return false;
    const inserted = insertItem(item, options.insertIndex);
    if (inserted) {
      itemResolutions.set(item.id, "FOUND_EXACT");
      activeItemId = item.id;
      controller.open();
    }
    return inserted;
  }

  async function buildDocumentItem(tuneId, options = {}) {
    const source = await buildItemForTuneId(tuneId, options);
    if (!source) return null;
    const contentHash = await hashSetListAbc(source.text || "");
    return {
      id: makeId(),
      tune: {
        title: source.title || options.fallbackTitle || "",
        composer: source.composer || options.fallbackComposer || "",
        key: source.key || "",
        rhythm: source.rhythm || "",
        origin: source.origin || "",
        groups: Array.isArray(source.groups) ? source.groups.slice() : [],
        source: {
          locatorHint: String(tuneId || ""),
          pathHint: source.sourcePath || "",
          xNumberHint: source.xNumber || "",
        },
        contentHash,
      },
      embeddedAbc: source.text || "",
      embeddedHeaderAbc: source.headerText || "",
      snapshot: {
        capturedAt: nowIso(),
        ...(source.sourceFileModifiedAt ? { sourceFileModifiedAt: source.sourceFileModifiedAt } : {}),
      },
      performance: { transposeSemitones: 0, tempoScale: 1 },
      notes: "",
      links: [],
      export: { includeInPdf: true, pageBreakBefore: false },
    };
  }

  const buildExportAbc = () => buildSetListExportAbc({
    items: getExportItems(),
    headerText: getHeaderText(),
    pageBreaks: getDocument().print.pageBreaks,
    ensureXNumberInAbc,
    appendTuneToContent,
  });

  async function exportAbc() {
    if (!hasItems(getItems())) return false;
    const base = getExportBaseName();
    const suggestedName = `${base ? `${base}-` : ""}set-list.abc`;
    const content = buildExportAbc();
    if (!content.trim()) {
      showToast("Nothing to export.", 2400);
      return false;
    }
    const ok = await saveAbc({ suggestedName, content });
    if (ok) showToast("Exported.", 2400);
    return Boolean(ok);
  }

  async function renderSvgMarkupForPrint(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const includeIssueCards = options.includeIssueCards !== false;
    const includeIssueSummary = options.includeIssueSummary !== false;
    const items = getPrintableSetListItems(getExportItems());
    if (!hasItems(items)) return { ok: false, error: "No tunes in Set List." };

    const entry = { basename: "Set List" };
    const blocks = [];
    let current = [];
    const summary = [];

    const flush = () => {
      if (!current.length) return;
      blocks.push(current);
      current = [];
    };

    const total = items.length;
    let printableIndex = 0;
    for (let i = 0; i < total; i += 1) {
      const item = items[i] || {};
      const raw = String(item.text || "");
      if (onProgress && (i % 5 === 0 || i === total - 1)) onProgress(i + 1, total);
      if (!raw.trim()) continue;

      const tune = {
        id: item.sourceTuneId || item.id || "",
        xNumber: String(printableIndex + 1),
        title: item.title || "",
        preview: item.title || `X:${printableIndex + 1}`,
      };

      const pageBreaks = getDocument().print.pageBreaks;
      const breakBefore = shouldInjectNewPageBeforeTune(raw, {
        mode: pageBreaks,
        idx: printableIndex,
        pageBreakBefore: item.export.pageBreakBefore,
      });
      if (breakBefore) flush();

      const renumbered = ensureXNumberInAbc(raw, printableIndex + 1);
      const combinedHeader = `${getFileHeaderText()}${item.headerText || ""}`;
      const renderRes = await renderItemToSvg({
        abcText: renumbered,
        headerText: combinedHeader,
        tune,
      });
      const tuneErrors = renderRes && renderRes.errors ? renderRes.errors.slice() : [];
      if (renderRes && !renderRes.ok && renderRes.error) tuneErrors.push({ message: renderRes.error });

      if (tuneErrors.length) {
        const uniqueKeys = new Set(tuneErrors.map((err) => {
          const msg = err && err.message ? err.message : "Unknown error";
          const loc = err && err.loc ? `Line ${err.loc.line}, Col ${err.loc.col}` : "";
          return `${msg}|${loc}`;
        }));
        summary.push({ tune, count: uniqueKeys.size });
        if (includeIssueCards) current.push(buildPrintErrorCard(entry, tune, tuneErrors).trim());
      }

      if (renderRes && renderRes.svg && renderRes.svg.trim()) current.push(renderRes.svg.trim());
      const sourceMarkup = await buildSourceLinkMarkup(renderRes && renderRes.blockText ? renderRes.blockText : renumbered);
      if (sourceMarkup) current.push(sourceMarkup);

      if (pageBreaks === "perTune") flush();
      printableIndex += 1;
    }
    flush();

    if (!blocks.length) return { ok: false, error: "No SVG output produced." };

    const parts = [];
    if (includeIssueSummary && summary.length) {
      parts.push(buildPrintErrorSummary(entry, summary, total).trim());
    }
    for (const block of blocks) {
      parts.push(`<div class="print-tune">${block.join("\n")}</div>`);
    }
    const issues = {
      totalTunes: total,
      tunesWithIssues: summary.length,
      totalErrors: summary.reduce((sum, item) => sum + (Number.isFinite(Number(item.count)) ? Number(item.count) : 0), 0),
    };
    return { ok: true, svg: parts.join("\n"), issues };
  }

  async function runPrintAction(type) {
    if (!hasItems(getItems())) {
      setStatus("No Set List to print.");
      return false;
    }
    setStatus("Rendering…");
    const showIssuesInMarkup = type === "preview";
    const renderRes = await renderSvgMarkupForPrint({
      includeIssueCards: showIssuesInMarkup,
      includeIssueSummary: showIssuesInMarkup,
      onProgress: (current, total) => {
        setStatus(`Rendering tunes… ${current}/${total}`);
      },
    });
    if (!renderRes.ok) {
      setStatus("Error");
      logError(renderRes.error || "Unable to render.");
      return false;
    }

    let svgMarkup = applyPrintDebugMarkup(renderRes.svg);
    if (shouldUseZeroPageMargins()) {
      svgMarkup = `<!--abcarus:pdf-no-margins-->\n<style>body{padding:0 !important}</style>\n${svgMarkup}`;
    }
    if (getDocument().print.compact) {
      svgMarkup = `<style>body{padding:12px !important}</style>\n${svgMarkup}`;
    }
    const suggestedName = sanitizeFileBaseName(`${getPrintBaseName() || "set-list"} - set-list`);
    const res = await outputPrint({ type, svgMarkup, suggestedName });
    if (res && res.ok) {
      setStatus("OK");
      if (type === "pdf" && res.path) {
        const issues = renderRes.issues || null;
        const suffix = (issues && issues.tunesWithIssues)
          ? ` (${issues.tunesWithIssues} tunes had issues; use Preview for details)`
          : "";
        showToast(`Exported PDF: ${res.path}${suffix}`);
      }
      return true;
    }
    if (res && res.error && res.error !== "Canceled") {
      setStatus("Error");
      logError(res.error);
    }
    return false;
  }

  async function prepareToLeave(contextLabel = "continuing") {
    if (!getDocumentState().dirty) return true;
    const choice = await confirmUnsavedChanges(`${contextLabel} (Set List)`);
    if (choice === "cancel") return false;
    if (choice === "dont_save") return true;
    if (choice === "save") return saveSetList(false);
    return false;
  }

  async function newSetList() {
    if (!await prepareToLeave("creating a new Set List")) return false;
    if (legacyImported) {
      writeStorage(storageKey, null);
      legacyImported = false;
    }
    session.newDocument();
    activeItemId = "";
    itemResolutions.clear();
    render();
    return true;
  }

  async function openSetList() {
    if (!await prepareToLeave("opening another Set List")) return false;
    const path = await showOpenSetListDialog();
    if (!path) return false;
    const result = await session.open(path);
    if (!result.ok) {
      logError(result.error || "Unable to open Set List.");
      return false;
    }
    if (legacyImported) {
      writeStorage(storageKey, null);
      legacyImported = false;
    }
    activeItemId = "";
    itemResolutions.clear();
    render();
    return true;
  }

  async function saveSetList(forceSaveAs = false) {
    let path = forceSaveAs ? "" : getDocumentState().filePath;
    if (!path) {
      path = await showSaveSetListDialog(getDocument().title, getDefaultSaveDir());
      if (!path) return false;
    }
    const result = await session.save(path);
    if (!result.ok) {
      logError(result.conflict
        ? "Set List changed on disk. Re-open it before saving again."
        : (result.error || "Unable to save Set List."));
      return false;
    }
    writeStorage(storageKey, null);
    legacyImported = false;
    showToast(`Saved Set List: ${safeBasename(path)}`, 2800);
    render();
    return true;
  }

  async function addTuneWithTargetChoice(tuneId, options = {}) {
    const state = getDocumentState();
    const others = state.recentPaths.filter((path) => path !== state.filePath);
    if (!others.length) {
      const added = await addTuneById(tuneId, options);
      if (added) showToast(`Added to ${state.document.title}.`, 2400);
      return added;
    }
    const targets = [{ value: "__current__", label: `${state.document.title}${state.dirty ? " (unsaved changes)" : ""}` }];
    for (const path of others) targets.push({ value: path, label: safeBasename(path) });
    const choice = await controller.chooseTarget(targets);
    if (!choice) return false;
    if (choice === "__current__") {
      const added = await addTuneById(tuneId, options);
      if (added) showToast(`Added to ${state.document.title}.`, 2400);
      return added;
    }
    if (choice === "__new__") {
      if (!await prepareToLeave("creating a new Set List")) return false;
      const item = await buildDocumentItem(String(tuneId || ""), options);
      if (!item) return false;
      const path = await showSaveSetListDialog("Untitled Set List", getDefaultSaveDir());
      if (!path) return false;
      const document = createEmptySetListDocument({ id: makeId(), title: safeBasename(path).replace(/\.abcarus-setlist\.json$/i, "") });
      document.items.push(item);
      session.replaceDocument(document, { nextDirty: true });
      const result = await session.save(path);
      if (!result.ok) throw new Error(result.error || "Unable to save Set List.");
      writeStorage(storageKey, null);
      showToast(`Created ${document.title}.`, 2400);
      open();
      return true;
    }
    if (!await prepareToLeave("opening the selected Set List")) return false;
    const opened = await session.open(choice);
    if (!opened.ok) {
      session.forgetRecentPath(choice);
      throw new Error(opened.error || "Unable to open target Set List.");
    }
    legacyImported = false;
    activeItemId = "";
    itemResolutions.clear();
    open();
    const added = await addTuneById(tuneId, options);
    if (added) showToast(`Added to ${getDocument().title}. Save the Set List to keep this change.`, 3200);
    return added;
  }

  return {
    addTuneById,
    addTuneWithTargetChoice,
    buildExportAbc,
    close,
    closeHeaderEditor,
    exportAbc,
    getState,
    newSetList,
    openSetList,
    open,
    openHeaderEditor,
    prepareToLeave,
    render,
    renderSvgMarkupForPrint,
    runPrintAction,
    saveSetList,
  };
}

export {
  createSetListFeature,
};
