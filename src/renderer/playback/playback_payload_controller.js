import {
  stripGchordDirectives,
  stripRepeatsLengthSafe,
} from "./selection_playback_model.js";
import {
  expandRepeatsForPlayback,
} from "./repeat_expansion_model.js";
import {
  detectKeyFieldNotLastBeforeBody,
  injectGchordOn,
  normalizeBlankLinesForPlayback,
  normalizeDollarLineBreaksForPlayback,
  normalizeReadableMidiDrumsForPlayback,
  sanitizeAbcForPlayback,
} from "./playback_payload_model.js";
import { composeHeaderPrefixPayload } from "../abc/header_prefix_model.js";

function createPlaybackPayloadController({
  transport,
  selectionRuntime,
  getEditorText,
  getActiveEntryHeader,
  buildHeaderPrefix,
  countLinesForPrefix,
  isChordProEnabled,
  isChordProFullView,
  chordProHasBlocks,
  isPayloadMode,
  isPlaybackPayloadView,
  getExpandRepeats,
  detectMeterMismatchInBarlines,
  detectRepeatMarkerAfterShortBar,
  neutralizeMidiDrumDirectivesForPlayback,
  assertCleanAbcText,
  showToast,
} = {}) {
  let lastMeterMismatchToastKey = null;
  let lastRepeatShortBarToastKey = null;

  function isChordProActive() {
    return typeof isChordProEnabled === "function" && isChordProEnabled();
  }

  function getPlaybackSourceKey() {
    if (isChordProActive() && isChordProFullView()) return "chordpro-full";
    if (isChordProActive() && !chordProHasBlocks()) return "chordpro-empty";
    const tuneText = getEditorText();
    if (isPayloadMode()) {
      const offset = 0;
      const expandRepeats = getExpandRepeats();
      const repeatsFlag = expandRepeats ? "exp:on" : "exp:off";
      if (isPlaybackPayloadView()) {
        return `payloadFinal|||${String(tuneText || "")}|||${offset}|||${repeatsFlag}`;
      }
      const preparedText = normalizeBlankLinesForPlayback(
        normalizeDollarLineBreaksForPlayback(String(tuneText || ""))
      );
      const sanitized = sanitizeAbcForPlayback(preparedText);
      return `payload|||${sanitized.text}|||${offset}|||${repeatsFlag}`;
    }
    const prefixPayload = buildHeaderPrefix(isChordProActive() ? "" : getActiveEntryHeader(), false, tuneText);
    const baseText = composeHeaderPrefixPayload(prefixPayload, tuneText);
    const injected = injectGchordOn(baseText, prefixPayload.offset || 0);
    const gchordText = injected && injected.changed ? injected.text : baseText;
    const preparedText = normalizeBlankLinesForPlayback(
      normalizeDollarLineBreaksForPlayback(gchordText)
    );
    const sanitized = sanitizeAbcForPlayback(preparedText);
    const expandRepeats = getExpandRepeats();
    const repeatsFlag = expandRepeats ? "exp:on" : "exp:off";
    return `${sanitized.text}|||${prefixPayload.offset || 0}|||${repeatsFlag}`;
  }

  function getPlaybackPayload() {
    if (isChordProActive() && isChordProFullView()) {
      return { text: "", offset: 0, lineOffset: 0, empty: true };
    }
    if (isChordProActive() && !chordProHasBlocks()) {
      return { text: "", offset: 0, lineOffset: 0, empty: true };
    }
    const tuneText = getEditorText();
    const lineOffsetBase = isChordProActive() ? 0 : null;
    const scopedOptions = selectionRuntime.getScopedOptions();
    const skipDrums = selectionRuntime.getSkipDrumsOnce() || (scopedOptions ? !Boolean(scopedOptions.allowMidiDrums) : false);
    const skipGchords = transport.playbackSkipGchordsOnce === true || (scopedOptions ? Boolean(scopedOptions.muteGchords) : false);
    const ignoreRepeats = transport.playbackIgnoreRepeatsOnce === true;

    if (isPayloadMode()) {
      if (isPlaybackPayloadView()) {
        return { text: String(tuneText || ""), offset: 0 };
      }
      const offset = 0;
      const expandRepeats = getExpandRepeats();
      const repeatsFlag = expandRepeats ? "exp:on" : "exp:off";
      const sourceKey = `payload|||${String(tuneText || "")}|||${offset}|||${repeatsFlag}`;
      const cached = transport.getCachedPayload(sourceKey);
      if (cached) return { text: cached.text, offset: cached.offset };

      transport.resetPayloadDiagnostics();
      let payload = { text: String(tuneText || ""), offset };
      payload = { text: normalizeDollarLineBreaksForPlayback(payload.text), offset: payload.offset };
      payload = { text: normalizeBlankLinesForPlayback(payload.text), offset: payload.offset };
      payload = { text: normalizeReadableMidiDrumsForPlayback(payload.text), offset: payload.offset };
      let workingText = payload.text;
      if (ignoreRepeats) workingText = stripRepeatsLengthSafe(workingText);
      const sanitized = sanitizeAbcForPlayback(workingText);
      transport.setSanitizeWarnings(sanitized.warnings);
      payload = { text: sanitized.text, offset: payload.offset };
      if (expandRepeats) payload = { text: expandRepeatsForPlayback(payload.text), offset: payload.offset };

      transport.storePayloadCache(sourceKey, payload);
      assertCleanAbcText(payload.text, "playback payload");
      return payload;
    }

    if (selectionRuntime.isSelectionMode()) {
      const prefixPayload = buildHeaderPrefix(isChordProActive() ? "" : getActiveEntryHeader(), false, tuneText);
      const baseText = composeHeaderPrefixPayload(prefixPayload, tuneText);
      const injected = skipGchords
        ? { text: baseText, changed: false, offsetDelta: 0 }
        : injectGchordOn(baseText, prefixPayload.offset || 0);
      const text = injected.changed ? injected.text : baseText;
      const lineOffset = isChordProActive() ? countLinesForPrefix(prefixPayload.text) + (lineOffsetBase || 0) : null;
      transport.setPayloadMeta();
      transport.clearPreparedPlaybackKey();
      return {
        text,
        offset: (prefixPayload.offset || 0) + (injected.offsetDelta || 0),
        lineOffset,
      };
    }

    const prefixPayload = buildHeaderPrefix(isChordProActive() ? "" : getActiveEntryHeader(), false, tuneText);
    const baseText = composeHeaderPrefixPayload(prefixPayload, tuneText);
    const gchordPreview = skipGchords ? { changed: false, text: baseText } : injectGchordOn(baseText, prefixPayload.offset || 0);
    const gchordPreviewText = (gchordPreview && gchordPreview.changed) ? gchordPreview.text : baseText;
    const previewText = normalizeReadableMidiDrumsForPlayback(
      normalizeBlankLinesForPlayback(normalizeDollarLineBreaksForPlayback(gchordPreviewText))
    );
    const expandRepeats = getExpandRepeats();
    const repeatsFlag = expandRepeats ? "exp:on" : "exp:off";
    const drumsFlag = "drums:native";
    const skipDrumsFlag = skipDrums ? "skipdrums:on" : "skipdrums:off";
    const gchordFlag = skipGchords ? "gchords:off" : "gchords:on";
    const ignoreFlag = ignoreRepeats ? "ignore:on" : "ignore:off";
    const sourceKey = `${previewText}|||${prefixPayload.offset || 0}|||${repeatsFlag}|||${drumsFlag}|||${skipDrumsFlag}|||${gchordFlag}|||${ignoreFlag}`;
    const cached = transport.getCachedPayload(sourceKey);
    if (cached) {
      const lineOffset = isChordProActive() ? countLinesForPrefix(prefixPayload.text) + (lineOffsetBase || 0) : null;
      return { text: cached.text, offset: cached.offset, lineOffset };
    }

    let payload = {
      text: composeHeaderPrefixPayload(prefixPayload, tuneText),
      offset: prefixPayload.offset || 0,
    };
    const gchordInjected = injectGchordOn(payload.text, prefixPayload.offset || 0);
    if (gchordInjected.changed) {
      payload = {
        text: gchordInjected.text,
        offset: (payload.offset || 0) + (gchordInjected.offsetDelta || 0),
      };
    }
    payload = { text: normalizeDollarLineBreaksForPlayback(payload.text), offset: payload.offset };
    payload = { text: normalizeBlankLinesForPlayback(payload.text), offset: payload.offset };
    payload = { text: normalizeReadableMidiDrumsForPlayback(payload.text), offset: payload.offset };
    const sanitized = sanitizeAbcForPlayback(payload.text);
    transport.setSanitizeWarnings(sanitized.warnings);
    payload = { text: sanitized.text, offset: payload.offset };

    transport.recordKeyOrderWarning(detectKeyFieldNotLastBeforeBody(payload.text));

    const meterWarn = detectMeterMismatchInBarlines(payload.text);
    transport.recordMeterMismatchWarning(meterWarn);
    if (meterWarn && lastMeterMismatchToastKey !== sourceKey) {
      showToast(`Meter mismatch: ${meterWarn.detail}`, 5200);
      lastMeterMismatchToastKey = sourceKey;
    }
    const repeatShortBarWarn = detectRepeatMarkerAfterShortBar(payload.text);
    transport.recordRepeatShortBarWarning(repeatShortBarWarn);
    if (repeatShortBarWarn && lastRepeatShortBarToastKey !== sourceKey) {
      showToast(`Repeat may be wrong: ${repeatShortBarWarn.detail}`, 5600);
      lastRepeatShortBarToastKey = sourceKey;
    }

    if (skipGchords) payload = { text: stripGchordDirectives(payload.text), offset: payload.offset };
    transport.setPayloadMeta();
    if (skipDrums) payload = { text: neutralizeMidiDrumDirectivesForPlayback(payload.text), offset: payload.offset };
    if (ignoreRepeats) payload = { text: stripRepeatsLengthSafe(payload.text), offset: payload.offset };
    if (expandRepeats) payload = { text: expandRepeatsForPlayback(payload.text), offset: payload.offset };
    transport.storePayloadCache(sourceKey, payload);
    assertCleanAbcText(payload.text, "playback payload");
    const lineOffset = isChordProActive() ? countLinesForPrefix(prefixPayload.text) + (lineOffsetBase || 0) : null;
    return { ...payload, lineOffset };
  }

  return {
    getPlaybackPayload,
    getPlaybackSourceKey,
  };
}

export {
  createPlaybackPayloadController,
};
