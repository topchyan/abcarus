import {
  applyMutedVoicesToTuneRoot,
  getFirstPlayableVoiceIdFromTuneRoot,
  resolveEffectiveMutedVoiceIds,
  stripRepeatsLengthSafe,
} from "./selection_playback_model.js";
import {
  normalizeBarsForPlayback,
  normalizeReadableMidiDrumsForPlayback,
  relocateMidiDrumDirectivesIntoBody,
  stripChordSymbolsForPlayback,
  stripLyricsForPlayback,
} from "./playback_payload_model.js";
import {
  normalizeHeaderNoneSpacing,
} from "../render/render_payload_model.js";
import { callAbc2svgSafely } from "../security/abc_security.js";

function createPlaybackPrepareController({
  windowRef,
  transport,
  selectionRuntime,
  ensureSoundfontReady,
  ensurePlayer,
  getAbcCtor,
  getPlaybackPayload,
  getPlaybackSourceKey,
  buildPlaybackState,
  setFollowVoiceFromPlayback,
  clearErrors,
  setStatus,
  showToast,
  logErr,
  addError,
  setErrorLineOffsetFromHeader,
  setErrorsLineOffset,
  parseErrorLocation,
  scheduleAutoDump,
  assertCleanAbcText,
  neutralizeMidiDrumDirectivesForPlayback,
  isMidiDrumMustBeInVoicePlaybackError,
  hasMidiDrumMustBeInVoicePlaybackError,
  shouldRelocateMidiDrumsForPlayback,
  normalizeAccThreeQuarterToneForAbc2svg,
  isChordProFullView,
} = {}) {
  let lastMidiDrumCompatToastKey = null;

  async function preparePlayback() {
    clearErrors();
    if (isChordProFullView()) {
      showToast("Exit Raw to play ChordPro ABC.", 2400);
      return null;
    }
    await ensureSoundfontReady();
    const p = ensurePlayer();
    if (transport.player && typeof transport.player.stop === "function") {
      transport.suppressOnEnd = true;
      transport.player.stop();
    }
    if (typeof p.clear === "function") p.clear();
    transport.playbackNeedsReprepare = false;

    try { windowRef.sessionStorage.setItem("audio", "sf2"); } catch {}

    const AbcCtor = getAbcCtor();
    transport.playbackParseErrors = [];
    transport.resetPayloadDiagnostics();
    transport.lastPlaybackChordOnBarError = false;
    transport.lastPlaybackMidiDrumVoiceCompatSeen = false;
    let playbackParseErrorToastShown = false;
    transport.lastPlaybackTuneInfo = null;
    const logPlaybackErr = (message, line, col) => {
      let loc = null;
      if (Number.isFinite(line) && Number.isFinite(col)) {
        loc = { line: line + 1, col: col + 1 };
      } else {
        loc = parseErrorLocation(message);
      }
      const drumStart = (transport.lastPlaybackMeta && Number.isFinite(transport.lastPlaybackMeta.drumInsertAtLine))
        ? transport.lastPlaybackMeta.drumInsertAtLine
        : null;
      const drumLines = (transport.lastPlaybackMeta && Number.isFinite(transport.lastPlaybackMeta.drumLineCount))
        ? transport.lastPlaybackMeta.drumLineCount
        : 0;
      const inDrumBlock = loc
        && drumStart
        && drumLines > 0
        && loc.line >= drumStart
        && loc.line < (drumStart + drumLines);
      const entry = {
        message: String(message || ""),
        loc,
        inDrumBlock: Boolean(inDrumBlock),
      };
      if (isMidiDrumMustBeInVoicePlaybackError(entry.message)) {
        transport.lastPlaybackMidiDrumVoiceCompatSeen = true;
        transport.addSanitizeWarning({ kind: "playback-midi-drums-before-voice", message: entry.message });
        return;
      }
      transport.playbackParseErrors.push(entry);
      if (transport.playbackParseErrors.length > 200) transport.playbackParseErrors = transport.playbackParseErrors.slice(-200);
      if (!playbackParseErrorToastShown) {
        playbackParseErrorToastShown = true;
        scheduleAutoDump("playback-parse-error", entry && entry.message ? entry.message : String(message || ""));
        if (windowRef.__abcarusDebugPlayback || windowRef.__abcarusDebugDrums) {
          showToast("Playback parse error (see debug dump).", 3200);
        }
      }
      if (/Not enough measure bars for lyric line/i.test(entry.message)) return;
      if (inDrumBlock) {
        const cleaned = String(message || "").replace(/^\s*play:\d+:\d+\s*/i, "").trim();
        logErr(cleaned || message, null, { skipMeasureRange: true });
        return;
      }
      logErr(message, loc, { skipMeasureRange: true });
    };
    const user = {
      img_out: () => {},
      err: (m) => logPlaybackErr(m),
      errmsg: (m, line, col) => logPlaybackErr(m, line, col),
      abcplay: p,
    };
    const abc = new AbcCtor(user);
    transport.clearPayloadCache();
    const playbackPayload = getPlaybackPayload();
    if (!playbackPayload || playbackPayload.empty || !String(playbackPayload.text || "").trim()) {
      setStatus("Ready");
      showToast("No ABC block to play.", 2200);
      return p;
    }
    const playbackPayloadText = playbackPayload.text;
    const playbackPayloadOffset = playbackPayload.offset || 0;
    const selectionMode = selectionRuntime.isSelectionMode();
    transport.lastPlaybackHasParts = /\nP\s*:/.test(`\n${playbackPayloadText || ""}`) || /\[\s*P\s*:/i.test(playbackPayloadText || "");
    if (Array.isArray(transport.playbackSanitizeWarnings) && transport.playbackSanitizeWarnings.length) {
      showToast("Playback may vary (ABC sanitized for stability).", 3600);
    }
    if (!assertCleanAbcText(playbackPayloadText, "preparePlayback")) {
      throw new Error("ABC text corruption detected (playback).");
    }
    if (windowRef.__abcarusDebugDrums) {
      const lines = String(playbackPayloadText || "").split(/\r\n|\n|\r/);
      const drumLines = lines.filter((line) => /DRUM|drum|drummap|MIDI channel/i.test(line));
      const tail = lines.slice(-60);
      console.log("[abcarus] playback payload (drum lines):\n" + drumLines.join("\n"));
      console.log("[abcarus] playback payload (tail):\n" + tail.join("\n"));
    }
    if (windowRef.__abcarusDebugPlayback) {
      const lines = String(playbackPayloadText || "").split(/\r\n|\n|\r/);
      console.log("[abcarus] playback payload (head):\n" + lines.slice(0, 40).join("\n"));
    }
    transport.playbackIndexOffset = playbackPayloadOffset || 0;
    if (Number.isFinite(playbackPayload.lineOffset)) {
      setErrorsLineOffset(playbackPayload.lineOffset);
    } else {
      setErrorLineOffsetFromHeader(playbackPayloadText.slice(0, transport.playbackIndexOffset));
    }
    if (transport.lastPlaybackMeterMismatchWarning && transport.lastPlaybackMeterMismatchWarning.detail) {
      addError(
        `Warning: Meter mismatch: ${transport.lastPlaybackMeterMismatchWarning.detail}`,
        transport.lastPlaybackMeterMismatchWarning.loc || null,
        { skipMeasureRange: true }
      );
    }
    if (transport.lastPlaybackRepeatShortBarWarning && transport.lastPlaybackRepeatShortBarWarning.detail) {
      addError(
        `Warning: ${transport.lastPlaybackRepeatShortBarWarning.detail}`,
        transport.lastPlaybackRepeatShortBarWarning.loc || null,
        { skipMeasureRange: true }
      );
    }
    let playbackText = normalizeHeaderNoneSpacing(playbackPayloadText);
    const scopedOptions = selectionRuntime.getScopedOptions();
    if (scopedOptions) {
      if (!scopedOptions.allowMidiDrums) {
        playbackText = neutralizeMidiDrumDirectivesForPlayback(playbackText);
      }
      if (scopedOptions.muteGchords) playbackText = stripChordSymbolsForPlayback(playbackText);
      if (scopedOptions.suppressRepeats) playbackText = stripRepeatsLengthSafe(playbackText);
      let effectiveMuted = null;
      const mutedVoiceMap = selectionRuntime.getAbMutedVoiceMap();
      if (mutedVoiceMap && Object.values(mutedVoiceMap).some(Boolean)) {
        effectiveMuted = mutedVoiceMap;
      } else if (Array.isArray(scopedOptions.mutedVoices) && scopedOptions.mutedVoices.length) {
        effectiveMuted = scopedOptions.mutedVoices.reduce((acc, id) => {
          acc[String(id)] = true;
          return acc;
        }, {});
      }
      if (effectiveMuted && Object.values(effectiveMuted).some(Boolean) && /\[V\s*:/i.test(playbackText)) {
        showToast("Voice muting for inline [V:] switches is best-effort.", 2800);
      }
    }
    playbackText = normalizeReadableMidiDrumsForPlayback(playbackText);
    if (/[\\^_]3\/4/.test(playbackText)) {
      transport.addSanitizeWarning({ kind: "playback-acc-3_4-normalized" });
      playbackText = normalizeAccThreeQuarterToneForAbc2svg(playbackText);
      showToast("Playback: 3/4-tone accidentals normalized (compat mode).", 3600);
    }
    if (shouldRelocateMidiDrumsForPlayback(scopedOptions)) {
      const relocated = relocateMidiDrumDirectivesIntoBody(playbackText);
      if (relocated && relocated.moved > 0) {
        playbackText = relocated.text;
        if (Number.isFinite(relocated.insertedLength) && relocated.insertedLength > 0) {
          transport.playbackIndexOffset += relocated.insertedLength;
        }
        transport.addSanitizeWarning({ kind: "playback-midi-drums-moved-after-k", moved: relocated.moved });
        if (windowRef.__abcarusDebugPlayback) showToast("Playback: moved %%MIDI drum* after K:.", 3200);
      }
    }
    callAbc2svgSafely(abc, "play", playbackText);

    if (transport.lastPlaybackMidiDrumVoiceCompatSeen || hasMidiDrumMustBeInVoicePlaybackError(transport.playbackParseErrors)) {
      transport.addSanitizeWarning({ kind: "playback-midi-drums-neutralized" });
      const abc2 = new AbcCtor(user);
      transport.playbackParseErrors = [];
      playbackText = neutralizeMidiDrumDirectivesForPlayback(playbackText);
      callAbc2svgSafely(abc2, "play", playbackText);
      abc.tunes = abc2.tunes;
      if (windowRef.__abcarusDebugPlayback || windowRef.__abcarusDebugDrums) {
        addError("Warning: Playback ignored global %%MIDI drum* directives (must be inside a voice).", null, { skipMeasureRange: true });
      }
      const toastKey = getPlaybackSourceKey();
      if (windowRef.__abcarusDebugPlayback && toastKey && toastKey !== lastMidiDrumCompatToastKey) {
        lastMidiDrumCompatToastKey = toastKey;
        showToast("Playback: global %%MIDI drum* ignored (compat).", 2600);
      }
    }

    if (!selectionMode && Array.isArray(transport.playbackParseErrors) && transport.playbackParseErrors.some((e) => /lyric line/i.test(e.message || ""))) {
      transport.addSanitizeWarning({ kind: "playback-lyrics-dropped" });
      const abc2 = new AbcCtor(user);
      const stripped = stripLyricsForPlayback(playbackText);
      callAbc2svgSafely(abc2, "play", stripped);
      abc.tunes = abc2.tunes;
      showToast("Playback: lyrics ignored (compat mode).", 3600);
    }
    if (Array.isArray(transport.playbackParseErrors) && transport.playbackParseErrors.some((e) => /Different bars/i.test(e.message || ""))) {
      transport.addSanitizeWarning({ kind: "playback-bars-normalized" });
      const abc3 = new AbcCtor(user);
      const normalized = normalizeBarsForPlayback(playbackText);
      callAbc2svgSafely(abc3, "play", normalized);
      abc.tunes = abc3.tunes;
      showToast("Playback: barlines normalized (compat mode).", 3600);
    }

    if (Array.isArray(transport.playbackParseErrors) && transport.playbackParseErrors.some((e) => /chord symbols on measure bars/i.test(e.message || ""))) {
      transport.lastPlaybackChordOnBarError = true;
      transport.addSanitizeWarning({ kind: "abc2svg-chord-on-measure-bar" });
      if (windowRef.__abcarusPlaybackStripChordSymbols === true) {
        transport.playbackParseErrors = [];
        transport.addSanitizeWarning({ kind: "playback-chords-stripped" });
        const abc2 = new AbcCtor(user);
        const stripped = stripChordSymbolsForPlayback(playbackText);
        callAbc2svgSafely(abc2, "play", stripped);
        abc.tunes = abc2.tunes;
        showToast("Playback: chord symbols ignored (compat mode).", 3600);
      } else {
        showToast("Playback may vary (chord symbols on barlines).", 3600);
      }
    }

    let tunes = abc.tunes || [];
    if (!tunes.length && (transport.playbackIgnoreRepeatsOnce || selectionRuntime.getSkipDrumsOnce() || transport.playbackSkipGchordsOnce)) {
      const attemptFallbackParse = (label, override) => {
        const prevIgnore = transport.playbackIgnoreRepeatsOnce;
        const prevSkipDrums = selectionRuntime.getSkipDrumsOnce();
        const prevSkipGchords = transport.playbackSkipGchordsOnce;
        try {
          if (override && Object.prototype.hasOwnProperty.call(override, "ignoreRepeats")) {
            transport.playbackIgnoreRepeatsOnce = !!override.ignoreRepeats;
          }
          if (override && Object.prototype.hasOwnProperty.call(override, "skipDrums")) {
            selectionRuntime.setSkipDrumsOnce(override.skipDrums);
          }
          if (override && Object.prototype.hasOwnProperty.call(override, "skipGchords")) {
            transport.playbackSkipGchordsOnce = !!override.skipGchords;
          }
          const retryPayload = getPlaybackPayload();
          transport.playbackIndexOffset = retryPayload.offset || 0;
          if (Number.isFinite(retryPayload.lineOffset)) {
            setErrorsLineOffset(retryPayload.lineOffset);
          } else {
            setErrorLineOffsetFromHeader(retryPayload.text.slice(0, transport.playbackIndexOffset));
          }
          let retryText = normalizeHeaderNoneSpacing(retryPayload.text);
          if (/[\\^_]3\/4/.test(retryText)) {
            transport.addSanitizeWarning({ kind: "playback-acc-3_4-normalized" });
            retryText = normalizeAccThreeQuarterToneForAbc2svg(retryText);
          }
          if (shouldRelocateMidiDrumsForPlayback(selectionRuntime.getScopedOptions())) {
            const relocated = relocateMidiDrumDirectivesIntoBody(retryText);
            if (relocated && relocated.moved > 0) {
              retryText = relocated.text;
              if (Number.isFinite(relocated.insertedLength) && relocated.insertedLength > 0) {
                transport.playbackIndexOffset += relocated.insertedLength;
              }
            }
          }
          const abcRetry = new AbcCtor(user);
          transport.playbackParseErrors = [];
          callAbc2svgSafely(abcRetry, "play", retryText);
          if (abcRetry.tunes && abcRetry.tunes.length) {
            abc.tunes = abcRetry.tunes;
            tunes = abcRetry.tunes;
            transport.addSanitizeWarning({ kind: "playback-selection-fallback", detail: label });
            showToast(label, 2600);
            return true;
          }
        } finally {
          transport.playbackIgnoreRepeatsOnce = prevIgnore;
          selectionRuntime.setSkipDrumsOnce(prevSkipDrums);
          transport.playbackSkipGchordsOnce = prevSkipGchords;
        }
        return false;
      };

      if (transport.playbackIgnoreRepeatsOnce) {
        attemptFallbackParse("Selection playback: repeats enabled (fallback).", { ignoreRepeats: false });
      }
      if (!tunes.length && (selectionRuntime.getSkipDrumsOnce() || transport.playbackSkipGchordsOnce)) {
        attemptFallbackParse("Selection playback: drums/gchords enabled (fallback).", { skipDrums: false, skipGchords: false });
      }
    }

    tunes = abc.tunes || [];
    if (!tunes.length) throw new Error("No tunes parsed; cannot play.");

    if (scopedOptions && Array.isArray(scopedOptions.mutedVoices) && scopedOptions.mutedVoices.length) {
      const root = tunes[0] && tunes[0][0] ? tunes[0][0] : null;
      const firstVoiceId = getFirstPlayableVoiceIdFromTuneRoot(root);
      const effectiveMutedIds = resolveEffectiveMutedVoiceIds(scopedOptions.mutedVoices, firstVoiceId);
      if (effectiveMutedIds.length) {
        let anyMuted = false;
        for (const t of tunes) {
          const first = t && t[0] ? t[0] : null;
          if (applyMutedVoicesToTuneRoot(first, effectiveMutedIds)) anyMuted = true;
        }
        if (!anyMuted) {
          transport.addSanitizeWarning({ kind: "playback-muted-voices-no-match", voices: effectiveMutedIds.slice(0, 12) });
        }
      }
    }

    try {
      transport.lastPlaybackTuneInfo = {
        count: tunes.length,
        titles: tunes.map((t) => {
          const info = t && t[0] ? t[0].info : null;
          const title = info && info.T ? info.T : null;
          const x = info && info.X ? info.X : null;
          return { x, title };
        }).slice(0, 20),
      };
    } catch {
      transport.lastPlaybackTuneInfo = { count: tunes.length };
    }

    for (const t of tunes) p.add(t[0], t[1], t[3]);

    transport.playbackState = buildPlaybackState(tunes[0][0]);
    transport.clearTrace();
    windowRef.__abcarusPlaybackDebug = {
      getState: () => ({
        preparedKey: transport.lastPreparedPlaybackKey,
        playbackIndexOffset: transport.playbackIndexOffset,
        startIstart: transport.playbackState && transport.playbackState.startSymbol ? transport.playbackState.startSymbol.istart : null,
        measures: transport.playbackState ? transport.playbackState.measures.length : 0,
        symbols: transport.playbackState ? transport.playbackState.symbols.length : 0,
        bars: transport.playbackState && transport.playbackState.barIstarts ? transport.playbackState.barIstarts.length : 0,
        preferredVoiceId: transport.playbackState ? (transport.playbackState.preferredVoiceId || null) : null,
        preferredVoiceIndex: transport.playbackState && Number.isFinite(transport.playbackState.preferredVoiceIndex) ? transport.playbackState.preferredVoiceIndex : null,
        voiceStats: transport.playbackState && Array.isArray(transport.playbackState.voiceStats) ? transport.playbackState.voiceStats.slice() : [],
        tunes: transport.lastPlaybackTuneInfo,
        symbolsHead: transport.playbackState
          ? transport.playbackState.symbols.slice(0, 30).map((item) => {
            const sym = item && item.symbol ? item.symbol : null;
            const pv = sym && sym.p_v ? sym.p_v : null;
            return {
              istart: sym && Number.isFinite(sym.istart) ? sym.istart : null,
              time: sym && Number.isFinite(sym.time) ? sym.time : null,
              dur: sym && Number.isFinite(sym.dur) ? sym.dur : null,
              type: sym && Number.isFinite(sym.type) ? sym.type : null,
              voiceId: pv && pv.id != null ? String(pv.id) : null,
              voiceIndex: pv && Number.isFinite(pv.v) ? pv.v : null,
            };
          })
          : [],
      }),
      getDiagnostics: () => ({
        parseErrors: Array.isArray(transport.playbackParseErrors) ? transport.playbackParseErrors.slice() : [],
        sanitizeWarnings: Array.isArray(transport.playbackSanitizeWarnings) ? transport.playbackSanitizeWarnings.slice() : [],
        chordOnBarError: Boolean(transport.lastPlaybackChordOnBarError),
      }),
      getPlaybackRange: () => transport.cloneRange(transport.playbackRange),
      getTimeline: () => (transport.playbackState ? transport.playbackState.timeline : []),
      getTrace: () => transport.getTrace(),
      clearTrace: () => { transport.clearTrace(); },
    };
    if (windowRef.__abcarusDebugPlayback) {
      const symPreview = transport.playbackState.symbols.slice(0, 10).map((item) => {
        const sym = item.symbol || {};
        return {
          istart: sym.istart,
          time: sym.time,
          bar_type: sym.bar_type,
          type: sym.type || sym.sym || sym.name,
        };
      });
      const measPreview = transport.playbackState.measures.slice(0, 6).map((item) => item.istart);
      console.log("[abcarus] playback symbols head:", symPreview);
      console.log("[abcarus] playback measures head:", measPreview);
      console.log("[abcarus] playback start:", transport.playbackState.startSymbol && transport.playbackState.startSymbol.istart);
    }
    setFollowVoiceFromPlayback();
    return p;
  }

  return {
    preparePlayback,
  };
}

export {
  createPlaybackPrepareController,
};
