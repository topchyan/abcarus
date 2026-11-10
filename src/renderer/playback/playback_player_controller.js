function createPlaybackPlayerController({
  windowRef,
  transport,
  selectionRuntime,
  getEditorView,
  getFocusModeEnabled,
  getFollowPlaybackEnabled,
  getSoundfontSource,
  setSuppressPlaybackRangeSelectionSync,
  applyPlaybackPlanSpeed,
  startPlaybackFromRange,
  updatePracticeUi,
  setStatus,
  updatePlayButton,
  clearNoteSelection,
  clearPlaybackNoteOnEls,
  clearSvgPlayhead,
  clearSvgFollowBarHighlight,
  clearSvgFollowMeasureHighlight,
  resetPlaybackUiState,
  setSoundfontCaption,
  findSymbolAtOrBefore,
  toEditorOffset,
  appendPlaybackTrace,
  stopPlaybackFromGuard,
  schedulePlaybackUiUpdate,
  logErr,
} = {}) {
  let warmedPlaybackState = null;
  let warmedSoundfontSource = null;
  let warmupSession = null;
  let suppressWarmupEnd = false;

  function finishWarmup({ warmed = true, stop = false } = {}) {
    const session = warmupSession;
    if (!session) return;
    warmupSession = null;
    if (session.timer != null) windowRef.clearTimeout(session.timer);
    if (stop && transport.player && typeof transport.player.stop === "function") {
      suppressWarmupEnd = true;
      try { transport.player.stop(); } catch {}
      suppressWarmupEnd = false;
    }
    if (transport.player && typeof transport.player.set_vol === "function") {
      try { transport.player.set_vol(session.volume); } catch {}
    }
    if (warmed) {
      warmedPlaybackState = session.playbackState;
      warmedSoundfontSource = session.soundfontSource;
    }
    session.resolve(Boolean(warmed));
  }

  function ensurePlayer() {
    if (transport.player) return transport.player;

    if (typeof windowRef.AbcPlay !== "function") {
      throw new Error("AbcPlay not found (snd-1.js not loaded?)");
    }

    const conf = {
      release: transport.soundfontReleaseScale,
      onend: () => {
        if (suppressWarmupEnd) return;
        if (warmupSession) {
          // Tear down the muted gain node before restoring the user's volume.
          // Restoring it on the same node can expose the warmed note's release.
          finishWarmup({ warmed: true, stop: true });
          return;
        }
        const endState = transport.consumePlaybackEnd();
        if (endState.ignored) return;
        setStatus("OK");
        updatePlayButton();
        clearNoteSelection();
        clearPlaybackNoteOnEls();
        clearSvgPlayhead();
        clearSvgFollowBarHighlight();
        clearSvgFollowMeasureHighlight();
        if (!endState.shouldLoop) resetPlaybackUiState();
        const editorView = getEditorView();
        if (endState.shouldLoop && getFollowPlaybackEnabled() && transport.lastRenderIdx != null && editorView) {
          setSuppressPlaybackRangeSelectionSync(true);
          try {
            editorView.dispatch({ selection: { anchor: transport.lastRenderIdx, head: transport.lastRenderIdx } });
          } finally {
            setSuppressPlaybackRangeSelectionSync(false);
          }
        }
        if (endState.shouldLoop) {
          const rangeGap = endState.loopRange && Number(endState.loopRange.loopGapMs);
          const gapMs = Math.max(0, Math.min(5000, Math.round(
            Number.isFinite(rangeGap) ? rangeGap : (Number(transport.playbackLoopGapMs) || 0)
          )));
          setTimeout(() => {
            if (!endState.loopRange || !transport.activePlaybackRange || !transport.activePlaybackRange.loop) return;
            if (transport.pendingPlaybackPlan) {
              const plan = transport.pendingPlaybackPlan;
              transport.pendingPlaybackPlan = null;
              transport.currentPlaybackPlan = plan;
              applyPlaybackPlanSpeed(plan);
              startPlaybackFromRange({
                startOffset: plan.rangeStart,
                endOffset: plan.rangeEnd,
                origin: getFocusModeEnabled() ? "focus" : "transport",
                loop: plan.loopEnabled,
                skipCountIn: true,
              }).catch(() => {});
              updatePracticeUi();
              return;
            }
            startPlaybackFromRange({ ...endState.loopRange, skipCountIn: true }).catch(() => {});
          }, gapMs);
        }
        if (!endState.shouldLoop && endState.wasSelectionOrigin) {
          selectionRuntime.restoreSelection(editorView);
          selectionRuntime.clearSelectionCapture();
        }
      },
      onnote: (i, on) => {
        if (warmupSession) return;
        if (!Number.isFinite(i)) return;
        transport.lastPlaybackIdx = i;
        if (transport.consumeFirstNoteStart(on)) {
          setStatus("Playing…");
          setSoundfontCaption();
        }
        if (transport.isPreviewing) return;
        if (on) {
          if (Number.isFinite(transport.lastPlaybackOnIstart) && Number.isFinite(i) && i < transport.lastPlaybackOnIstart && windowRef.__abcarusDebugPlayback) {
            console.log("[abcarus] playback jump (repeat?)", { from: transport.lastPlaybackOnIstart, to: i });
          }
          if (windowRef.__abcarusDebugParts === true && Number.isFinite(i)) {
            try {
              const sym = findSymbolAtOrBefore(i);
              const letter = (sym && sym.part && sym.part.text) ? (String(sym.part.text || "")[0] || "?") : null;
              if (letter) console.log("[abcarus] part start", { part: letter, istart: i });
              if (Number.isFinite(transport.lastPlaybackOnIstart) && i < transport.lastPlaybackOnIstart) {
                let s = sym;
                let guard = 0;
                let inferred = null;
                while (s && guard < 200000) {
                  if (s.part && s.part.text) { inferred = String(s.part.text || "")[0] || "?"; break; }
                  s = s.ts_prev;
                  guard += 1;
                }
                console.log("[abcarus] part jump", { from: transport.lastPlaybackOnIstart, to: i, inferredPart: inferred });
              }
            } catch {}
          }
          transport.lastPlaybackOnIstart = i;
        }
        const editorIdx = Math.max(0, i - transport.playbackIndexOffset);
        const editorView = getEditorView();
        const editorLen = editorView ? editorView.state.doc.length : 0;
        const fromInjected = editorLen && editorIdx >= editorLen;
        if (on && !fromInjected) {
          const traceEnabled = windowRef.__abcarusPlaybackTrace === true;
          if (
            transport.activePlaybackRange
            && transport.activePlaybackRange.loop
            && transport.activePlaybackRange.origin === transport.playbackRange.origin
            && transport.playbackRange.startOffset !== transport.activePlaybackRange.startOffset
          ) {
            stopPlaybackFromGuard("Loop invariance violated: PlaybackRange.startOffset mutated.");
            return;
          }
          if (traceEnabled) {
            const timestamp = typeof performance !== "undefined" ? performance.now() : Date.now();
            const seq = (transport.playbackTraceSeq += 1);

            if (transport.lastTraceRunId !== transport.playbackRunId) {
              stopPlaybackFromGuard("Trace run id mismatch.");
              return;
            }
            if (transport.lastTracePlaybackIdx != null && seq < transport.lastTracePlaybackIdx) {
              stopPlaybackFromGuard("Trace playbackIdx is not monotonic.");
              return;
            }
            if (transport.lastTraceTimestamp != null && timestamp < transport.lastTraceTimestamp) {
              stopPlaybackFromGuard("Trace timestamp is decreasing.");
              return;
            }

            transport.lastTracePlaybackIdx = seq;
            transport.lastTraceTimestamp = timestamp;
            const currentEditorOffset = toEditorOffset(i);
            const rangeStartEditorOffset = transport.activePlaybackRange ? transport.activePlaybackRange.startOffset : transport.playbackRange.startOffset;
            appendPlaybackTrace({
              rangeStartOffset: rangeStartEditorOffset,
              currentAbcOffset: Number.isFinite(currentEditorOffset) ? currentEditorOffset : editorIdx,
              rangeStartEditorOffset,
              currentEditorOffset: Number.isFinite(currentEditorOffset) ? currentEditorOffset : editorIdx,
              currentIstart: i,
              origin: transport.activePlaybackRange ? transport.activePlaybackRange.origin : transport.playbackRange.origin,
              playbackIdx: seq,
              editorIdx: Number.isFinite(currentEditorOffset) ? currentEditorOffset : editorIdx,
              timestamp,
              atMs: timestamp,
            });
          }
        }
        if (on && !fromInjected) schedulePlaybackUiUpdate(i);
      },
      errmsg: (m, line, col) => {
        const loc = Number.isFinite(line) && Number.isFinite(col)
          ? { line: line + 1, col: col + 1 }
          : null;
        logErr(m, loc);
      },
      err: (m) => logErr(m),
    };
    transport.playerConfig = conf;
    transport.player = windowRef.AbcPlay(conf);

    windowRef.p = transport.player;

    if (typeof transport.player.set_speed === "function") {
      const next = Number(transport.desiredPlayerSpeed);
      transport.player.set_speed(Number.isFinite(next) && next > 0 ? next : 1);
    }

    if (typeof transport.player.set_sfu === "function") transport.player.set_sfu(getSoundfontSource() || "abc2svg.sf2");
    try { windowRef.sessionStorage.setItem("audio", "sf2"); } catch {}

    return transport.player;
  }

  function warmupPlayback(startSymbol) {
    const playbackState = transport.playbackState;
    const soundfontSource = String(getSoundfontSource() || "");
    if (!playbackState || !startSymbol) return Promise.resolve(false);
    if (warmedPlaybackState === playbackState && warmedSoundfontSource === soundfontSource) {
      return Promise.resolve(true);
    }
    if (warmupSession) return warmupSession.promise;

    const player = ensurePlayer();
    if (!player || typeof player.play !== "function" || typeof player.set_vol !== "function") {
      return Promise.resolve(false);
    }
    let volume = 0.7;
    try {
      const current = Number(player.set_vol());
      if (Number.isFinite(current)) volume = current;
      player.set_vol(0);
    } catch {
      return Promise.resolve(false);
    }

    let resolveWarmup;
    const promise = new Promise((resolve) => { resolveWarmup = resolve; });
    warmupSession = {
      playbackState,
      soundfontSource,
      volume,
      resolve: resolveWarmup,
      promise,
      timer: null,
    };
    warmupSession.timer = windowRef.setTimeout(() => {
      finishWarmup({ warmed: false, stop: true });
    }, 15000);
    try {
      const playableEntry = Array.isArray(playbackState.symbols)
        ? playbackState.symbols.find(({ symbol }) => (
          symbol
          && !symbol.noplay
          && Number.isFinite(symbol.dur)
          && symbol.dur > 0
          && Array.isArray(symbol.notes)
          && symbol.notes.some((note) => note && !note.noplay && Number.isFinite(note.midi))
        ))
        : null;
      const source = playableEntry && playableEntry.symbol ? playableEntry.symbol : startSymbol;
      const warmupEnd = {
        type: -1,
        dur: 0,
        ptim: Number(source.ptim) || 0,
        time: Number(source.time) || 0,
        v: source.v,
        p_v: source.p_v,
        seqst: true,
        ts_next: null,
      };
      const warmupStart = {
        ...source,
        ts_prev: null,
        ts_next: warmupEnd,
      };
      // A warmup must never enter the tune's P:/repeat routing graph.
      delete warmupStart.parts;
      delete warmupStart.part;
      delete warmupStart.part1;
      delete warmupStart.rep_p;
      delete warmupStart.rep_s;
      delete warmupStart.rep_v;
      if (source.p_v) {
        const warmupVoice = { ...source.p_v };
        let voiceHead = null;
        let voiceTail = null;
        for (let item = source.p_v.sym, guard = 0; item && item !== source && guard < 200000; item = item.next, guard += 1) {
          if (item.subtype !== "midictl" && item.subtype !== "midiprog") continue;
          const control = { ...item, p_v: warmupVoice, prev: voiceTail, next: null };
          if (voiceTail) voiceTail.next = control;
          else voiceHead = control;
          voiceTail = control;
        }
        warmupStart.p_v = warmupVoice;
        warmupEnd.p_v = warmupVoice;
        warmupVoice.sym = voiceHead || warmupStart;
        if (voiceTail) voiceTail.next = warmupStart;
      }
      warmupEnd.ts_prev = warmupStart;
      player.play(warmupStart, warmupEnd, 0, false);
    } catch {
      finishWarmup({ warmed: false, stop: true });
    }
    return promise;
  }

  return {
    ensurePlayer,
    warmupPlayback,
  };
}

export { createPlaybackPlayerController };
