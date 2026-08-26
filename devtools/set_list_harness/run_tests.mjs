import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import { build } from "esbuild";
import Ajv2020 from "ajv/dist/2020.js";
import vm from "node:vm";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

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

const {
  createSetListFeature,
} = await importBundledModule("src/renderer/tools/set_list/set_list_feature.js");

const {
  getDropInsertionIndex,
  getMoveTargetIndex,
  getSetListDragKind,
} = await importBundledModule("src/renderer/tools/set_list/set_list_controller.js");

const {
  buildSetListExportAbc,
  composeSetListRenderHeader,
  getPrintableSetListItems,
  namespaceSetListSvgIds,
  shouldInjectNewPageBeforeTune,
} = await importBundledModule("src/renderer/print/set_list_markup.js");

const {
  createSetListRendererAdapter,
} = await importBundledModule("src/renderer/tools/set_list/set_list_renderer_adapter.js");

const {
  buildSetListPerformanceView,
  clampSetListTransposeSemitones,
  mergeSetListSnapshotAfterSourceSave,
} = await importBundledModule("src/renderer/tools/set_list/set_list_performance_model.js");

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

await test("print marker skips only SVG bounds normalization", async () => {
  const mainSource = fs.readFileSync("src/main/index.js", "utf8");
  const buildPrintHtmlSource = mainSource.match(
    /function buildPrintHtml\(svgMarkup, fontBase64, suggestedName\) \{[\s\S]*?\n\}(?=\n\nasync function withPrintWindow)/,
  );
  assert.ok(buildPrintHtmlSource, "buildPrintHtml source must be available to the focused print test");

  const context = {
    normalizeSvgFontUrlsForPrint: (value) => value,
    injectFontIntoSvg: (value) => value,
    sanitizePrintFileBaseName: () => "Print",
    escapeHtmlText: (value) => value,
    printPageBodyPadding: () => "24px",
  };
  vm.runInNewContext(`${buildPrintHtmlSource[0]}\nthis.buildPrintHtml = buildPrintHtml;`, context);

  const normalHtml = context.buildPrintHtml("<svg></svg>", "", "Print");
  const diagnosticHtml = context.buildPrintHtml(
    "<!--abcarus:no-normalize-svg-bounds-->\n<svg></svg>",
    "",
    "Print",
  );
  async function countSvgBoundsReads(html) {
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(script, "print HTML must include its preparation script");
    let boundsReads = 0;
    const svg = {
      getBBox: () => {
        boundsReads += 1;
        return { x: 0, y: 0, width: 10, height: 10 };
      },
      viewBox: { baseVal: { x: 0, y: 0, width: 10, height: 10 } },
      getAttribute: () => "10",
      setAttribute: () => {},
    };
    const printContext = {
      document: {
        fonts: null,
        querySelectorAll: (selector) => selector === "svg" ? [svg] : [],
      },
      window: {},
    };
    vm.runInNewContext(script[1], printContext);
    await printContext.window._rasterReadyPromise;
    return boundsReads;
  }
  assert.equal(await countSvgBoundsReads(normalHtml), 1);
  assert.equal(await countSvgBoundsReads(diagnosticHtml), 0);

});

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

test("maps Set List drops to stable before and after positions", () => {
  const row = {
    dataset: { index: "2" },
    getBoundingClientRect: () => ({ top: 100, height: 40 }),
  };
  assert.deepEqual(getDropInsertionIndex(row, 110, 5), { index: 2, edge: "before" });
  assert.deepEqual(getDropInsertionIndex(row, 130, 5), { index: 3, edge: "after" });
  assert.deepEqual(getDropInsertionIndex(null, 0, 5), { index: 5, edge: "end" });
  assert.equal(getMoveTargetIndex(0, 3, 5), 2);
  assert.equal(getMoveTargetIndex(4, 1, 5), 1);
  assert.equal(getMoveTargetIndex(2, 3, 5), 2);
});

test("Library tune drops override stale internal Set List drag state", () => {
  const eventWithTypes = (...types) => ({ dataTransfer: { types } });
  assert.equal(getSetListDragKind(eventWithTypes("application/x-abcarus-tune-id"), 3), "library-tune");
  assert.equal(getSetListDragKind(eventWithTypes("application/x-abcarus-set-list-item"), null), "set-list-item");
  assert.equal(getSetListDragKind(eventWithTypes("text/plain"), 3), "set-list-item");
  assert.equal(getSetListDragKind(eventWithTypes("text/plain"), null), "");
});

test("accepts lightweight and self-contained portable documents", () => {
  const lightweight = normalizeSetListDocument(readFixture("lightweight.abcarus-setlist.json"));
  const contained = normalizeSetListDocument(readFixture("self-contained.abcarus-setlist.json"));
  assert.equal(lightweight.schema, SET_LIST_SCHEMA);
  assert.equal("embeddedAbc" in lightweight.items[0], false);
  assert.match(contained.items[0].embeddedAbc, /^X:12/m);
  assert.equal(contained.items[0].snapshot.capturedAt, "2026-08-20T12:00:00.000Z");
  assert.equal(contained.items[0].snapshot.sourceFileModifiedAt, "2026-08-20T11:55:00.000Z");
  assert.equal(contained.items[0].performance.transposeSemitones, 2);
  assert.equal(contained.items[0].export.pageBreakBefore, true);
});

test("canonical portable documents satisfy the shared JSON Schema", () => {
  const schema = readFixture("../../../docs/schemas/abcarus.setlist.v1.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  for (const name of ["lightweight.abcarus-setlist.json", "self-contained.abcarus-setlist.json"]) {
    const canonical = JSON.parse(serializeSetListDocument(readFixture(name)));
    assert.equal(validate(canonical), true, `${name}: ${ajv.errorsText(validate.errors)}`);
  }
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

test("migrates pre-freeze locator aliases and writes only canonical fields", () => {
  const source = readFixture("lightweight.abcarus-setlist.json");
  source.name = "Legacy Gig";
  delete source.title;
  source.items[0].tune.tuneIdHint = "/legacy/session.abc::7";
  source.items[0].tune.sourcePath = "/legacy/session.abc";
  source.items[0].tune.xNumber = "7";
  source.items[0].tune.group = "Session";
  delete source.items[0].tune.source;
  delete source.items[0].tune.groups;
  source.items[0].links = [{ type: "youtube", url: "https://example.com", label: "Legacy" }];
  source.items[0].export = { include: false, pageBreakBefore: true };
  source.items[0].performance.tempoScale = 0;
  const parsed = JSON.parse(serializeSetListDocument(source));
  assert.equal(parsed.title, "Legacy Gig");
  assert.deepEqual(parsed.items[0].tune.source, {
    locatorHint: "/legacy/session.abc::7",
    pathHint: "/legacy/session.abc",
    xNumberHint: "7",
  });
  assert.deepEqual(parsed.items[0].tune.groups, ["Session"]);
  assert.deepEqual(parsed.items[0].links, [{ kind: "youtube", url: "https://example.com", label: "Legacy" }]);
  assert.deepEqual(parsed.items[0].export, { includeInPdf: false, pageBreakBefore: true });
  assert.equal(parsed.items[0].performance.tempoScale, 1);
});

test("defines item export inclusion and page-break precedence", () => {
  const items = [
    { text: "X:1\nK:C\nC|\n", export: { includeInPdf: true, pageBreakBefore: false } },
    { text: "X:2\nK:C\nD|\n", export: { includeInPdf: false, pageBreakBefore: true } },
  ];
  assert.deepEqual(getPrintableSetListItems(items), [items[0]]);
  assert.equal(shouldInjectNewPageBeforeTune(items[1].text, {
    mode: "none",
    idx: 1,
    pageBreakBefore: true,
  }), true);
  assert.equal(shouldInjectNewPageBeforeTune(items[1].text, {
    mode: "perTune",
    idx: 1,
    pageBreakBefore: false,
  }), true);
  assert.equal(shouldInjectNewPageBeforeTune(items[0].text, {
    mode: "none",
    idx: 0,
    pageBreakBefore: true,
  }), false);
  const abc = buildSetListExportAbc({
    items,
    pageBreaks: "none",
    ensureXNumberInAbc: (text) => text,
  });
  assert.match(abc, /C\|\n%%newpage\nX:2/);
  const leadingEmpty = buildSetListExportAbc({
    items: [
      { text: "", export: { pageBreakBefore: false } },
      { text: "X:9\nK:C\nE|\n", export: { pageBreakBefore: true } },
    ],
    pageBreaks: "perTune",
    ensureXNumberInAbc: (text, number) => text.replace(/^X:\d+/m, `X:${number}`),
  });
  assert.match(leadingEmpty, /^X:1/m);
  assert.doesNotMatch(leadingEmpty, /^%%newpage/m);
});

test("applies the Set List Header after the embedded source header", () => {
  const header = composeSetListRenderHeader(
    "%%leftmargin .5cm\n%%rightmargin .5cm\n",
    "% Generated by ABCarus Set List\n%%leftmargin 0\n%%rightmargin 0\n",
  );
  assert.ok(header.indexOf("%%leftmargin .5cm") < header.indexOf("%%leftmargin 0"));
  assert.ok(header.indexOf("%%rightmargin .5cm") < header.indexOf("%%rightmargin 0"));
  assert.equal(header.match(/Generated by ABCarus Set List/g)?.length, 1);
});

test("namespaces SVG definitions once per Set List tune", () => {
  const tuneSvg = [
    '<svg><defs><path id="stdef" d="m0 0h779.5"/></defs><use xlink:href="#stdef"/></svg>',
    '<svg><use href="#stdef"/><g style="clip-path:url(#stdef)"></g></svg>',
  ].join("\n");
  const first = namespaceSetListSvgIds(tuneSvg, "set-list-1");
  const second = namespaceSetListSvgIds(tuneSvg, "set-list-2");
  assert.match(first, /id="set-list-1-stdef"/);
  assert.match(first, /xlink:href="#set-list-1-stdef"/);
  assert.match(first, /href="#set-list-1-stdef"/);
  assert.match(first, /url\(#set-list-1-stdef\)/);
  assert.doesNotMatch(first, /["#]stdef/);
  assert.match(second, /id="set-list-2-stdef"/);
  assert.notEqual(first, second);
});

await test("captures only the source file preamble as embedded header context", async () => {
  const content = "%%titleformat T\nX:1\nT:First\nK:C\nC|\n%%between-tunes\nX:2\nT:Second\nK:D\nD|\n";
  const secondStart = content.indexOf("X:2");
  const adapter = createSetListRendererAdapter({
    findTuneById: () => ({
      file: { path: "/music/set.abc", headerText: "%%titleformat T\n", updatedAtMs: 1787227200000 },
      tune: { startOffset: secondStart, endOffset: content.length, xNumber: "2", title: "Second" },
    }),
    readFile: async () => ({ ok: true, data: content }),
  });
  const captured = await adapter.buildItemForTuneId("/music/set.abc::2");
  assert.equal(captured.headerText, "%%titleformat T\n");
  assert.match(captured.text, /^X:2/m);
  assert.doesNotMatch(captured.headerText, /between-tunes/);
  assert.equal(captured.sourceFileModifiedAt, "2026-08-20T12:00:00.000Z");
});

await test("docked Set List activation uses the canonical Library tune pipeline", async () => {
  const abc = "X:7\nT:Source Tune\nC:Composer\nK:C\nC|\n";
  const contentHash = await hashSetListAbc(abc, webcrypto);
  const tune = {
    id: "/music/source.abc::0",
    startOffset: 0,
    endOffset: abc.length,
    xNumber: "7",
    title: "Source Tune",
    composer: "Composer",
  };
  const file = { path: "/music/source.abc", tunes: [tune] };
  const selected = [];
  const adapter = createSetListRendererAdapter({
    findTuneById: (id) => id === tune.id ? { tune, file } : null,
    getLibraryIndex: () => ({ files: [file] }),
    getTuneText: async () => abc,
    selectTune: async (id) => { selected.push(id); return { ok: true }; },
  });
  const item = {
    tune: {
      title: "Source Tune",
      composer: "Composer",
      source: { locatorHint: tune.id, pathHint: file.path, xNumberHint: "7" },
      contentHash,
    },
    embeddedAbc: abc,
  };
  const result = await adapter.activateItemSource(item);
  assert.equal(result.status, SET_LIST_RESOLUTION.FOUND_EXACT);
  assert.deepEqual(selected, [tune.id]);
});

await test("mobile relative source paths activate the matching Desktop tune", async () => {
  const abc = "X:35\nT:Նազանի\nK:C\nC|\n";
  const tune = { id: "/music/Armenian_Tunes.abc::35", xNumber: "35", title: "Նազանի", composer: "" };
  const file = { path: "/music/Armenian_Tunes.abc", tunes: [tune] };
  const selected = [];
  const adapter = createSetListRendererAdapter({
    getLibraryIndex: () => ({ files: [file] }),
    getTuneText: async () => abc,
    selectTune: async (id) => { selected.push(id); return { ok: true }; },
  });
  const result = await adapter.activateItemSource({
    tune: {
      title: "Նազանի",
      composer: "",
      source: { pathHint: "Armenian_Tunes.abc", xNumberHint: "35" },
      contentHash: "",
    },
  });
  assert.equal(result.status, SET_LIST_RESOLUTION.FOUND_STRONG);
  assert.equal(result.matchedBy, "source");
  assert.deepEqual(selected, [tune.id]);
});

await test("dirty source tune cannot be snapshotted without saving", async () => {
  let reads = 0;
  const adapter = createSetListRendererAdapter({
    getCurrentDocDirty: () => true,
    getActiveTuneId: () => "active",
    confirmUnsavedChanges: async () => "dont_save",
    findTuneById: () => ({ file: { path: "/music/a.abc" }, tune: { startOffset: 0, endOffset: 8, xNumber: "1" } }),
    readFile: async () => { reads += 1; return { ok: true, data: "X:1\nK:C\n" }; },
  });
  assert.equal(await adapter.buildItemForTuneId("active"), null);
  assert.equal(reads, 0);
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

await test("legacy Set List remains clean until the user changes it", async () => {
  const legacyState = {
    version: "1",
    items: [{
      id: "old-item",
      sourcePath: "/music/a.abc",
      xNumber: "7",
      title: "Old Tune",
      text: "X:7\nT:Old Tune\nK:C\nC|\n",
    }],
  };
  let confirmCalls = 0;
  const feature = createSetListFeature({
    readStorage: (key) => key === "abcarus.setList.v1" ? legacyState : null,
    writeStorage: () => true,
    getActiveTuneId: () => "/music/b.abc::1",
    buildItemForTuneId: async () => ({
      sourcePath: "/music/b.abc",
      xNumber: "1",
      title: "New Tune",
      text: "X:1\nT:New Tune\nK:C\nD|\n",
      sourceFileModifiedAt: "2026-08-20T11:55:00.000Z",
    }),
    nowIso: () => "2026-08-20T12:00:00.000Z",
    confirmUnsavedChanges: async () => {
      confirmCalls += 1;
      return "cancel";
    },
  });

  assert.equal(feature.getState().title, "Previous Set List");
  assert.equal(feature.getState().dirty, false);
  feature.open();
  feature.close();
  assert.equal(await feature.prepareToLeave("opening another Set List"), true);
  assert.equal(confirmCalls, 0);

  assert.equal(await feature.addTuneById("/music/b.abc::1"), true);
  assert.equal(feature.getState().items.length, 2);
  assert.equal(feature.getState().dirty, true);
  assert.equal(await feature.prepareToLeave("opening another Set List"), false);
  assert.equal(confirmCalls, 1);
});

test("practice notes remain visible and editable in the Set List state", () => {
  const feature = createSetListFeature({
    readStorage: (key) => key === "abcarus.setList.v1" ? {
      version: "1",
      items: [{ id: "item", sourcePath: "/music/a.abc", xNumber: "1", title: "Tune", text: "X:1\nK:C\nC|\n" }],
    } : null,
    writeStorage: () => true,
  });
  assert.equal(feature.updatePracticeNote(0, "  Start softly.  "), true);
  assert.equal(feature.getState().items[0].notes, "Start softly.");
  assert.equal(feature.getState().dirty, true);
});

await test("clearing a practice note is saved before leaving the Set List", async () => {
  const sourcePath = "/sets/practice.abcarus-setlist.json";
  const source = serializeSetListDocument({
    schema: SET_LIST_SCHEMA,
    id: "practice-list",
    title: "Practice",
    createdAt: "2026-08-25T10:00:00.000Z",
    updatedAt: "2026-08-25T10:00:00.000Z",
    print: { headerText: "", pageBreaks: "perTune", compact: false },
    items: [{
      id: "practice-item",
      tune: {
        title: "Tune",
        composer: "",
        key: "C",
        source: { locatorHint: "/music/a.abc::1", pathHint: "/music/a.abc", xNumberHint: "1" },
        contentHash: "",
      },
      performance: { transposeSemitones: 0, tempoScale: 1 },
      notes: "Start softly.",
      links: [],
      export: { includeInPdf: true, pageBreakBefore: false },
    }],
  });
  let written = "";
  const feature = createSetListFeature({
    showOpenSetListDialog: async () => sourcePath,
    readFile: async () => ({ ok: true, data: source }),
    writeFile: async (_path, data) => { written = data; return { ok: true }; },
    confirmUnsavedChanges: async () => "save",
  });

  assert.equal(await feature.openSetList(), true);
  assert.equal(feature.updatePracticeNote(0, ""), true);
  assert.equal(feature.getState().dirty, true);
  assert.equal(await feature.prepareToLeave("quitting"), true);
  assert.equal(JSON.parse(written).items[0].notes, "");
  assert.equal(feature.getState().dirty, false);
});

await test("Set List performance transposition is saved per occurrence", async () => {
  const files = new Map();
  let applied = null;
  const feature = createSetListFeature({
    readStorage: (key) => key === "abcarus.setList.v1" ? {
      version: "1",
      items: [{ id: "item", sourcePath: "/music/a.abc", xNumber: "1", title: "Tune", text: "X:1\nK:C\nC|\n" }],
    } : null,
    writeStorage: () => true,
    showSaveSetListDialog: async () => "/sets/performance.abcarus-setlist.json",
    writeFile: async (path, data) => { files.set(path, data); return { ok: true }; },
    confirmPerformanceSave: async () => "set_list",
    activateItemSource: async () => ({
      status: "FOUND_EXACT",
      opened: true,
      candidate: { tuneId: "/music/a.abc::1" },
    }),
    buildItemForTuneId: async () => ({
      sourcePath: "/music/a.abc",
      xNumber: "1",
      title: "Tune",
      text: "X:1\nK:C\nC|\n",
      headerText: "",
    }),
    applyPerformanceView: async (view) => { applied = view; return true; },
  });
  assert.equal(await feature.updatePerformance(0, { transposeSemitones: 3 }), true);
  assert.equal(feature.getState().items[0].transposeSemitones, 3);
  assert.equal(applied.transposeSemitones, 3);
  assert.match(applied.text, /^K:Eb$/m);
  assert.equal(feature.getState().dirty, false);
  assert.match(files.get("/sets/performance.abcarus-setlist.json"), /"transposeSemitones": 3/);
  await feature.updatePerformance(0, { transposeSemitones: 200 });
  assert.equal(feature.getState().items[0].transposeSemitones, 48);
});

test("Set List performance view transposes notation and has a reversible original key", () => {
  const source = "X:1\nT:Tune\nK:C\n\"C\" C D E F|\n";
  const raised = buildSetListPerformanceView({ sourceText: source, transposeSemitones: 2 });
  assert.equal(raised.ok, true);
  assert.match(raised.text, /^K:D$/m);
  assert.match(raised.text, /"D" D E F G\|/);
  const original = buildSetListPerformanceView({ sourceText: source, transposeSemitones: 0 });
  assert.equal(original.text, source);
  assert.equal(clampSetListTransposeSemitones(200), 48);
});

test("saving performance to the original resets the override and preserves occurrence metadata", () => {
  const previous = {
    id: "occurrence",
    performance: { transposeSemitones: 3, tempoScale: 1.25 },
    notes: "Start softly",
    links: [{ kind: "web", url: "https://example.com" }],
    export: { includeInPdf: false, pageBreakBefore: true },
  };
  const replacement = {
    id: "new-id",
    tune: { title: "Transposed" },
    embeddedAbc: "X:1\nK:D\nD|\n",
    performance: { transposeSemitones: 0, tempoScale: 1 },
    notes: "",
    links: [],
    export: { includeInPdf: true, pageBreakBefore: false },
  };
  const merged = mergeSetListSnapshotAfterSourceSave(previous, replacement);
  assert.equal(merged.id, "occurrence");
  assert.equal(merged.performance.transposeSemitones, 0);
  assert.equal(merged.performance.tempoScale, 1.25);
  assert.equal(merged.notes, "Start softly");
  assert.deepEqual(merged.export, previous.export);
});

await test("opening a Set List occurrence applies one derived view to Editor Score and playback source", async () => {
  let applied = null;
  const performanceViewStates = [];
  const document = readFixture("self-contained.abcarus-setlist.json");
  document.items = [document.items[0]];
  document.items[0].id = "item";
  document.items[0].tune.source = {
    locatorHint: "/music/a.abc::1",
    pathHint: "/music/a.abc",
    xNumberHint: "1",
  };
  document.items[0].performance.transposeSemitones = 2;
  const feature = createSetListFeature({
    readStorage: (key) => key === "abcarus.setList.recentPaths.v1" ? ["/sets/performance.json"] : null,
    writeStorage: () => true,
    readFile: async (path) => path === "/sets/performance.json"
      ? { ok: true, data: serializeSetListDocument(document) }
      : { ok: false, error: "missing" },
    getActiveTuneId: () => "/music/a.abc::1",
    activateItemSource: async () => ({
      status: "FOUND_EXACT",
      opened: true,
      candidate: { tuneId: "/music/a.abc::1" },
    }),
    buildItemForTuneId: async () => ({
      sourcePath: "/music/a.abc",
      xNumber: "1",
      title: "Tune",
      text: "X:1\nT:Tune\nK:C\nC D|\n",
      headerText: "",
    }),
    applyPerformanceView: async (view) => { applied = view; return true; },
    onPerformanceViewStateChange: (context) => performanceViewStates.push(context),
  });
  assert.equal(await feature.restoreLastSetList(), true);
  assert.equal(await feature.activateItemAtIndex(0), true);
  assert.equal(applied.transposeSemitones, 2);
  assert.match(applied.text, /^K:D$/m);
  assert.match(applied.text, /D E\|/);
  assert.equal(feature.getActivePerformanceOverride().text, applied.text);
  assert.equal(feature.isPerformanceViewActive(), true);
  assert.equal(performanceViewStates.length, 1);
  assert.equal(performanceViewStates[0].sourceTuneId, "/music/a.abc::1");
  feature.clearActiveItem();
  assert.equal(feature.isPerformanceViewActive(), false);
  assert.equal(performanceViewStates.at(-1), null);
});

await test("Original Tune saves source then synchronizes and saves the Set List", async () => {
  let sourceText = "X:1\nT:Tune\nK:C\nC D|\n";
  let sourceSaveCalls = 0;
  const files = new Map();
  const feature = createSetListFeature({
    readStorage: (key) => key === "abcarus.setList.v1" ? {
      version: "1",
      items: [{ id: "item", sourcePath: "/music/a.abc", xNumber: "1", title: "Tune", text: sourceText }],
    } : null,
    writeStorage: () => true,
    getActiveTuneId: () => "/music/a.abc::1",
    activateItemSource: async () => ({
      status: "FOUND_EXACT",
      opened: true,
      candidate: { tuneId: "/music/a.abc::1" },
    }),
    buildItemForTuneId: async () => ({
      sourcePath: "/music/a.abc",
      xNumber: "1",
      title: "Tune",
      text: sourceText,
      headerText: "",
      sourceFileModifiedAt: "2026-08-25T12:00:00.000Z",
    }),
    savePerformanceToSource: async ({ text }) => {
      sourceSaveCalls += 1;
      sourceText = text;
      return true;
    },
    confirmPerformanceSave: async () => "original",
    showSaveSetListDialog: async () => "/sets/performance.abcarus-setlist.json",
    writeFile: async (path, data) => { files.set(path, data); return { ok: true }; },
    nowIso: () => "2026-08-25T12:00:00.000Z",
  });
  assert.equal(await feature.updatePerformance(0, { transposeSemitones: 2 }), true);
  assert.equal(sourceSaveCalls, 1);
  assert.match(sourceText, /^K:D$/m);
  const savedSetList = JSON.parse(files.get("/sets/performance.abcarus-setlist.json"));
  assert.equal(savedSetList.items[0].performance.transposeSemitones, 0);
  assert.match(savedSetList.items[0].embeddedAbc, /^K:D$/m);
  assert.equal(feature.getState().dirty, false);
});

test("resolves exact content independently of its old path", () => {
  const item = readFixture("lightweight.abcarus-setlist.json").items[0];
  const result = resolveSetListItem(item, [{
    sourcePath: "/moved/session.abc",
    xNumber: "18",
    title: "Cooley's",
    composer: "Traditional",
    contentHash: item.tune.contentHash,
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
  const fixture = readFixture("hash-contract.json");
  const base = await hashSetListAbc(fixture.baseText, webcrypto);
  assert.equal(base, fixture.expectedHash);
  for (const equivalent of fixture.equivalentLineEndings) {
    assert.equal(await hashSetListAbc(equivalent, webcrypto), base);
  }
  for (const variant of fixture.significantVariants) {
    const hash = await hashSetListAbc(variant.text, webcrypto);
    assert.equal(hash, variant.expectedHash, variant.name);
    assert.notEqual(hash, base, variant.name);
  }
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
  session.mutate((document) => { document.title = "Concert"; }, { reason: "title" });
  assert.equal(session.getState().dirty, true);
  assert.deepEqual(session.getState().dirtyReasons, ["title"]);
  session.mutate((document) => { document.print.compact = true; }, { reason: "layout" });
  session.mutate((document) => { document.print.pageBreaks = "auto"; }, { reason: "layout" });
  assert.deepEqual(session.getState().dirtyReasons, ["title", "layout"]);
  assert.equal((await session.save("/sets/concert.abcarus-setlist.json")).ok, true);
  assert.equal(session.getState().dirty, false);
  assert.deepEqual(session.getState().dirtyReasons, []);
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

await test("Set List panel visibility is persisted and restored", () => {
  const classes = new Set();
  const stored = new Map([["abcarus.setList.panelVisible.v1", true]]);
  const visibilityChanges = [];
  const feature = createSetListFeature({
    elements: {
      modal: {
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          contains: (name) => classes.has(name),
        },
        addEventListener: () => {},
        setAttribute: () => {},
      },
    },
    readStorage: (key) => stored.get(key) ?? null,
    writeStorage: (key, value) => {
      stored.set(key, value);
      return true;
    },
    onPanelVisibilityChange: (visible) => visibilityChanges.push(visible),
  });

  assert.equal(feature.restorePanelVisibility(), true);
  assert.equal(classes.has("open"), true);
  assert.deepEqual(visibilityChanges, [true]);

  feature.close();
  assert.equal(classes.has("open"), false);
  assert.equal(stored.get("abcarus.setList.panelVisible.v1"), false);
  assert.deepEqual(visibilityChanges, [true, false]);
  assert.equal(feature.restorePanelVisibility(), false);
});

await test("restores the last Set List and uses its title for print and ABC export", async () => {
  const sourceDocument = readFixture("self-contained.abcarus-setlist.json");
  sourceDocument.print.headerText = "%%leftmargin 0\n";
  const source = serializeSetListDocument(sourceDocument);
  let abcSuggestedName = "";
  let printSuggestedName = "";
  let renderedHeaderText = "";
  const feature = createSetListFeature({
    readStorage: (key) => key === "abcarus.setList.recentPaths.v1" ? ["/sets/saved.abcarus-setlist.json"] : null,
    writeStorage: () => true,
    readFile: async (path) => path === "/sets/saved.abcarus-setlist.json"
      ? { ok: true, data: source }
      : { ok: false, error: "missing" },
    saveAbc: async ({ suggestedName }) => {
      abcSuggestedName = suggestedName;
      return true;
    },
    renderItemToSvg: async ({ headerText }) => {
      renderedHeaderText = headerText;
      return { ok: true, svg: "<svg></svg>", blockText: "X:1\nK:C\nC|\n" };
    },
    outputPrint: async ({ suggestedName }) => {
      printSuggestedName = suggestedName;
      return { ok: true };
    },
    sanitizeFileBaseName: (value) => String(value || "").trim(),
  });

  assert.equal(await feature.restoreLastSetList(), true);
  assert.equal(feature.getState().title, "Saved Performance");
  assert.equal(feature.getState().filePath, "/sets/saved.abcarus-setlist.json");
  assert.equal(await feature.exportAbc(), true);
  assert.equal(abcSuggestedName, "Saved Performance.abc");
  assert.equal(await feature.runPrintAction("pdf"), true);
  assert.equal(printSuggestedName, "Saved Performance");
  assert.ok(renderedHeaderText.indexOf("%%stretchlast 1") < renderedHeaderText.indexOf("%%leftmargin 0"));
});
