import { createScoreMeasureSelectionController } from "./score_measure_selection_controller.js";
import { advanceScoreRenderSelection } from "../playback/focus_score_selection_model.js";

export function createScoreInteractionController({
  outputElement = null,
  renderPane = null,
  getEditorView = () => null,
  getActiveHighlight = () => null,
  mapEditorOffsetToRenderIdx = (value) => value,
  mapRenderIdxToEditorOffset = (value) => value,
  pickClosestNoteElement = () => null,
  setEditorSelectionRange = () => {},
  setPendingPlaybackRangeOrigin = () => {},
  getPlaybackRange = () => ({ loop: false }),
  setPlaybackRange = () => {},
  isFocusModeEnabled = () => false,
  selectFocusMeasureAtRenderOffset = () => null,
  clearFocusScoreSelection = () => false,
  resolveFocusMeasureNumberAtRenderOffset = () => null,
  getFocusScoreSelectionBounds = () => null,
  getFocusScoreRenderSelection = () => null,
  setTimeoutRef = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutRef = (id) => clearTimeout(id),
} = {}) {
  let outputSelectionWired = false;
  let pendingFocusClickTimer = null;
  let normalScoreSelection = null;
  const measureSelection = createScoreMeasureSelectionController({
    outputElement,
    resolveMeasureNumber: resolveFocusMeasureNumberAtRenderOffset,
    getSelectedBounds: getFocusScoreSelectionBounds,
    getSelectedRenderBounds: () => (
      isFocusModeEnabled() ? getFocusScoreRenderSelection() : normalScoreSelection
    ),
  });

  function centerCurrentAnchor() {
    const editorView = getEditorView();
    if (!outputElement || !renderPane || !editorView) return false;
    const activeHighlight = getActiveHighlight();
    const editorOffset = activeHighlight && Number.isFinite(activeHighlight.from)
      ? activeHighlight.from
      : editorView.state.selection.main.anchor;
    const renderIdx = mapEditorOffsetToRenderIdx(Number(editorOffset));
    if (!Number.isFinite(renderIdx)) return false;

    let elements = outputElement.querySelectorAll(`._${renderIdx}_`);
    if (!elements || !elements.length) {
      for (let delta = 1; delta <= 200; delta += 1) {
        const probe = renderIdx - delta;
        if (probe < 0) break;
        elements = outputElement.querySelectorAll(`._${probe}_`);
        if (elements && elements.length) break;
      }
    }
    if (!elements || !elements.length) return false;
    const chosen = pickClosestNoteElement(Array.from(elements));
    if (!chosen) return false;

    const containerRect = renderPane.getBoundingClientRect();
    const targetRect = chosen.getBoundingClientRect();
    const centerTop = (
      targetRect.top
      - containerRect.top
      + renderPane.scrollTop
      - (renderPane.clientHeight / 2)
      + (targetRect.height / 2)
    );
    const centerLeft = (
      targetRect.left
      - containerRect.left
      + renderPane.scrollLeft
      - (renderPane.clientWidth / 2)
      + (targetRect.width / 2)
    );
    renderPane.scrollTop = Math.max(0, centerTop);
    renderPane.scrollLeft = Math.max(0, centerLeft);
    return true;
  }

  function applyNormalScoreClick(event, previousScoreSelection = null) {
    const target = event && event.target;
    if (!target || !target.classList || !target.classList.contains("note-hl")) {
      if (previousScoreSelection) {
        const editorStart = Math.max(0, mapRenderIdxToEditorOffset(previousScoreSelection.playStart));
        setPendingPlaybackRangeOrigin("svg");
        setEditorSelectionRange(editorStart, editorStart);
        setPlaybackRange({ startOffset: editorStart, endOffset: null, origin: "cursor", loop: false });
      }
      return false;
    }
    const start = Number(target.dataset && target.dataset.start);
    const end = Number(target.dataset && target.dataset.end);
    if (!Number.isFinite(start)) return false;
    const editorStart = Math.max(0, mapRenderIdxToEditorOffset(start));
    const editorEndRaw = Number.isFinite(end) && end > start ? end : start + 1;
    const editorEnd = Math.max(editorStart, mapRenderIdxToEditorOffset(editorEndRaw));
    setPendingPlaybackRangeOrigin("score-note");
    setEditorSelectionRange(editorStart, editorEnd);
    setPlaybackRange({
      startOffset: editorStart,
      endOffset: null,
      origin: "score-note",
      loop: false,
    });
    return true;
  }

  function handleOutputClick(event) {
    if (pendingFocusClickTimer != null) clearTimeoutRef(pendingFocusClickTimer);
    if (isFocusModeEnabled() || normalScoreSelection) {
      pendingFocusClickTimer = setTimeoutRef(() => {
        pendingFocusClickTimer = null;
        if (isFocusModeEnabled()) {
          clearFocusScoreSelection();
          measureSelection.clearHighlight();
          return;
        }
        const previousScoreSelection = normalScoreSelection;
        normalScoreSelection = null;
        measureSelection.clearHighlight();
        applyNormalScoreClick(event, previousScoreSelection);
      }, 360);
      return true;
    }
    applyNormalScoreClick(event);
    return true;
  }

  function handleOutputDoubleClick(event) {
    if (pendingFocusClickTimer != null) {
      clearTimeoutRef(pendingFocusClickTimer);
      pendingFocusClickTimer = null;
    }
    const measure = measureSelection.measureAtPoint(
      Number(event && event.clientX) || 0,
      Number(event && event.clientY) || 0,
      event && event.target,
    );
    if (!measure || !Number.isFinite(measure.playStart)) return false;
    if (isFocusModeEnabled()) {
      normalScoreSelection = null;
      const result = selectFocusMeasureAtRenderOffset(measure);
      if (!result) return false;
    } else {
      normalScoreSelection = advanceScoreRenderSelection(normalScoreSelection, measure);
      if (!normalScoreSelection) return false;
      const editorStart = Math.max(0, mapRenderIdxToEditorOffset(normalScoreSelection.playStart));
      const editorEnd = Math.max(editorStart, mapRenderIdxToEditorOffset(normalScoreSelection.playEnd));
      if (!Number.isFinite(editorStart) || !Number.isFinite(editorEnd) || editorEnd <= editorStart) return false;
      setPendingPlaybackRangeOrigin("svg");
      setEditorSelectionRange(editorStart, editorEnd);
      const playbackRange = getPlaybackRange() || {};
      setPlaybackRange({
        startOffset: editorStart,
        endOffset: editorEnd,
        origin: "selection",
        loop: Boolean(playbackRange.loop),
      });
    }
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    measureSelection.renderHighlight();
    return true;
  }

  function handleScoreRendered() {
    if (!isFocusModeEnabled()) normalScoreSelection = null;
    measureSelection.handleScoreRendered();
  }

  function handleFocusSelectionChanged() {
    if (isFocusModeEnabled()) normalScoreSelection = null;
    measureSelection.renderHighlight();
  }

  function wireOutputSelection() {
    if (outputSelectionWired || !outputElement || typeof outputElement.addEventListener !== "function") {
      return false;
    }
    outputSelectionWired = true;
    outputElement.addEventListener("click", handleOutputClick);
    outputElement.addEventListener("dblclick", handleOutputDoubleClick);
    outputElement.addEventListener("abcarus:score-rendered", handleScoreRendered);
    outputElement.addEventListener("abcarus:focus-selection-changed", handleFocusSelectionChanged);
    measureSelection.handleScoreRendered();
    return true;
  }

  return {
    centerCurrentAnchor,
    handleOutputClick,
    handleOutputDoubleClick,
    refreshFocusScoreSelection: measureSelection.renderHighlight,
    wireOutputSelection,
  };
}
