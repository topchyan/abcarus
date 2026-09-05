function createPlaybackStartController({
  transport,
  selectionRuntime,
  getEditorView,
  getPlaybackRange,
  setPlaybackRange,
  clonePlaybackRange,
  getPlaybackSourceKey,
  preparePlayback,
  ensureSoundfontReady,
  stopPlaybackForRestart,
  stopPlaybackFromGuard,
  recordDebugLog,
  scheduleAutoDump,
  setStatus,
  updatePlayButton,
  clearNoteSelection,
  resetPlaybackUiState,
  setSoundfontCaption,
  showToast,
  updatePracticeUi,
  getScopedPlaybackSettingsForOrigin,
  withScopedPlaybackOrigin,
  getStripChordSymbols,
  toDerivedOffset,
  toEditorOffset,
  findSymbolAtOrAfter,
  findSymbolAtOrBefore,
  findMeasureIndex,
  isFollowPlaybackEnabled,
  getDebugParts,
} = {}) {
  function playbackStartFailureMessage(error) {
    const message = error && error.message ? String(error.message) : String(error || "");
    if (
      /AudioBufferSourceNode/i.test(message)
      && /loop(?:Start|End)/i.test(message)
      && /non-finite/i.test(message)
    ) {
      return "Selected SoundFont is incompatible with abc2svg (invalid sample loop points). Choose another SF2.";
    }
    return "Playback failed to start. Try again.";
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

  function getDocLength() {
    const editorView = getEditorView();
    return editorView ? editorView.state.doc.length : 0;
  }

  function startPlaybackFromPrepared(startIdx) {
    if (!transport.playbackStartArmed) {
      stopPlaybackFromGuard("Playback start invoked outside startPlaybackFromRange().");
      return;
    }
    const startSymbol = findSymbolAtOrAfter(startIdx);
    if (!startSymbol) throw new Error("Playback start not found.");

    let start = startSymbol;
    if (transport.playbackState && transport.playbackState.symbols.length) {
      const isPlayable = (symbol) => !!(symbol && Number.isFinite(symbol.dur) && symbol.dur > 0);
      if (!isPlayable(start)) {
        const fallback = transport.playbackState.symbols.find((item) =>
          item.symbol && Number.isFinite(item.symbol.istart) && item.symbol.istart >= start.istart && isPlayable(item.symbol)
        );
        if (fallback) start = fallback.symbol;
      }
    }

    let endSym = transport.activePlaybackEndSymbol || null;
    if (endSym && Number.isFinite(endSym.istart) && Number.isFinite(start.istart) && endSym.istart <= start.istart) {
      endSym = null;
    }

    transport.markPreparedStart(start);

    if (getDebugParts()) {
      try {
        const getPartLetterAtSymbol = (sym) => {
          let s = sym;
          let guard = 0;
          while (s && guard < 200000) {
            if (s.part && s.part.text) return String(s.part.text || "")[0] || "?";
            s = s.ts_prev;
            guard += 1;
          }
          return "?";
        };
        const computePartIndexLikeSnd = (sym) => {
          let s = sym;
          let guard = 0;
          while (s && guard < 200000) {
            if (s.parts) return { i_p: -1, hit: "parts", at: Number.isFinite(s.istart) ? s.istart : null };
            const s_p = s.part1;
            const p_s = s_p && Array.isArray(s_p.p_s) ? s_p.p_s : null;
            if (p_s) {
              for (let i = 0; i < p_s.length; i += 1) {
                if (p_s[i] === s) return { i_p: i, hit: "p_s", at: Number.isFinite(s.istart) ? s.istart : null };
              }
            }
            s = s.ts_prev;
            guard += 1;
          }
          return { i_p: undefined, hit: null, at: null };
        };
        const idxInfo = computePartIndexLikeSnd(start);
        let partsSeq = null;
        try {
          let s = start;
          let guard = 0;
          while (s && guard < 200000) {
            if (typeof s.parts === "string" && s.parts) { partsSeq = s.parts; break; }
            s = s.ts_prev;
            guard += 1;
          }
        } catch {}
        console.log("[abcarus] playback start (parts)", {
          startIstart: start.istart,
          startEditorOffset: Number.isFinite(start.istart) ? (start.istart - (transport.playbackIndexOffset || 0)) : null,
          partAtStart: getPartLetterAtSymbol(start),
          i_p: idxInfo.i_p,
          i_p_hit: idxInfo.hit,
          i_p_at: idxInfo.at,
          partsSeq,
        });
      } catch {}
    }

    let engineStart = start;
    const rangeForStart = transport.activePlaybackRange || getPlaybackRange();
    const startsAtTuneHead = transport.playbackState
      && transport.playbackState.startSymbol
      && start === transport.playbackState.startSymbol;
    const isFullFocusStart = startsAtTuneHead
      && rangeForStart
      && rangeForStart.origin === "focus"
      && rangeForStart.endOffset == null
      && !rangeForStart.loop;
    const isFullPartOrderStart = rangeForStart
      && (
        Number(rangeForStart.startOffset) === 0
        || (
          startsAtTuneHead
          && (rangeForStart.origin === "cursor" || rangeForStart.origin === "transport")
        )
        || isFullFocusStart
      );
    if (
      isFullPartOrderStart
      && transport.playbackState
      && transport.playbackState.rootSymbol
    ) {
      let hasPartsOrder = false;
      for (let probe = start, guard = 0; probe && guard < 200000; probe = probe.ts_prev, guard += 1) {
        if (probe.parts || (probe.part1 && Array.isArray(probe.part1.p_s))) {
          hasPartsOrder = true;
          break;
        }
      }
      if (hasPartsOrder) engineStart = transport.playbackState.rootSymbol;
    }

    const rangeGap = rangeForStart && Number(rangeForStart.loopGapMs);
    const loopGapMs = Math.max(0, Math.min(5000, Math.round(
      Number.isFinite(rangeGap) ? rangeGap : (Number(transport.playbackLoopGapMs) || 0)
    )));
    const useNativeLoop = Boolean(
      rangeForStart
      && rangeForStart.loop
      && loopGapMs === 0
      && (rangeForStart.origin === "focus" || rangeForStart.origin === "selection" || rangeForStart.origin === "ab")
    );
    let playerStart = engineStart;
    if (useNativeLoop) {
      // abc2svg restarts native loops at loopStart.ts_next. A silent proxy lets
      // both the first pass and every subsequent pass begin at the same symbol.
      playerStart = {
        type: -1,
        dur: 0,
        ptim: Number(engineStart.ptim) || 0,
        time: Number(engineStart.time) || 0,
        v: engineStart.v,
        p_v: engineStart.p_v,
        seqst: true,
        ts_prev: engineStart.ts_prev || null,
        ts_next: engineStart,
      };
    }

    transport.player.play(playerStart, endSym, 0, useNativeLoop);
    transport.markPlayingStarted();
    if (!transport.waitingForFirstNote) setStatus("Playing…");
    updatePlayButton();
    setTimeout(() => {
      transport.allowPlaybackEnd();
    }, 0);
  }

  function resolvePlaybackEndSymbol(range, startSymbol) {
    if (!range || range.endOffset == null) return null;
    if (!startSymbol || !Number.isFinite(startSymbol.istart)) return null;
    const endOffset = Number(range.endOffset);
    if (!Number.isFinite(endOffset)) return null;
    const endAbcOffset = endOffset + transport.playbackIndexOffset;
    if (!Number.isFinite(endAbcOffset) || endAbcOffset <= startSymbol.istart) return null;
    const lastInRange = findSymbolAtOrBefore(endAbcOffset - 1);
    if (!lastInRange || !Number.isFinite(lastInRange.istart)) return null;
    if (lastInRange.istart <= startSymbol.istart) return null;
    let endSymbol = lastInRange.ts_next || null;
    // Audio expansion inserts drums and accompaniment into the timeline without
    // source offsets. They belong to the selected source symbol, so stopping at
    // the first one would exclude that symbol's generated playback entirely.
    while (endSymbol && !Number.isFinite(endSymbol.istart)) {
      endSymbol = endSymbol.ts_next || null;
    }
    return endSymbol;
  }

  async function startPlaybackFromRange(rangeOverride) {
    const editorView = getEditorView();
    if (!editorView) return;
    const startToken = transport.beginStartAttempt();
    const abortStart = (message) => {
      if (!transport.abortStartAttempt(startToken, message)) return;
      try { recordDebugLog("warn", [`Playback abort: ${transport.lastPlaybackAbortMessage}`]); } catch {}
      try { scheduleAutoDump("playback-abort", transport.lastPlaybackAbortMessage); } catch {}
      setStatus("OK");
      updatePlayButton();
      clearNoteSelection();
      resetPlaybackUiState();
      setSoundfontCaption();
      if (message) showToast(message, 2600);
    };
    let range = clonePlaybackRange(rangeOverride || getPlaybackRange());
    const max = editorView.state.doc.length;
    if (!Number.isFinite(range.startOffset) || range.startOffset < 0 || range.startOffset > max) {
      abortStart("Playback range start is invalid.");
      return;
    }

    if (transport.activePlaybackRange && transport.isPlaying) {
      stopPlaybackFromGuard("Second PlaybackRange attempted to become active while playing.");
      return;
    }

    clearNoteSelection();
    const rangeOrigin = String((range && range.origin) || "cursor");
    const selectionMode = range && (rangeOrigin === "selection" || rangeOrigin === "ab");
    const scopedMode = range && (rangeOrigin === "selection" || rangeOrigin === "ab" || rangeOrigin === "focus");
    if (rangeOrigin === "focus" || rangeOrigin === "selection") {
      selectionRuntime.setScopedOptions(withScopedPlaybackOrigin(getScopedPlaybackSettingsForOrigin(rangeOrigin), rangeOrigin));
    } else if (rangeOrigin === "ab") {
      const abMuted = selectionRuntime.getAbMutedVoiceIds();
      selectionRuntime.setScopedOptions({
        origin: "ab",
        allowMidiDrums: true,
        muteGchords: getStripChordSymbols(),
        suppressRepeats: true,
        mutedVoices: abMuted,
      });
    } else {
      selectionRuntime.clearScopedOptions();
    }
    if (range && typeof range === "object") {
      const scopedOptions = selectionRuntime.getScopedOptions();
      if (scopedOptions && typeof scopedOptions.suppressRepeats === "boolean") {
        range.suppressRepeats = Boolean(scopedOptions.suppressRepeats);
      } else if (typeof range.suppressRepeats !== "boolean") {
        range.suppressRepeats = null;
      }
    }
    const sourceKey = selectionMode ? null : getPlaybackSourceKey();
    const canReuse = (
      !scopedMode
      && !transport.playbackNeedsReprepare
      && !transport.lastPlaybackHasParts
      && transport.playbackState
      && transport.lastPreparedPlaybackKey
      && sourceKey
      && transport.lastPreparedPlaybackKey === sourceKey
      && transport.player
    );
    transport.setWaitingForFirstNote(true);
    try {
      if (!canReuse) {
        stopPlaybackForRestart();
        setSoundfontCaption("Loading...");
        selectionRuntime.setSelectionMode(selectionMode);
        await preparePlayback();
      } else {
        await ensureSoundfontReady();
        stopPlaybackForRestart();
      }
    } catch (e) {
      transport.lastPlaybackException = {
        phase: "preparePlayback",
        message: (e && e.message) ? String(e.message) : String(e),
        stack: (e && e.stack) ? String(e.stack) : null,
      };
      try { scheduleAutoDump("playback-start-failed", (e && e.message) ? e.message : String(e)); } catch {}
      stopPlaybackFromGuard(`Playback start failed: ${(e && e.message) ? e.message : String(e)}`);
      if (selectionMode) {
        showToast("Selected range cannot be played safely.", 3200);
      } else {
        showToast(playbackStartFailureMessage(e), 8000);
      }
      return;
    } finally {
      selectionRuntime.setSelectionMode(false);
      selectionRuntime.clearScopedOptions();
    }
    if (startToken !== transport.playbackStartToken) return;

    updatePracticeUi();

    const startAbcOffset = toDerivedOffset(range.startOffset);
    if (!Number.isFinite(startAbcOffset)) {
      abortStart("Playback range start is invalid.");
      return;
    }
    let startSym = findSymbolAtOrAfter(startAbcOffset);
    if (!scopedMode && Number.isFinite(startAbcOffset) && startAbcOffset > 0 && editorView) {
      let ch = "";
      try { ch = editorView.state.doc.sliceString(range.startOffset, range.startOffset + 1); } catch {}
      if (/\s/.test(String(ch || ""))) {
        const prevSym = findSymbolAtOrBefore(startAbcOffset - 1);
        if (prevSym && Number.isFinite(prevSym.istart) && Number.isFinite(prevSym.dur) && prevSym.dur > 0 && !prevSym.noplay) {
          const prevEditorOffset = toEditorOffset(prevSym.istart);
          if (Number.isFinite(prevEditorOffset)) {
            let between = "";
            try {
              const a = Math.max(0, Math.min(range.startOffset, prevEditorOffset));
              const b = Math.max(a, Math.max(range.startOffset, prevEditorOffset));
              between = editorView.state.doc.sliceString(a, b);
            } catch {}
            if (!/[\n|]/.test(String(between || ""))) {
              if (!startSym || !Number.isFinite(startSym.istart) || prevSym.istart < startSym.istart) {
                startSym = prevSym;
                range.startOffset = Math.max(0, prevEditorOffset);
              }
            }
          }
        }
      }
    }
    if (!startSym || !Number.isFinite(startSym.istart)) {
      if (!scopedMode && startAbcOffset > 0) {
        const fallbackSym = findSymbolAtOrAfter(0);
        if (fallbackSym && Number.isFinite(fallbackSym.istart)) {
          range.startOffset = 0;
          startSym = fallbackSym;
        }
      }
    }
    if (
      startSym
      && Number.isFinite(startSym.istart)
      && !scopedMode
      && startAbcOffset > 0
      && startSym.istart < startAbcOffset
    ) {
      const fallbackSym = findSymbolAtOrAfter(0);
      if (fallbackSym && Number.isFinite(fallbackSym.istart)) {
        range.startOffset = 0;
        startSym = fallbackSym;
      }
    }
    if (!startSym || !Number.isFinite(startSym.istart)) {
      abortStart("Playback start is not mappable.");
      return;
    }

    if (startSym.istart < startAbcOffset && range.startOffset !== 0) {
      stopPlaybackFromGuard("PlaybackRange.startOffset mapped to a symbol before startOffset.");
      return;
    }

    transport.activateRangeForStart({
      range,
      endSymbol: resolvePlaybackEndSymbol(range, startSym),
      startSymbol: startSym,
    });
    try {
      startPlaybackFromPrepared(startSym.istart);
    } catch (e) {
      transport.lastPlaybackException = {
        phase: "startPlaybackFromPrepared",
        message: (e && e.message) ? String(e.message) : String(e),
        stack: (e && e.stack) ? String(e.stack) : null,
      };
      stopPlaybackFromGuard(`Playback start failed: ${(e && e.message) ? e.message : String(e)}`);
      showToast(playbackStartFailureMessage(e), 8000);
      return;
    }
    transport.finishStartAttempt();
  }

  async function startPlaybackAtIndex(startIdx) {
    const max = getDocLength();
    const next = Number.isFinite(startIdx) ? Math.max(0, Math.min(startIdx, max)) : 0;
    setPlaybackRange({
      startOffset: next,
      endOffset: null,
      origin: "cursor",
      loop: getPlaybackRange().loop,
    });
    await startPlaybackFromRange();
  }

  function pausePlayback() {
    if (!transport.player || !transport.isPlaying) return;
    stopPlaybackForRestart();
    transport.pause({ selectionSignature: getEditorSelectionSignature() });
    setStatus("Paused");
    updatePlayButton();
    setSoundfontCaption();
    if (Number.isFinite(transport.lastRenderIdx)) {
      setPlaybackRange({
        startOffset: transport.lastRenderIdx,
        endOffset: null,
        origin: "cursor",
        loop: getPlaybackRange().loop,
      });
    }
    const editorView = getEditorView();
    if (isFollowPlaybackEnabled() && transport.lastRenderIdx != null && editorView) {
      const max = editorView.state.doc.length;
      const idx = Math.max(0, Math.min(transport.lastRenderIdx, max));
      editorView.dispatch({ selection: { anchor: idx, head: idx } });
    }
  }

  async function startPlaybackAtMeasureOffset(delta) {
    clearNoteSelection();
    const sourceKey = getPlaybackSourceKey();
    const canReuse = (
      !transport.playbackNeedsReprepare
      && !transport.lastPlaybackHasParts
      && transport.playbackState
      && transport.lastPreparedPlaybackKey
      && transport.lastPreparedPlaybackKey === sourceKey
      && transport.player
    );
    if (!canReuse) {
      stopPlaybackForRestart();
      await preparePlayback();
    } else {
      await ensureSoundfontReady();
      stopPlaybackForRestart();
    }
    if (!transport.playbackState || !transport.playbackState.measures.length) {
      setPlaybackRange({
        startOffset: 0,
        endOffset: null,
        origin: "cursor",
        loop: getPlaybackRange().loop,
      });
      await startPlaybackFromRange();
      return;
    }
    const baseIdx = Number.isFinite(transport.lastPlaybackIdx) ? transport.lastPlaybackIdx : transport.lastStartPlaybackIdx;
    const current = findMeasureIndex(baseIdx);
    const targetIndex = Math.max(0, Math.min(transport.playbackState.measures.length - 1, current + delta));
    const target = transport.playbackState.measures[targetIndex];
    const targetIdx = target && Number.isFinite(target.istart) ? target.istart : 0;
    const editorStart = Math.max(0, targetIdx - transport.playbackIndexOffset);
    setPlaybackRange({
      startOffset: editorStart,
      endOffset: null,
      origin: "cursor",
      loop: getPlaybackRange().loop,
    });
    await startPlaybackFromRange();
  }

  return {
    startPlaybackFromPrepared,
    resolvePlaybackEndSymbol,
    startPlaybackFromRange,
    startPlaybackAtIndex,
    pausePlayback,
    startPlaybackAtMeasureOffset,
  };
}

export { createPlaybackStartController };
