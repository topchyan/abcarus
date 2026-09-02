import {
  DEFAULT_SET_LIST_HEADER_TEXT,
  SET_LIST_SCHEMA_V2,
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
  buildSetListCoverMarkup,
  buildSetListExportAbc,
  buildSetListIncipitAbc,
  buildSetListIndexMarkup,
  composeSetListRenderHeader,
  getPrintableSetListItems,
  getSetListFileHeaderText,
  formatSetListIndexTempo,
  namespaceSetListSvgIds,
  numberSetListTuneTitle,
  shouldInjectNewPageBeforeTune,
} from "../../print/set_list_markup.js";
import { collectPrintSources } from "../../print/source_link_markup.js";
import {
  buildPrintErrorCard,
  buildPrintErrorSummary,
} from "../../print/error_markup.js";
import {
  buildSetListPerformanceView,
  clampSetListTransposeSemitones,
  extractSetListPerformanceKey,
  mergeSetListSnapshotAfterSourceSave,
} from "./set_list_performance_model.js";

const DEFAULT_STORAGE_KEY = "abcarus.setList.v1";
const DEFAULT_PANEL_VISIBILITY_STORAGE_KEY = "abcarus.setList.panelVisible.v1";

function hasItems(items) {
  return Array.isArray(items) && items.length > 0;
}

function createSetListFeature({
  elements = {},
  storageKey = DEFAULT_STORAGE_KEY,
  panelVisibilityStorageKey = DEFAULT_PANEL_VISIBILITY_STORAGE_KEY,
  readStorage = () => null,
  writeStorage = () => false,
  readFile = async () => ({ ok: false, error: "Read unavailable." }),
  writeFile = async () => ({ ok: false, error: "Write unavailable." }),
  publishSetList = async () => ({ ok: false }),
  listSyncedSetLists = async () => ({ ok: false, entries: [] }),
  showOpenSetListDialog = async () => null,
  showSaveSetListDialog = async () => null,
  getDefaultSaveDir = () => "",
  getActiveTuneId = () => "",
  safeBasename = (value) => String(value || "").split(/[\\/]/).pop() || "",
  buildItemForTuneId = async () => null,
  activateItemSource = async () => ({ status: "MISSING", candidate: null }),
  resolveItemSource = async () => ({ status: "MISSING", candidate: null }),
  onCopyTuneList = () => {},
  onPerformanceOverrideChange = () => {},
  applyPerformanceView = async () => false,
  onPerformanceViewStateChange = () => {},
  onPanelVisibilityChange = () => {},
  getPrintPageMargins = () => "standard",
  setPrintPageMargins = async () => {},
  renderItemToSvg = async () => ({ ok: false, error: "Render unavailable." }),
  buildSourceLinkMarkup = async () => "",
  createQrDataUrl = async () => "",
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
  resolveSaveConflict = async () => "cancel",
  enableDraggable = null,
  nowIso = () => new Date().toISOString(),
} = {}) {
  const makeId = () => globalThis.crypto.randomUUID();
  let controller = null;
  let activeItemId = "";
  let activePerformanceContext = null;
  const itemResolutions = new Map();
  const performanceKeyCache = new WeakMap();
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
      dirtyReasons: state.dirtyReasons,
      pageMargins: getPrintPageMargins(),
      filePath: state.filePath,
      persistedUpdatedAt: state.persistedUpdatedAt,
      titlePage: Boolean(state.document.print.titlePage),
      tuneIndex: state.document.print.tuneIndex || "none",
      numberTunes: Boolean(state.document.print.numberTunes),
      indexQrCodes: Boolean(state.document.print.indexQrCodes),
      notice: legacyImported
        ? "Imported from the previous ABCarus Set List. Use Save As to keep it as a portable document."
        : "",
      canAddCurrentTune: Boolean(String(getActiveTuneId() || "").trim()),
      activeItemId,
      resolutions: Object.fromEntries(itemResolutions),
    };
  };
  const getHeaderText = () => getDocument().print.headerText;
  const updatePresentation = (mutator) => {
    session.mutate((document) => {
      document.schema = SET_LIST_SCHEMA_V2;
      mutator(document.print);
    }, { reason: "layout" });
  };
  const getSuggestedBaseName = () => (
    sanitizeFileBaseName(getDocument().title || "Untitled Set List") || "Untitled Set List"
  );

  async function publishCurrentSetList() {
    const state = getDocumentState();
    if (!state.filePath || state.dirty) return false;
    const result = await publishSetList(state.document, state.filePath);
    if (!result || !result.ok) return false;
    if (result.remoteWon && result.document) {
      session.replaceDocument(result.document, {
        nextFilePath: result.filePath || state.filePath,
        nextDiskText: `${JSON.stringify(result.document, null, 2)}\n`,
        nextDirty: false,
      });
    }
    return true;
  }

  function getPerformanceKey(item) {
    const originalKey = String(item && item.tune && item.tune.key || "").trim();
    const semitones = Number(item && item.performance && item.performance.transposeSemitones) || 0;
    if (!semitones) return originalKey;
    const cached = performanceKeyCache.get(item);
    if (cached && cached.semitones === semitones) return cached.key;
    const view = buildSetListPerformanceView({
      sourceText: String(item && item.embeddedAbc || ""),
      headerText: String(item && item.embeddedHeaderAbc || ""),
      transposeSemitones: semitones,
    });
    const key = view && view.ok
      ? extractSetListPerformanceKey(view.text, originalKey)
      : originalKey;
    performanceKeyCache.set(item, { semitones, key });
    return key;
  }

  function getExportItems() {
    return getItems().map((item) => ({
      id: item.id,
      sourceTuneId: item.tune.source.locatorHint || `${item.tune.source.pathHint}::${item.tune.source.xNumberHint}`,
      sourcePath: item.tune.source.pathHint,
      xNumber: item.tune.source.xNumberHint,
      title: item.tune.title,
      composer: item.tune.composer,
      originalKey: item.tune.key,
      performanceKey: getPerformanceKey(item),
      transposeSemitones: Number(item.performance && item.performance.transposeSemitones) || 0,
      tempoScale: Number(item.performance && item.performance.tempoScale) || 1,
      notes: item.notes || "",
      headerText: item.embeddedHeaderAbc || "",
      text: item.embeddedAbc || "",
      export: { ...item.export },
    }));
  }

  const getFileHeaderText = () => getSetListFileHeaderText(getHeaderText());

  function updatePracticeNote(index, value) {
    const target = Number(index);
    if (!Number.isInteger(target) || !getItems()[target]) return false;
    session.mutate((document) => {
      document.items[target].notes = String(value || "").trim();
    }, { reason: "practice notes" });
    return true;
  }

  async function showPerformanceView(index, item, sourceTuneId = "", requestedSemitones = null) {
    const semitones = requestedSemitones == null
      ? clampSetListTransposeSemitones(item && item.performance && item.performance.transposeSemitones)
      : clampSetListTransposeSemitones(requestedSemitones);
    const source = await buildItemForTuneId(sourceTuneId || item?.tune?.source?.locatorHint || "");
    if (!source) return false;
    const view = buildSetListPerformanceView({
      sourceText: source.text,
      headerText: source.headerText,
      transposeSemitones: semitones,
    });
    if (!view.ok) {
      showToast(view.error || "Unable to build the Set List performance view.", 4200);
      activePerformanceContext = null;
      onPerformanceViewStateChange(null);
      return false;
    }
    const applied = await applyPerformanceView({
      text: view.text,
      sourceText: source.text,
      headerText: source.headerText,
      itemId: item.id,
      itemIndex: Number(index),
      sourceTuneId: sourceTuneId || item?.tune?.source?.locatorHint || "",
      transposeSemitones: view.transposeSemitones,
    });
    if (applied === false) return false;
    activePerformanceContext = {
      itemId: item.id,
      itemIndex: Number(index),
      sourceTuneId: sourceTuneId || item?.tune?.source?.locatorHint || "",
      sourceText: source.text,
      headerText: source.headerText,
      text: view.text,
      transposeSemitones: view.transposeSemitones,
    };
    onPerformanceViewStateChange({ ...activePerformanceContext });
    return true;
  }

  async function savePerformanceInSetList(index, transposeSemitones) {
    const item = getItems()[index];
    if (!item) return false;
    let sourceTuneId = activeItemId === item.id
      ? (activePerformanceContext?.sourceTuneId || item.tune.source.locatorHint)
      : "";
    if (!sourceTuneId) {
      const resolution = await activateItemSource(item);
      if (!resolution || !resolution.opened || !resolution.candidate) {
        showToast("The source tune could not be opened. Nothing was changed.", 4000);
        return false;
      }
      sourceTuneId = String(resolution.candidate.tuneId || item.tune.source.locatorHint || "");
    }
    activeItemId = item.id;
    const replacement = await buildDocumentItem(sourceTuneId);
    const synchronized = mergeSetListSnapshotAfterSourceSave(item, replacement);
    if (!synchronized) {
      showToast("The Set List performance changed, but its source snapshot could not be refreshed.", 4200);
      return false;
    }
    synchronized.performance.transposeSemitones = transposeSemitones;
    if (!await showPerformanceView(index, item, sourceTuneId, transposeSemitones)) return false;
    session.mutate((document) => {
      document.items[index] = synchronized;
    }, { reason: "performance" });
    activeItemId = synchronized.id;
    itemResolutions.set(synchronized.id, "FOUND_EXACT");
    onPerformanceOverrideChange();
    const saved = await saveSetList(false);
    if (saved) {
      showToast(
        transposeSemitones
          ? `Saved ${transposeSemitones > 0 ? "+" : ""}${transposeSemitones} semitones in this Set List.`
          : "This Set List now uses the original key.",
        3000,
      );
    }
    return saved;
  }

  async function updatePerformance(index, value = {}) {
    const target = Number(index);
    if (!Number.isInteger(target) || !getItems()[target]) return false;
    const transposeSemitones = clampSetListTransposeSemitones(value.transposeSemitones);
    return savePerformanceInSetList(target, transposeSemitones);
  }

  async function adjustActivePerformanceTranspose(delta) {
    if (!activePerformanceContext || !activeItemId) return false;
    const target = getItems().findIndex((item) => item && item.id === activeItemId);
    if (target < 0) return false;
    const item = getItems()[target];
    const sourceTuneId = String(activePerformanceContext.sourceTuneId || item.tune.source.locatorHint || "");
    const nextTranspose = clampSetListTransposeSemitones(
      Number(activePerformanceContext.transposeSemitones || 0) + Number(delta || 0),
    );
    const replacement = await buildDocumentItem(sourceTuneId);
    const synchronized = mergeSetListSnapshotAfterSourceSave(item, replacement);
    if (!synchronized) {
      showToast("The Set List transposition could not refresh its source snapshot.", 4200);
      return false;
    }
    synchronized.performance.transposeSemitones = nextTranspose;
    if (!await showPerformanceView(target, item, sourceTuneId, nextTranspose)) return false;
    session.mutate((document) => {
      document.items[target] = synchronized;
    }, { reason: "performance" });
    activeItemId = synchronized.id;
    itemResolutions.set(synchronized.id, "FOUND_EXACT");
    onPerformanceOverrideChange();
    showToast(
      `Set List transposition: ${nextTranspose > 0 ? "+" : ""}${nextTranspose}. Save the Set List to keep it.`,
      3000,
    );
    return true;
  }

  async function activateItemAtIndex(index) {
    const target = Number(index);
    let item = getItems()[target];
    if (!item) return false;
    const result = await activateItemSource(item);
    const status = String(result && result.status || "MISSING");
    itemResolutions.set(item.id, status);
    if (result && result.opened) {
      activeItemId = item.id;
      const sourceTuneId = String(result.candidate && result.candidate.tuneId || "");
      const trustedSourceMatch = status === "FOUND_STRONG" && result.matchedBy === "source";
      if ((status === "FOUND_MODIFIED" || trustedSourceMatch) && sourceTuneId) {
        await syncSourceTuneAfterSave(sourceTuneId, {
          previousTuneId: item.tune && item.tune.source ? item.tune.source.locatorHint : "",
        });
        item = getItems()[target] || item;
      }
      if (!await showPerformanceView(target, item, sourceTuneId)) return false;
      const source = item.tune && item.tune.source ? item.tune.source : {};
      const sourceLabel = source.pathHint
        ? `${safeBasename(source.pathHint)}${source.xNumberHint ? ` X:${source.xNumberHint}` : ""}`
        : "Library source";
      setStatus(`Set List: ${getDocument().title} · ${target + 1} of ${getItems().length} · source ${sourceLabel}`);
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
  }

  controller = createSetListController({
    modal: elements.modal,
    closeButton: elements.closeButton,
    titleInput: elements.titleInput,
    dirtySummary: elements.dirtySummary,
    lastUpdated: elements.lastUpdated,
    quickSaveButton: elements.quickSaveButton,
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
    pageMarginsSelect: elements.pageMarginsSelect,
    compactCheckbox: elements.compactCheckbox,
    titlePageCheckbox: elements.titlePageCheckbox,
    tuneIndexSelect: elements.tuneIndexSelect,
    numberTunesCheckbox: elements.numberTunesCheckbox,
    indexQrCodesCheckbox: elements.indexQrCodesCheckbox,
    headerModal: elements.headerModal,
    headerCloseButton: elements.headerCloseButton,
    headerText: elements.headerText,
    headerResetButton: elements.headerResetButton,
    headerSaveButton: elements.headerSaveButton,
    snapshotModal: elements.snapshotModal,
    snapshotCloseButton: elements.snapshotCloseButton,
    snapshotTitle: elements.snapshotTitle,
    snapshotPreview: elements.snapshotPreview,
    noteModal: elements.noteModal,
    noteCloseButton: elements.noteCloseButton,
    noteTitle: elements.noteTitle,
    noteText: elements.noteText,
    noteCancelButton: elements.noteCancelButton,
    noteSaveButton: elements.noteSaveButton,
    performanceModal: elements.performanceModal,
    performanceCloseButton: elements.performanceCloseButton,
    performanceTitle: elements.performanceTitle,
    performanceTranspose: elements.performanceTranspose,
    performanceResetButton: elements.performanceResetButton,
    performanceCancelButton: elements.performanceCancelButton,
    performanceSaveButton: elements.performanceSaveButton,
    targetModal: elements.targetModal,
    targetCloseButton: elements.targetCloseButton,
    targetSelect: elements.targetSelect,
    targetNewButton: elements.targetNewButton,
    targetCancelButton: elements.targetCancelButton,
    targetAddButton: elements.targetAddButton,
    refreshSourcesButton: elements.refreshSourcesButton,
    defaultHeaderText: DEFAULT_SET_LIST_HEADER_TEXT,
    getState,
    getHeaderText,
    onMoveItem: (fromIndex, toIndex) => {
      session.mutate((document) => {
        document.items = moveSetListDocumentItems(document.items, fromIndex, toIndex);
      }, { reason: "item order" });
    },
    onRemoveItem: (index) => {
      const item = getItems()[Number(index)];
      session.mutate((document) => { document.items = removeSetListDocumentItem(document.items, index); }, { reason: "items" });
      if (item) itemResolutions.delete(item.id);
      if (item && activeItemId === item.id) activeItemId = "";
      if (item && activePerformanceContext?.itemId === item.id) activePerformanceContext = null;
    },
    onDuplicateItem: (index) => {
      const item = getItems()[Number(index)];
      if (!item) return false;
      const duplicate = structuredClone(item);
      duplicate.id = makeId();
      session.mutate((document) => {
        document.items = insertSetListDocumentItem(document.items, duplicate, Number(index) + 1);
      }, { reason: "items" });
      itemResolutions.set(duplicate.id, itemResolutions.get(item.id) || "");
      activeItemId = duplicate.id;
      return true;
    },
    onNotesChange: updatePracticeNote,
    onPerformanceChange: updatePerformance,
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
      session.mutate((document) => { document.items[Number(index)] = replacement; }, { reason: "snapshot" });
      itemResolutions.set(item.id, "FOUND_EXACT");
      showToast("Set List snapshot updated from the Library source.", 3000);
      return true;
    },
    onCopyTuneList,
    onAddTune: async (tuneId, options = {}) => {
      await addTuneById(tuneId, options);
    },
    onActivateItem: activateItemAtIndex,
    onVisibilityChange: (visible) => {
      writeStorage(panelVisibilityStorageKey, Boolean(visible));
      onPanelVisibilityChange(Boolean(visible));
    },
    onClear: () => {
      session.mutate((document) => { document.items = []; }, { reason: "items" });
    },
    onPageBreaksChange: (value) => {
      session.mutate((document) => { document.print.pageBreaks = value; }, { reason: "layout" });
    },
    onPageMarginsChange: (value) => {
      Promise.resolve(setPrintPageMargins(value)).catch(logError);
    },
    onCompactChange: (value) => {
      session.mutate((document) => { document.print.compact = Boolean(value); }, { reason: "layout" });
    },
    onTitlePageChange: (value) => updatePresentation((print) => { print.titlePage = Boolean(value); }),
    onTuneIndexChange: (value) => updatePresentation((print) => {
      print.tuneIndex = ["none", "compact", "incipits"].includes(value) ? value : "none";
    }),
    onNumberTunesChange: (value) => updatePresentation((print) => { print.numberTunes = Boolean(value); }),
    onIndexQrCodesChange: (value) => updatePresentation((print) => { print.indexQrCodes = Boolean(value); }),
    onHeaderTextChange: (value) => {
      session.mutate((document) => { document.print.headerText = String(value || ""); }, { reason: "header" });
    },
    onTitleChange: (value) => session.mutate((document) => { document.title = String(value || "Untitled Set List"); }, { reason: "title" }),
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
    onRefreshSources: () => {
      refreshFromLibrarySources().catch(logError);
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
  const toggle = () => controller.toggle();
  const openHeaderEditor = () => controller.openHeaderEditor();
  const closeHeaderEditor = () => controller.closeHeaderEditor();

  const insertItem = (item, index) => {
    session.mutate((document) => {
      document.items = insertSetListDocumentItem(document.items, item, index);
    }, { reason: "items" });
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

  async function syncSourceTuneAfterSave(tuneId, { previousTuneId = "" } = {}) {
    const currentTuneId = String(tuneId || "").trim();
    const priorTuneId = String(previousTuneId || "").trim();
    if (!currentTuneId || !getItems().length) return false;

    const replacement = await buildDocumentItem(currentTuneId);
    if (!replacement) return false;
    const replacementSource = replacement.tune && replacement.tune.source
      ? replacement.tune.source
      : {};
    const matchingIndexes = [];
    getItems().forEach((item, index) => {
      const source = item && item.tune && item.tune.source ? item.tune.source : {};
      const locator = String(source.locatorHint || "");
      const locatorMatches = locator === currentTuneId || (priorTuneId && locator === priorTuneId);
      const sourceMatches = Boolean(
        replacementSource.pathHint
        && replacementSource.xNumberHint
        && String(source.pathHint || "") === String(replacementSource.pathHint)
        && String(source.xNumberHint || "") === String(replacementSource.xNumberHint)
      );
      if (locatorMatches || sourceMatches) matchingIndexes.push(index);
    });
    if (!matchingIndexes.length) return false;

    session.mutate((document) => {
      for (const index of matchingIndexes) {
        const previous = document.items[index];
        document.items[index] = mergeSetListSnapshotAfterSourceSave(previous, replacement, {
          preserveTranspose: true,
        });
      }
    }, { reason: "source updates" });
    for (const index of matchingIndexes) {
      const item = getItems()[index];
      if (item) itemResolutions.set(item.id, "FOUND_EXACT");
    }
    showToast(
      matchingIndexes.length === 1
        ? "Updated the Set List item from its saved Library source."
        : `Updated ${matchingIndexes.length} Set List items from their saved Library source.`,
      2800,
    );
    if (getDocumentState().filePath) await saveSetList(false);
    return true;
  }

  async function refreshFromLibrarySources() {
    const items = getItems().slice();
    if (!items.length) {
      showToast("No tunes in Set List.", 2200);
      return { updated: 0, missing: 0 };
    }

    const updates = new Map();
    let missing = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      try {
        const resolution = await resolveItemSource(item);
        const status = String(resolution && resolution.status || "MISSING");
        itemResolutions.set(item.id, status);
        const trustedSourceMatch = status === "FOUND_STRONG" && resolution.matchedBy === "source";
        if ((status !== "FOUND_MODIFIED" && !trustedSourceMatch) || !resolution.candidate) {
          if (!["FOUND_EXACT", "FOUND_STRONG"].includes(status)) missing += 1;
          continue;
        }
        const replacement = await buildDocumentItem(String(resolution.candidate.tuneId || ""));
        const synchronized = mergeSetListSnapshotAfterSourceSave(item, replacement, {
          preserveTranspose: true,
        });
        if (!synchronized) continue;
        updates.set(index, synchronized);
        itemResolutions.set(item.id, "FOUND_EXACT");
      } catch {
        itemResolutions.set(item.id, "MISSING");
        missing += 1;
      }
    }

    if (updates.size) {
      session.mutate((document) => {
        for (const [index, item] of updates) document.items[index] = item;
      }, { reason: "source updates" });
    } else {
      render();
    }
    const updated = updates.size;
    if (updated) await saveSetList(false);
    const summary = updated
      ? `Updated ${updated} Set List ${updated === 1 ? "item" : "items"} from Library.`
      : "Set List sources are up to date.";
    showToast(missing ? `${summary} ${missing} unavailable.` : summary, 3200);
    return { updated, missing };
  }

  function clearActiveItem() {
    activeItemId = "";
    activePerformanceContext = null;
    onPerformanceViewStateChange(null);
    render();
  }

  function getActivePerformanceOverride() {
    return activePerformanceContext ? { ...activePerformanceContext } : null;
  }

  function isPerformanceViewActive() {
    if (!activePerformanceContext) return false;
    const activeTuneId = String(getActiveTuneId() || "");
    return Boolean(activeTuneId && activeTuneId === String(activePerformanceContext.sourceTuneId || ""));
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
    const suggestedName = `${getSuggestedBaseName()}.abc`;
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
    const document = getDocument();
    const print = document.print;
    const blocks = [];
    let current = [];
    const summary = [];
    const indexEntries = [];

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

      const pageBreaks = print.pageBreaks;
      const breakBefore = shouldInjectNewPageBeforeTune(raw, {
        mode: pageBreaks,
        idx: printableIndex,
        pageBreakBefore: item.export.pageBreakBefore,
      });
      if (breakBefore) flush();

      const printText = print.numberTunes
        ? numberSetListTuneTitle(raw, printableIndex + 1)
        : raw;
      const renumbered = ensureXNumberInAbc(printText, printableIndex + 1);
      const combinedHeader = composeSetListRenderHeader(item.headerText || "", getFileHeaderText());
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

      if (renderRes && renderRes.svg && renderRes.svg.trim()) {
        current.push(namespaceSetListSvgIds(renderRes.svg.trim(), `abcarus-set-list-${printableIndex + 1}`));
      }
      const sourceMarkup = await buildSourceLinkMarkup(renderRes && renderRes.blockText ? renderRes.blockText : renumbered);
      if (sourceMarkup) current.push(sourceMarkup);

      if (print.tuneIndex !== "none") {
        const source = collectPrintSources(raw)[0] || null;
        let incipitSvg = "";
        if (print.tuneIndex === "incipits") {
          const performanceView = buildSetListPerformanceView({
            sourceText: raw,
            headerText: item.headerText || "",
            transposeSemitones: item.transposeSemitones,
          });
          const incipitSource = performanceView && performanceView.ok ? performanceView.text : raw;
          const incipitAbc = buildSetListIncipitAbc(incipitSource);
          if (incipitAbc) {
            const incipitResult = await renderItemToSvg({
              abcText: incipitAbc,
              headerText: combinedHeader,
              tune: { ...tune, title: "" },
            });
            if (incipitResult && incipitResult.svg) {
              incipitSvg = namespaceSetListSvgIds(
                incipitResult.svg.trim(),
                `abcarus-set-list-index-${printableIndex + 1}`,
              );
            }
          }
        }
        let qrDataUrl = "";
        if (print.indexQrCodes && source && source.url) {
          try { qrDataUrl = await createQrDataUrl(source.url, { size: 80 }); } catch {}
        }
        const meterMatch = raw.match(/^\s*M:\s*(.*?)\s*$/mi);
        indexEntries.push({
          title: item.title || `Tune ${printableIndex + 1}`,
          meter: meterMatch ? String(meterMatch[1] || "").trim() : "",
          tempo: formatSetListIndexTempo(raw, item.tempoScale),
          practiceNote: item.notes || "",
          incipitSvg,
          sourceUrl: source ? source.url : "",
          qrDataUrl,
        });
      }

      if (pageBreaks === "perTune") flush();
      printableIndex += 1;
    }
    flush();

    if (!blocks.length) return { ok: false, error: "No SVG output produced." };

    const parts = [];
    if (print.titlePage) {
      parts.push(buildSetListCoverMarkup({
        title: document.title,
        itemCount: printableIndex,
        updatedAt: document.updatedAt,
      }));
    }
    if (print.tuneIndex !== "none") {
      parts.push(buildSetListIndexMarkup({
        title: document.title,
        entries: indexEntries,
        numberTunes: print.numberTunes,
      }));
    }
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
    const suggestedName = getSuggestedBaseName();
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
    if (controller) controller.commitPendingNoteEdit();
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
    activePerformanceContext = null;
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
    await publishCurrentSetList();
    if (legacyImported) {
      writeStorage(storageKey, null);
      legacyImported = false;
    }
    activeItemId = "";
    activePerformanceContext = null;
    itemResolutions.clear();
    render();
    return true;
  }

  async function restoreLastSetList() {
    if (legacyImported) return false;
    const synced = await listSyncedSetLists();
    if (synced && synced.ok && Array.isArray(synced.entries)) {
      for (const entry of synced.entries) {
        if (entry && entry.filePath) session.rememberRecentPath(entry.filePath);
      }
    }
    const paths = getDocumentState().recentPaths.slice();
    for (const path of paths) {
      const result = await session.open(path);
      if (result.ok) {
        await publishCurrentSetList();
        activeItemId = "";
        activePerformanceContext = null;
        itemResolutions.clear();
        render();
        return true;
      }
      session.forgetRecentPath(path);
    }
    return false;
  }

  async function reloadSyncedSetList(payload = {}) {
    const state = getDocumentState();
    if (!state.filePath || state.dirty) return false;
    const changedIds = Array.isArray(payload.ids)
      ? payload.ids.map((value) => String(value || ""))
      : [];
    if (changedIds.length && !changedIds.includes(String(state.document.id || ""))) {
      return false;
    }
    const previousActiveItemId = activeItemId;
    const result = await session.open(state.filePath);
    if (!result.ok) {
      logError(result.error || "Unable to reload synchronized Set List.");
      return false;
    }
    activeItemId = getItems().some((item) => String(item.id || "") === previousActiveItemId)
      ? previousActiveItemId
      : "";
    activePerformanceContext = null;
    itemResolutions.clear();
    render();
    showToast("Set List updated from Mobile.", 2400);
    return true;
  }

  function restorePanelVisibility() {
    if (readStorage(panelVisibilityStorageKey) !== true) return false;
    open();
    return true;
  }

  async function saveSetList(forceSaveAs = false) {
    let path = forceSaveAs ? "" : getDocumentState().filePath;
    if (!path) {
      path = await showSaveSetListDialog(getDocument().title, getDefaultSaveDir());
      if (!path) return false;
    }
    let result = await session.save(path);
    if (!result.ok && result.conflict) {
      const choice = await resolveSaveConflict(path);
      if (choice === "save_as") return saveSetList(true);
      if (choice === "merge") {
        const merged = await session.mergeExternal();
        if (!merged.ok) {
          logError(merged.error || "Unable to merge changed Set List.");
          return false;
        }
        result = await session.save(path);
      } else if (choice === "overwrite") {
        result = await session.save(path, { overwriteExternal: true });
      } else {
        return false;
      }
    }
    if (!result.ok) {
      logError(result.error || "Unable to save Set List.");
      return false;
    }
    await publishCurrentSetList();
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
      await publishCurrentSetList();
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
    activePerformanceContext = null;
    itemResolutions.clear();
    open();
    const added = await addTuneById(tuneId, options);
    if (added) showToast(`Added to ${getDocument().title}. Save the Set List to keep this change.`, 3200);
    return added;
  }

  return {
    activateItemAtIndex,
    addTuneById,
    addTuneWithTargetChoice,
    adjustActivePerformanceTranspose,
    buildExportAbc,
    clearActiveItem,
    close,
    closeHeaderEditor,
    exportAbc,
    getActivePerformanceOverride,
    getState,
    isPerformanceViewActive,
    newSetList,
    openSetList,
    open,
    openHeaderEditor,
    prepareToLeave,
    render,
    renderSvgMarkupForPrint,
    refreshFromLibrarySources,
    reloadSyncedSetList,
    restoreLastSetList,
    restorePanelVisibility,
    runPrintAction,
    saveSetList,
    syncSourceTuneAfterSave,
    toggle,
    updatePerformance,
    updatePracticeNote,
  };
}

export {
  createSetListFeature,
};
