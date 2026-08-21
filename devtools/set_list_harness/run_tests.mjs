import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

async function importBundledModule(filePath) {
  const result = await build({ entryPoints: [filePath], bundle: true, format: "esm", platform: "node", write: false });
  const encoded = Buffer.from(result.outputFiles[0].text, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const {
  DEFAULT_SET_LIST_HEADER_TEXT,
  insertSetListItemAt,
  moveSetListItems,
  normalizeSetListPageBreaks,
  parseSetListSavedState,
  removeSetListItemAt,
  serializeSetListState,
} = await importBundledModule("src/renderer/tools/set_list/set_list_model.js");

const {
  SET_LIST_RESOLUTION,
  SET_LIST_SCHEMA,
  convertLegacySetListState,
  normalizeSetListDocument,
  resolveSetListItem,
  serializeSetListDocument,
} = await importBundledModule("src/renderer/tools/set_list/set_list_document.js");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(`devtools/set_list_harness/fixtures/${name}`, "utf8"));
}

function test(name, fn) {
  fn();
  console.log(`% PASS ${name}`);
}

const fixedNow = () => 1234;
const fixedRandom = () => 0.5;

test("normalizes saved Set List state", () => {
  const state = parseSetListSavedState({
    version: "1",
    pageBreaks: "auto",
    compact: true,
    headerText: "%%stretchlast 0\n",
    items: [
      { id: "a", title: "A", text: "X:1\nT:A\nK:C\nC\n", addedAtMs: 10 },
      { id: "empty", text: "   " },
      { title: "B", composer: "C", sourceTuneId: "t2", text: "X:2\nT:B\nK:C\nD\n" },
    ],
  }, { now: fixedNow, random: fixedRandom });
  assert.equal(state.pageBreaks, "auto");
  assert.equal(state.compact, true);
  assert.equal(state.headerText, "%%stretchlast 0\n");
  assert.equal(state.items.length, 2);
  assert.equal(state.items[0].id, "a");
  assert.equal(state.items[1].id, "1234::8");
  assert.equal(state.items[1].addedAtMs, 1234);
});

test("rejects invalid saved state and defaults fields", () => {
  assert.equal(parseSetListSavedState(null), null);
  assert.equal(parseSetListSavedState({ version: "2" }), null);
  const state = parseSetListSavedState({ version: "1", pageBreaks: "bad", items: [] });
  assert.equal(state.pageBreaks, "perTune");
  assert.equal(state.compact, false);
  assert.equal(state.headerText, DEFAULT_SET_LIST_HEADER_TEXT);
});

test("serializes state with strict fields", () => {
  const payload = serializeSetListState({
    now: fixedNow,
    pageBreaks: "none",
    compact: true,
    headerText: "H\n",
    items: [{ id: "i", title: "Title", text: "ABC", addedAtMs: 5, extra: "ignored" }],
  });
  assert.deepEqual(Object.keys(payload.items[0]), [
    "id",
    "sourceTuneId",
    "sourcePath",
    "xNumber",
    "title",
    "composer",
    "headerText",
    "text",
    "addedAtMs",
  ]);
  assert.equal(payload.savedAtMs, 1234);
  assert.equal(payload.pageBreaks, "none");
});

test("moves removes and inserts immutably", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };
  const source = [a, b, c];
  assert.deepEqual(moveSetListItems(source, 0, 2).map((item) => item.id), ["b", "c", "a"]);
  assert.equal(moveSetListItems(source, 4, 0), source);
  assert.deepEqual(removeSetListItemAt(source, 1).map((item) => item.id), ["a", "c"]);
  assert.equal(removeSetListItemAt(source, -1), source);
  assert.deepEqual(insertSetListItemAt(source, { id: "x" }, 1).map((item) => item.id), ["a", "x", "b", "c"]);
  assert.deepEqual(insertSetListItemAt(source, { id: "x" }, 99).map((item) => item.id), ["a", "b", "c", "x"]);
  assert.equal(insertSetListItemAt(source, null, 0), source);
});

test("normalizes page break modes", () => {
  assert.equal(normalizeSetListPageBreaks("perTune"), "perTune");
  assert.equal(normalizeSetListPageBreaks("none"), "none");
  assert.equal(normalizeSetListPageBreaks("auto"), "auto");
  assert.equal(normalizeSetListPageBreaks("continuous", "none"), "none");
});

test("accepts lightweight and self-contained portable documents", () => {
  const lightweight = normalizeSetListDocument(readFixture("lightweight.abcarus-setlist.json"));
  const contained = normalizeSetListDocument(readFixture("self-contained.abcarus-setlist.json"));
  assert.equal(lightweight.schema, SET_LIST_SCHEMA);
  assert.equal("embeddedAbc" in lightweight.items[0], false);
  assert.match(contained.items[0].embeddedAbc, /^X:12/m);
  assert.equal(contained.items[0].performance.transposeSemitones, 2);
  assert.equal(contained.items[0].export.pageBreakBefore, true);
});

test("keeps duplicate tune occurrences as independent items", () => {
  const source = readFixture("lightweight.abcarus-setlist.json");
  const duplicate = structuredClone(source.items[0]);
  duplicate.id = "item-encore";
  duplicate.performance.transposeSemitones = 2;
  source.items.push(duplicate);
  const document = normalizeSetListDocument(source);
  assert.equal(document.items.length, 2);
  assert.equal(document.items[0].tune.contentHash, document.items[1].tune.contentHash);
  assert.notEqual(document.items[0].id, document.items[1].id);
  assert.equal(document.items[1].performance.transposeSemitones, 2);
});

test("portable document serialization drops unknown fields", () => {
  const source = readFixture("lightweight.abcarus-setlist.json");
  source.internalWindowState = { selectedTab: 4 };
  source.items[0].runtimeResolution = "FOUND_EXACT";
  const serialized = serializeSetListDocument(source);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.internalWindowState, undefined);
  assert.equal(parsed.items[0].runtimeResolution, undefined);
  assert.equal(serialized.endsWith("\n"), true);
});

test("converts the current snapshot workspace without losing ABC", () => {
  let id = 0;
  const converted = convertLegacySetListState({
    version: "1",
    pageBreaks: "auto",
    compact: true,
    headerText: "%%stretchlast 0\n",
    items: [{
      id: "old-item",
      sourcePath: "/music/a.abc",
      xNumber: "7",
      title: "Old Tune",
      composer: "Composer",
      text: "X:7\nT:Old Tune\nK:C\nC|\n",
    }],
  }, {
    makeId: () => `generated-${++id}`,
    nowIso: () => "2026-08-20T12:00:00.000Z",
  });
  assert.equal(converted.title, "Imported Set List");
  assert.equal(converted.print.pageBreaks, "auto");
  assert.equal(converted.items[0].id, "old-item");
  assert.match(converted.items[0].embeddedAbc, /^X:7/m);
  assert.equal(converted.items[0].tune.source.pathHint, "/music/a.abc");
});

test("resolves exact content independently of its old path", () => {
  const item = readFixture("lightweight.abcarus-setlist.json").items[0];
  const result = resolveSetListItem(item, [{
    sourcePath: "/moved/session.abc",
    xNumber: "18",
    title: "Cooley's",
    composer: "Traditional",
    contentHash: "sha256:cooleys-v1",
  }]);
  assert.equal(result.status, SET_LIST_RESOLUTION.FOUND_EXACT);
  assert.equal(result.candidate.sourcePath, "/moved/session.abc");
});

test("reports modified missing and ambiguous resolution fixtures", () => {
  const cases = readFixture("resolution-cases.json");
  for (const fixture of Object.values(cases)) {
    const result = resolveSetListItem(fixture.item, fixture.candidates);
    assert.equal(result.status, fixture.expected);
  }
  assert.equal(Boolean(cases.missingEmbedded.item.embeddedAbc), true);
  assert.equal(Boolean(cases.missingLinked.item.embeddedAbc), false);
});

test("rejects unknown Set List schema versions", () => {
  assert.equal(normalizeSetListDocument({ schema: "abcarus.setlist.v2", id: "future" }), null);
});
