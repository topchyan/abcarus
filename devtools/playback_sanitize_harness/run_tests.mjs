#!/usr/bin/env node
import { sanitizeAbcForPlayback } from "../../src/renderer/playback_sanitize.mjs";

function fail(msg) {
  throw new Error(msg);
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) fail(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(name, text, needle) {
  if (!String(text).includes(needle)) fail(`${name}: expected to include ${JSON.stringify(needle)}\n---\n${text}`);
}

function assertStartsWith(name, text, needle) {
  if (!String(text).startsWith(needle)) fail(`${name}: expected to start with ${JSON.stringify(needle)}\n---\n${text}`);
}

async function main() {
  // Case 1: leading `||:` becomes `|:` (offset-stable) after we enter body (after K:).
  {
    const input = [
      "X:1",
      "T:Repeat start normalization",
      "M:4/4",
      "L:1/8",
      "K:C",
      "||: CDEF | GABc :|",
      "",
    ].join("\n");
    const out = sanitizeAbcForPlayback(input);
    const lines = out.text.split(/\r\n|\n|\r/);
    assertEqual("case1 warnings", out.warnings.some((w) => w && w.kind === "repeat-start-doublebar"), true);
    assertStartsWith("case1 line", lines[5], "|:");
    // Preserve source length for mapping (we keep the same number of characters on the rewritten prefix).
    assertEqual("case1 length", lines[5].length, "||: CDEF | GABc :|".length);
  }

  // Case 2: do not rewrite `||:` before body (before K:).
  {
    const input = [
      "||: this is in the header and should not be touched",
      "X:1",
      "K:C",
      "CDEF|",
      "",
    ].join("\n");
    const out = sanitizeAbcForPlayback(input);
    const lines = out.text.split(/\r\n|\n|\r/);
    assertStartsWith("case2 header untouched", lines[0], "||:");
  }

  // Case 3: multi-repeat collapse keeps the double-repeat form.
  {
    const input = ["X:1", "K:C", "|::: CDEF ::::|", ""].join("\n");
    const out = sanitizeAbcForPlayback(input);
    assertIncludes("case3 collapse", out.text, "|::");
    assertIncludes("case3 collapse end", out.text, "::|");
  }

  console.log("% PASS playback sanitize harness");
}

main().catch((e) => {
  console.log("% FAIL playback sanitize harness");
  const msg = String(e && e.message ? e.message : e);
  for (const line of msg.split(/\r\n|\n|\r/)) console.log(`% ${line}`);
  process.exitCode = 1;
});

