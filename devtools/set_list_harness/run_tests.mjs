import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import { build } from "esbuild";

async function importBundledModule(filePath) {
  const result = await build({ entryPoints: [filePath], bundle: true, format: "esm", platform: "node", write: false });
  const encoded = Buffer.from(result.outputFiles[0].text, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const {
  SET_LIST_RESOLUTION,
  SET_LIST_SCHEMA,
  convertLegacySetListState,
  hashSetListAbc,
  insertSetListDocumentItem,
  moveSetListDocumentItems,
  normalizeSetListDocument,
  resolveSetListItem,
  removeSetListDocumentItem,
  serializeSetListDocument,
} = await importBundledModule("src/renderer/tools/set_list/set_list_document.js");

const {
  createEmptySetListDocument,
  createSetListSession,
  normalizeRecentPaths,
} = await importBundledModule("src/renderer/tools/set_list/set_list_session.js");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(`devtools/set_list_harness/fixtures/${name}`, "utf8"));
}

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === "function") {
    return result.then(() => console.log(`% PASS ${name}`));
  }
  console.log(`% PASS ${name}`);
  return result;
}

test("moves removes and inserts immutably", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };
  const source = [a, b, c];
  assert.deepEqual(moveSetListDocumentItems(source, 0, 2).map((item) => item.id), ["b", "c", "a"]);
  assert.equal(moveSetListDocumentItems(source, 4, 0), source);
  assert.deepEqual(removeSetListDocumentItem(source, 1).map((item) => item.id), ["a", "c"]);
  assert.equal(removeSetListDocumentItem(source, -1), source);
  assert.deepEqual(insertSetListDocumentItem(source, { id: "x" }, 1).map((item) => item.id), ["a", "x", "b", "c"]);
  assert.deepEqual(insertSetListDocumentItem(source, { id: "x" }, 99).map((item) => item.id), ["a", "b", "c", "x"]);
  assert.equal(insertSetListDocumentItem(source, null, 0), source);
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
  assert.equal(converted.items[0].embeddedHeaderAbc, undefined);
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

await test("hashes ABC portably across line endings", async () => {
  const lf = await hashSetListAbc("X:1\nK:C\nC|\n", webcrypto);
  const crlf = await hashSetListAbc("X:1\r\nK:C\r\nC|\r\n", webcrypto);
  assert.equal(lf, crlf);
  assert.match(lf, /^sha256:[0-9a-f]{64}$/);
});

test("normalizes recent Set List paths without duplicate documents", () => {
  assert.deepEqual(normalizeRecentPaths(["/a.json", "/b.json", "/a.json", ""]), ["/a.json", "/b.json"]);
});

await test("Set List session saves atomically and detects an external change", async () => {
  const files = new Map();
  const storage = new Map();
  let sequence = 0;
  const session = createSetListSession({
    makeId: () => `id-${++sequence}`,
    nowIso: () => "2026-08-20T12:00:00.000Z",
    readStorage: (key) => storage.get(key) || null,
    writeStorage: (key, value) => { storage.set(key, value); return true; },
    readFile: async (path) => files.has(path)
      ? { ok: true, data: files.get(path) }
      : { ok: false, error: "missing" },
    writeFile: async (path, data, options = {}) => {
      if (Object.prototype.hasOwnProperty.call(options, "expectedData") && files.get(path) !== options.expectedData) {
        return { ok: false, conflict: true, error: "File changed on disk." };
      }
      files.set(path, data);
      return { ok: true };
    },
  });
  session.mutate((document) => { document.title = "Concert"; });
  assert.equal(session.getState().dirty, true);
  assert.equal((await session.save("/sets/concert.abcarus-setlist.json")).ok, true);
  assert.equal(session.getState().dirty, false);
  assert.deepEqual(session.getState().recentPaths, ["/sets/concert.abcarus-setlist.json"]);
  session.mutate((document) => { document.items.push({ id: "item", tune: { title: "A" } }); });
  files.set("/sets/concert.abcarus-setlist.json", "external change");
  const conflict = await session.save();
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.equal(session.getState().dirty, true);
});

await test("Set List session opens a canonical portable document", async () => {
  const source = serializeSetListDocument(readFixture("self-contained.abcarus-setlist.json"));
  const session = createSetListSession({
    makeId: () => "generated",
    readFile: async () => ({ ok: true, data: source }),
  });
  const result = await session.open("/sets/saved.abcarus-setlist.json");
  assert.equal(result.ok, true);
  assert.equal(session.getState().document.title, "Saved Performance");
  assert.equal(session.getState().dirty, false);
});
