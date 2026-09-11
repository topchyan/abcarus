import { findBarSeparators } from "./bar_metrics.js";

function voiceIdFromLine(line) {
  const match = String(line || "").match(/^\s*V\s*:\s*([^\s%]+)/i);
  return match ? String(match[1] || "").trim() : "";
}

function isMusicLine(line) {
  const text = String(line || "").trim();
  if (!text || text.startsWith("%")) return false;
  return !/^[A-Za-z]:/.test(text);
}

function containsMusic(text) {
  const stripped = String(text || "")
    .replace(/%.*$/, "")
    .replace(/"(?:\\.|[^"\\])*"/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/![^!]*!/g, "")
    .replace(/\+[^+]*\+/g, "")
    .replace(/\[[A-Za-z]:[^\]]*\]/g, "");
  return /[_=^]?[A-Ga-gxz]/.test(stripped);
}

function findLiteralSafeBars(line) {
  const text = String(line || "");
  const candidates = findBarSeparators(text);
  const out = [];
  let cursor = 0;
  let quote = false;
  let comment = false;
  let escaped = false;
  const scanTo = (end) => {
    for (; cursor < end; cursor += 1) {
      const ch = text[cursor];
      if (comment) continue;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        quote = !quote;
        continue;
      }
      if (ch === "%" && !quote) comment = true;
    }
  };
  for (const candidate of candidates) {
    scanTo(candidate.start);
    if (!quote && !comment) out.push(candidate);
    cursor = candidate.end;
  }
  return out;
}

function getLineStarts(text) {
  const src = String(text || "");
  const starts = [0];
  for (let index = 0; index < src.length; index += 1) {
    if (src[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function locationAt(text, offset) {
  const src = String(text || "");
  const pos = Math.max(0, Math.min(Number(offset) || 0, src.length));
  const starts = getLineStarts(src);
  let lineIndex = 0;
  for (let index = 1; index < starts.length; index += 1) {
    if (starts[index] > pos) break;
    lineIndex = index;
  }
  return { line: lineIndex + 1, col: pos - starts[lineIndex] + 1 };
}

function signatureForBar(token) {
  const text = String(token || "");
  const volta = text.match(/(?:\||\[)([1-9])/);
  return {
    repeatStart: text.includes("|:"),
    repeatEnd: text.includes(":|"),
    volta: volta ? volta[1] : "",
  };
}

function sameSignature(left, right) {
  return left.repeatStart === right.repeatStart
    && left.repeatEnd === right.repeatEnd
    && left.volta === right.volta;
}

function buildVoiceMeasures(text) {
  const src = String(text || "");
  const voices = new Map();
  const states = new Map();
  const ensure = (voiceId) => {
    const id = String(voiceId || "1");
    if (!voices.has(id)) voices.set(id, []);
    if (!states.has(id)) states.set(id, {
      start: null,
      hasMusic: false,
      lastMusicEnd: null,
      pendingPrefix: "",
    });
    return states.get(id);
  };
  const pushMeasure = (voiceId, separator = null, end = null) => {
    const state = ensure(voiceId);
    if (!state.hasMusic || !Number.isFinite(state.start)) return;
    const measureEnd = Number.isFinite(end) ? end : state.lastMusicEnd;
    if (!Number.isFinite(measureEnd) || measureEnd <= state.start) return;
    voices.get(String(voiceId || "1")).push({
      start: state.start,
      end: measureEnd,
      separator: `${state.pendingPrefix}${separator ? String(separator) : ""}`,
    });
    state.start = null;
    state.hasMusic = false;
    state.lastMusicEnd = null;
    state.pendingPrefix = "";
  };

  let bodyStarted = false;
  let activeVoice = "1";
  let offset = 0;
  const lines = src.split(/\r\n|\n|\r/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineEndingLength = lineIndex < lines.length - 1 ? (src.slice(offset + line.length).startsWith("\r\n") ? 2 : 1) : 0;
    if (!bodyStarted && /^\s*K:/.test(line)) bodyStarted = true;
    if (!bodyStarted) {
      offset += line.length + lineEndingLength;
      continue;
    }
    const voiceId = voiceIdFromLine(line);
    if (voiceId) {
      activeVoice = voiceId;
      ensure(activeVoice);
      offset += line.length + lineEndingLength;
      continue;
    }
    if (!isMusicLine(line)) {
      offset += line.length + lineEndingLength;
      continue;
    }

    const state = ensure(activeVoice);
    const bars = findLiteralSafeBars(line);
    let segmentStart = 0;
    const registerMusic = (from, to) => {
      const segment = line.slice(from, to);
      if (!containsMusic(segment)) return;
      const first = segment.search(/\S/);
      if (!Number.isFinite(state.start) && first >= 0) state.start = offset + from + first;
      state.hasMusic = true;
      state.lastMusicEnd = offset + to;
    };
    for (const bar of bars) {
      registerMusic(segmentStart, bar.start);
      if (state.hasMusic) pushMeasure(activeVoice, bar.token, offset + bar.end);
      else state.pendingPrefix += bar.token;
      segmentStart = bar.end;
    }
    registerMusic(segmentStart, line.length);
    offset += line.length + lineEndingLength;
  }
  for (const [voiceId, state] of states.entries()) {
    if (state.hasMusic) pushMeasure(voiceId);
  }
  return voices;
}

function analyzeVoiceMeasureCorrespondence(text, { referenceVoiceId = "1" } = {}) {
  const src = String(text || "");
  const voices = buildVoiceMeasures(src);
  const referenceId = String(referenceVoiceId || "1");
  const reference = voices.get(referenceId) || [];
  const mismatches = [];
  if (!reference.length || voices.size < 2) {
    return { compatible: false, referenceVoiceId: referenceId, voices, mismatches };
  }

  for (const [voiceId, measures] of voices.entries()) {
    if (voiceId === referenceId || !measures.length) continue;
    if (measures.length !== reference.length) {
      const anchor = measures[Math.min(measures.length - 1, reference.length - 1)] || reference[reference.length - 1];
      const offset = anchor ? anchor.start : 0;
      mismatches.push({
        kind: "measure-count",
        voiceId,
        offset,
        barNumber: Math.min(measures.length, reference.length) + 1,
        detail: `V:${voiceId} has ${measures.length} measures; V:${referenceId} has ${reference.length}.`,
      });
      continue;
    }
    for (let index = 0; index < reference.length; index += 1) {
      const expected = signatureForBar(reference[index].separator);
      const actual = signatureForBar(measures[index].separator);
      if (sameSignature(expected, actual)) continue;
      mismatches.push({
        kind: "structure",
        voiceId,
        offset: measures[index].end - Math.max(1, measures[index].separator.length),
        barNumber: index + 1,
        detail: `V:${voiceId} has a different repeat or volta at bar ${index + 1} than V:${referenceId}.`,
      });
    }
  }

  const markers = mismatches.map((mismatch) => ({
    ...mismatch,
    ...locationAt(src, mismatch.offset),
    len: 1,
    label: `#${mismatch.barNumber} form`,
    deltaText: "form",
  }));
  return {
    compatible: mismatches.length === 0,
    referenceVoiceId: referenceId,
    voices,
    mismatches: markers,
  };
}

function getCorrespondingMeasureRanges(text, offset, options = {}) {
  const analysis = analyzeVoiceMeasureCorrespondence(text, options);
  if (!analysis.compatible) return { analysis, ranges: [] };
  const position = Number(offset);
  if (!Number.isFinite(position)) return { analysis, ranges: [] };
  let currentVoiceId = "";
  let measureIndex = -1;
  for (const [voiceId, measures] of analysis.voices.entries()) {
    const index = measures.findIndex((measure) => position >= measure.start && position <= measure.end);
    if (index < 0) continue;
    currentVoiceId = voiceId;
    measureIndex = index;
    break;
  }
  if (measureIndex < 0) return { analysis, ranges: [] };
  const ranges = [];
  for (const [voiceId, measures] of analysis.voices.entries()) {
    if (voiceId === currentVoiceId) continue;
    const measure = measures[measureIndex];
    if (measure) ranges.push({ from: measure.start, to: measure.end, voiceId, barNumber: measureIndex + 1 });
  }
  return { analysis, ranges };
}

function getReferenceMeasureRangeAt(text, offset, options = {}) {
  const analysis = analyzeVoiceMeasureCorrespondence(text, options);
  const position = Number(offset);
  if (!Number.isFinite(position)) return { analysis, range: null };

  let currentVoiceId = "";
  let measureIndex = -1;
  for (const [voiceId, measures] of analysis.voices.entries()) {
    const index = measures.findIndex((measure) => position >= measure.start && position <= measure.end);
    if (index < 0) continue;
    currentVoiceId = voiceId;
    measureIndex = index;
    break;
  }
  if (measureIndex < 0) return { analysis, range: null };

  const referenceVoiceId = analysis.referenceVoiceId;
  const canMapToReference = currentVoiceId === referenceVoiceId || analysis.compatible;
  const targetVoiceId = canMapToReference ? referenceVoiceId : currentVoiceId;
  const targetMeasures = analysis.voices.get(targetVoiceId) || [];
  const measure = targetMeasures[measureIndex];
  if (!measure) return { analysis, range: null };
  return {
    analysis,
    range: {
      from: measure.start,
      to: measure.end,
      voiceId: targetVoiceId,
      sourceVoiceId: currentVoiceId,
      barNumber: measureIndex + 1,
    },
  };
}

export {
  analyzeVoiceMeasureCorrespondence,
  buildVoiceMeasures,
  getCorrespondingMeasureRanges,
  getReferenceMeasureRangeAt,
};
