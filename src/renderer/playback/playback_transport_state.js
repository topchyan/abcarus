const PLAYBACK_TRACE_LIMIT = 2000;

function defaultPlaybackMeta() {
  return { drumInsertAtLine: null, drumLineCount: 0 };
}

function clonePlaybackRange(r) {
  if (!r || typeof r !== "object") {
    return { startOffset: 0, endOffset: null, origin: "cursor", loop: false, suppressRepeats: null };
  }
  const range = {
    startOffset: Number(r.startOffset) || 0,
    endOffset: (r.endOffset == null) ? null : Number(r.endOffset),
    origin: r.origin || "cursor",
    loop: Boolean(r.loop),
    suppressRepeats: (typeof r.suppressRepeats === "boolean") ? Boolean(r.suppressRepeats) : null,
  };
  if (Number.isFinite(Number(r.loopGapMs))) {
    range.loopGapMs = Math.max(0, Math.min(5000, Math.round(Number(r.loopGapMs))));
  }
  return range;
}

function createPlaybackTransportState() {
  const state = {
    playbackRange: {
      startOffset: 0,
      endOffset: null,
      origin: "cursor",
      loop: false,
    },
    activePlaybackRange: null,
    activePlaybackEndAbcOffset: null,
    activePlaybackEndSymbol: null,
    activeLoopRange: null,
    playbackStartArmed: false,
    playbackRunId: 0,
    lastTraceRunId: 0,
    lastTracePlaybackIdx: null,
    lastTraceTimestamp: null,
    playbackTraceSeq: 0,

    practiceTempoMultiplier: 1,
    playbackLoopEnabled: false,
    playbackLoopGapMs: 0,
    playbackLoopFromMeasure: 0,
    playbackLoopToMeasure: 0,
    playbackLoopTuneId: null,
    currentPlaybackPlan: null,
    pendingPlaybackPlan: null,
    playbackSkipGchordsOnce: false,
    playbackIgnoreRepeatsOnce: false,
    transportPlayheadOffset: 0,
    transportJumpHighlightActive: false,
    suppressTransportJumpClearOnce: false,

    player: null,
    playerConfig: null,
    isPlaying: false,
    isPaused: false,
    restartOnNextPlay: false,
    suppressOnEnd: false,
    desiredPlayerSpeed: 1,
    lastPlaybackIdx: null,
    lastRenderIdx: null,
    lastStartPlaybackIdx: 0,
    resumeStartIdx: null,
    pausedSelectionSignature: null,
    playbackState: null,
    playbackIndexOffset: 0,
    waitingForFirstNote: false,
    isPreviewing: false,

    lastPlaybackMeta: null,
    lastPlaybackPayloadCache: null,
    lastPreparedPlaybackKey: null,
    playbackNoteTrace: [],
    playbackParseErrors: [],
    playbackSanitizeWarnings: [],
    lastPlaybackTuneInfo: null,
    lastPlaybackOnIstart: null,
    lastPlaybackHasParts: false,
    lastPlaybackChordOnBarError: false,
    lastPlaybackMidiDrumVoiceCompatSeen: false,
    lastPlaybackMeterMismatchWarning: null,
    lastPlaybackRepeatShortBarWarning: null,
    lastPlaybackKeyOrderWarning: null,
    playbackStartToken: 0,
    lastPlaybackGuardMessage: "",
    lastPlaybackAbortMessage: "",
    lastPlaybackException: null,
    playbackNeedsReprepare: false,
  };

  state.cloneRange = clonePlaybackRange;

  state.setRange = (next) => {
    state.playbackRange = clonePlaybackRange(next);
    return state.playbackRange;
  };

  state.appendTrace = (evt) => {
    if (!evt) return;
    state.playbackNoteTrace.push(evt);
    if (state.playbackNoteTrace.length > PLAYBACK_TRACE_LIMIT) {
      state.playbackNoteTrace = state.playbackNoteTrace.slice(state.playbackNoteTrace.length - PLAYBACK_TRACE_LIMIT);
    }
  };

  state.clearTrace = () => {
    state.playbackNoteTrace = [];
  };

  state.getTrace = () => state.playbackNoteTrace.slice();

  state.bumpStartToken = () => {
    state.playbackStartToken += 1;
    return state.playbackStartToken;
  };

  state.beginStartAttempt = () => {
    return state.bumpStartToken();
  };

  state.abortStartAttempt = (token, message) => {
    if (token !== state.playbackStartToken) return false;
    state.lastPlaybackAbortMessage = String(message || "");
    state.markIdle();
    return true;
  };

  state.setWaitingForFirstNote = (next = true) => {
    state.waitingForFirstNote = Boolean(next);
  };

  state.stopPlayer = ({ onlyWhenActive = false } = {}) => {
    if (!state.player || typeof state.player.stop !== "function") return false;
    if (onlyWhenActive && !state.isPlaying && !state.isPaused && !state.waitingForFirstNote) return false;
    state.suppressOnEnd = true;
    try { state.player.stop(); } catch {}
    return true;
  };

  state.clearActiveScope = ({ clearLoop = true, clearPendingPlan = true, clearCurrentPlan = true } = {}) => {
    state.resumeStartIdx = null;
    state.activePlaybackRange = null;
    state.activePlaybackEndAbcOffset = null;
    state.activePlaybackEndSymbol = null;
    if (clearLoop) state.activeLoopRange = null;
    state.playbackStartArmed = false;
    if (clearCurrentPlan) state.currentPlaybackPlan = null;
    if (clearPendingPlan) state.pendingPlaybackPlan = null;
  };

  state.markIdle = ({ needsReprepare = false, clearPreview = false } = {}) => {
    state.isPlaying = false;
    state.isPaused = false;
    state.waitingForFirstNote = false;
    if (clearPreview) state.isPreviewing = false;
    if (needsReprepare) state.playbackNeedsReprepare = true;
  };

  state.resetAfterGuardStop = (message) => {
    state.lastPlaybackGuardMessage = String(message || "");
    state.bumpStartToken();
    const wasSelectionOrigin = state.activePlaybackRange && state.activePlaybackRange.origin === "selection";
    state.stopPlayer({ onlyWhenActive: true });
    state.markIdle();
    state.clearActiveScope();
    return { wasSelectionOrigin };
  };

  state.resetForDocumentPlaybackChange = () => {
    state.bumpStartToken();
    state.stopPlayer();
    state.suppressOnEnd = false;
    state.markIdle({ needsReprepare: true, clearPreview: true });
    state.restartOnNextPlay = false;
    state.lastPlaybackIdx = null;
    state.lastRenderIdx = null;
    state.lastStartPlaybackIdx = 0;
    state.pausedSelectionSignature = null;
    state.playbackState = null;
    state.playbackIndexOffset = 0;
    state.lastPlaybackException = null;
    state.clearActiveScope();
  };

  state.resetAfterExplicitStop = ({ transportPlayheadOffset = 0 } = {}) => {
    state.bumpStartToken();
    const wasSelectionOrigin = state.activePlaybackRange && state.activePlaybackRange.origin === "selection";
    state.stopPlayer({ onlyWhenActive: true });
    state.markIdle({ needsReprepare: true });
    state.restartOnNextPlay = false;
    state.transportPlayheadOffset = Math.max(0, Number(transportPlayheadOffset) || 0);
    state.transportJumpHighlightActive = false;
    state.suppressTransportJumpClearOnce = false;
    state.pausedSelectionSignature = null;
    state.clearActiveScope({ clearLoop: false, clearPendingPlan: false });
    return { wasSelectionOrigin };
  };

  state.consumePlaybackEnd = () => {
    if (state.suppressOnEnd) return { ignored: true, reason: "suppressed" };
    if (state.isPreviewing) {
      state.isPreviewing = false;
      return { ignored: true, reason: "preview" };
    }
    const wasSelectionOrigin = state.activePlaybackRange && state.activePlaybackRange.origin === "selection";
    const shouldLoop = Boolean(state.activePlaybackRange && state.activePlaybackRange.loop);
    const loopRange = shouldLoop ? (state.activeLoopRange || state.activePlaybackRange) : null;
    state.markIdle();
    if (!shouldLoop) {
      state.restartOnNextPlay = true;
      state.clearActiveScope();
    }
    return {
      ignored: false,
      wasSelectionOrigin,
      shouldLoop,
      loopRange,
    };
  };

  state.activateRangeForStart = ({ range, endSymbol, startSymbol } = {}) => {
    state.activePlaybackRange = range;
    state.activePlaybackEndSymbol = endSymbol || null;
    state.activePlaybackEndAbcOffset = (state.activePlaybackEndSymbol && Number.isFinite(state.activePlaybackEndSymbol.istart))
      ? Number(state.activePlaybackEndSymbol.istart)
      : null;
    if (
      state.activePlaybackEndSymbol
      && startSymbol
      && Number.isFinite(state.activePlaybackEndSymbol.istart)
      && Number.isFinite(startSymbol.istart)
      && state.activePlaybackEndSymbol.istart <= startSymbol.istart
    ) {
      state.activePlaybackEndSymbol = null;
      state.activePlaybackEndAbcOffset = null;
    }
    if (range && range.loop) {
      state.activeLoopRange = {
        startOffset: Number(range.startOffset) || 0,
        endOffset: (range.endOffset == null) ? null : Number(range.endOffset),
        origin: String(range.origin || "focus"),
        loop: true,
        ...(Number.isFinite(Number(range.loopGapMs))
          ? { loopGapMs: Math.max(0, Math.min(5000, Math.round(Number(range.loopGapMs)))) }
          : {}),
      };
    } else {
      state.activeLoopRange = null;
    }
    state.playbackRunId += 1;
    state.lastTraceRunId = state.playbackRunId;
    state.lastTracePlaybackIdx = null;
    state.lastTraceTimestamp = null;
    state.playbackTraceSeq = 0;
    state.playbackStartArmed = true;
  };

  state.finishStartAttempt = () => {
    state.playbackStartArmed = false;
  };

  state.markPreparedStart = (startSymbol) => {
    state.lastStartPlaybackIdx = startSymbol && Number.isFinite(startSymbol.istart) ? startSymbol.istart : 0;
    state.lastPlaybackIdx = null;
    state.lastRenderIdx = null;
    state.resumeStartIdx = null;
    state.suppressOnEnd = true;
    state.restartOnNextPlay = false;
  };

  state.markPlayingStarted = () => {
    state.isPlaying = true;
    state.isPaused = false;
    state.pausedSelectionSignature = null;
  };

  state.consumeRestartOnNextPlay = () => {
    if (!state.restartOnNextPlay) return false;
    state.restartOnNextPlay = false;
    return true;
  };

  state.allowPlaybackEnd = () => {
    state.suppressOnEnd = false;
  };

  state.pause = ({ selectionSignature = "" } = {}) => {
    state.resumeStartIdx = Number.isFinite(state.lastPlaybackIdx) ? state.lastPlaybackIdx : state.lastStartPlaybackIdx;
    state.isPlaying = false;
    state.isPaused = true;
    state.waitingForFirstNote = false;
    state.pausedSelectionSignature = String(selectionSignature || "");
  };

  state.stopForPreview = () => {
    state.markIdle();
  };

  state.beginPreview = () => {
    state.isPreviewing = true;
  };

  state.endPreview = () => {
    state.isPreviewing = false;
  };

  state.consumeFirstNoteStart = (on) => {
    if (!on || !state.waitingForFirstNote) return false;
    state.waitingForFirstNote = false;
    return true;
  };

  state.getCachedPayload = (key) => {
    if (!state.lastPlaybackPayloadCache || state.lastPlaybackPayloadCache.key !== key) return null;
    state.lastPlaybackMeta = state.lastPlaybackPayloadCache.meta || defaultPlaybackMeta();
    return {
      text: state.lastPlaybackPayloadCache.text,
      offset: state.lastPlaybackPayloadCache.offset,
      meta: state.lastPlaybackMeta,
    };
  };

  state.storePayloadCache = (key, payload, meta = defaultPlaybackMeta()) => {
    state.lastPlaybackMeta = meta || defaultPlaybackMeta();
    state.lastPlaybackPayloadCache = {
      key,
      text: payload && payload.text,
      offset: payload && payload.offset,
      meta: state.lastPlaybackMeta,
    };
    state.lastPreparedPlaybackKey = key;
  };

  state.clearPayloadCache = () => {
    state.lastPlaybackPayloadCache = null;
  };

  state.setPayloadMeta = (meta = defaultPlaybackMeta()) => {
    state.lastPlaybackMeta = meta || defaultPlaybackMeta();
  };

  state.clearPreparedPlaybackKey = () => {
    state.lastPreparedPlaybackKey = null;
  };

  state.resetPayloadDiagnostics = () => {
    state.playbackSanitizeWarnings = [];
    state.lastPlaybackKeyOrderWarning = null;
    state.lastPlaybackMeterMismatchWarning = null;
    state.lastPlaybackRepeatShortBarWarning = null;
  };

  state.setSanitizeWarnings = (warnings) => {
    state.playbackSanitizeWarnings = Array.isArray(warnings) ? warnings.slice(0, 200) : [];
  };

  state.addSanitizeWarning = (warning) => {
    if (!warning) return;
    state.playbackSanitizeWarnings.push(warning);
  };

  state.recordKeyOrderWarning = (warning) => {
    state.lastPlaybackKeyOrderWarning = warning || null;
    if (warning) state.addSanitizeWarning(warning);
  };

  state.recordMeterMismatchWarning = (warning) => {
    state.lastPlaybackMeterMismatchWarning = warning || null;
    if (warning) state.addSanitizeWarning(warning);
  };

  state.recordRepeatShortBarWarning = (warning) => {
    state.lastPlaybackRepeatShortBarWarning = warning || null;
    if (warning) state.addSanitizeWarning(warning);
  };

  return state;
}

export {
  clonePlaybackRange,
  createPlaybackTransportState,
};
