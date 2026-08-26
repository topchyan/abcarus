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

const lyricFitBundle = await build({
  entryPoints: ["src/renderer/abc/lyric_fit.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const lyricFitEncoded = Buffer.from(lyricFitBundle.outputFiles[0].text, "utf8").toString("base64");
const { analyzeLyricFitInText } = await import(`data:text/javascript;base64,${lyricFitEncoded}`);

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

function makeGridLine(cells, finalSeparator = "|") {
  const separatorColumns = [12, 28, 46];
  let out = cells[0];
  for (let i = 0; i < separatorColumns.length; i += 1) {
    const separator = i === separatorColumns.length - 1 ? finalSeparator : "|";
    const pipeOffset = separator.lastIndexOf("|");
    out = out.padEnd(separatorColumns[i] - pipeOffset, " ");
    out += separator;
    if (i + 1 < cells.length) out += ` ${cells[i + 1]}`;
  }
  return out;
}

const manuallyAligned = [
  "X:2",
  "T:Preserve manual grid",
  "M:3/4",
  "L:1/4",
  "K:Am",
  makeGridLine(['"Am"z>GA', "(A/G/)A2", '"F"z>GA', ""]),
  makeGridLine(["w:One two", "three", "four", ""]),
  makeGridLine(['"Am"z>GA', "GA2", '"F"zGA', ""], ":|"),
  makeGridLine(["w:New row", "lyrics", "stay", ""]),
].join("\n");

assert.equal(
  alignBarsInText(manuallyAligned),
  manuallyAligned,
  "an already aligned music/lyrics grid must remain byte-for-byte unchanged",
);

const once = alignBarsInText(source);
assert.equal(
  alignBarsInText(once),
  once,
  "aligning an already aligned result must be idempotent",
);

const pickupSource = [
  "X:3",
  "T:Pickup rows",
  "M:4/4",
  "L:1/4",
  "K:C",
  "G || C D E F | G A B c |",
  "w: Up | first full bar | second full bar |",
  "C D E F | G A B c | c B A G |",
  "w: a | b | c |",
  "w: d | e | f |",
].join("\n");
const pickupAligned = alignBarsInText(pickupSource).split("\n");
assert.doesNotMatch(
  pickupAligned[7],
  /^\s/,
  "a pickup on the first music row must not add a phantom pickup column to later rows",
);
for (const lyric of pickupAligned.slice(8, 10)) {
  assert.deepEqual(
    getBarSeparatorColumns(lyric),
    getBarSeparatorColumns(pickupAligned[7]),
    "all lyric lines after a pickup row must align with their own music row",
  );
}

const lyricWidthSource = [
  "X:4",
  "M:4/4",
  "L:1/4",
  "K:C",
  '"^Brass Band Style" C D | E F |',
  "w: exceptionally long lyric text | short |",
  "C D | E F |",
  "w: a | b |",
].join("\n");
const lyricWidthLines = alignBarsInText(lyricWidthSource).split("\n");
const sharedColumns = getBarSeparatorColumns(lyricWidthLines[4]);
for (const line of lyricWidthLines.slice(5, 8)) {
  assert.deepEqual(
    getBarSeparatorColumns(line),
    sharedColumns,
    "the longest music or lyric cell must define the shared tune grid",
  );
}
assert.match(
  lyricWidthLines[4],
  /"\^Brass Band Style"/,
  "spaces inside quoted annotations must not be split into alignment tokens",
);
assert.equal(
  alignBarsInText(lyricWidthLines.join("\n")),
  lyricWidthLines.join("\n"),
  "joint music/lyrics alignment must be idempotent",
);

const fitReport = analyzeLyricFitInText([
  "X:5",
  "M:4/4",
  "L:1/4",
  "K:C",
  "C D E F | G A B c |",
  "w: one two | three four five six |",
].join("\n"));
assert.equal(fitReport.checkedBars, 2);
assert.equal(fitReport.mismatches.length, 1);
assert.deepEqual(
  { notes: fitReport.mismatches[0].notes, lyrics: fitReport.mismatches[0].lyrics },
  { notes: 4, lyrics: 2 },
  "lyric-fit diagnostics must compare note anchors with lyric advances per bar",
);

const leadingRepeatSource = [
  "X:6",
  "M:6/8",
  "L:1/8",
  "K:Dm",
  "|: d2 ^c c2 B | B2 A A>^GF |",
  "F>ED E3 | ^G>AB GAF |",
].join("\n");
const leadingRepeatLines = alignBarsInText(leadingRepeatSource).split("\n");
assert.match(
  leadingRepeatLines[4],
  /^\|:\s+d2/,
  "a leading repeat must remain at the start of its music line without a phantom blank column",
);

const doubleRepeatSource = [
  "X:7",
  "M:6/8",
  "L:1/8",
  "K:Dm",
  "E>F^G EFD | E>D^C D3 :: S D3 D3 |",
  "F F2 E3 | D>A,D A,D2 | S D3 D3 |",
].join("\n");
const doubleRepeatLines = alignBarsInText(doubleRepeatSource).split("\n");
assert.equal(
  doubleRepeatLines[4].indexOf("S D3 D3"),
  doubleRepeatLines[5].indexOf("S D3 D3"),
  "a :: separator must reserve the same separator slot before the following bar",
);

console.log("align bars harness: all tests passed");
