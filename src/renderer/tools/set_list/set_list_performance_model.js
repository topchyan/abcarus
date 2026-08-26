import {
  getNativeTransposeSupport,
  transformTranspose,
} from "../../transpose.mjs";

function clampSetListTransposeSemitones(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-48, Math.min(48, Math.trunc(parsed)));
}

function buildSetListPerformanceView({ sourceText = "", headerText = "", transposeSemitones = 0 } = {}) {
  const text = String(sourceText || "");
  const semitones = clampSetListTransposeSemitones(transposeSemitones);
  if (!semitones) return { ok: true, text, transposeSemitones: 0 };

  const support = getNativeTransposeSupport(text, { headerText: String(headerText || "") });
  if (!support.ok) {
    return {
      ok: false,
      error: support.reason || "This tune cannot be transposed for Set List performance.",
      transposeSemitones: semitones,
    };
  }

  try {
    return {
      ok: true,
      text: transformTranspose(text, semitones, { headerText: String(headerText || "") }),
      transposeSemitones: semitones,
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Set List transposition failed.",
      transposeSemitones: semitones,
    };
  }
}

function mergeSetListSnapshotAfterSourceSave(previous, replacement) {
  if (!previous || !replacement) return null;
  return {
    ...replacement,
    id: previous.id,
    performance: {
      ...replacement.performance,
      transposeSemitones: 0,
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
  mergeSetListSnapshotAfterSourceSave,
};
