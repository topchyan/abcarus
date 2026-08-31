function createPlaybackTransportController({
  transport,
  selectionRuntime,
  getEditorView,
  getEditorText = () => "",
  findMeasureStartOffsetByNumber = () => null,
  getFocusModeEnabled,
  normalizeFocusLoopBoundsForPlayback,
  computeFocusPlaybackPlanFromCurrentState,
  startPlaybackFromRange,
  startPlaybackAtIndex,
  pausePlayback,
  playSelectionOnce,
  setPracticeBarHighlight,
  clearSvgPracticeBarHighlight,
  playbackGuardError,
  stopPlaybackFromGuard,
  setStatus,
  updatePlayButton,
  clearNoteSelection,
  resetPlaybackUiState,
  setSoundfontCaption,
  showToast,
} = {}) {
  function getEditorPlayStartOffset() {
    const editorView = getEditorView();
    if (!editorView) return 0;
    const sel = editorView.state.selection && editorView.state.selection.main
      ? editorView.state.selection.main
      : null;
    if (!sel) return 0;
    const max = editorView.state.doc.length;
    const anchor = Math.max(0, Math.min(Number(sel.anchor) || 0, max));
    const head = Math.max(0, Math.min(Number(sel.head) || 0, max));
    return Math.min(anchor, head);
  }

  function getEditorMeasureStartOffset() {
    const editorView = getEditorView();
    if (!editorView) return 0;
    const text = String(getEditorText() || "");
    const max = editorView.state.doc.length;
    if (!text || max <= 0) return 0;
    const cursor = Math.max(0, Math.min(getEditorPlayStartOffset(), max));
    const len = text.length;

    const leftText = text.slice(0, cursor + 1);
    const partMatches = [...leftText.matchAll(/(?:^|\n)\s*\[P:[^\]\n]*\]\s*(?:\n|$)/g)];
    const sectionStart = partMatches.length
      ? Math.min(cursor, partMatches[partMatches.length - 1].index + partMatches[partMatches.length - 1][0].length)
      : 0;

    let bar = -1;
    if (cursor < len && text[cursor] === "|") {
      bar = cursor;
    } else {
      bar = text.lastIndexOf("|", Math.max(0, cursor - 1));
    }
    if (bar < sectionStart) bar = -1;

    let start = 0;
    if (bar >= 0) {
      start = bar + 1;
    } else {
      const first = findMeasureStartOffsetByNumber(text.slice(sectionStart), 1);
      start = Number.isFinite(first) ? sectionStart + Number(first) : sectionStart;
    }

    while (start < len && /[\s|:\]]/.test(text[start] || "")) start += 1;
    return Math.max(0, Math.min(start, max));
  }

  function getEditorSelectionSignature() {
    const editorView = getEditorView();
    if (!editorView) return "";
    const sel = editorView.state.selection && editorView.state.selection.main
      ? editorView.state.selection.main
      : null;
    if (!sel) return "";
    const max = editorView.state.doc.length;
    const anchor = Math.max(0, Math.min(Number(sel.anchor) || 0, max));
    const head = Math.max(0, Math.min(Number(sel.head) || 0, max));
    return `${anchor}:${head}`;
  }

  function resolveFocusPlanStartOffset(plan) {
    const plannedStart = Math.max(0, Number(plan && plan.startOffset) || 0);
    if (!transport.transportJumpHighlightActive) return plannedStart;
    const candidate = Number(transport.transportPlayheadOffset);
    if (!Number.isFinite(candidate) || candidate < plannedStart) return plannedStart;
    const rawEnd = plan && plan.endOffset;
    const end = rawEnd == null ? null : Number(rawEnd);
    if (Number.isFinite(end) && candidate >= end) return plannedStart;
    return Math.max(0, candidate);
  }

  function buildTransportPlaybackPlan() {
    const focusModeEnabled = getFocusModeEnabled();
    const tempoMultiplier = Number.isFinite(Number(transport.practiceTempoMultiplier))
      ? Number(transport.practiceTempoMultiplier)
      : 1;
    if (focusModeEnabled) {
      const focusResult = computeFocusPlaybackPlanFromCurrentState();
      if (!focusResult || !focusResult.ok || !focusResult.plan) {
        return {
          mode: "focus",
          invalid: true,
          invalidReason: focusResult && focusResult.reason ? String(focusResult.reason) : "Cannot resolve Focus playback scope.",
          rangeStart: Math.max(0, Number(transport.transportPlayheadOffset) || 0),
          rangeEnd: null,
          loopEnabled: false,
          tempoMultiplier,
          focusPlan: null,
        };
      }
      return {
        mode: "focus",
        invalid: false,
        invalidReason: "",
        rangeStart: resolveFocusPlanStartOffset(focusResult.plan),
        rangeEnd: focusResult.plan.endOffset,
        loopEnabled: Boolean(focusResult.plan.loop),
        tempoMultiplier,
        focusPlan: focusResult.plan,
      };
    }
    const playbackRange = transport.playbackRange || null;
    const scoreNoteStart = playbackRange && playbackRange.origin === "score-note"
      ? Number(playbackRange.startOffset)
      : NaN;
    return {
      mode: "transport",
      invalid: false,
      invalidReason: "",
      rangeStart: Number.isFinite(scoreNoteStart)
        ? Math.max(0, scoreNoteStart)
        : getEditorMeasureStartOffset(),
      rangeEnd: null,
      loopEnabled: false,
      tempoMultiplier,
    };
  }

  function shouldResumeFromPause() {
    if (!transport.isPaused) return false;
    if (getFocusModeEnabled()) return true;
    if (!transport.pausedSelectionSignature) return true;
    return getEditorSelectionSignature() === transport.pausedSelectionSignature;
  }

  function resolveFocusResumeStartOffset(plan, fallbackStartOffset, candidateResumeOffset) {
    const start = Math.max(0, Number(fallbackStartOffset) || 0);
    const rawEnd = plan && plan.rangeEnd;
    const end = rawEnd == null ? null : Number(rawEnd);
    const resume = Number(candidateResumeOffset);
    if (!Number.isFinite(resume) || resume < start) return start;
    if (Number.isFinite(end) && resume >= end) return start;
    return resume;
  }

  function getPausedResumeEditorOffset() {
    if (!shouldResumeFromPause()) return null;
    const derived = Number(transport.resumeStartIdx);
    if (Number.isFinite(derived)) {
      const editorOffset = Math.max(0, derived - (Number(transport.playbackIndexOffset) || 0));
      return Number.isFinite(editorOffset) ? editorOffset : null;
    }
    const rangeStart = transport.playbackRange ? Number(transport.playbackRange.startOffset) : NaN;
    return Number.isFinite(rangeStart) ? Math.max(0, rangeStart) : null;
  }

  function syncPendingPlaybackPlan() {
    transport.pendingPlaybackPlan = buildTransportPlaybackPlan();
  }

  function clonePlaybackRange(range) {
    return transport.cloneRange(range);
  }

  function setPlaybackRange(next) {
    const nextRange = clonePlaybackRange(next);

    if (transport.isPlaying) {
      if (transport.activePlaybackRange && transport.activePlaybackRange.loop && nextRange.startOffset !== transport.activePlaybackRange.startOffset) {
        stopPlaybackFromGuard("Looping PlaybackRange.startOffset mutated during playback.");
        return;
      }
      playbackGuardError("PlaybackRange updated while playing; change deferred until stop.");
      return;
    }

    transport.setRange(nextRange);
    if (nextRange.origin === "score-note") {
      transport.isPaused = false;
      transport.resumeStartIdx = null;
      transport.pausedSelectionSignature = null;
      transport.restartOnNextPlay = false;
      transport.pendingPlaybackPlan = null;
    }
  }

  function updatePlaybackRangeFromSelection(selection, origin, activeErrorHighlight = null) {
    const editorView = getEditorView();
    if (!selection || !editorView || transport.isPlaying) return;
    if (
      activeErrorHighlight
      && transport.playbackRange
      && transport.playbackRange.origin === "error"
      && transport.playbackRange.loop
    ) return;

    const max = editorView.state.doc.length;
    const main = selection.main || null;
    if (!main) return;
    const anchor = Math.max(0, Math.min(Number(main.anchor) || 0, max));
    const head = Math.max(0, Math.min(Number(main.head) || 0, max));
    const start = Math.min(anchor, head);
    const end = Math.max(anchor, head);
    const isRange = end > start;

    setPlaybackRange({
      startOffset: start,
      endOffset: isRange ? end : null,
      origin: origin || (isRange ? "selection" : "cursor"),
      loop: Boolean(activeErrorHighlight && transport.playbackRange.loop),
    });
  }

  function stopPlaybackForRestart() {
    if (transport.player && typeof transport.player.stop === "function") {
      transport.suppressOnEnd = true;
      try { transport.player.stop(); } catch {}
    }
    clearNoteSelection();
    resetPlaybackUiState();
  }

  function applyPlaybackPlanSpeed(plan) {
    const next = Number(plan && plan.tempoMultiplier);
    transport.desiredPlayerSpeed = (Number.isFinite(next) && next > 0) ? next : 1;
    if (transport.player && typeof transport.player.set_speed === "function") {
      try { transport.player.set_speed(transport.desiredPlayerSpeed); } catch {}
    }
  }

  function getResumeStartOffset(plan) {
    const focusModeEnabled = getFocusModeEnabled();
    const pausedResumeOffset = getPausedResumeEditorOffset();
    let startOffset = focusModeEnabled
      ? (Number.isFinite(pausedResumeOffset) ? pausedResumeOffset : getEditorPlayStartOffset())
      : (Number.isFinite(pausedResumeOffset) ? pausedResumeOffset : getEditorMeasureStartOffset());
    if (focusModeEnabled) {
      startOffset = resolveFocusResumeStartOffset(plan, plan.rangeStart, startOffset);
    }
    return startOffset;
  }

  function consumeCompletedPlaybackRestart() {
    return typeof transport.consumeRestartOnNextPlay === "function"
      ? transport.consumeRestartOnNextPlay()
      : false;
  }

  async function togglePlayPauseEffective() {
    const focusModeEnabled = getFocusModeEnabled();
    if (focusModeEnabled) {
      if (transport.isPlaying) {
        pausePlayback();
        return;
      }
      await transportPlay();
      return;
    }

    if (transport.isPlaying) {
      pausePlayback();
      return;
    }

    if (transport.isPaused) {
      normalizeFocusLoopBoundsForPlayback();
      const plan = buildTransportPlaybackPlan();
      if (plan && plan.invalid) {
        showToast(plan.invalidReason || "Cannot start Focus playback.", 3200);
        return;
      }
      applyPlaybackPlanSpeed(plan);
      await startPlaybackFromRange({
        startOffset: getResumeStartOffset(plan),
        endOffset: plan.rangeEnd,
        origin: focusModeEnabled ? "focus" : "transport",
        loop: plan.loopEnabled,
      });
      return;
    }

    const completed = consumeCompletedPlaybackRestart();
    if (completed && !focusModeEnabled) {
      applyPlaybackPlanSpeed(buildTransportPlaybackPlan());
      await startPlaybackAtIndex(0);
      return;
    }

    applyPlaybackPlanSpeed(transport.pendingPlaybackPlan || buildTransportPlaybackPlan());
    if (await playSelectionOnce()) return;

    const plan = transport.pendingPlaybackPlan || buildTransportPlaybackPlan();
    if (plan && plan.invalid) {
      transport.pendingPlaybackPlan = null;
      showToast(plan.invalidReason || "Cannot start Focus playback.", 3200);
      return;
    }
    transport.pendingPlaybackPlan = null;
    transport.currentPlaybackPlan = plan;
    applyPlaybackPlanSpeed(plan);
    await startPlaybackFromRange({
      startOffset: plan.rangeStart,
      endOffset: plan.rangeEnd,
      origin: focusModeEnabled ? "focus" : "transport",
      loop: plan.loopEnabled,
    });
  }

  async function transportStartOver() {
    const focusModeEnabled = getFocusModeEnabled();
    if (transport.isPlaying || transport.isPaused || transport.waitingForFirstNote || transport.playbackStartArmed) {
      stopPlaybackTransport();
    }
    if (focusModeEnabled) {
      normalizeFocusLoopBoundsForPlayback();
      const plan = buildTransportPlaybackPlan();
      if (plan && plan.invalid) {
        showToast(plan.invalidReason || "Cannot start Focus playback.", 3200);
        return;
      }
      applyPlaybackPlanSpeed(plan);
      await startPlaybackFromRange({
        startOffset: plan.rangeStart,
        endOffset: plan.rangeEnd,
        origin: "focus",
        loop: plan.loopEnabled,
      });
      return;
    }
    const editorView = getEditorView();
    if (editorView) {
      editorView.dispatch({ selection: { anchor: 0, head: 0 }, scrollIntoView: true });
    }
    applyPlaybackPlanSpeed(buildTransportPlaybackPlan());
    await startPlaybackAtIndex(0);
  }

  async function transportTogglePlayPause() {
    const focusModeEnabled = getFocusModeEnabled();
    if (transport.isPlaying) {
      pausePlayback();
      return;
    }
    if (transport.isPaused) {
      const plan = buildTransportPlaybackPlan();
      if (plan && plan.invalid) {
        showToast(plan.invalidReason || "Cannot start Focus playback.", 3200);
        return;
      }
      applyPlaybackPlanSpeed(plan);
      await startPlaybackFromRange({
        startOffset: getResumeStartOffset(plan),
        endOffset: plan.rangeEnd,
        origin: focusModeEnabled ? "focus" : "transport",
        loop: plan.loopEnabled,
      });
      return;
    }
    if (consumeCompletedPlaybackRestart() && !focusModeEnabled) {
      applyPlaybackPlanSpeed(buildTransportPlaybackPlan());
      await startPlaybackAtIndex(0);
      return;
    }
    const plan = buildTransportPlaybackPlan();
    applyPlaybackPlanSpeed(plan);
    await startPlaybackFromRange({
      startOffset: plan.rangeStart,
      endOffset: plan.rangeEnd,
      origin: "transport",
      loop: plan.loopEnabled,
    });
  }

  async function transportPlay() {
    const focusModeEnabled = getFocusModeEnabled();
    if (transport.isPlaying) return;
    if (focusModeEnabled) normalizeFocusLoopBoundsForPlayback();
    if (transport.isPaused) {
      const plan = buildTransportPlaybackPlan();
      if (plan && plan.invalid) {
        showToast(plan.invalidReason || "Cannot start Focus playback.", 3200);
        return;
      }
      applyPlaybackPlanSpeed(plan);
      await startPlaybackFromRange({
        startOffset: getResumeStartOffset(plan),
        endOffset: plan.rangeEnd,
        origin: focusModeEnabled ? "focus" : "transport",
        loop: plan.loopEnabled,
      });
      return;
    }
    const completed = consumeCompletedPlaybackRestart();
    if (completed && !focusModeEnabled) {
      applyPlaybackPlanSpeed(buildTransportPlaybackPlan());
      await startPlaybackAtIndex(0);
      return;
    }
    if (focusModeEnabled) {
      const plan = buildTransportPlaybackPlan();
      if (plan && plan.invalid) {
        showToast(plan.invalidReason || "Cannot start Focus playback.", 3200);
        return;
      }
      applyPlaybackPlanSpeed(plan);
      await startPlaybackFromRange({
        startOffset: plan.rangeStart,
        endOffset: plan.rangeEnd,
        origin: "focus",
        loop: plan.loopEnabled,
      });
      return;
    }
    applyPlaybackPlanSpeed(buildTransportPlaybackPlan());
    if (await playSelectionOnce()) return;
    const plan = buildTransportPlaybackPlan();
    await startPlaybackFromRange({
      startOffset: plan.rangeStart,
      endOffset: plan.rangeEnd,
      origin: "transport",
      loop: plan.loopEnabled,
    });
  }

  async function transportPause() {
    const focusModeEnabled = getFocusModeEnabled();
    if (transport.isPlaying) {
      pausePlayback();
      return;
    }
    if (transport.isPaused) {
      normalizeFocusLoopBoundsForPlayback();
      const plan = buildTransportPlaybackPlan();
      if (plan && plan.invalid) {
        showToast(plan.invalidReason || "Cannot start Focus playback.", 3200);
        return;
      }
      applyPlaybackPlanSpeed(plan);
      await startPlaybackFromRange({
        startOffset: getResumeStartOffset(plan),
        endOffset: plan.rangeEnd,
        origin: focusModeEnabled ? "focus" : "transport",
        loop: plan.loopEnabled,
      });
    }
  }

  function resetPlaybackState() {
    transport.resetForDocumentPlaybackChange();
    clearNoteSelection();
    resetPlaybackUiState();
    if (selectionRuntime.shouldRestoreSelection()) selectionRuntime.restoreSelection(getEditorView());
    selectionRuntime.clearSelectionCapture();
    updatePlayButton();
    setSoundfontCaption();
  }

  function stopPlaybackTransport() {
    const editorView = getEditorView();
    if (!transport.isPlaying && !transport.isPaused && !transport.waitingForFirstNote && editorView) {
      const sel = editorView.state.selection.main;
      if (sel && sel.anchor !== sel.head) {
        const len = editorView.state.doc.length;
        const pos = Math.max(0, Math.min(len, Math.min(sel.anchor, sel.head)));
        editorView.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: false });
        clearNoteSelection();
      }
    }

    let nextTransportStart = 0;
    if (getFocusModeEnabled()) {
      const focusResult = computeFocusPlaybackPlanFromCurrentState();
      if (focusResult && focusResult.ok && focusResult.plan && focusResult.plan.mode === "segment") {
        nextTransportStart = Math.max(0, Number(focusResult.plan.startOffset) || 0);
      }
    }
    const result = transport.resetAfterExplicitStop({ transportPlayheadOffset: nextTransportStart });
    setPracticeBarHighlight(null);
    clearSvgPracticeBarHighlight();
    setStatus("OK");
    updatePlayButton();
    clearNoteSelection();
    resetPlaybackUiState();
    setSoundfontCaption();

    if (result.wasSelectionOrigin) selectionRuntime.restoreSelection(editorView);
    selectionRuntime.clearSelectionCapture();

    if (!result.wasSelectionOrigin && editorView) {
      const sel = editorView.state.selection.main;
      if (sel && sel.anchor !== sel.head) {
        const len = editorView.state.doc.length;
        const pos = Math.max(0, Math.min(len, Math.min(sel.anchor, sel.head)));
        editorView.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: false });
      }
    }
  }

  return {
    applyPlaybackPlanSpeed,
    buildTransportPlaybackPlan,
    clonePlaybackRange,
    resetPlaybackState,
    setPlaybackRange,
    stopPlaybackForRestart,
    stopPlaybackTransport,
    syncPendingPlaybackPlan,
    togglePlayPauseEffective,
    transportPause,
    transportPlay,
    transportStartOver,
    transportTogglePlayPause,
    updatePlaybackRangeFromSelection,
  };
}

export { createPlaybackTransportController };
