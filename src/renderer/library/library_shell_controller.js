export function createLibraryShellController({
  api = null,
  documentRef = typeof document !== "undefined" ? document : null,
  windowRef = typeof window !== "undefined" ? window : null,
  elements = {},
  state = {},
  actions = {},
  constants = {},
} = {}) {
  const {
    main = null,
  } = elements;

  const {
    getLibraryVisible = () => true,
    setLibraryVisibleState = () => {},
    isLibraryDisabled = () => false,
    getLastSidebarWidth = () => 280,
    getLibraryIndex = () => null,
    getSetListVisible = () => false,
    getSetListPaneWidth = () => 300,
  } = state;

  const {
    ensureSafeToAbandonCurrentDoc = async () => true,
    loadLibraryFromFolder = async () => {},
    renderBufferStatus = () => {},
    resetRightPaneSplit = () => {},
    scheduleSaveLibraryPrefs = () => {},
    setPaneSizes = () => {},
    setStatus = () => {},
    showOpenFolderDialog = async () => null,
    showToast = () => {},
  } = actions;

  const {
    MIN_PANE_WIDTH = 220,
  } = constants;

  function setLibraryVisible(visible, { persist = true } = {}) {
    if (isLibraryDisabled() && visible) return;
    setLibraryVisibleState(Boolean(visible));
    if (documentRef && documentRef.body && documentRef.body.classList) {
      documentRef.body.classList.toggle("library-hidden", !visible);
    }
    renderBufferStatus();
    if (visible) {
      setPaneSizes(getLastSidebarWidth() || MIN_PANE_WIDTH);
    } else if (main) {
      main.style.gridTemplateColumns = getSetListVisible()
        ? `0px 0px ${Math.max(220, Number(getSetListPaneWidth()) || 300)}px 6px 1fr`
        : "0px 0px 0px 0px 1fr";
    }
    if (persist) scheduleSaveLibraryPrefs({ libraryPaneVisible: Boolean(visible) });
  }

  function toggleLibrary() {
    if (isLibraryDisabled()) {
      showToast("Library is disabled while editing ChordPro.", 2400);
      return;
    }
    setLibraryVisible(!getLibraryVisible());
    const raf = windowRef && typeof windowRef.requestAnimationFrame === "function"
      ? windowRef.requestAnimationFrame.bind(windowRef)
      : (fn) => setTimeout(fn, 0);
    raf(() => {
      try { resetRightPaneSplit(); } catch {}
    });
  }

  async function openRecentFolder(entry) {
    if (!entry || !entry.path) return { ok: false, error: "Missing path." };
    if (isLibraryDisabled()) {
      showToast("Library is disabled while editing ChordPro.", 2400);
      return { ok: false, error: "Library is disabled while editing ChordPro." };
    }
    const ok = await ensureSafeToAbandonCurrentDoc("opening a recent folder");
    if (!ok) return { ok: false, cancelled: true };
    await loadLibraryFromFolder(entry.path);
    const libraryIndex = getLibraryIndex();
    if (libraryIndex && libraryIndex.root) return { ok: true };
    return { ok: false, error: "Unable to load folder." };
  }

  async function scanAndLoadLibrary() {
    if (isLibraryDisabled()) {
      showToast("Library is disabled while editing ChordPro.", 2400);
      return;
    }
    if (!api) return;
    const ok = await ensureSafeToAbandonCurrentDoc("opening a folder");
    if (!ok) return;
    const folder = await showOpenFolderDialog();
    if (!folder) return;

    await loadLibraryFromFolder(folder);
    if (api && typeof api.addRecentFolder === "function") {
      api.addRecentFolder({ path: folder, label: folder });
    }
  }

  function requireLibraryLoaded() {
    const libraryIndex = getLibraryIndex();
    if (!libraryIndex || !libraryIndex.root || !Array.isArray(libraryIndex.files) || !libraryIndex.files.length) {
      setStatus("Load a library folder first.");
      return false;
    }
    return true;
  }

  return {
    setLibraryVisible,
    toggleLibrary,
    openRecentFolder,
    scanAndLoadLibrary,
    requireLibraryLoaded,
  };
}
