#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

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
  ];

  for (const c of cases) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await runCase(c);
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
      name: "TEST 3: reflow 1 bar/line -> 2 bars/line changes output",
      fixture: "hasapia-mandilatos.abc",
      measuresPerLineA: 1,
      measuresPerLineB: 2,
    });
    console.log("% PASS TEST 3: reflow 1 bar/line -> 2 bars/line changes output");
  } catch (e) {
    console.log("% FAIL TEST 3: reflow 1 bar/line -> 2 bars/line changes output");
    const msg = String(e && e.message ? e.message : e);
    for (const line of msg.split(/\r\n|\n|\r/)) {
      console.log(`% ${line}`);
    }
    process.exitCode = 1;
  }
}

main();
