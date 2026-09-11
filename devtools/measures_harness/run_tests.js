#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

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
  const norm = (s) => String(s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
  const a = norm(actual);
  const b = norm(expected);
  if (a !== b) {
    const diff = diffFirstMismatch(a, b);
    fail(`${name}: output mismatch\n${diff}`);
  }
}

function assertNoBlankLinesOutsideBegintext(name, text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  let inTextBlock = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*%%\s*begintext\b/i.test(line)) inTextBlock = true;
    // Ignore the trailing empty line from a final newline.
    const isTrailing = i === lines.length - 1;
    if (!inTextBlock && !isTrailing && line.trim() === "") {
      fail(`${name}: blank line at L${i + 1} (blank lines terminate tunes in ABC)`);
    }
    if (inTextBlock && /^\s*%%\s*endtext\b/i.test(line)) inTextBlock = false;
  }
}

async function runCase({ name, fixture, expected, measuresPerLine }) {
  const input = readText(path.join(FIXTURES, fixture));
  const expectedText = readText(path.join(EXPECTED, expected));
  const { transformMeasuresPerLine, normalizeMeasuresLineBreaks } = await import("../../src/renderer/measures.mjs");
  const actual = normalizeMeasuresLineBreaks(transformMeasuresPerLine(input, measuresPerLine));
  assertNoBlankLinesOutsideBegintext(name, actual);
  assertEqualBytes(name, actual, expectedText);
}

async function runReflowRoundtripCase({ name, fixture, measuresPerLineA, measuresPerLineB }) {
  const input = readText(path.join(FIXTURES, fixture));
  const { transformMeasuresPerLine, normalizeMeasuresLineBreaks } = await import("../../src/renderer/measures.mjs");
  const once = normalizeMeasuresLineBreaks(transformMeasuresPerLine(input, measuresPerLineA));
  const twice = normalizeMeasuresLineBreaks(transformMeasuresPerLine(once, measuresPerLineB));
  const direct = normalizeMeasuresLineBreaks(transformMeasuresPerLine(input, measuresPerLineB));
  assertNoBlankLinesOutsideBegintext(name, twice);
  assertEqualBytes(name, twice, direct);
}

async function runLinebreakMarkerCase({ name, fixture, expected }) {
  const input = readText(path.join(FIXTURES, fixture));
  const expectedText = readText(path.join(EXPECTED, expected));
  const { transformMeasuresByLinebreakMarker, normalizeMeasuresLineBreaks } = await import("../../src/renderer/measures.mjs");
  const actual = normalizeMeasuresLineBreaks(transformMeasuresByLinebreakMarker(input));
  assertNoBlankLinesOutsideBegintext(name, actual);
  assertEqualBytes(name, actual, expectedText);
}

async function main() {
  const cases = [
    {
      name: "TEST 1: Hasapia measures-per-line=1 (no blank lines)",
      fixture: "hasapia-mandilatos.abc",
      expected: "hasapia-mandilatos_mpl1.abc",
      measuresPerLine: 1,
    },
    {
      name: "TEST 2: begintext preserves blank lines (no blank lines outside)",
      fixture: "begintext-blank-lines.abc",
      expected: "begintext-blank-lines_mpl1.abc",
      measuresPerLine: 1,
    },
    {
      name: "TEST 3: leading |: is not treated as a full measure",
      fixture: "repeat-start.abc",
      expected: "repeat-start_mpl2.abc",
      measuresPerLine: 2,
    },
    {
      name: "TEST 4: inline [K:..] is preserved when reflowing measures",
      fixture: "inline-key-change.abc",
      expected: "inline-key-change_mpl2.abc",
      measuresPerLine: 2,
    },
    {
      name: "TEST 5: reflow by I:linebreak marker keeps marker comments",
      fixture: "linebreak-marker.abc",
      expected: "linebreak-marker_reflow.abc",
    },
    {
      name: "TEST 6: marker comment line merges with pending music",
      fixture: "linebreak-marker-comment-merge.abc",
      expected: "linebreak-marker-comment-merge_reflow.abc",
    },
    {
      name: "TEST 7: middle inline comment does not break marker merge",
      fixture: "linebreak-marker-middle-comment.abc",
      expected: "linebreak-marker-middle-comment_reflow.abc",
    },
    {
      name: "TEST 8: explicit lyric bars follow measures-per-line",
      fixture: "lyrics-explicit-bars.abc",
      expected: "lyrics-explicit-bars_mpl1.abc",
      measuresPerLine: 1,
    },
    {
      name: "TEST 9: lyric bars can be inferred from note anchors",
      fixture: "lyrics-inferred-bars.abc",
      expected: "lyrics-inferred-bars_mpl1.abc",
      measuresPerLine: 1,
    },
    {
      name: "TEST 10: mismatched lyrics fail closed",
      fixture: "lyrics-mismatch.abc",
      expected: "lyrics-mismatch_mpl1.abc",
      measuresPerLine: 1,
    },
  ];

  for (const c of cases) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (c.measuresPerLine) await runCase(c);
      else await runLinebreakMarkerCase(c);
      console.log(`% PASS ${c.name}`);
    } catch (e) {
      console.log(`% FAIL ${c.name}`);
      const msg = String(e && e.message ? e.message : e);
      for (const line of msg.split(/\r\n|\n|\r/)) {
        console.log(`% ${line}`);
      }
      process.exitCode = 1;
    }
  }

  try {
    await runReflowRoundtripCase({
      name: "TEST 11: reflow 1 bar/line -> 2 bars/line changes output",
      fixture: "hasapia-mandilatos.abc",
      measuresPerLineA: 1,
      measuresPerLineB: 2,
    });
    console.log("% PASS TEST 11: reflow 1 bar/line -> 2 bars/line changes output");
  } catch (e) {
    console.log("% FAIL TEST 11: reflow 1 bar/line -> 2 bars/line changes output");
    const msg = String(e && e.message ? e.message : e);
    for (const line of msg.split(/\r\n|\n|\r/)) {
      console.log(`% ${line}`);
    }
    process.exitCode = 1;
  }

  try {
    await runReflowRoundtripCase({
      name: "TEST 12: lyric-aware reflow 1 bar/line -> 2 bars/line is stable",
      fixture: "lyrics-explicit-bars.abc",
      measuresPerLineA: 1,
      measuresPerLineB: 2,
    });
    console.log("% PASS TEST 12: lyric-aware reflow 1 bar/line -> 2 bars/line is stable");
  } catch (e) {
    console.log("% FAIL TEST 12: lyric-aware reflow 1 bar/line -> 2 bars/line is stable");
    const msg = String(e && e.message ? e.message : e);
    for (const line of msg.split(/\r\n|\n|\r/)) {
      console.log(`% ${line}`);
    }
    process.exitCode = 1;
  }

  try {
    const { transformMeasuresPerLine, normalizeMeasuresLineBreaks } = await import("../../src/renderer/measures.mjs");
    const xml2abcVolta = [
      "X:1",
      "M:2/4",
      "L:1/8",
      "I:linebreak $",
      "K:C",
      "C2 D2 | E2 F2 | G2 A2 | B2 c2 |1$ d2 e2 :|2 f2 g2 |]",
    ].join("\n");
    const reflowed = normalizeMeasuresLineBreaks(transformMeasuresPerLine(xml2abcVolta, 4));
    assert.match(reflowed, /B2 c2 \|1\$\nd2 e2 :\|2 f2 g2 \|\]/);
    assert.doesNotMatch(reflowed, /B2 c2 \|\n1\$/);
    console.log("% PASS TEST 13: xml2abc volta token and linebreak stay attached");
  } catch (e) {
    console.log("% FAIL TEST 13: xml2abc volta token and linebreak stay attached");
    console.log(`% ${String(e && e.message ? e.message : e)}`);
    process.exitCode = 1;
  }
}

main();
