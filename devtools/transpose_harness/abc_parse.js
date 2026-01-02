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

const PC_NAT_12 = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

function clampInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i;
}

function mod(n, m) {
  const r = n % m;
  return r < 0 ? r + m : r;
}

function parseAccidentalPrefix(prefix, edo) {
  const p = String(prefix || "");
  if (!p) return null;
  if (p === "^^") return 2;
  if (p === "^") return 1;
  if (p === "__") return -2;
  if (p === "_") return -1;
  if (p === "=") return 0;
  // Numeric accidental, e.g. ^1, _2, ^-3. Treat as signed steps in the current EDO.
  if (p[0] === "^" && /^\^-?\d+$/.test(p)) {
    const v = clampInt(p.slice(1));
    return v;
  }
  if (p[0] === "_" && /^_-?\d+$/.test(p)) {
    const v = clampInt(p.slice(1));
    if (v == null) return null;
    return -v;
  }
  return null;
}

function buildKeyDefaultAccFromMajorSignature({ count, side }) {
  const map = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const n = Math.max(0, Math.min(7, Math.trunc(Math.abs(Number(count) || 0))));
  if (side === "sharp") {
    for (let i = 0; i < n; i += 1) map[SHARP_ORDER[i]] = 1;
  } else if (side === "flat") {
    for (let i = 0; i < n; i += 1) map[FLAT_ORDER[i]] = -1;
  }
  return map;
}

function majorSignatureForPc(pc, preferredSide) {
  const candidates = [];
  // Sharp-side major keys allowed up to 7 sharps.
  const sharpMajor = {
    0: { name: "C", count: 0, side: "neutral" },
    7: { name: "G", count: 1, side: "sharp" },
    2: { name: "D", count: 2, side: "sharp" },
    9: { name: "A", count: 3, side: "sharp" },
    4: { name: "E", count: 4, side: "sharp" },
    11: { name: "B", count: 5, side: "sharp" },
    6: { name: "F#", count: 6, side: "sharp" },
    1: { name: "C#", count: 7, side: "sharp" },
  };
  const flatMajor = {
    0: { name: "C", count: 0, side: "neutral" },
    5: { name: "F", count: 1, side: "flat" },
    10: { name: "Bb", count: 2, side: "flat" },
    3: { name: "Eb", count: 3, side: "flat" },
    8: { name: "Ab", count: 4, side: "flat" },
    1: { name: "Db", count: 5, side: "flat" },
    6: { name: "Gb", count: 6, side: "flat" },
    11: { name: "Cb", count: 7, side: "flat" },
  };
  if (sharpMajor[pc]) candidates.push(sharpMajor[pc]);
  if (flatMajor[pc]) candidates.push(flatMajor[pc]);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  // Deterministic tie-break for relative majors: prefer the requested side, else flat.
  const bySide = candidates.find((c) => c.side === preferredSide);
  if (bySide) return bySide;
  return candidates.find((c) => c.side === "flat") || candidates[0];
}

const MODE_TO_RELMAJ_OFFSET_12 = {
  ion: 0,
  ionian: 0,
  maj: 0,
  major: 0,
  aeolian: 3,
  min: 3,
  minor: 3,
  m: 3,
  dor: -2,
  dorian: -2,
  phr: -4,
  phrygian: -4,
  lyd: -5,
  lydian: -5,
  mix: 5,
  mixolydian: 5,
  loc: 1,
  locrian: 1,
};

function normalizeModeToken(modeRaw) {
  const m = String(modeRaw || "").trim();
  if (!m) return "ionian";
  const lower = m.toLowerCase();
  if (lower === "maj" || lower === "major") return "ionian";
  if (lower === "m" || lower === "min" || lower === "minor") return "aeolian";
  if (lower === "dor") return "dorian";
  if (lower === "phr") return "phrygian";
  if (lower === "lyd") return "lydian";
  if (lower === "mix") return "mixolydian";
  if (lower === "loc") return "locrian";
  return lower;
}

function isStandardMode(modeNorm) {
  return [
    "ionian",
    "aeolian",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "locrian",
  ].includes(String(modeNorm || ""));
}

function parseKeyField(keyBody) {
  const raw = String(keyBody || "");
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, kind: "none", raw };
  if (/^none\b/i.test(trimmed)) return { ok: false, kind: "none", raw };
  if (/\bHP\b|\bHp\b/.test(trimmed)) return { ok: false, kind: "nonstandard", raw };

  const parts = trimmed.split(/\s+/);
  const first = parts[0] || "";
  const m = first.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return { ok: false, kind: "nonstandard", raw };
  const tonicLetter = m[1];
  const tonicAcc = m[2] || "";
  const restInline = m[3] || "";
  let modeRaw = "";
  let extra = parts.slice(1).join(" ");
  if (restInline) {
    modeRaw = restInline;
  } else if (parts.length > 1) {
    modeRaw = parts[1] || "";
    extra = parts.slice(2).join(" ");
  }
  const modeNorm = normalizeModeToken(modeRaw);

  const hasExplicitAcc = /(^|\s)(exp\b|[\^_=][A-Ga-g])/.test(trimmed) || /\bexp\b/i.test(trimmed);
  if (!isStandardMode(modeNorm) || hasExplicitAcc) {
    // Nonstandard: allow extracting explicit accidental map tokens if present.
    const map = {};
    const tokRe = /(?:^|\s)(\^\^|\^|__|_|=)([A-Ga-g])\b/g;
    let t;
    while ((t = tokRe.exec(trimmed)) !== null) {
      const acc = parseAccidentalPrefix(t[1], 12);
      if (acc == null) continue;
      map[t[2].toUpperCase()] = acc;
    }
    // Even for nonstandard keys, compute the base diatonic signature (if possible) and overlay overrides,
    // so pitch semantics are stable across transpositions.
    const modeOffset = MODE_TO_RELMAJ_OFFSET_12[modeNorm] ?? 0;
    const pcTonic = mod(PC_NAT_12[tonicLetter] + (tonicAcc === "#" ? 1 : tonicAcc === "b" ? -1 : 0), 12);
    const pcRelMaj = mod(pcTonic + modeOffset, 12);
    const preferredSide = tonicAcc === "b" ? "flat" : (tonicAcc === "#" ? "sharp" : "neutral");
    const relMajSig = isStandardMode(modeNorm)
      ? majorSignatureForPc(pcRelMaj, preferredSide === "neutral" ? "flat" : preferredSide)
      : null;
    const baseKeyDefaultAcc = relMajSig
      ? buildKeyDefaultAccFromMajorSignature(relMajSig)
      : { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
    const keyDefaultAcc = { ...baseKeyDefaultAcc, ...map };
    const signatureCount = relMajSig
      ? (relMajSig.side === "flat" ? -relMajSig.count : relMajSig.count)
      : 0;
    const side = relMajSig ? relMajSig.side : "neutral";
    return {
      ok: false,
      kind: "nonstandard",
      raw,
      tonicLetter,
      tonicAcc,
      modeRaw,
      modeNorm,
      accMap: map,
      baseKeyDefaultAcc,
      keyDefaultAcc,
      signatureCount,
      side,
    };
  }

  const modeOffset = MODE_TO_RELMAJ_OFFSET_12[modeNorm] ?? 0;
  const pcTonic = mod(PC_NAT_12[tonicLetter] + (tonicAcc === "#" ? 1 : tonicAcc === "b" ? -1 : 0), 12);
  const pcRelMaj = mod(pcTonic + modeOffset, 12);
  // Prefer signature side implied by tonic spelling.
  const preferredSide = tonicAcc === "b" ? "flat" : (tonicAcc === "#" ? "sharp" : "neutral");
  const relMajSig = majorSignatureForPc(pcRelMaj, preferredSide === "neutral" ? "flat" : preferredSide);
  if (!relMajSig) return { ok: false, kind: "nonstandard", raw, tonicLetter, tonicAcc, modeRaw, modeNorm };

  const keyDefaultAcc = buildKeyDefaultAccFromMajorSignature(relMajSig);
  const signatureCount = relMajSig.side === "flat" ? -relMajSig.count : relMajSig.count;
  const side = relMajSig.side;
  return {
    ok: true,
    kind: "standard",
    raw,
    tonicLetter,
    tonicAcc,
    modeRaw,
    modeNorm,
    signatureCount,
    side,
    keyDefaultAcc,
  };
}

function parseNoteTokenAt(text, i, edo) {
  const src = String(text || "");
  const start = i;
  let idx = i;

  // Accidental prefix: ^^, ^, __, _, =, ^k, _k
  let acc = "";
  if (src.startsWith("^^", idx)) { acc = "^^"; idx += 2; }
  else if (src.startsWith("__", idx)) { acc = "__"; idx += 2; }
  else if (src[idx] === "^" || src[idx] === "_" || src[idx] === "=") {
    acc = src[idx];
    idx += 1;
    // Numeric accidental, e.g. ^1 or _2
    if ((acc === "^" || acc === "_") && (src[idx] === "-" || (src[idx] >= "0" && src[idx] <= "9"))) {
      let j = idx;
      if (src[j] === "-") j += 1;
      let saw = false;
      while (j < src.length && src[j] >= "0" && src[j] <= "9") { j += 1; saw = true; }
      if (saw) {
        acc = src.slice(i, j);
        idx = j;
      }
    }
  }

  const letter = src[idx];
  if (!letter || !/[A-Ga-g]/.test(letter)) return null;
  idx += 1;

  let octaveMarks = "";
  while (idx < src.length && (src[idx] === "," || src[idx] === "'")) {
    octaveMarks += src[idx];
    idx += 1;
  }

  let dur = "";
  while (idx < src.length && /[0-9/]/.test(src[idx])) {
    dur += src[idx];
    idx += 1;
  }

  const token = src.slice(start, idx);
  const accSteps = parseAccidentalPrefix(acc, edo);
  return {
    start,
    end: idx,
    token,
    accPrefix: acc,
    accSteps,
    letter,
    octaveMarks,
    duration: dur,
  };
}

function absStepsFromNote(note, { edo, keyDefaultAcc, barAccMap }) {
  const letter = note.letter;
  const upper = letter.toUpperCase();
  const baseOct = letter === upper ? 4 : 5;
  const up = (note.octaveMarks.match(/'/g) || []).length;
  const down = (note.octaveMarks.match(/,/g) || []).length;
  const oct = baseOct + up - down;
  const pcNat = PC_NAT_12[upper];
  let accSteps = null;
  if (note.accSteps != null) {
    accSteps = note.accSteps;
  } else if (barAccMap && Object.prototype.hasOwnProperty.call(barAccMap, upper)) {
    accSteps = barAccMap[upper];
  } else {
    accSteps = (keyDefaultAcc && Object.prototype.hasOwnProperty.call(keyDefaultAcc, upper)) ? keyDefaultAcc[upper] : 0;
  }
  // Do not wrap within octave here: accidentals can cross the B<->C boundary (Cb5 == B4, B#4 == C5).
  const abs = oct * edo + pcNat + accSteps;
  if (note.accSteps != null && barAccMap) {
    barAccMap[upper] = accSteps;
  }
  return abs;
}

function collectAbsSteps(text) {
  const edo = detectEdoStepsPerOctave(text);
  const src = String(text || "");
  let key = parseKeyField("C");
  let keyDefaultAcc = (key.ok && key.keyDefaultAcc) ? key.keyDefaultAcc : { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  let barAccMap = {};
  const out = [];

  const isKStart = (idx) => {
    if (idx < 0 || idx + 2 >= src.length) return false;
    const prev = idx === 0 ? "\n" : src[idx - 1];
    const atLineStart = prev === "\n" || prev === "\r";
    const bracketed = prev === "[";
    if (!atLineStart && !bracketed) return false;
    return src.startsWith("K:", idx);
  };

  for (let i = 0; i < src.length; ) {
    const ch = src[i];
    if (ch === "|") {
      barAccMap = {};
      i += 1;
      continue;
    }
    if (isKStart(i)) {
      const end = src.indexOf("\n", i);
      const lineEnd = end === -1 ? src.length : end;
      const rawLine = src.slice(i, lineEnd);
      const m = rawLine.match(/^K:\s*(.*)$/);
      if (m) {
        key = parseKeyField(m[1]);
        if (key.ok && key.keyDefaultAcc) keyDefaultAcc = key.keyDefaultAcc;
        else if (key.accMap) {
          keyDefaultAcc = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0, ...key.accMap };
        } else {
          keyDefaultAcc = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
        }
      }
      i = lineEnd;
      continue;
    }
    if (ch === "%") {
      // Comment to end of line.
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (ch === "[") {
      // Skip inline fields like [K:...] by scanning for K: and consuming to ].
      if (src.startsWith("[K:", i)) {
        const close = src.indexOf("]", i + 3);
        if (close !== -1) {
          const inner = src.slice(i + 3, close);
          key = parseKeyField(inner);
          if (key.ok && key.keyDefaultAcc) keyDefaultAcc = key.keyDefaultAcc;
          else if (key.accMap) keyDefaultAcc = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0, ...key.accMap };
          i = close + 1;
          continue;
        }
      }
    }
    const note = parseNoteTokenAt(src, i, edo);
    if (note) {
      const abs = absStepsFromNote(note, { edo, keyDefaultAcc, barAccMap });
      out.push(abs);
      i = note.end;
      continue;
    }
    i += 1;
  }
  return { edo, absSteps: out };
}

module.exports = {
  detectEdoStepsPerOctave,
  parseKeyField,
  parseNoteTokenAt,
  collectAbsSteps,
  buildKeyDefaultAccFromMajorSignature,
  majorSignatureForPc,
  normalizeModeToken,
  isStandardMode,
  PC_NAT_12,
  mod,
};
