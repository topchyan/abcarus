import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/renderer/abc/align_bars.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const { alignBarsInText, getBarSeparatorColumns } = await import(`data:text/javascript;base64,${encoded}`);

const source = [
  "X:1",
  "T:Multiple lyric lines",
  "M:4/4",
  "L:1/4",
  "K:C",
  "C D E F | G A B c |",
  "w: a | b |",
  "w: c | d |",
].join("\n");

const lines = alignBarsInText(source).split("\n");
const music = lines[5];
for (const lyric of lines.slice(6, 8)) {
  assert.deepEqual(
    getBarSeparatorColumns(lyric),
    getBarSeparatorColumns(music),
    "every consecutive lyric line must align with its music line",
  );
}

console.log("align bars harness: all tests passed");
