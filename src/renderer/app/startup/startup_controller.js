export function createStartupController({
  api = null,
  requestAnimationFrameRef = (callback) => callback(),
  getLibraryRoot = () => "",
  pathsEqual = (left, right) => String(left || "") === String(right || ""),
  loadLibraryFromFolder = async () => {},
  openRecentTune = async () => ({ ok: false }),
  openRecentFile = async () => ({ ok: false }),
  openRecentFolder = async () => ({ ok: false }),
  applyInitialLayout = () => {},
  centerRenderPane = () => {},
  reportStartupStatus = () => {},
  setScanStatus = () => {},
  updateLibraryStatus = () => {},
  markRecentOpenStarted = () => {},
  markUiReady = () => {},
  renderStatus = () => {},
  showToast = () => {},
  setTimeoutRef = setTimeout,
  clearTimeoutRef = clearTimeout,
} = {}) {
  let layoutResetDone = false;
  let layoutResetScheduled = false;
  let libraryProgressWired = false;
  let scanStatusClearTimer = null;

  function normalizePathForContainment(value) {
    let normalized = String(value || "").trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    if (normalized.length > 1 && !/^[a-zA-Z]:\/$/.test(normalized)) normalized = normalized.replace(/\/+$/, "");
    if (/^[a-zA-Z]:\//.test(normalized)) normalized = normalized.toLowerCase();
    return normalized;
  }

  function pathBelongsToFolder(filePath, folderPath) {
    const file = normalizePathForContainment(filePath);
    const folder = normalizePathForContainment(folderPath);
    if (!file || !folder) return false;
    return file === folder || file.startsWith(folder.endsWith("/") ? folder : `${folder}/`);
  }

  function findBestRecentFolderCandidate(candidates) {
    const folders = candidates.filter((candidate) => (
      candidate
      && candidate.type === "folder"
      && candidate.entry
      && candidate.entry.path
    ));
    if (!folders.length) return null;

    const documents = candidates.filter((candidate) => (
      candidate
      && (candidate.type === "tune" || candidate.type === "file")
      && candidate.entry
      && candidate.entry.path
    ));
    for (const documentCandidate of documents) {
      const matches = folders
        .filter((folderCandidate) => pathBelongsToFolder(
          documentCandidate.entry.path,
          folderCandidate.entry.path,
        ))
        .sort((left, right) => (
          normalizePathForContainment(right.entry.path).length
          - normalizePathForContainment(left.entry.path).length
        ));
      if (matches.length) return matches[0];
    }
    return folders[0];
  }

  function scheduleLayoutReset() {
    if (layoutResetDone || layoutResetScheduled) return;
    layoutResetScheduled = true;
    requestAnimationFrameRef(() => {
      layoutResetScheduled = false;
      if (layoutResetDone) return;
      layoutResetDone = true;
      try { applyInitialLayout(); } catch {}
      requestAnimationFrameRef(() => {
        try { centerRenderPane(); } catch {}
      });
    });
  }

  async function getRecentCandidates() {
    if (!api) return [];
    if (typeof api.getRecentCandidates === "function") {
      const list = await api.getRecentCandidates();
      if (Array.isArray(list) && list.length) return list;
    }
    if (typeof api.getLastRecent === "function") {
      const recent = await api.getLastRecent();
      if (recent && recent.entry) return [recent];
    }
    return [];
  }

  function handleLibraryProgress(payload) {
    if (!payload) return;
    if (payload.phase === "discover") {
      if (scanStatusClearTimer) {
        clearTimeoutRef(scanStatusClearTimer);
        scanStatusClearTimer = null;
      }
      setScanStatus(`Scanning… ${payload.filesFound || 0} files`);
      return;
    }
    if (payload.phase === "parse") {
      const total = payload.total || 0;
      const index = payload.index || 0;
      setScanStatus(`Indexing… ${index}/${total}`);
      if (total > 0 && index >= total) {
        if (scanStatusClearTimer) clearTimeoutRef(scanStatusClearTimer);
        scanStatusClearTimer = setTimeoutRef(() => {
          scanStatusClearTimer = null;
          updateLibraryStatus();
        }, 600);
      }
      return;
    }
    if (payload.phase === "done") {
      const filesFound = payload.filesFound || 0;
      const fileLabel = filesFound === 1 ? "file" : "files";
      setScanStatus(`Indexed · ${filesFound} ${fileLabel}`);
      if (scanStatusClearTimer) clearTimeoutRef(scanStatusClearTimer);
      scanStatusClearTimer = setTimeoutRef(() => {
        scanStatusClearTimer = null;
        updateLibraryStatus();
      }, 900);
    }
  }

  function wireLibraryProgress() {
    if (libraryProgressWired || !api || typeof api.onLibraryProgress !== "function") return false;
    libraryProgressWired = true;
    api.onLibraryProgress(handleLibraryProgress);
    return true;
  }

  async function restoreRecentEntry() {
    if (!api) return false;
    reportStartupStatus("Checking recent files…");
    const candidates = await getRecentCandidates();

    const folderCandidate = findBestRecentFolderCandidate(candidates);
    if (folderCandidate) {
      reportStartupStatus("Opening recent folder…");
      try {
        await loadLibraryFromFolder(folderCandidate.entry.path, { selectInitialTune: false });
        if (getLibraryRoot()) markRecentOpenStarted();
      } catch {}
    }

    for (const candidate of candidates) {
      if (!candidate || !candidate.entry) continue;
      if (candidate.type === "tune") {
        reportStartupStatus("Opening recent tune…");
        const opened = await openRecentTune(candidate.entry);
        if (opened && opened.ok) {
          markRecentOpenStarted();
          return true;
        }
        continue;
      }
      if (candidate.type === "file") {
        reportStartupStatus("Opening recent file…");
        const opened = await openRecentFile(candidate.entry);
        if (opened && opened.ok) {
          markRecentOpenStarted();
          return true;
        }
        continue;
      }
      if (candidate.type === "folder") {
        const currentRoot = getLibraryRoot();
        if (currentRoot && pathsEqual(currentRoot, candidate.entry.path)) {
          markRecentOpenStarted();
          return true;
        }
        reportStartupStatus("Opening recent folder…");
        const opened = await openRecentFolder(candidate.entry);
        if (opened && opened.ok) {
          markRecentOpenStarted();
          return true;
        }
      }
    }
    return false;
  }

  async function start() {
    requestAnimationFrameRef(() => {
      try { applyInitialLayout(); } catch {}
    });
    try {
      const didStart = await restoreRecentEntry();
      if (!didStart && !(api && typeof api.getSettings === "function")) markUiReady();
      else renderStatus();
      return didStart;
    } catch {
      if (!(api && typeof api.getSettings === "function")) markUiReady();
      else renderStatus();
      return false;
    }
  }

  return {
    handleLibraryProgress,
    restoreRecentEntry,
    scheduleLayoutReset,
    start,
    wireLibraryProgress,
  };
}
