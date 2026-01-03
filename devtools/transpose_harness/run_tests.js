#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const { transpose_abc } = require("./transpose");
const {
  collectAbsSteps,
  detectEdoStepsPerOctave,
  parseKeyField,
  parseNoteTokenAt,
  PC_NAT_12,
  mod,
} = require("./abc_parse");

const ROOT = path.resolve(__dirname);
const FIXTURES = path.join(ROOT, "fixtures");
const EXPECTED = path.join(ROOT, "expected");

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function fail(msg) {
  throw new Error(msg);
}

function diffFirstMismatch(aText, bText) {
  const a = String(aText).split(/\r\n|\n|\r/);
  const b = String(bText).split(/\r\n|\n|\r/);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (av !== bv) {
      const start = Math.max(0, i - 2);
      const end = Math.min(max, i + 3);
      const lines = [];
      for (let j = start; j < end; j += 1) {
        const ln = j + 1;
        const left = a[j] == null ? "<missing>" : a[j];
        const right = b[j] == null ? "<missing>" : b[j];
        const marker = j === i ? ">>" : "  ";
        lines.push(`${marker} L${ln}:`);
        lines.push(`  expected: ${right}`);
        lines.push(`  actual:   ${left}`);
      }
      return lines.join("\n");
    }
  }
  return "";
}

function assertEqualBytes(name, actual, expected) {
  if (actual !== expected) {
    const diff = diffFirstMismatch(actual, expected);
    fail(`${name}: output mismatch\n${diff}`);
  }
}

function assertMatch(name, text, re, message) {
  if (!re.test(String(text))) {
    fail(`${name}: ${message}`);
  }
}

function assertSemanticPitchEqual(name, aText, bText) {
  const a = collectAbsSteps(aText);
  const b = collectAbsSteps(bText);
  if (a.edo !== b.edo) {
    fail(`${name}: EDO mismatch ${a.edo} vs ${b.edo}`);
  }
  if (a.absSteps.length !== b.absSteps.length) {
    fail(`${name}: pitch token count mismatch ${a.absSteps.length} vs ${b.absSteps.length}`);
  }
  for (let i = 0; i < a.absSteps.length; i += 1) {
    if (a.absSteps[i] !== b.absSteps[i]) {
      fail(`${name}: pitch mismatch at note #${i + 1}: ${a.absSteps[i]} vs ${b.absSteps[i]}`);
    }
  }
}

function computeAbsForSingleNoteInContext(noteToken, keyFieldBody) {
  const key = parseKeyField(keyFieldBody);
  const keyDefaultAcc = (key && key.ok && key.keyDefaultAcc)
    ? key.keyDefaultAcc
    : (key && key.accMap ? { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0, ...key.accMap } : { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 });
  const note = parseNoteTokenAt(noteToken, 0, 12);
  if (!note) fail(`Unable to parse note token: ${noteToken}`);
  const letter = note.letter;
  const upper = letter.toUpperCase();
  const baseOct = letter === upper ? 4 : 5;
  const up = (note.octaveMarks.match(/'/g) || []).length;
  const down = (note.octaveMarks.match(/,/g) || []).length;
  const oct = baseOct + up - down;
  const pcNat = PC_NAT_12[upper];
  const accSteps = (note.accSteps != null)
    ? note.accSteps
    : (Object.prototype.hasOwnProperty.call(keyDefaultAcc, upper) ? keyDefaultAcc[upper] : 0);
  return oct * 12 + pcNat + accSteps;
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`% PASS ${name}`);
    return true;
  } catch (e) {
    console.log(`% FAIL ${name}`);
    const msg = String(e && e.message ? e.message : e);
    for (const line of msg.split(/\r\n|\n|\r/)) {
      console.log(`% ${line}`);
    }
    return false;
  }
}

function parseArgs(argv) {
  const out = { verbose: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--verbose" || arg === "-v") out.verbose = true;
  }
  return out;
}

function parseKeyTonicPcAndMicroMapFromKeyFieldBody(keyFieldBody) {
  const raw = String(keyFieldBody || "");
  const percent = raw.indexOf("%");
  const head = (percent === -1) ? raw : raw.slice(0, percent);
  const m = head.match(/^\s*(\S+)/);
  if (!m) return { tonicPc: 0, microMap: {} };
  const firstToken = m[1];
  const t = firstToken.match(/^([A-G])([#b]?)/);
  if (!t) return { tonicPc: 0, microMap: {} };
  const tonicLetter = t[1];
  const tonicAcc = t[2] || "";
  const tonicPc = mod(PC_NAT_12[tonicLetter] + (tonicAcc === "#" ? 1 : tonicAcc === "b" ? -1 : 0), 12);

  const microMap = {};
  const tokRe = /(?:^|\s)(\^|_)(-?\d+)([A-Ga-g])\b/g;
  let tok;
  while ((tok = tokRe.exec(head)) !== null) {
    const sign = tok[1] === "^" ? 1 : -1;
    const n = Number(tok[2]);
    if (!Number.isFinite(n)) continue;
    microMap[tok[3].toUpperCase()] = sign * Math.trunc(n);
  }
  return { tonicPc, microMap };
}

function collectBase12AndMicro53(text) {
  const edo = detectEdoStepsPerOctave(text);
  if (edo !== 53) fail(`Expected EDO 53 for micro test (got ${edo})`);
  const src = String(text || "");

  let keyMicroMap = {};
  let barMicroMap = {};
  const notes = [];

  const parseSemitoneAccFromPrefix = (prefix) => {
    const p = String(prefix || "");
    if (p === "^^") return 2;
    if (p === "^") return 1;
    if (p === "__") return -2;
    if (p === "_") return -1;
    if (p === "=") return 0;
    if ((p.startsWith("^") || p.startsWith("_")) && /^[\^_]-?\d+$/.test(p)) return 0;
    return 0;
  };

  const parseExplicitMicroFromPrefix = (prefix) => {
    const p = String(prefix || "");
    if (p === "=") return 0;
    const m = p.match(/^(\^|_)(-?\d+)$/);
    if (!m) return null;
    const sign = m[1] === "^" ? 1 : -1;
    const n = Number(m[2]);
    if (!Number.isFinite(n)) return null;
    return sign * Math.trunc(n);
  };

  const lines = src.split(/\r\n|\n|\r/);
  for (const line of lines) {
    const commentIdx = line.indexOf("%");
    const head = commentIdx === -1 ? line : line.slice(0, commentIdx);

    if (/^\s*%%/.test(head)) continue;
    if (/^\s*K:/.test(head)) {
      const m = head.match(/^\s*K:\s*(.*)$/);
      if (m) {
        const parsed = parseKeyTonicPcAndMicroMapFromKeyFieldBody(m[1]);
        keyMicroMap = parsed.microMap;
      }
      continue;
    }
    if (/^\s*[A-Za-z]:/.test(head)) continue;

    let i = 0;
    while (i < head.length) {
      if (head.startsWith("[K:", i)) {
        const close = head.indexOf("]", i + 3);
        if (close !== -1) {
          const inner = head.slice(i + 3, close);
          const parsed = parseKeyTonicPcAndMicroMapFromKeyFieldBody(inner);
          tonicPc = parsed.tonicPc;
          keyMicroMap = parsed.microMap;
          i = close + 1;
          continue;
        }
      }
      const ch = head[i];
      if (ch === "|") {
        barMicroMap = {};
        i += 1;
        continue;
      }
      const note = parseNoteTokenAt(head, i, 12);
      if (note) {
        const letter = note.letter;
        const upper = letter.toUpperCase();
        const baseOct = letter === upper ? 4 : 5;
        const up = (note.octaveMarks.match(/'/g) || []).length;
        const down = (note.octaveMarks.match(/,/g) || []).length;
        const oct = baseOct + up - down;
        const pcNat = PC_NAT_12[upper];
        const accSemitone = parseSemitoneAccFromPrefix(note.accPrefix);
        const base12 = oct * 12 + pcNat + accSemitone;

        const explicitMicro = parseExplicitMicroFromPrefix(note.accPrefix);
        let micro53;
        if (explicitMicro != null) {
          micro53 = explicitMicro;
          barMicroMap[upper] = explicitMicro;
        } else if (Object.prototype.hasOwnProperty.call(barMicroMap, upper)) {
          micro53 = barMicroMap[upper];
        } else if (Object.prototype.hasOwnProperty.call(keyMicroMap, upper)) {
          micro53 = keyMicroMap[upper];
        } else {
          micro53 = 0;
        }

        notes.push({ base12, micro53, accPrefix: note.accPrefix });
        i = note.end;
        continue;
      }
      i += 1;
    }
  }

  return { edo, notes };
}

function normalizeSigned53(delta) {
  let v = Number(delta);
  while (v > 26) v -= 53;
  while (v < -26) v += 53;
  return v;
}

const EURO_SEMITONE_COMMAS_UP_BY_PC12 = [4, 5, 4, 5, 4, 5, 4, 4, 5, 4, 5, 4];
const SEMITONE_POS_53_BMODE_BY_PC12 = (() => {
  const out = [];
  let acc = 0;
  for (let pc = 0; pc < 12; pc += 1) {
    out[pc] = acc;
    acc += EURO_SEMITONE_COMMAS_UP_BY_PC12[pc];
  }
  return out;
})();

function baseId53ForNaturalLetter(letterUpper) {
  const pc = PC_NAT_12[String(letterUpper || "").toUpperCase()];
  if (pc == null) return 0;
  return SEMITONE_POS_53_BMODE_BY_PC12[pc] || 0;
}

function tonicPc12FromKeyLineBody53(body) {
  const head = String(body || "").split("%")[0];
  const m = head.match(/^\s*(\S+)/);
  if (!m) return 0;
  const t = m[1].match(/^([A-G])([#b]?)/);
  if (!t) return 0;
  const letter = t[1];
  const acc = t[2] || "";
  const pc = mod(PC_NAT_12[letter] + (acc === "#" ? 1 : acc === "b" ? -1 : 0), 12);
  return pc;
}

function euroDeltaCommas53ForTonicPc(pc12, deltaSteps) {
  const pc = mod(Number(pc12) || 0, 12);
  const d = Number(deltaSteps) || 0;
  if (d === 1) return EURO_SEMITONE_COMMAS_UP_BY_PC12[pc];
  if (d === -1) return -EURO_SEMITONE_COMMAS_UP_BY_PC12[mod(pc - 1, 12)];
  return 0;
}

function collectAbs53StepsBMode(text) {
  const edo = detectEdoStepsPerOctave(text);
  if (edo !== 53) fail(`Expected EDO 53 for micro test (got ${edo})`);
  const src = String(text || "");

  let keyMicroMap = {};
  let barMicroMap = {};
  const out = [];

  const parseExplicitMicroFromPrefix = (prefix) => {
    const p = String(prefix || "");
    if (p === "=") return 0;
    const m = p.match(/^(\^|_)(-?\d+)$/);
    if (!m) return null;
    const sign = m[1] === "^" ? 1 : -1;
    const n = Number(m[2]);
    if (!Number.isFinite(n)) return null;
    return sign * Math.trunc(n);
  };

  const lines = src.split(/\r\n|\n|\r/);
  for (const line of lines) {
    const commentIdx = line.indexOf("%");
    const head = commentIdx === -1 ? line : line.slice(0, commentIdx);

    if (/^\s*K:/.test(head)) {
      // Update key micro map defaults.
      keyMicroMap = {};
      const re = /(?:^|\s)(\^|_)(-?\d+)([A-Ga-g])\b|(?:^|\s)=([A-Ga-g])\b/g;
      let m;
      while ((m = re.exec(head.replace(/^\s*K:\s*/, ""))) !== null) {
        if (m[4]) {
          keyMicroMap[m[4].toUpperCase()] = 0;
        } else {
          const sign = m[1] === "^" ? 1 : -1;
          const n = Number(m[2]);
          if (!Number.isFinite(n)) continue;
          keyMicroMap[m[3].toUpperCase()] = sign * Math.trunc(n);
        }
      }
      continue;
    }
    if (/^\s*[A-Za-z]:/.test(head)) continue;
    if (/^\s*%%/.test(head)) continue;

    let i = 0;
    while (i < head.length) {
      const ch = head[i];
      if (ch === "|") {
        barMicroMap = {};
        i += 1;
        continue;
      }
      const note = parseNoteTokenAt(head, i, 53);
      if (note) {
        const letter = note.letter;
        const upper = letter.toUpperCase();
        const baseOct = letter === upper ? 4 : 5;
        const up = (note.octaveMarks.match(/'/g) || []).length;
        const down = (note.octaveMarks.match(/,/g) || []).length;
        const oct = baseOct + up - down;
        const baseId = baseId53ForNaturalLetter(upper);

        let micro = parseExplicitMicroFromPrefix(note.accPrefix);
        if (micro != null) {
          barMicroMap[upper] = micro;
        } else if (Object.prototype.hasOwnProperty.call(barMicroMap, upper)) {
          micro = barMicroMap[upper];
        } else if (Object.prototype.hasOwnProperty.call(keyMicroMap, upper)) {
          micro = keyMicroMap[upper];
        } else {
          micro = 0;
        }

        out.push(oct * 53 + baseId + micro);
        i = note.end;
        continue;
      }
      i += 1;
    }
  }
  return { edo, abs53: out };
}

function printVerboseCase(testName, blocks) {
  process.stdout.write(`% === ${testName} ===\n`);
  for (const block of blocks) {
    process.stdout.write(`% --- ${block.label} ---\n`);
    process.stdout.write(block.text);
    if (!String(block.text).endsWith("\n")) process.stdout.write("\n");
    process.stdout.write("\n");
  }
}

function main() {
  const args = parseArgs(process.argv);
  const cooleys = readText(path.join(FIXTURES, "cooleys_original.abc"));
  const accMem = readText(path.join(FIXTURES, "accidental_memory.abc"));
  const modal = readText(path.join(FIXTURES, "modal_dorian.abc"));
  const nonstd = readText(path.join(FIXTURES, "test5_nonstd.abc"));
  const micro53 = readText(path.join(FIXTURES, "test6_micro_53_western_semitone.abc"));
  const micro53Inline = readText(path.join(FIXTURES, "test8_micro_53_inline_fields_and_decorations.abc"));
  const numAcc = readText(path.join(FIXTURES, "numeric_accidentals.abc"));

  const results = [];

  results.push(runTest("TEST 1: round-trip exact (Cooley's)", () => {
    if (args.verbose) {
      const up = transpose_abc(cooleys, +1);
      const back = transpose_abc(up, -1);
      printVerboseCase("TEST 1", [
        { label: "ORIGINAL", text: cooleys },
        { label: "TRANSPOSED (+1)", text: up },
        { label: "BACK (-1)", text: back },
      ]);
    }
    const up = transpose_abc(cooleys, +1);
    const back = transpose_abc(up, -1);
    assertEqualBytes("TEST 1", back, cooleys);
  }));

  results.push(runTest("TEST 2: step down key tie + golden (Cooley's -1)", () => {
    if (args.verbose) {
      const down = transpose_abc(cooleys, -1);
      printVerboseCase("TEST 2", [
        { label: "ORIGINAL", text: cooleys },
        { label: "TRANSPOSED (-1)", text: down },
      ]);
    }
    const down = transpose_abc(cooleys, -1);
    assertMatch("TEST 2", down, /^K:\s*Ebmin\b/m, "Expected K: to be renamed to Ebmin");
    const idx = down.indexOf("EB{");
    if (idx === -1) fail("TEST 2: expected to find first grace group after 'EB{'");
    const next2 = down.slice(idx + 3, idx + 5);
    if (next2 !== "c}") {
      fail(`TEST 2: expected first grace note to be '{c}', got '{${next2}'`);
    }
    if (down.slice(idx + 3, idx + 5) === "C}") {
      fail("TEST 2: grace note must not be '{C}' (octave regression)");
    }
    // Targeted semantic check: first grace note pitch must be original - 1 step.
    // ORIGINAL has K:Emin and first grace note is "{c}".
    // DOWN has K:Ebmin and first grace note should still be token "c" (implicit Cb5 == B4).
    const origGraceIdx = cooleys.indexOf("EB{");
    if (origGraceIdx === -1) fail("TEST 2: internal: original missing 'EB{'");
    const origNoteTok = cooleys.slice(origGraceIdx + 3, origGraceIdx + 4);
    const downNoteTok = down.slice(idx + 3, idx + 4);
    const origAbs = computeAbsForSingleNoteInContext(origNoteTok, "Emin");
    const downAbs = computeAbsForSingleNoteInContext(downNoteTok, "Ebmin");
    if (downAbs !== origAbs - 1) {
      fail(`TEST 2: grace pitch mismatch (expected ${origAbs - 1}, got ${downAbs})`);
    }
    const expected = readText(path.join(EXPECTED, "cooleys_down.abc"));
    assertEqualBytes("TEST 2", down, expected);
  }));

  results.push(runTest("TEST 3: accidental memory semantic (+1 then -1)", () => {
    if (args.verbose) {
      const up = transpose_abc(accMem, +1);
      const back = transpose_abc(up, -1);
      printVerboseCase("TEST 3", [
        { label: "ORIGINAL", text: accMem },
        { label: "TRANSPOSED (+1)", text: up },
        { label: "BACK (-1)", text: back },
      ]);
    }
    const up = transpose_abc(accMem, +1);
    const back = transpose_abc(up, -1);
    assertSemanticPitchEqual("TEST 3", accMem, back);
  }));

  results.push(runTest("TEST 4: modal key rename + golden (Ddor +1)", () => {
    if (args.verbose) {
      const up = transpose_abc(modal, +1);
      printVerboseCase("TEST 4", [
        { label: "ORIGINAL", text: modal },
        { label: "TRANSPOSED (+1)", text: up },
      ]);
    }
    const up = transpose_abc(modal, +1);
    assertMatch("TEST 4", up, /^K:\s*Ebdor\b/m, "Expected K: to be renamed to Ebdor");
    const expected = readText(path.join(EXPECTED, "modal_dorian_up.abc"));
    assertEqualBytes("TEST 4", up, expected);
  }));

  results.push(runTest("TEST 5: nonstandard key transposed (explicit overrides)", () => {
    if (args.verbose) {
      const up = transpose_abc(nonstd, +1);
      printVerboseCase("TEST 5", [
        { label: "ORIGINAL", text: nonstd },
        { label: "TRANSPOSED (+1)", text: up },
      ]);
    }
    const up = transpose_abc(nonstd, +1);
    assertMatch("TEST 5", up, /^K:D#Phr =g\s*$/m, "Expected K: rewritten as 'K:D#Phr =g'");
    const expected = readText(path.join(EXPECTED, "test5_nonstd_up.abc"));
    assertEqualBytes("TEST 5", up, expected);
  }));

  results.push(runTest("TEST 6: micro 53 western semitone (+1) + golden + semantic + round-trip", () => {
    const expectedUp = readText(path.join(EXPECTED, "test6_micro_53_western_semitone_up.abc"));
    if (args.verbose) {
      const up = transpose_abc(micro53, +1);
      const back = transpose_abc(up, -1);
      printVerboseCase("TEST 6", [
        { label: "ORIGINAL", text: micro53 },
        { label: "TRANSPOSED (+1)", text: up },
        { label: "BACK (-1)", text: back },
      ]);
    }
    const up = transpose_abc(micro53, +1);
    assertEqualBytes("TEST 6", up, expectedUp);

    // Semantic model (B-mode truth-scale): all absolute pitches shift by the same Δ commas chosen from the key tonic.
    const tonicPc = tonicPc12FromKeyLineBody53(micro53.split(/\r\n|\n|\r/).find((l) => /^\s*K:/.test(l)) || "K:C");
    const deltaCommas = euroDeltaCommas53ForTonicPc(tonicPc, +1);
    const inAbs = collectAbs53StepsBMode(micro53);
    const outAbs = collectAbs53StepsBMode(up);
    if (inAbs.abs53.length !== outAbs.abs53.length) {
      fail(`TEST 6: pitch token count mismatch ${inAbs.abs53.length} vs ${outAbs.abs53.length}`);
    }
    for (let i = 0; i < inAbs.abs53.length; i += 1) {
      if (outAbs.abs53[i] !== inAbs.abs53[i] + deltaCommas) {
        fail(`TEST 6: abs53 mismatch at note #${i + 1}: expected ${inAbs.abs53[i] + deltaCommas}, got ${outAbs.abs53[i]}`);
      }
    }

    const back = transpose_abc(up, -1);
    const backAbs = collectAbs53StepsBMode(back);
    if (backAbs.abs53.length !== inAbs.abs53.length) {
      fail(`TEST 6: back pitch token count mismatch ${backAbs.abs53.length} vs ${inAbs.abs53.length}`);
    }
    for (let i = 0; i < inAbs.abs53.length; i += 1) {
      if (backAbs.abs53[i] !== inAbs.abs53[i]) {
        fail(`TEST 6: back abs53 mismatch at note #${i + 1}: expected ${inAbs.abs53[i]}, got ${backAbs.abs53[i]}`);
      }
    }
    const upAgain = transpose_abc(back, +1);
    assertEqualBytes("TEST 6", upAgain, up);
  }));

  results.push(runTest("TEST 7: micro 53 preserves inline fields + decorations", () => {
    const expectedUp = readText(path.join(EXPECTED, "test8_micro_53_inline_fields_and_decorations_up.abc"));
    if (args.verbose) {
      const up = transpose_abc(micro53Inline, +1);
      printVerboseCase("TEST 7", [
        { label: "ORIGINAL", text: micro53Inline },
        { label: "TRANSPOSED (+1)", text: up },
      ]);
    }
    const up = transpose_abc(micro53Inline, +1);
    assertEqualBytes("TEST 7", up, expectedUp);
    assertMatch("TEST 7", up, /\[P:1st Hane\]/, "Expected inline [P:...] to be preserved");
    assertMatch("TEST 7", up, /!courtesy!/, "Expected !courtesy! decoration to be preserved");
    if (/\[P:[^\]]*\^[0-9]/.test(up)) fail("TEST 7: inline [P:...] corrupted by note transposition");
    if (/court\^/i.test(up) || /dourt/i.test(up)) fail("TEST 7: decoration text corrupted by note transposition");
  }));

  results.push(runTest("TEST 8: numeric accidental semantic (+1 then -1)", () => {
    if (args.verbose) {
      const up = transpose_abc(numAcc, +1);
      const back = transpose_abc(up, -1);
      printVerboseCase("TEST 8", [
        { label: "ORIGINAL", text: numAcc },
        { label: "TRANSPOSED (+1)", text: up },
        { label: "BACK (-1)", text: back },
      ]);
    }
    const up = transpose_abc(numAcc, +1);
    const back = transpose_abc(up, -1);
    assertSemanticPitchEqual("TEST 8", numAcc, back);
  }));

  const ok = results.every(Boolean);
  if (!ok) process.exitCode = 1;
}

main();
