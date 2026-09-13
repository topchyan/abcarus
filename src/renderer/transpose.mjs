import { BUILTIN_MAKAM_K_SIGNATURES } from "./makam_dna/makam_k_signatures.mjs";
import { resolvePerdeNamesFromAbcToken } from "./perde_by_abc.mjs";

export const NOTE_BASES = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const STEPS_PER_SEMITONE = 2;
const STEPS_PER_OCTAVE = 24;
const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_SIGNATURE_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_SIGNATURE_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const SHARP_SIGNATURE_DISPLAY_LETTERS = { F: "f", C: "c", G: "g", D: "d", A: "A", E: "e", B: "B" };
const FLAT_SIGNATURE_DISPLAY_LETTERS = { B: "B", E: "e", A: "A", D: "d", G: "G", C: "c", F: "F" };

function mod(n, m) {
  const r = n % m;
  return r < 0 ? r + m : r;
}

function detectEdoStepsPerOctave(text) {
  const re = /^%%MIDI\s+temperamentequal\s+(\d+)\s*$/gmi;
  let match;
  let last = null;
  while ((match = re.exec(String(text || ""))) !== null) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) last = n;
  }
  return last || 12;
}

function hasExplicitEdoDirective(text) {
  const re = /^%%MIDI\s+temperamentequal\s+(\d+)\s*$/gmi;
  let match;
  let last = null;
  while ((match = re.exec(String(text || ""))) !== null) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) last = n;
  }
  return last;
}

function stripLineComment(line) {
  return String(line || "").replace(/(^|[^\\])%.*/, "$1");
}

function has53TetNotation(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = stripLineComment(rawLine);
    if (!line.trim()) continue;
    if (/(?:\^\/|_\/|\^\d+(?:\/\d+)?|_\d+(?:\/\d+)?)(?=[A-Ga-g])/.test(line)) return true;
  }
  return false;
}

function detectEffectiveTransposeEdo(text, options = {}) {
  const bodyText = String(text || "");
  const localEdo = hasExplicitEdoDirective(bodyText);
  if (localEdo != null) return localEdo;
  const headerText = options && options.headerText ? String(options.headerText) : "";
  const inheritedEdo = hasExplicitEdoDirective(headerText);
  if (inheritedEdo === 53 && !has53TetNotation(bodyText)) return 12;
  return inheritedEdo || 12;
}

const SHARP_MAP = [
  { letter: "C", acc: 0 },
  { letter: "C", acc: 1 },
  { letter: "D", acc: 0 },
  { letter: "D", acc: 1 },
  { letter: "E", acc: 0 },
  { letter: "F", acc: 0 },
  { letter: "F", acc: 1 },
  { letter: "G", acc: 0 },
  { letter: "G", acc: 1 },
  { letter: "A", acc: 0 },
  { letter: "A", acc: 1 },
  { letter: "B", acc: 0 },
];

const FLAT_MAP = [
  { letter: "C", acc: 0 },
  { letter: "D", acc: -1 },
  { letter: "D", acc: 0 },
  { letter: "E", acc: -1 },
  { letter: "E", acc: 0 },
  { letter: "F", acc: 0 },
  { letter: "G", acc: -1 },
  { letter: "G", acc: 0 },
  { letter: "A", acc: -1 },
  { letter: "A", acc: 0 },
  { letter: "B", acc: -1 },
  { letter: "B", acc: 0 },
];

const MAJOR_KEYS = [
  { pc: 0, name: "C", acc: 0, pref: "natural" },
  { pc: 7, name: "G", acc: 1, pref: "sharp" },
  { pc: 2, name: "D", acc: 2, pref: "sharp" },
  { pc: 9, name: "A", acc: 3, pref: "sharp" },
  { pc: 4, name: "E", acc: 4, pref: "sharp" },
  { pc: 11, name: "B", acc: 5, pref: "sharp" },
  { pc: 6, name: "F#", acc: 6, pref: "sharp" },
  { pc: 1, name: "C#", acc: 7, pref: "sharp" },
  { pc: 5, name: "F", acc: 1, pref: "flat" },
  { pc: 10, name: "Bb", acc: 2, pref: "flat" },
  { pc: 3, name: "Eb", acc: 3, pref: "flat" },
  { pc: 8, name: "Ab", acc: 4, pref: "flat" },
  { pc: 1, name: "Db", acc: 5, pref: "flat" },
  { pc: 6, name: "Gb", acc: 6, pref: "flat" },
  { pc: 11, name: "Cb", acc: 7, pref: "flat" },
];

const MINOR_KEYS = [
  { pc: 9, name: "A", acc: 0, pref: "natural" },
  { pc: 4, name: "E", acc: 1, pref: "sharp" },
  { pc: 11, name: "B", acc: 2, pref: "sharp" },
  { pc: 6, name: "F#", acc: 3, pref: "sharp" },
  { pc: 1, name: "C#", acc: 4, pref: "sharp" },
  { pc: 8, name: "G#", acc: 5, pref: "sharp" },
  { pc: 3, name: "D#", acc: 6, pref: "sharp" },
  { pc: 10, name: "A#", acc: 7, pref: "sharp" },
  { pc: 2, name: "D", acc: 1, pref: "flat" },
  { pc: 7, name: "G", acc: 2, pref: "flat" },
  { pc: 0, name: "C", acc: 3, pref: "flat" },
  { pc: 5, name: "F", acc: 4, pref: "flat" },
  { pc: 10, name: "Bb", acc: 5, pref: "flat" },
  { pc: 3, name: "Eb", acc: 6, pref: "flat" },
  { pc: 8, name: "Ab", acc: 7, pref: "flat" },
];

function normalizeKeyPreference(token) {
  if (!token) return "flat";
  if (token.includes("b")) return "flat";
  if (token.includes("#")) return "sharp";
  return "flat";
}

function buildKeySignature(accCount, pref) {
  const map = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  if (pref === "sharp") {
    const order = ["F", "C", "G", "D", "A", "E", "B"];
    for (let i = 0; i < accCount; i += 1) map[order[i]] = 1;
  } else if (pref === "flat") {
    const order = ["B", "E", "A", "D", "G", "C", "F"];
    for (let i = 0; i < accCount; i += 1) map[order[i]] = -1;
  }
  return map;
}

function parseKeyToken(token) {
  if (!token) return null;
  const raw = String(token).trim();
  if (!raw) return null;
  if (/^none$/i.test(raw)) {
    return {
      raw,
      name: "none",
      pc: null,
      acc: 0,
      pref: "flat",
      isMinor: false,
      isNone: true,
      modeSuffix: "",
    };
  }
  const match = raw.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] || "";
  const modeSuffix = match[3] || "";
  const modeLower = modeSuffix.trim().toLowerCase();
  const isMinor = modeLower.startsWith("m") && !modeLower.startsWith("maj");
  const base = NOTE_BASES[letter];
  const acc = accidental === "#" ? 1 : (accidental === "b" ? -1 : 0);
  const pc = (base + acc + 120) % 12;
  const pref = normalizeKeyPreference(accidental || modeSuffix);
  const table = isMinor ? MINOR_KEYS : MAJOR_KEYS;
  const entry = table.find((k) => k.name === `${letter}${accidental}`) || null;
  return {
    raw,
    name: `${letter}${accidental}`,
    pc,
    accCount: entry ? entry.acc : 0,
    pref: entry ? entry.pref : pref,
    isMinor,
    isNone: false,
    modeSuffix,
  };
}

function chooseKeyName(pitchClass, isMinor, prefer) {
  const table = isMinor ? MINOR_KEYS : MAJOR_KEYS;
  const candidates = table.filter((k) => k.pc === pitchClass);
  if (!candidates.length) return { name: "C", accCount: 0, pref: "flat" };
  let best = candidates[0];
  for (const c of candidates) {
    if (c.acc < best.acc) best = c;
    else if (c.acc === best.acc) {
      if (prefer === "flat" && c.pref === "flat") best = c;
      else if (prefer === "sharp" && c.pref === "sharp") best = c;
    }
  }
  return { name: best.name, accCount: best.acc, pref: best.pref };
}

function classifyDefaultTransposeKeyToken(token) {
  if (!token) return { ok: false, reason: "missing key token" };
  const raw = String(token).trim();
  if (!raw) return { ok: false, reason: "missing key token" };
  if (/^none$/i.test(raw)) return { ok: true, kind: "none" };
  const match = raw.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return { ok: false, reason: `unsupported key token "${raw}"` };
  const modeSuffix = (match[3] || "").trim().toLowerCase();
  if (!modeSuffix || modeSuffix === "maj" || modeSuffix === "major") {
    return { ok: true, kind: "major" };
  }
  if (modeSuffix === "m" || modeSuffix === "min" || modeSuffix === "minor") {
    return { ok: true, kind: "minor" };
  }
  return { ok: false, reason: `modal or nonstandard key "${raw}"` };
}

export function getDefaultTransposeSupport(text, options = {}) {
  const edo = detectEffectiveTransposeEdo(text, options);
  if (edo !== 12) {
    return {
      ok: false,
      reason: `Default transpose currently supports only 12-EDO major/minor/K:none. This tune uses %%MIDI temperamentequal ${edo}.`,
      edo,
    };
  }

  const keyTokenRe = /^\s*K:\s*(\S+)/gm;
  let match;
  while ((match = keyTokenRe.exec(String(text || ""))) !== null) {
    const keyToken = match[1];
    const info = classifyDefaultTransposeKeyToken(keyToken);
    if (!info.ok) {
      return {
        ok: false,
        reason: `Default transpose currently supports only major, minor, or K:none. Found ${info.reason}.`,
        edo,
      };
    }
  }

  const inlineKeyRe = /\[K:\s*([^\]\s]+)/g;
  while ((match = inlineKeyRe.exec(String(text || ""))) !== null) {
    const keyToken = match[1];
    const info = classifyDefaultTransposeKeyToken(keyToken);
    if (!info.ok) {
      return {
        ok: false,
        reason: `Default transpose currently supports only major, minor, or K:none. Found ${info.reason}.`,
        edo,
      };
    }
  }

  return { ok: true, edo };
}

export function getNativeTransposeSupport(text, options = {}) {
  const edo = detectEffectiveTransposeEdo(text, options);
  if (edo === 53) return { ok: true, edo };
  if (edo === 12) return getDefaultTransposeSupport(text, options);
  return {
    ok: false,
    reason: `Native transpose currently supports only 12-EDO major/minor/K:none and 53-TET. This tune uses %%MIDI temperamentequal ${edo}.`,
    edo,
  };
}

function parseNoteToken(line, index) {
  const accMatch = line
    .slice(index)
    .match(/^(\^\/|_\/|\^{1,2}|_{1,2}|=|\^\d+\/\d+|_\d+\/\d+)?([A-Ga-g])([,']*)([0-9/]*\.?[<>]?)/);
  if (!accMatch) return null;
  const token = accMatch[0];
  const accidentalToken = accMatch[1] || "";
  const letter = accMatch[2];
  const octaveMarks = accMatch[3] || "";
  const durationToken = accMatch[4] || "";
  return {
    token,
    accidentalToken,
    letter,
    octaveMarks,
    durationToken,
  };
}

function accidentalToSteps(accidentalToken) {
  if (!accidentalToken) return null;
  if (accidentalToken === "=") return 0;
  if (accidentalToken === "^/") return 1;
  if (accidentalToken === "_/") return -1;
  if (accidentalToken === "^") return 2;
  if (accidentalToken === "^^") return 4;
  if (accidentalToken === "_") return -2;
  if (accidentalToken === "__") return -4;
  const frac = String(accidentalToken).match(/^(\^|_)(\d+)\/(\d+)$/);
  if (frac) {
    const dir = frac[1] === "^" ? 1 : -1;
    const num = Number(frac[2]);
    const den = Number(frac[3]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    const steps = (num * STEPS_PER_SEMITONE) / den;
    if (!Number.isFinite(steps)) return null;
    if (!Number.isInteger(steps)) return null;
    return dir * steps;
  }
  return null;
}

function computeOctave(letter, octaveMarks) {
  let octave = letter === letter.toUpperCase() ? 5 : 6;
  for (const mark of octaveMarks) {
    if (mark === ",") octave -= 1;
    else if (mark === "'") octave += 1;
  }
  return octave;
}

function buildKeySigSteps(keySig) {
  const steps = {};
  for (const [letter, semis] of Object.entries(keySig || {})) {
    steps[letter] = semis * STEPS_PER_SEMITONE;
  }
  return steps;
}

function mergeKeyAccidentals(baseSteps, extraSteps) {
  const merged = { ...baseSteps };
  if (extraSteps) {
    for (const [letter, steps] of Object.entries(extraSteps)) {
      merged[letter] = steps / STEPS_PER_SEMITONE;
    }
  }
  return merged;
}

// --- 53-EDO (%%MIDI temperamentequal 53) support ---

const PC_NAT_12 = NOTE_BASES;
const EURO_SEMITONE_COMMAS_UP_BY_PC12 = [4, 5, 4, 5, 4, 5, 4, 4, 5, 4, 5, 4];
const SEMITONE_POS_53_BMODE_BY_PC12 = (() => {
  const out = [];
  let acc = 0;
  for (let pc = 0; pc < 12; pc += 1) {
    out[pc] = acc;
    acc += EURO_SEMITONE_COMMAS_UP_BY_PC12[pc];
  }
  return out; // C=0, C#=4, D=9, ... B=49
})();

function normalizeSigned53(delta) {
  let v = Number(delta);
  while (v > 26) v -= 53;
  while (v < -26) v += 53;
  return v;
}

function euroSemitoneDeltaCommas53({ tonicPc12, deltaSteps }) {
  const pc = mod(Number(tonicPc12) || 0, 12);
  const d = Number(deltaSteps) || 0;
  if (d === 1) return EURO_SEMITONE_COMMAS_UP_BY_PC12[pc];
  if (d === -1) return -EURO_SEMITONE_COMMAS_UP_BY_PC12[mod(pc - 1, 12)];
  return 0;
}

function baseId53ForNaturalLetter(letterUpper) {
  const pc = PC_NAT_12[String(letterUpper || "").toUpperCase()];
  if (pc == null) return 0;
  return SEMITONE_POS_53_BMODE_BY_PC12[pc] || 0;
}

function nearestPc12ForId53(id53) {
  const id = mod(Number(id53) || 0, 53);
  let bestPc = 0;
  let bestDist = Infinity;
  for (let pc = 0; pc < 12; pc += 1) {
    const dist = Math.abs(normalizeSigned53(id - SEMITONE_POS_53_BMODE_BY_PC12[pc]));
    if (dist < bestDist) {
      bestDist = dist;
      bestPc = pc;
    }
  }
  return bestPc;
}

function exactPc12ForId53(id53) {
  const id = mod(Number(id53) || 0, 53);
  for (let pc = 0; pc < 12; pc += 1) {
    if (SEMITONE_POS_53_BMODE_BY_PC12[pc] === id) return pc;
  }
  return null;
}

function pairRank53(micro) {
  if (micro === 4 || micro === -5) return 0;
  if (micro === -4 || micro === 5) return 1;
  return 2;
}

// For EDO-53, constrain spelling to the “human” accidental set we actually use in this project.
// This prevents nonsense outputs like ^13G / _22B that are technically representable in 53-EDO,
// but are not part of our intended ABC spelling vocabulary.
const ALLOWED_MICRO_STEPS_53 = new Set([
  -8, -6, -5, -4, -3, -2, -1,
  0,
  1, 2, 3, 4, 5, 6, 8,
]);

function isAllowedMicro53(micro) {
  const m = Number(micro);
  if (!Number.isFinite(m)) return false;
  return ALLOWED_MICRO_STEPS_53.has(Math.trunc(m));
}

function microPrefixFor53(micro, { explicit } = {}) {
  const m = Number(micro) || 0;
  if (m === 0) return explicit ? "=" : "";
  // Prefer slash notation for +/-2, since it is widely used in existing corpora.
  if (m === 2) return "^/";
  if (m === -2) return "_/";
  return m > 0 ? `^${m}` : `_${-m}`;
}

function keySignatureLetterFor53(letterUpper, micro) {
  const upper = String(letterUpper || "").toUpperCase();
  // ABC letter case also chooses the octave where abc2svg draws an explicit
  // key accidental. Use the conventional treble-key positions so a modified
  // F sharp replaces the normal Em key sign instead of appearing below it.
  const positions = Number(micro) < 0
    ? { B: "B", E: "e", A: "A", D: "d", G: "G", C: "c", F: "f" }
    : { F: "f", C: "c", G: "g", D: "d", A: "A", E: "e", B: "B" };
  return positions[upper] || upper;
}

function abcTokenFor53Candidate(letterUpper, micro, octave) {
  let letter = String(letterUpper || "").toUpperCase();
  const oct = Number(octave);
  if (Number.isFinite(oct)) {
    if (oct >= 6) {
      letter = letter.toLowerCase() + "'".repeat(Math.max(0, oct - 6));
    } else {
      letter = letter.toUpperCase() + ",".repeat(Math.max(0, 5 - oct));
    }
  }
  const prefix = Number(micro) === 0 ? "" : microPrefixFor53(micro, { explicit: true });
  return `${prefix}${letter}`;
}

function sharedPerdeNameScore53(aToken, bToken) {
  const a = resolvePerdeNamesFromAbcToken(aToken);
  const b = resolvePerdeNamesFromAbcToken(bToken);
  if (!a.length || !b.length) return 1;
  const bs = new Set(b);
  return a.some((name) => bs.has(name)) ? 0 : 1;
}

function chooseSpelling53ForId({ id53, preferFlats, preferSharps }) {
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  let best = null;
  for (let idx = 0; idx < letters.length; idx += 1) {
    const L = letters[idx];
    const base = baseId53ForNaturalLetter(L);
    // Keep micro offsets small ([-26..+26]) and adjust octave during note serialization if needed.
    const micro = normalizeSigned53(Number(id53) - base);
    if (!isAllowedMicro53(micro)) continue;
    const sideScore = preferFlats ? (micro < 0 ? 0 : 1) : (preferSharps ? (micro > 0 ? 0 : 1) : 0);
    // Keep accidental size small first; directional preference should only break ties
    // between similarly readable spellings.
    const score = [pairRank53(micro), Math.abs(micro), sideScore, idx];
    if (!best) best = { letterUpper: L, micro, score };
    else {
      for (let i = 0; i < score.length; i += 1) {
        if (score[i] < best.score[i]) { best = { letterUpper: L, micro, score }; break; }
        if (score[i] > best.score[i]) break;
      }
    }
  }
  return best;
}

function splitComment(text) {
  const s = String(text || "");
  const idx = s.indexOf("%");
  if (idx === -1) return { head: s, comment: "" };
  return { head: s.slice(0, idx), comment: s.slice(idx) };
}

function parseKLineBodyForRewrite(body) {
  const raw = String(body || "");
  const m = raw.match(/^(\s*)(\S+)([\s\S]*)$/);
  if (!m) return { leading: "", firstToken: "", rest: raw };
  return { leading: m[1], firstToken: m[2], rest: m[3] };
}

function parseInitialKKeyToken(body) {
  const raw = String(body || "");
  const m = raw.match(/^(\s*)(\S+)([\s\S]*)$/);
  if (!m) return { leading: "", keyToken: "", end: 0, tail: raw };

  const leading = m[1] || "";
  let keyToken = m[2] || "";
  let end = leading.length + keyToken.length;
  let tail = m[3] || "";
  const mode = tail.match(/^(\s+)(major|minor|maj|min|m)\b/i);
  if (mode) {
    keyToken += `${mode[1]}${mode[2]}`;
    end += mode[1].length + mode[2].length;
    tail = tail.slice(mode[1].length + mode[2].length);
  }

  return { leading, keyToken, end, tail };
}

function tonicSideFromKeyToken(token) {
  const raw = String(token || "").trim();
  if (!raw || /^none$/i.test(raw)) return "neutral";
  const match = raw.match(/^([A-Ga-g])([#b]?)/);
  if (!match) return "neutral";
  if (match[2] === "b") return "flat";
  if (match[2] === "#") return "sharp";
  return "neutral";
}

function tonicLetterFromKeyToken(token) {
  const raw = String(token || "").trim();
  if (!raw || /^none$/i.test(raw)) return null;
  const match = raw.match(/^([A-Ga-g])/);
  return match ? match[1].toUpperCase() : null;
}

function computeLetterShiftBetweenTonics(sourceToken, targetToken) {
  const src = tonicLetterFromKeyToken(sourceToken);
  const dst = tonicLetterFromKeyToken(targetToken);
  if (!src || !dst) return 0;
  const srcIdx = LETTER_ORDER.indexOf(src);
  const dstIdx = LETTER_ORDER.indexOf(dst);
  if (srcIdx < 0 || dstIdx < 0) return 0;
  let diff = dstIdx - srcIdx;
  while (diff > 3) diff -= 7;
  while (diff < -3) diff += 7;
  return diff;
}

function shiftLetterFamily(letterUpper, shift) {
  const idx = LETTER_ORDER.indexOf(String(letterUpper || "").toUpperCase());
  if (idx < 0) return String(letterUpper || "").toUpperCase();
  return LETTER_ORDER[mod(idx + (Number(shift) || 0), 7)];
}

function parseKFirstTokenTonicPc12(body) {
  const { head } = splitComment(body);
  const m = String(head || "").match(/^\s*(\S+)/);
  if (!m) return 0;
  const tok = m[1];
  if (/^none$/i.test(tok)) return 0;
  const t = tok.match(/^([A-G])([#b]?)/);
  if (!t) return 0;
  const base = PC_NAT_12[t[1].toUpperCase()];
  const a = t[2] === "#" ? 1 : t[2] === "b" ? -1 : 0;
  return base == null ? 0 : mod(base + a, 12);
}

function mapsEqual53(a, b) {
  const aa = a || {};
  const bb = b || {};
  const keys = new Set([...Object.keys(aa), ...Object.keys(bb)]);
  for (const key of keys) {
    if ((aa[key] ?? 0) !== (bb[key] ?? 0)) return false;
  }
  return true;
}

function normalizeKBody53ToC(kBody) {
  const tonicPc12 = parseKFirstTokenTonicPc12(kBody);
  if (!tonicPc12) return String(kBody || "");
  let out = String(kBody || "");
  const step = tonicPc12 > 6 ? 1 : -1;
  const count = tonicPc12 > 6 ? 12 - tonicPc12 : tonicPc12;
  for (let i = 0; i < count; i += 1) {
    out = transposeKBody53Raw(out, step, {
      detectProfile: false,
      functionalKeyTranspose53: false,
    }).text;
  }
  return out;
}

export function detectKnownMakamKeyProfile53(kBody) {
  const { head } = splitComment(kBody);
  const { keyToken } = parseInitialKKeyToken(head);
  const keyInfo = parseKeyToken(keyToken);
  // An explicit Western mode such as Am/Gm is authoritative. A sparse added
  // micro-accidental is not enough evidence to replace it with a makam profile.
  if (String(keyInfo?.modeSuffix || "").trim()) return null;
  const normalized = normalizeKBody53ToC(kBody);
  const normalizedMap = buildEffectiveKeyMicroMap53FromKBody(normalized);
  for (const entry of BUILTIN_MAKAM_K_SIGNATURES) {
    const canonicalBody = entry && typeof entry.k === "string" ? entry.k : "";
    if (!canonicalBody) continue;
    const canonicalMap = buildEffectiveKeyMicroMap53FromKBody(canonicalBody);
    if (mapsEqual53(normalizedMap, canonicalMap)) {
      return {
        id: String(entry.makam || "").trim(),
        label: String(entry.makam || "").trim(),
        canonicalBodyC: canonicalBody,
        canonicalMapC: canonicalMap,
      };
    }
  }
  return null;
}

function semitoneUpCommasByPc12(pc) {
  return EURO_SEMITONE_COMMAS_UP_BY_PC12[mod(pc, 12)];
}

function semitoneDownCommasByPc12(pc) {
  return -EURO_SEMITONE_COMMAS_UP_BY_PC12[mod(pc - 1, 12)];
}

function parseAccidentalPrefix53(prefix, letterPc12) {
  const p = String(prefix || "");
  if (!p) return { explicit: false, micro: null, kind: "none" };
  if (p === "=") return { explicit: true, micro: 0, kind: "natural" };
  if (p === "^/") return { explicit: true, micro: 2, kind: "halfsharp" }; // ~24/53
  if (p === "_/") return { explicit: true, micro: -2, kind: "halfflat" }; // ~-24/53

  const frac = p.match(/^(\^|_)(-?\d+)\/(\d+)$/);
  if (frac) {
    const dir = frac[1] === "^" ? 1 : -1;
    const num = Number(frac[2]);
    const den = Number(frac[3]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return { explicit: false, micro: null, kind: "none" };
    const units = (num / den) * (53 / 12);
    if (!Number.isFinite(units)) return { explicit: false, micro: null, kind: "none" };
    const micro = Math.round(units) * dir;
    return { explicit: true, micro, kind: "fractional" };
  }

  const integer = p.match(/^(\^|_)(-?\d+)$/);
  if (integer) {
    const dir = integer[1] === "^" ? 1 : -1;
    const n = Number(integer[2]);
    if (!Number.isFinite(n)) return { explicit: false, micro: null, kind: "none" };
    return { explicit: true, micro: dir * Math.trunc(n), kind: "numeric" };
  }

  if (p === "^") return { explicit: true, micro: semitoneUpCommasByPc12(letterPc12), kind: "sharp" };
  if (p === "_") return { explicit: true, micro: semitoneDownCommasByPc12(letterPc12), kind: "flat" };
  if (p === "^^") {
    const d0 = semitoneUpCommasByPc12(letterPc12);
    const d1 = semitoneUpCommasByPc12(mod(letterPc12 + 1, 12));
    return { explicit: true, micro: d0 + d1, kind: "doublesharp" };
  }
  if (p === "__") {
    const d0 = semitoneDownCommasByPc12(letterPc12);
    const d1 = semitoneDownCommasByPc12(mod(letterPc12 - 1, 12));
    return { explicit: true, micro: d0 + d1, kind: "doubleflat" };
  }

  return { explicit: false, micro: null, kind: "none" };
}

function parseNoteTokenAt53(src, startIdx) {
  const text = String(src || "");
  let idx = startIdx;
  let accPrefix = "";
  if (text.startsWith("^^", idx) || text.startsWith("__", idx)) {
    accPrefix = text.slice(idx, idx + 2);
    idx += 2;
  } else if (text.startsWith("^/", idx) || text.startsWith("_/", idx)) {
    accPrefix = text.slice(idx, idx + 2);
    idx += 2;
  } else if (text[idx] === "^" || text[idx] === "_" || text[idx] === "=") {
    accPrefix = text[idx];
    idx += 1;
    // Numeric or fractional accidental: ^k, _k, ^n/d, _n/d
    if ((accPrefix === "^" || accPrefix === "_") && (text[idx] === "-" || /[0-9]/.test(text[idx]))) {
      let j = idx;
      if (text[j] === "-") j += 1;
      let saw = false;
      while (j < text.length && /[0-9]/.test(text[j])) { j += 1; saw = true; }
      if (j < text.length && text[j] === "/") {
        j += 1;
        let sawDen = false;
        while (j < text.length && /[0-9]/.test(text[j])) { j += 1; sawDen = true; }
        if (saw && sawDen) {
          accPrefix = text.slice(startIdx, j);
          idx = j;
        }
      } else if (saw) {
        accPrefix = text.slice(startIdx, j);
        idx = j;
      }
    }
  }

  const letter = text[idx];
  if (!letter || !/[A-Ga-g]/.test(letter)) return null;
  idx += 1;
  let octaveMarks = "";
  while (idx < text.length && (text[idx] === "," || text[idx] === "'")) {
    octaveMarks += text[idx];
    idx += 1;
  }
  let duration = "";
  while (idx < text.length && /[0-9/]/.test(text[idx])) {
    duration += text[idx];
    idx += 1;
  }
  return {
    start: startIdx,
    end: idx,
    accPrefix,
    letter,
    octaveMarks,
    duration,
  };
}

function chooseTonicNameByPc(pc, { deltaSteps, originalSide } = {}) {
  const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][mod(pc, 12)];
  const flat = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][mod(pc, 12)];
  if (sharp === flat) return sharp;
  if (deltaSteps > 0) return sharp;
  if (deltaSteps < 0) return flat;
  if (originalSide === "sharp") return sharp;
  if (originalSide === "flat") return flat;
  return flat;
}

function chooseTonicNameByPcForMakam53(pc, options = {}) {
  const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][mod(pc, 12)];
  const flat = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][mod(pc, 12)];
  if (sharp === flat) return sharp;
  return flat;
}

function shiftKBody53ByPc(body, targetPc12) {
  const target = mod(Number(targetPc12) || 0, 12);
  let out = String(body || "");
  let cur = parseKFirstTokenTonicPc12(out);
  let guard = 0;
  while (cur !== target && guard < 24) {
    const up = mod(target - cur, 12);
    const step = up <= 6 ? 1 : -1;
    out = transposeKBody53Raw(out, step, { detectProfile: false, preferMakamTonic: true }).text;
    cur = parseKFirstTokenTonicPc12(out);
    guard += 1;
  }
  return out;
}

function parseExplicitKeyAccTokens53(body) {
  const { head } = splitComment(body);
  const tokens = [];
  const re = /(\^\^|__|\^\/|_\/|\^[-]?\d+\/\d+|_[-]?\d+\/\d+|\^[-]?\d+|_[-]?\d+|\^|_|=)([A-Ga-g])/g;
  let m;
  while ((m = re.exec(head)) !== null) {
    tokens.push({ acc: m[1], letter: m[2] });
  }
  return tokens;
}

function buildKeyMicroMapFromKBody53(body, { allowMicro = true } = {}) {
  const map = {};
  for (const tok of parseExplicitKeyAccTokens53(body)) {
    // In EDO-12 mode, treat numeric/fractional micro-accidentals in K: as out-of-scope.
    // (They are meaningful only when the tune explicitly opts into EDO-53.)
    if (!allowMicro) {
      const acc = String(tok.acc || "");
      const isMicro = (
        acc === "^/" ||
        acc === "_/" ||
        /^\^[-]?\d+\/\d+$/.test(acc) ||
        /^_[-]?\d+\/\d+$/.test(acc) ||
        /^\^[-]?\d+$/.test(acc) ||
        /^_[-]?\d+$/.test(acc)
      );
      if (isMicro) continue;
    }
    const upper = tok.letter.toUpperCase();
    const pc = PC_NAT_12[upper];
    if (pc == null) continue;
    const parsed = parseAccidentalPrefix53(tok.acc, pc);
    if (!parsed.explicit) continue;
    map[upper] = parsed.micro;
  }
  return map;
}

function shouldInferWesternKeySignature53(kBody, { inferWithExplicit = false } = {}) {
  const { head } = splitComment(kBody);
  const { firstToken } = parseKLineBodyForRewrite(head);
  const keyInfo = parseKeyToken(firstToken) || { isNone: true, modeSuffix: "" };
  if (!keyInfo || keyInfo.isNone) return false;
  const explicit = parseExplicitKeyAccTokens53(head);
  if (explicit.length > 0 && !inferWithExplicit) return false;
  const suffix = String(keyInfo.modeSuffix || "").trim().toLowerCase();
  return !suffix || suffix === "maj" || suffix === "major" || suffix === "m" || suffix === "min" || suffix === "minor";
}

export function buildEffectiveKeyMicroMap53FromKBody(kBody, {
  allowMicro = true,
  inferWesternWithExplicit = false,
} = {}) {
  const { head } = splitComment(kBody);
  const { firstToken } = parseKLineBodyForRewrite(head);
  const keyInfo = parseKeyToken(firstToken) || { isNone: true, pref: "flat", accCount: 0 };

  const out = {};
  if (!keyInfo.isNone && shouldInferWesternKeySignature53(head, {
    inferWithExplicit: inferWesternWithExplicit,
  })) {
    const sig = buildKeySignature(keyInfo.accCount || 0, keyInfo.pref || "flat");
    for (const [letter, semi] of Object.entries(sig)) {
      if (!semi) continue;
      const pc = PC_NAT_12[String(letter || "").toUpperCase()];
      if (pc == null) continue;
      out[String(letter || "").toUpperCase()] = semi > 0
        ? semitoneUpCommasByPc12(pc)
        : semitoneDownCommasByPc12(pc);
    }
  }

  // Explicit accidentals listed in the K: line override the inferred key signature.
  const explicit = buildKeyMicroMapFromKBody53(head, { allowMicro });
  for (const [letter, micro] of Object.entries(explicit)) {
    out[String(letter || "").toUpperCase()] = micro;
  }

  return out;
}

function transposeKBody53Raw(body, deltaSteps, options = {}) {
  const { head, comment } = splitComment(body);
  const { leading, firstToken } = parseKLineBodyForRewrite(head);
  const readTonicPc12 = parseKFirstTokenTonicPc12(head);
  const deltaCommas = Number.isFinite(options.deltaCommasOverride)
    ? options.deltaCommasOverride
    : euroSemitoneDeltaCommas53({ tonicPc12: readTonicPc12, deltaSteps });
  const declaredKeyInfo = parseKeyToken(firstToken);
  const hasDeclaredWesternMode = Boolean(String(declaredKeyInfo?.modeSuffix || "").trim());
  const sourceMakamProfile53 = options.detectProfile === false || hasDeclaredWesternMode
    ? null
    : detectKnownMakamKeyProfile53(head);
  const inferWesternWithExplicit = !sourceMakamProfile53;
  const readKeyMicroMap = buildEffectiveKeyMicroMap53FromKBody(head, { inferWesternWithExplicit });
  const targetTonicPc12 = mod(readTonicPc12 + deltaSteps, 12);

  if (sourceMakamProfile53 && options.fromCanonicalProfile !== false) {
    const rendered = shiftKBody53ByPc(sourceMakamProfile53.canonicalBodyC, targetTonicPc12);
    const tonicToken = parseKLineBodyForRewrite(rendered).firstToken || "";
    return {
      text: rendered + comment,
      tonicToken,
      letterShift53: computeLetterShiftBetweenTonics(firstToken, tonicToken),
      readTonicPc12,
      deltaCommas,
      readKeyMicroMap,
      writeKeyMicroMap: buildEffectiveKeyMicroMap53FromKBody(rendered),
      makamProfile53: sourceMakamProfile53.id,
    };
  }

  const isNone = /^none$/i.test(firstToken || "");
  let newFirstToken = String(firstToken || "");
  let functionalKeyTranspose53 = false;
  let sourceWesternKeyMap = {};
  let targetWesternKeyMap = {};
  let keyLetterShift53 = 0;
  if (!isNone) {
    const tokenMatch = String(firstToken || "").match(/^([A-G])([#b]?)(.*)$/);
    if (!tokenMatch) {
      return { text: body, readTonicPc12, deltaCommas, readKeyMicroMap, writeKeyMicroMap: readKeyMicroMap };
    }
    const tonicLetter = tokenMatch[1];
    const tonicAcc = tokenMatch[2] || "";
    const modeInline = tokenMatch[3] || "";
    const pc0 = mod(PC_NAT_12[tonicLetter] + (tonicAcc === "#" ? 1 : tonicAcc === "b" ? -1 : 0), 12);
    const pc1 = mod(pc0 + deltaSteps, 12);
    const originalSide = tonicAcc === "#" ? "sharp" : tonicAcc === "b" ? "flat" : "neutral";
    const keyInfo = declaredKeyInfo;
    const mode = String(keyInfo && keyInfo.modeSuffix || "").trim().toLowerCase();
    const isSimpleWesternMode = !mode || mode === "maj" || mode === "major"
      || mode === "m" || mode === "min" || mode === "minor";
    const useFunctionalWestern = Boolean(
      options.functionalKeyTranspose53 !== false
      && !sourceMakamProfile53
      && keyInfo
      && isSimpleWesternMode
      && hasDeclaredWesternMode
    );
    let tonic1Name;
    if (sourceMakamProfile53 || options.preferMakamTonic) {
      tonic1Name = chooseTonicNameByPcForMakam53(pc1, { deltaSteps, originalSide });
    } else if (useFunctionalWestern) {
      const prefer = originalSide === "neutral"
        ? (options.prefer || (deltaSteps < 0 ? "flat" : "sharp"))
        : originalSide;
      tonic1Name = chooseKeyName(pc1, keyInfo.isMinor, prefer).name;
    } else {
      tonic1Name = chooseTonicNameByPc(pc1, { deltaSteps, originalSide });
    }
    newFirstToken = `${tonic1Name}${modeInline}`;
    functionalKeyTranspose53 = useFunctionalWestern;
    if (functionalKeyTranspose53) {
      sourceWesternKeyMap = buildEffectiveKeyMicroMap53FromKBody(firstToken);
      keyLetterShift53 = computeLetterShiftBetweenTonics(firstToken, newFirstToken);
    }
  }
  targetWesternKeyMap = buildEffectiveKeyMicroMap53FromKBody(newFirstToken);

  const outTokens = [];
  const preferSharps = deltaSteps > 0;
  const preferFlats = deltaSteps < 0;
  for (const tok of parseExplicitKeyAccTokens53(head)) {
    const upper = tok.letter.toUpperCase();
    const pc = PC_NAT_12[upper];
    if (pc == null) continue;
    const base0 = baseId53ForNaturalLetter(upper);
    const parsed = parseAccidentalPrefix53(tok.acc, pc);
    if (!parsed.explicit) continue;
    let chosen;
    if (functionalKeyTranspose53) {
      const targetLetter = shiftLetterFamily(upper, keyLetterShift53);
      const sourceDefault = sourceWesternKeyMap[upper] ?? 0;
      const targetDefault = targetWesternKeyMap[targetLetter] ?? 0;
      chosen = {
        letterUpper: targetLetter,
        micro: targetDefault + (parsed.micro - sourceDefault),
      };
    } else {
      const id0 = mod(base0 + parsed.micro, 53);
      const id1 = mod(id0 + deltaCommas, 53);
      chosen = chooseSpelling53ForId({ id53: id1, preferFlats, preferSharps });
    }
    if (!chosen || !isAllowedMicro53(chosen.micro)) continue;
    if (targetWesternKeyMap[chosen.letterUpper] === chosen.micro) continue;
    const outLetter = keySignatureLetterFor53(chosen.letterUpper, chosen.micro);
    outTokens.push(`${microPrefixFor53(chosen.micro, { explicit: true })}${outLetter}`);
  }

  const suffix = outTokens.length ? ` ${outTokens.join(" ")}` : "";
  const text = `${leading}${newFirstToken}${suffix}${comment}`;
  return {
    text,
    tonicToken: newFirstToken,
    letterShift53: computeLetterShiftBetweenTonics(firstToken, newFirstToken),
    functionalKeyTranspose53,
    readTonicPc12,
    deltaCommas,
    readKeyMicroMap,
    writeKeyMicroMap: buildEffectiveKeyMicroMap53FromKBody(text, { inferWesternWithExplicit }),
  };
}

function transposeKBody53(body, deltaSteps, options = {}) {
  const profile = detectKnownMakamKeyProfile53(body);
  const info = transposeKBody53Raw(body, deltaSteps, options);
  if (!profile) return info;
  return {
    ...info,
    makamProfile53: profile.id,
  };
}

function splitLinesWithNewlines(text) {
  const s = String(text || "");
  const parts = [];
  let last = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "\n" || ch === "\r") {
      const nl = (ch === "\r" && s[i + 1] === "\n") ? "\r\n" : ch;
      const end = i;
      parts.push({ line: s.slice(last, end), nl });
      last = i + nl.length;
      if (nl.length === 2) i += 1;
    }
  }
  parts.push({ line: s.slice(last), nl: "" });
  return parts;
}

function isFieldLine(line) {
  const s = String(line || "");
  return /^[\t ]*[A-Za-z]:/.test(s) || /^[\t ]*%/.test(s);
}

function isTopLevelKLine53(line) {
  return /^\s*K:/.test(String(line || ""));
}

function parseTopLevelKLine53(line) {
  const m = String(line || "").match(/^([\t ]*K:\s*)([\s\S]*)$/);
  if (!m) return null;
  return { prefix: m[1], body: m[2] || "" };
}

function formatSurrogateKBody53(microMap) {
  const tokens = [];
  const entries = [];
  for (const letter of LETTER_ORDER) {
    const micro = microMap && Object.prototype.hasOwnProperty.call(microMap, letter)
      ? microMap[letter]
      : null;
    if (micro == null || micro === 0) continue;
    entries.push({ letter, micro });
  }
  const positiveCount = entries.filter((entry) => entry.micro > 0).length;
  const negativeCount = entries.filter((entry) => entry.micro < 0).length;
  const primaryOrder = positiveCount > negativeCount ? SHARP_SIGNATURE_ORDER : FLAT_SIGNATURE_ORDER;
  const secondaryOrder = primaryOrder === SHARP_SIGNATURE_ORDER ? FLAT_SIGNATURE_ORDER : SHARP_SIGNATURE_ORDER;
  const orderIndex = (entry) => {
    const order = entry.micro > 0 ? SHARP_SIGNATURE_ORDER : FLAT_SIGNATURE_ORDER;
    const group = order === primaryOrder ? 0 : 1;
    const idx = (order === primaryOrder ? primaryOrder : secondaryOrder).indexOf(entry.letter);
    return group * 10 + (idx === -1 ? 9 : idx);
  };
  entries.sort((a, b) => orderIndex(a) - orderIndex(b));
  for (const { letter, micro } of entries) {
    const displayMap = micro > 0 ? SHARP_SIGNATURE_DISPLAY_LETTERS : FLAT_SIGNATURE_DISPLAY_LETTERS;
    const displayLetter = displayMap[letter] || letter;
    tokens.push(`${microPrefixFor53(micro, { explicit: true })}${displayLetter}`);
  }
  return tokens.length ? `none ${tokens.join(" ")}` : "none";
}

function barAccidentalKey53(letterUpper, octave) {
  return `${String(letterUpper || "").toUpperCase()}:${Number.isFinite(octave) ? octave : 5}`;
}

function collectSegmentLetterStats53(lines, keyMap) {
  const stats = {};
  for (const letter of LETTER_ORDER) {
    stats[letter] = { total: 0, byMicro: new Map(), barsByMicro: new Map() };
  }
  let barMicroRead = {};
  let barIndex = 0;

  const register = (letter, micro) => {
    const entry = stats[letter];
    entry.total += 1;
    entry.byMicro.set(micro, (entry.byMicro.get(micro) || 0) + 1);
    const set = entry.barsByMicro.get(micro) || new Set();
    set.add(barIndex);
    entry.barsByMicro.set(micro, set);
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    if (isFieldLine(line)) continue;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "\"") {
        const close = line.indexOf("\"", i + 1);
        i = close !== -1 ? close + 1 : i + 1;
        continue;
      }
      if (ch === "!") {
        const close = line.indexOf("!", i + 1);
        i = close !== -1 ? close + 1 : i + 1;
        continue;
      }
      if (ch === "[" && /[A-Za-z]:/.test(line.slice(i + 1, i + 3))) {
        const close = line.indexOf("]", i);
        i = close !== -1 ? close + 1 : i + 1;
        continue;
      }
      if (ch === "%") break;
      if (ch === "|") {
        barMicroRead = {};
        barIndex += 1;
        i += 1;
        continue;
      }
      const note = parseNoteTokenAt53(line, i);
      if (!note) {
        i += 1;
        continue;
      }
      const upper = note.letter.toUpperCase();
      const pc = PC_NAT_12[upper];
      const explicit = parseAccidentalPrefix53(note.accPrefix, pc);
      const octave = computeOctave(note.letter, note.octaveMarks);
      const barKey = barAccidentalKey53(upper, octave);
      let micro = 0;
      if (explicit.explicit) {
        micro = explicit.micro;
        barMicroRead[barKey] = micro;
      } else if (Object.prototype.hasOwnProperty.call(barMicroRead, barKey)) {
        micro = barMicroRead[barKey];
      } else if (keyMap && Object.prototype.hasOwnProperty.call(keyMap, upper)) {
        micro = keyMap[upper];
      }
      register(upper, micro);
      i = note.end;
    }
  }

  return stats;
}

function detectFinalisPc12For53(text) {
  const parts = splitLinesWithNewlines(text);
  let keyMap = {};
  let barMicroRead = {};
  let lastPc12 = null;

  for (const part of parts) {
    const line = String(part.line || "");
    const kMatch = line.match(/^\s*K:([\s\S]*)$/);
    if (kMatch) {
      const kBody = kMatch[1] || "";
      const makamProfile = detectKnownMakamKeyProfile53(kBody);
      keyMap = buildEffectiveKeyMicroMap53FromKBody(kBody, {
        inferWesternWithExplicit: !makamProfile,
      });
      barMicroRead = {};
      continue;
    }
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "\"") {
        const close = line.indexOf("\"", i + 1);
        i = close !== -1 ? close + 1 : i + 1;
        continue;
      }
      if (ch === "!") {
        const close = line.indexOf("!", i + 1);
        i = close !== -1 ? close + 1 : i + 1;
        continue;
      }
      if (ch === "[" && /[A-Za-z]:/.test(line.slice(i + 1, i + 3))) {
        const close = line.indexOf("]", i);
        i = close !== -1 ? close + 1 : i + 1;
        continue;
      }
      if (ch === "%") break;
      if (ch === "|") {
        barMicroRead = {};
        i += 1;
        continue;
      }
      const note = parseNoteTokenAt53(line, i);
      if (!note) {
        i += 1;
        continue;
      }
      const upper = note.letter.toUpperCase();
      const pc = PC_NAT_12[upper];
      if (pc == null) {
        i = note.end;
        continue;
      }
      const explicit = parseAccidentalPrefix53(note.accPrefix, pc);
      const octave = computeOctave(note.letter, note.octaveMarks);
      const barKey = barAccidentalKey53(upper, octave);
      let micro = 0;
      if (explicit.explicit) {
        micro = explicit.micro;
        barMicroRead[barKey] = micro;
      } else if (Object.prototype.hasOwnProperty.call(barMicroRead, barKey)) {
        micro = barMicroRead[barKey];
      } else if (keyMap && Object.prototype.hasOwnProperty.call(keyMap, upper)) {
        micro = keyMap[upper];
      }
      const exactPc12 = exactPc12ForId53(baseId53ForNaturalLetter(upper) + micro);
      if (exactPc12 != null) lastPc12 = exactPc12;
      i = note.end;
    }
  }

  return lastPc12;
}

function buildSurrogateKeyMap53FromStats(stats, options = {}) {
  const minTotal = Number.isFinite(options.minTotal) ? options.minTotal : 3;
  const minBars = Number.isFinite(options.minBars) ? options.minBars : 2;
  const dominance = Number.isFinite(options.dominance) ? options.dominance : 0.65;
  const minMargin = Number.isFinite(options.minMargin) ? options.minMargin : 2;
  const out = {};

  for (const letter of LETTER_ORDER) {
    const entry = stats[letter];
    if (!entry || entry.total < minTotal) continue;
    const ranked = Array.from(entry.byMicro.entries()).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) continue;
    const [m1, c1] = ranked[0];
    const c2 = ranked[1] ? ranked[1][1] : 0;
    const bars = entry.barsByMicro.get(m1) ? entry.barsByMicro.get(m1).size : 0;
    if (c1 / entry.total < dominance) continue;
    if (bars < minBars) continue;
    if (c1 - c2 < minMargin) continue;
    if (Number(m1) !== 0) out[letter] = Number(m1);
  }

  return out;
}

function rewriteBarSegmentAgainstSurrogateKey53(segment, sourceKeyMap, surrogateKeyMap, ctx) {
  const src = String(segment || "");
  const pieces = [];
  const events = [];
  let barMicroRead = {};
  let i = 0;

  const sourceDefaultFor = (letterUpper, octave) => {
    const barKey = barAccidentalKey53(letterUpper, octave);
    return Object.prototype.hasOwnProperty.call(barMicroRead, barKey)
      ? barMicroRead[barKey]
      : (sourceKeyMap && Object.prototype.hasOwnProperty.call(sourceKeyMap, letterUpper)
        ? sourceKeyMap[letterUpper]
        : 0);
  };

  const pushText = (text) => {
    if (!text) return;
    pieces.push({ type: "text", text });
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\"") {
      const close = src.indexOf("\"", i + 1);
      if (close !== -1) {
        pushText(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
      pushText(ch);
      i += 1;
      continue;
    }
    if (ch === "!") {
      const close = src.indexOf("!", i + 1);
      if (close !== -1) {
        pushText(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
      pushText(ch);
      i += 1;
      continue;
    }
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        pushText(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
    }

    const note = parseNoteTokenAt53(src, i);
    if (!note) {
      pushText(ch);
      i += 1;
      continue;
    }

    const upper = note.letter.toUpperCase();
    const pc = PC_NAT_12[upper];
    if (pc == null) {
      pushText(src.slice(i, note.end));
      i = note.end;
      continue;
    }
    const explicit = parseAccidentalPrefix53(note.accPrefix, pc);
    const octave = computeOctave(note.letter, note.octaveMarks);
    const barKey = barAccidentalKey53(upper, octave);
    let micro = sourceDefaultFor(upper, octave);
    if (explicit.explicit) {
      micro = explicit.micro;
      barMicroRead[barKey] = micro;
    }
    const abs53 = octave * 53 + baseId53ForNaturalLetter(upper) + micro;
    const octBase = Math.trunc(Math.floor(abs53 / 53));
    const id53 = mod(abs53, 53);
    const candidates = [];
    const seen = new Set();
    const addCandidate = (letterUpperCand) => {
      const base = baseId53ForNaturalLetter(letterUpperCand);
      const microCand = normalizeSigned53(id53 - base);
      if (!isAllowedMicro53(microCand)) return;
      const absCand = octBase * 53 + base + microCand;
      const deltaOct = (abs53 - absCand) / 53;
      if (!Number.isFinite(deltaOct) || !Number.isInteger(deltaOct)) return;
      const cand = { letterUpper: letterUpperCand, micro: microCand, octave: octBase + deltaOct };
      const key = `${cand.letterUpper}:${cand.micro}:${cand.octave}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(cand);
    };

    addCandidate(upper);
    for (const letterUpperCand of LETTER_ORDER) addCandidate(letterUpperCand);

    const eventIndex = events.length;
    pieces.push({ type: "note", index: eventIndex });
    events.push({
      sourceUpper: upper,
      sourceMicro: micro,
      sourceOctave: octave,
      explicit,
      duration: note.duration || "",
      candidates,
    });
    i = note.end;
  }

  if (!events.length) return pieces.map((piece) => piece.text || "").join("");

  let states = new Map();
  states.set("[]", {
    score: [],
    writeMap: {},
    lastSourceUpper: ctx.lastSourceUpper || null,
    lastOutputUpper: ctx.lastOutputUpper || null,
    path: [],
  });

  for (const event of events) {
    const nextStates = new Map();
    for (const state of states.values()) {
      for (const cand of event.candidates) {
        const writeBarKey = barAccidentalKey53(cand.letterUpper, cand.octave);
        const writeDefault = Object.prototype.hasOwnProperty.call(state.writeMap, writeBarKey)
          ? state.writeMap[writeBarKey]
          : (surrogateKeyMap && Object.prototype.hasOwnProperty.call(surrogateKeyMap, cand.letterUpper)
            ? surrogateKeyMap[cand.letterUpper]
            : 0);
        const needsExplicit = cand.micro !== writeDefault;
        const contourCollapse = state.lastSourceUpper
          && state.lastSourceUpper !== event.sourceUpper
          && state.lastOutputUpper === cand.letterUpper
          ? 1
          : 0;
        const sameSourceSplit = state.lastSourceUpper
          && state.lastSourceUpper === event.sourceUpper
          && state.lastOutputUpper !== cand.letterUpper
          ? 1
          : 0;
        const letterChange = cand.letterUpper === event.sourceUpper ? 0 : 1;
        const nonMicroScore = (!event.explicit.explicit && cand.micro === 0) ? 0 : 1;
        const octaveShift = Math.abs(cand.octave - event.sourceOctave);
        const localScore = [
          contourCollapse,
          sameSourceSplit,
          needsExplicit ? 1 : 0,
          letterChange,
          nonMicroScore,
          octaveShift,
          pairRank53(cand.micro),
          Math.abs(cand.micro),
        ];
        const prefix = needsExplicit
          ? (cand.micro === 0 ? "=" : microPrefixFor53(cand.micro, { explicit: event.explicit.explicit }))
          : "";
        const writeMap = { ...state.writeMap };
        if (needsExplicit) writeMap[writeBarKey] = cand.micro;
        const score = addScoreArrays(state.score, localScore);
        const pathCand = { ...cand, prefix, duration: event.duration };
        const key = `${stateKeyForBarWriteMap53(writeMap)}|${event.sourceUpper}|${cand.letterUpper}`;
        const existing = nextStates.get(key);
        if (!existing || compareScoreArrays(score, existing.score) < 0) {
          nextStates.set(key, {
            score,
            writeMap,
            lastSourceUpper: event.sourceUpper,
            lastOutputUpper: cand.letterUpper,
            path: state.path.concat([pathCand]),
          });
        }
      }
    }
    states = nextStates;
  }

  let best = null;
  for (const state of states.values()) {
    if (!best || compareScoreArrays(state.score, best.score) < 0) best = state;
  }
  if (!best) return src;
  ctx.lastSourceUpper = best.lastSourceUpper || ctx.lastSourceUpper || null;
  ctx.lastOutputUpper = best.lastOutputUpper || ctx.lastOutputUpper || null;

  return pieces.map((piece) => {
    if (piece.type !== "note") return piece.text || "";
    return serializeCandidate53(best.path[piece.index]);
  }).join("");
}

function rewriteSegmentAgainstSurrogateKey53(lines, sourceKeyMap, surrogateKeyMap) {
  const outLines = [];
  const ctx = { lastSourceUpper: null, lastOutputUpper: null };

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    if (isFieldLine(line)) {
      outLines.push(line);
      continue;
    }
    const out = [];
    let i = 0;
    let segmentStart = 0;
    const flushBar = (end) => {
      if (end <= segmentStart) return "";
      const text = line.slice(segmentStart, end);
      segmentStart = end;
      return rewriteBarSegmentAgainstSurrogateKey53(text, sourceKeyMap, surrogateKeyMap, ctx);
    };

    while (i < line.length) {
      const ch = line[i];
      if (ch === "%") {
        out.push(flushBar(i));
        out.push(line.slice(i));
        segmentStart = line.length;
        break;
      }
      if (ch === "|") {
        out.push(flushBar(i));
        out.push(ch);
        i += 1;
        segmentStart = i;
        continue;
      }
      i += 1;
    }
    out.push(flushBar(line.length));
    outLines.push(out.join(""));
  }

  return outLines;
}

function simplify53DisplayKeyText(text, options = {}) {
  const parts = splitLinesWithNewlines(text);
  const out = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (!isTopLevelKLine53(part.line)) {
      out.push(part.line + part.nl);
      i += 1;
      continue;
    }
    const parsed = parseTopLevelKLine53(part.line);
    if (!parsed) {
      out.push(part.line + part.nl);
      i += 1;
      continue;
    }
    const sourceKeyMap = buildEffectiveKeyMicroMap53FromKBody(parsed.body);
    const segmentParts = [];
    let j = i + 1;
    let unsupported = false;
    while (j < parts.length && !isTopLevelKLine53(parts[j].line)) {
      if (parts[j].line.includes("[K:")) unsupported = true;
      segmentParts.push(parts[j]);
      j += 1;
    }
    if (unsupported) {
      out.push(part.line + part.nl);
      for (const segPart of segmentParts) out.push(segPart.line + segPart.nl);
      i = j;
      continue;
    }
    const segmentLines = segmentParts.map((p) => p.line);
    const stats = collectSegmentLetterStats53(segmentLines, sourceKeyMap);
    const surrogateKeyMap = buildSurrogateKeyMap53FromStats(stats, options);
    const newKBody = formatSurrogateKBody53(surrogateKeyMap);
    out.push(parsed.prefix + newKBody + part.nl);
    const rewrittenLines = rewriteSegmentAgainstSurrogateKey53(segmentLines, sourceKeyMap, surrogateKeyMap);
    for (let k = 0; k < segmentParts.length; k += 1) {
      out.push(rewrittenLines[k] + segmentParts[k].nl);
    }
    i = j;
  }
  return out.join("");
}

function compareScoreArrays(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i += 1) {
    const av = Number.isFinite(aa[i]) ? aa[i] : 0;
    const bv = Number.isFinite(bb[i]) ? bb[i] : 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function addScoreArrays(a, b) {
  const n = Math.max(a ? a.length : 0, b ? b.length : 0);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out[i] = (Number.isFinite(a && a[i]) ? a[i] : 0) + (Number.isFinite(b && b[i]) ? b[i] : 0);
  }
  return out;
}

function stateKeyForBarWriteMap53(map) {
  const entries = Object.entries(map || {}).sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

function serializeCandidate53(cand) {
  let letterOut = cand.letterUpper;
  let marks = "";
  const outOct = Number.isFinite(cand.octave) ? cand.octave : 6;
  if (outOct >= 6) {
    letterOut = letterOut.toLowerCase();
    marks = "'".repeat(Math.max(0, outOct - 6));
  } else {
    letterOut = letterOut.toUpperCase();
    marks = ",".repeat(Math.max(0, 5 - outOct));
  }
  return `${cand.prefix || ""}${letterOut}${marks}${cand.duration || ""}`;
}

function transposeBarSegment53Western(segment, deltaSteps, ctx, preferDefault, preferFlats, preferSharps) {
  const src = String(segment || "");
  const deltaCommas = Number(ctx.deltaCommas) || 0;
  const pieces = [];
  const events = [];
  let i = 0;
  let readBar = {};

  const pushText = (text) => {
    if (!text) return;
    pieces.push({ type: "text", text });
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\"") {
      const close = src.indexOf("\"", i + 1);
      if (close !== -1) {
        const inner = src.slice(i + 1, close);
        const tonicSide = tonicSideFromKeyToken(ctx.tonicToken53);
        const chordPreference = tonicSide === "sharp" || tonicSide === "flat"
          ? tonicSide
          : preferDefault;
        pushText(`"${transposeChordText(inner, deltaSteps, chordPreference)}"`);
        i = close + 1;
        continue;
      }
      pushText(ch);
      i += 1;
      continue;
    }
    if (ch === "!") {
      const close = src.indexOf("!", i + 1);
      if (close !== -1) {
        pushText(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
      pushText(ch);
      i += 1;
      continue;
    }
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        pushText(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
    }

    const note = parseNoteTokenAt53(src, i);
    if (!note) {
      pushText(ch);
      i += 1;
      continue;
    }

    const upper = note.letter.toUpperCase();
    const pc = PC_NAT_12[upper];
    if (pc == null) {
      pushText(src.slice(i, note.end));
      i = note.end;
      continue;
    }

    const explicit = parseAccidentalPrefix53(note.accPrefix, pc);
    const oct = computeOctave(note.letter, note.octaveMarks);
    const readBarKey = barAccidentalKey53(upper, oct);
    let micro = 0;
    if (explicit.explicit) {
      micro = explicit.micro;
      readBar[readBarKey] = micro;
    } else if (Object.prototype.hasOwnProperty.call(readBar, readBarKey)) {
      micro = readBar[readBarKey];
    } else if (ctx.readKeyMicroMap && Object.prototype.hasOwnProperty.call(ctx.readKeyMicroMap, upper)) {
      micro = ctx.readKeyMicroMap[upper];
    }

    const abs53 = oct * 53 + baseId53ForNaturalLetter(upper) + micro;
    const preferredFamily = shiftLetterFamily(upper, ctx.letterShift53);
    let abs53New = abs53 + deltaCommas;
    if (ctx.functionalKeyTranspose53) {
      const sourceDefault = ctx.readKeyMicroMap?.[upper] ?? 0;
      const targetDefault = ctx.writeKeyMicroMap?.[preferredFamily] ?? 0;
      const targetMicro = targetDefault + (micro - sourceDefault);
      const targetBase = baseId53ForNaturalLetter(preferredFamily) + targetMicro;
      const targetOctave = Math.round((abs53New - targetBase) / 53);
      abs53New = targetOctave * 53 + targetBase;
    }
    const oct2 = Math.trunc(Math.floor(abs53New / 53));
    const id2 = mod(abs53New, 53);
    const candidates = [];
    const seenCandidates = new Set();
    const toCandidate = (letterUpperCand) => {
      const b = baseId53ForNaturalLetter(letterUpperCand);
      const microNorm = normalizeSigned53(Number(id2) - b);
      if (!isAllowedMicro53(microNorm)) return null;
      const absCand = oct2 * 53 + b + microNorm;
      const deltaOct = (abs53New - absCand) / 53;
      if (!Number.isFinite(deltaOct) || !Number.isInteger(deltaOct)) return null;
      return { letterUpper: letterUpperCand, micro: microNorm, octave: oct2 + deltaOct };
    };
    const addCandidate = (cand) => {
      if (!cand) return;
      const key = `${cand.letterUpper}:${cand.micro}:${cand.octave}`;
      if (seenCandidates.has(key)) return;
      seenCandidates.add(key);
      candidates.push(cand);
    };

    addCandidate(toCandidate(upper));
    addCandidate(toCandidate(shiftLetterFamily(upper, ctx.letterShift53)));
    const bestSpell = chooseSpelling53ForId({ id53: id2, preferFlats, preferSharps });
    if (bestSpell && bestSpell.letterUpper) addCandidate(toCandidate(bestSpell.letterUpper));
    if (ctx.makamProfile53) {
      for (const letterUpperCand of LETTER_ORDER) addCandidate(toCandidate(letterUpperCand));
    }

    const eventIndex = events.length;
    pieces.push({ type: "note", index: eventIndex });
    events.push({
      sourceUpper: upper,
      sourceMicro: micro,
      sourceOctave: oct,
      explicit,
      duration: note.duration || "",
      oct2,
      candidates,
      preferredFamily,
      sourcePerdeToken: abcTokenFor53Candidate(upper, micro, oct),
    });
    i = note.end;
  }

  if (!events.length) return pieces.map((piece) => piece.text || "").join("");

  let states = new Map();
  states.set("[]", {
    score: [],
    writeMap: {},
    lastSourceUpper: ctx.lastSourceUpper53 || null,
    lastOutputUpper: ctx.lastOutputUpper53 || null,
    path: [],
  });

  for (const event of events) {
    const nextStates = new Map();
    for (const state of states.values()) {
      for (const cand of event.candidates) {
        const writeBarKey = barAccidentalKey53(cand.letterUpper, cand.octave ?? event.oct2);
        const writeDefault = Object.prototype.hasOwnProperty.call(state.writeMap, writeBarKey)
          ? state.writeMap[writeBarKey]
          : (ctx.writeKeyMicroMap && Object.prototype.hasOwnProperty.call(ctx.writeKeyMicroMap, cand.letterUpper)
            ? ctx.writeKeyMicroMap[cand.letterUpper]
            : 0);
        const needsExplicit = cand.micro !== writeDefault;
        const makamDistance = ctx.makamProfile53 ? Math.abs(cand.micro - writeDefault) : 0;
        const familyMismatch = cand.letterUpper === event.preferredFamily ? 0 : 1;
        const sideScore = preferFlats ? (cand.micro < 0 ? 0 : 1) : (preferSharps ? (cand.micro > 0 ? 0 : 1) : 0);
        const letterChange = cand.letterUpper === event.sourceUpper ? 0 : 1;
        const octaveShift = Math.abs((cand.octave ?? event.oct2) - event.oct2);
        const nonMicroScore = (!event.explicit.explicit && cand.micro === 0) ? 0 : 1;
        const candidatePerdeToken = abcTokenFor53Candidate(cand.letterUpper, cand.micro, cand.octave ?? event.oct2);
        const perdeFamilyScore = sharedPerdeNameScore53(event.sourcePerdeToken, candidatePerdeToken);
        const contourCollapse = state.lastSourceUpper
          && state.lastSourceUpper !== event.sourceUpper
          && state.lastOutputUpper === cand.letterUpper
          ? 1
          : 0;
        const sameSourceSplit = state.lastSourceUpper
          && state.lastSourceUpper === event.sourceUpper
          && state.lastOutputUpper !== cand.letterUpper
          ? 1
          : 0;
        const localScore = [
          contourCollapse,
          sameSourceSplit,
          needsExplicit ? 1 : 0,
          nonMicroScore,
          familyMismatch,
          makamDistance,
          perdeFamilyScore,
          octaveShift,
          pairRank53(cand.micro),
          Math.abs(cand.micro),
          letterChange,
          sideScore,
        ];
        const prefix = needsExplicit
          ? (cand.micro === 0 ? "=" : microPrefixFor53(cand.micro, { explicit: event.explicit.explicit }))
          : "";
        const writeMap = { ...state.writeMap };
        if (needsExplicit) writeMap[writeBarKey] = cand.micro;
        const score = addScoreArrays(state.score, localScore);
        const pathCand = { ...cand, prefix, duration: event.duration };
        const key = `${stateKeyForBarWriteMap53(writeMap)}|${event.sourceUpper}|${cand.letterUpper}`;
        const existing = nextStates.get(key);
        if (!existing || compareScoreArrays(score, existing.score) < 0) {
          nextStates.set(key, {
            score,
            writeMap,
            lastSourceUpper: event.sourceUpper,
            lastOutputUpper: cand.letterUpper,
            path: state.path.concat([pathCand]),
          });
        }
      }
    }
    states = nextStates;
  }

  let best = null;
  for (const state of states.values()) {
    if (!best || compareScoreArrays(state.score, best.score) < 0) best = state;
  }
  if (!best) return src;
  ctx.lastSourceUpper53 = best.lastSourceUpper || ctx.lastSourceUpper53 || null;
  ctx.lastOutputUpper53 = best.lastOutputUpper || ctx.lastOutputUpper53 || null;

  return pieces.map((piece) => {
    if (piece.type !== "note") return piece.text || "";
    return serializeCandidate53(best.path[piece.index]);
  }).join("");
}

function transposeMusicLine53Western(line, deltaSteps, ctx, preferDefault) {
  const src = String(line || "");
  const out = [];
  let i = 0;
  let segmentStart = 0;
  const tonicSide = tonicSideFromKeyToken(ctx.tonicToken53);
  const preferSharps = tonicSide === "sharp" ? true : (tonicSide === "flat" ? false : deltaSteps > 0);
  const preferFlats = tonicSide === "flat" ? true : (tonicSide === "sharp" ? false : deltaSteps < 0);

  const flushBar = (end) => {
    if (end <= segmentStart) return "";
    const text = src.slice(segmentStart, end);
    segmentStart = end;
    return transposeBarSegment53Western(text, deltaSteps, ctx, preferDefault, preferFlats, preferSharps);
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        const tag = src[i + 1].toUpperCase();
        out.push(flushBar(i));
        if (tag === "K") {
          const inner = src.slice(i + 3, close);
          const info = transposeKBody53(inner, deltaSteps, { deltaCommasOverride: ctx.globalDeltaCommas });
          ctx.deltaCommas = info.deltaCommas;
          ctx.readKeyMicroMap = info.readKeyMicroMap;
          ctx.writeKeyMicroMap = info.writeKeyMicroMap;
          ctx.makamProfile53 = info.makamProfile53 || null;
          ctx.tonicToken53 = info.tonicToken || null;
          ctx.letterShift53 = Number.isFinite(info.letterShift53) ? info.letterShift53 : 0;
          ctx.functionalKeyTranspose53 = info.functionalKeyTranspose53 === true;
          ctx.lastSourceUpper53 = null;
          ctx.lastOutputUpper53 = null;
          out.push("[K:" + info.text + "]");
        } else {
          out.push(src.slice(i, close + 1));
        }
        i = close + 1;
        segmentStart = i;
        continue;
      }
    }
    if (ch === "%") {
      out.push(flushBar(i));
      out.push(src.slice(i));
      segmentStart = src.length;
      break;
    }
    if (ch === "|") {
      out.push(flushBar(i));
      out.push(ch);
      i += 1;
      segmentStart = i;
      continue;
    }
    i += 1;
  }
  out.push(flushBar(src.length));

  return out.join("");
}

function transformTranspose53SingleStep(text, deltaSteps, options = {}) {
  const delta = Number(deltaSteps);
  if (!Number.isFinite(delta) || delta === 0) return String(text || "");
  if (Math.abs(delta) !== 1) {
    throw new Error(`53-EDO single-step transpose supports only ±1 semitone (got ${deltaSteps}).`);
  }
  const prefer = options.prefer || "flat";
  const anchorPc12 = detectFinalisPc12For53(text);
  const globalDeltaCommas = euroSemitoneDeltaCommas53({
    tonicPc12: anchorPc12 == null ? 0 : anchorPc12,
    deltaSteps: delta,
  });
  const parts = splitLinesWithNewlines(text);
  const out = [];
  const ctx = {
    readKeyMicroMap: {},
    writeKeyMicroMap: {},
    makamProfile53: null,
    tonicToken53: null,
    letterShift53: 0,
    functionalKeyTranspose53: false,
    lastSourceUpper53: null,
    lastOutputUpper53: null,
    globalDeltaCommas,
    deltaCommas: globalDeltaCommas,
  };
  for (const part of parts) {
    const line = part.line;
    const nl = part.nl;
    if (isFieldLine(line)) {
      const m = String(line).match(/^([\t ]*K:)([\s\S]*)$/);
      if (m) {
        const prefix = m[1];
        const body = m[2] || "";
        const info = transposeKBody53(body, delta, { deltaCommasOverride: globalDeltaCommas });
        ctx.deltaCommas = info.deltaCommas;
        ctx.readKeyMicroMap = info.readKeyMicroMap;
        ctx.writeKeyMicroMap = info.writeKeyMicroMap;
        ctx.makamProfile53 = info.makamProfile53 || null;
        ctx.tonicToken53 = info.tonicToken || null;
        ctx.letterShift53 = Number.isFinite(info.letterShift53) ? info.letterShift53 : 0;
        ctx.functionalKeyTranspose53 = info.functionalKeyTranspose53 === true;
        ctx.lastSourceUpper53 = null;
        ctx.lastOutputUpper53 = null;
        out.push(prefix + info.text + nl);
      } else {
        out.push(line + nl);
      }
      continue;
    }
    out.push(transposeMusicLine53Western(line, delta, ctx, prefer) + nl);
  }
  return out.join("");
}

function transformTranspose53(text, deltaSteps, options = {}) {
  const delta = Number(deltaSteps);
  if (!Number.isFinite(delta) || delta === 0) return String(text || "");
  let out = String(text || "");
  const step = delta > 0 ? 1 : -1;
  const count = Math.abs(Math.trunc(delta));
  for (let i = 0; i < count; i += 1) {
    out = transformTranspose53SingleStep(out, step, options);
    if (options && options.simplifyDisplayKey53 === true) {
      out = simplify53DisplayKeyText(out, options.displayKey53 || {});
    }
  }
  return out;
}

function candidatePenalty(letter, accSteps, prefer) {
  let penalty = 0;
  if (prefer === "flat" && accSteps > 0) penalty += 0.5;
  if (prefer === "sharp" && accSteps < 0) penalty += 0.5;
  if ((letter === "E" || letter === "B") && accSteps === 2) penalty += 2;
  if ((letter === "C" || letter === "F") && accSteps === -2) penalty += 2;
  return penalty;
}

function buildPitchToken(absoluteSteps, prefer, keySig, barAccidentals, options = {}) {
  const stepInOctave = ((absoluteSteps % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
  const keySigSteps = buildKeySigSteps(keySig);
  const preferredLetter = options && options.preferredLetter
    ? String(options.preferredLetter).toUpperCase()
    : "";
  const candidates = [];

  for (const letter of Object.keys(NOTE_BASES)) {
    const naturalSteps = NOTE_BASES[letter] * STEPS_PER_SEMITONE;
    for (const accSteps of [-2, -1, 0, 1, 2]) {
      const step = (naturalSteps + accSteps + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
      if (step !== stepInOctave) continue;
      const baseSteps = naturalSteps + accSteps;
      let octave = Math.floor((absoluteSteps - baseSteps) / STEPS_PER_OCTAVE);
      if (!Number.isFinite(octave)) octave = 5;
      const letterKey = `${letter}:${octave}`;
      const keyAcc = keySigSteps[letter] || 0;
      let delta = accSteps - keyAcc;
      if (barAccidentals && barAccidentals.has(letterKey)) {
        delta = accSteps - barAccidentals.get(letterKey);
      }
      const preferredPenalty = preferredLetter && letter !== preferredLetter ? 100 : 0;
      const score = preferredPenalty + Math.abs(delta) * 10 + candidatePenalty(letter, accSteps, prefer);
      candidates.push({
        letter,
        accSteps,
        keyAcc,
        delta,
        score,
        octave,
        letterKey,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  const chosen = candidates[0] || {
    letter: "C",
    accSteps: 0,
    keyAcc: 0,
    delta: 0,
    octave: 5,
    letterKey: "C:5",
  };

  const desiredAcc = chosen.accSteps;

  let accidentalOut = "";
  const barAcc = barAccidentals && barAccidentals.has(chosen.letterKey)
    ? barAccidentals.get(chosen.letterKey)
    : null;
  if (barAcc != null) {
    if (barAcc !== desiredAcc) {
      if (desiredAcc === 0) accidentalOut = "=";
      else if (desiredAcc === 1) accidentalOut = "^/";
      else if (desiredAcc === -1) accidentalOut = "_/";
      else if (desiredAcc > 0) accidentalOut = "^";
      else accidentalOut = "_";
    }
  } else if (desiredAcc !== chosen.keyAcc) {
    if (desiredAcc === 0) accidentalOut = "=";
    else if (desiredAcc === 1) accidentalOut = "^/";
    else if (desiredAcc === -1) accidentalOut = "_/";
    else if (desiredAcc > 0) accidentalOut = "^";
    else accidentalOut = "_";
  }

  let outLetter = chosen.letter;
  let outMarks = "";
  if (chosen.octave >= 6) {
    outLetter = outLetter.toLowerCase();
    outMarks = "'".repeat(chosen.octave - 6);
  } else {
    outMarks = ",".repeat(Math.max(0, 5 - chosen.octave));
  }

  return {
    token: `${accidentalOut}${outLetter}${outMarks}`,
    letterKey: chosen.letterKey,
    desiredAcc,
  };
}

const DIATONIC_SHIFT_BY_SEMITONE = {
  0: 0,
  1: 0,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 3,
  7: 4,
  8: 5,
  9: 5,
  10: 6,
  11: 6,
};

function shiftLetterForTranspose(letter, semitones) {
  const upper = String(letter || "").toUpperCase();
  const idx = LETTER_ORDER.indexOf(upper);
  if (idx < 0) return upper;
  const delta = Math.trunc(Number(semitones) || 0);
  if (!delta) return upper;
  const abs = Math.abs(delta) % 12;
  const octaves = Math.floor(Math.abs(delta) / 12) * 7;
  const shift = (DIATONIC_SHIFT_BY_SEMITONE[abs] || 0) + octaves;
  const signed = delta > 0 ? shift : -shift;
  return LETTER_ORDER[mod(idx + signed, LETTER_ORDER.length)];
}

function pickKeyAccidental(stepInOctave, prefer, options = {}) {
  const preferredLetter = options && options.preferredLetter
    ? String(options.preferredLetter).toUpperCase()
    : "";
  const candidates = [];
  for (const letter of Object.keys(NOTE_BASES)) {
    const naturalSteps = NOTE_BASES[letter] * STEPS_PER_SEMITONE;
    for (const accSteps of [-2, -1, 0, 1, 2]) {
      const step = (naturalSteps + accSteps + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
      if (step !== stepInOctave) continue;
      const preferredPenalty = preferredLetter && letter !== preferredLetter ? 100 : 0;
      const score = preferredPenalty + Math.abs(accSteps) * 10 + candidatePenalty(letter, accSteps, prefer);
      candidates.push({ letter, accSteps, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || { letter: "C", accSteps: 0, score: 0 };
}

function formatKeyAccidentalToken(accSteps, letter, lowerCase, options = {}) {
  let accidentalOut = "";
  const preferFractional = options.preferFractional === true;
  if (accSteps === 1) accidentalOut = preferFractional ? "^1/2" : "^/";
  else if (accSteps === -1) accidentalOut = preferFractional ? "_1/2" : "_/";
  else if (accSteps === 0) accidentalOut = "=";
  else if (accSteps > 0) accidentalOut = "^";
  else if (accSteps < 0) accidentalOut = "_";
  const outLetter = lowerCase ? letter.toLowerCase() : letter.toUpperCase();
  return `${accidentalOut}${outLetter}`;
}

function parseKeyAccidentals(tail, baseOffset) {
  const events = [];
  if (!tail) return events;
  const regex = /(\^\/|_\/|\^{1,2}|_{1,2}|=|\^\d+\/\d+|_\d+\/\d+)([A-Ga-g])/g;
  let match;
  while ((match = regex.exec(tail)) !== null) {
    const accidentalToken = match[1];
    const letter = match[2];
    const accSteps = accidentalToSteps(accidentalToken);
    if (accSteps == null) continue;
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    events.push({
      start,
      end,
      accidentalToken,
      letter,
      accSteps,
      lowerCase: letter === letter.toLowerCase(),
      preferFractional: /\d+\/\d+/.test(accidentalToken),
    });
  }
  return events;
}

function transposeKeyAccidentals(keyAccEvents, semitones, keyInfos, preferDefault, sourceText = "") {
  const replacements = [];
  const extraAccByKey = new Map();
  for (const event of keyAccEvents || []) {
    const keyInfo = keyInfos[event.keyIndex] || {};
    const prefer = keyInfo.pref === "natural"
      ? preferDefault
      : (keyInfo.pref || preferDefault);
    const baseSteps = NOTE_BASES[event.letter.toUpperCase()] * STEPS_PER_SEMITONE + event.accSteps;
    const transposedSteps = baseSteps + semitones * STEPS_PER_SEMITONE;
    const stepInOctave = ((transposedSteps % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
    const chosen = pickKeyAccidental(stepInOctave, prefer, {
      preferredLetter: shiftLetterForTranspose(event.letter, semitones),
    });
    const text = formatKeyAccidentalToken(chosen.accSteps, chosen.letter, event.lowerCase, {
      preferFractional: event.preferFractional === true,
    });
    const baseAccSteps = buildKeySigSteps(buildKeySignature(
      keyInfo.isNone ? 0 : (keyInfo.accCount || 0),
      keyInfo.isNone ? "flat" : (keyInfo.pref || "flat")
    ));
    const redundant = chosen.accSteps === baseAccSteps[chosen.letter.toUpperCase()];
    let start = event.start;
    if (redundant) {
      while (start > 0 && /[\t ]/.test(sourceText[start - 1] || "")) start -= 1;
    }
    replacements.push({
      start,
      end: event.end,
      text: redundant ? "" : text,
      keyIndex: event.keyIndex,
    });
    const current = extraAccByKey.get(event.keyIndex) || {};
    if (!redundant) current[chosen.letter.toUpperCase()] = chosen.accSteps;
    extraAccByKey.set(event.keyIndex, current);
  }
  return { replacements, extraAccByKey };
}

function parseABCWithMeta(text) {
  const events = [];
  const keyEvents = [];
  const keyAccEvents = [];
  const chordEvents = [];
  const keyInfos = [];
  let currentKey = parseKeyToken("none");
  let currentKeyIndex = 0;
  keyInfos.push(currentKey);

  let inTextBlock = false;
  let barIndex = 0;
  let barAccidentals = new Map();
  let offset = 0;

  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    const line = lines[lineNo];
    if (/^\s*%%\s*begintext\b/i.test(line)) inTextBlock = true;
    if (inTextBlock) {
      if (/^\s*%%\s*endtext\b/i.test(line)) inTextBlock = false;
      offset += line.length + 1;
      continue;
    }
    if (/^\s*%/.test(line)) {
      offset += line.length + 1;
      continue;
    }
    if (/^\s*[wW]:/.test(line)) {
      offset += line.length + 1;
      continue;
    }

    const headerMatch = line.match(/^\s*([A-Za-z]):/);
    if (headerMatch && headerMatch[1].toUpperCase() !== "K") {
      offset += line.length + 1;
      continue;
    }

    if (/^\s*K:/.test(line)) {
      const match = line.match(/^(\s*K:\s*)([\s\S]*)$/);
      if (match) {
        const body = match[2] || "";
        const parsedKey = parseInitialKKeyToken(body);
        const keyToken = parsedKey.keyToken;
        const start = offset + match[1].length + parsedKey.leading.length;
        const end = offset + match[1].length + parsedKey.end;
        const tail = parsedKey.tail || "";
        const accEvents = parseKeyAccidentals(tail, end);
        keyEvents.push({
          start,
          end,
          keyIndex: currentKeyIndex + 1,
          raw: keyToken,
        });
        currentKey = parseKeyToken(keyToken) || currentKey;
        const extraAccSteps = {};
        for (const accEvent of accEvents) {
          extraAccSteps[accEvent.letter.toUpperCase()] = accEvent.accSteps;
          keyAccEvents.push({
            ...accEvent,
            keyIndex: currentKeyIndex + 1,
          });
        }
        currentKey = { ...currentKey, extraAccSteps };
        currentKeyIndex += 1;
        keyInfos.push(currentKey);
      }
      offset += line.length + 1;
      continue;
    }

    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "\"") {
        const closeIdx = line.indexOf("\"", i + 1);
        if (closeIdx > i) {
          const chordText = line.slice(i + 1, closeIdx);
          chordEvents.push({
            start: offset + i + 1,
            end: offset + closeIdx,
            chordText,
            keyIndex: currentKeyIndex,
          });
          i = closeIdx + 1;
          continue;
        }
        i += 1;
        continue;
      }
      if (ch === "%") break;
      if (ch === "!") {
        const closeIdx = line.indexOf("!", i + 1);
        if (closeIdx > i) {
          i = closeIdx + 1;
          continue;
        }
      }

      if (ch === "[" && /[A-Za-z]:/.test(line.slice(i + 1, i + 3))) {
        const closeIdx = line.indexOf("]", i);
        if (closeIdx > i) {
          const tag = line[i + 1].toUpperCase();
          if (tag === "K") {
            const tokenPart = line.slice(i + 3, closeIdx);
            const parsedKey = parseInitialKKeyToken(tokenPart);
            const token = parsedKey.keyToken;
            const tail = parsedKey.tail;
            const tokenStart = offset + i + 3 + parsedKey.leading.length;
            const tokenEnd = offset + i + 3 + parsedKey.end;
            if (token) {
              keyEvents.push({
                start: tokenStart,
                end: tokenEnd,
                keyIndex: currentKeyIndex + 1,
                raw: token,
                inline: true,
              });
              currentKey = parseKeyToken(token) || currentKey;
              const accEvents = parseKeyAccidentals(tail, tokenEnd);
              const extraAccSteps = {};
              for (const accEvent of accEvents) {
                extraAccSteps[accEvent.letter.toUpperCase()] = accEvent.accSteps;
                keyAccEvents.push({
                  ...accEvent,
                  keyIndex: currentKeyIndex + 1,
                  inline: true,
                });
              }
              currentKey = { ...currentKey, extraAccSteps };
              currentKeyIndex += 1;
              keyInfos.push(currentKey);
            }
          }
          i = closeIdx + 1;
          continue;
        }
      }

      if (ch === "|") {
        barIndex += 1;
        barAccidentals.clear();
        i += 1;
        continue;
      }

      const note = parseNoteToken(line, i);
      if (note) {
        const accDelta = accidentalToSteps(note.accidentalToken);
        const letter = note.letter.toUpperCase();
        const octave = computeOctave(note.letter, note.octaveMarks);
        const keyAccSemi = currentKey && currentKey.isNone ? 0 : buildKeySignature(
          currentKey.accCount || 0,
          currentKey.pref || "flat"
        )[letter];
        const extraKeyAcc = currentKey && currentKey.extraAccSteps
          ? currentKey.extraAccSteps[letter]
          : null;
        const keyAcc = extraKeyAcc != null
          ? extraKeyAcc
          : (keyAccSemi || 0) * STEPS_PER_SEMITONE;
        const barKey = `${letter}:${octave}`;
        let appliedAcc = keyAcc;
        if (accDelta != null) {
          appliedAcc = accDelta;
          barAccidentals.set(barKey, accDelta);
        } else if (barAccidentals.has(barKey)) {
          appliedAcc = barAccidentals.get(barKey);
        }
        const base = NOTE_BASES[letter] * STEPS_PER_SEMITONE;
        const absolutePitch = octave * STEPS_PER_OCTAVE + base + appliedAcc;

        events.push({
          start: offset + i,
          end: offset + i + note.token.length,
          letter: note.letter,
          accidentalToken: note.accidentalToken,
          octaveMarks: note.octaveMarks,
          durationToken: note.durationToken,
          absolutePitch,
          barIndex,
          keyIndex: currentKeyIndex,
        });
        i += note.token.length;
        continue;
      }
      i += 1;
    }
    offset += line.length + 1;
  }

  return { events, keyEvents, keyInfos, keyAccEvents, chordEvents };
}

export function parseABCToPitchEvents(text) {
  return parseABCWithMeta(text).events;
}

export function transposePitchEvents(events, semitones) {
  return events.map((event) => ({
    ...event,
    absolutePitch: event.absolutePitch + semitones * STEPS_PER_SEMITONE,
    preferredLetter: shiftLetterForTranspose(event.letter, semitones),
  }));
}

export function respellPitchEvents(events, options) {
  const replacements = [];
  const keyInfos = options && options.keyInfos ? options.keyInfos : [];
  const mode = options && options.mode ? options.mode : "chromatic";
  const preferDefault = options && options.prefer ? options.prefer : "flat";
  const preserveExplicitAccidentalLetters = options && options.preserveExplicitAccidentalLetters === true;

  let currentBar = -1;
  let barAccidentals = new Map();

  for (const event of events) {
    if (event.barIndex !== currentBar) {
      currentBar = event.barIndex;
      barAccidentals = new Map();
    }

    const keyInfo = keyInfos[event.keyIndex] || { isNone: true, pref: preferDefault, accCount: 0 };
    const prefer = mode === "chromatic"
      ? preferDefault
      : (keyInfo.pref === "natural" ? preferDefault : keyInfo.pref);
    const baseSig = mode === "chromatic" || keyInfo.isNone
      ? buildKeySignature(0, "flat")
      : buildKeySignature(keyInfo.accCount || 0, keyInfo.pref || "flat");
    const keySig = mergeKeyAccidentals(baseSig, keyInfo.extraAccSteps);
    const hasExtraKeyAccidentals = keyInfo.extraAccSteps && Object.keys(keyInfo.extraAccSteps).length > 0;

    const base = buildPitchToken(event.absolutePitch, prefer, keySig, barAccidentals, {
      preferredLetter: (preserveExplicitAccidentalLetters && event.accidentalToken)
        ? event.preferredLetter
        : (hasExtraKeyAccidentals ? event.preferredLetter : ""),
    });
    if (base.token.startsWith("=") || base.token.startsWith("^") || base.token.startsWith("_")) {
      barAccidentals.set(base.letterKey, base.desiredAcc);
    }
    replacements.push({
      start: event.start,
      end: event.end,
      text: `${base.token}${event.durationToken || ""}`,
      keyIndex: event.keyIndex,
      letter: base.letterKey ? String(base.letterKey).split(":")[0] : "",
      desiredAcc: base.desiredAcc,
    });
  }

  return replacements;
}

function applyReplacements(text, replacements) {
  if (!replacements.length) return text;
  const sorted = replacements.slice().sort((a, b) => b.start - a.start);
  let out = text;
  for (const rep of sorted) {
    out = out.slice(0, rep.start) + rep.text + out.slice(rep.end);
  }
  return out;
}

function parseChordNote(noteText) {
  const raw = String(noteText || "");
  const m = raw.match(/^([A-Ga-g])([#b♯♭]?)/);
  if (!m) return null;
  const letter = m[1];
  const accidental = m[2] || "";
  const acc = accidental === "#" || accidental === "♯" ? 1 : (accidental === "b" || accidental === "♭" ? -1 : 0);
  const base = NOTE_BASES[letter.toUpperCase()];
  if (base == null) return null;
  return {
    raw: m[0],
    letter,
    acc,
    accidental,
    length: m[0].length,
    prefer: accidental === "b" || accidental === "♭" ? "flat" : (accidental === "#" || accidental === "♯" ? "sharp" : null),
    useUnicodeAccidental: accidental === "♯" || accidental === "♭",
  };
}

function formatChordNote(pc12, prefer, useUnicodeAccidental, letterCase) {
  const map = prefer === "sharp" ? SHARP_MAP : FLAT_MAP;
  const norm = ((pc12 % 12) + 12) % 12;
  const entry = map[norm] || { letter: "C", acc: 0 };
  const outLetter = letterCase === "lower" ? entry.letter.toLowerCase() : entry.letter.toUpperCase();
  if (!entry.acc) return outLetter;
  const accChar = entry.acc > 0
    ? (useUnicodeAccidental ? "♯" : "#")
    : (useUnicodeAccidental ? "♭" : "b");
  return `${outLetter}${accChar}`;
}

function isChordLikeText(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/^(N\.?C\.?|NC)$/i.test(raw)) return false;
  if (/^[A-Ga-g][#b♯♭]?(?:$|[0-9(+/\-]|[ø°o]|m(?![a-z])|maj|min|dim|aug|sus|add|no|omit)/i.test(raw)) return true;
  return false;
}

export function transposeChordText(chordText, semitones, preferDefault) {
  const raw = String(chordText || "");
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (!isChordLikeText(trimmed)) return raw;

  const root = parseChordNote(trimmed);
  if (!root) return raw;
  const afterRoot = trimmed.slice(root.length);

  const prefer = root.prefer || preferDefault || "flat";
  const letterCase = root.letter === root.letter.toLowerCase() ? "lower" : "upper";
  const basePc = (NOTE_BASES[root.letter.toUpperCase()] + root.acc + 120) % 12;
  const outRoot = formatChordNote(basePc + semitones, prefer, root.useUnicodeAccidental, letterCase);

  const slashIdx = afterRoot.indexOf("/");
  if (slashIdx === -1) return raw.replace(trimmed, `${outRoot}${afterRoot}`);

  const quality = afterRoot.slice(0, slashIdx);
  const bassPart = afterRoot.slice(slashIdx + 1);
  const bass = parseChordNote(bassPart);
  if (!bass) return raw.replace(trimmed, `${outRoot}${afterRoot}`);
  const bassAfter = bassPart.slice(bass.length);
  const bassPrefer = bass.prefer || preferDefault || prefer;
  const bassCase = bass.letter === bass.letter.toLowerCase() ? "lower" : "upper";
  const bassBasePc = (NOTE_BASES[bass.letter.toUpperCase()] + bass.acc + 120) % 12;
  const outBass = formatChordNote(bassBasePc + semitones, bassPrefer, bass.useUnicodeAccidental, bassCase);

  return raw.replace(trimmed, `${outRoot}${quality}/${outBass}${bassAfter}`);
}

export function transformTranspose(text, semitones, options = {}) {
  const edo = detectEffectiveTransposeEdo(text, options);
  if (edo === 53) {
    return transformTranspose53(text, semitones, options);
  }
  if (edo !== 12 && edo !== 24) {
    throw new Error(`Native transpose does not support %%MIDI temperamentequal ${edo} yet. Disable "Use native transpose" or remove the directive.`);
  }

  const parsed = parseABCWithMeta(text);
  const prefer = options.prefer || "flat";
  const baseMode = options.mode || "auto";

  const keyInfos = parsed.keyInfos.map((info) => {
    if (!info || info.isNone || /^none$/i.test(info.raw || "")) {
      return { ...info, isNone: true, accCount: 0, pref: prefer, name: "none" };
    }
    return info;
  });

  const outKeyInfos = keyInfos.map((info) => {
    if (!info || info.isNone) return info;
    const mode = info.isMinor ? "minor" : "major";
    const targetPc = (info.pc + semitones + 120) % 12;
    const chosen = chooseKeyName(targetPc, info.isMinor, info.pref || prefer);
    return {
      ...info,
      name: chosen.name,
      accCount: chosen.accCount,
      pref: chosen.pref,
      mode,
      extraAccSteps: info.extraAccSteps,
    };
  });

  const mode = baseMode === "auto"
    ? (outKeyInfos.some((k) => k && !k.isNone) ? "tonal" : "chromatic")
    : baseMode;

  const { replacements: keyAccReplacements, extraAccByKey } = transposeKeyAccidentals(
    parsed.keyAccEvents || [],
    semitones,
    outKeyInfos,
    prefer,
    text
  );
  const outKeyInfosWithAcc = outKeyInfos.map((info, index) => {
    if (!info) return info;
    const extraAccSteps = extraAccByKey.get(index) || info.extraAccSteps || {};
    return { ...info, extraAccSteps };
  });

  const transposedEvents = transposePitchEvents(parsed.events, semitones);
  const pitchReplacements = respellPitchEvents(transposedEvents, {
    mode,
    prefer,
    keyInfos: outKeyInfosWithAcc,
    preserveExplicitAccidentalLetters: semitones !== 0,
  });

  const keyReplacements = parsed.keyEvents.map((event) => {
    const info = outKeyInfosWithAcc[event.keyIndex];
    if (!info || info.isNone || /^none$/i.test(info.raw || "")) {
      return { start: event.start, end: event.end, text: "none" };
    }
    const suffix = info.modeSuffix || "";
    return { start: event.start, end: event.end, text: `${info.name}${suffix}` };
  });

  const chordReplacements = (parsed.chordEvents || []).map((event) => ({
    start: event.start,
    end: event.end,
    text: transposeChordText(event.chordText, semitones, prefer),
  })).filter((rep) => rep.text !== null);

  const allReplacements = pitchReplacements.concat(
    keyReplacements,
    keyAccReplacements,
    chordReplacements
  );
  return applyReplacements(text, allReplacements);
}

export {
  parseNoteTokenAt53,
  parseAccidentalPrefix53,
  computeOctave,
  baseId53ForNaturalLetter,
};
