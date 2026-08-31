function createAbSelectionPlaybackController({
  abLoopRuntime,
  selectionPlaybackRuntime,
  getSettings,
  getEditorView,
  getEditorText,
  isRawMode,
  isPayloadMode,
  isPlaying,
  getPlaybackRange,
  getActivePlaybackRange,
  setPlaybackRange,
  startPlaybackFromRange,
  stopPlayback,
  refreshMarkers,
  showToast,
  parseMutedVoiceSetting,
  hasIntentionalSelectionPlaybackSpan,
  hasRepeatTokensInSlice,
  buildSelectionPlaybackToast,
  globalObject = globalThis,
} = {}) {
  function updateUi() {}
  function toggleOptionsPopover() {}
  function refreshOptionsUi() {}

  function planContext() {
    return {
      rawMode: typeof isRawMode === "function" ? isRawMode() : false,
      payloadMode: typeof isPayloadMode === "function" ? isPayloadMode() : false,
    };
  }

  function isPlanValid() {
    return abLoopRuntime && typeof abLoopRuntime.isPlanValid === "function"
      ? abLoopRuntime.isPlanValid(planContext())
      : false;
  }

  function clearPlan({ toast } = {}) {
    const had = abLoopRuntime && typeof abLoopRuntime.clearPlan === "function"
      ? abLoopRuntime.clearPlan()
      : false;
    if (typeof refreshMarkers === "function") refreshMarkers();
    toggleOptionsPopover(false);
    updateUi();
    if (had && toast && typeof showToast === "function") showToast("Markers cleared (score changed)", 2400);
    const playing = typeof isPlaying === "function" ? Boolean(isPlaying()) : false;
    const activeRange = typeof getActivePlaybackRange === "function" ? getActivePlaybackRange() : null;
    if (playing && activeRange && activeRange.origin === "ab" && typeof stopPlayback === "function") {
      stopPlayback();
    }
  }

  function setRange(startOffset, endOffset) {
    const editorView = typeof getEditorView === "function" ? getEditorView() : null;
    if (!editorView || !abLoopRuntime || typeof abLoopRuntime.setPlanRange !== "function") return;
    const max = editorView.state.doc.length;
    const plan = abLoopRuntime.setPlanRange(startOffset, endOffset, max);
    if (!plan) {
      if (typeof showToast === "function") showToast("Select a longer region for A\u2013B.", 2200);
      return;
    }
    if (typeof refreshMarkers === "function") refreshMarkers();
    updateUi();
    refreshOptionsUi();
  }

  function setOptions(opts = {}) {
    if (!abLoopRuntime || typeof abLoopRuntime.setPlanOptions !== "function") return;
    if (!abLoopRuntime.setPlanOptions(opts)) return;
    updateUi();
    refreshOptionsUi();
  }

  function getSelectionSettings() {
    const settings = typeof getSettings === "function" ? getSettings() || {} : {};
    const loopFromUi = settings.selectionLoopElement ? Boolean(settings.selectionLoopElement.checked) : null;
    const suppressFromUi = settings.selectionSuppressElement ? Boolean(settings.selectionSuppressElement.checked) : null;
    const gchordsFromUi = settings.selectionGchordsElement ? Boolean(settings.selectionGchordsElement.checked) : null;
    const drumsFromUi = settings.selectionDrumsElement ? Boolean(settings.selectionDrumsElement.checked) : null;
    const mutedFromUi = settings.selectionMutedVoicesElement && typeof parseMutedVoiceSetting === "function"
      ? parseMutedVoiceSetting(String(settings.selectionMutedVoicesElement.value || ""))
      : null;
    return {
      loop: (loopFromUi != null) ? loopFromUi : Boolean(settings.playbackSelectionLoopEnabled),
      suppressRepeats: (suppressFromUi != null) ? suppressFromUi : (settings.playbackSelectionSuppressRepeats !== false),
      muteGchords: (gchordsFromUi != null) ? !gchordsFromUi : Boolean(settings.playbackSelectionMuteGchords),
      allowMidiDrums: (drumsFromUi != null) ? drumsFromUi : Boolean(settings.playbackSelectionAllowMidiDrums),
      mutedVoices: Array.isArray(mutedFromUi)
        ? mutedFromUi
        : (typeof parseMutedVoiceSetting === "function" ? parseMutedVoiceSetting(settings.playbackSelectionMutedVoices) : []),
    };
  }

  function getSelectionRange() {
    const editorView = typeof getEditorView === "function" ? getEditorView() : null;
    if (!editorView) return null;
    if (planContext().rawMode || planContext().payloadMode) return null;
    const sel = editorView.state.selection.main;
    const start = Math.min(sel.anchor, sel.head);
    const end = Math.max(sel.anchor, sel.head);
    if (end <= start) return null;
    return { startOffset: start, endOffset: end };
  }

  function withTempPlaybackFlags(flags, fn) {
    return selectionPlaybackRuntime.runWithTempFlags(flags, fn, globalObject);
  }

  function setPoint(which) {
    const editorView = typeof getEditorView === "function" ? getEditorView() : null;
    if (!editorView || !abLoopRuntime || typeof abLoopRuntime.setPoint !== "function") return;
    const pos = editorView.state.selection.main.head;
    const plan = abLoopRuntime.setPoint(which, pos);
    if (typeof refreshMarkers === "function") refreshMarkers();
    if (plan && Number.isFinite(plan.startOffset) && Number.isFinite(plan.endOffset) && plan.endOffset !== plan.startOffset) {
      setRange(plan.startOffset, plan.endOffset);
    } else {
      updateUi();
    }
  }

  function setFromSelection() {
    const editorView = typeof getEditorView === "function" ? getEditorView() : null;
    if (!editorView) return;
    const sel = editorView.state.selection.main;
    const start = Math.min(sel.anchor, sel.head);
    const end = Math.max(sel.anchor, sel.head);
    setRange(start, end);
  }

  async function playAbLoop() {
    const plan = abLoopRuntime && typeof abLoopRuntime.getPlan === "function" ? abLoopRuntime.getPlan() : null;
    if (plan && plan.revisionToken !== abLoopRuntime.getRevisionToken()) {
      clearPlan({ toast: true });
      return;
    }
    if (!isPlanValid()) {
      if (typeof showToast === "function") showToast("Set A and B first.", 2200);
      return;
    }
    if (planContext().rawMode || planContext().payloadMode) {
      if (typeof showToast === "function") showToast("Switch to tune mode to play A\u2013B.", 2400);
      return;
    }
    if (plan.mutedVoices && Object.values(plan.mutedVoices).some(Boolean)) {
      selectionPlaybackRuntime.setAbMutedVoiceMap(plan.mutedVoices);
    } else {
      selectionPlaybackRuntime.clearAbMutedVoices();
    }
    const text = typeof getEditorText === "function" ? getEditorText() : "";
    const hasRepeats = typeof hasRepeatTokensInSlice === "function"
      ? hasRepeatTokensInSlice(text, plan.startOffset, plan.endOffset)
      : false;
    if (!plan.suppressRepeats && hasRepeats) {
      if (typeof showToast === "function") showToast("Range crosses repeat; suppress repeats or adjust B.", 3600);
      return;
    }

    const prevStripChord = globalObject.__abcarusPlaybackStripChordSymbols;
    if (plan.muteGchords) globalObject.__abcarusPlaybackStripChordSymbols = true;
    try {
      setPlaybackRange({
        startOffset: plan.startOffset,
        endOffset: plan.endOffset,
        origin: "ab",
        loop: true,
      });
      await startPlaybackFromRange({ startOffset: plan.startOffset, endOffset: plan.endOffset, origin: "ab", loop: true });
    } finally {
      globalObject.__abcarusPlaybackStripChordSymbols = prevStripChord;
      selectionPlaybackRuntime.clearAbMutedVoices();
    }
  }

  async function playSelectionOnce() {
    const range = getSelectionRange();
    if (!range) return false;
    if (planContext().rawMode || planContext().payloadMode) return false;
    const selectionSettings = getSelectionSettings();
    const editorView = typeof getEditorView === "function" ? getEditorView() : null;
    const max = editorView ? editorView.state.doc.length : 0;
    const start = Math.max(0, Math.min(max, range.startOffset));
    const end = Math.max(start + 1, Math.min(max, range.endOffset));
    const sel = editorView.state.selection.main;
    const text = typeof getEditorText === "function" ? getEditorText() : "";
    const pendingRange = typeof getPlaybackRange === "function" ? getPlaybackRange() : null;
    if (pendingRange && pendingRange.origin === "score-note") return false;
    const isExplicitScoreSelection = Boolean(
      pendingRange
      && pendingRange.origin === "selection"
      && Number(pendingRange.startOffset) === start
      && Number(pendingRange.endOffset) === end
    );
    if (
      !isExplicitScoreSelection
      && typeof hasIntentionalSelectionPlaybackSpan === "function"
      && !hasIntentionalSelectionPlaybackSpan(text, start, end)
    ) return false;
    selectionPlaybackRuntime.captureSelection(sel);
    if (selectionSettings.mutedVoices && selectionSettings.mutedVoices.length) {
      selectionPlaybackRuntime.setAbMutedVoiceIds(selectionSettings.mutedVoices);
    } else {
      selectionPlaybackRuntime.clearAbMutedVoices();
    }
    if (!selectionSettings.suppressRepeats && typeof hasRepeatTokensInSlice === "function" && hasRepeatTokensInSlice(text, start, end)) {
      if (typeof showToast === "function") showToast("Range crosses repeat; consider enabling Suppress repeats.", 3600);
    }
    const prevStripChord = globalObject.__abcarusPlaybackStripChordSymbols;
    if (selectionSettings.muteGchords) globalObject.__abcarusPlaybackStripChordSymbols = true;
    try {
      if (typeof showToast === "function" && typeof buildSelectionPlaybackToast === "function") {
        showToast(buildSelectionPlaybackToast(selectionSettings), 2600);
      }
      setPlaybackRange({ startOffset: start, endOffset: end, origin: "selection", loop: selectionSettings.loop });
      await startPlaybackFromRange({ startOffset: start, endOffset: end, origin: "selection", loop: selectionSettings.loop });
    } finally {
      globalObject.__abcarusPlaybackStripChordSymbols = prevStripChord;
      selectionPlaybackRuntime.clearAbMutedVoices();
    }
    return true;
  }

  return {
    clearPlan,
    getSelectionRange,
    getSelectionSettings,
    isPlanValid,
    playAbLoop,
    playSelectionOnce,
    refreshOptionsUi,
    setFromSelection,
    setOptions,
    setPoint,
    setRange,
    toggleOptionsPopover,
    updateUi,
    withTempPlaybackFlags,
  };
}

export {
  createAbSelectionPlaybackController,
};
