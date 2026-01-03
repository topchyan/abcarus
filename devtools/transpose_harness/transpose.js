const {
  detectEdoStepsPerOctave,
  parseKeyField,
  parseNoteTokenAt,
  buildKeyDefaultAccFromMajorSignature,
  majorSignatureForPc,
  normalizeModeToken,
  PC_NAT_12,
  mod,
} = require("./abc_parse");

const SHARP_TONIC_BY_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_TONIC_BY_PC = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function isFieldLine(line) {
  const s = String(line || "");
  return /^[\t ]*[A-Za-z]:/.test(s) || /^[\t ]*%/.test(s);
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

function parseKLineBodyForRewrite(body) {
  const raw = String(body || "");
  const m = raw.match(/^(\s*)(\S+)([\s\S]*)$/);
  if (!m) return { leading: "", firstToken: "", rest: raw };
  return { leading: m[1], firstToken: m[2], rest: m[3] };
}

function splitComment(text) {
  const s = String(text || "");
  const idx = s.indexOf("%");
  if (idx === -1) return { head: s, comment: "" };
  return { head: s.slice(0, idx), comment: s.slice(idx) };
}

function keySideFromSignatureCount(signatureCount) {
  const n = Number(signatureCount) || 0;
  if (n > 0) return "sharp";
  if (n < 0) return "flat";
  return "neutral";
}

function keySideFromName(tonicName) {
  const t = String(tonicName || "");
  if (t.includes("#")) return "sharp";
  if (t.includes("b")) return "flat";
  return "neutral";
}

function computePcFromTonicName(tonicName) {
  const m = String(tonicName || "").match(/^([A-G])([#b]?)$/);
  if (!m) return null;
  const letter = m[1];
  const acc = m[2] || "";
  const pc = PC_NAT_12[letter];
  const a = acc === "#" ? 1 : acc === "b" ? -1 : 0;
  return mod(pc + a, 12);
}

function normalizeToRange12(x) {
  let v = Number(x);
  while (v > 6) v -= 12;
  while (v < -6) v += 12;
  return v;
}

function normalizeSigned53(delta) {
  let v = Number(delta);
  while (v > 26) v -= 53;
  while (v < -26) v += 53;
  return v;
}

function modeOffsetToRelativeMajor(modeNorm) {
  const norm = normalizeModeToken(modeNorm);
  // Map in abc_parse already returns the normalized long names; reuse the original offset table logic:
  // ionian: 0, aeolian: +3, dorian: -2, phrygian: -4, lydian: -5, mixolydian: +5, locrian: +1
  if (norm === "ionian") return 0;
  if (norm === "aeolian") return 3;
  if (norm === "dorian") return -2;
  if (norm === "phrygian") return -4;
  if (norm === "lydian") return -5;
  if (norm === "mixolydian") return 5;
  if (norm === "locrian") return 1;
  return 0;
}

function chooseRenamedStandardKey({ tonicPc, modeNorm, deltaSteps, originalKey }) {
  const pcNew = mod(tonicPc + deltaSteps, 12);
  const candidates = [];
  const origSide = keySideFromSignatureCount(originalKey.signatureCount);
  const deltaBias = deltaSteps > 0 ? "sharp" : deltaSteps < 0 ? "flat" : "neutral";
  const modeOffset = modeOffsetToRelativeMajor(modeNorm);
  const pcRelMaj = mod(pcNew + modeOffset, 12);

  const considerTonic = (tonicName) => {
    const tonicSide = keySideFromName(tonicName);
    const preferredSigSide = tonicSide === "neutral"
      ? (deltaBias !== "neutral" ? deltaBias : (origSide !== "neutral" ? origSide : "flat"))
      : tonicSide;
    const sig = majorSignatureForPc(pcRelMaj, preferredSigSide);
    if (!sig) return;
    const signedCount = sig.side === "flat" ? -sig.count : sig.count;
    if (Math.abs(signedCount) > 7) return;
    candidates.push({
      tonicName,
      tonicSide,
      signatureCount: signedCount,
      signatureSide: sig.side,
      relMajorName: sig.name,
    });
  };

  // Always consider both spellings, even if they are identical (neutral).
  considerTonic(SHARP_TONIC_BY_PC[pcNew]);
  considerTonic(FLAT_TONIC_BY_PC[pcNew]);

  if (!candidates.length) return null;

  const pick = (a, b) => {
    const aAbs = Math.abs(a.signatureCount);
    const bAbs = Math.abs(b.signatureCount);
    if (aAbs !== bAbs) return aAbs - bAbs; // KSEL1

    const aSharp = a.tonicSide === "sharp";
    const aFlat = a.tonicSide === "flat";
    const bSharp = b.tonicSide === "sharp";
    const bFlat = b.tonicSide === "flat";

    if (deltaBias === "sharp" && aSharp !== bSharp) return aSharp ? -1 : 1; // KSEL2
    if (deltaBias === "flat" && aFlat !== bFlat) return aFlat ? -1 : 1; // KSEL2

    if (origSide === "sharp" && aSharp !== bSharp) return aSharp ? -1 : 1; // KSEL3
    if (origSide === "flat" && aFlat !== bFlat) return aFlat ? -1 : 1; // KSEL3

    if (aFlat !== bFlat) return aFlat ? -1 : 1; // KSEL4
    return String(a.tonicName).localeCompare(String(b.tonicName));
  };

  candidates.sort(pick);
  const best = candidates[0];
  const keyDefaultAcc = buildKeyDefaultAccFromMajorSignature({
    count: Math.abs(best.signatureCount),
    side: best.signatureCount < 0 ? "flat" : best.signatureCount > 0 ? "sharp" : "neutral",
  });
  return { ...best, keyDefaultAcc };
}

function accidentalPrefixFromAbsAccSteps(accSteps) {
  if (accSteps === -2) return "__";
  if (accSteps === -1) return "_";
  if (accSteps === 0) return "=";
  if (accSteps === 1) return "^";
  if (accSteps === 2) return "^^";
  return "";
}

function chooseTonicNameByPc(pc, { deltaSteps, originalSide }) {
  const sharp = SHARP_TONIC_BY_PC[pc];
  const flat = FLAT_TONIC_BY_PC[pc];
  if (sharp === flat) return sharp;
  if (deltaSteps > 0) return sharp;
  if (deltaSteps < 0) return flat;
  if (originalSide === "sharp") return sharp;
  if (originalSide === "flat") return flat;
  return flat;
}

function chooseSpelling12(stepWithinOctave, keyDefaultAcc) {
  const step = mod(stepWithinOctave, 12);
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  let best = null;
  for (let idx = 0; idx < letters.length; idx += 1) {
    const L = letters[idx];
    const pcNat = PC_NAT_12[L];
    const accNeeded = normalizeToRange12(step - pcNat);
    if (accNeeded < -2 || accNeeded > 2) continue;
    const keyAcc = (keyDefaultAcc && Object.prototype.hasOwnProperty.call(keyDefaultAcc, L)) ? keyDefaultAcc[L] : 0;
    const printedAcc = accNeeded - keyAcc;
    const score = [Math.abs(printedAcc), Math.abs(accNeeded), idx];
    if (!best || score[0] < best.score[0]
      || (score[0] === best.score[0] && (score[1] < best.score[1]
        || (score[1] === best.score[1] && score[2] < best.score[2])))) {
      best = { letter: L, accNeeded, keyAcc, score };
    }
  }
  return best;
}

function noteStringFromAbsSteps12WithPreferredLetter(absSteps2, preferredLetterUpper, keyDefaultAcc, duration) {
  const edo = 12;
  const L = String(preferredLetterUpper || "").toUpperCase();
  if (!/^[A-G]$/.test(L)) return null;
  const pcNat = PC_NAT_12[L];
  const keyAcc = (keyDefaultAcc && Object.prototype.hasOwnProperty.call(keyDefaultAcc, L)) ? keyDefaultAcc[L] : 0;
  let best = null;
  for (const accNeeded of [-2, -1, 0, 1, 2]) {
    const numer = absSteps2 - (pcNat + accNeeded);
    if (numer % edo !== 0) continue;
    const oct2 = Math.trunc(numer / edo);
    const printedAcc = accNeeded - keyAcc;
    const score = [Math.abs(printedAcc), Math.abs(accNeeded)];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
      best = { oct2, accNeeded, keyAcc, score };
    }
  }
  if (!best) return null;
  const prefix = (best.accNeeded === best.keyAcc) ? "" : accidentalPrefixFromAbsAccSteps(best.accNeeded);
  let letterOut = L;
  let marks = "";
  if (best.oct2 === 4) {
    letterOut = letterOut.toUpperCase();
  } else if (best.oct2 < 4) {
    letterOut = letterOut.toUpperCase();
    marks = ",".repeat(4 - best.oct2);
  } else if (best.oct2 === 5) {
    letterOut = letterOut.toLowerCase();
  } else {
    letterOut = letterOut.toLowerCase();
    marks = "'".repeat(best.oct2 - 5);
  }
  return `${prefix}${letterOut}${marks}${duration || ""}`;
}

function noteStringFromAbsSteps12(absSteps2, keyDefaultAcc, duration) {
  const edo = 12;
  const step2 = mod(absSteps2, edo);
  const best = chooseSpelling12(step2, keyDefaultAcc);
  if (!best) return null;

  const keyAcc = best.keyAcc;
  const accNeeded = best.accNeeded;
  const prefix = (accNeeded === keyAcc) ? "" : accidentalPrefixFromAbsAccSteps(accNeeded);

  const pcNat = PC_NAT_12[best.letter];
  const numer = absSteps2 - (pcNat + accNeeded);
  const oct2 = Math.trunc(numer / edo);

  let letterOut = best.letter;
  let marks = "";
  if (oct2 === 4) {
    letterOut = letterOut.toUpperCase();
  } else if (oct2 < 4) {
    letterOut = letterOut.toUpperCase();
    marks = ",".repeat(4 - oct2);
  } else if (oct2 === 5) {
    letterOut = letterOut.toLowerCase();
  } else {
    letterOut = letterOut.toLowerCase();
    marks = "'".repeat(oct2 - 5);
  }

  return `${prefix}${letterOut}${marks}${duration || ""}`;
}

function absStepsFromNoteToken12(note, { keyDefaultAcc, barAccMap }) {
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

  const abs = oct * 12 + pcNat + accSteps;
  if (note.accSteps != null && barAccMap) barAccMap[upper] = accSteps;
  return abs;
}

function parseNonstandardOverrideMap(raw) {
  const map = {};
  const tokens = [];
  const tokRe = /(?:^|\s)(\^\^|\^|__|_|=)([A-Ga-g])\b/g;
  let t;
  while ((t = tokRe.exec(raw)) !== null) {
    const acc = t[1];
    const letter = t[2].toUpperCase();
    const accSteps = (acc === "^^") ? 2 : (acc === "^") ? 1 : (acc === "__") ? -2 : (acc === "_") ? -1 : 0;
    map[letter] = accSteps;
    tokens.push({ letter, accSteps });
  }
  return { map, tokens };
}

function buildLetterSequence(baseLetterUpper) {
  const letters = ["A", "B", "C", "D", "E", "F", "G"];
  const start = letters.indexOf(String(baseLetterUpper || "").toUpperCase());
  if (start === -1) return ["C", "D", "E", "F", "G", "A", "B"];
  const out = [];
  for (let i = 0; i < 7; i += 1) out.push(letters[(start + i) % 7]);
  return out;
}

function circularDistance12(a, b) {
  const d = mod(a - b, 12);
  return Math.min(d, 12 - d);
}

function chooseOverrideLetterForTargetPc({ targetPc, seqLetters, baseKeyDefaultAcc, deltaSteps }) {
  const order = ["C", "D", "E", "F", "G", "A", "B"];
  let best = null;
  for (const L of seqLetters) {
    const baseAcc = (baseKeyDefaultAcc && Object.prototype.hasOwnProperty.call(baseKeyDefaultAcc, L)) ? baseKeyDefaultAcc[L] : 0;
    const pcBase = mod(PC_NAT_12[L] + baseAcc, 12);
    const dist = circularDistance12(targetPc, pcBase);
    const signed = normalizeToRange12(targetPc - pcBase);
    const sidePref = (deltaSteps > 0) ? (signed < 0 ? 0 : 1) : (deltaSteps < 0) ? (signed > 0 ? 0 : 1) : 0;
    const score = [dist, sidePref, order.indexOf(L)];
    if (!best || score[0] < best.score[0]
      || (score[0] === best.score[0] && (score[1] < best.score[1]
        || (score[1] === best.score[1] && score[2] < best.score[2])))) {
      best = { letter: L, baseAcc, score };
    }
  }
  return best ? best.letter : seqLetters[0];
}

function transposeMusicLine12(line, deltaSteps, ctx) {
  const src = String(line || "");
  const out = [];
  let i = 0;
  let barAccMap = {};

  while (i < src.length) {
    const ch = src[i];
    if (ch === "%") {
      out.push(src.slice(i));
      break;
    }
    if (ch === "|") {
      barAccMap = {};
      out.push(ch);
      i += 1;
      continue;
    }
    // Inline key field: [K:...]
    if (src.startsWith("[K:", i)) {
      const close = src.indexOf("]", i + 3);
      if (close !== -1) {
        const inner = src.slice(i + 3, close);
        const rewritten = rewriteKBody(inner, deltaSteps, ctx);
        out.push("[K:" + rewritten.text + "]");
        i = close + 1;
        continue;
      }
    }
    const note = parseNoteTokenAt(src, i, 12);
    if (note) {
      const abs = absStepsFromNoteToken12(note, { keyDefaultAcc: ctx.readKeyDefaultAcc, barAccMap });
      const abs2 = abs + deltaSteps;
      const rendered = (ctx.spellMode === "prefer_input_letter")
        ? (noteStringFromAbsSteps12WithPreferredLetter(abs2, note.letter, ctx.writeKeyDefaultAcc, note.duration)
          || noteStringFromAbsSteps12(abs2, ctx.writeKeyDefaultAcc, note.duration))
        : noteStringFromAbsSteps12(abs2, ctx.writeKeyDefaultAcc, note.duration);
      out.push(rendered || note.token);
      i = note.end;
      continue;
    }
    out.push(ch);
    i += 1;
  }

  return out.join("");
}

function rewriteKBody(body, deltaSteps, ctx) {
  const { head, comment } = splitComment(body);
  const parsed = parseKeyField(head);
  if (!parsed.ok || parsed.kind !== "standard") {
    // Nonstandard or none: if explicit overrides exist, transpose the key "passport" (tonic + overrides).
    const overrides = parsed && parsed.accMap ? parsed.accMap : null;
    const hasOverrides = overrides && Object.keys(overrides).length > 0;
    if (parsed && parsed.kind === "nonstandard" && hasOverrides && parsed.tonicLetter && parsed.modeRaw) {
      const pc0 = mod(
        PC_NAT_12[parsed.tonicLetter] + (parsed.tonicAcc === "#" ? 1 : parsed.tonicAcc === "b" ? -1 : 0),
        12
      );
      const originalSide = parsed.tonicAcc === "#" ? "sharp" : parsed.tonicAcc === "b" ? "flat" : "neutral";
      const pc1 = mod(pc0 + deltaSteps, 12);
      const tonic1Name = chooseTonicNameByPc(pc1, { deltaSteps, originalSide });
      const modeToken = String(parsed.modeRaw || "").trim();
      const newBase = parseKeyField(`${tonic1Name}${modeToken}`);
      const baseAcc1 = (newBase && newBase.keyDefaultAcc) ? newBase.keyDefaultAcc : { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
      const baseAcc0 = (parsed.baseKeyDefaultAcc || parsed.keyDefaultAcc) ? (parsed.baseKeyDefaultAcc || parsed.keyDefaultAcc) : { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };

      const seq1 = buildLetterSequence(tonic1Name[0]);
      const nextOverrides = {};
      const letters = ["A", "B", "C", "D", "E", "F", "G"];
      for (const L of letters) {
        if (!Object.prototype.hasOwnProperty.call(overrides, L)) continue;
        const acc0 = overrides[L];
        const targetPc0 = mod(PC_NAT_12[L] + acc0, 12);
        const targetPc1 = mod(targetPc0 + deltaSteps, 12);
        const chosenLetter = chooseOverrideLetterForTargetPc({
          targetPc: targetPc1,
          seqLetters: seq1,
          baseKeyDefaultAcc: baseAcc1,
          deltaSteps,
        });
        const acc1 = normalizeToRange12(targetPc1 - PC_NAT_12[chosenLetter]);
        nextOverrides[chosenLetter] = acc1;
      }

      const writeKeyDefaultAcc = { ...baseAcc1, ...nextOverrides };
      // Read defaults should follow the original key with its own base signature and overrides.
      const readKeyDefaultAcc = parsed.keyDefaultAcc
        ? parsed.keyDefaultAcc
        : { ...baseAcc0, ...overrides };

      ctx.readKeyDefaultAcc = readKeyDefaultAcc;
      ctx.writeKeyDefaultAcc = writeKeyDefaultAcc;
      ctx.spellMode = "prefer_input_letter";

      const outTokens = [];
      for (const L of letters) {
        if (!Object.prototype.hasOwnProperty.call(nextOverrides, L)) continue;
        const accAbs = nextOverrides[L];
        const baseAbs = Object.prototype.hasOwnProperty.call(baseAcc1, L) ? baseAcc1[L] : 0;
        if (accAbs === baseAbs) continue;
        const prefix = accidentalPrefixFromAbsAccSteps(accAbs);
        outTokens.push(`${prefix}${L.toLowerCase()}`);
      }
      const leading = parseKLineBodyForRewrite(body).leading || "";
      const tokenText = outTokens.length ? ` ${outTokens.join(" ")}` : "";
      return { text: `${leading}${tonic1Name}${modeToken}${tokenText}${comment}`, renamed: true };
    }

    // Other nonstandard: preserve verbatim and use any computed defaults for semantics.
    ctx.readKeyDefaultAcc = (parsed && parsed.keyDefaultAcc)
      ? parsed.keyDefaultAcc
      : (parsed && parsed.accMap ? { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0, ...parsed.accMap } : { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 });
    ctx.writeKeyDefaultAcc = ctx.readKeyDefaultAcc;
    ctx.spellMode = null;
    return { text: body, renamed: false };
  }

  const tonicPc = mod(
    PC_NAT_12[parsed.tonicLetter] + (parsed.tonicAcc === "#" ? 1 : parsed.tonicAcc === "b" ? -1 : 0),
    12
  );
  const renamed = chooseRenamedStandardKey({
    tonicPc,
    modeNorm: parsed.modeNorm,
    deltaSteps,
    originalKey: parsed,
  });
  if (!renamed) {
    ctx.readKeyDefaultAcc = parsed.keyDefaultAcc || { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
    ctx.writeKeyDefaultAcc = ctx.readKeyDefaultAcc;
    return { text: body, renamed: false };
  }

  ctx.readKeyDefaultAcc = parsed.keyDefaultAcc || { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  ctx.writeKeyDefaultAcc = renamed.keyDefaultAcc || ctx.readKeyDefaultAcc;

  const { leading, firstToken, rest } = parseKLineBodyForRewrite(body);
  const tokenMatch = String(firstToken || "").match(/^([A-G])([#b]?)(.*)$/);
  if (!tokenMatch) return { text: body, renamed: false };
  const modeInline = tokenMatch[3] || "";
  const newToken = `${renamed.tonicName}${modeInline}`;
  return { text: `${leading}${newToken}${rest}`, renamed: true, tonicName: renamed.tonicName };
}

function rewriteKBodyWesternSemitoneOnly(body, deltaSteps) {
  const { head, comment } = splitComment(body);
  const { leading, firstToken, rest } = parseKLineBodyForRewrite(head);
  const tokenMatch = String(firstToken || "").match(/^([A-G])([#b]?)(.*)$/);
  if (!tokenMatch) return body;
  const tonicLetter = tokenMatch[1];
  const tonicAcc = tokenMatch[2] || "";
  const modeInline = tokenMatch[3] || "";
  const pc0 = computePcFromTonicName(`${tonicLetter}${tonicAcc}`);
  if (pc0 == null) return body;
  const originalSide = tonicAcc === "#" ? "sharp" : tonicAcc === "b" ? "flat" : "neutral";
  const pc1 = mod(pc0 + deltaSteps, 12);
  const tonic1Name = chooseTonicNameByPc(pc1, { deltaSteps, originalSide });
  const newFirstToken = `${tonic1Name}${modeInline}`;
  return `${leading}${newFirstToken}${rest}${comment}`;
}

function rewriteInlineKBlocksOnly(line, deltaSteps, rewriteKBodyFn) {
  const src = String(line || "");
  const out = [];
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("[K:", i)) {
      const close = src.indexOf("]", i + 3);
      if (close !== -1) {
        const inner = src.slice(i + 3, close);
        out.push("[K:" + rewriteKBodyFn(inner, deltaSteps) + "]");
        i = close + 1;
        continue;
      }
    }
    out.push(src[i]);
    i += 1;
  }
  return out.join("");
}

function parseNumericMicroMapFromKBody53(body) {
  const { head } = splitComment(body);
  const map = {};
  const re = /(?:^|\s)(\^|_)(-?\d+)([A-Ga-g])\b/g;
  let m;
  while ((m = re.exec(head)) !== null) {
    const sign = m[1] === "^" ? 1 : -1;
    const n = Number(m[2]);
    if (!Number.isFinite(n)) continue;
    map[m[3].toUpperCase()] = sign * Math.trunc(n);
  }
  return map;
}

function semitoneAccFromPrefix(accPrefix) {
  const p = String(accPrefix || "");
  if (p === "^^") return 2;
  if (p === "^") return 1;
  if (p === "__") return -2;
  if (p === "_") return -1;
  if (p === "=") return 0;
  return 0; // numeric micro accidentals do not affect western semitone component in this harness policy
}

function parseExplicitMicroFromPrefix(accPrefix) {
  const p = String(accPrefix || "");
  if (p === "=") return { explicit: true, micro: 0, kind: "natural" };
  const m = p.match(/^(\^|_)(-?\d+)$/);
  if (!m) return { explicit: false, micro: null, kind: "none" };
  const sign = m[1] === "^" ? 1 : -1;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return { explicit: false, micro: null, kind: "none" };
  return { explicit: true, micro: sign * Math.trunc(n), kind: "numeric" };
}

function parseKFirstTokenTonicPc12(body) {
  const { head } = splitComment(body);
  const m = String(head || "").match(/^\s*(\S+)/);
  if (!m) return 0;
  const tok = m[1];
  const t = tok.match(/^([A-G])([#b]?)/);
  if (!t) return 0;
  const pc = computePcFromTonicName(`${t[1]}${t[2] || ""}`);
  return pc == null ? 0 : pc;
}

function buildKeyMicroMapFromKBody53(body) {
  const { head } = splitComment(body);
  const map = {};
  const re = /(?:^|\s)(\^|_)(-?\d+)([A-Ga-g])\b|(?:^|\s)=([A-Ga-g])\b/g;
  let m;
  while ((m = re.exec(head)) !== null) {
    if (m[4]) {
      map[m[4].toUpperCase()] = 0;
      continue;
    }
    const sign = m[1] === "^" ? 1 : -1;
    const n = Number(m[2]);
    if (!Number.isFinite(n)) continue;
    map[m[3].toUpperCase()] = sign * Math.trunc(n);
  }
  return map;
}

function transposeKBody53BMode(body, deltaSteps) {
  const { head, comment } = splitComment(body);
  const readTonicPc12 = parseKFirstTokenTonicPc12(head);
  const deltaCommas = euroSemitoneDeltaCommas53({ tonicPc12: readTonicPc12, deltaSteps });
  const readKeyMicroMap = buildKeyMicroMapFromKBody53(head);
  // Rewrite tonic (C->C#, etc) using existing deterministic spelling, but do not carry over old override tokens.
  const { leading, firstToken } = parseKLineBodyForRewrite(head);
  const tokenMatch = String(firstToken || "").match(/^([A-G])([#b]?)(.*)$/);
  if (!tokenMatch) return { text: body, readTonicPc12, deltaCommas, readKeyMicroMap, writeKeyMicroMap: readKeyMicroMap };
  const tonicLetter = tokenMatch[1];
  const tonicAcc = tokenMatch[2] || "";
  const modeInline = tokenMatch[3] || "";
  const pc0 = computePcFromTonicName(`${tonicLetter}${tonicAcc}`);
  const pc1 = pc0 == null ? 0 : mod(pc0 + deltaSteps, 12);
  const originalSide = tonicAcc === "#" ? "sharp" : tonicAcc === "b" ? "flat" : "neutral";
  const tonic1Name = chooseTonicNameByPc(pc1, { deltaSteps, originalSide });
  const newFirstToken = `${tonic1Name}${modeInline}`;

  // Now transpose explicit micro tokens in the remainder by truth-scale shift (same deltaCommas).
  // Preserve each token's target letter identity as written (case), adjusting only its numeric micro amount.
  const outTokens = [];
  const re = /(\^|_)(-?\d+)([A-Ga-g])|=([A-Ga-g])/g;
  let match;
  const preferSharps = deltaSteps > 0;
  const preferFlats = deltaSteps < 0;
  while ((match = re.exec(head)) !== null) {
    const letterRaw = match[4] ? match[4] : match[3];
    const upper = letterRaw.toUpperCase();
    const base0 = baseId53ForNaturalLetter(upper);
    let micro0 = 0;
    if (!match[4]) {
      const sign = match[1] === "^" ? 1 : -1;
      const n = Number(match[2]);
      if (!Number.isFinite(n)) continue;
      micro0 = sign * Math.trunc(n);
    }
    const id0 = mod(base0 + micro0, 53);
    const id1 = mod(id0 + deltaCommas, 53);
    const chosen = chooseSpelling53ForId({ id53: id1, preferFlats, preferSharps });
    const outLetter = (letterRaw === letterRaw.toUpperCase())
      ? chosen.letterUpper.toUpperCase()
      : chosen.letterUpper.toLowerCase();
    outTokens.push(`${microPrefixFor53(chosen.micro, { explicit: true })}${outLetter}`);
  }

  // Update key micro defaults for subsequent note parsing/spelling.
  const writeKeyMicroMap = {};
  for (const tok of outTokens) {
    const m2 = tok.match(/^(\^|_)(\d+)([A-Ga-g])$/);
    const mEq = tok.match(/^=([A-Ga-g])$/);
    if (mEq) {
      writeKeyMicroMap[mEq[1].toUpperCase()] = 0;
      continue;
    }
    if (m2) {
      const dir = m2[1] === "^" ? 1 : -1;
      writeKeyMicroMap[m2[3].toUpperCase()] = dir * Number(m2[2]);
    }
  }

  // Preserve original spacing after tonic token by rebuilding: tonic token (from rewrittenHead) + space + tokens.
  const suffix = outTokens.length ? ` ${outTokens.join(" ")}` : "";
  return { text: `${leading}${newFirstToken}${suffix}${comment}`, readTonicPc12, deltaCommas, readKeyMicroMap, writeKeyMicroMap };
}

const NATURAL_LETTER_BY_PC12 = {
  0: "C",
  2: "D",
  4: "E",
  5: "F",
  7: "G",
  9: "A",
  11: "B",
};

// B-mode (European semitone sequencer): cumulative rounding of 53/12.
// Defines a deterministic 12-step cycle that sums to 53: 4,5,4,5,4,5,4,4,5,4,5,4.
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

function noteTailFromLetterAndMarks(letter, octaveMarks, duration) {
  return `${letter}${octaveMarks || ""}${duration || ""}`;
}

function standardSemitonePrefixFromSteps(steps, { explicitNatural } = {}) {
  const s = Number(steps) || 0;
  if (s === 0) return explicitNatural ? "=" : "";
  return accidentalPrefixFromAbsAccSteps(s);
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

function transposeMusicLine53Western(line, deltaSteps, ctx) {
  const src = String(line || "");
  const out = [];
  let i = 0;
  let barMicroRead = {};
  let barMicroWrite = {};
  const deltaCommas = Number(ctx.deltaCommas) || 0;
  const preferSharps = deltaSteps > 0;
  const preferFlats = deltaSteps < 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === "\"") {
      const close = src.indexOf("\"", i + 1);
      if (close !== -1) {
        out.push(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
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
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        const tag = src[i + 1].toUpperCase();
        if (tag === "K") {
          const inner = src.slice(i + 3, close);
          const info = transposeKBody53BMode(inner, deltaSteps);
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
    const note = parseNoteTokenAt(src, i, 53);
    if (note) {
      // In 53-TET truth-scale mode, allow only numeric micro accidentals or '='.
      if (/^\^$|^_$|^\^\^$|^__$/.test(note.accPrefix || "")) {
        throw new Error("53-EDO: standard accidentals (^^/^/__/_ ) are not supported; use numeric ^k/_k or '='.");
      }
      const letter = note.letter;
      const upper = letter.toUpperCase();
      const baseOct = letter === upper ? 4 : 5;
      const up = (note.octaveMarks.match(/'/g) || []).length;
      const down = (note.octaveMarks.match(/,/g) || []).length;
      const oct = baseOct + up - down;
      const baseId = baseId53ForNaturalLetter(upper);
      const explicit = parseExplicitMicroFromPrefix(note.accPrefix);
      let micro = 0;
      if (explicit.explicit) {
        micro = explicit.micro;
        barMicroRead[upper] = micro;
      } else if (Object.prototype.hasOwnProperty.call(barMicroRead, upper)) {
        micro = barMicroRead[upper];
      } else if (ctx.readKeyMicroMap && Object.prototype.hasOwnProperty.call(ctx.readKeyMicroMap, upper)) {
        micro = ctx.readKeyMicroMap[upper];
      }

      const abs53 = oct * 53 + baseId + micro;
      const abs53New = abs53 + deltaCommas;
      const oct2 = Math.trunc(Math.floor(abs53New / 53));
      const id2 = mod(abs53New, 53);

      const defaultWriteFor = (letterUpper) => (
        Object.prototype.hasOwnProperty.call(barMicroWrite, letterUpper)
          ? barMicroWrite[letterUpper]
          : (ctx.writeKeyMicroMap && Object.prototype.hasOwnProperty.call(ctx.writeKeyMicroMap, letterUpper)
            ? ctx.writeKeyMicroMap[letterUpper]
            : 0)
      );

      const candidates = [];
      // Candidate A: preserve input letter identity.
      candidates.push({ letterUpper: upper, micro: normalizeSigned53(id2 - baseId) });
      // Candidate B: best spelling according to corpus preference (^4/_5) and side.
      const bestSpell = chooseSpelling53ForId({ id53: id2, preferFlats, preferSharps });
      if (bestSpell && bestSpell.letterUpper && bestSpell.letterUpper !== upper) {
        candidates.push({ letterUpper: bestSpell.letterUpper, micro: bestSpell.micro });
      }

      let chosen = null;
      for (const cand of candidates) {
        const def = defaultWriteFor(cand.letterUpper);
        const needsExplicit = explicit.explicit || cand.micro !== def;
        const sideScore = preferFlats ? (cand.micro < 0 ? 0 : 1) : (preferSharps ? (cand.micro > 0 ? 0 : 1) : 0);
        const score = [needsExplicit ? 1 : 0, pairRank53(cand.micro), sideScore, Math.abs(cand.micro)];
        const prefix = needsExplicit ? microPrefixFor53(cand.micro, { explicit: explicit.explicit }) : "";
        if (!chosen) chosen = { ...cand, needsExplicit, prefix, score };
        else {
          for (let s = 0; s < score.length; s += 1) {
            if (score[s] < chosen.score[s]) { chosen = { ...cand, needsExplicit, prefix, score }; break; }
            if (score[s] > chosen.score[s]) break;
          }
        }
      }

      if (!chosen) throw new Error("53-EDO: unable to choose spelling");
      if (chosen.needsExplicit) barMicroWrite[chosen.letterUpper] = chosen.micro;

      let letterOut = chosen.letterUpper;
      let marks = "";
      if (oct2 === 4) {
        letterOut = letterOut.toUpperCase();
      } else if (oct2 < 4) {
        letterOut = letterOut.toUpperCase();
        marks = ",".repeat(4 - oct2);
      } else if (oct2 === 5) {
        letterOut = letterOut.toLowerCase();
      } else {
        letterOut = letterOut.toLowerCase();
        marks = "'".repeat(oct2 - 5);
      }

      out.push(`${chosen.prefix}${noteTailFromLetterAndMarks(letterOut, marks, note.duration)}`);
      i = note.end;
      continue;
    }
    out.push(ch);
    i += 1;
  }

  return out.join("");
}

function transpose_abc(text, deltaSteps) {
  const edo = detectEdoStepsPerOctave(text);
  const delta = Number(deltaSteps);
  if (!Number.isFinite(delta) || delta === 0) return String(text || "");
  if (Math.abs(delta) !== 1) {
    throw new Error(`Only deltaSteps = ±1 is supported by this harness (got ${deltaSteps}).`);
  }

  if (edo !== 12) {
    if (edo === 53) {
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
            const info = transposeKBody53BMode(body, delta);
            ctx.deltaCommas = info.deltaCommas;
            ctx.readKeyMicroMap = info.readKeyMicroMap;
            ctx.writeKeyMicroMap = info.writeKeyMicroMap;
            out.push(prefix + info.text + nl);
          } else {
            out.push(line + nl);
          }
          continue;
        }
        out.push(transposeMusicLine53Western(line, delta, ctx) + nl);
      }
      return out.join("");
    }
    throw new Error(`EDO ${edo} not supported by this harness yet (supported: 12, 53).`);
  }

  const parts = splitLinesWithNewlines(text);
  const ctx = {
    readKeyDefaultAcc: { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 },
    writeKeyDefaultAcc: { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 },
  };

  const out = [];
  for (const part of parts) {
    const line = part.line;
    const nl = part.nl;
    if (isFieldLine(line)) {
      // Only rewrite K: lines (and only rename in STANDARD-KEY MODE).
      const m = String(line).match(/^([\t ]*K:)([\s\S]*)$/);
      if (m) {
        const prefix = m[1];
        const body = m[2] || "";
        const rewritten = rewriteKBody(body, delta, ctx);
        out.push(prefix + rewritten.text + nl);
      } else {
        out.push(line + nl);
      }
      continue;
    }

    // Music line: transpose notes + inline [K:...] blocks.
    out.push(transposeMusicLine12(line, delta, ctx) + nl);
  }

  return out.join("");
}

module.exports = { transpose_abc };
