import {
  applyLibraryTextFilter as applyLibraryTextFilterCore,
  getDefaultGroupSortMode,
  getDefaultTuneSortMode,
  normalizeGroupSortMode,
  normalizeTuneSortMode,
  sortGroupEntries as sortGroupEntriesCore,
  sortLibraryFiles as sortLibraryFilesCore,
  sortTunes as sortTunesCore,
} from "./sorting_filtering.js";
import { GROUP_LABELS } from "./group_entries.js";

function isValidGroupMode(value) {
  return Boolean(GROUP_LABELS[value] || /^[a-z][a-z0-9_-]*$/.test(String(value || "")));
}

function normalizeTitleKey(raw, maxLen = 25, strict = false) {
  const input = String(raw || "");
  if (!input.trim()) return "";
  if (strict) {
    const cleaned = input.replace(/\s+/g, " ").trim();
    if (maxLen > 0 && cleaned.length > maxLen) return cleaned.slice(0, maxLen);
    return cleaned;
  }
  let normalized = "";
  try {
    normalized = input.normalize("NFKD");
  } catch {
    normalized = input;
  }
  try {
    normalized = normalized.replace(/\p{M}+/gu, "");
  } catch {
    normalized = normalized.replace(/[\u0300-\u036f]+/g, "");
  }
  normalized = normalized.toLowerCase();
  normalized = normalized
    .replace(/[’‘ʻʼ´`]/g, "'")
    .replace(/[‐-‒–—―]/g, "-")
    .replace(/[。．｡․·•∙⋅]/g, ".")
    .replace(/ı/g, "i");
  try {
    normalized = normalized.replace(/[^0-9a-z\u00c0-\u024f\u0370-\u03ff\u1f00-\u1fff\u0400-\u04ff\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\u10a0-\u10ff\u2d00-\u2d2f\uFB50-\uFDFF\uFE70-\uFEFF]+/giu, " ");
  } catch {
    normalized = normalized.replace(/[^0-9a-z]+/gi, " ");
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (maxLen > 0 && normalized.length > maxLen) return normalized.slice(0, maxLen);
  return normalized;
}

function createLibraryUiStateController({
  windowRef = typeof window !== "undefined" ? window : null,
  api = null,
  documentRef = typeof document !== "undefined" ? document : null,
  safeBasename,
  pathsEqual,
  getLibraryIndex,
  getLibraryFilter,
  setLibraryTextFilter,
  getLibraryTextFilter,
  getActiveFilePath,
  setActiveFilePath,
  getActiveTuneId,
  getActiveTuneMeta,
  setLibraryVisible,
  scheduleRenderLibraryTree,
  renderLibraryTree,
  updateLibraryStatus,
  updateLibraryRootUI,
  libraryViewStore,
  buildGroupEntries,
  selectTune,
  refreshLibraryFile,
  hasFullLibraryIndex,
  ensureFullLibraryIndex,
  onModalRowsChanged,
  searchDebounceMs = 220,
  prefsSaveDebounceMs = 400,
  uiStateDebounceMs = 300,
} = {}) {
  let lastSidebarWidth = 280;
  const collapsedFiles = new Set();
  const collapsedGroups = new Set();
  let groupMode = "file";
  let sortMode = "update_desc";
  let tuneSortMode = "x_asc";
  const groupSortPrefs = new Map();
  const groupTuneSortPrefs = new Map();
  let librarySearchTimer = null;
  let pendingLibrarySearch = "";
  let suppressLibraryPrefsWrite = true;
  let pendingLibraryPrefsPatch = null;
  let libraryPrefsSaveTimer = null;
  let lastAppliedLibraryPrefsSig = "";
  let libraryUiStateTimer = null;
  let libraryUiStateDirty = false;
  let libraryTitleKeyLength = 25;
  let libraryTitleKeyStrict = false;

  function getIndex() {
    return typeof getLibraryIndex === "function" ? getLibraryIndex() : null;
  }

  function getRootKey() {
    const libraryIndex = getIndex();
    if (!libraryIndex || !libraryIndex.root) return null;
    return String(libraryIndex.root || "") || null;
  }

  function isPathWithinRoot(filePath, rootPath) {
    const file = String(filePath || "");
    const root = String(rootPath || "");
    if (!file || !root) return false;
    if (pathsEqual(file, root)) return true;
    const prefix = root.endsWith("/") ? root : `${root}/`;
    return file.startsWith(prefix);
  }

  function setSortMode(nextMode) {
    sortMode = normalizeGroupSortMode(nextMode) || getDefaultGroupSortMode(groupMode);
    return sortMode;
  }

  function setTuneSortMode(nextMode) {
    tuneSortMode = normalizeTuneSortMode(nextMode) || getDefaultTuneSortMode(groupMode);
    return tuneSortMode;
  }

  function normalizeTitleKeyForPrefs(raw, maxLen = libraryTitleKeyLength, strict = libraryTitleKeyStrict) {
    return normalizeTitleKey(raw, maxLen, strict);
  }

  function sortTunes(list, mode) {
    return sortTunesCore(list, mode, { groupMode, safeBasename });
  }

  function sortLibraryFiles(files) {
    return sortLibraryFilesCore(files, {
      groupMode,
      sortMode,
      tuneSortMode,
      safeBasename,
      activeFilePath: typeof getActiveFilePath === "function" ? getActiveFilePath() : "",
      pathsEqual,
    });
  }

  function sortGroupEntries(entries) {
    return sortGroupEntriesCore(entries, {
      groupMode,
      sortMode,
      activeFilePath: typeof getActiveFilePath === "function" ? getActiveFilePath() : "",
      pathsEqual,
    });
  }

  function applyLibraryTextFilter(files, query) {
    return applyLibraryTextFilterCore(files, query, {
      normalizeTitleKey: normalizeTitleKeyForPrefs,
      titleKeyStrict: libraryTitleKeyStrict,
    });
  }

  function getVisibleLibraryFiles() {
    const libraryFilter = typeof getLibraryFilter === "function" ? getLibraryFilter() : null;
    const libraryIndex = getIndex();
    const files = libraryFilter || (libraryIndex && libraryIndex.files) || [];
    const filtered = applyLibraryTextFilter(files, typeof getLibraryTextFilter === "function" ? getLibraryTextFilter() : "");
    return sortLibraryFiles(filtered);
  }

  function scheduleSaveLibraryPrefs(patch) {
    if (suppressLibraryPrefsWrite) return;
    if (!patch || typeof patch !== "object") return;
    if (!api || typeof api.updateSettings !== "function") return;

    pendingLibraryPrefsPatch = { ...(pendingLibraryPrefsPatch || {}), ...patch };
    if (libraryPrefsSaveTimer) clearTimeout(libraryPrefsSaveTimer);
    libraryPrefsSaveTimer = setTimeout(async () => {
      const nextPatch = pendingLibraryPrefsPatch;
      pendingLibraryPrefsPatch = null;
      libraryPrefsSaveTimer = null;
      if (!nextPatch) return;
      try {
        await api.updateSettings(nextPatch);
      } catch {}
    }, prefsSaveDebounceMs);
  }

  function computeLibraryUiStateSnapshot() {
    const libraryIndex = getIndex();
    if (!libraryIndex || !libraryIndex.root) return null;
    const rootKey = getRootKey();
    if (!rootKey) return null;

    const files = Array.isArray(libraryIndex.files) ? libraryIndex.files : [];
    const expandedFiles = [];
    for (const file of files) {
      if (!file || !file.path) continue;
      if (!collapsedFiles.has(file.path)) expandedFiles.push(file.path);
    }

    const expandedGroupsByMode = {};
    if (groupMode !== "file" && files.length) {
      const groups = buildGroupEntries(files, groupMode);
      const expandedGroups = [];
      for (const group of groups) {
        if (!group || !group.id) continue;
        if (!collapsedGroups.has(group.id)) expandedGroups.push(group.id);
      }
      expandedGroupsByMode[groupMode] = expandedGroups;
    }

    const activeFilePath = typeof getActiveFilePath === "function" ? getActiveFilePath() : "";
    const activeTuneId = typeof getActiveTuneId === "function" ? getActiveTuneId() : "";
    const activeTuneMeta = typeof getActiveTuneMeta === "function" ? getActiveTuneMeta() : null;
    const active = (activeFilePath && isPathWithinRoot(activeFilePath, libraryIndex.root)) ? activeFilePath : null;
    const activeTune = (activeTuneMeta && activeTuneMeta.path && isPathWithinRoot(activeTuneMeta.path, libraryIndex.root))
      ? {
        tuneId: activeTuneId || null,
        filePath: activeTuneMeta.path || null,
        xNumber: activeTuneMeta.xNumber != null ? String(activeTuneMeta.xNumber) : "",
        title: activeTuneMeta.title != null ? String(activeTuneMeta.title) : "",
        startOffset: Number.isFinite(Number(activeTuneMeta.startOffset)) ? Number(activeTuneMeta.startOffset) : null,
      }
      : {
        tuneId: activeTuneId || null,
        filePath: (active && isPathWithinRoot(active, libraryIndex.root)) ? active : null,
        xNumber: "",
        title: "",
        startOffset: null,
      };
    return {
      rootKey,
      state: {
        expandedFiles,
        expandedGroupsByMode,
        activeFilePath: active,
        activeTune,
      },
    };
  }

  function scheduleSaveLibraryUiState() {
    const libraryIndex = getIndex();
    if (suppressLibraryPrefsWrite) return;
    if (!libraryIndex || !libraryIndex.root) return;
    if (!api || typeof api.updateSettings !== "function") return;

    libraryUiStateDirty = true;
    if (libraryUiStateTimer) clearTimeout(libraryUiStateTimer);
    libraryUiStateTimer = setTimeout(() => {
      libraryUiStateTimer = null;
      if (!libraryUiStateDirty) return;
      libraryUiStateDirty = false;
      const snap = computeLibraryUiStateSnapshot();
      if (!snap) return;
      scheduleSaveLibraryPrefs({
        libraryUiStateByRoot: {
          [snap.rootKey]: snap.state,
        },
      });
    }, uiStateDebounceMs);
  }

  function applyLibraryUiStateFromSettings(settings) {
    const libraryIndex = getIndex();
    if (!settings || !libraryIndex || !libraryIndex.root) return false;
    const rootKey = getRootKey();
    if (!rootKey) return false;
    const byRoot = settings.libraryUiStateByRoot && typeof settings.libraryUiStateByRoot === "object"
      ? settings.libraryUiStateByRoot
      : null;
    const entry = byRoot && byRoot[rootKey] && typeof byRoot[rootKey] === "object"
      ? byRoot[rootKey]
      : null;
    if (!entry) return { restoredFile: false, tuneSelection: null };

    const files = Array.isArray(libraryIndex.files) ? libraryIndex.files : [];
    const filePaths = files.map((f) => f && f.path).filter(Boolean);

    const expandedFiles = Array.isArray(entry.expandedFiles) ? entry.expandedFiles : [];
    const expandedFilesSet = new Set(expandedFiles.map((p) => String(p || "")).filter(Boolean));

    collapsedFiles.clear();
    for (const p of filePaths) collapsedFiles.add(p);
    for (const p of expandedFilesSet) collapsedFiles.delete(p);

    collapsedGroups.clear();
    if (groupMode !== "file" && files.length) {
      const groups = buildGroupEntries(files, groupMode);
      for (const group of groups) collapsedGroups.add(group.id);
      const byMode = entry.expandedGroupsByMode && typeof entry.expandedGroupsByMode === "object"
        ? entry.expandedGroupsByMode
        : null;
      const expandedGroups = byMode && Array.isArray(byMode[groupMode]) ? byMode[groupMode] : [];
      for (const id of expandedGroups) {
        if (!id) continue;
        collapsedGroups.delete(String(id));
      }
    }

    const savedActivePath = entry.activeFilePath ? String(entry.activeFilePath) : "";
    const hasFile = savedActivePath && filePaths.some((p) => pathsEqual(p, savedActivePath));
    if (hasFile) {
      setActiveFilePath(savedActivePath);
      collapsedFiles.delete(savedActivePath);
    }

    const activeTune = entry.activeTune && typeof entry.activeTune === "object" ? entry.activeTune : null;
    const tuneSelection = activeTune
      ? {
        tuneId: activeTune.tuneId ? String(activeTune.tuneId) : "",
        filePath: activeTune.filePath ? String(activeTune.filePath) : (hasFile ? savedActivePath : ""),
        xNumber: activeTune.xNumber != null ? String(activeTune.xNumber) : "",
        title: activeTune.title != null ? String(activeTune.title) : "",
        startOffset: Number.isFinite(Number(activeTune.startOffset)) ? Number(activeTune.startOffset) : null,
      }
      : null;

    return { restoredFile: Boolean(hasFile), tuneSelection };
  }

  async function restoreLibraryTuneSelection(selection) {
    const libraryIndex = getIndex();
    if (!libraryIndex || !libraryIndex.root) return false;
    if (!selection) return false;

    const tuneId = selection.tuneId ? String(selection.tuneId) : "";
    const filePath = selection.filePath ? String(selection.filePath) : "";
    const xNumber = selection.xNumber ? String(selection.xNumber) : "";
    const title = selection.title ? String(selection.title) : "";
    const startOffset = selection.startOffset;

    const trySelect = async (id) => {
      if (!id) return false;
      try {
        const res = await selectTune(id, { skipConfirm: true, suppressRecent: true });
        if (res && res.ok) {
          renderLibraryTree();
          return true;
        }
      } catch {}
      return false;
    };

    if (tuneId) {
      const ok = await trySelect(tuneId);
      if (ok) return true;
    }

    let fileEntry = null;
    if (filePath && libraryIndex && Array.isArray(libraryIndex.files)) {
      fileEntry = libraryIndex.files.find((f) => pathsEqual(f.path, filePath)) || null;
    }

    if (fileEntry && (!fileEntry.tunes || !fileEntry.tunes.length) && api && typeof api.parseLibraryFile === "function") {
      try {
        const updated = await refreshLibraryFile(filePath);
        if (updated) fileEntry = updated;
      } catch {}
    }

    const tunes = fileEntry && Array.isArray(fileEntry.tunes) ? fileEntry.tunes : [];
    if (!tunes.length) return false;

    let candidate = null;
    if (Number.isFinite(startOffset)) {
      candidate = tunes.find((t) => Number(t.startOffset) === Number(startOffset)) || null;
    }
    if (!candidate && xNumber) {
      const matches = tunes.filter((t) => String(t.xNumber || "") === xNumber);
      if (matches.length === 1) candidate = matches[0];
      else if (matches.length > 1 && title) {
        const want = title.trim().toLowerCase();
        candidate = matches.find((t) => String(t.title || "").trim().toLowerCase() === want) || matches[0];
      } else if (matches.length) {
        candidate = matches[0];
      }
    }

    if (!candidate) return false;
    const id = candidate.id ? String(candidate.id) : "";
    return trySelect(id);
  }

  async function flushLibraryPrefsSave() {
    if (!api || typeof api.updateSettings !== "function") return;
    if (libraryUiStateTimer) {
      clearTimeout(libraryUiStateTimer);
      libraryUiStateTimer = null;
    }
    if (libraryUiStateDirty) {
      libraryUiStateDirty = false;
      const snap = computeLibraryUiStateSnapshot();
      if (snap) {
        pendingLibraryPrefsPatch = {
          ...(pendingLibraryPrefsPatch || {}),
          libraryUiStateByRoot: {
            [snap.rootKey]: snap.state,
          },
        };
      }
    }
    if (libraryPrefsSaveTimer) {
      clearTimeout(libraryPrefsSaveTimer);
      libraryPrefsSaveTimer = null;
    }
    const nextPatch = pendingLibraryPrefsPatch;
    pendingLibraryPrefsPatch = null;
    if (!nextPatch) return;
    try {
      await api.updateSettings(nextPatch);
    } catch {}
  }

  function applyLibraryPrefsFromSettings(settings) {
    if (!settings) return;
    const normalized = {
      libraryPaneVisible: Boolean(settings.libraryPaneVisible),
      libraryPaneWidth: Number.isFinite(Number(settings.libraryPaneWidth)) ? Math.round(Number(settings.libraryPaneWidth)) : null,
      libraryGroupBy: String(settings.libraryGroupBy || "").trim() || null,
      librarySortBy: String(settings.librarySortBy || "").trim() || null,
      libraryTuneSortBy: String(settings.libraryTuneSortBy || "").trim() || null,
      libraryFilterText: String(settings.libraryFilterText || ""),
      libraryTitleKeyLength: Number.isFinite(Number(settings.libraryTitleKeyLength))
        ? Math.round(Number(settings.libraryTitleKeyLength))
        : null,
      libraryTitleKeyStrict: Boolean(settings.libraryTitleKeyStrict),
      libraryCacheEnabled: Boolean(settings.libraryCacheEnabled),
    };
    const sig = JSON.stringify(normalized);
    if (sig === lastAppliedLibraryPrefsSig) return;
    lastAppliedLibraryPrefsSig = sig;

    const prevSuppress = suppressLibraryPrefsWrite;
    suppressLibraryPrefsWrite = true;
    try {
      const nextGroup = normalized.libraryGroupBy || "";
      if (nextGroup && isValidGroupMode(nextGroup)) groupMode = nextGroup;

      const nextSort = normalizeGroupSortMode(normalized.librarySortBy) || getDefaultGroupSortMode(groupMode);
      setSortMode(nextSort);
      groupSortPrefs.set(groupMode, nextSort);
      const nextTuneSort = normalizeTuneSortMode(normalized.libraryTuneSortBy) || getDefaultTuneSortMode(groupMode);
      setTuneSortMode(nextTuneSort);
      groupTuneSortPrefs.set(groupMode, nextTuneSort);

      if (librarySearchTimer) {
        clearTimeout(librarySearchTimer);
        librarySearchTimer = null;
      }
      pendingLibrarySearch = "";
      setLibraryTextFilter(normalized.libraryFilterText);

      const keyLen = normalized.libraryTitleKeyLength;
      libraryTitleKeyLength = Number.isFinite(keyLen) && keyLen > 0 ? keyLen : 25;
      libraryTitleKeyStrict = Boolean(normalized.libraryTitleKeyStrict);
      if (windowRef) {
        windowRef.__abcarusLibraryTitleKeyLength = libraryTitleKeyLength;
        windowRef.__abcarusLibraryTitleKeyStrict = libraryTitleKeyStrict;
        windowRef.__abcarusLibraryCacheEnabled = Boolean(normalized.libraryCacheEnabled);
      }

      const width = normalized.libraryPaneWidth;
      if (Number.isFinite(width) && width > 0) lastSidebarWidth = width;

      setLibraryVisible(Boolean(normalized.libraryPaneVisible));
      scheduleRenderLibraryTree();
      updateLibraryStatus();
      try {
        if (libraryViewStore) libraryViewStore.invalidate();
        if (documentRef && documentRef.body && documentRef.body.classList.contains("library-list-open")) {
          if (typeof onModalRowsChanged === "function") onModalRowsChanged();
        }
      } catch {}
    } finally {
      suppressLibraryPrefsWrite = prevSuppress;
    }
  }

  function scheduleLibrarySearch(value) {
    pendingLibrarySearch = value;
    if (librarySearchTimer) clearTimeout(librarySearchTimer);
    librarySearchTimer = setTimeout(() => {
      librarySearchTimer = null;
      setLibraryTextFilter(String(pendingLibrarySearch || "").trim());
      scheduleRenderLibraryTree();
      updateLibraryStatus();
    }, searchDebounceMs);
  }

  function clearLibrarySearchTimer() {
    if (librarySearchTimer) {
      clearTimeout(librarySearchTimer);
      librarySearchTimer = null;
    }
  }

  function expandInitialCollapsedState() {
    const libraryIndex = getIndex();
    collapsedFiles.clear();
    collapsedGroups.clear();
    if (!libraryIndex || !Array.isArray(libraryIndex.files)) return;
    if (groupMode === "file") {
      for (const file of libraryIndex.files) collapsedFiles.add(file.path);
    } else {
      const groups = buildGroupEntries(libraryIndex.files || [], groupMode);
      for (const group of groups) collapsedGroups.add(group.id);
    }
  }

  function expandAll() {
    collapsedFiles.clear();
    collapsedGroups.clear();
    renderLibraryTree();
    scheduleSaveLibraryUiState();
  }

  function collapseAll() {
    const libraryIndex = getIndex();
    const files = libraryIndex && Array.isArray(libraryIndex.files) ? libraryIndex.files : [];
    collapsedFiles.clear();
    collapsedGroups.clear();
    if (groupMode === "file") {
      for (const file of files) {
        if (file && file.path) collapsedFiles.add(file.path);
      }
    } else {
      const groups = buildGroupEntries(files, groupMode);
      for (const group of groups) {
        if (group && group.id) collapsedGroups.add(group.id);
      }
    }
    renderLibraryTree();
    scheduleSaveLibraryUiState();
  }

  function handleGroupModeChange(nextGroup) {
    groupMode = nextGroup || "file";
    collapsedGroups.clear();
    const savedGroupSort = normalizeGroupSortMode(groupSortPrefs.get(groupMode))
      || getDefaultGroupSortMode(groupMode);
    setSortMode(savedGroupSort);
    groupSortPrefs.set(groupMode, sortMode);
    const savedTuneSort = normalizeTuneSortMode(groupTuneSortPrefs.get(groupMode))
      || getDefaultTuneSortMode(groupMode);
    setTuneSortMode(savedTuneSort);
    groupTuneSortPrefs.set(groupMode, tuneSortMode);
    scheduleSaveLibraryPrefs({
      libraryGroupBy: groupMode,
      librarySortBy: sortMode,
      libraryTuneSortBy: tuneSortMode,
    });
    if (groupMode !== "file" && typeof hasFullLibraryIndex === "function" && !hasFullLibraryIndex()) {
      ensureFullLibraryIndex({ reason: `group by ${groupMode}` }).catch(() => {});
    }
    expandInitialCollapsedState();
    renderLibraryTree();
    scheduleSaveLibraryUiState();
  }

  function handleSortModeChange(nextMode) {
    setSortMode(nextMode || getDefaultGroupSortMode(groupMode));
    groupSortPrefs.set(groupMode, sortMode);
    scheduleSaveLibraryPrefs({ librarySortBy: sortMode });
    renderLibraryTree();
  }

  function handleTuneSortModeChange(nextMode) {
    setTuneSortMode(nextMode || getDefaultTuneSortMode(groupMode));
    groupTuneSortPrefs.set(groupMode, tuneSortMode);
    scheduleSaveLibraryPrefs({ libraryTuneSortBy: tuneSortMode });
    renderLibraryTree();
  }

  function setPrefsWriteSuppressed(value) {
    suppressLibraryPrefsWrite = Boolean(value);
  }

  function syncControls({ groupBy, sortBy, sortTunesBy } = {}) {
    if (groupBy) groupBy.value = groupMode;
    if (sortBy) sortBy.value = sortMode;
    if (sortTunesBy) sortTunesBy.value = tuneSortMode;
  }

  function getSnapshot() {
    return {
      groupMode,
      sortMode,
      tuneSortMode,
      lastSidebarWidth,
      libraryTitleKeyLength,
      libraryTitleKeyStrict,
    };
  }

  return {
    applyLibraryPrefsFromSettings,
    applyLibraryTextFilter,
    applyLibraryUiStateFromSettings,
    clearLibrarySearchTimer,
    collapsedFiles,
    collapsedGroups,
    computeLibraryUiStateSnapshot,
    collapseAll,
    expandAll,
    expandInitialCollapsedState,
    flushLibraryPrefsSave,
    getCollapsedFiles: () => collapsedFiles,
    getCollapsedGroups: () => collapsedGroups,
    getGroupMode: () => groupMode,
    getLastSidebarWidth: () => lastSidebarWidth,
    getSnapshot,
    getSortMode: () => sortMode,
    getTuneSortMode: () => tuneSortMode,
    getVisibleLibraryFiles,
    handleGroupModeChange,
    handleSortModeChange,
    handleTuneSortModeChange,
    normalizeTitleKey: normalizeTitleKeyForPrefs,
    restoreLibraryTuneSelection,
    scheduleLibrarySearch,
    scheduleSaveLibraryPrefs,
    scheduleSaveLibraryUiState,
    setLastSidebarWidth: (value) => { lastSidebarWidth = value; },
    setPrefsWriteSuppressed,
    setSortMode,
    setTuneSortMode,
    sortGroupEntries,
    sortLibraryFiles,
    sortTunes,
    syncControls,
  };
}

export {
  GROUP_LABELS,
  createLibraryUiStateController,
  normalizeTitleKey,
};
