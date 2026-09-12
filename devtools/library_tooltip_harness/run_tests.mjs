#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/renderer/library/tree_view.js", "utf8");
const encoded = Buffer.from(source, "utf8").toString("base64");
const { buildFileTooltip, buildGroupTooltip, buildTuneTooltip } = await import(`data:text/javascript;base64,${encoded}`);
const count = (entry) => entry.tuneCount ?? entry.tunes.length;

const fileTooltip = buildFileTooltip({
  label: "songs.abc",
  id: "/music/songs.abc",
  tuneCount: 12,
  updatedAtMs: 0,
}, count);
assert.match(fileTooltip, /Path: \/music\/songs\.abc/);
assert.match(fileTooltip, /Tunes: 12/);

const groupTooltip = buildGroupTooltip({
  label: "C: Komitas",
  tunes: [
    { filePath: "/music/one.abc" },
    { filePath: "/music/one.abc" },
    { filePath: "/music/two.abc" },
  ],
}, count);
assert.match(groupTooltip, /Tunes: 3/);
assert.match(groupTooltip, /one\.abc \(2\)/);
assert.match(groupTooltip, /two\.abc/);

const tuneTooltip = buildTuneTooltip({
  filePath: "/music/one.abc",
  xNumber: "42",
  title: "A Tune",
  composer: "Composer",
  key: "Am",
  meter: "6/8",
  unitLength: "1/8",
  tempo: "1/4=120",
  rhythm: "R: Folk",
  source: "Book",
  origin: "Armenia",
  groups: ["Dance", "Set"],
}, "42: A Tune - Composer - Am");
assert.match(tuneTooltip, /File: one\.abc/);
assert.match(tuneTooltip, /X: 42/);
assert.match(tuneTooltip, /Meter: 6\/8/);
assert.match(tuneTooltip, /Tempo: 1\/4=120/);
assert.match(tuneTooltip, /Group: Dance, Set/);

console.log("library tooltip harness: all tests passed");
