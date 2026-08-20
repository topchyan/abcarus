import { callAbc2svgSafely } from "../security/abc_security.js";

function createRenderPipelineController({
  windowRef = typeof window !== "undefined" ? window : null,
  outputElement = null,
  getRawMode = () => false,
  isChordProFullView = () => false,
  isChordProEnabled = () => false,
  chordProHasBlocks = () => true,
  getEditorText = () => "",
  getEditorView = () => null,
  getRenderPayload = () => ({ text: "", offset: 0 }),
  normalizeHeaderText = (text) => String(text || ""),
  stripSepForRender = (text) => ({ text: String(text || ""), replaced: false }),
  assertCleanAbcText = () => true,
  ensureAbc2svgLoader = () => {},
  ensureAbc2svgModules = () => true,
  getAbcCtor = () => null,
  clearNoteSelection = () => {},
  invalidateNoteHighlightIndexCache = () => {},
  clearErrors = () => {},
  setRenderBusy = () => {},
  setStatus = () => {},
  logError = () => {},
  addError = () => {},
  setBarMismatchMarkers = () => {},
  setErrorLineOffset = () => {},
  setErrorLineOffsetFromHeader = () => {},
  updateLibraryErrorIndexFromCurrentErrors = () => {},
  reconcileActiveErrorHighlightAfterRender = () => {},
  detectMeterMismatchInBarlines = () => null,
  detectRepeatMarkerAfterShortBar = () => null,
  applyMeasureHighlights = () => {},
  highlightNoteAtIndex = () => {},
  getActiveErrorHighlightRange = () => null,
  highlightSvgAtEditorOffset = () => {},
  isPlaybackBusy = () => false,
  isTransportJumpHighlightActive = () => false,
  highlightSvgPracticeBarAtEditorOffset = () => {},
  isDebugMessagesEnabled = () => false,
  setTransientBufferStatus = () => {},
  isRenderPerfEnabled = () => false,
  perfNowMs = () => Date.now(),
  logRenderPerf = () => {},
  refreshBarMismatchMarkersForTune = () => {},
  addBarMismatchErrorsFromMarkers = () => {},
  updateErrorsIndicatorAndPopover = () => {},
  getErrorCount = () => undefined,
} = {}) {
  let pendingRenderTimer = null;
  let pendingRenderRaf = null;
  let renderRequestToken = 0;
  let pendingRenderPerfContext = null;
  let activeRenderPerfContext = null;
  let pendingBarMismatchAnalysisRaf = null;
  let lastRenderPayload = null;

  const requestFrame = (fn) => {
    const raf = windowRef && typeof windowRef.requestAnimationFrame === "function"
      ? windowRef.requestAnimationFrame.bind(windowRef)
      : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
    if (raf) return raf(fn);
    return setTimeout(fn, 0);
  };

  const cancelFrame = (id) => {
    if (!id) return;
    try {
      const cancel = windowRef && typeof windowRef.cancelAnimationFrame === "function"
        ? windowRef.cancelAnimationFrame.bind(windowRef)
        : (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
      if (cancel) cancel(id);
      else clearTimeout(id);
    } catch {}
  };

  function getLastPayload() {
    return lastRenderPayload;
  }

  function cancelPendingBarMismatchAnalysis() {
    if (!pendingBarMismatchAnalysisRaf) return;
    cancelFrame(pendingBarMismatchAnalysisRaf);
    pendingBarMismatchAnalysisRaf = null;
  }

  function clearOutput(statusText = "Ready") {
    cancelPendingBarMismatchAnalysis();
    setBarMismatchMarkers([]);
    setStatus(statusText || "Ready");
    if (outputElement) outputElement.innerHTML = "";
    invalidateNoteHighlightIndexCache();
    setRenderBusy(false);
    updateLibraryErrorIndexFromCurrentErrors();
    reconcileActiveErrorHighlightAfterRender({ renderSucceeded: false });
  }

  function scheduleBarMismatchAnalysisAfterRender(tuneText, token) {
    cancelPendingBarMismatchAnalysis();
    if (!tuneText) return;
    try {
      const text = String(tuneText || "");
      pendingBarMismatchAnalysisRaf = requestFrame(() => {
        pendingBarMismatchAnalysisRaf = null;
        if (Number(token) !== Number(renderRequestToken)) return;
        const perfOn = isRenderPerfEnabled();
        const t0 = perfOn ? perfNowMs() : 0;
        refreshBarMismatchMarkersForTune(text, { deferEditorRefresh: true });
        addBarMismatchErrorsFromMarkers();
        updateLibraryErrorIndexFromCurrentErrors();
        updateErrorsIndicatorAndPopover();
        if (perfOn) {
          logRenderPerf("bar mismatch: after render", {
            token,
            ms: Math.round(perfNowMs() - t0),
          });
        }
      });
    } catch {}
  }

  function scheduleRenderNow({ delayMs = 0, clearOutput = false, source = "" } = {}) {
    if (getRawMode() || isChordProFullView()) return;
    renderRequestToken += 1;
    const token = renderRequestToken;
    if (pendingRenderTimer) {
      clearTimeout(pendingRenderTimer);
      pendingRenderTimer = null;
    }
    if (pendingRenderRaf) {
      cancelFrame(pendingRenderRaf);
      pendingRenderRaf = null;
    }

    if (clearOutput) {
      try {
        setStatus("Rendering…");
        setRenderBusy(true);
      } catch {}
    }

    if (isRenderPerfEnabled()) {
      pendingRenderPerfContext = {
        token,
        requestedAtMs: perfNowMs(),
        source: String(source || "scheduleRenderNow"),
        clearOutput: Boolean(clearOutput),
        delayMs: Number(delayMs) || 0,
        editorChars: String(getEditorText() || "").length,
      };
      logRenderPerf("schedule", {
        token,
        source: pendingRenderPerfContext.source,
        clearOutput: pendingRenderPerfContext.clearOutput,
        delayMs: pendingRenderPerfContext.delayMs,
        editorChars: pendingRenderPerfContext.editorChars,
      });
    } else {
      pendingRenderPerfContext = null;
    }

    const run = () => {
      if (token !== renderRequestToken) return;
      activeRenderPerfContext = pendingRenderPerfContext && pendingRenderPerfContext.token === token
        ? pendingRenderPerfContext
        : null;
      if (activeRenderPerfContext) {
        logRenderPerf("raf -> renderNow", {
          token,
          source: activeRenderPerfContext.source,
          waitMs: Math.round(perfNowMs() - activeRenderPerfContext.requestedAtMs),
        });
      }
      try {
        renderNow();
      } finally {
        activeRenderPerfContext = null;
      }
    };

    if (delayMs > 0) {
      pendingRenderTimer = setTimeout(() => {
        pendingRenderTimer = null;
        pendingRenderRaf = requestFrame(() => {
          pendingRenderRaf = null;
          run();
        });
      }, delayMs);
      return;
    }

    pendingRenderRaf = requestFrame(() => {
      pendingRenderRaf = null;
      run();
    });
  }

  function renderNow() {
    const perfOn = isRenderPerfEnabled();
    const tRender0 = perfOn ? perfNowMs() : 0;
    const perfContext = activeRenderPerfContext;
    const renderToken = perfContext && Number.isFinite(Number(perfContext.token))
      ? Number(perfContext.token)
      : Number(renderRequestToken);
    cancelPendingBarMismatchAnalysis();
    clearNoteSelection();
    invalidateNoteHighlightIndexCache();
    clearErrors();
    setRenderBusy(true);
    const currentText = getEditorText();
    if (isChordProEnabled() && isChordProFullView()) {
      clearOutput("ChordPro full view.");
      return;
    }
    if (isChordProEnabled() && !chordProHasBlocks()) {
      clearOutput("No ABC blocks.");
      return;
    }
    if (!currentText.trim()) {
      setBarMismatchMarkers([]);
      setStatus("Ready");
      setRenderBusy(false);
      updateLibraryErrorIndexFromCurrentErrors();
      reconcileActiveErrorHighlightAfterRender({ renderSucceeded: true });
      if (perfOn) {
        logRenderPerf("renderNow: empty", {
          token: perfContext ? perfContext.token : null,
          totalMs: Math.round(perfNowMs() - tRender0),
        });
      }
      return;
    }
    const tPrepare0 = perfOn ? perfNowMs() : 0;
    let tPrepareStep = tPrepare0;
    const logPrepareStep = (label, data = {}) => {
      if (!perfOn) return;
      const now = perfNowMs();
      logRenderPerf(`renderNow: prepare ${label}`, {
        token: perfContext ? perfContext.token : null,
        ms: Math.round(now - tPrepareStep),
        totalMs: Math.round(now - tPrepare0),
        ...data,
      });
      tPrepareStep = now;
    };
    const renderPayload = getRenderPayload();
    logPrepareStep("payload", {
      payloadChars: renderPayload && renderPayload.text ? String(renderPayload.text).length : 0,
      offset: renderPayload ? (renderPayload.offset || 0) : 0,
    });
    if (!assertCleanAbcText(renderPayload.text, "renderNow")) {
      logError("ABC text corruption detected (render).");
      setStatus("Error");
      setRenderBusy(false);
      updateLibraryErrorIndexFromCurrentErrors();
      return;
    }
    const renderTextBase = normalizeHeaderText(renderPayload.text);
    const sepStripInitial = stripSepForRender(renderTextBase);
    let renderText = sepStripInitial.replaced ? sepStripInitial.text : renderTextBase;
    let sepFallbackUsed = sepStripInitial.replaced;
    logPrepareStep("normalize", {
      renderChars: String(renderText || "").length,
      sepFallbackUsed,
    });
    lastRenderPayload = {
      text: renderText,
      offset: renderPayload.offset || 0,
      lineOffset: Number.isFinite(renderPayload.lineOffset) ? renderPayload.lineOffset : null,
      compatMap: null,
    };
    if (Number.isFinite(renderPayload.lineOffset)) {
      setErrorLineOffset(renderPayload.lineOffset);
    } else {
      setErrorLineOffsetFromHeader(renderPayload.text.slice(0, renderPayload.offset || 0));
    }
    setStatus("Rendering…");
    if (perfOn) {
      logRenderPerf("renderNow: prepared", {
        token: perfContext ? perfContext.token : null,
        source: perfContext ? perfContext.source : "direct",
        ms: Math.round(perfNowMs() - tPrepare0),
        editorChars: currentText.length,
        payloadChars: String(renderText || "").length,
        offset: renderPayload.offset || 0,
      });
    }

    try {
      ensureAbc2svgLoader();
      if (!ensureAbc2svgModules(renderText)) {
        setStatus("Loading modules…");
        setRenderBusy(true);
        return;
      }

      let attempts = 0;
      while (attempts < 2) {
        attempts += 1;
        try {
          const svgParts = [];
          let abcInstance = null;

          const user = {
            img_out: (s) => svgParts.push(s),
            err: (msg) => logError(msg),
            errmsg: (msg, line, col) => {
              const loc = Number.isFinite(line) && Number.isFinite(col)
                ? { line: line + 1, col: col + 1 }
                : null;
              logError(msg, loc);
            },
            anno_stop: (type, start, stop, x, y, w, h) => {
              if (!abcInstance) return;
              if (type === "beam" || type === "slur" || type === "tuplet") return;
              const cls = type === "bar" ? "bar-hl" : "note-hl";
              abcInstance.out_svg(
                '<rect class="' + cls + ' _' + start + '_" data-start="' + start + '" data-end="' + stop + '" x="'
              );
              abcInstance.out_sxsy(x, '" y="', y);
              abcInstance.out_svg(
                '" width="' + w.toFixed(2) + '" height="' + abcInstance.sh(h).toFixed(2) + '"/>\n'
              );
            },
          };

          const AbcCtor = getAbcCtor();
          if (!AbcCtor) throw new Error("abc2svg constructor not found. Check third_party/abc2svg scripts.");

          const abc = new AbcCtor(user);
          abcInstance = abc;
          const tSvg0 = perfOn ? perfNowMs() : 0;
          callAbc2svgSafely(abc, "out", renderText);
          if (perfOn) {
            logRenderPerf("renderNow: abc2svg", {
              token: perfContext ? perfContext.token : null,
              attempt: attempts,
              ms: Math.round(perfNowMs() - tSvg0),
              svgParts: svgParts.length,
            });
          }
          const meterWarn = detectMeterMismatchInBarlines(renderText);
          if (meterWarn && meterWarn.detail) {
            addError(`Warning: Meter mismatch: ${meterWarn.detail}`, meterWarn.loc || null, { skipMeasureRange: true });
          }
          const repeatWarn = detectRepeatMarkerAfterShortBar(renderText);
          if (repeatWarn && repeatWarn.detail) {
            addError(`Warning: ${repeatWarn.detail}`, repeatWarn.loc || null, { skipMeasureRange: true });
          }

          const svg = svgParts.join("");
          if (!svg.trim()) throw new Error("No SVG output produced (see errors).");
          const tDom0 = perfOn ? perfNowMs() : 0;
          if (outputElement) {
            outputElement.innerHTML = svg;
            try { outputElement.dispatchEvent(new Event("abcarus:score-rendered")); } catch {}
          }
          invalidateNoteHighlightIndexCache();
          applyMeasureHighlights(renderPayload.offset || 0);
          const editorView = getEditorView();
          if (editorView) {
            const anchor = editorView.state.selection.main.anchor;
            highlightNoteAtIndex(anchor);
            const activeErrorRange = getActiveErrorHighlightRange();
            if (activeErrorRange && Number.isFinite(activeErrorRange.from)) {
              highlightSvgAtEditorOffset(activeErrorRange.from);
            }
            if (!isPlaybackBusy() && isTransportJumpHighlightActive() && Number.isFinite(anchor)) {
              try {
                highlightSvgPracticeBarAtEditorOffset(anchor);
              } catch {}
            }
          }
          if (sepFallbackUsed && isDebugMessagesEnabled()) {
            setTransientBufferStatus("Note: %%sep ignored for rendering.");
          }
          setStatus("OK");
          setRenderBusy(false);
          updateLibraryErrorIndexFromCurrentErrors();
          reconcileActiveErrorHighlightAfterRender({ renderSucceeded: true });
          scheduleBarMismatchAnalysisAfterRender(currentText, renderToken);
          if (perfOn) {
            logRenderPerf("renderNow: done", {
              token: perfContext ? perfContext.token : null,
              domMs: Math.round(perfNowMs() - tDom0),
              totalMs: Math.round(perfNowMs() - tRender0),
              svgChars: svg.length,
              errors: getErrorCount(),
            });
          }
          break;
        } catch (e) {
          if (!sepFallbackUsed) {
            const sepStrip = stripSepForRender(renderText);
            if (sepStrip.replaced) {
              sepFallbackUsed = true;
              renderText = sepStrip.text;
              lastRenderPayload = {
                text: renderText,
                offset: renderPayload.offset || 0,
                lineOffset: Number.isFinite(renderPayload.lineOffset) ? renderPayload.lineOffset : null,
                compatMap: null,
              };
              continue;
            }
          }
          throw e;
        }
      }
    } catch (e) {
      logError((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
      setRenderBusy(false);
      updateLibraryErrorIndexFromCurrentErrors();
      reconcileActiveErrorHighlightAfterRender({ renderSucceeded: false });
    }
  }

  return {
    clearOutput,
    getLastPayload,
    renderNow,
    scheduleRenderNow,
  };
}

export {
  createRenderPipelineController,
};
