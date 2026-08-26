import { createAppendTuneToActiveFileAction } from "./append_tune_action.js";
import { createLibraryActions } from "./actions.js";
import { createCatalogCategoryMergeController } from "./catalog_category_merge_controller.js";
import { createLibraryContextMenu } from "./context_menu.js";
import { buildGroupEntries as buildGroupEntriesCore } from "./group_entries.js";
import { createLibraryShellController } from "./library_shell_controller.js";
import { createMoveTuneModalController } from "./move_tune_modal_controller.js";
import { createRenameFileController } from "./rename_file_controller.js";
import { getEntryTuneCount } from "./sorting_filtering.js";
import { createLibraryViewStore } from "./store.js";
import { createLibraryTreeView } from "./tree_view.js";
import {
  createLibraryUiStateController,
  normalizeTitleKey as normalizeLibraryTitleKey,
} from "./ui_state_controller.js";
import { createXIssuesModalController } from "./x_issues_modal_controller.js";

function createLibraryUiDomain({
  api = null,
  documentRef = typeof document !== "undefined" ? document : null,
  windowRef = typeof window !== "undefined" ? window : null,
  navigatorRef = typeof navigator !== "undefined" ? navigator : null,
  elements = {},
  state = {},
  actions = {},
  utils = {},
  constants = {},
  hooks = {},
} = {}) {
  const {
    safeBasename = (value) => String(value || ""),
    pathsEqual = (a, b) => String(a || "") === String(b || ""),
    normalizeTitleKey = normalizeLibraryTitleKey,
  } = utils;
  const {
    main = null,
    libraryTree = null,
    libraryRoot = null,
    tuneSelect = null,
    librarySearch = null,
    groupBy = null,
    sortBy = null,
    sortTunesBy = null,
    moveTuneModal = null,
    moveTuneClose = null,
    moveTuneCancel = null,
    moveTuneTarget = null,
    moveTuneApply = null,
    xIssuesModal = null,
    xIssuesInfo = null,
    xIssuesClose = null,
    xIssuesCopy = null,
    xIssuesJump = null,
    xIssuesAutoFix = null,
  } = elements;

  let shellController = null;
  let uiStateController = null;
  let treeView = null;
  let libraryFilter = null;
  let libraryFilterLabel = "";
  let libraryTextFilter = "";

  const viewStore = createLibraryViewStore({
    getIndex: () => (typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null),
    safeBasename,
  });

  shellController = createLibraryShellController({
    api,
    documentRef,
    windowRef,
    elements: { main },
    state: {
      getLibraryVisible: () => (typeof state.getLibraryVisible === "function" ? state.getLibraryVisible() : false),
      setLibraryVisibleState: (value) => {
        if (typeof state.setLibraryVisibleState === "function") state.setLibraryVisibleState(Boolean(value));
      },
      isLibraryDisabled: () => (typeof state.isLibraryDisabled === "function" ? state.isLibraryDisabled() : false),
      getLastSidebarWidth: () => uiStateController ? uiStateController.getLastSidebarWidth() : 280,
      getLibraryIndex: () => (typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null),
      getSetListVisible: () => (typeof state.getSetListVisible === "function" ? state.getSetListVisible() : false),
      getSetListPaneWidth: () => (typeof state.getSetListPaneWidth === "function" ? state.getSetListPaneWidth() : 300),
    },
    actions: {
      ensureSafeToAbandonCurrentDoc: actions.ensureSafeToAbandonCurrentDoc,
      loadLibraryFromFolder: actions.loadLibraryFromFolder,
      renderBufferStatus: actions.renderBufferStatus,
      resetRightPaneSplit: actions.resetRightPaneSplit,
      scheduleSaveLibraryPrefs: (patch) => uiStateController && uiStateController.scheduleSaveLibraryPrefs(patch),
      setPaneSizes: actions.setPaneSizes,
      setStatus: actions.setStatus,
      showOpenFolderDialog: actions.showOpenFolderDialog,
      showToast: actions.showToast,
    },
    constants,
  });

  function setLibraryTextFilter(value) {
    libraryTextFilter = String(value || "").trim();
    if (librarySearch) librarySearch.value = libraryTextFilter;
  }

  function getLibraryTextFilter() {
    return libraryTextFilter;
  }

  function getLibraryFilterLabel() {
    return libraryFilterLabel;
  }

  function getVisibleLibraryFiles() {
    if (libraryFilter) return libraryFilter;
    const libraryIndex = typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null;
    return libraryIndex ? (libraryIndex.files || []) : [];
  }

  function formatPathTail(filePath, segments = 3) {
    const raw = String(filePath || "").trim();
    if (!raw) return "";
    const normalized = raw.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    if (!parts.length) return normalized;
    const tail = parts.slice(Math.max(0, parts.length - Math.max(1, segments))).join("/");
    return parts.length > segments ? `…/${tail}` : tail;
  }

  function updateLibraryRootUI() {
    if (!libraryRoot) return;
    const libraryIndex = typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null;
    const root = libraryIndex && libraryIndex.root ? String(libraryIndex.root) : "";
    const tail = formatPathTail(root, 3);
    libraryRoot.textContent = tail ? `Library: ${tail}` : "Library: (none)";
    libraryRoot.title = root;
  }

  function buildGroupEntries(files, mode) {
    return buildGroupEntriesCore(files, mode, { normalizeTitleKey });
  }

  function syncCatalogFacetGroupOptions() {
    if (!groupBy || !documentRef) return;
    const index = typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null;
    const facets = new Set();
    for (const file of index && Array.isArray(index.files) ? index.files : []) {
      for (const tune of file.tunes || []) {
        for (const facet of Object.keys((tune && tune.catalogFacets) || {})) facets.add(facet);
      }
    }
    const existing = new Set(Array.from(groupBy.options || []).map((option) => option.value));
    for (const option of Array.from(groupBy.querySelectorAll('option[data-catalog-facet="true"]'))) {
      if (!facets.has(option.value)) option.remove();
    }
    for (const facet of Array.from(facets).sort((a, b) => a.localeCompare(b))) {
      if (existing.has(facet)) continue;
      const option = documentRef.createElement("option");
      option.value = facet;
      option.textContent = `G (${facet})`;
      option.dataset.catalogFacet = "true";
      groupBy.appendChild(option);
    }
    groupBy.value = uiStateController ? uiStateController.getGroupMode() : groupBy.value;
  }

  function scheduleRenderLibraryTree(files = null) {
    syncCatalogFacetGroupOptions();
    if (treeView) treeView.schedule(files);
  }

  function renderLibraryTree(files = null) {
    syncCatalogFacetGroupOptions();
    if (treeView) treeView.render(files);
  }

  function updateModalRows() {
    if (!documentRef) return;
    const rows = viewStore.getModalRows();
    documentRef.dispatchEvent(new CustomEvent("library-modal:update-rows", { detail: { rows } }));
  }

  function updateModalRowsIfOpen() {
    if (!documentRef || !documentRef.body || !documentRef.body.classList.contains("library-list-open")) return;
    updateModalRows();
  }

  uiStateController = createLibraryUiStateController({
    windowRef,
    api,
    documentRef,
    safeBasename,
    pathsEqual,
    getLibraryIndex: () => (typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null),
    getLibraryFilter: () => libraryFilter,
    getLibraryTextFilter,
    setLibraryTextFilter,
    getActiveFilePath: () => (typeof state.getActiveFilePath === "function" ? state.getActiveFilePath() : ""),
    setActiveFilePath: (filePath) => {
      if (typeof state.setActiveFilePath === "function") state.setActiveFilePath(filePath || null);
    },
    getActiveTuneId: () => (typeof state.getActiveTuneId === "function" ? state.getActiveTuneId() : ""),
    getActiveTuneMeta: () => (typeof state.getActiveTuneMeta === "function" ? state.getActiveTuneMeta() : null),
    setLibraryVisible: (visible, options) => shellController.setLibraryVisible(visible, options),
    scheduleRenderLibraryTree,
    renderLibraryTree,
    updateLibraryStatus: actions.updateLibraryStatus,
    updateLibraryRootUI,
    libraryViewStore: viewStore,
    buildGroupEntries,
    selectTune: actions.selectTune,
    refreshLibraryFile: actions.refreshLibraryFile,
    hasFullLibraryIndex: actions.hasFullLibraryIndex,
    ensureFullLibraryIndex: actions.ensureFullLibraryIndex,
    onModalRowsChanged: updateModalRows,
    searchDebounceMs: 180,
  });

  const libraryActions = createLibraryActions({
    openTuneFromSelection: actions.openTuneFromLibrarySelection,
  });

  const renameFileController = createRenameFileController({
    elements: {
      libraryTree,
    },
    state: {
      getActiveEditFilePath: actions.getActiveEditFilePath,
      hasGlobalUnsavedChanges: actions.hasGlobalUnsavedChanges,
      hasUnsavedChangesForFile: actions.hasUnsavedChangesForFile,
    },
    actions: {
      renderLibraryTree,
      requireCleanForFileOp: actions.requireCleanForFileOp,
      renameLibraryFile: actions.renameLibraryFile,
      showSaveError: actions.showSaveError,
      showToast: actions.showToast,
      withFileLocks: actions.withFileLocks,
    },
    io: {
      fileExists: actions.fileExists,
      renameFile: actions.renameFile,
    },
    utils: {
      pathsEqual,
      safeDirname: actions.safeDirname,
    },
  });

  function moveTuneToFile(tuneId, targetPath) {
    if (typeof actions.moveTuneToFile === "function") return actions.moveTuneToFile(tuneId, targetPath);
    return Promise.resolve();
  }

  const moveTuneModalController = createMoveTuneModalController({
    modal: moveTuneModal,
    closeButton: moveTuneClose,
    cancelButton: moveTuneCancel,
    targetSelect: moveTuneTarget,
    applyButton: moveTuneApply,
    safeBasename,
    enableDraggableModal: actions.enableDraggableModal,
    showError: actions.showSaveError,
    onMove: moveTuneToFile,
  });

  function openMoveTuneModal(tuneId) {
    const libraryIndex = typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null;
    moveTuneModalController.open(tuneId, {
      files: libraryIndex && Array.isArray(libraryIndex.files) ? libraryIndex.files : [],
      activeFilePath: typeof state.getActiveFilePath === "function" ? state.getActiveFilePath() : "",
    });
  }

  const xIssuesModalController = createXIssuesModalController({
    modal: xIssuesModal,
    infoElement: xIssuesInfo,
    closeButton: xIssuesClose,
    copyButton: xIssuesCopy,
    jumpButton: xIssuesJump,
    autoFixButton: xIssuesAutoFix,
    safeBasename,
    enableDraggableModal: actions.enableDraggableModal,
    getFileEntry: (filePath) => {
      const libraryIndex = typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null;
      return libraryIndex && Array.isArray(libraryIndex.files)
        ? libraryIndex.files.find((f) => pathsEqual(f.path, filePath))
        : null;
    },
    refreshFile: actions.refreshLibraryFile,
    loadFile: actions.requestLoadLibraryFile,
    selectTune: actions.selectTune,
    autoFixFile: actions.renumberXInActiveFile,
    showToast: actions.showToast,
  });

  const appendTuneToActiveFileAction = createAppendTuneToActiveFileAction({
    api,
    getActiveTuneMeta: () => (typeof state.getActiveTuneMeta === "function" ? state.getActiveTuneMeta() : null),
    getCurrentDocDirty: state.getCurrentDocDirty,
    getHeaderDirty: state.getHeaderDirty,
    getRawMode: state.isRawMode,
    findTuneById: actions.findTuneById,
    getTuneText: actions.getTuneText,
    pathsEqual,
    withFileLock: actions.withFileLock,
    readFile: actions.readFile,
    refreshLibraryFile: actions.refreshLibraryFile,
    setActiveFilePath: (filePath) => {
      if (typeof state.setActiveFilePath === "function") state.setActiveFilePath(filePath || null);
    },
    selectTune: actions.selectTune,
    getNextXNumber: actions.getNextXNumber,
    ensureXNumberInAbc: actions.ensureXNumberInAbc,
    confirmAppendToFile: actions.confirmAppendToFile,
    requireCleanForFileOp: actions.requireCleanForFileOp,
    writeFile: actions.writeFile,
    showToast: actions.showToast,
  });

  const categoryMergeController = createCatalogCategoryMergeController({
    documentRef,
    state: {
      getLibraryIndex: () => (typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null),
      getActiveTuneMeta: () => (typeof state.getActiveTuneMeta === "function" ? state.getActiveTuneMeta() : null),
    },
    actions: {
      enableDraggableModal: actions.enableDraggableModal,
      ensureFullLibraryIndex: actions.ensureFullLibraryIndex,
      readFile: actions.readFile,
      refreshLibraryFile: actions.refreshLibraryFile,
      renderLibraryTree,
      requireCleanForFileOp: actions.requireCleanForFileOp,
      selectTune: actions.selectTune,
      setStatus: actions.setStatus,
      showSaveError: actions.showSaveError,
      showToast: actions.showToast,
      withFileLocks: actions.withFileLocks,
      writeFile: actions.writeFile,
    },
  });

  treeView = createLibraryTreeView({
    documentRef,
    windowRef,
    treeElement: libraryTree,
    collapsedFiles: uiStateController.getCollapsedFiles(),
    collapsedGroups: uiStateController.getCollapsedGroups(),
    getVisibleLibraryFiles,
    getLibraryTextFilter,
    applyLibraryTextFilter: (files, query) => uiStateController.applyLibraryTextFilter(files, query),
    sortLibraryFiles: (files) => uiStateController.sortLibraryFiles(files),
    buildGroupEntries: (files) => buildGroupEntries(files, uiStateController.getGroupMode()),
    sortGroupEntries: (entries) => uiStateController.sortGroupEntries(entries),
    sortTunes: (tunes) => uiStateController.sortTunes(tunes, uiStateController.getTuneSortMode()),
    getEntryTuneCount,
    getRenamingFilePath: () => renameFileController.getRenamingFilePath(),
    setRenamingFilePath: (value) => renameFileController.setRenamingFilePath(value),
    getActiveFilePath: () => (typeof state.getActiveFilePath === "function" ? state.getActiveFilePath() : ""),
    setActiveFilePath: (value) => {
      if (typeof state.setActiveFilePath === "function") state.setActiveFilePath(value || null);
    },
    getActiveEditorFilePath: actions.getActiveEditorFilePath,
    getActiveTuneId: () => (typeof state.getActiveTuneId === "function" ? state.getActiveTuneId() : ""),
    getActiveTuneUid: () => (typeof state.getActiveTuneUid === "function" ? state.getActiveTuneUid() : ""),
    isPayloadMode: state.isPayloadMode,
    isRawMode: state.isRawMode,
    pathsEqual,
    commitRenameFile: (oldPath, inputName) => renameFileController.commitRenameFile(oldPath, inputName),
    requestLoadLibraryFile: actions.requestLoadLibraryFile,
    moveTuneToFile,
    mergeCatalogCategory: (source, target) => categoryMergeController.open(source, target),
    showContextMenuAt: actions.showContextMenuAt,
    scheduleSaveLibraryUiState: () => uiStateController.scheduleSaveLibraryUiState(),
    updateFileHeaderPanel: actions.updateFileHeaderPanel,
    showHoverStatus: actions.showHoverStatus,
    restoreHoverStatus: actions.restoreHoverStatus,
    pinHoverStatus: actions.pinHoverStatus,
    openTuneFromLibrarySelection: actions.openTuneFromLibrarySelection,
    showToast: actions.showToast,
  });

  const contextMenu = createLibraryContextMenu({
    documentRef,
    windowRef,
    navigatorRef,
    getLibraryIndex: () => (typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null),
    getLibraryTextFilter,
    setLibraryTextFilter,
    getActiveTuneId: () => (typeof state.getActiveTuneId === "function" ? state.getActiveTuneId() : ""),
    getActiveTuneUid: () => (typeof state.getActiveTuneUid === "function" ? state.getActiveTuneUid() : ""),
    getActiveTuneMeta: () => (typeof state.getActiveTuneMeta === "function" ? state.getActiveTuneMeta() : null),
    getCurrentDocDirty: state.getCurrentDocDirty,
    getHeaderDirty: state.getHeaderDirty,
    getIsNewTuneDraft: () => (typeof state.getIsNewTuneDraft === "function" ? state.getIsNewTuneDraft() : false),
    getRawMode: state.isRawMode,
    getClipboardTune: actions.getClipboardTune,
    getEditorView: actions.getEditorView,
    getWindowApi: () => api,
    pathsEqual,
    safeBasename,
    findTuneById: actions.findTuneById,
    hasUnsavedChangesForFile: actions.hasUnsavedChangesForFile,
    hasDiskConflictPath: actions.hasDiskConflictPath,
    confirmReloadFromDisk: actions.confirmReloadFromDisk,
    discardAndReloadFileFromDisk: actions.discardAndReloadFileFromDisk,
    requestLoadLibraryFile: actions.requestLoadLibraryFile,
    deleteTuneById: actions.deleteTuneById,
    copyTuneById: actions.copyTuneById,
    duplicateTuneById: actions.duplicateTuneById,
    pasteClipboardToFile: actions.pasteClipboardToFile,
    promptFindInLibrary: () => {
      shellController.setLibraryVisible(true);
      if (librarySearch) {
        librarySearch.focus();
        try { librarySearch.select(); } catch {}
      }
    },
    renderLibraryTree,
    updateLibraryStatus: actions.updateLibraryStatus,
    refreshLibraryIndex: actions.refreshLibraryIndex,
    beginRenameFile: (filePath) => renameFileController.beginRenameFile(filePath),
    renameCatalogCategory: (target) => categoryMergeController.open(target),
    openXIssues: (filePath) => xIssuesModalController.open(filePath),
    renumberXInActiveFile: actions.renumberXInActiveFile,
    openMoveTuneModal,
    addTuneToSetList: actions.addTuneToSetList,
    copyFileTuneList: actions.copyFileTuneList,
    appendTuneToActiveFile: (tuneId) => appendTuneToActiveFileAction.run(tuneId),
    buildTemplatesPreviewContextMenuItems: actions.buildTemplatesPreviewContextMenuItems,
    handleTemplatesContextMenuAction: actions.handleTemplatesContextMenuAction,
    showToast: actions.showToast,
    showSaveError: actions.showSaveError,
  });

  function wireControls() {
    if (groupBy) {
      groupBy.addEventListener("change", () => {
        uiStateController.handleGroupModeChange(groupBy.value || "file");
        uiStateController.syncControls({ groupBy, sortBy, sortTunesBy });
      });
    }
    if (sortBy) {
      if (sortBy.value) {
        const normalized = uiStateController.setSortMode(sortBy.value);
        sortBy.value = normalized;
      }
      sortBy.addEventListener("change", () => {
        uiStateController.handleSortModeChange(sortBy.value || "");
        uiStateController.syncControls({ sortBy });
      });
    }
    if (sortTunesBy) {
      if (sortTunesBy.value) {
        const normalized = uiStateController.setTuneSortMode(sortTunesBy.value);
        sortTunesBy.value = normalized;
      }
      sortTunesBy.addEventListener("change", () => {
        uiStateController.handleTuneSortModeChange(sortTunesBy.value || "");
        uiStateController.syncControls({ sortTunesBy });
      });
    }
  }

  function resetSearch({ keepFilter = false } = {}) {
    setLibraryTextFilter("");
    if (typeof actions.scheduleSaveLibraryPrefs === "function") actions.scheduleSaveLibraryPrefs({ libraryFilterText: "" });
    else uiStateController.scheduleSaveLibraryPrefs({ libraryFilterText: "" });
    uiStateController.clearLibrarySearchTimer();
    if (!keepFilter && libraryFilterLabel) {
      clearLibraryFilter();
    } else {
      renderLibraryTree();
      if (typeof actions.updateLibraryStatus === "function") actions.updateLibraryStatus();
    }
  }

  function wireSearch({ clearButton = null } = {}) {
    if (librarySearch) {
      librarySearch.addEventListener("input", () => {
        uiStateController.scheduleLibrarySearch(librarySearch.value || "");
        uiStateController.scheduleSaveLibraryPrefs({ libraryFilterText: librarySearch.value || "" });
      });
      librarySearch.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        resetSearch({ keepFilter: false });
        e.preventDefault();
      });
    }
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        resetSearch({ keepFilter: false });
      });
    }
  }

  function invalidateView() {
    viewStore.invalidate();
    scheduleRenderLibraryTree();
    if (documentRef && documentRef.body && documentRef.body.classList.contains("library-list-open")) {
      updateModalRows();
    }
  }

  function applyLibraryPrefsFromSettings(settings) {
    uiStateController.applyLibraryPrefsFromSettings(settings);
    uiStateController.syncControls({ groupBy, sortBy, sortTunesBy });
  }

  function clearLibraryFilter() {
    libraryFilter = null;
    libraryFilterLabel = "";
    scheduleRenderLibraryTree();
    if (typeof actions.updateLibraryStatus === "function") actions.updateLibraryStatus();
  }

  let catalogYieldedByThisOpen = false;
  let catalogTreeHintToastShown = false;

  function openCatalogFromCurrentIndex() {
    if (typeof state.isLibraryDisabled === "function" && state.isLibraryDisabled()) {
      if (typeof actions.showToast === "function") actions.showToast("Library is disabled while editing ChordPro.", 2400);
      return false;
    }
    const libraryIndex = typeof state.getLibraryIndex === "function" ? state.getLibraryIndex() : null;
    if (!libraryIndex || !libraryIndex.root || !Array.isArray(libraryIndex.files) || !libraryIndex.files.length) {
      if (typeof actions.setStatus === "function") actions.setStatus("Load a library folder first.");
      return false;
    }
    if (!windowRef || typeof windowRef.openLibraryModal !== "function") return false;

    const rows = viewStore.getModalRows();
    if (typeof actions.hasFullLibraryIndex === "function" && !actions.hasFullLibraryIndex()) {
      if (typeof actions.ensureFullLibraryIndex === "function") {
        actions.ensureFullLibraryIndex({ reason: "library list" }).catch(() => {});
      }
    }

    const isVisible = typeof state.getLibraryVisible === "function" ? state.getLibraryVisible() : false;
    if (!isVisible && !catalogTreeHintToastShown) {
      catalogTreeHintToastShown = true;
      if (typeof actions.showToast === "function") {
        actions.showToast("Tip: Library Tree is hidden. Click Library or press Ctrl+L.", 4200);
      }
    }

    catalogYieldedByThisOpen = false;
    if (isVisible && documentRef && documentRef.body) {
      documentRef.body.classList.add("library-list-open");
      catalogYieldedByThisOpen = true;
    }

    windowRef.openLibraryModal(rows);
    return true;
  }

  function wireCatalogBridge() {
    if (!documentRef) return;
    documentRef.addEventListener("library-modal:closed", () => {
      if (!catalogYieldedByThisOpen) return;
      if (documentRef.body) documentRef.body.classList.remove("library-list-open");
      catalogYieldedByThisOpen = false;
    });

    documentRef.addEventListener("set-list:add", (ev) => {
      try {
        const row = ev && ev.detail && ev.detail.row ? ev.detail.row : null;
        if (!row) return;
        const tuneId = row && row.tuneId ? String(row.tuneId) : "";
        if (!tuneId || typeof actions.addTuneToSetList !== "function") return;
        actions.addTuneToSetList(tuneId, { fallbackTitle: row.title, fallbackComposer: row.composer }).catch((e) => {
          if (typeof actions.showToast === "function") actions.showToast(e && e.message ? e.message : String(e), 5000);
        });
      } catch {}
    });
  }

  return {
    actions: libraryActions,
    applyLibraryPrefsFromSettings,
    applyLibraryUiStateFromSettings: (settings) => uiStateController.applyLibraryUiStateFromSettings(settings),
    clearLibraryFilter,
    contextMenu,
    beginRenameFile: (filePath) => renameFileController.beginRenameFile(filePath),
    commitRenameFile: (oldPath, inputName) => renameFileController.commitRenameFile(oldPath, inputName),
    flushLibraryPrefsSave: () => uiStateController.flushLibraryPrefsSave(),
    expandInitialCollapsedState: () => uiStateController.expandInitialCollapsedState(),
    getLibraryFilterLabel,
    getLibraryTextFilter,
    invalidateView,
    openCatalogFromCurrentIndex,
    renderLibraryTree,
    restoreLibraryTuneSelection: (selection) => uiStateController.restoreLibraryTuneSelection(selection),
    scheduleSaveLibraryPrefs: (patch) => uiStateController.scheduleSaveLibraryPrefs(patch),
    scheduleSaveLibraryUiState: () => uiStateController.scheduleSaveLibraryUiState(),
    setPrefsWriteSuppressed: (value) => uiStateController.setPrefsWriteSuppressed(value),
    shellController,
    treeView,
    uiStateController,
    updateModalRowsIfOpen,
    updateLibraryRootUI,
    wireCatalogBridge,
    wireControls,
    wireSearch,
  };
}

export {
  createLibraryUiDomain,
};
