#!/usr/bin/env node
const assert = require("assert");

const {
  tokenToAbs53AndAbs12,
  abs53ToIdWithinOctave,
  transposeToken,
  europeanSemitoneDeltaSequence53,
  applyEuropeanSemitoneStepsAbs53,
  transposeKeyField,
  transposeFragment,
  formatTokenFromAbs53AndAbs12,
} = require("./truth_scale_53");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
    return true;
  } catch (e) {
    process.stdout.write(`FAIL ${name}\n`);
    process.stdout.write(String((e && e.stack) ? e.stack : e) + "\n");
    return false;
  }
}

function idWithin(token) {
  return abs53ToIdWithinOctave(tokenToAbs53AndAbs12(token).abs53);
}

function mod(n, m) {
  const r = n % m;
  return r < 0 ? r + m : r;
}

function interval53(a, b) {
  return mod(idWithin(b) - idWithin(a), 53);
}

function main() {
  const results = [];

  results.push(test("TEST 1 — Absolute ID mapping", () => {
    assert.strictEqual(idWithin("_3e"), 15);
    assert.strictEqual(idWithin("^3f"), 25);
    assert.strictEqual(idWithin("_2B"), 47);
  }));

  results.push(test("TEST 2 — Interval preservation", () => {
    const a = idWithin("_3e");
    const b = idWithin("^3f");
    assert.strictEqual(b - a, 10);
    for (const delta of [-4, -5, 4, 5]) {
      const outA = transposeToken("_3e", delta).outToken;
      const outB = transposeToken("^3f", delta).outToken;
      const newInterval = idWithin(outB) - idWithin(outA);
      assert.strictEqual(newInterval, 10);
    }
  }));

  results.push(test("TEST 3 — Single note transposition (microtone)", () => {
    const down4 = transposeToken("^3f", -4).outToken;
    assert.strictEqual(idWithin(down4), 21);
    assert.strictEqual(down4, "^3E");

    const down5 = transposeToken("^3f", -5).outToken;
    assert.strictEqual(idWithin(down5), 20);
    assert.strictEqual(down5, "^2E");
  }));

  results.push(test("TEST 4 — Key signature transposition preserves intervals", () => {
    const input = "K:C _2B _3e ^3f";
    const { tonic, tokens } = (() => {
      const parts = input.replace(/^K:/, "").trim().split(/\s+/);
      return { tonic: parts[0], tokens: parts.slice(1) };
    })();
    const inIds = [tonic, ...tokens].map(idWithin);
    const inIntervals = inIds.slice(1).map((v) => mod(v - inIds[0], 53));

    for (const delta of [-4, -5, 4, 5]) {
      const out = transposeKeyField(input, delta);
      const parts = out.replace(/^K:/, "").trim().split(/\s+/);
      const outIds = parts.map(idWithin);
      const outIntervals = outIds.slice(1).map((v) => mod(v - outIds[0], 53));
      assert.deepStrictEqual(outIntervals, inIntervals);
    }
  }));

  results.push(test("TEST 5 — Fragment transposition (real music) preserves IDs and intervals", () => {
    const input = [
      "%%MIDI temperamentequal 53",
      "K:C _2B_3e ^3f",
      "c d e f",
    ].join("\n");

    const noteSeq = (text) => {
      const tokens = [];
      for (const line of text.split("\n")) {
        if (/^\s*%/.test(line)) continue;
        if (/^\s*K:/.test(line)) continue;
        for (const part of line.split(/\s+/)) {
          if (!part) continue;
          try {
            tokenToAbs53AndAbs12(part);
            tokens.push(part);
          } catch {}
        }
      }
      return tokens;
    };

    const inNotes = noteSeq(input);
    assert.deepStrictEqual(inNotes, ["c", "d", "e", "f"]);
    const inIds = inNotes.map(idWithin);
    const inIntervals = inIds.slice(1).map((v, i) => mod(v - inIds[i], 53));

    for (const delta of [-4, -5]) {
      const out = transposeFragment(input, delta);
      const outNotes = noteSeq(out);
      assert.strictEqual(outNotes.length, inNotes.length);

      // Each output token maps to the computed ID after truth-scale shift.
      for (let i = 0; i < inNotes.length; i += 1) {
        const expectedId = abs53ToIdWithinOctave(tokenToAbs53AndAbs12(inNotes[i]).abs53 + delta);
        assert.strictEqual(idWithin(outNotes[i]), expectedId, `note #${i + 1} ID mismatch`);
      }

      // Intervals preserved automatically.
      const outIds = outNotes.map(idWithin);
      const outIntervals = outIds.slice(1).map((v, i) => mod(v - outIds[i], 53));
      assert.deepStrictEqual(outIntervals, inIntervals);
    }
  }));

  results.push(test("TEST 6 — European semitone sequence (B mode) is deterministic and octave-consistent", () => {
    const up = europeanSemitoneDeltaSequence53(12, { direction: "up" });
    const down = europeanSemitoneDeltaSequence53(12, { direction: "down" });
    assert.strictEqual(up.length, 12);
    assert.strictEqual(down.length, 12);
    assert.strictEqual(up.reduce((a, b) => a + b, 0), 53);
    assert.strictEqual(down.reduce((a, b) => a + b, 0), -53);
    assert.strictEqual(up.filter((d) => d === 5).length, 5);
    assert.strictEqual(up.filter((d) => d === 4).length, 7);
    assert.deepStrictEqual(down, up.map((d) => -d));
  }));

  results.push(test("TEST 7 — B mode preserves comma intervals across repeated semitone steps", () => {
    // Pick two microtonal notes with a nontrivial interval.
    const a = tokenToAbs53AndAbs12("_3e").abs53;
    const b = tokenToAbs53AndAbs12("^3f").abs53;
    const interval = b - a;
    for (const steps of [1, 2, 7, 12, 24]) {
      const a2 = applyEuropeanSemitoneStepsAbs53(a, steps, { direction: "up" });
      const b2 = applyEuropeanSemitoneStepsAbs53(b, steps, { direction: "up" });
      assert.strictEqual(b2 - a2, interval);
    }
  }));

  results.push(test("TEST 8 — Spelling preference favors ^4/_5 pair", () => {
    // ID 4 (C# in B-mode base) can be spelled as ^4C or _5D; default should prefer ^4.
    assert.strictEqual(formatTokenFromAbs53AndAbs12(4, 1, {}), "^4C");
    // If a caller prefers flats, choose the flat-side enharmonic spelling.
    assert.strictEqual(formatTokenFromAbs53AndAbs12(4, 1, { preferFlats: true }), "_5D");
  }));

  const ok = results.every(Boolean);
  process.exitCode = ok ? 0 : 1;
}

main();
