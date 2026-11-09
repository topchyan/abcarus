#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { build } from "esbuild";
import { join, resolve } from "node:path";

const bundled = await build({
  entryPoints: [resolve("src/renderer/playback/count_in_model.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const { accentNativePlaybeats, configureNativePlaybeats } = await import(`data:text/javascript;base64,${encoded}`);

const source = "%abc-2.2\nX:1\nM:6/8\nL:1/8\nQ:3/8=60\nK:C\nC6|D6|";
const injected = configureNativePlaybeats(source, { enabled: true, measures: 2 });
assert.equal(injected.active, true);
assert.equal(injected.source, "abcarus");
assert.equal(injected.measures, 2);
assert.equal(injected.insertedLength, "%%playbeats 2\n".length);
assert.match(injected.text, /%abc-2\.2\n%%playbeats 2\nX:1/);

const existing = configureNativePlaybeats(`%%playbeats 3 38\n${source}`, { enabled: true, measures: 2 });
assert.equal(existing.source, "abc");
assert.equal(existing.measures, 3);
assert.equal(existing.insertedLength, 0);
assert.equal((existing.text.match(/%%playbeats/g) || []).length, 1);

const disabled = configureNativePlaybeats(source, { enabled: false, measures: 2 });
assert.equal(disabled.active, false);
assert.equal(disabled.text, source);

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  navigator: {},
  alert() {},
  prompt() {},
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  exports: {},
  module: { exports: {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const abc2svgDir = process.env.ABC2SVG_CANDIDATE_DIR
  ? resolve(process.env.ABC2SVG_CANDIDATE_DIR)
  : resolve("third_party/abc2svg");
for (const file of [join(abc2svgDir, "abc2svg-1.js"), join(abc2svgDir, "snd-1.js")]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
}
const abc = new sandbox.abc2svg.Abc({ img_out() {}, err() {}, errmsg() {} });
abc.tosvg("count-in", injected.text);
const tune = abc.tunes[0];
sandbox.ToAudio().add(tune[0], tune[1], tune[3]);
assert.equal(accentNativePlaybeats(tune[0]), 2);
const beats = [];
const seen = new Set();
for (let symbol = tune[0]; symbol && !seen.has(symbol); symbol = symbol.ts_next) {
  seen.add(symbol);
  if (
    symbol.p_v
    && symbol.p_v.id === "_beats"
    && Array.isArray(symbol.notes)
    && Number(symbol.dur) > 0
  ) beats.push(symbol);
}
assert.equal(beats.length, 4, "two bars of 6/8 must use two compound beats per bar");
assert.deepEqual(beats.map((beat) => beat.notes.length), [2, 1, 2, 1]);

console.log("count-in harness: all tests passed");
