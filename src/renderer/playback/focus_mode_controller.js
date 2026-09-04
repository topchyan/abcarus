import {
  buildFocusBarIndexMap,
  buildFocusPlaybackPlan,
  getVisibleFocusRenderRangeFromElements,
} from "./focus_playback_model.js";
import {
  clampRuntimeTempoMultiplier,
  getRuntimeTempoPresentation,
  stepRuntimeTempoMultiplier,
} from "./runtime_tempo_model.js";
import {
  advanceFocusScoreSelection,
  advanceScoreRenderSelection,
  applyScoreRenderSelectionToFocusPlan,
  resolveFocusMeasureNumberAtRenderOffset,
} from "./focus_score_selection_model.js";

export function createFocusModeController({
  elements = {},
  transport,
  getSettings = () => null,
  getActiveTuneId = () => "",
  getLibraryVisible = () => false,
  isRawModeActive = () => false,
  isPlaybackBusy = () => false,
  isFocusBoundedPlaybackScope = () => false,
  getEditorView = () => null,
  getEditorText = () => "",
  getRenderMeasureIndex = () => null,
  getRenderCompatMap = () => null,
  mapRenderIdxToEditorOffset = (offset) => offset,
  getOutputElement = () => null,
  getRenderPane = () => null,
  getScopedPlaybackSettingsForOrigin = () => ({}),
  findMeasureStartOffsetByNumber = () => null,
  clampInt = (value, _min, _max, fallback) => fallback,
  readRenderZoom = () => null,
  setRenderZoom = () => {},
  fitScoreToCurrentPane = () => {},
  setLibraryVisible = () => {},
  syncPendingPlaybackPlan = () => {},
  clearNormalPlaybackPlan = () => {},
  stopPlaybackForRangeEdit = () => {},
  persistLoopSettingsPatch = async () => {},
  showToast = () => {},
} = {}) {
  const {
    focusButton = null,
    practiceTempoWrap = null,
    practiceTempo = null,
    practiceTempoValue = null,
    practiceTempoDown = null,
    practiceTempoUp = null,
    practiceFocusRangeGroup = null,
    practiceFocusOptionsGroup = null,
    practiceFocusVoicesGroup = null,
    practiceSelectionGroup = null,
    practiceLoopWrap = null,
    practiceLoopEnabled = null,
    practiceLoopFrom = null,
    practiceLoopTo = null,
    selectionSuppressWrap = null,
    selectionSuppressEnabled = null,
    selectionGchordsWrap = null,
    selectionGchordsEnabled = null,
    selectionDrumsWrap = null,
    selectionDrumsEnabled = null,
    selectionMutedWrap = null,
    selectionMutedVoices = null,
    selectionLoopWrap = null,
    selectionLoopEnabled = null,
    scoreToolbar = null,
    practiceControls = null,
    rightControls = null,
  } = elements;

  let enabled = false;
  let prevRenderZoom = null;
  let prevLibraryVisible = null;
  let focusScoreSelectionAwaitingEnd = false;
  let focusScoreRenderSelection = null;
  const normalToolbarPositions = [practiceControls, rightControls]
    .filter(Boolean)
    .map((element) => ({
      element,
      parent: element.parentNode,
      nextSibling: element.nextSibling,
    }));

  function isEnabled() {
    return enabled;
  }

  function notifyScoreSelectionChanged() {
    const outputElement = getOutputElement();
    if (!outputElement || typeof outputElement.dispatchEvent !== "function") return;
    try { outputElement.dispatchEvent(new Event("abcarus:focus-selection-changed")); } catch {}
  }

  function hasEditorTextSelection() {
    const editorView = getEditorView();
    const ranges = editorView && editorView.state && editorView.state.selection
      ? editorView.state.selection.ranges
      : null;
    return Boolean(Array.isArray(ranges) && ranges.some((range) => range && range.from !== range.to));
  }

  function applyRuntimeTempo(value) {
    const next = clampRuntimeTempoMultiplier(value, transport.practiceTempoMultiplier || 1);
    transport.practiceTempoMultiplier = next;
    transport.desiredPlayerSpeed = next;
    syncPendingPlaybackPlan();
    if (
      isPlaybackBusy()
      && transport.player
      && typeof transport.player.set_speed === "function"
    ) {
      try { transport.player.set_speed(transport.desiredPlayerSpeed); } catch {}
    }
    updatePracticeUi();
  }

  function updatePracticeUi() {
    const settings = getSettings() || null;
    if (practiceTempoWrap) practiceTempoWrap.hidden = false;
    if (practiceFocusRangeGroup) practiceFocusRangeGroup.hidden = !enabled;
    if (practiceFocusOptionsGroup) practiceFocusOptionsGroup.hidden = !enabled;
    if (practiceFocusVoicesGroup) practiceFocusVoicesGroup.hidden = !enabled;
    const hasSelection = hasEditorTextSelection();
    if (practiceSelectionGroup) practiceSelectionGroup.hidden = Boolean(enabled || !hasSelection);
    if (practiceTempo && document.activeElement !== practiceTempo) {
      const value = String(transport.practiceTempoMultiplier);
      if (practiceTempo.value !== value) practiceTempo.value = value;
    }
    if (practiceTempoValue) {
      const presentation = getRuntimeTempoPresentation(getEditorText(), transport.practiceTempoMultiplier);
      practiceTempoValue.textContent = presentation.label;
      practiceTempoValue.title = presentation.tempo
        ? `Runtime tempo; source Q: remains unchanged (${Math.round(presentation.multiplier * 100)}%)`
        : "Runtime playback speed; source tempo is not a simple Q: fraction=value form";
    }

    if (practiceLoopWrap) practiceLoopWrap.hidden = !enabled;
    if (practiceLoopEnabled && document.activeElement !== practiceLoopEnabled) {
      practiceLoopEnabled.checked = Boolean(transport.playbackLoopEnabled);
    }
    if (practiceLoopFrom && document.activeElement !== practiceLoopFrom) {
      practiceLoopFrom.value = String(clampInt(transport.playbackLoopFromMeasure, 0, 100000, 0) || 0);
    }
    if (practiceLoopTo && document.activeElement !== practiceLoopTo) {
      practiceLoopTo.value = String(clampInt(transport.playbackLoopToMeasure, 0, 100000, 0) || 0);
    }

    if (selectionSuppressWrap) selectionSuppressWrap.hidden = !enabled;
    if (selectionSuppressEnabled && document.activeElement !== selectionSuppressEnabled) {
      const checked = isFocusBoundedPlaybackScope()
        || Boolean(!settings || settings.playbackSelectionSuppressRepeats !== false);
      selectionSuppressEnabled.checked = checked;
    }
    if (selectionGchordsWrap) selectionGchordsWrap.hidden = !enabled;
    if (selectionGchordsEnabled && document.activeElement !== selectionGchordsEnabled) {
      const checked = Boolean(!settings || settings.playbackSelectionMuteGchords !== true);
      selectionGchordsEnabled.checked = checked;
    }
    if (selectionDrumsWrap) selectionDrumsWrap.hidden = !enabled;
    if (selectionDrumsEnabled && document.activeElement !== selectionDrumsEnabled) {
      selectionDrumsEnabled.checked = Boolean(settings && settings.playbackSelectionAllowMidiDrums);
    }
    if (selectionMutedWrap) selectionMutedWrap.hidden = !enabled;
    if (selectionMutedVoices && document.activeElement !== selectionMutedVoices) {
      const raw = settings && settings.playbackSelectionMutedVoices != null
        ? String(settings.playbackSelectionMutedVoices)
        : "";
      if (selectionMutedVoices.value !== raw) selectionMutedVoices.value = raw;
    }

    if (selectionLoopWrap) selectionLoopWrap.hidden = Boolean(enabled || !hasSelection);
    if (selectionLoopEnabled && document.activeElement !== selectionLoopEnabled) {
      selectionLoopEnabled.checked = Boolean(settings && settings.playbackSelectionLoopEnabled);
    }

    if (enabled && !isPlaybackBusy()) syncPendingPlaybackPlan();
  }

  function updateUi() {
    if (enabled && scoreToolbar) {
      if (practiceControls) scoreToolbar.append(practiceControls);
      if (rightControls) scoreToolbar.append(rightControls);
    } else {
      normalToolbarPositions.forEach(({ element, parent, nextSibling }) => {
        if (!parent) return;
        parent.insertBefore(element, nextSibling && nextSibling.parentNode === parent ? nextSibling : null);
      });
    }
    document.body.classList.toggle("focus-mode", enabled);
    if (focusButton) {
      focusButton.classList.toggle("toggle-active", enabled);
      focusButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    updatePracticeUi();
    notifyScoreSelectionChanged();
  }

  function setEnabled(nextEnabled) {
    const next = Boolean(nextEnabled);
    if (enabled === next) return;
    if (isRawModeActive() && next) {
      showToast("Exit Raw mode to use Focus.", 2200);
      return;
    }
    enabled = next;
    if (!enabled) {
      focusScoreSelectionAwaitingEnd = false;
      focusScoreRenderSelection = null;
    }
    updateUi();

    if (enabled) {
      prevRenderZoom = readRenderZoom();
      prevLibraryVisible = getLibraryVisible();
      setRenderZoom(1);
      if (getLibraryVisible()) {
        setLibraryVisible(false, { persist: false });
      }
      fitScoreToCurrentPane({ resetScroll: false, persist: false });
    } else if (prevRenderZoom != null) {
      setRenderZoom(prevRenderZoom);
      prevRenderZoom = null;
      if (prevLibraryVisible) {
        setLibraryVisible(true, { persist: false });
      }
      prevLibraryVisible = null;
      fitScoreToCurrentPane({ resetScroll: false });
    }

    if (enabled) {
      maybeResetLoopForTune(getActiveTuneId(), { updateUi: false });
    } else {
      clearNormalPlaybackPlan();
      syncPendingPlaybackPlan();
    }
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function normalizeLoopBounds(fromMeasure, toMeasure) {
    const from = clampInt(fromMeasure, 0, 100000, 0);
    const to = clampInt(toMeasure, 0, 100000, 0);
    return { from, to };
  }

  function normalizeLoopBoundsForPlayback() {
    if (!enabled) return false;
    const from = clampInt(transport.playbackLoopFromMeasure, 0, 100000, 0);
    const to = clampInt(transport.playbackLoopToMeasure, 0, 100000, 0);
    if (!(from > 0 && to > 0 && from > to)) return false;
    transport.playbackLoopFromMeasure = to;
    transport.playbackLoopToMeasure = from;
    updatePracticeUi();
    syncPendingPlaybackPlan();
    const patch = {
      playbackLoopFromMeasure: transport.playbackLoopFromMeasure,
      playbackLoopToMeasure: transport.playbackLoopToMeasure,
    };
    const tuneId = getActiveTuneId();
    if (tuneId) {
      transport.playbackLoopTuneId = String(tuneId);
      patch.playbackLoopTuneId = transport.playbackLoopTuneId;
    }
    persistLoopSettingsPatch(patch).catch(() => {});
    notifyScoreSelectionChanged();
    return true;
  }

  function getFocusScoreSelectionBounds() {
    if (!enabled) return null;
    const fromMeasure = clampInt(transport.playbackLoopFromMeasure, 0, 100000, 0);
    const toMeasure = clampInt(transport.playbackLoopToMeasure, 0, 100000, 0);
    if (fromMeasure < 1 || toMeasure < fromMeasure) return null;
    return { fromMeasure, toMeasure };
  }

  function getFocusScoreRenderSelection() {
    if (!enabled || !focusScoreRenderSelection) return null;
    return {
      playStart: focusScoreRenderSelection.playStart,
      playEnd: focusScoreRenderSelection.playEnd,
    };
  }

  function resolveScoreMeasureNumber(renderOffset) {
    return resolveFocusMeasureNumberAtRenderOffset(getRenderMeasureIndex(), renderOffset);
  }

  function selectScoreMeasureAtRenderOffset(measure) {
    if (!enabled) return null;
    const renderOffset = Number(measure && measure.playStart);
    const measureNumber = resolveScoreMeasureNumber(renderOffset);
    if (measureNumber == null) return null;
    if (isPlaybackBusy()) stopPlaybackForRangeEdit();
    const next = advanceFocusScoreSelection({
      fromMeasure: transport.playbackLoopFromMeasure,
      toMeasure: transport.playbackLoopToMeasure,
      awaitingEnd: focusScoreSelectionAwaitingEnd,
    }, measureNumber);
    if (!next) return null;
    transport.playbackLoopFromMeasure = next.fromMeasure;
    transport.playbackLoopToMeasure = next.toMeasure;
    focusScoreSelectionAwaitingEnd = next.awaitingEnd;
    focusScoreRenderSelection = advanceScoreRenderSelection(focusScoreRenderSelection, measure);
    updatePracticeUi();
    syncPendingPlaybackPlan();
    if (!next.awaitingEnd) persistCurrentLoopBounds();
    notifyScoreSelectionChanged();
    return getFocusScoreSelectionBounds();
  }

  function clearScoreSelection() {
    if (!enabled) return false;
    transport.playbackLoopFromMeasure = 0;
    transport.playbackLoopToMeasure = 0;
    focusScoreSelectionAwaitingEnd = false;
    focusScoreRenderSelection = null;
    updatePracticeUi();
    syncPendingPlaybackPlan();
    persistCurrentLoopBounds();
    notifyScoreSelectionChanged();
    return true;
  }

  function computePlaybackPlan() {
    const editorView = getEditorView();
    if (!editorView) return { ok: false, reason: "Cannot resolve visible scope in Focus mode." };
    const tuneText = String(getEditorText() || "");
    const measureIndex = getRenderMeasureIndex();
    const barMap = buildFocusBarIndexMap({
      measureIndex,
      editorDocLength: editorView.state.doc.length,
      getRenderCompatMap,
      mapRenderIdxToEditorOffset,
    });
    const firstMeasureOffset = findMeasureStartOffsetByNumber(tuneText, 1);
    const settings = getScopedPlaybackSettingsForOrigin("focus") || {};
    const outputElement = getOutputElement();
    const renderPane = getRenderPane();
    const visibleRange = enabled && outputElement && renderPane
      ? getVisibleFocusRenderRangeFromElements({
          barElements: outputElement.querySelectorAll(".bar-hl"),
          paneRect: renderPane.getBoundingClientRect(),
        })
      : null;
    const result = buildFocusPlaybackPlan({
      parsedTune: {
        text: tuneText,
        barMap,
        byNumber: measureIndex && measureIndex.byNumber ? measureIndex.byNumber : null,
        firstMeasureOffset: Number.isFinite(firstMeasureOffset) ? Number(firstMeasureOffset) : null,
      },
      focusState: {
        fromMeasure: Number(transport.playbackLoopFromMeasure),
        toMeasure: Number(transport.playbackLoopToMeasure),
        loop: Boolean(transport.playbackLoopEnabled),
        suppressRepeats: Boolean(settings.suppressRepeats),
        mutedVoices: Array.isArray(settings.mutedVoices) ? settings.mutedVoices.slice() : [],
        muteGchords: Boolean(settings.muteGchords),
        allowMidiDrums: Boolean(settings.allowMidiDrums),
      },
      visibleRange,
      getMeasureStartOffsetByNumber: findMeasureStartOffsetByNumber,
    });
    return applyScoreRenderSelectionToFocusPlan(
      result,
      focusScoreRenderSelection,
      mapRenderIdxToEditorOffset,
      tuneText.length,
    );
  }

  function maybeResetLoopForTune(tuneId, { updateUi: shouldUpdateUi = true } = {}) {
    if (!enabled) return;
    const id = tuneId != null ? String(tuneId) : "";
    if (!id) return;
    const savedId = transport.playbackLoopTuneId != null ? String(transport.playbackLoopTuneId) : "";
    if (savedId && savedId === id) return;

    const normalized = normalizeLoopBounds(0, 0);
    transport.playbackLoopFromMeasure = normalized.from;
    transport.playbackLoopToMeasure = normalized.to;
    focusScoreSelectionAwaitingEnd = false;
    focusScoreRenderSelection = null;
    syncPendingPlaybackPlan();
    if (shouldUpdateUi) updatePracticeUi();
    notifyScoreSelectionChanged();
  }

  function setLoopFromSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    const nextFrom = clampInt(settings.playbackLoopFromMeasure, 0, 100000, 0);
    const nextTo = clampInt(settings.playbackLoopToMeasure, 0, 100000, 0);
    if (
      nextFrom !== transport.playbackLoopFromMeasure
      || nextTo !== transport.playbackLoopToMeasure
    ) {
      focusScoreSelectionAwaitingEnd = false;
      focusScoreRenderSelection = null;
    }
    transport.playbackLoopEnabled = Boolean(settings.playbackLoopEnabled);
    transport.playbackLoopFromMeasure = nextFrom;
    transport.playbackLoopToMeasure = nextTo;
    transport.playbackLoopTuneId = (typeof settings.playbackLoopTuneId === "string") ? settings.playbackLoopTuneId : null;
    updatePracticeUi();
    notifyScoreSelectionChanged();
  }

  function persistCurrentLoopBounds() {
    const patch = {
      playbackLoopFromMeasure: transport.playbackLoopFromMeasure,
      playbackLoopToMeasure: transport.playbackLoopToMeasure,
    };
    const tuneId = getActiveTuneId();
    if (tuneId) {
      transport.playbackLoopTuneId = String(tuneId);
      patch.playbackLoopTuneId = transport.playbackLoopTuneId;
    }
    persistLoopSettingsPatch(patch).catch(() => {});
  }

  function wireControls() {
    if (practiceLoopEnabled) {
      practiceLoopEnabled.addEventListener("change", () => {
        const next = Boolean(practiceLoopEnabled.checked);
        transport.playbackLoopEnabled = next;
        syncPendingPlaybackPlan();
        updatePracticeUi();
        notifyScoreSelectionChanged();
        persistLoopSettingsPatch({ playbackLoopEnabled: next }).catch(() => {});
      });
    }

    if (practiceLoopFrom) {
      practiceLoopFrom.addEventListener("input", () => {
        focusScoreSelectionAwaitingEnd = false;
        focusScoreRenderSelection = null;
        transport.playbackLoopFromMeasure = clampInt(practiceLoopFrom.value, 0, 100000, 0);
        syncPendingPlaybackPlan();
        updatePracticeUi();
        notifyScoreSelectionChanged();
      });
      practiceLoopFrom.addEventListener("change", () => {
        transport.playbackLoopFromMeasure = clampInt(practiceLoopFrom.value, 0, 100000, 0);
        syncPendingPlaybackPlan();
        updatePracticeUi();
        persistCurrentLoopBounds();
        notifyScoreSelectionChanged();
      });
    }

    if (practiceLoopTo) {
      practiceLoopTo.addEventListener("input", () => {
        focusScoreSelectionAwaitingEnd = false;
        focusScoreRenderSelection = null;
        transport.playbackLoopToMeasure = clampInt(practiceLoopTo.value, 0, 100000, 0);
        syncPendingPlaybackPlan();
        updatePracticeUi();
        notifyScoreSelectionChanged();
      });
      practiceLoopTo.addEventListener("change", () => {
        transport.playbackLoopToMeasure = clampInt(practiceLoopTo.value, 0, 100000, 0);
        syncPendingPlaybackPlan();
        updatePracticeUi();
        persistCurrentLoopBounds();
        notifyScoreSelectionChanged();
      });
    }

    if (focusButton) {
      focusButton.addEventListener("click", () => {
        toggle();
      });
    }

    const persistBooleanSetting = (element, key, invert = false) => {
      if (!element) return;
      element.addEventListener("change", () => {
        const value = invert ? !element.checked : Boolean(element.checked);
        persistLoopSettingsPatch({ [key]: value }).catch(() => {});
      });
    };
    persistBooleanSetting(selectionLoopEnabled, "playbackSelectionLoopEnabled");
    persistBooleanSetting(selectionSuppressEnabled, "playbackSelectionSuppressRepeats");
    persistBooleanSetting(selectionGchordsEnabled, "playbackSelectionMuteGchords", true);
    persistBooleanSetting(selectionDrumsEnabled, "playbackSelectionAllowMidiDrums");

    if (selectionMutedVoices) {
      const persistMutedVoices = () => {
        const normalized = String(selectionMutedVoices.value || "")
          .split(/[,\s]+/)
          .map((value) => value.trim())
          .filter(Boolean)
          .join(",");
        persistLoopSettingsPatch({ playbackSelectionMutedVoices: normalized }).catch(() => {});
      };
      selectionMutedVoices.addEventListener("change", persistMutedVoices);
      selectionMutedVoices.addEventListener("blur", persistMutedVoices);
    }

    if (practiceTempo) {
      practiceTempo.addEventListener("input", () => {
        const next = Number(practiceTempo.value);
        if (!Number.isFinite(next)) return;
        applyRuntimeTempo(next);
      });
      const initial = Number(practiceTempo.value);
      if (Number.isFinite(initial)) {
        transport.practiceTempoMultiplier = clampRuntimeTempoMultiplier(initial);
        transport.desiredPlayerSpeed = transport.practiceTempoMultiplier;
      }
    }
    if (practiceTempoDown) {
      practiceTempoDown.addEventListener("click", () => {
        applyRuntimeTempo(stepRuntimeTempoMultiplier(getEditorText(), transport.practiceTempoMultiplier, -1));
      });
    }
    if (practiceTempoUp) {
      practiceTempoUp.addEventListener("click", () => {
        applyRuntimeTempo(stepRuntimeTempoMultiplier(getEditorText(), transport.practiceTempoMultiplier, 1));
      });
    }
    updatePracticeUi();
  }

  return {
    computePlaybackPlan,
    clearScoreSelection,
    getFocusScoreRenderSelection,
    getFocusScoreSelectionBounds,
    isEnabled,
    maybeResetLoopForTune,
    normalizeLoopBounds,
    normalizeLoopBoundsForPlayback,
    setEnabled,
    setLoopFromSettings,
    selectScoreMeasureAtRenderOffset,
    resolveScoreMeasureNumber,
    toggle,
    updatePracticeUi,
    updateUi,
    wireControls,
  };
}
