// Turkish Perde names for 53-EDO (AEU) steps (pc53 = 0..52).
//
// IMPORTANT:
// - This mapping is octave-sensitive: the same pc53 has different Perde names by register.
// - The low/mid/high labels correspond to ABC octaves roughly as:
//   low  = uppercase (e.g. "D"), mid = lowercase (e.g. "d"), high = lowercase with "'" (e.g. "d'")
//   In this codebase, `computeOctave()` returns:
//     uppercase = 5, lowercase = 6, then +/- 1 per "," / "'".
//   So we map:
//     octave <= 5 -> low, octave == 6 -> mid, octave >= 7 -> high.
//
// Data provenance (generated, then curated):
// - /home/avetik/Projects/Makams/master_koma53_with_abc_octaves.csv
// - Columns: `koma_base` (pc53), `name_low`, `name_mid`, `name_high`.
//
// Keep this module small and deterministic: no I/O, no dependencies.

export const PERDE_BY_PC53 = Object.freeze({
  0: Object.freeze({ low: "Kaba Çargâh", mid: "Çargâh", high: "Tiz Çargâh" }),
  3: Object.freeze({ low: "", mid: "Saba", high: "" }),
  4: Object.freeze({ low: "Kaba Nim Hicâz", mid: "Nim Hicâz", high: "Tiz Nim Hicâz" }),
  5: Object.freeze({ low: "Kaba Hicâz", mid: "Hicâz", high: "Tiz Hicâz" }),
  6: Object.freeze({ low: "Kaba Hicâz", mid: "Hicâz", high: "Tiz Hicâz" }),
  8: Object.freeze({ low: "Kaba Dik Hicâz", mid: "Dik Hicâz", high: "Tiz Dik Hicâz" }),
  9: Object.freeze({ low: "Yegâh", mid: "Neva", high: "Tiz Neva" }),
  13: Object.freeze({ low: "Kaba Nim Hisâr", mid: "Nim Hisâr", high: "Tiz Nim Hisâr" }),
  14: Object.freeze({ low: "Kaba Hisâr", mid: "Hisâr", high: "Tiz Hisâr" }),
  16: Object.freeze({ low: "", mid: "Beyati", high: "" }),
  17: Object.freeze({ low: "Kaba Dik Hisâr", mid: "Dik Hisâr", high: "" }),
  18: Object.freeze({ low: "Hüseynî Aşiran", mid: "Hüseynî", high: "Tiz Hüseynî" }),
  22: Object.freeze({ low: "Acem Aşiran", mid: "Acem", high: "Tiz Acem" }),
  23: Object.freeze({ low: "Dik Acem Aşiran", mid: "Dik Acem", high: "" }),
  26: Object.freeze({ low: "Irak", mid: "Eviç", high: "" }),
  27: Object.freeze({ low: "Geveşt", mid: "Mahur", high: "" }),
  30: Object.freeze({ low: "Dik Geveşt", mid: "Dik Mahur", high: "" }),
  31: Object.freeze({ low: "Rast", mid: "Gerdaniye", high: "" }),
  35: Object.freeze({ low: "Nim Zirgüle", mid: "Nim Şehnaz", high: "" }),
  36: Object.freeze({ low: "Zirgüle", mid: "Şehnaz", high: "" }),
  39: Object.freeze({ low: "Dik Zirgüle", mid: "Dik Şehnaz", high: "" }),
  40: Object.freeze({ low: "Dügâh", mid: "Muhayyer", high: "" }),
  44: Object.freeze({ low: "Kürdî", mid: "Sümbüle", high: "" }),
  45: Object.freeze({ low: "Dik Kürdî", mid: "Dik Sümbüle", high: "" }),
  47: Object.freeze({ low: "Nihavend", mid: "", high: "" }),
  48: Object.freeze({ low: "Segâh", mid: "Tiz Segâh", high: "" }),
  49: Object.freeze({ low: "Buselik", mid: "Tiz Buselik", high: "" }),
  52: Object.freeze({ low: "Dik Buselik", mid: "Tiz Dik Buselik", high: "" }),
});

function pickRegisterName(names, register) {
  if (!names) return "";
  if (register === "high") {
    if (names.high) return names.high;
    // Some sources already encode register via "Tiz ..." in mid; prefer that over guessing.
    if (names.mid && /^Tiz\b/i.test(names.mid)) return names.mid;
    return "";
  }
  if (register === "mid") {
    if (names.mid) return names.mid;
    // Some sources only provide the low-register name; don't auto-prefix here.
    if (names.low && !/^Kaba\b/i.test(names.low)) return names.low;
    return names.low || "";
  }
  if (names.low) return names.low;
  // Some sources only provide the mid name; don't auto-prefix here.
  if (names.mid && /^Kaba\b/i.test(names.mid)) return names.mid;
  return names.mid || "";
}

export function resolvePerdeName({ pc53, octave } = {}) {
  const step = Number(pc53);
  if (!Number.isFinite(step) || step < 0 || step > 52) return "";
  const names = PERDE_BY_PC53[step];
  if (!names) return "";

  const oct = Number(octave);
  const register = Number.isFinite(oct) ? (oct <= 5 ? "low" : (oct === 6 ? "mid" : "high")) : "mid";
  return pickRegisterName(names, register);
}
