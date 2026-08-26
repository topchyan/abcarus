import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/renderer/app/ui/tune_list_export_controller.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const {
  buildTuneListText,
  discoverTuneListColumns,
  extractTuneListItemsFromAbc,
  sortTuneListItems,
} = await import(`data:text/javascript;base64,${encoded}`);

const source = [
  "X:2",
  'T:Song, "Second"',
  "C:Composer B",
  "K:G",
  "G:[makam] Uşşak",
  "G:[form] Şarkı",
  "N:A note",
  "G A B c |",
  "",
  "X:1",
  "T:First Song",
  "C:Composer A",
  "C:Lyricist A",
  "M:4/4",
  "K:C",
  "G:[makam] Hicaz",
  "C D E F |",
].join("\n");

const items = extractTuneListItemsFromAbc(source, { sourceFile: "songs.abc" });
assert.equal(items.length, 2);
assert.deepEqual(items[0].fields["G:makam"], ["Uşşak"]);
assert.deepEqual(items[0].fields["G:form"], ["Şarkı"]);
assert.deepEqual(items[1].fields.C, ["Composer A", "Lyricist A"]);

const columns = discoverTuneListColumns(items);
for (const column of ["X", "T", "C", "K", "M", "N", "G:makam", "G:form", "source"]) {
  assert.ok(columns.includes(column), `expected dynamic column ${column}`);
}

const csv = buildTuneListText(items, { columns: ["T", "C", "K", "G:makam"] });
assert.equal(
  csv,
  [
    "T,C,K,G:[makam]",
    '"Song, ""Second""",Composer B,G,Uşşak',
    "First Song,Composer A; Lyricist A,C,Hicaz",
  ].join("\n"),
);

const sorted = sortTuneListItems(items, "G:makam", "asc");
assert.equal(sorted[0].fields.T[0], "First Song");

const plain = buildTuneListText(items, {
  format: "plain",
  columns: ["number", "T", "C", "K"],
});
assert.match(plain, /^1\. Song, "Second" — Composer B — G$/m);

console.log("tune list export harness: all tests passed");
