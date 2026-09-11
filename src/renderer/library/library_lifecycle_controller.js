export function createLibraryLifecycleController({
  api = null,
  elements = {},
  state = {},
  actions = {},
  constants = {},
} = {}) {
  const {
    tuneSelect = null,
  } = elements;

  const {
    getLibraryIndex = () => null,
    setLibraryIndex = () => {},
    getRawMode = () => false,
    getFocusModeEnabled = () => false,
    getActiveTuneMeta = () => null,
    getActiveTuneId = () => "",
    getActiveTuneIndex = () => null,
    getActiveTuneUid = () => "",
    getCurrentDocumentPath = () => "",
    getLibraryFilterLabel = () => "",
    isPayloadMode = () => false,
    isCurrentDocumentDirty = () => false,
  } = state;

  const {
    applyLibraryUiStateFromSettings = () => false,
    buildTuneMetaLabel = () => "",
    clearAbPlan = () => {},
    clearActiveErrorHighlight = () => {},
    clearLibraryFilter = () => {},
    countLines = () => 1,
    ensureFullLibraryIndex = async () => {},
    ensureSafeToAbandonCurrentDoc = async () => true,
    errorsClearIndex = () => {},
    errorsHasActiveHighlight = () => false,
    isChordProFilePath = () => false,
    isChordProText = () => false,
    isFilePerfEnabled = () => false,
    isRenderPerfEnabled = () => false,
    logErr = () => {},
    logFilePerf = () => {},
    logRenderPerf = () => {},
    markActiveTuneButton = () => {},
    markHeaderClean = () => {},
    markStartupUiReady = () => {},
    maybeResetFocusLoopForTune = () => {},
    openChordPro = async () => {},
    patchCurrentDocument = () => {},
    perfNowMs = () => 0,
    readFile = async () => ({ ok: false }),
    recordRecentAction = () => {},
    refreshHeaderLayers = async () => {},
    refreshLibraryFile = async () => null,
    reportStartupStatus = () => {},
    resetPlaybackState = () => {},
    resetTransposePreviewState = () => {},
    resolveTuneEntryFromSnapshot = () => null,
    safeBasename = (p) => String(p || ""),
    safeDirname = () => "",
    splitFileIntoHeaderAndBody = (text) => ({ headerText: "", bodyText: String(text || "") }),
    scheduleRenderLibraryTree = () => {},
    scheduleRenderNow = () => {},
    scheduleSaveLibraryUiState = () => {},
    clearPlaybackSelectionCapture = () => {},
    setActiveFilePath = () => {},
    setActiveTuneId = () => {},
    setActiveTuneIndex = () => {},
    setActiveTuneMeta = () => {},
    setActiveTuneUid = () => {},
    setChordProMode = () => {},
    setDirtyIndicator = () => {},
    setEditorValue = () => {},
    setFileNameMeta = () => {},
    setIsNewTuneDraft = () => {},
    setLibraryActiveFilePath = () => {},
    setPlaybackRange = () => {},
    setScanStatus = () => {},
    setSuppressDirty = () => {},
    setTuneMetaText = () => {},
    showEmptyState = () => {},
    showToast = () => {},
    stripFileExtension = (name) => String(name || ""),
    updateFileContext = () => {},
    updateFileHeaderPanel = () => {},
    updateHeaderStateUI = () => {},
    updateLibraryRootUI = () => {},
    updateLibraryStatus = () => {},
    invalidateLibraryView = () => {},
    expandInitialCollapsedState = () => {},
    getLatestSettingsSnapshot = () => null,
    pathsEqual = (a, b) => String(a || "") === String(b || ""),
  } = actions;

  const {
    UNTITLED_UNSAVED_LABEL = "Untitled (unsaved)",
  } = constants;

  let selectTuneInFlightKey = "";
  let selectTuneInFlightPromise = null;

  function findLoadedFileEntry(filePath) {
    const p = String(filePath || "");
    const libraryIndex = getLibraryIndex();
    if (!p || !libraryIndex || !Array.isArray(libraryIndex.files)) return null;
    return libraryIndex.files.find((f) => f && f.path && pathsEqual(f.path, p)) || null;
  }

  function reconcileActiveTuneAfterSave(filePath, updatedFile) {
    if (!updatedFile || !Array.isArray(updatedFile.tunes) || !updatedFile.tunes.length) return false;
    const activeTuneMeta = getActiveTuneMeta();
    const previousUid = String(getActiveTuneUid() || "");
    const previousX = activeTuneMeta && activeTuneMeta.xNumber != null
      ? String(activeTuneMeta.xNumber || "").trim()
      : "";
    const previousTitle = activeTuneMeta && activeTuneMeta.title != null
      ? String(activeTuneMeta.title || "").trim()
      : "";

    let tune = previousUid
      ? updatedFile.tunes.find((entry) => entry && entry.tuneUid && String(entry.tuneUid) === previousUid) || null
      : null;
    if (!tune && (previousX || previousTitle)) {
      const matches = updatedFile.tunes.filter((entry) => {
        if (!entry) return false;
        if (previousX && String(entry.xNumber || "").trim() !== previousX) return false;
        if (previousTitle && String(entry.title || "").trim() !== previousTitle) return false;
        return true;
      });
      if (matches.length === 1) tune = matches[0];
    }
    if (!tune) return false;

    const nextUid = tune.tuneUid || previousUid || null;
    const nextId = tune.id || getActiveTuneId() || null;
    const nextIndex = Number.isFinite(Number(tune.tuneIndex))
      ? Number(tune.tuneIndex)
      : updatedFile.tunes.indexOf(tune);
    const nextMeta = {
      ...(activeTuneMeta || {}),
      id: nextId || "",
      tuneUid: nextUid || "",
      tuneIndex: Number.isFinite(nextIndex) ? nextIndex : getActiveTuneIndex(),
      path: updatedFile.path || filePath,
      basename: updatedFile.basename || safeBasename(filePath),
      xNumber: tune.xNumber || (activeTuneMeta && activeTuneMeta.xNumber) || "",
      title: tune.title || (activeTuneMeta && activeTuneMeta.title) || "",
      composer: tune.composer || (activeTuneMeta && activeTuneMeta.composer) || "",
      key: tune.key || (activeTuneMeta && activeTuneMeta.key) || "",
      startLine: tune.startLine,
      endLine: tune.endLine,
      startOffset: tune.startOffset,
      endOffset: tune.endOffset,
    };

    setActiveTuneId(nextId);
    setActiveTuneUid(nextUid);
    setActiveTuneIndex(nextMeta.tuneIndex);
    setActiveTuneMeta(nextMeta);
    markActiveTuneButton(nextUid || nextId);
    setTuneMetaText(buildTuneMetaLabel(nextMeta));
    setFileNameMeta(stripFileExtension(nextMeta.basename || safeBasename(filePath)));
    return true;
  }

  function findRecentTuneInFileEntry(fileEntry, entry, { fallbackToFirst = false } = {}) {
    if (!fileEntry || !Array.isArray(fileEntry.tunes) || !entry) return null;
    const tunes = fileEntry.tunes;
    const wantedX = String(entry.xNumber || "").trim();
    const wantedTitle = String(entry.title || "").trim().toLowerCase();
    const startOffset = Number(entry.startOffset) || 0;
    const titleOf = (tune) => String(tune && (tune.title || "")).trim().toLowerCase();
    const xOf = (tune) => String(tune && (tune.xNumber || "")).trim();

    let tune = null;
    if (wantedX && wantedTitle) {
      const matches = tunes.filter((candidate) => xOf(candidate) === wantedX && titleOf(candidate) === wantedTitle);
      if (matches.length === 1) tune = matches[0];
    }
    if (!tune && wantedTitle) {
      const matches = tunes.filter((candidate) => titleOf(candidate) === wantedTitle);
      if (matches.length === 1) tune = matches[0];
    }
    if (!tune && wantedX) {
      const matches = tunes.filter((candidate) => xOf(candidate) === wantedX);
      if (matches.length === 1) tune = matches[0];
    }
    if (!tune && Number.isFinite(Number(entry.startOffset))) {
      const id = `${entry.path}::${startOffset}`;
      const offsetMatch = tunes.find((candidate) => candidate && (
        candidate.id === id || Number(candidate.startOffset) === startOffset
      )) || null;
      const metadataMatches = offsetMatch
        && (!wantedX || xOf(offsetMatch) === wantedX)
        && (!wantedTitle || titleOf(offsetMatch) === wantedTitle);
      if (metadataMatches) tune = offsetMatch;
    }
    if (!tune && fallbackToFirst && tunes.length) tune = tunes[0];
    return tune || null;
  }

  async function findLastRecentTuneForFile(filePath) {
    if (!api || typeof api.getRecentCandidates !== "function") return null;
    try {
      const candidates = await api.getRecentCandidates();
      if (!Array.isArray(candidates)) return null;
      const recent = candidates.find((candidate) => (
        candidate
        && candidate.type === "tune"
        && candidate.entry
        && pathsEqual(candidate.entry.path, filePath)
      ));
      return recent ? recent.entry : null;
    } catch {
      return null;
    }
  }

  async function selectInitialTuneForFile(fileEntry, filePath, options = {}) {
    if (!fileEntry || !Array.isArray(fileEntry.tunes) || !fileEntry.tunes.length) return false;
    const recentEntry = await findLastRecentTuneForFile(filePath);
    const tune = recentEntry
      ? findRecentTuneInFileEntry(fileEntry, recentEntry, { fallbackToFirst: true })
      : fileEntry.tunes[0];
    const key = tune ? (tune.tuneUid || tune.id) : "";
    if (!key) return false;
    const result = await selectTune(key, options);
    return Boolean(result && result.ok);
  }

  function setActiveTuneText(text, metadata, options = {}) {
    const perfOn = isRenderPerfEnabled();
    const t0 = perfOn ? perfNowMs() : 0;
    let tStep = t0;
    const logStep = (label, data = {}) => {
      if (!perfOn) return;
      const now = perfNowMs();
      logRenderPerf(`setActiveTuneText: ${label}`, {
        ms: Math.round(now - tStep),
        totalMs: Math.round(now - t0),
        ...data,
      });
      tStep = now;
    };

    setChordProMode(false);
    if (errorsHasActiveHighlight()) clearActiveErrorHighlight("docReplaced");
    setIsNewTuneDraft(false);
    resetPlaybackState();
    resetTransposePreviewState();
    logStep("reset state");

    setSuppressDirty(true);
    setEditorValue(text);
    setSuppressDirty(false);
    logStep("set editor value", { chars: String(text || "").length });

    if (metadata) {
      setActiveTuneMeta({ ...metadata });
      setActiveFilePath(metadata.path || null);
      scheduleSaveLibraryUiState();
      refreshHeaderLayers().catch(() => {});
      setTuneMetaText(buildTuneMetaLabel(metadata));
      setFileNameMeta(stripFileExtension(metadata.basename || ""));
      logStep("metadata/status");
      if (typeof actions.sourceLinkUpdate === "function") actions.sourceLinkUpdate();
      logStep("source link");
      patchCurrentDocument({ path: metadata.path || null, content: text, dirty: false });
      if (!options.suppressRecent && !state.getSuppressRecentEntries?.() && api && typeof api.addRecentTune === "function") {
        api.addRecentTune({
          path: metadata.path,
          basename: metadata.basename,
          xNumber: metadata.xNumber,
          title: metadata.title || "",
          startLine: metadata.startLine,
          endLine: metadata.endLine,
          startOffset: metadata.startOffset,
          endOffset: metadata.endOffset,
        });
      }
      if (!options.suppressRecent && !state.getSuppressRecentEntries?.() && api && typeof api.addRecentFile === "function") {
        api.addRecentFile({
          path: metadata.path,
          basename: metadata.basename,
        });
      }
      logStep("recent/doc state");
      updateFileContext();
      logStep("file context");
      setDirtyIndicator(false);
      logStep("dirty/save session");
    } else {
      const markDirty = Boolean(options && options.markDirty);
      setActiveTuneMeta(null);
      setActiveTuneId(null);
      setActiveTuneUid(null);
      setActiveTuneIndex(null);
      setActiveFilePath(null);
      setIsNewTuneDraft(false);
      refreshHeaderLayers().catch(() => {});
      setTuneMetaText(UNTITLED_UNSAVED_LABEL);
      setFileNameMeta(UNTITLED_UNSAVED_LABEL);
      if (typeof actions.sourceLinkUpdate === "function") actions.sourceLinkUpdate();
      patchCurrentDocument({ path: null, content: text || "", dirty: markDirty });
      updateFileContext();
      setDirtyIndicator(markDirty);
      markHeaderClean();
      updateHeaderStateUI();
    }

    updateFileHeaderPanel();
    logStep("file header panel");
    if (metadata && metadata.id) maybeResetFocusLoopForTune(metadata.id);
    logStep("focus loop");
    if (perfOn) {
      logRenderPerf("setActiveTuneText: before schedule", {
        ms: Math.round(perfNowMs() - t0),
        chars: String(text || "").length,
        file: metadata && metadata.path ? safeBasename(metadata.path) : "",
        x: metadata && metadata.xNumber ? String(metadata.xNumber) : "",
      });
    }
    scheduleRenderNow({ clearOutput: true, source: metadata ? "setActiveTuneText:metadata" : "setActiveTuneText:plain" });
  }

  async function selectTune(tuneId, options = {}) {
    const key = String(tuneId || "");
    if (
      key
      && selectTuneInFlightPromise
      && selectTuneInFlightKey === key
      && !options._syncedFromSource
      && !options._reparsed
    ) {
      if (isFilePerfEnabled()) logFilePerf("selectTune: coalesced", { tuneId: key });
      return selectTuneInFlightPromise;
    }

    const runPromise = selectTuneImpl(tuneId, options);
    if (key && !options._syncedFromSource && !options._reparsed) {
      selectTuneInFlightKey = key;
      selectTuneInFlightPromise = runPromise;
    }
    try {
      return await runPromise;
    } finally {
      if (selectTuneInFlightPromise === runPromise) {
        selectTuneInFlightKey = "";
        selectTuneInFlightPromise = null;
      }
    }
  }

  async function selectTuneImpl(tuneId, options = {}) {
    const perfOn = isFilePerfEnabled();
    const t0 = perfOn ? perfNowMs() : 0;
    let tStep = t0;
    const logStep = (label, data = {}) => {
      if (!perfOn) return;
      const now = perfNowMs();
      logFilePerf(`selectTune: ${label}`, {
        ms: Math.round(now - tStep),
        totalMs: Math.round(now - t0),
        tuneId: String(tuneId || ""),
        ...data,
      });
      tStep = now;
    };

    const libraryIndex = getLibraryIndex();
    if (!libraryIndex || !tuneId) return;
    recordRecentAction("selectTune.start", {
      tuneId: String(tuneId),
      skipConfirm: Boolean(options && options.skipConfirm),
      rawMode: Boolean(getRawMode()),
      focusMode: Boolean(getFocusModeEnabled()),
      payloadMode: Boolean(isPayloadMode()),
    });
    if (!options.skipConfirm) {
      const ok = await ensureSafeToAbandonCurrentDoc("switching tunes");
      if (!ok) return { ok: false, cancelled: true };
    }
    logStep("confirm");

    let selected = null;
    let fileMeta = null;
    for (const file of libraryIndex.files || []) {
      const found = (file.tunes || []).find((t) => (t && t.tuneUid && t.tuneUid === tuneId) || (t && t.id === tuneId));
      if (found) {
        selected = found;
        fileMeta = file;
        break;
      }
    }

    if (!selected || !fileMeta) return { ok: false, error: "Tune not found." };
    logStep("find tune", { file: fileMeta && fileMeta.path ? safeBasename(fileMeta.path) : "" });

    let content = null;
    let sliceStart = Number(selected.startOffset) || 0;
    let sliceEnd = Number(selected.endOffset) || 0;
    const res = await readFile(fileMeta.path);
    if (!res || !res.ok) {
      logErr(res && res.error ? res.error : "Unable to read file.");
      return { ok: false, error: res && res.error ? res.error : "Unable to read file." };
    }
    content = String(res.data || "");
    logStep("load content", {
      chars: content == null ? 0 : String(content || "").length,
    });

    const isTuneSliceValid = (fullText, tune) => {
      if (!fullText || !tune || !Number.isFinite(Number(tune.startOffset))) return false;
      const start = Number(tune.startOffset);
      const probe = String(fullText).slice(start, Math.min(fullText.length, start + 160));
      return /^\s*X:/.test(probe);
    };

    if (!options._reparsed && !isTuneSliceValid(content, selected)) {
      try {
        const updatedFile = await refreshLibraryFile(fileMeta.path, { force: true });
        const tunes = updatedFile && Array.isArray(updatedFile.tunes) ? updatedFile.tunes : [];
        const expectedTitle = selected && selected.title ? String(selected.title).trim().toLowerCase() : "";
        const expectedStart = Number.isFinite(Number(selected.startOffset)) ? Number(selected.startOffset) : null;
        const expectedId = selected && selected.id ? String(selected.id) : "";

        let replacement = null;
        if (expectedId) replacement = tunes.find((t) => t && t.id && String(t.id) === expectedId) || null;
        if (!replacement && expectedStart != null) replacement = tunes.find((t) => Number(t.startOffset) === expectedStart) || null;
        if (!replacement && expectedTitle) replacement = tunes.find((t) => String(t && (t.title || "")).trim().toLowerCase() === expectedTitle) || null;
        if (replacement && replacement.id) return selectTune(replacement.id, { ...options, skipConfirm: true, _reparsed: true });
      } catch {}
    }
    logStep("validate slice");

    const tuneText = content.slice(sliceStart, sliceEnd);
    const fileParts = splitFileIntoHeaderAndBody(content);
    const headerEnd = String(fileParts.headerText || "").length;
    const documentParts = {
      header: String(fileParts.headerText || ""),
      before: content.slice(headerEnd, sliceStart),
      active: tuneText,
      after: content.slice(sliceEnd),
    };
    setActiveTuneId(selected.id);
    setActiveTuneUid(selected.tuneUid || null);
    setActiveTuneIndex(Number.isFinite(Number(selected.tuneIndex)) ? Number(selected.tuneIndex) : null);
    if (tuneSelect && !tuneSelect.disabled) {
      const nextKey = getRawMode() ? selected.id : (selected.tuneUid || selected.id);
      try { tuneSelect.value = nextKey; } catch {}
    }
    markActiveTuneButton(tuneId);
    setActiveTuneText(tuneText, {
      id: selected.id,
      tuneUid: selected.tuneUid || "",
      tuneIndex: Number.isFinite(Number(selected.tuneIndex)) ? Number(selected.tuneIndex) : null,
      path: fileMeta.path,
      basename: fileMeta.basename,
      xNumber: selected.xNumber,
      title: selected.title || "",
      startLine: selected.startLine,
      endLine: selected.endLine,
      startOffset: sliceStart,
      endOffset: sliceEnd,
      documentParts,
    }, { suppressRecent: options.suppressRecent || false });
    // The active path changes during tune loading; refresh the tree so its ordering
    // reflects the newly active file immediately, not only on a later library update.
    scheduleRenderLibraryTree();
    logStep("set active text", { tuneChars: String(tuneText || "").length });
    clearPlaybackSelectionCapture();
    resetPlaybackState();
    setPlaybackRange({ startOffset: 0, endOffset: null, origin: "cursor", loop: false });
    if (typeof actions.resetEditorSelectionToStart === "function") actions.resetEditorSelectionToStart();
    setDirtyIndicator(false);
    clearAbPlan();
    if (perfOn) {
      logFilePerf("selectTune: done", {
        ms: Math.round(perfNowMs() - t0),
        file: fileMeta && fileMeta.path ? safeBasename(fileMeta.path) : "",
        x: selected && selected.xNumber ? String(selected.xNumber) : "",
      });
    }
    return { ok: true };
  }

  async function openTuneFromLibrarySelection(selection) {
    if (!selection) {
      const msg = "No selection.";
      logErr(msg);
      return { ok: false, error: msg };
    }

    const filePath = selection.filePath || selection.path || null;
    const tuneId = selection.tuneId || selection.id || null;
    const tuneUid = selection.tuneUid || null;
    const tuneNo = selection.tuneNo != null ? String(selection.tuneNo) : null;
    const xNumber = selection.xNumber != null ? String(selection.xNumber) : null;

    if (!filePath) {
      const msg = "Cannot open selection: missing file path (row may be demo data).";
      logErr(msg);
      return { ok: false, error: msg };
    }
    if (!tuneUid && !tuneId && !tuneNo && !xNumber) {
      const msg = "Cannot open selection: missing tune id/number.";
      logErr(msg);
      return { ok: false, error: msg };
    }

    const wantedPath = actions.normalizeLibraryPath ? actions.normalizeLibraryPath(filePath) : String(filePath || "");
    const ok = await ensureSafeToAbandonCurrentDoc("opening a library tune");
    if (!ok) return { ok: false, cancelled: true };

    const dir = safeDirname(filePath);
    if (!dir) {
      const msg = "Invalid file path.";
      logErr(msg);
      return { ok: false, error: msg };
    }

    const findFileEntry = () => {
      const libraryIndex = getLibraryIndex();
      if (!libraryIndex || !Array.isArray(libraryIndex.files)) return null;
      return libraryIndex.files.find((f) => pathsEqual(f && f.path, wantedPath)) || null;
    };

    let fileEntry = findFileEntry();
    if (!fileEntry) {
      await loadLibraryFromFolder(dir);
      const libraryIndex = getLibraryIndex();
      if (!libraryIndex || !Array.isArray(libraryIndex.files)) {
        const msg = "Library not loaded.";
        logErr(msg);
        return { ok: false, error: msg };
      }
      fileEntry = findFileEntry();
    }
    if (!fileEntry) {
      const msg = `File not found in library: ${filePath}`;
      logErr(msg);
      return { ok: false, error: msg };
    }

    let tune = null;
    if (tuneUid) tune = (fileEntry.tunes || []).find((t) => t && t.tuneUid && t.tuneUid === tuneUid) || null;
    if (!tune && tuneId) tune = (fileEntry.tunes || []).find((t) => t.id === tuneId) || null;
    if (!tune && tuneNo) tune = (fileEntry.tunes || []).find((t) => String(t.xNumber || "") === tuneNo) || null;
    if (!tune && xNumber) tune = (fileEntry.tunes || []).find((t) => String(t.xNumber || "") === xNumber) || null;
    if (!tune) {
      try {
        const refreshed = await refreshLibraryFile(fileEntry.path, { force: true });
        const tunes = refreshed && Array.isArray(refreshed.tunes) ? refreshed.tunes : (fileEntry.tunes || []);
        if (tuneUid) tune = tunes.find((t) => t && t.tuneUid && t.tuneUid === tuneUid) || null;
        if (!tune && tuneId) tune = tunes.find((t) => t && t.id === tuneId) || null;
        if (!tune && tuneNo) tune = tunes.find((t) => String(t && (t.xNumber || "")) === tuneNo) || null;
        if (!tune && xNumber) tune = tunes.find((t) => String(t && (t.xNumber || "")) === xNumber) || null;
      } catch {}
    }
    if (!tune) {
      const msg = `Tune not found in file: ${safeBasename(filePath)}${tuneNo ? ` (X:${tuneNo})` : (xNumber ? ` (X:${xNumber})` : "")}`;
      logErr(msg);
      return { ok: false, error: msg };
    }

    const res = await selectTune(tune.tuneUid || tune.id, { skipConfirm: true });
    if (res && res.ok) return { ok: true };
    if (res && res.cancelled) return { ok: false, cancelled: true };
    return { ok: false, error: (res && res.error) ? res.error : "Unable to open tune." };
  }

  async function openRecentTune(entry, options = {}) {
    if (!entry || !entry.path) return { ok: false, error: "Missing path." };
    const ok = await ensureSafeToAbandonCurrentDoc("opening a recent tune");
    if (!ok) return { ok: false, cancelled: true };
    const suppressRecent = Boolean(options.suppressRecent);

    setChordProMode(false);
    let fileEntry = findLoadedFileEntry(entry.path);
    const hadIndexedTunes = Boolean(fileEntry && Array.isArray(fileEntry.tunes) && fileEntry.tunes.length);
    if (fileEntry && Array.isArray(fileEntry.tunes)) {
      const tune = findRecentTuneInFileEntry(fileEntry, entry);
      if (tune && tune.id) {
        return selectTune(tune.tuneUid || tune.id, { skipConfirm: true, suppressRecent });
      }
    }

    fileEntry = await loadSingleLibraryFile(entry.path);
    if (fileEntry && Array.isArray(fileEntry.tunes)) {
      const tune = findRecentTuneInFileEntry(fileEntry, entry);
      if (tune && tune.id) {
        return selectTune(tune.tuneUid || tune.id, { skipConfirm: true, suppressRecent });
      }
      if (fileEntry.tunes.length) return { ok: false, error: "Recent tune no longer found in file." };
    }
    if (hadIndexedTunes) return { ok: false, error: "Recent tune no longer found in file." };
    const res = await readFile(entry.path);
    if (!res.ok) {
      logErr(res.error || "Unable to read file.");
      return { ok: false, error: res.error || "Unable to read file." };
    }
    const startOffset = entry.startOffset || 0;
    const endOffset = entry.endOffset || res.data.length;
    const tuneText = res.data.slice(startOffset, endOffset);
    setActiveTuneText(tuneText, {
      id: `${entry.path}::${startOffset}`,
      path: entry.path,
      basename: entry.basename || safeBasename(entry.path),
      xNumber: entry.xNumber || "",
      title: entry.title || "",
      startLine: entry.startLine || 1,
      endLine: entry.endLine || countLines(tuneText),
      startOffset,
      endOffset,
    }, { suppressRecent });
    setDirtyIndicator(false);
    return { ok: true };
  }

  async function openRecentFile(entry) {
    if (!entry || !entry.path) return { ok: false, error: "Missing path." };
    const ok = await ensureSafeToAbandonCurrentDoc("opening a recent file");
    if (!ok) return { ok: false, cancelled: true };
    const targetPath = String(entry.path || "");
    const activeTuneMeta = getActiveTuneMeta();
    const activePath = String(
      (activeTuneMeta && activeTuneMeta.path)
        || getCurrentDocumentPath()
        || ""
    );
    const shouldForceReload = Boolean(entry && entry.forceReload);
    const reopeningActiveFile = Boolean(targetPath && activePath && pathsEqual(targetPath, activePath));
    if (targetPath && (shouldForceReload || reopeningActiveFile)) {
      try { await refreshLibraryFile(targetPath, { force: true }); } catch {}
    }
    const loadedFileEntry = findLoadedFileEntry(entry.path);
    if (loadedFileEntry && Array.isArray(loadedFileEntry.tunes) && loadedFileEntry.tunes.length) {
      return loadLibraryFileIntoEditor(entry.path);
    }
    const readRes = await readFile(entry.path);
    if (readRes && readRes.ok && (isChordProText(readRes.data) || isChordProFilePath(entry.path))) {
      await openChordPro(entry.path, readRes.data, { suppressRecent: true });
      return { ok: true };
    }
    const fileEntry = await loadSingleLibraryFile(entry.path, {
      content: readRes && readRes.ok ? readRes.data : null,
    });
    if (fileEntry && Array.isArray(fileEntry.tunes) && fileEntry.tunes.length) {
      const selected = await selectInitialTuneForFile(fileEntry, entry.path, {
        skipConfirm: true,
        suppressRecent: true,
      });
      return selected ? { ok: true } : { ok: false, error: "No tunes found in file." };
    }
    return { ok: false, error: "No tunes found in file." };
  }

  async function loadLibraryFromFolder(folder, options = {}) {
    if (!api || !folder) return;
    const selectInitialTune = options.selectInitialTune !== false;
    reportStartupStatus("Scanning library…");
    actions.markStartupAutoLoadStarted?.();
    const perfOn = isFilePerfEnabled();
    const t0 = perfOn ? perfNowMs() : 0;
    if (perfOn) logFilePerf("loadLibraryFromFolder: start", {
      folder: actions.abbreviatePathForLog ? actions.abbreviatePathForLog(folder, 3) : folder,
      selectInitialTune,
    });
    const scanToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setScanStatus("Scanning…");
    errorsClearIndex();
    setActiveTuneId(null);
    setTuneMetaText("No tune selected.");
    setFileNameMeta(stripFileExtension(safeBasename(folder || "")));
    setSuppressDirty(true);
    setEditorValue("");
    setSuppressDirty(false);
    patchCurrentDocument({ path: null, content: "", dirty: false }, { create: false });
    setDirtyIndicator(false);

    try {
      if (typeof api.scanLibraryDiscover === "function") {
        const tDisc0 = perfOn ? perfNowMs() : 0;
        const discovered = await api.scanLibraryDiscover(folder, { token: scanToken, computeMeta: true });
        if (perfOn) logFilePerf("loadLibraryFromFolder: discover", { ms: Math.round(perfNowMs() - tDisc0), files: discovered && discovered.files ? discovered.files.length : 0 });
        if (discovered && discovered.root && Array.isArray(discovered.files)) {
          setLibraryIndex({
            root: discovered.root,
            files: (discovered.files || []).map((f) => ({ ...f, tunes: Array.isArray(f.tunes) ? f.tunes : [] })),
          });
          invalidateLibraryView();
          updateLibraryRootUI();
          clearLibraryFilter();
          setLibraryActiveFilePath(null);
          expandInitialCollapsedState();
          applyLibraryUiStateFromSettings(getLatestSettingsSnapshot());
          scheduleRenderLibraryTree();
          updateLibraryStatus();
        }
      }
      if (getLibraryIndex() && getLibraryIndex().root && getLibraryIndex().root !== folder) return;
      reportStartupStatus("Indexing tunes…");
      const tIndex0 = perfOn ? perfNowMs() : 0;
      await ensureFullLibraryIndex({ reason: "library" });
      if (perfOn) logFilePerf("loadLibraryFromFolder: full index", { ms: Math.round(perfNowMs() - tIndex0) });
      if (getLibraryIndex() && getLibraryIndex().root && getLibraryIndex().root !== folder) return;

      clearLibraryFilter();
      setLibraryActiveFilePath(null);
      expandInitialCollapsedState();
      const restoredSelection = applyLibraryUiStateFromSettings(getLatestSettingsSnapshot());
      scheduleRenderLibraryTree();
      if (selectInitialTune) {
        let firstTuneId = null;
        const restoredTune = restoredSelection && restoredSelection.tuneSelection
          ? await actions.restoreLibraryTuneSelection?.(restoredSelection.tuneSelection)
          : false;
        if (!restoredTune) {
          for (const file of (getLibraryIndex() || {}).files || []) {
            if (file.tunes && file.tunes.length) {
              firstTuneId = file.tunes[0].id;
              break;
            }
          }
          if (firstTuneId) {
            reportStartupStatus("Opening first tune…");
            const tSel0 = perfOn ? perfNowMs() : 0;
            await selectTune(firstTuneId);
            if (perfOn) logFilePerf("loadLibraryFromFolder: select first", { ms: Math.round(perfNowMs() - tSel0) });
          }
        }
      }
      updateLibraryStatus();
      if (perfOn) logFilePerf("loadLibraryFromFolder: done", { ms: Math.round(perfNowMs() - t0) });
      markStartupUiReady();
    } catch (e) {
      setScanStatus("Scan failed");
      logErr((e && e.stack) ? e.stack : String(e));
      markStartupUiReady();
    }
  }

  async function loadSingleLibraryFile(filePath, options = {}) {
    const p = String(filePath || "");
    if (!p || !api || typeof api.parseLibraryFile !== "function") return null;
    const perfOn = isFilePerfEnabled();
    const t0 = perfOn ? perfNowMs() : 0;
    if (perfOn) logFilePerf("loadSingleLibraryFile: start", { file: safeBasename(p) });
    try {
      const res = await api.parseLibraryFile(p, { force: Boolean(options.force) });
      if (!res || !Array.isArray(res.files) || !res.files.length) return null;
      const fileEntry = res.files[0];
      const parsedRoot = res.root || safeDirname(p);
      const currentIndex = getLibraryIndex();
      if (
        currentIndex
        && currentIndex.root
        && pathsEqual(currentIndex.root, parsedRoot)
        && Array.isArray(currentIndex.files)
      ) {
        const existingIndex = currentIndex.files.findIndex((file) => (
          file && file.path && pathsEqual(file.path, fileEntry.path)
        ));
        if (existingIndex >= 0) currentIndex.files[existingIndex] = fileEntry;
        else currentIndex.files.push(fileEntry);
        setLibraryIndex(currentIndex);
      } else {
        setLibraryIndex({
          root: parsedRoot,
          files: [fileEntry],
          indexMode: "single",
        });
      }
      invalidateLibraryView();
      updateLibraryRootUI();
      clearLibraryFilter();
      setLibraryActiveFilePath(null);
      expandInitialCollapsedState();
      scheduleRenderLibraryTree();
      updateLibraryStatus();
      if (perfOn) logFilePerf("loadSingleLibraryFile: done", {
        ms: Math.round(perfNowMs() - t0),
        file: safeBasename(p),
        tunes: Array.isArray(fileEntry.tunes) ? fileEntry.tunes.length : 0,
      });
      markStartupUiReady();
      return fileEntry;
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      markStartupUiReady();
      return null;
    }
  }

  async function loadLibraryFileIntoEditor(filePath, options = {}) {
    if (!filePath) return { ok: false, error: "Missing file path." };
    const tuneSelectOptions = {
      skipConfirm: Boolean(options.skipConfirm),
      suppressRecent: Boolean(options.suppressRecent),
    };
    let chordproText = null;
    const readRes = await readFile(filePath);
    if (readRes && readRes.ok) chordproText = String(readRes.data || "");
    if (chordproText && (isChordProText(chordproText) || isChordProFilePath(filePath))) {
      await openChordPro(filePath, chordproText, { suppressRecent: true });
      return { ok: true, chordpro: true };
    }
    setChordProMode(false);
    setLibraryActiveFilePath(filePath);
    const resolveFromIndex = async () => {
      const libraryIndex = getLibraryIndex();
      if (!libraryIndex || !libraryIndex.files) return { ok: false };
      const fileEntry = libraryIndex.files.find((f) => pathsEqual(f.path, filePath)) || null;
      if (!fileEntry) return { ok: false };
      if (fileEntry.tunes && fileEntry.tunes.length) {
        const selected = await selectInitialTuneForFile(fileEntry, filePath, tuneSelectOptions);
        return selected ? { ok: true } : { ok: false };
      }
      const tuneCount = Number.isFinite(fileEntry.tuneCount) ? fileEntry.tuneCount : null;
      const shouldTryParse = tuneCount == null || tuneCount > 0;
      if (shouldTryParse) {
        const updated = await refreshLibraryFile(filePath);
        if (updated && updated.tunes && updated.tunes.length) {
          const selected = await selectInitialTuneForFile(updated, filePath, tuneSelectOptions);
          return selected ? { ok: true } : { ok: false };
        }
      }
      return { ok: false, error: `No tunes found in file: ${safeBasename(filePath)}` };
    };

    const inMemory = await resolveFromIndex();
    if (inMemory.ok) return inMemory;

    const dir = safeDirname(filePath);
    await loadLibraryFromFolder(dir, { selectInitialTune: false });
    const afterLoad = await resolveFromIndex();
    if (afterLoad.ok) return afterLoad;
    return { ok: false, error: afterLoad.error || `File not found in library: ${safeBasename(filePath)}` };
  }

  async function requestLoadLibraryFile(filePath) {
    if (!filePath) {
      showToast("No file selected.", 2400);
      return false;
    }
    const ok = await ensureSafeToAbandonCurrentDoc("loading another file");
    if (!ok) return false;
    try {
      const res = await loadLibraryFileIntoEditor(filePath);
      if (res && res.ok) return true;
      const msg = res && res.error ? res.error : "Unable to load file.";
      logErr(msg);
      showToast(msg, 3000);
      return false;
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      logErr(msg);
      showToast("Unable to load file.", 3000);
      return false;
    }
  }

  return {
    reconcileActiveTuneAfterSave,
    setActiveTuneText,
    selectTune,
    openTuneFromLibrarySelection,
    openRecentTune,
    openRecentFile,
    loadLibraryFromFolder,
    loadSingleLibraryFile,
    loadLibraryFileIntoEditor,
    requestLoadLibraryFile,
  };
}
