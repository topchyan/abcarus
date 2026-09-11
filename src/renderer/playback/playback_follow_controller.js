function createPlaybackFollowController({
  windowRef,
  transport,
  getEditorView,
  getOutElement,
  getRenderPane,
  getFollowPlaybackEnabled,
  getFocusModeEnabled,
  clearSvgPlayhead,
  clearSvgFollowBarHighlight,
  clearSvgFollowMeasureHighlight,
  clearSvgPracticeBarHighlight,
  setPracticeBarHighlight,
  findSymbolAtOrBefore,
  upperBoundTime,
  snapIstartToPlayable,
  mapEditorOffsetToRenderIdx,
  mapRenderIdxToEditorOffset,
  findNearestNoteHighlightElements,
  pickClosestNoteElement,
  extractRenderIdxFromElementClass,
  findNearestBarElForNote,
  setSvgPlayheadFromElements,
  highlightSvgFollowMeasureForNote,
  maybeAutoScrollRenderToCursor,
  cancelPlaybackAutoScroll,
} = {}) {
  let followVoiceId = null;
  let followVoiceIndex = null;
  let pendingPlaybackUiIstart = null;
  let pendingPlaybackUiRaf = null;
  let lastPlaybackNoteOnEls = [];
  let lastPlaybackUiRenderIdx = null;
  let lastPlaybackUiEditorIdx = null;
  let lastPlaybackUiScrollAt = 0;
  let suppressFollowScrollUntilMs = 0;

  function nowMs() {
    const perf = windowRef && windowRef.performance;
    return perf && typeof perf.now === "function" ? perf.now() : Date.now();
  }

  function suppressFollowScroll(durationMs = 250) {
    const duration = Math.max(0, Number(durationMs) || 0);
    suppressFollowScrollUntilMs = nowMs() + duration;
  }

  function clearPlaybackNoteOnEls() {
    for (const el of lastPlaybackNoteOnEls) {
      try { el.classList.remove("note-on"); } catch {}
    }
    lastPlaybackNoteOnEls = [];
  }

  function resetPlaybackUiState() {
    clearPlaybackNoteOnEls();
    clearSvgPlayhead();
    clearSvgFollowBarHighlight();
    clearSvgFollowMeasureHighlight();
    clearSvgPracticeBarHighlight();
    setPracticeBarHighlight(null);
    lastPlaybackUiRenderIdx = null;
    lastPlaybackUiEditorIdx = null;
    pendingPlaybackUiIstart = null;
    if (pendingPlaybackUiRaf != null) {
      try { windowRef.cancelAnimationFrame(pendingPlaybackUiRaf); } catch {}
      pendingPlaybackUiRaf = null;
    }
    cancelPlaybackAutoScroll();
  }

  function highlightSourceAt(idx, on) {
    if (!transport.isPlaying) return;
    if (!Number.isFinite(idx)) return;
    const editorView = getEditorView();
    if (!editorView) return;
    const max = editorView.state.doc.length;
    const safeIdx = Math.max(0, Math.min(idx, max));
    const end = Math.min(safeIdx + 1, max);

    if (on) {
      transport.lastRenderIdx = safeIdx;
      editorView.dispatch({ selection: { anchor: safeIdx, head: end } });
      const lineBlock = editorView.lineBlockAt(safeIdx);
      const lineTop = lineBlock.top;
      const viewTop = editorView.scrollDOM.scrollTop;
      const viewBottom = viewTop + editorView.scrollDOM.clientHeight;
      const margin = Math.max(lineBlock.height * 4, 64);
      if (lineTop < viewTop + margin) {
        editorView.scrollDOM.scrollTop = Math.max(0, lineTop - margin);
      } else if (lineTop > viewBottom - margin) {
        editorView.scrollDOM.scrollTop = Math.max(
          0,
          lineTop - editorView.scrollDOM.clientHeight + margin
        );
      }
    } else if (transport.lastRenderIdx === idx) {
      const safeOff = Math.max(0, Math.min(idx, max));
      editorView.dispatch({ selection: { anchor: safeOff, head: safeOff } });
    }
  }

  function maybeScrollEditorToOffset(editorOffset) {
    const editorView = getEditorView();
    if (!editorView) return;
    const max = editorView.state.doc.length;
    const idx = Math.max(0, Math.min(Number(editorOffset) || 0, max));
    const lineBlock = editorView.lineBlockAt(idx);
    const lineTop = lineBlock.top;
    const viewTop = editorView.scrollDOM.scrollTop;
    const viewBottom = viewTop + editorView.scrollDOM.clientHeight;
    const margin = Math.max(lineBlock.height * 4, 64);
    if (lineTop < viewTop + margin) {
      editorView.scrollDOM.scrollTop = Math.max(0, lineTop - margin);
    } else if (lineTop > viewBottom - margin) {
      editorView.scrollDOM.scrollTop = Math.max(
        0,
        lineTop - editorView.scrollDOM.clientHeight + margin
      );
    }
  }

  function maybeScrollRenderToNote(el, { placement = "nearest" } = {}) {
    const renderPane = getRenderPane();
    if (!renderPane || !el) return;
    if (transport.isPlaying || transport.isPaused || transport.waitingForFirstNote) {
      maybeAutoScrollRenderToCursor(el);
      return;
    }
    const containerRect = renderPane.getBoundingClientRect();
    const targetRect = el.getBoundingClientRect();
    const viewTop = renderPane.scrollTop;
    const viewLeft = renderPane.scrollLeft;
    const relTop = targetRect.top - containerRect.top;
    const relBottom = relTop + targetRect.height;
    const relLeft = targetRect.left - containerRect.left;
    const relRight = relLeft + targetRect.width;
    const paneHeight = Math.max(1, renderPane.clientHeight);
    const paneWidth = Math.max(1, renderPane.clientWidth);
    const linePad = Math.min(Math.max(24, targetRect.height * 4), paneHeight * 0.4);
    const colPad = Math.min(Math.max(32, targetRect.width * 0.25), paneWidth * 0.35);
    let nextTop = viewTop;
    let nextLeft = viewLeft;
    if (placement === "comfortable-center") {
      const targetCenterY = (relTop + relBottom) / 2;
      const targetCenterX = (relLeft + relRight) / 2;
      const outsideVerticalComfort = relTop < linePad || relBottom > paneHeight - linePad;
      const outsideHorizontalComfort = relLeft < colPad || relRight > paneWidth - colPad;
      if (outsideVerticalComfort) nextTop = viewTop + targetCenterY - paneHeight / 2;
      if (outsideHorizontalComfort) nextLeft = viewLeft + targetCenterX - paneWidth / 2;
    } else {
      if (relTop < linePad) {
        nextTop = viewTop + (relTop - linePad);
      } else if (relBottom > paneHeight - linePad) {
        nextTop = viewTop + (relBottom - (paneHeight - linePad));
      }
      if (relLeft < colPad) {
        nextLeft = viewLeft + (relLeft - colPad);
      } else if (relRight > paneWidth - colPad) {
        nextLeft = viewLeft + (relRight - (paneWidth - colPad));
      }
    }
    const maxTop = Math.max(0, renderPane.scrollHeight - paneHeight);
    const maxLeft = Math.max(0, renderPane.scrollWidth - paneWidth);
    renderPane.scrollTop = Math.max(0, Math.min(maxTop, nextTop));
    renderPane.scrollLeft = Math.max(0, Math.min(maxLeft, nextLeft));
  }

  function schedulePlaybackUiUpdate(istart) {
    if (!Number.isFinite(istart)) return;
    pendingPlaybackUiIstart = istart;
    if (pendingPlaybackUiRaf != null) return;
    pendingPlaybackUiRaf = windowRef.requestAnimationFrame(() => {
      pendingPlaybackUiRaf = null;
      const i = pendingPlaybackUiIstart;
      pendingPlaybackUiIstart = null;
      if (!transport.isPlaying || transport.isPreviewing) return;
      const effectiveFollow = Boolean(getFollowPlaybackEnabled() || getFocusModeEnabled());
      if (!effectiveFollow) return;
      if (!getOutElement()) return;
      if (!Number.isFinite(i)) return;

      let targetIstart = i;
      if ((followVoiceId != null || followVoiceIndex != null) && transport.playbackState && transport.playbackState.voiceTimeline) {
        const wantId = followVoiceId != null ? String(followVoiceId) : null;
        const wantIndex = followVoiceIndex != null ? String(followVoiceIndex) : null;
        const byId = transport.playbackState.voiceTimeline && transport.playbackState.voiceTimeline.byId ? transport.playbackState.voiceTimeline.byId : null;
        const byIndex = transport.playbackState.voiceTimeline && transport.playbackState.voiceTimeline.byIndex ? transport.playbackState.voiceTimeline.byIndex : null;
        const tl = (wantId && byId && byId[wantId]) ? byId[wantId]
          : (wantIndex && byIndex && byIndex[wantIndex]) ? byIndex[wantIndex]
          : null;

        const sym = findSymbolAtOrBefore(i);
        const currentTime = sym && Number.isFinite(sym.time) ? sym.time : null;
        if (tl && currentTime != null) {
          const times = Array.isArray(tl.times) ? tl.times : null;
          const istarts = Array.isArray(tl.istarts) ? tl.istarts : null;
          if (times && istarts && times.length && times.length === istarts.length) {
            const beforePos = upperBoundTime(times, currentTime) - 1;
            const beforeIdx = Math.max(0, Math.min(istarts.length - 1, beforePos));
            const afterIdx = Math.max(0, Math.min(istarts.length - 1, beforeIdx + 1));
            const beforeTime = Number.isFinite(times[beforeIdx]) ? times[beforeIdx] : null;
            const afterTime = Number.isFinite(times[afterIdx]) ? times[afterIdx] : null;
            let pick = beforeIdx;
            if (beforeTime == null && afterTime != null) {
              pick = afterIdx;
            } else if (beforeTime != null && afterTime != null && afterIdx !== beforeIdx) {
              const dBefore = Math.abs(currentTime - beforeTime);
              const dAfter = Math.abs(afterTime - currentTime);
              if (dAfter <= dBefore) pick = afterIdx;
            }
            const mapped = istarts[pick];
            if (Number.isFinite(mapped)) targetIstart = mapped;
          }
        }
      }
      targetIstart = snapIstartToPlayable(targetIstart);

      const editorView = getEditorView();
      const editorIdx = Math.max(0, targetIstart - transport.playbackIndexOffset);
      const editorLen = editorView ? editorView.state.doc.length : 0;
      const fromInjected = editorLen && editorIdx >= editorLen;
      if (fromInjected) return;

      const renderIdx = mapEditorOffsetToRenderIdx(editorIdx);
      if (lastPlaybackUiEditorIdx === editorIdx && lastPlaybackUiRenderIdx === renderIdx) return;
      lastPlaybackUiEditorIdx = editorIdx;
      lastPlaybackUiRenderIdx = renderIdx;

      clearPlaybackNoteOnEls();
      clearSvgFollowBarHighlight();

      const noteEls = findNearestNoteHighlightElements(renderIdx, 240);
      const chosen = noteEls.length ? pickClosestNoteElement(noteEls) : null;
      if (chosen) {
        const chosenRenderIdx = extractRenderIdxFromElementClass(chosen);
        const chosenEditorIdx = Number.isFinite(chosenRenderIdx)
          ? Math.max(0, mapRenderIdxToEditorOffset(chosenRenderIdx))
          : editorIdx;
        const nearestBar = findNearestBarElForNote(chosen);
        setSvgPlayheadFromElements(chosen, nearestBar);
        highlightSvgFollowMeasureForNote(chosen, nearestBar);
        const now = nowMs();
        if (now - lastPlaybackUiScrollAt > 90) {
          const suppressUntil = Number(suppressFollowScrollUntilMs) || 0;
          if (!suppressUntil || now >= suppressUntil) {
            maybeScrollRenderToNote(chosen);
            lastPlaybackUiScrollAt = now;
          }
        }
        highlightSourceAt(chosenEditorIdx, true);
        return;
      }

      clearSvgPlayhead();
      clearSvgFollowMeasureHighlight();
      highlightSourceAt(editorIdx, true);
    });
  }

  function setFollowVoiceFromPlayback() {
    followVoiceId = null;
    followVoiceIndex = null;
    if (!transport.playbackState) return;
    if (transport.playbackState.preferredVoiceId) followVoiceId = transport.playbackState.preferredVoiceId;
    if (Number.isFinite(transport.playbackState.preferredVoiceIndex)) followVoiceIndex = transport.playbackState.preferredVoiceIndex;
    if (followVoiceId || followVoiceIndex != null) return;
    if (!transport.playbackState.startSymbol) return;
    const voice = transport.playbackState.startSymbol.p_v;
    if (!voice) return;
    if (voice.id) followVoiceId = voice.id;
    if (Number.isFinite(voice.v)) followVoiceIndex = voice.v;
  }

  return {
    clearPlaybackNoteOnEls,
    getFollowVoiceId: () => followVoiceId,
    getFollowVoiceIndex: () => followVoiceIndex,
    highlightSourceAt,
    maybeScrollEditorToOffset,
    maybeScrollRenderToNote,
    resetPlaybackUiState,
    schedulePlaybackUiUpdate,
    setFollowVoiceFromPlayback,
    suppressFollowScroll,
  };
}

export { createPlaybackFollowController };
