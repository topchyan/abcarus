const MAX_COUNT_IN_MEASURES = 8;

function clampCountInMeasures(value, fallback = 0) {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? parsed : Number(fallback);
  return Math.max(0, Math.min(MAX_COUNT_IN_MEASURES, Math.round(Number.isFinite(base) ? base : 0)));
}

function parseFraction(value, fallback) {
  const match = String(value || "").trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match || Number(match[2]) === 0) return fallback;
  return Number(match[1]) / Number(match[2]);
}

function estimateMeasureSeconds(abcText = "", playbackState = null) {
  const measures = playbackState && Array.isArray(playbackState.measures) ? playbackState.measures : [];
  if (measures.length > 1) {
    const first = Number(measures[0] && measures[0].symbol && measures[0].symbol.time);
    const second = Number(measures[1] && measures[1].symbol && measures[1].symbol.time);
    if (Number.isFinite(first) && Number.isFinite(second) && second > first && second - first < 120) return second - first;
  }
  const text = String(abcText || "");
  const meter = (text.match(/^M:\s*([^\s%]+)/m) || [])[1];
  const tempo = (text.match(/^Q:\s*(.*)$/m) || [])[1] || "";
  const meterBeats = parseFraction(meter, 1);
  const tempoMatch = tempo.match(/(?:(\d+)\s*\/\s*(\d+)\s*=\s*)?(\d+(?:\.\d+)?)/);
  const tempoUnit = tempoMatch && tempoMatch[1] ? Number(tempoMatch[1]) / Number(tempoMatch[2]) : 0.25;
  const bpm = tempoMatch ? Number(tempoMatch[3]) : 120;
  if (!Number.isFinite(tempoUnit) || !Number.isFinite(bpm) || bpm <= 0) return 2;
  return Math.max(0.05, (meterBeats / tempoUnit) * 60 / bpm);
}

function getCountInDelayMs({ measures = 0, abcText = "", playbackState = null, speed = 1 } = {}) {
  const count = clampCountInMeasures(measures);
  if (!count) return 0;
  const rate = Number(speed);
  return Math.round(count * estimateMeasureSeconds(abcText, playbackState) * 1000 / (Number.isFinite(rate) && rate > 0 ? rate : 1));
}

function getCountInPlan({ measures = 0, abcText = "", playbackState = null, speed = 1 } = {}) {
  const requestedCount = clampCountInMeasures(measures);
  const measureSeconds = estimateMeasureSeconds(abcText, playbackState);
  const meterMatch = String(abcText || "").match(/^M:\s*(\d+)\s*\/\s*(\d+)/m);
  const beatsPerMeasure = meterMatch ? Math.max(1, Number(meterMatch[1])) : 4;
  const rate = Number(speed);
  const playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const beatSeconds = measureSeconds / beatsPerMeasure / playbackRate;
  const hasMidiDrum = /(?:^|\n)\s*%%\s*MIDI\s+drum(?:on|off|bars|map)?\b/im.test(String(abcText || ""));
  const drumBarsMatch = String(abcText || "").match(/(?:^|\n)\s*%%\s*MIDI\s+drumbars\s+(\d+)/im);
  const drumBars = drumBarsMatch ? Math.max(1, Math.min(MAX_COUNT_IN_MEASURES, Number(drumBarsMatch[1]))) : 0;
  const count = requestedCount && hasMidiDrum ? Math.max(requestedCount, drumBars) : requestedCount;
  return {
    count,
    beatsPerMeasure,
    beatSeconds,
    delayMs: Math.round(count * measureSeconds * 1000 / playbackRate),
    hasMidiDrum,
    drumBars,
  };
}

function configureNativePlaybeats(text, { enabled = false, measures = 0 } = {}) {
  const src = String(text || "");
  if (!enabled) return { text: src, active: false, insertedLength: 0, measures: 0, source: null };
  const tuneMatch = /(?:^|\n)\s*X\s*:/m.exec(src);
  const tuneStart = tuneMatch ? tuneMatch.index + (tuneMatch[0].startsWith("\n") ? 1 : 0) : src.length;
  const header = src.slice(0, tuneStart);
  const existing = header.match(/(?:^|\n)\s*%%\s*playbeats(?:\s+([^\s%]+))?[^\n]*/im);
  if (existing) {
    const parsed = Number(existing[1]);
    return {
      text: src,
      active: existing[1] === "*" || !Number.isFinite(parsed) || parsed > 0,
      insertedLength: 0,
      measures: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1,
      source: "abc",
    };
  }
  const count = clampCountInMeasures(measures);
  if (!count || !tuneMatch) return { text: src, active: false, insertedLength: 0, measures: 0, source: null };
  const directive = `%%playbeats ${count}\n`;
  return {
    text: `${src.slice(0, tuneStart)}${directive}${src.slice(tuneStart)}`,
    active: true,
    insertedLength: directive.length,
    measures: count,
    source: "abcarus",
  };
}

function accentNativePlaybeats(firstSymbol) {
  const beats = [];
  const seen = new Set();
  for (let symbol = firstSymbol; symbol && !seen.has(symbol); symbol = symbol.ts_next) {
    seen.add(symbol);
    const voiceId = symbol.p_v && symbol.p_v.id != null ? String(symbol.p_v.id) : "";
    if (voiceId !== "_beats" || !Array.isArray(symbol.notes) || !symbol.notes.length) continue;
    if (!Number.isFinite(symbol.time) || !Number.isFinite(symbol.dur) || symbol.dur <= 0) continue;
    beats.push(symbol);
  }
  if (!beats.length) return 0;
  const meter = firstSymbol && firstSymbol.p_v && firstSymbol.p_v.meter;
  const measureDuration = Number(meter && meter.wmeasure);
  const firstTime = Number(beats[0].time);
  let accented = 0;
  for (const beat of beats) {
    beat.notes = beat.notes.map((note) => ({ ...note }));
    beat.nhd = beat.notes.length - 1;
    const elapsed = Number(beat.time) - firstTime;
    const atMeasureStart = !Number.isFinite(measureDuration)
      || measureDuration <= 0
      || Math.abs(elapsed % measureDuration) < 1e-8;
    if (!atMeasureStart) continue;
    beat.notes.push({ ...beat.notes[0] });
    beat.nhd = beat.notes.length - 1;
    accented += 1;
  }
  return accented;
}

export {
  MAX_COUNT_IN_MEASURES,
  accentNativePlaybeats,
  clampCountInMeasures,
  configureNativePlaybeats,
  estimateMeasureSeconds,
  getCountInDelayMs,
  getCountInPlan,
};
