import {
  buildPlaybackState,
  findPlaybackMeasureIndex,
  findPlaybackSymbolAtOrAfter,
  findPlaybackSymbolAtOrBefore,
  snapIstartToPlayable,
  upperBoundTime,
} from "./playback_state_model.js";
import { createAbLoopRuntime } from "./ab_loop_runtime.js";
import { createAbMarkerExtension } from "./ab_marker_extension.js";
import { createFollowHighlightSettings } from "./follow_highlight_settings.js";
import { createPlaybackTransportState } from "./playback_transport_state.js";
import { createSelectionPlaybackRuntime } from "./selection_playback_runtime.js";
import { createPlaybackComposition } from "./playback_composition.js";
import { expandRepeatsForPlayback } from "./repeat_expansion_model.js";
import {
  injectGchordOn,
  normalizeBlankLinesForPlayback,
  normalizeDollarLineBreaksForPlayback,
  normalizeLeadingInlineDirectivesForPlayback,
  normalizeReadableMidiDrumsForPlayback,
  sanitizeAbcForPlayback,
} from "./playback_payload_model.js";

const FOLLOW_PIPELINE_VERSION = "follow-2026-02-21-r3";

export function createPlaybackDomain({
  transport = createPlaybackTransportState(),
  selectionRuntime = createSelectionPlaybackRuntime(),
  abLoopRuntime = createAbLoopRuntime({ minLength: 2 }),
  documentRef = typeof document !== "undefined" ? document : null,
  clampNumber,
  getEditorLength = () => 0,
  getFocusModeEnabled = () => false,
  getPlaybackUiController = () => null,
  getFocusModeController = () => null,
  getSoundfontController = () => null,
} = {}) {
  let followEnabled = true;
  const followHighlightSettings = createFollowHighlightSettings({
    documentRef,
    clampNumber,
  });
  const controllers = {
    abSelection: null,
    autoScroll: null,
    drumPreview: null,
    follow: null,
    payload: null,
    player: null,
    prepare: null,
    start: null,
    transport: null,
    focus: null,
    soundfont: null,
    ui: null,
  };

  function attach(next = {}) {
    for (const key of Object.keys(controllers)) {
      if (next[key]) controllers[key] = next[key];
    }
  }

  function requireController(name) {
    const controller = controllers[name];
    if (!controller) throw new Error(`Playback controller is not attached: ${name}`);
    return controller;
  }

  function clampInt(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }

  function isFocusBoundedScope() {
    const focusController = getFocusController();
    const focusEnabled = focusController && typeof focusController.isEnabled === "function"
      ? focusController.isEnabled()
      : Boolean(getFocusModeEnabled());
    return focusEnabled
      && (
        clampInt(transport.playbackLoopFromMeasure, 0, 100000, 0) > 0
        || clampInt(transport.playbackLoopToMeasure, 0, 100000, 0) > 0
      );
  }

  function getScopedSettingsForOrigin(origin) {
    const settings = requireController("abSelection").getSelectionSettings();
    if (String(origin || "") !== "focus" || !isFocusBoundedScope()) return settings;
    return {
      ...settings,
      suppressRepeats: true,
    };
  }

  function withScopedOrigin(settings, origin) {
    return {
      ...(settings || {}),
      origin: String(origin || ""),
    };
  }

  function toDerivedOffset(editorOffset) {
    const raw = Number(editorOffset);
    if (!Number.isFinite(raw)) return null;
    return raw + (transport.playbackIndexOffset || 0);
  }

  function toEditorOffset(derivedOffset) {
    const raw = Number(derivedOffset);
    if (!Number.isFinite(raw)) return null;
    return Math.max(0, raw - (transport.playbackIndexOffset || 0));
  }

  function getUiController() {
    return controllers.ui || getPlaybackUiController();
  }

  function getFocusController() {
    return controllers.focus || getFocusModeController();
  }

  function getSoundfont() {
    return controllers.soundfont || getSoundfontController();
  }

  const domainApi = {
    clearAbPlan: (options) => requireController("abSelection").clearPlan(options),
    clearSelectionCapture: () => selectionRuntime.clearSelectionCapture(),
    clearPlans() {
      transport.pendingPlaybackPlan = null;
      transport.currentPlaybackPlan = null;
    },
    appendTrace: (event) => transport.appendTrace(event),
    applyPlanSpeed: (plan) => requireController("transport").applyPlaybackPlanSpeed(plan),
    attach,
    initialize(options) {
      attach(createPlaybackComposition({
        ...options,
        domain: domainApi,
        transport,
        selectionRuntime,
        abLoopRuntime,
      }));
    },
    buildState: (firstSymbol) => buildPlaybackState(firstSymbol, {
      editorLength: getEditorLength(),
      playbackIndexOffset: transport.playbackIndexOffset,
    }),
    buildTransportPlan: () => requireController("transport").buildTransportPlaybackPlan(),
    cancelAutoScroll: () => requireController("autoScroll").cancelPlaybackAutoScroll(),
    clearNoteOnElements: () => requireController("follow").clearPlaybackNoteOnEls(),
    cloneRange: (range) => requireController("transport").clonePlaybackRange(range),
    ensurePlayer: () => requireController("player").ensurePlayer(),
    warmupPlayback: (startSymbol) => requireController("player").warmupPlayback(startSymbol),
    ensureSoundfontLoaded: () => {
      const controller = getSoundfont();
      return controller ? controller.ensureLoaded() : Promise.resolve();
    },
    ensureSoundfontReady: () => {
      const controller = getSoundfont();
      return controller ? controller.ensureReady() : Promise.resolve();
    },
    findMeasureIndex: (index) => findPlaybackMeasureIndex(transport.playbackState, index),
    findSymbolAtOrAfter: (index) => findPlaybackSymbolAtOrAfter(transport.playbackState, index),
    findSymbolAtOrBefore: (index) => findPlaybackSymbolAtOrBefore(transport.playbackState, index),
    getFollowPipelineVersion: () => FOLLOW_PIPELINE_VERSION,
    getFollowPlayheadPad: followHighlightSettings.getPlayheadPad,
    getFollowPlayheadShift: followHighlightSettings.getPlayheadShift,
    getFollowPlayheadWidth: followHighlightSettings.getPlayheadWidth,
    getPayload: () => requireController("payload").getPlaybackPayload(),
    getPayloadTransforms: () => ({
      expandRepeatsForPlayback,
      injectGchordOn,
      normalizeBlankLinesForPlayback,
      normalizeDollarLineBreaksForPlayback,
      normalizeLeadingInlineDirectivesForPlayback,
      normalizeReadableMidiDrumsForPlayback,
      sanitizeAbcForPlayback,
    }),
    getActiveRange: () => transport.activePlaybackRange,
    getFollowVoiceId: () => requireController("follow").getFollowVoiceId(),
    getFollowVoiceIndex: () => requireController("follow").getFollowVoiceIndex(),
    isFollowEnabled: () => followEnabled,
    getRange: () => transport.playbackRange,
    getScopedSettingsForOrigin,
    getSelectionSettings: () => requireController("abSelection").getSelectionSettings(),
    getSelectionRange: () => requireController("abSelection").getSelectionRange(),
    getSourceKey: () => requireController("payload").getPlaybackSourceKey(),
    getDiagnosticsSnapshot: () => ({
      activePlaybackEndAbcOffset: transport.activePlaybackEndAbcOffset,
      activePlaybackRange: transport.activePlaybackRange,
      currentPlaybackPlan: transport.currentPlaybackPlan,
      desiredPlayerSpeed: transport.desiredPlayerSpeed,
      soundfontReleaseScale: transport.soundfontReleaseScale,
      lastPlaybackAbortMessage: transport.lastPlaybackAbortMessage,
      lastPlaybackException: transport.lastPlaybackException,
      lastPlaybackGuardMessage: transport.lastPlaybackGuardMessage,
      lastPlaybackIdx: transport.lastPlaybackIdx,
      lastPlaybackPayloadCache: transport.lastPlaybackPayloadCache,
      lastStartPlaybackIdx: transport.lastStartPlaybackIdx,
      pendingPlaybackPlan: transport.pendingPlaybackPlan,
      playbackIndexOffset: transport.playbackIndexOffset,
      playbackLoopEnabled: transport.playbackLoopEnabled,
      playbackLoopFromMeasure: transport.playbackLoopFromMeasure,
      playbackLoopToMeasure: transport.playbackLoopToMeasure,
      playbackNoteTrace: transport.playbackNoteTrace,
      playbackParseErrors: transport.playbackParseErrors,
      playbackRange: transport.playbackRange,
      playbackSanitizeWarnings: transport.playbackSanitizeWarnings,
      playbackState: transport.playbackState,
      practiceTempoMultiplier: transport.practiceTempoMultiplier,
      resumeStartIdx: transport.resumeStartIdx,
      soundfont: (() => {
        const controller = getSoundfont();
        return controller ? {
          name: controller.getName(),
          source: controller.getSource(),
          readyName: controller.getReadyName(),
          lastApplied: controller.getLastApplied(),
          lastLoadError: typeof controller.getLastLoadError === "function"
            ? controller.getLastLoadError()
            : null,
        } : null;
      })(),
    }),
    getSoundfontName: () => {
      const controller = getSoundfont();
      return controller ? controller.getName() : "";
    },
    getSoundfontSource: () => {
      const controller = getSoundfont();
      return controller ? controller.getSource() : "";
    },
    getSoundfontReadyName: () => {
      const controller = getSoundfont();
      return controller ? controller.getReadyName() : "";
    },
    getLastSoundfontApplied: () => {
      const controller = getSoundfont();
      return controller ? controller.getLastApplied() : null;
    },
    getUiState: () => ({
      isPlaying: Boolean(transport.isPlaying),
      isPaused: Boolean(transport.isPaused),
      waitingForFirstNote: Boolean(transport.waitingForFirstNote),
      playbackStartArmed: Boolean(transport.playbackStartArmed),
    }),
    highlightSourceAt: (index, on) => requireController("follow").highlightSourceAt(index, on),
    initAutoScrollListeners: () => (
      requireController("autoScroll").initPlaybackAutoScrollListeners()
    ),
    isBusy: () => {
      const controller = getUiController();
      return controller
        ? controller.isPlaybackBusy()
        : Boolean(transport.isPlaying || transport.isPaused || transport.waitingForFirstNote);
    },
    isActive: () => Boolean(transport.isPlaying || transport.isPaused),
    isAbPlanValid: () => requireController("abSelection").isPlanValid(),
    isPaused: () => Boolean(transport.isPaused),
    isPlaying: () => Boolean(transport.isPlaying),
    isTransportJumpHighlightActive: () => Boolean(transport.transportJumpHighlightActive),
    isWaitingForFirstNote: () => Boolean(transport.waitingForFirstNote),
    isFocusBoundedScope,
    isFocusEnabled: () => {
      const controller = getFocusController();
      return controller && typeof controller.isEnabled === "function"
        ? controller.isEnabled()
        : Boolean(getFocusModeEnabled());
    },
    createAbMarkerPlugin: (ViewPlugin) => createAbMarkerExtension({
      ViewPlugin,
      runtime: abLoopRuntime,
    }),
    incrementAbRevision: () => abLoopRuntime.incrementRevision(),
    hasAbPlan: () => abLoopRuntime.hasPlan(),
    handleEditorSelectionTransportState(clearPracticeHighlight = () => {}) {
      if (!transport.transportJumpHighlightActive) return;
      if (transport.suppressTransportJumpClearOnce) {
        transport.suppressTransportJumpClearOnce = false;
        return;
      }
      transport.transportJumpHighlightActive = false;
      clearPracticeHighlight();
    },
    setFocusEnabled(value) {
      const controller = getFocusController();
      if (controller) controller.setEnabled(value);
    },
    toggleFocus() {
      const controller = getFocusController();
      if (controller) controller.toggle();
    },
    computeFocusPlan: () => {
      const controller = getFocusController();
      return controller
        ? controller.computePlaybackPlan()
        : { ok: false, reason: "Cannot resolve visible scope in Focus mode." };
    },
    clearFocusScoreSelection: () => {
      const controller = getFocusController();
      return controller ? controller.clearScoreSelection() : false;
    },
    getFocusScoreSelectionBounds: () => {
      const controller = getFocusController();
      return controller ? controller.getFocusScoreSelectionBounds() : null;
    },
    getFocusScoreRenderSelection: () => {
      const controller = getFocusController();
      return controller ? controller.getFocusScoreRenderSelection() : null;
    },
    normalizeFocusLoopBounds: (fromMeasure, toMeasure) => {
      const controller = getFocusController();
      return controller
        ? controller.normalizeLoopBounds(fromMeasure, toMeasure)
        : { from: 0, to: 0 };
    },
    normalizeFocusLoopBoundsForPlayback: () => {
      const controller = getFocusController();
      return controller ? controller.normalizeLoopBoundsForPlayback() : false;
    },
    resolveFocusScoreMeasureNumber: (renderOffset) => {
      const controller = getFocusController();
      return controller ? controller.resolveScoreMeasureNumber(renderOffset) : null;
    },
    selectFocusScoreMeasure: (measure) => {
      const controller = getFocusController();
      return controller ? controller.selectScoreMeasureAtRenderOffset(measure) : null;
    },
    maybeScrollEditorToOffset: (offset) => (
      requireController("follow").maybeScrollEditorToOffset(offset)
    ),
    maybeAutoScrollRenderToCursor: (element) => (
      requireController("autoScroll").maybeAutoScrollRenderToCursor(element)
    ),
    maybeScrollRenderToNote: (element, options) => (
      requireController("follow").maybeScrollRenderToNote(element, options)
    ),
    pause: () => requireController("start").pausePlayback(),
    playDrumPreview: (pitch, velocity) => (
      requireController("drumPreview").playDrumPreview(pitch, velocity)
    ),
    prepare: () => requireController("prepare").preparePlayback(),
    prewarmCurrentTune: () => requireController("start").prewarmCurrentTune(),
    playAbLoop: () => requireController("abSelection").playAbLoop(),
    playSelectionOnce: () => requireController("abSelection").playSelectionOnce(),
    refreshAbOptionsUi: () => requireController("abSelection").refreshOptionsUi(),
    resetState: () => requireController("transport").resetPlaybackState(),
    resetPlayerForSoundfontChange() {
      if (transport.player && typeof transport.player.stop === "function") {
        transport.suppressOnEnd = true;
        transport.player.stop();
      }
      transport.player = null;
      transport.playbackState = null;
      transport.playbackIndexOffset = 0;
    },
    resetUiState: () => {
      requireController("autoScroll").resetManualPause();
      return requireController("follow").resetPlaybackUiState();
    },
    resetFocusLoopForTune(tuneId, options) {
      const controller = getFocusController();
      if (controller) controller.maybeResetLoopForTune(tuneId, options);
    },
    resolveEndSymbol: (range, startSymbol) => (
      requireController("start").resolvePlaybackEndSymbol(range, startSymbol)
    ),
    scheduleUiUpdate: (istart) => requireController("follow").schedulePlaybackUiUpdate(istart),
    setFollowVoiceFromPlayback: () => requireController("follow").setFollowVoiceFromPlayback(),
    setFollowEnabled(value) {
      followEnabled = Boolean(value);
    },
    setFollowHighlightSettings: followHighlightSettings.setFromSettings,
    setSoundfontReleaseScale(value) {
      const parsed = Number(value);
      const scale = Number.isFinite(parsed) ? Math.max(0, Math.min(2, parsed)) : 1;
      transport.soundfontReleaseScale = scale;
      if (transport.playerConfig) transport.playerConfig.release = scale;
      return scale;
    },
    setRenderBusy(value) {
      const controller = getUiController();
      if (controller) controller.setRenderBusy(value);
    },
    setSoundfontStatus: (status) => {
      const controller = getSoundfont();
      if (controller) controller.setStatus(status);
    },
    getSettingsControllers: () => ({
      soundfont: getSoundfont(),
      playbackAutoScroll: {
        setFromSettings: (settings) => requireController("autoScroll").setFromSettings(settings),
      },
      focusMode: getFocusController(),
      followHighlightSettings: {
        setFromSettings: followHighlightSettings.setFromSettings,
      },
    }),
    setAbFromSelection: () => requireController("abSelection").setFromSelection(),
    setAbOptions: (options) => requireController("abSelection").setOptions(options),
    setAbPoint: (which) => requireController("abSelection").setPoint(which),
    setAbRange: (startOffset, endOffset) => (
      requireController("abSelection").setRange(startOffset, endOffset)
    ),
    setRange: (range) => requireController("transport").setPlaybackRange(range),
    setAutoScrollModeForDev: (mode) => requireController("autoScroll").setModeForDev(mode),
    setAutoScrollFromSettings: (settings) => (
      requireController("autoScroll").setFromSettings(settings)
    ),
    setTransportJumpHighlightActive(active) {
      transport.transportJumpHighlightActive = Boolean(active);
      transport.suppressTransportJumpClearOnce = Boolean(active);
    },
    setTransportPlayheadOffset(position) {
      transport.transportPlayheadOffset = position;
    },
    snapIstartToPlayable: (istart) => snapIstartToPlayable(transport.playbackState, istart),
    startAtIndex: (index) => requireController("start").startPlaybackAtIndex(index),
    startAtMeasureOffset: (delta) => (
      requireController("start").startPlaybackAtMeasureOffset(delta)
    ),
    startFromPrepared: (index) => requireController("start").startPlaybackFromPrepared(index),
    startFromRange: (range) => requireController("start").startPlaybackFromRange(range),
    stopForRestart: () => requireController("transport").stopPlaybackForRestart(),
    stopFromGuard(message) {
      const controller = getUiController();
      if (controller) controller.handlePlaybackGuardStop(message);
    },
    stopTransport: () => requireController("transport").stopPlaybackTransport(),
    suppressFollowScroll: () => requireController("follow").suppressFollowScroll(),
    syncPendingPlan: () => requireController("transport").syncPendingPlaybackPlan(),
    toDerivedOffset,
    toEditorOffset,
    togglePlayPauseEffective: () => (
      requireController("transport").togglePlayPauseEffective()
    ),
    transportPause: () => requireController("transport").transportPause(),
    transportPlay: () => requireController("transport").transportPlay(),
    transportStartOver: () => requireController("transport").transportStartOver(),
    transportTogglePlayPause: () => (
      requireController("transport").transportTogglePlayPause()
    ),
    toggleAbOptionsPopover: () => requireController("abSelection").toggleOptionsPopover(),
    updateAbUi: () => requireController("abSelection").updateUi(),
    updateInteractionLock: () => {
      const controller = getUiController();
      if (controller) controller.updatePlaybackInteractionLock();
    },
    updateRangeFromSelection: (selection, origin, activeHighlight) => (
      requireController("transport").updatePlaybackRangeFromSelection(
        selection,
        origin,
        activeHighlight,
      )
    ),
    updatePlayButton: () => {
      const controller = getUiController();
      if (controller) controller.updatePlayButton();
    },
    updateFollowToggle: () => {
      const controller = getUiController();
      if (controller) controller.updateFollowToggle();
    },
    updatePracticeUi: () => {
      const controller = getFocusController();
      if (controller) controller.updatePracticeUi();
    },
    upperBoundTime,
    withScopedOrigin,
    withTempFlags: (flags, action) => (
      requireController("abSelection").withTempPlaybackFlags(flags, action)
    ),
    preloadSoundfont: async ({ setStatus = () => {}, logErr = () => {} } = {}) => {
      try {
        await domainApi.ensureSoundfontLoaded();
        setStatus("OK");
      } catch (error) {
        logErr(error && error.stack ? error.stack : String(error));
        setStatus("Error");
      }
    },
    start() {
      requireController("autoScroll").initPlaybackAutoScrollListeners();
      const focus = getFocusController();
      if (focus) focus.wireControls();
      if (documentRef) {
        documentRef.addEventListener("drum:preview", (event) => {
          const detail = event && event.detail ? event.detail : {};
          domainApi.playDrumPreview(detail.pitch, detail.velocity);
        });
      }
      domainApi.updatePlayButton();
      domainApi.updateFollowToggle();
    },
  };
  return domainApi;
}
