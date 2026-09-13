import {
  getNativeTransposeSupport,
  transformTranspose,
} from "./engine.mjs";

export * from "./engine.mjs";

export const ABC_TRANSPOSE_API_VERSION = "abcarus.abc-transpose.v1";

function extractKey(text) {
  const match = String(text || "").match(/^[\t ]*K:[\t ]*([^\r\n]*)/m);
  return match ? String(match[1] || "").trim() : "";
}

function strategyFor(edo, key) {
  if (edo !== 53) return "western";
  return /^[A-Ga-g][#b]?(?:m|min|minor|maj|major)\b/i.test(String(key || "").trim())
    ? "functional-key"
    : "exact-edo53";
}

export function transposeAbc({
  sourceText = "",
  headerText = "",
  semitones = 0,
  mode = "auto",
  prefer = "flat",
} = {}) {
  const amount = Number(semitones);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return {
      ok: false,
      apiVersion: ABC_TRANSPOSE_API_VERSION,
      code: "INVALID_ARGUMENT",
      error: "semitones must be a finite integer",
    };
  }

  const text = String(sourceText || "");
  const header = String(headerText || "");
  const support = getNativeTransposeSupport(text, { headerText: header });
  const sourceKey = extractKey(text);
  if (amount === 0) {
    return {
      ok: true,
      apiVersion: ABC_TRANSPOSE_API_VERSION,
      text,
      semitones: 0,
      edo: support.edo,
      strategy: strategyFor(support.edo, sourceKey),
      sourceKey,
      targetKey: sourceKey,
    };
  }
  if (!support.ok) {
    return {
      ok: false,
      apiVersion: ABC_TRANSPOSE_API_VERSION,
      code: "UNSUPPORTED_NOTATION",
      error: support.reason || "This ABC text cannot be transposed.",
      semitones: amount,
      edo: support.edo,
      sourceKey,
    };
  }

  try {
    const output = transformTranspose(text, amount, {
      headerText: header,
      mode,
      prefer,
    });
    return {
      ok: true,
      apiVersion: ABC_TRANSPOSE_API_VERSION,
      text: output,
      semitones: amount,
      edo: support.edo,
      strategy: strategyFor(support.edo, sourceKey),
      sourceKey,
      targetKey: extractKey(output),
    };
  } catch (error) {
    return {
      ok: false,
      apiVersion: ABC_TRANSPOSE_API_VERSION,
      code: "TRANSFORM_FAILED",
      error: error && error.message ? error.message : "ABC transposition failed.",
      semitones: amount,
      edo: support.edo,
      sourceKey,
    };
  }
}
