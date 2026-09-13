import {
  transposeAbc,
} from "../../transpose.mjs";

function clampSetListTransposeSemitones(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-48, Math.min(48, Math.trunc(parsed)));
}

function extractSetListPerformanceKey(text, fallback = "") {
  const match = String(text || "").match(/^[\t ]*K:[\t ]*([^\r\n]*)/m);
  const key = match ? String(match[1] || "").trim() : "";
  return key || String(fallback || "").trim();
}

function buildSetListPerformanceView({ sourceText = "", headerText = "", transposeSemitones = 0 } = {}) {
  const text = String(sourceText || "");
  const semitones = clampSetListTransposeSemitones(transposeSemitones);
  if (!semitones) return { ok: true, text, transposeSemitones: 0 };

  const result = transposeAbc({
    sourceText: text,
    headerText: String(headerText || ""),
    semitones,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "This tune cannot be transposed for Set List performance.",
      transposeSemitones: semitones,
    };
  }
  return {
    ok: true,
    text: result.text,
    transposeSemitones: semitones,
  };
}

function mergeSetListSnapshotAfterSourceSave(previous, replacement, { preserveTranspose = false } = {}) {
  if (!previous || !replacement) return null;
  return {
    ...replacement,
    id: previous.id,
    performance: {
      ...replacement.performance,
      transposeSemitones: preserveTranspose
        ? clampSetListTransposeSemitones(previous.performance && previous.performance.transposeSemitones)
        : 0,
      tempoScale: Number(previous.performance && previous.performance.tempoScale) || 1,
    },
    notes: String(previous.notes || ""),
    links: structuredClone(previous.links || []),
    export: structuredClone(previous.export || { includeInPdf: true, pageBreakBefore: false }),
  };
}

export {
  buildSetListPerformanceView,
  clampSetListTransposeSemitones,
  extractSetListPerformanceKey,
  mergeSetListSnapshotAfterSourceSave,
};
