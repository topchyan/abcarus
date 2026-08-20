export function safeString(value, maxLen = 250000) {
  const s = String(value == null ? "" : value);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}\n\n…(truncated ${s.length - maxLen} chars)…`;
}

export function safeJsonStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (k, v) => {
      if (typeof v === "object" && v) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      if (typeof v === "string" && v.length > 250000) return safeString(v);
      return v;
    },
    2
  );
}

export async function buildDebugDumpSnapshot({
  reason = "",
  api = null,
  windowRef = null,
  activeTuneMeta = null,
  currentDoc = null,
  safeBasename = (path) => String(path || ""),
  debugLogBuffer = [],
  recentActions = [],
  editorView = null,
  computeHeaderPresence = null,
  headerDirty = false,
  headerCollapsed = false,
  getEditorValue = () => "",
  getHeaderEditorValue = () => "",
  getPlaybackPayload = () => ({ text: "", offset: 0 }),
  lastPlaybackPayloadCache = null,
  followPipelineVersion = null,
  isPlaying = false,
  isPaused = false,
  waitingForFirstNote = false,
  followPlayback = false,
  followVoiceId = null,
  followVoiceIndex = null,
  playbackState = null,
  practiceTempoMultiplier = null,
  playbackLoopEnabled = false,
  playbackLoopFromMeasure = 0,
  playbackLoopToMeasure = 0,
  clampInt = (value) => value,
  soundfontName = null,
  soundfontSource = null,
  soundfontReadyName = null,
  lastSoundfontApplied = null,
  playbackIndexOffset = 0,
  playbackRange = null,
  activePlaybackRange = null,
  activePlaybackEndAbcOffset = null,
  lastStartPlaybackIdx = null,
  resumeStartIdx = null,
  desiredPlayerSpeed = null,
  currentPlaybackPlan = null,
  pendingPlaybackPlan = null,
  lastPlaybackGuardMessage = null,
  lastPlaybackAbortMessage = null,
  lastPlaybackException = null,
  clonePlaybackRange = (range) => range,
  playbackNoteTrace = [],
  playbackParseErrors = [],
  playbackSanitizeWarnings = [],
  lastRhythmErrorSuggestion = null,
  lastRenderPayload = null,
  barMismatchMarkers = [],
  errorEntries = [],
  activeErrorHighlight = null,
} = {}) {
  const win = windowRef || (typeof window !== "undefined" ? window : null);
  let aboutInfo = null;
  if (api && typeof api.getAboutInfo === "function") {
    try { aboutInfo = await api.getAboutInfo(); } catch {}
  }

  const ctxPath = (activeTuneMeta && activeTuneMeta.path)
    ? activeTuneMeta.path
    : (currentDoc && currentDoc.path ? currentDoc.path : null);
  const ctxBasename = (activeTuneMeta && activeTuneMeta.basename)
    ? activeTuneMeta.basename
    : (ctxPath ? safeBasename(ctxPath) : null);
  const ctxX = (activeTuneMeta && activeTuneMeta.xNumber != null) ? activeTuneMeta.xNumber : null;
  const ctxTitle = (activeTuneMeta && activeTuneMeta.title) ? activeTuneMeta.title : null;
  const ctxId = (activeTuneMeta && activeTuneMeta.id) ? activeTuneMeta.id : null;
  const ctxLabel = (() => {
    const filePart = ctxBasename || (ctxPath ? safeBasename(ctxPath) : "");
    const xPart = ctxX != null ? `X:${ctxX}` : "";
    const titlePart = ctxTitle ? String(ctxTitle).trim() : "";
    const mid = [xPart, titlePart].filter(Boolean).join(" ");
    return [filePart, mid].filter(Boolean).join(" — ").trim() || null;
  })();

  const playbackDebug = (win && win.__abcarusPlaybackDebug && typeof win.__abcarusPlaybackDebug === "object")
    ? win.__abcarusPlaybackDebug
    : null;

  const playbackPayload = (() => {
    try {
      if (lastPlaybackPayloadCache && lastPlaybackPayloadCache.text) {
        return {
          text: safeString(lastPlaybackPayloadCache.text, 350000),
          offset: lastPlaybackPayloadCache.offset || 0,
          cached: true,
        };
      }
      const p = getPlaybackPayload();
      return {
        text: safeString(p && p.text ? p.text : "", 350000),
        offset: p && p.offset ? p.offset : 0,
        cached: false,
      };
    } catch (e) {
      return { error: (e && e.message) ? e.message : String(e) };
    }
  })();


  return {
    kind: "abcarus-debug-dump",
    createdAt: new Date().toISOString(),
    privacyNotice: "Contains active ABC/header text and absolute local file paths. Review or redact before sharing.",
    reason: reason ? String(reason) : null,
    context: {
      label: ctxLabel,
      filePath: ctxPath,
      fileBasename: ctxBasename,
      tuneId: ctxId,
      xNumber: ctxX,
      title: ctxTitle,
    },
    about: aboutInfo,
    debugLog: Array.isArray(debugLogBuffer) ? debugLogBuffer.slice() : [],
    recentActions: Array.isArray(recentActions) ? recentActions.slice(-20) : [],
    selection: editorView ? {
      anchor: editorView.state.selection.main.anchor,
      head: editorView.state.selection.main.head,
    } : null,
    document: {
      currentDocPath: currentDoc ? (currentDoc.path || null) : null,
      currentDocDirty: currentDoc ? Boolean(currentDoc.dirty) : null,
      activeTuneMeta: activeTuneMeta ? {
        id: activeTuneMeta.id || null,
        path: activeTuneMeta.path || null,
        basename: activeTuneMeta.basename || null,
        xNumber: activeTuneMeta.xNumber || null,
        title: activeTuneMeta.title || null,
        startOffset: activeTuneMeta.startOffset || null,
        endOffset: activeTuneMeta.endOffset || null,
        startLine: activeTuneMeta.startLine || null,
        endLine: activeTuneMeta.endLine || null,
      } : null,
      header: {
        presence: (typeof computeHeaderPresence === "function") ? computeHeaderPresence() : null,
        dirty: Boolean(headerDirty),
        collapsed: Boolean(headerCollapsed),
      },
      editorText: safeString(getEditorValue(), 350000),
      headerText: safeString(getHeaderEditorValue(), 250000),
    },
    playback: {
      followPipelineVersion,
      isPlaying: Boolean(isPlaying),
      isPaused: Boolean(isPaused),
      waitingForFirstNote: Boolean(waitingForFirstNote),
      followPlayback: Boolean(followPlayback),
      followVoiceId,
      followVoiceIndex,
      preferredVoiceId: playbackState ? (playbackState.preferredVoiceId || null) : null,
      preferredVoiceIndex: playbackState && Number.isFinite(playbackState.preferredVoiceIndex) ? playbackState.preferredVoiceIndex : null,
      voiceTimelineKeys: (playbackState && playbackState.voiceTimeline) ? {
        byId: (playbackState.voiceTimeline.byId && typeof playbackState.voiceTimeline.byId === "object")
          ? Object.keys(playbackState.voiceTimeline.byId).slice(0, 50)
          : [],
        byIndex: (playbackState.voiceTimeline.byIndex && typeof playbackState.voiceTimeline.byIndex === "object")
          ? Object.keys(playbackState.voiceTimeline.byIndex).slice(0, 50)
          : [],
      } : null,
      practiceTempoMultiplier: Number.isFinite(Number(practiceTempoMultiplier)) ? Number(practiceTempoMultiplier) : null,
      playbackLoop: {
        enabled: Boolean(playbackLoopEnabled),
        fromMeasure: clampInt(playbackLoopFromMeasure, 0, 100000, 0),
        toMeasure: clampInt(playbackLoopToMeasure, 0, 100000, 0),
      },
      soundfontName: soundfontName || null,
      soundfontSource: soundfontSource || null,
      soundfontReadyName: soundfontReadyName || null,
      lastSoundfontApplied: lastSoundfontApplied || null,
      playbackIndexOffset,
      playbackRange: clonePlaybackRange(playbackRange),
      activePlaybackRange: activePlaybackRange ? clonePlaybackRange(activePlaybackRange) : null,
      activePlaybackEndAbcOffset,
      lastStartPlaybackIdx,
      resumeStartIdx,
      desiredPlayerSpeed: Number.isFinite(Number(desiredPlayerSpeed)) ? Number(desiredPlayerSpeed) : null,
      currentPlaybackPlan,
      pendingPlaybackPlan,
      lastPlaybackGuardMessage,
      lastPlaybackAbortMessage,
      lastPlaybackException: lastPlaybackException ? {
        phase: lastPlaybackException.phase || null,
        message: lastPlaybackException.message || null,
        stack: lastPlaybackException.stack || null,
      } : null,
      payload: playbackPayload,
      debugState: playbackDebug && typeof playbackDebug.getState === "function" ? playbackDebug.getState() : null,
      timeline: playbackDebug && typeof playbackDebug.getTimeline === "function" ? playbackDebug.getTimeline() : null,
      trace: playbackDebug && typeof playbackDebug.getTrace === "function"
        ? playbackDebug.getTrace()
        : (Array.isArray(playbackNoteTrace) ? playbackNoteTrace.slice() : []),
      parseErrors: Array.isArray(playbackParseErrors) ? playbackParseErrors.slice(0, 200) : null,
      sanitizeWarnings: Array.isArray(playbackSanitizeWarnings) ? playbackSanitizeWarnings.slice(0, 200) : null,
      lastRhythmErrorSuggestion,
    },
    render: {
      lastRenderPayload: lastRenderPayload ? {
        offset: lastRenderPayload.offset || 0,
        text: lastRenderPayload.text ? safeString(lastRenderPayload.text, 350000) : "",
      } : null,
      barMismatchMarkers: Array.isArray(barMismatchMarkers) ? {
        count: barMismatchMarkers.length,
        first: barMismatchMarkers.slice(0, 20),
      } : null,
    },
    errors: {
      count: Array.isArray(errorEntries) ? errorEntries.length : null,
      activeHighlight: activeErrorHighlight ? {
        id: activeErrorHighlight.id,
        from: activeErrorHighlight.from,
        to: activeErrorHighlight.to,
        tuneId: activeErrorHighlight.tuneId,
        filePath: activeErrorHighlight.filePath,
        message: activeErrorHighlight.message,
        messageKey: activeErrorHighlight.messageKey,
        lastSvgRenderIdx: activeErrorHighlight.lastSvgRenderIdx,
      } : null,
      entries: Array.isArray(errorEntries)
        ? errorEntries.slice(0, 200).map((e) => ({
          message: e.message,
          loc: e.loc || null,
          tuneId: e.tuneId || null,
          filePath: e.filePath || null,
          xNumber: e.xNumber || null,
          title: e.title || null,
          count: e.count || 1,
        }))
        : null,
    },
  };
}
