import { createErrorsActivationHighlightPlugin } from "./errors_activation_highlight_plugin.js";
import { createErrorsActivationController } from "./errors_activation_controller.js";
import { createErrorsBarMismatchController } from "./errors_bar_mismatch_controller.js";
import {
  analyzeBarMismatchesForGutter,
} from "./errors_bar_mismatch_model.js";
import { analyzeVoiceMeasureCorrespondence } from "../abc/voice_measure_correspondence_model.js";
import { createErrorsCollection } from "./errors_collection.js";
import { createErrorsFocusMessageController } from "./errors_focus_message_controller.js";
import { createErrorsHighlightState } from "./errors_highlight_state.js";
import { createErrorsJumpController } from "./errors_jump_controller.js";
import { createErrorsLifecycleController } from "./errors_lifecycle_controller.js";
import { createErrorsListController } from "./errors_list_controller.js";
import { createErrorsMeasureHighlightController } from "./errors_measure_highlight_controller.js";
import { createMeasureErrorState } from "./errors_measure_state.js";
import { createErrorsNavigationController } from "./errors_navigation_controller.js";
import { createErrorsNavigationState } from "./errors_navigation_state.js";
import { createErrorsPlaybackRangeController } from "./errors_playback_range_controller.js";
import { createErrorsPopoverController } from "./errors_popover_controller.js";
import { createErrorsReporterController } from "./errors_reporter_controller.js";
import { createErrorsRuntimeState } from "./errors_runtime_state.js";
import { createErrorsSvgHighlightController } from "./errors_svg_highlight_controller.js";
import { createErrorsTuneScanController } from "./errors_tune_scan_controller.js";
import {
  computeErrorId,
  getErrorGroupKey,
  getErrorGroupLabel as getErrorGroupLabelCore,
} from "./errors_model.js";

function createErrorsFeature({
  elements = {},
  safeBasename,
  setButtonText,
  showToast,
  logError,
  isMeasureCheckEnabled,
  isRawMode,
  isPayloadMode,
  getActiveTuneMeta,
  getEditorText,
  getEditorView,
  getRenderPayload,
  getLastRenderPayload,
  getOutputElement,
  getRenderPaneElement,
  findMeasureRangeAt,
  mapRenderIdxToEditorOffset,
  mapEditorOffsetToRenderIdx,
  pickClosestNoteElement,
  maybeScrollRenderToNote,
  getEditorIndexFromLoc,
  setEditorSelectionAt,
  setEditorSelectionAtLineCol,
  getTextIndexFromLoc,
  highlightRenderNoteAtIndex,
  highlightSvgAtEditorOffset,
  isPlaying,
  isPaused,
  getPlaybackRange,
  setPlaybackRange,
  setPendingPlaybackRangeOrigin,
  setSuppressPlaybackRangeSelectionSync,
  isDirty,
  confirmUnsavedChanges,
  performSaveFlow,
  getFileContent,
  getActiveFileEntry,
  selectTune,
  getActiveTuneId,
  getActiveTuneIdForList,
  getEditorScroll,
  setEditorScroll,
  getRenderScroll,
  setRenderScroll,
  setSuppressRecentEntries,
  buildTuneSelectOptions,
  setStatus,
  updateFileContext,
  updateLibraryStatus,
  clearPendingRenderTimer,
  scheduleRenderNow,
  openTuneFromLibrarySelection,
  parseMeterParts,
  computeMeasureStats,
} = {}) {
  const navigationState = createErrorsNavigationState();
  const highlightState = createErrorsHighlightState();
  const collection = createErrorsCollection();
  const measureErrorState = createMeasureErrorState();

  let popoverController = null;
  let activationController = null;
  let reporterController = null;
  let tuneScanController = null;
  let lifecycleController = null;

  function entries() {
    return collection.getEntries();
  }

  function sortedErrorsForNav() {
    return runtimeState.getSortedErrorsForNav();
  }

  function isEnabled() {
    return lifecycleController ? lifecycleController.isEnabled() : false;
  }

  function clearFocusMessage() {
    focusMessageController.clear();
  }

  function setFocusMessage(entry, from) {
    focusMessageController.set(entry, from);
  }

  function setMeasureErrorRanges(ranges) {
    measureErrorState.setRanges(ranges);
  }

  function renderErrorList() {
    listController.render();
  }

  function showErrorsVisible(visible) {
    const sidebar = elements.sidebar || null;
    const sidebarBody = elements.sidebarBody || null;
    if (sidebar) sidebar.classList.remove("has-errors");
    if (sidebarBody) sidebarBody.classList.remove("errors-visible");
    void visible;
  }

  function setScanErrors(errorsArray) {
    runtimeState.setErrors(errorsArray);
  }

  function updateIndicatorAndPopover() {
    runtimeState.updateIndicatorAndPopover();
  }

  function syncActiveNavIndex(sortedItemsArg) {
    activationController.syncNavIndex(sortedItemsArg);
  }

  function clearActiveHighlight(reason) {
    activationController.clear(reason);
  }

  function setActiveHighlight(entry, from, to) {
    activationController.set(entry, from, to);
  }

  function applyPlaybackRangeFromError(errItem) {
    playbackRangeController.applyFromError(errItem);
  }

  function getErrorGroupLabel(entry) {
    return getErrorGroupLabelCore(entry, { safeBasename });
  }

  function setScanButtonState(isScanning) {
    if (!elements.scanButton) return;
    elements.scanButton.disabled = Boolean(isScanning);
  }

  function setScanButtonActive(isActive) {
    if (!elements.scanButton) return;
    const active = Boolean(isActive);
    elements.scanButton.classList.toggle("toggle-active", active);
    if (elements.tuneSelect) {
      elements.tuneSelect.classList.toggle("error-filter-active", active);
    }
  }

  function updateScanButtonVisibility(entry) {
    if (!elements.scanButton) return;
    const tuneCount = entry && Array.isArray(entry.tunes) ? entry.tunes.length : 0;
    const shouldShow = tuneCount > 1;
    elements.scanButton.style.display = shouldShow ? "" : "none";
    if (!shouldShow) {
      tuneScanController.cancel();
      tuneScanController.clearFilter();
      setScanButtonState(false);
      setScanButtonActive(false);
    }
  }

  function clearBarMismatchMarkers() {
    barMismatchController.setMarkers([]);
  }

  function refreshBarMismatchMarkersForTune(tuneText, { lineOffset = 0, startOffset = 0, deferEditorRefresh = false } = {}) {
    const editorView = typeof getEditorView === "function" ? getEditorView() : null;
    const rawMode = typeof isRawMode === "function" ? Boolean(isRawMode()) : false;
    const payloadMode = typeof isPayloadMode === "function" ? Boolean(isPayloadMode()) : false;
    if (!editorView || rawMode || payloadMode || !isEnabled()) {
      barMismatchController.setMarkers([]);
      return;
    }
    try {
      let markers = analyzeBarMismatchesForGutter(tuneText);
      const voiceForm = analyzeVoiceMeasureCorrespondence(tuneText);
      if (Array.isArray(voiceForm.mismatches) && voiceForm.mismatches.length) {
        markers = [...markers, ...voiceForm.mismatches];
      }
      const lineDelta = Number(lineOffset) || 0;
      const offsetDelta = Number(startOffset) || 0;
      if ((lineDelta || offsetDelta) && Array.isArray(markers)) {
        markers = markers.map((marker) => {
          if (!marker) return marker;
          const next = { ...marker };
          if (Number.isFinite(next.offset)) next.offset = Number(next.offset) + offsetDelta;
          if (Number.isFinite(next.line)) next.line = Number(next.line) + lineDelta;
          return next;
        });
      }
      barMismatchController.setMarkers(markers, { deferRefresh: Boolean(deferEditorRefresh) });
      if (window.__abcarusDebugBarMismatch === true) {
        console.info("[bar-mismatch]", {
          count: Array.isArray(markers) ? markers.length : 0,
          first: Array.isArray(markers) ? markers.slice(0, 8) : [],
        });
      }
    } catch {
      barMismatchController.setMarkers([]);
      if (window.__abcarusDebugBarMismatch === true) {
        console.warn("[bar-mismatch] analyze failed");
      }
    }
  }

  function addBarMismatchErrorsFromMarkers(markersArg) {
    const editorView = typeof getEditorView === "function" ? getEditorView() : null;
    if (!isEnabled() || !editorView) return;
    const markers = Array.isArray(markersArg) ? markersArg : barMismatchController.getMarkers();
    if (!Array.isArray(markers) || markers.length === 0) return;
    const docLen = editorView.state.doc.length;
    const clamp = (value) => Math.max(0, Math.min(docLen, Math.floor(Number(value) || 0)));
    for (const marker of markers) {
      if (!marker || !Number.isFinite(marker.offset)) continue;
      const start = clamp(marker.offset);
      const len = Math.max(1, Math.min(16, Math.floor(Number(marker.len) || 1)));
      const end = Math.max(start + 1, clamp(start + len));
      const barLabel = marker.barLabel
        ? String(marker.barLabel)
        : (marker.barNumber ? `Bar ${marker.barNumber}` : "Bar");
      const deltaLabel = marker.deltaText ? ` ${marker.deltaText}` : "";
      const voicePrefix = marker.voiceId ? `V:${marker.voiceId} · ` : "";
      const detail = marker.detail ? String(marker.detail) : `${voicePrefix}${barLabel}${deltaLabel} mismatch.`;
      const message = (marker.kind === "measure-count" || marker.kind === "structure")
        ? `Voice form mismatch: ${detail}`
        : `Bar mismatch: ${detail}`;
      const loc = Number.isFinite(marker.line)
        ? { line: Number(marker.line), col: Number.isFinite(marker.col) ? Number(marker.col) : 1 }
        : null;
      reporterController.add(message, loc, {
        source: "bar-mismatch",
        skipMeasureRange: true,
        skipLineOffset: true,
        errorStartOffset: start,
        errorEndOffset: end,
        barNumber: marker.barNumber || null,
        voiceId: marker.voiceId || "",
      });
    }
  }

  function refreshNow() {
    const rawMode = typeof isRawMode === "function" ? Boolean(isRawMode()) : false;
    if (rawMode) {
      if (typeof showToast === "function") showToast("Raw mode: switch to tune mode for errors.", 2200);
      return;
    }
    if (!isEnabled()) {
      if (typeof showToast === "function") showToast("Errors disabled");
      return;
    }
    if (typeof clearPendingRenderTimer === "function") clearPendingRenderTimer();
    if (typeof scheduleRenderNow === "function") scheduleRenderNow();
    if (tuneScanController.isFilterActive() && !tuneScanController.isInFlight()) {
      const entry = typeof getActiveFileEntry === "function" ? getActiveFileEntry() : null;
      if (entry) {
        setScanButtonActive(true);
        tuneScanController.scanActiveFile(entry, { filterToErrorTunes: true }).catch(() => {});
        if (typeof updateLibraryStatus === "function") updateLibraryStatus();
      }
    }
  }

  function handleScanButtonClick() {
    if (!isEnabled()) {
      if (typeof showToast === "function") showToast("Errors disabled");
      return;
    }
    const rawMode = typeof isRawMode === "function" ? Boolean(isRawMode()) : false;
    if (rawMode) {
      if (typeof showToast === "function") showToast("Raw mode: switch to tune mode for errors.", 2200);
      return;
    }
    if (tuneScanController.isInFlight()) return;
    const entry = typeof getActiveFileEntry === "function" ? getActiveFileEntry() : null;
    if (!entry) return;
    reporterController.clear();
    tuneScanController.invalidate();
    if (tuneScanController.isFilterActive()) {
      tuneScanController.clearFilter();
      if (typeof buildTuneSelectOptions === "function") buildTuneSelectOptions(entry);
      setScanButtonActive(false);
      if (typeof updateLibraryStatus === "function") updateLibraryStatus();
      return;
    }
    tuneScanController.setFilterActive(true);
    if (typeof buildTuneSelectOptions === "function") buildTuneSelectOptions(entry);
    setScanButtonActive(true);
    tuneScanController.scanActiveFile(entry, { filterToErrorTunes: true }).catch(() => {});
    if (typeof updateLibraryStatus === "function") updateLibraryStatus();
  }

  function startScanFromToolbarEnable() {
    if (!isEnabled()) return;
    const rawMode = typeof isRawMode === "function" ? Boolean(isRawMode()) : false;
    if (rawMode) return;
    const busy = Boolean(
      (typeof isPlaying === "function" && isPlaying())
        || (typeof isPaused === "function" && isPaused())
    );
    if (busy) {
      if (typeof showToast === "function") showToast("Stop playback to scan errors");
      return;
    }
    tuneScanController.clearFilter();
    tuneScanController.invalidate();
    setScanButtonActive(false);
    refreshNow();
  }

  const runtimeState = createErrorsRuntimeState({
    isEnabled,
    clearFocusMessage,
    updateIndicator: (options) => popoverController.updateIndicator(options),
    syncActiveNavIndex,
  });

  const svgHighlightController = createErrorsSvgHighlightController({
    highlightState,
    getOutputElement,
    getRenderPaneElement,
    getEditorText,
    findMeasureRangeAt,
    mapEditorOffsetToRenderIdx,
    pickClosestNoteElement,
    maybeScrollRenderToNote,
  });

  const barMismatchController = createErrorsBarMismatchController({
    dispatchEditorRefresh: () => {
      const editorView = typeof getEditorView === "function" ? getEditorView() : null;
      if (!editorView) return;
      editorView.dispatch({
        selection: editorView.state.selection,
        scrollIntoView: false,
      });
    },
  });

  const measureHighlightController = createErrorsMeasureHighlightController({
    getOutputElement,
    getEditorRanges: () => measureErrorState.getRanges(),
    getRenderRanges: () => reporterController.getMeasureRenderRanges(),
  });

  reporterController = createErrorsReporterController({
    collection,
    measureErrorState,
    safeBasename,
    isEnabled,
    isMeasureCheckEnabled,
    getActiveTuneMeta,
    getEditorText,
    getRenderPayload,
    getLastRenderPayload,
    findMeasureRangeAt,
    mapRenderIdxToEditorOffset,
    setMeasureErrorRanges,
    renderErrorList,
    showErrorsVisible,
    setScanErrors,
    getEntries: entries,
  });

  const playbackRangeController = createErrorsPlaybackRangeController({
    isEnabled,
    isPlaying,
    getEditorText,
    findMeasureRangeAt,
    setPlaybackRange,
    setSelectionAt: setEditorSelectionAt,
    setSuppressSelectionSync: setSuppressPlaybackRangeSelectionSync,
    logError,
  });

  tuneScanController = createErrorsTuneScanController({
    isEnabled,
    isDirty,
    confirmUnsavedChanges,
    performSaveFlow,
    getFileContent,
    selectTune,
    getActiveTuneId,
    getEditorScroll,
    setEditorScroll,
    getRenderScroll,
    setRenderScroll,
    setSuppressRecentEntries,
    setErrorLineOffsetFromHeader: (headerText) => reporterController.setLineOffsetFromHeader(headerText),
    setScanButtonState,
    setScanButtonActive,
    buildTuneSelectOptions,
    setScanErrors,
    getErrorEntries: entries,
    setStatus,
    onIdleIndexChanged: updateFileContext,
  });

  lifecycleController = createErrorsLifecycleController({
    toggleButton: elements.toggleButton,
    prevButton: elements.prevButton,
    nextButton: elements.nextButton,
    scanButton: elements.scanButton,
    indicator: elements.indicator,
    focusMessage: elements.focusMessage,
    setButtonText,
    closePopover: () => popoverController.close(),
    clearActiveHighlight,
    cancelTuneScan: () => tuneScanController.cancel(),
    clearTuneScanFilter: () => tuneScanController.clearFilter(),
    setScanButtonActive,
    setScanButtonState,
    updateScanButtonVisibility,
    clearBarMismatchMarkers,
    clearErrors: () => reporterController.clear(),
    updateFileContext,
    getPlaybackRange,
    setPlaybackRange,
    updateLibraryStatus,
    updateIndicatorAndPopover,
    clearFocusMessage,
    refreshErrorsNow: refreshNow,
    scheduleRenderNow,
  });

  const navigationController = createErrorsNavigationController({
    navigationState,
    isEnabled,
    isPlaybackBusy: () => Boolean(
      (typeof isPlaying === "function" && isPlaying())
        || (typeof isPaused === "function" && isPaused())
    ),
    getSortedItems: sortedErrorsForNav,
    jumpToError: (entry) => jumpController.jumpToError(entry),
    showToast,
  });

  popoverController = createErrorsPopoverController({
    indicator: elements.indicator,
    popover: elements.popover,
    titleElement: elements.popoverTitle,
    listElement: elements.popoverList,
    getErrors: () => runtimeState.getErrors(),
    getActiveErrorId: () => {
      const active = highlightState.getActive();
      return active && active.id ? active.id : "";
    },
    computeErrorId,
    onJump: (entry) => jumpController.jumpToError(entry),
  });

  activationController = createErrorsActivationController({
    highlightState,
    navigationState,
    getSortedItems: sortedErrorsForNav,
    getEntries: entries,
    getEditorView,
    getEditorIndexFromLoc,
    clearSvgHighlight: () => svgHighlightController.clear(),
    clearFocusMessage,
    setFocusMessage,
    refreshPopover: () => popoverController.refresh(),
    highlightSvgAtEditorOffset,
    logError,
  });

  const jumpController = createErrorsJumpController({
    isEnabled,
    showToast,
    getEditorView,
    openTuneFromLibrarySelection,
    selectTune,
    setPendingPlaybackRangeOrigin,
    setActiveHighlight,
    highlightState,
    highlightSvgAtEditorOffset,
    applyPlaybackRangeFromError,
    logError,
  });

  const listController = createErrorsListController({
    listElement: elements.list,
    getErrors: entries,
    getActiveTuneId: getActiveTuneIdForList || getActiveTuneId,
    getGroupKey: getErrorGroupKey,
    getGroupLabel: getErrorGroupLabel,
    onActivate: async (entry) => {
      const activeTuneId = typeof getActiveTuneIdForList === "function"
        ? getActiveTuneIdForList()
        : (typeof getActiveTuneId === "function" ? getActiveTuneId() : null);
      if (entry.tuneId && entry.tuneId !== activeTuneId && typeof selectTune === "function") {
        await selectTune(entry.tuneId);
      }
      if (entry.loc && typeof setEditorSelectionAtLineCol === "function") {
        setEditorSelectionAtLineCol(entry.loc.line, entry.loc.col);
      }
      const lastRenderPayload = typeof getLastRenderPayload === "function" ? getLastRenderPayload() : null;
      if (entry.renderLoc && lastRenderPayload && lastRenderPayload.text && typeof getTextIndexFromLoc === "function") {
        const renderIdx = getTextIndexFromLoc(lastRenderPayload.text, entry.renderLoc);
        if (Number.isFinite(renderIdx) && typeof highlightRenderNoteAtIndex === "function") {
          highlightRenderNoteAtIndex(renderIdx);
        }
      }
    },
  });

  const focusMessageController = createErrorsFocusMessageController({
    element: elements.focusMessage,
    getEditorText,
    getNavItems: sortedErrorsForNav,
    computeErrorId,
    parseMeterParts,
    computeMeasureStats,
  });

  return {
    add: (message, locOverride, contextOverride) => reporterController.add(message, locOverride, contextOverride),
    addBarMismatchErrorsFromMarkers,
    activateByNav: (delta) => navigationController.activateByDelta(delta),
    applyMeasureHighlights: (renderOffset) => measureHighlightController.apply(renderOffset),
    applyPlaybackRangeFromError,
    clear: () => reporterController.clear(),
    clearActiveHighlight,
    clearBarMismatchMarkers,
    clearFeatureState: () => lifecycleController.clearFeatureState(),
    clearIndex: () => tuneScanController.clearIndex(),
    clearIndexForFile: (entry) => tuneScanController.clearIndexForFile(entry),
    clearScanFilter: () => tuneScanController.clearFilter(),
    clearFocusMessage,
    clearSvgHighlight: () => svgHighlightController.clear(),
    cancelScan: () => tuneScanController.cancel(),
    getActiveHighlight: () => highlightState.getActive(),
    getActiveHighlightRange: () => highlightState.getRange(),
    getBarMismatchMarkers: () => barMismatchController.getMarkers(),
    getEntries: entries,
    getFilteredTunes: (tunes) => tuneScanController.getFilteredTunes(tunes),
    getLastRhythmErrorSuggestion: () => playbackRangeController.getLastSuggestion(),
    getSortedErrorsForNav: sortedErrorsForNav,
    hasActiveHighlight: () => highlightState.hasActive(),
    hasIndexedErrors: () => tuneScanController.hasIndexedErrors(),
    handleScanButtonClick,
    highlightSvgAtEditorOffset: (editorOffset) => svgHighlightController.highlightAtEditorOffset(editorOffset),
    isHighlightSuppressingClear: () => highlightState.isSuppressingClear(),
    isEnabled,
    isScanFilterActive: () => tuneScanController.isFilterActive(),
    isScanInFlight: () => tuneScanController.isInFlight(),
    invalidateScan: () => tuneScanController.invalidate(),
    log: (message, loc, context) => reporterController.log(message, loc, context),
    plugins: {
      activationHighlight: createErrorsActivationHighlightPlugin(highlightState),
      barMismatch: barMismatchController.plugin,
      measure: measureErrorState.plugin,
    },
    reconcileActiveHighlightAfterRender: (options) => activationController.reconcileAfterRender(options),
    refreshNow,
    startScanFromToolbarEnable,
    refreshBarMismatchMarkersForTune,
    jumpToError: (entry) => jumpController.jumpToError(entry),
    scanActiveFile: (entry, options) => tuneScanController.scanActiveFile(entry, options),
    setBarMismatchMarkers: (markers) => barMismatchController.setMarkers(markers),
    setEnabled: (next, options) => lifecycleController.setEnabled(next, options),
    setActiveHighlight,
    setFocusMessage,
    setLineOffset: (lineOffset) => reporterController.setLineOffset(lineOffset),
    setLineOffsetFromHeader: (headerText) => reporterController.setLineOffsetFromHeader(headerText),
    setMeasureErrorRanges,
    setScanButtonActive,
    setScanButtonState,
    setScanErrors,
    setScanFilterActive: (next) => tuneScanController.setFilterActive(next),
    setTuneErrorCount: (tuneId, count) => tuneScanController.setTuneErrorCount(tuneId, count),
    syncActiveNavIndex,
    updateFeatureUi: () => lifecycleController.updateUi(),
    updateIndexFromCurrentErrors: (activeTuneId) => tuneScanController.updateIndexFromCurrentErrors(activeTuneId, entries()),
    updateIndicatorAndPopover,
    updateScanButtonVisibility,
  };
}

export {
  createErrorsFeature,
};
