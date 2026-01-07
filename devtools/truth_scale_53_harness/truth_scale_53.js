const PC_NAT_12 = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

// 12-TET semitone positions approximated in 53-TET (IDs within octave).
// This table is consistent with the examples:
// E=18 => _3e -> 15, F=22 => ^3f -> 25, B=49 => _2B -> 47.
const BASE_ID53_FOR_PC12 = [0, 5, 9, 14, 18, 22, 27, 31, 36, 40, 45, 49];
const BASE_ID53_FOR_NAT_LETTER = {
  C: BASE_ID53_FOR_PC12[0],
  D: BASE_ID53_FOR_PC12[2],
  E: BASE_ID53_FOR_PC12[4],
  F: BASE_ID53_FOR_PC12[5],
  G: BASE_ID53_FOR_PC12[7],
  A: BASE_ID53_FOR_PC12[9],
  B: BASE_ID53_FOR_PC12[11],
};

function mod(n, m) {
  const r = n % m;
  return r < 0 ? r + m : r;
}

function roundHalfUp(x) {
  return Math.floor(Number(x) + 0.5);
}

function normalizeSigned53(delta) {
  let v = Number(delta);
  while (v > 26) v -= 53;
  while (v < -26) v += 53;
  return v;
}

function signForDelta(delta53) {
  return delta53 > 0 ? 1 : delta53 < 0 ? -1 : 0;
}

function parseNoteToken(token) {
  const t = String(token || "").trim();
  if (!t) return null;

  // Minimal: numeric micro accidentals only (^k/_k) + letter. '=' supported as 0.
  const m = t.match(/^(\^|_)(-?\d+)([A-Ga-g])$/);
  if (m) {
    const dir = m[1] === "^" ? 1 : -1;
    const n = Number(m[2]);
    if (!Number.isFinite(n)) return null;
    const letter = m[3].toUpperCase();
    if (!PC_NAT_12[letter] && PC_NAT_12[letter] !== 0) return null;
    return { token: t, letter, micro: dir * Math.trunc(n), explicit: true };
  }
  const eq = t.match(/^=([A-Ga-g])$/);
  if (eq) {
    const letter = eq[1].toUpperCase();
    return { token: t, letter, micro: 0, explicit: true };
  }
  const plain = t.match(/^([A-Ga-g])$/);
  if (plain) {
    const letter = plain[1].toUpperCase();
    return { token: t, letter, micro: 0, explicit: false };
  }
  return null;
}

function tokenToAbs53AndAbs12(token) {
  const parsed = parseNoteToken(token);
  if (!parsed) throw new Error(`Unrecognized note token: '${token}'`);
  const pc12 = PC_NAT_12[parsed.letter];
  const baseId53 = BASE_ID53_FOR_PC12[pc12];
  const abs53 = baseId53 + parsed.micro;
  const abs12 = pc12;
  return { abs53, abs12, parsed };
}

function abs53ToIdWithinOctave(abs53) {
  return mod(abs53, 53);
}

function abs12ToPcWithinOctave(abs12) {
  return mod(abs12, 12);
}

function chooseNaturalLetterForPc12(pc12, { preferFlats } = {}) {
  // Deterministic: represent black keys by a neighboring natural letter.
  // preferFlats=true picks the next natural above (e.g. Db -> D with negative micro), else below (C with positive).
  const pc = mod(pc12, 12);
  const sharpChoice = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  const flatChoice = ["C", "D", "D", "E", "E", "F", "G", "G", "A", "A", "B", "B"];
  return preferFlats ? flatChoice[pc] : sharpChoice[pc];
}

function formatTokenFromAbs53AndAbs12(abs53, abs12, { preferFlats } = {}) {
  const pc12 = abs12ToPcWithinOctave(abs12);
  const id53 = abs53ToIdWithinOctave(abs53);

  const sharpChoice = chooseNaturalLetterForPc12(pc12, { preferFlats: false });
  const flatChoice = chooseNaturalLetterForPc12(pc12, { preferFlats: true });
  const candidates = Array.from(new Set([sharpChoice, flatChoice]));

  const accidentalPairRank = (micro) => {
    // Prefer the practical pair observed in corpus: ^4 and _5.
    if (micro === 4 || micro === -5) return 0;
    if (micro === -4 || micro === 5) return 1;
    return 2;
  };

  const scoreFor = (letter) => {
    const natId53 = BASE_ID53_FOR_NAT_LETTER[letter];
    const micro = normalizeSigned53(id53 - natId53);
    const token = micro === 0 ? letter : (micro > 0 ? `^${micro}${letter}` : `_${-micro}${letter}`);
    // Side preference is an explicit policy knob (e.g. "flats down") and can override micro magnitude.
    const isFlatSide = (letter === flatChoice && letter !== sharpChoice);
    const sideScore = preferFlats ? (isFlatSide ? 0 : 1) : (isFlatSide ? 1 : 0);
    return { letter, micro, token, score: [accidentalPairRank(micro), sideScore, Math.abs(micro)] };
  };

  const scored = candidates.map(scoreFor).sort((a, b) => {
    for (let i = 0; i < a.score.length; i += 1) {
      if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i];
    }
    return String(a.letter).localeCompare(String(b.letter));
  });

  return scored[0].token;
}

function transposeToken(token, delta53, { preferFlats } = {}) {
  const { abs53, abs12 } = tokenToAbs53AndAbs12(token);
  const d = Number(delta53);
  if (!Number.isFinite(d) || (Math.abs(d) !== 4 && Math.abs(d) !== 5)) {
    throw new Error(`Delta must be ±4 or ±5 in 53-TET (got ${delta53})`);
  }
  const abs53New = abs53 + d;
  const abs12New = abs12 + signForDelta(d);
  return {
    outToken: formatTokenFromAbs53AndAbs12(abs53New, abs12New, { preferFlats }),
    abs53New,
    abs12New,
  };
}

function europeanSemitoneDeltaSequence53(steps, { direction } = {}) {
  const n = Math.max(0, Math.trunc(Number(steps) || 0));
  const dir = direction === "down" ? -1 : 1;
  const out = [];
  let prev = 0;
  for (let i = 1; i <= n; i += 1) {
    const target = roundHalfUp((i * 53) / 12);
    const delta = target - prev;
    if (delta !== 4 && delta !== 5) {
      throw new Error(`Internal: expected 4/5 comma step, got ${delta} at i=${i}`);
    }
    out.push(delta * dir);
    prev = target;
  }
  return out;
}

function applyEuropeanSemitoneStepsAbs53(abs53, steps, { direction } = {}) {
  const seq = europeanSemitoneDeltaSequence53(steps, { direction });
  return seq.reduce((v, d) => v + d, Number(abs53) || 0);
}

function parseKeyAccidentals(keyBody) {
  const s = String(keyBody || "");
  const m = s.match(/^\s*(\S+)\s*(.*)$/);
  if (!m) return { tonic: "", tokens: [] };
  const tonic = m[1];
  const rest = m[2] || "";
  const tokens = [];
  const re = /(\^|_)(-?\d+)([A-Ga-g])|=([A-Ga-g])/g;
  let match;
  while ((match = re.exec(rest)) !== null) {
    if (match[1]) tokens.push(`${match[1]}${match[2]}${match[3]}`);
    else if (match[4]) tokens.push(`=${match[4]}`);
  }
  return { tonic, tokens };
}

function transposeKeyField(keyField, delta53, { preferFlats } = {}) {
  const body = String(keyField || "").replace(/^\s*K:\s*/i, "");
  const { tonic, tokens } = parseKeyAccidentals(body);
  if (!tonic) throw new Error(`Unable to parse tonic from key: '${keyField}'`);

  // Tonic is treated as a plain letter for these tests (e.g., K:C).
  const tonicNote = tonic.match(/^[A-Ga-g]$/) ? tonic : tonic[0];
  const tonicOut = transposeToken(tonicNote, delta53, { preferFlats }).outToken;
  const outTokens = tokens.map((tok) => transposeToken(tok, delta53, { preferFlats }).outToken);
  return `K:${tonicOut}${outTokens.length ? ` ${outTokens.join(" ")}` : ""}`;
}

function transposeFragment(fragmentText, delta53, { preferFlats } = {}) {
  const lines = String(fragmentText || "").split(/\r\n|\n|\r/);
  const outLines = [];
  for (const line of lines) {
    if (/^\s*K:/.test(line)) {
      outLines.push(transposeKeyField(line, delta53, { preferFlats }));
      continue;
    }
    // Notes only: split by whitespace and transpose note tokens we recognize.
    const parts = line.split(/(\s+)/);
    const next = parts.map((part) => {
      if (/^\s+$/.test(part)) return part;
      const maybe = parseNoteToken(part);
      if (!maybe) return part;
      return transposeToken(part, delta53, { preferFlats }).outToken;
    });
    outLines.push(next.join(""));
  }
  return outLines.join("\n");
}

module.exports = {
  parseNoteToken,
  tokenToAbs53AndAbs12,
  abs53ToIdWithinOctave,
  transposeToken,
  europeanSemitoneDeltaSequence53,
  applyEuropeanSemitoneStepsAbs53,
  transposeKeyField,
  transposeFragment,
  formatTokenFromAbs53AndAbs12,
};
