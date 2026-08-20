import {
  buildMeasureIstartsFromAbc2svg,
  buildMeasureStartsByNumberFromAbc2svg,
  findMeasureRangeAt,
  findMeasureStartOffsetByNumber,
  findMeasureStartOffsetByNumberInPrimaryVoice,
} from "../../abc/measure_navigation_model.js";
import { callAbc2svgSafely } from "../../security/abc_security.js";

function createMeasureNavigationController({
  getEditorView = () => null,
  getEditorText = () => "",
  getRenderPayload = () => ({ text: "", offset: 0 }),
  getAbcCtor = () => null,
  neutralizeMidiDrumDirectives = (text) => text,
  mapEditorOffsetToRenderIdx = (offset) => offset,
  mapRenderIdxToEditorOffset = (offset) => offset,
  promptMeasureNumber = async () => null,
  isRawMode = () => false,
  isPlaybackBusy = () => false,
  setStatus = () => {},
  showToast = () => {},
  setPracticeBarHighlight = () => {},
  highlightSvgPracticeBarAtEditorOffset = () => {},
  getSvgPracticeBarElements = () => [],
  pickClosestNoteElement = (els) => (Array.isArray(els) && els.length ? els[0] : null),
  maybeScrollRenderToNote = () => {},
  highlightSvgAtEditorOffset = () => {},
  setTransportPlayheadOffset = () => {},
  syncPendingPlaybackPlan = () => {},
  setTransportJumpHighlightActive = () => {},
  debugWindow = typeof window !== "undefined" ? window : null,
} = {}) {
  let renderMeasureIndexCache = null;

  function getRenderMeasureIndex() {
    const editorView = getEditorView();
    if (!editorView) return null;
    const payload = getRenderPayload();
    const key = `${payload.offset || 0}|||${payload.text || ""}`;
    if (renderMeasureIndexCache && renderMeasureIndexCache.key === key) return renderMeasureIndexCache;

    try {
      const AbcCtor = getAbcCtor();
      const user = {
        img_out: () => {},
        err: () => {},
        errmsg: () => {},
      };
      const abc = new AbcCtor(user);
      const navText = neutralizeMidiDrumDirectives(payload.text || "");
      callAbc2svgSafely(abc, "nav_measures", navText);
      const tunes = abc.tunes || [];
      const first = tunes && tunes[0] ? tunes[0][0] : null;
      if (!first) return null;
      const istarts = buildMeasureIstartsFromAbc2svg(first);
      if (!istarts.length) return null;
      const byNumber = buildMeasureStartsByNumberFromAbc2svg(first);
      const renderOffset = Number(payload.offset) || 0;
      const firstBodyStart = findMeasureStartOffsetByNumber(payload.text || "", 1);
      const minIstart = Math.max(
        renderOffset,
        Number.isFinite(firstBodyStart) ? firstBodyStart : 0
      );
      let anchor = istarts.findIndex((v) => v >= minIstart);
      if (!Number.isFinite(anchor) || anchor < 0) anchor = 0;
      renderMeasureIndexCache = { key, offset: renderOffset, istarts, anchor, byNumber };
      return renderMeasureIndexCache;
    } catch {
      return null;
    }
  }

  async function goToMeasureFromMenu() {
    const editorView = getEditorView();
    if (!editorView) return;
    if (isRawMode()) {
      setStatus("Go to Measure is unavailable in Raw mode.");
      return;
    }
    if (isPlaybackBusy()) {
      setStatus("Stop playback first.");
      return;
    }
    setStatus("Go to Measure...");
    const raw = await promptMeasureNumber();
    if (raw == null) return;
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
      showToast("Invalid measure number.", 2400);
      return;
    }

    const text = getEditorText();
    let idx = null;
    const measureIndex = getRenderMeasureIndex();
    if (
      idx == null
      && measureIndex
      && measureIndex.byNumber
      && typeof measureIndex.byNumber.get === "function"
    ) {
      const list = measureIndex.byNumber.get(n);
      if (Array.isArray(list) && list.length) {
        const cursor = editorView ? editorView.state.selection.main.anchor : 0;
        const currentRenderIdx = mapEditorOffsetToRenderIdx(Number(cursor) || 0);
        let chosen = list[0];
        for (const v of list) {
          if (Number.isFinite(v) && v >= currentRenderIdx) { chosen = v; break; }
        }
        if (Number.isFinite(chosen)) idx = Math.max(0, Math.floor(mapRenderIdxToEditorOffset(chosen)));
      }
    }
    if (idx == null && n >= 1 && measureIndex && Array.isArray(measureIndex.istarts) && measureIndex.istarts.length) {
      const anchor = Number.isFinite(measureIndex.anchor) ? measureIndex.anchor : 0;
      const slot = (n - 1) + anchor;
      const istart = measureIndex.istarts[slot];
      if (Number.isFinite(istart)) {
        idx = Math.max(0, Math.floor(istart - (Number(measureIndex.offset) || 0)));
        if (debugWindow && debugWindow.__abcarusDebugGoToMeasure) {
          try {
            console.log("[abcarus] goToMeasure", { n, anchor, slot, istart, renderOffset: measureIndex.offset, idx });
          } catch {}
        }
      }
    }
    if (idx == null && n >= 1) idx = findMeasureStartOffsetByNumber(text, n);
    if (idx == null) {
      showToast(`Measure ${n} not found.`, 2600);
      return;
    }

    const max = editorView.state.doc.length;
    const pos = Math.max(0, Math.min(idx, max));
    editorView.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });

    setTransportPlayheadOffset(pos);
    syncPendingPlaybackPlan();

    try {
      const range = findMeasureRangeAt(text, pos);
      if (range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start) {
        setPracticeBarHighlight({ from: range.start, to: range.end });
        highlightSvgPracticeBarAtEditorOffset(pos);
        const practiceBarEls = getSvgPracticeBarElements();
        const chosen = practiceBarEls.length ? pickClosestNoteElement(practiceBarEls) : null;
        if (chosen) maybeScrollRenderToNote(chosen);
        setTransportJumpHighlightActive(true);
      } else {
        highlightSvgAtEditorOffset(pos);
      }
    } catch {}
    setStatus(`Go to measure: ${n}`);
  }

  function clearCache() {
    renderMeasureIndexCache = null;
  }

  return {
    clearCache,
    findMeasureRangeAt,
    findMeasureStartOffsetByNumber,
    findMeasureStartOffsetByNumberInPrimaryVoice,
    getRenderMeasureIndex,
    goToMeasureCommand: goToMeasureFromMenu,
    goToMeasureFromMenu,
  };
}

export {
  createMeasureNavigationController,
};
