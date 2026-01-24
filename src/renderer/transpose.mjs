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
  const modeLower = modeSuffix.toLowerCase();
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
      merged[letter] = steps;
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

function pairRank53(micro) {
  if (micro === 4 || micro === -5) return 0;
  if (micro === -4 || micro === 5) return 1;
  return 2;
}

function microPrefixFor53(micro, { explicit } = {}) {
  const m = Number(micro) || 0;
  if (m === 0) return explicit ? "=" : "";
  return m > 0 ? `^${m}` : `_${-m}`;
}

function chooseSpelling53ForId({ id53, preferFlats, preferSharps }) {
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  let best = null;
  for (let idx = 0; idx < letters.length; idx += 1) {
    const L = letters[idx];
    const base = baseId53ForNaturalLetter(L);
    // Keep micro offsets small ([-26..+26]) and adjust octave during note serialization if needed.
    const micro = normalizeSigned53(Number(id53) - base);
    const sideScore = preferFlats ? (micro < 0 ? 0 : 1) : (preferSharps ? (micro > 0 ? 0 : 1) : 0);
    const score = [pairRank53(micro), sideScore, Math.abs(micro), idx];
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

export function buildEffectiveKeyMicroMap53FromKBody(kBody, { allowMicro = true } = {}) {
  const { head } = splitComment(kBody);
  const { firstToken } = parseKLineBodyForRewrite(head);
  const keyInfo = parseKeyToken(firstToken) || { isNone: true, pref: "flat", accCount: 0 };

  const out = {};
  if (!keyInfo.isNone) {
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

function transposeKBody53(body, deltaSteps) {
  const { head, comment } = splitComment(body);
  const readTonicPc12 = parseKFirstTokenTonicPc12(head);
  const deltaCommas = euroSemitoneDeltaCommas53({ tonicPc12: readTonicPc12, deltaSteps });
  const readKeyMicroMap = buildKeyMicroMapFromKBody53(head);

  const { leading, firstToken } = parseKLineBodyForRewrite(head);
  const isNone = /^none$/i.test(firstToken || "");
  let newFirstToken = String(firstToken || "");
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
    const tonic1Name = chooseTonicNameByPc(pc1, { deltaSteps, originalSide });
    newFirstToken = `${tonic1Name}${modeInline}`;
  }

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
    const id0 = mod(base0 + parsed.micro, 53);
    const id1 = mod(id0 + deltaCommas, 53);
    const chosen = chooseSpelling53ForId({ id53: id1, preferFlats, preferSharps });
    const outLetter = (tok.letter === tok.letter.toUpperCase())
      ? chosen.letterUpper.toUpperCase()
      : chosen.letterUpper.toLowerCase();
    outTokens.push(`${microPrefixFor53(chosen.micro, { explicit: true })}${outLetter}`);
  }

  const writeKeyMicroMap = {};
  for (const tok of outTokens) {
    const mEq = tok.match(/^=([A-Ga-g])$/);
    if (mEq) {
      writeKeyMicroMap[mEq[1].toUpperCase()] = 0;
      continue;
    }
    const m2 = tok.match(/^(\^|_)(\d+)([A-Ga-g])$/);
    if (!m2) continue;
    const dir = m2[1] === "^" ? 1 : -1;
    writeKeyMicroMap[m2[3].toUpperCase()] = dir * Number(m2[2]);
  }

  const suffix = outTokens.length ? ` ${outTokens.join(" ")}` : "";
  return {
    text: `${leading}${newFirstToken}${suffix}${comment}`,
    readTonicPc12,
    deltaCommas,
    readKeyMicroMap,
    writeKeyMicroMap,
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

function transposeMusicLine53Western(line, deltaSteps, ctx, preferDefault) {
  const src = String(line || "");
  const out = [];
  let i = 0;
  let barMicroRead = {};
  let barMicroWrite = {};
  const deltaCommas = Number(ctx.deltaCommas) || 0;
  const preferSharps = deltaSteps > 0;
  const preferFlats = deltaSteps < 0;

  const defaultWriteFor = (letterUpper) => (
    Object.prototype.hasOwnProperty.call(barMicroWrite, letterUpper)
      ? barMicroWrite[letterUpper]
      : (ctx.writeKeyMicroMap && Object.prototype.hasOwnProperty.call(ctx.writeKeyMicroMap, letterUpper)
        ? ctx.writeKeyMicroMap[letterUpper]
        : 0)
  );

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\"") {
      const close = src.indexOf("\"", i + 1);
      if (close !== -1) {
        const inner = src.slice(i + 1, close);
        const transposed = transposeChordText(inner, deltaSteps, preferDefault);
        out.push(`"${transposed}"`);
        i = close + 1;
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
    // Decorations like !courtesy! must not be treated as notes.
    if (ch === "!") {
      const close = src.indexOf("!", i + 1);
      if (close !== -1) {
        out.push(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
    // Bracketed fields like [P:...], [V:...], [I:...], [K:...] should be preserved.
    // Only [K:...] is rewritten, others are copied verbatim to avoid corrupting text.
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        const tag = src[i + 1].toUpperCase();
        if (tag === "K") {
          const inner = src.slice(i + 3, close);
          const info = transposeKBody53(inner, deltaSteps);
          ctx.deltaCommas = info.deltaCommas;
          ctx.readKeyMicroMap = info.readKeyMicroMap;
          ctx.writeKeyMicroMap = info.writeKeyMicroMap;
          out.push("[K:" + info.text + "]");
        } else {
          out.push(src.slice(i, close + 1));
        }
        i = close + 1;
        continue;
      }
    }
    if (ch === "%") {
      out.push(src.slice(i));
      break;
    }
    if (ch === "|") {
      barMicroRead = {};
      barMicroWrite = {};
      out.push(ch);
      i += 1;
      continue;
    }

    const note = parseNoteTokenAt53(src, i);
    if (note) {
      const upper = note.letter.toUpperCase();
      const pc = PC_NAT_12[upper];
      if (pc == null) {
        out.push(src.slice(i, note.end));
        i = note.end;
        continue;
      }

      const explicit = parseAccidentalPrefix53(note.accPrefix, pc);
      let micro = 0;
      if (explicit.explicit) {
        micro = explicit.micro;
        barMicroRead[upper] = micro;
      } else if (Object.prototype.hasOwnProperty.call(barMicroRead, upper)) {
        micro = barMicroRead[upper];
      } else if (ctx.readKeyMicroMap && Object.prototype.hasOwnProperty.call(ctx.readKeyMicroMap, upper)) {
        micro = ctx.readKeyMicroMap[upper];
      }

      const oct = computeOctave(note.letter, note.octaveMarks);
      const baseId = baseId53ForNaturalLetter(upper);
      const abs53 = oct * 53 + baseId + micro;
      const abs53New = abs53 + deltaCommas;
      const oct2 = Math.trunc(Math.floor(abs53New / 53));
      const id2 = mod(abs53New, 53);

      const candidates = [];
      const toCandidate = (letterUpperCand) => {
        const b = baseId53ForNaturalLetter(letterUpperCand);
        const microNorm = normalizeSigned53(Number(id2) - b);
        const absCand = oct2 * 53 + b + microNorm;
        const deltaOct = (abs53New - absCand) / 53;
        if (!Number.isFinite(deltaOct) || !Number.isInteger(deltaOct)) return null;
        return { letterUpper: letterUpperCand, micro: microNorm, octave: oct2 + deltaOct };
      };

      const keep = toCandidate(upper);
      if (keep) candidates.push(keep);
      const bestSpell = chooseSpelling53ForId({ id53: id2, preferFlats, preferSharps });
      if (bestSpell && bestSpell.letterUpper) {
        const spelled = toCandidate(bestSpell.letterUpper);
        if (spelled && spelled.letterUpper !== upper) candidates.push(spelled);
      }

      let chosen = null;
      for (const cand of candidates) {
        const def = defaultWriteFor(cand.letterUpper);
        const needsExplicit = explicit.explicit || cand.micro !== def;
        const sideScore = preferFlats ? (cand.micro < 0 ? 0 : 1) : (preferSharps ? (cand.micro > 0 ? 0 : 1) : 0);
        const letterChange = cand.letterUpper === upper ? 0 : 1;
        const octaveShift = Math.abs((cand.octave ?? oct2) - oct2);
        const score = [needsExplicit ? 1 : 0, octaveShift, letterChange, pairRank53(cand.micro), sideScore, Math.abs(cand.micro)];
        const prefix = needsExplicit ? microPrefixFor53(cand.micro, { explicit: explicit.explicit }) : "";
        if (!chosen) chosen = { ...cand, needsExplicit, prefix, score };
        else {
          for (let s = 0; s < score.length; s += 1) {
            if (score[s] < chosen.score[s]) { chosen = { ...cand, needsExplicit, prefix, score }; break; }
            if (score[s] > chosen.score[s]) break;
          }
        }
      }

      if (!chosen) {
        out.push(src.slice(i, note.end));
        i = note.end;
        continue;
      }
      if (chosen.needsExplicit) barMicroWrite[chosen.letterUpper] = chosen.micro;

      let letterOut = chosen.letterUpper;
      let marks = "";
      const outOct = Number.isFinite(chosen.octave) ? chosen.octave : oct2;
      if (outOct >= 6) {
        letterOut = letterOut.toLowerCase();
        marks = "'".repeat(Math.max(0, outOct - 6));
      } else {
        letterOut = letterOut.toUpperCase();
        marks = ",".repeat(Math.max(0, 5 - outOct));
      }

      out.push(`${chosen.prefix}${letterOut}${marks}${note.duration || ""}`);
      i = note.end;
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return out.join("");
}

function transformTranspose53(text, deltaSteps, options = {}) {
  const delta = Number(deltaSteps);
  if (!Number.isFinite(delta) || delta === 0) return String(text || "");
  if (Math.abs(delta) !== 1) {
    throw new Error(`53-EDO transpose supports only ±1 semitone (got ${deltaSteps}).`);
  }
  const prefer = options.prefer || "flat";
  const parts = splitLinesWithNewlines(text);
  const out = [];
  const ctx = { readKeyMicroMap: {}, writeKeyMicroMap: {}, deltaCommas: euroSemitoneDeltaCommas53({ tonicPc12: 0, deltaSteps: delta }) };
  for (const part of parts) {
    const line = part.line;
    const nl = part.nl;
    if (isFieldLine(line)) {
      const m = String(line).match(/^([\t ]*K:)([\s\S]*)$/);
      if (m) {
        const prefix = m[1];
        const body = m[2] || "";
        const info = transposeKBody53(body, delta);
        ctx.deltaCommas = info.deltaCommas;
        ctx.readKeyMicroMap = info.readKeyMicroMap;
        ctx.writeKeyMicroMap = info.writeKeyMicroMap;
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

function candidatePenalty(letter, accSteps, prefer) {
  let penalty = 0;
  if (prefer === "flat" && accSteps > 0) penalty += 0.5;
  if (prefer === "sharp" && accSteps < 0) penalty += 0.5;
  if ((letter === "E" || letter === "B") && accSteps === 2) penalty += 2;
  if ((letter === "C" || letter === "F") && accSteps === -2) penalty += 2;
  return penalty;
}

function buildPitchToken(absoluteSteps, prefer, keySig, barAccidentals) {
  const stepInOctave = ((absoluteSteps % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
  const keySigSteps = buildKeySigSteps(keySig);
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
      const score = Math.abs(delta) * 10 + candidatePenalty(letter, accSteps, prefer);
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

function pickKeyAccidental(stepInOctave, prefer) {
  const candidates = [];
  for (const letter of Object.keys(NOTE_BASES)) {
    const naturalSteps = NOTE_BASES[letter] * STEPS_PER_SEMITONE;
    for (const accSteps of [-2, -1, 0, 1, 2]) {
      const step = (naturalSteps + accSteps + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
      if (step !== stepInOctave) continue;
      const score = Math.abs(accSteps) * 10 + candidatePenalty(letter, accSteps, prefer);
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

function transposeKeyAccidentals(keyAccEvents, semitones, keyInfos, preferDefault) {
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
    const chosen = pickKeyAccidental(stepInOctave, prefer);
    const text = formatKeyAccidentalToken(chosen.accSteps, chosen.letter, event.lowerCase, {
      preferFractional: event.preferFractional === true,
    });
    replacements.push({
      start: event.start,
      end: event.end,
      text,
    });
    const current = extraAccByKey.get(event.keyIndex) || {};
    current[chosen.letter.toUpperCase()] = chosen.accSteps;
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
      const match = line.match(/^(\s*K:\s*)(\S+)(.*)$/);
      if (match) {
        const keyToken = match[2];
        const start = offset + match[1].length;
        const end = start + keyToken.length;
        const tail = match[3] || "";
        const accEvents = parseKeyAccidentals(tail, offset + match[1].length + keyToken.length);
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
            const token = tokenPart.trim().split(/\s+/)[0] || "";
            const tail = tokenPart.slice(token.length);
            const tokenStart = offset + i + 3;
            const tokenEnd = tokenStart + token.length;
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
  }));
}

export function respellPitchEvents(events, options) {
  const replacements = [];
  const keyInfos = options && options.keyInfos ? options.keyInfos : [];
  const mode = options && options.mode ? options.mode : "chromatic";
  const preferDefault = options && options.prefer ? options.prefer : "flat";

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

    const base = buildPitchToken(event.absolutePitch, prefer, keySig, barAccidentals);
    if (base.token.startsWith("=") || base.token.startsWith("^") || base.token.startsWith("_")) {
      barAccidentals.set(base.letterKey, base.desiredAcc);
    }
    replacements.push({
      start: event.start,
      end: event.end,
      text: `${base.token}${event.durationToken || ""}`,
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

function transposeChordText(chordText, semitones, preferDefault) {
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
  const headerText = options && options.headerText ? String(options.headerText) : "";
  const edo = detectEdoStepsPerOctave(headerText ? `${headerText}\n${text}` : text);
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
    prefer
  );
  const outKeyInfosWithAcc = outKeyInfos.map((info, index) => {
    if (!info) return info;
    const extraAccSteps = extraAccByKey.get(index) || info.extraAccSteps || {};
    return { ...info, extraAccSteps };
  });

  const transposedEvents = transposePitchEvents(parsed.events, semitones);
  const replacements = respellPitchEvents(transposedEvents, {
    mode,
    prefer,
    keyInfos: outKeyInfosWithAcc,
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

  const allReplacements = replacements.concat(keyReplacements, keyAccReplacements, chordReplacements);
  return applyReplacements(text, allReplacements);
}

export {
  parseNoteTokenAt53,
  parseAccidentalPrefix53,
  computeOctave,
  baseId53ForNaturalLetter,
};
