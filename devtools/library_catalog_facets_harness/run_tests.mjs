#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { extractTuneHeader, parseCatalogGroupValues } = require("../../src/main/library_metadata.js");

async function importRendererModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const { buildGroupEntries, getGroupValues } = await importRendererModule("src/renderer/library/group_entries.js");
const { applyLibraryTextFilter } = await importRendererModule("src/renderer/library/sorting_filtering.js");
const { createLibraryViewStore } = await importRendererModule("src/renderer/library/store.js");
const {
  addFacetToAllTunes,
  addFacetToTuneText,
  replaceFacetInFileText,
  replacePlainHeaderFieldInFileText,
} = await importRendererModule("src/renderer/library/catalog_metadata_transform.js");

const featureBundle = await build({
  entryPoints: ["src/renderer/library/catalog_metadata_feature.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const featureEncoded = Buffer.from(featureBundle.outputFiles[0].text, "utf8").toString("base64");
const { createCatalogMetadataFeature } = await import(`data:text/javascript;base64,${featureEncoded}`);

const mergeBundle = await build({
  entryPoints: ["src/renderer/library/catalog_category_merge_controller.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const mergeEncoded = Buffer.from(mergeBundle.outputFiles[0].text, "utf8").toString("base64");
const { replaceCatalogCategoryTransaction } = await import(`data:text/javascript;base64,${mergeEncoded}`);

const lines = [
  "X:1",
  "T:Example",
  "G:[makam] Hicaz",
  "G:[form] Longa",
  "G:[makam] Hicaz",
  "G:[cultural] Ottoman Armenian",
  "G:Legacy collection",
  "K:C",
  "",
  "C D E F|",
];
const header = extractTuneHeader(lines, 0, lines.length - 1);
assert.deepEqual(header.groups, [
  "[makam] Hicaz",
  "[form] Longa",
  "[cultural] Ottoman Armenian",
  "Legacy collection",
]);
assert.equal(header.group, "[makam] Hicaz", "legacy group remains the first G value");
assert.deepEqual(header.catalogFacets, {
  makam: ["Hicaz"],
  form: ["Longa"],
  cultural: ["Ottoman Armenian"],
});
assert.deepEqual(parseCatalogGroupValues(["[custom] Value", "unstructured"]), { custom: ["Value"] });
const multiComposerHeader = extractTuneHeader(["X:3", "T:Collaboration", "C:First", "C:Second", "K:C", ""], 0, 5);
assert.equal(multiComposerHeader.composer, "First");
assert.deepEqual(multiComposerHeader.composers, ["First", "Second"]);
const arbitraryHeader = extractTuneHeader([
  "  X:4",
  "T:Field search",
  "N:Collected in Yerevan",
  "Z:First transcriber",
  "Z:Second transcriber",
  "K:Am",
  "A B c d|",
], 0, 6);
assert.deepEqual(arbitraryHeader.headerFields.N, ["Collected in Yerevan"]);
assert.deepEqual(arbitraryHeader.headerFields.Z, ["First transcriber", "Second transcriber"]);
assert.deepEqual(arbitraryHeader.headerFields.X, ["4"], "indented ABC fields must be indexed");
assert.deepEqual(parseCatalogGroupValues(["[constructor] ignored"]), {}, "unsafe object keys are not indexed");
assert.deepEqual(
  extractTuneHeader(["X:2", "T:No facets", "M:9/8", "K:D", ""], 0, 4).catalogFacets,
  {},
  "technical notation fields must not imply catalog metadata",
);

const tune = {
  id: "/music/a.abc::0",
  title: "Example",
  key: "C",
  groups: header.groups,
  catalogFacets: {
    ...header.catalogFacets,
    makam: ["Hicaz", "Uşşak"],
  },
  headerFields: arbitraryHeader.headerFields,
};
assert.deepEqual(getGroupValues(tune, "makam"), ["Hicaz", "Uşşak"]);

const files = [{
  path: "/music/a.abc",
  basename: "a.abc",
  updatedAtMs: 10,
  headerText: "I:abc-charset utf-8\nN:File-wide archive note\n",
  tunes: [tune],
}];
const makamEntries = buildGroupEntries(files, "makam");
assert.deepEqual(makamEntries.map((entry) => entry.label), ["Makam: Hicaz", "Makam: Uşşak"]);
assert.ok(makamEntries.every((entry) => entry.tunes.length === 1));
assert.equal(buildGroupEntries(files, "period")[0].label, "Period: Unknown");
const customTune = { ...tune, catalogFacets: { custom_style: ["Old Name"] } };
const customEntry = buildGroupEntries([{ ...files[0], tunes: [customTune] }], "custom_style")[0];
assert.equal(customEntry.label, "Custom style: Old Name");
assert.equal(customEntry.facet, "custom_style");
assert.equal(customEntry.value, "Old Name");
const composerEntry = buildGroupEntries([{ ...files[0], tunes: [{ ...tune, composer: "Old Composer" }] }], "composer")[0];
assert.equal(composerEntry.categoryType, "field:C");
assert.equal(composerEntry.field, "C");
assert.deepEqual(
  buildGroupEntries([{ ...files[0], tunes: [{ ...tune, composer: "First", composers: ["First", "Second"] }] }], "composer").map((entry) => entry.value),
  ["First", "Second"],
);
const plainGroupTune = { ...tune, groups: ["Collection", "[makam] Hicaz"] };
const plainGroupEntries = buildGroupEntries([{ ...files[0], tunes: [plainGroupTune] }], "group");
assert.equal(plainGroupEntries.find((entry) => entry.value === "Collection").categoryType, "field:G");
assert.equal(plainGroupEntries.find((entry) => entry.label === "G: [makam] Hicaz").categoryType, undefined);

assert.equal(applyLibraryTextFilter(files, "ottoman").length, 1, "facet values must be searchable");
assert.equal(applyLibraryTextFilter(files, "uşşak").length, 1, "repeated facet values must be searchable");
assert.equal(applyLibraryTextFilter(files, "yerevan").length, 1, "arbitrary header values must be searchable");
assert.equal(applyLibraryTextFilter(files, "N: collected").length, 1, "field-qualified search must allow whitespace after the colon");
assert.equal(applyLibraryTextFilter(files, "Z:second transcriber").length, 1, "repeated arbitrary fields must be searchable by tag");
assert.equal(applyLibraryTextFilter(files, "D:second transcriber").length, 0, "field-qualified search must respect the requested tag");
assert.equal(applyLibraryTextFilter(files, "N: archive note").length, 1, "file-header fields must apply to the file's tunes");
assert.equal(applyLibraryTextFilter(files, "Z:archive note").length, 0, "file-header field qualification must be respected");
assert.equal(applyLibraryTextFilter(files, "unrelated").length, 0);

globalThis.window = {};
const catalogRows = createLibraryViewStore({
  getIndex: () => ({ root: "/music", files }),
  safeBasename: (value) => String(value).split("/").pop(),
}).getModalRows();
assert.ok(catalogRows[0].searchText.includes("ottoman armenian"), "Catalog search must include facet values");
assert.ok(catalogRows[0].searchText.includes("z: second transcriber"), "Catalog search must include qualified arbitrary fields");
assert.ok(catalogRows[0].searchText.includes("n: file-wide archive note"), "Catalog search must include file-header fields");

const tuneText = "X:1\r\nT:Example\r\nM:4/4\r\nK:C\r\nC D E F|\r\n";
const addedToTune = addFacetToTuneText(tuneText, "makam", "Hicaz");
assert.equal(addedToTune.changed, true);
assert.ok(addedToTune.text.includes("M:4/4\r\nG:[makam] Hicaz\r\nK:C"), "tag must be inserted before K and preserve CRLF");
assert.equal(addFacetToTuneText(addedToTune.text, "makam", "hicaz").changed, false, "exact tags are idempotent");
const secondMakam = addFacetToTuneText(addedToTune.text, "makam", "Uşşak");
assert.deepEqual(secondMakam.existingValues, ["Hicaz"], "another value is reported before being added");

const fileText = [
  "% file header",
  "X:1",
  "T:One",
  "K:C",
  "C|",
  "",
  "X:2",
  "T:Two",
  "G:[period] Contemporary",
  "K:D",
  "D|",
  "",
].join("\n");
const addedToFile = addFacetToAllTunes(fileText, "period", "Contemporary");
assert.equal(addedToFile.total, 2);
assert.equal(addedToFile.changed, 1);
assert.equal(addedToFile.existing, 1);
assert.equal((addedToFile.text.match(/G:\[period\] Contemporary/g) || []).length, 2);
assert.ok(addedToFile.text.startsWith("% file header\nX:1"), "file preamble must remain unchanged");

const mergeText = [
  "G:[makam] File header must stay",
  "X:1",
  "T:One",
  "G:[makam] Kürdîli Hicazkâr",
  "G:[form] Kürdîli Hicazkâr",
  "K:C",
  "C|",
  "",
  "X:2",
  "T:Two",
  "G:[makam] Kürdilihicazkâr",
  "G:[makam] Kürdîli Hicazkâr",
  "K:D",
  "D|",
  "",
].join("\r\n");
const merged = replaceFacetInFileText(mergeText, "makam", "Kürdîli Hicazkâr", "Kürdilihicazkâr");
assert.equal(merged.tunesChanged, 2);
assert.equal((merged.text.match(/G:\[makam\] Kürdilihicazkâr/g) || []).length, 2, "merge must leave one target tag per tune");
assert.ok(merged.text.startsWith("G:[makam] File header must stay\r\n"), "file-header metadata must not be rewritten");
assert.ok(merged.text.includes("G:[form] Kürdîli Hicazkâr\r\n"), "another facet namespace must not be rewritten");
assert.ok(!/(?<!\r)\n/.test(merged.text), "CRLF must be preserved");

const plainFieldText = [
  "C:File Header Composer",
  "X:1",
  "T:One",
  "C:Old Composer",
  "G:Old Collection",
  "G:[cultural] Old Collection",
  "K:C",
  "C|",
  "",
].join("\n");
const composerReplaced = replacePlainHeaderFieldInFileText(plainFieldText, "C", "Old Composer", "Canonical Composer");
assert.equal(composerReplaced.tunesChanged, 1);
assert.ok(composerReplaced.text.includes("C:Canonical Composer\n"));
assert.ok(composerReplaced.text.startsWith("C:File Header Composer\n"), "file-header C must remain unchanged");
const groupReplaced = replacePlainHeaderFieldInFileText(plainFieldText, "G", "Old Collection", "Canonical Collection");
assert.ok(groupReplaced.text.includes("G:Canonical Collection\n"));
assert.ok(groupReplaced.text.includes("G:[cultural] Old Collection\n"), "namespaced G must remain unchanged during plain G replacement");
assert.equal(replacePlainHeaderFieldInFileText(plainFieldText, "T", "One", "Two").ok, false, "non-allowlisted fields must fail closed");

const transactionFiles = {
  "/music/a.abc": "X:1\nT:A\nG:[makam] Old\nK:C\nC|\n",
  "/music/b.abc": "X:1\nT:B\nG:[makam] Old\nK:D\nD|\n",
};
const transactionIndex = {
  files: Object.keys(transactionFiles).map((path) => ({
    path,
    tunes: [{ catalogFacets: { makam: ["Old"] } }],
  })),
};
const successfulStore = { ...transactionFiles };
const transactionResult = await replaceCatalogCategoryTransaction({
  libraryIndex: transactionIndex,
  facet: "makam",
  sourceValue: "Old",
  targetValue: "New",
  readFile: async (path) => ({ ok: true, data: successfulStore[path] }),
  writeFile: async (path, data, options) => {
    assert.equal(successfulStore[path], options.expectedData);
    successfulStore[path] = data;
    return { ok: true };
  },
});
assert.equal(transactionResult.filesChanged, 2);
assert.equal(transactionResult.tunesChanged, 2);
assert.ok(Object.values(successfulStore).every((text) => text.includes("G:[makam] New")));

const rollbackStore = { ...transactionFiles };
let rejectedSecondWrite = false;
await assert.rejects(() => replaceCatalogCategoryTransaction({
  libraryIndex: transactionIndex,
  facet: "makam",
  sourceValue: "Old",
  targetValue: "New",
  readFile: async (path) => ({ ok: true, data: rollbackStore[path] }),
  writeFile: async (path, data, options) => {
    if (path === "/music/b.abc" && !rejectedSecondWrite) {
      rejectedSecondWrite = true;
      return { ok: false, error: "simulated failure" };
    }
    assert.equal(rollbackStore[path], options.expectedData);
    rollbackStore[path] = data;
    return { ok: true };
  },
}), /simulated failure/);
assert.deepEqual(rollbackStore, transactionFiles, "a later write failure must roll back earlier files");

const composerStore = { "/music/c.abc": "X:1\nT:C\nC:Old Composer\nK:C\nC|\n" };
const composerResult = await replaceCatalogCategoryTransaction({
  libraryIndex: { files: [{ path: "/music/c.abc", tunes: [{ composer: "Old Composer" }] }] },
  category: { field: "C" },
  sourceValue: "Old Composer",
  targetValue: "Canonical Composer",
  readFile: async (path) => ({ ok: true, data: composerStore[path] }),
  writeFile: async (path, data, options) => {
    assert.equal(composerStore[path], options.expectedData);
    composerStore[path] = data;
    return { ok: true };
  },
});
assert.equal(composerResult.category.field, "C");
assert.ok(composerStore["/music/c.abc"].includes("C:Canonical Composer"));

function fakeElement(value = "") {
  return {
    value,
    disabled: false,
    textContent: "",
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    addEventListener() {},
    focus() {},
  };
}

let written = null;
let selectedTuneId = "";
let appliedCurrentText = "";
const fileScope = fakeElement("file");
const feature = createCatalogMetadataFeature({
  elements: {
    modal: fakeElement(),
    applyButton: fakeElement(),
    scopeSelect: fileScope,
    facetSelect: fakeElement("period"),
    valueInput: fakeElement("Contemporary"),
    preview: fakeElement(),
  },
  state: {
    getActiveFileEntry: () => ({ path: "/music/a.abc" }),
    getActiveTuneMeta: () => ({ indexInFile: 2 }),
    getEditorText: () => "X:2\nT:Two\nK:D\nD|\n",
  },
  actions: {
    applyCurrentTuneText: (text) => { appliedCurrentText = text; },
    readFile: async () => ({ ok: true, data: fileText }),
    writeFile: async (_path, text, options) => {
      written = { text, options };
      return { ok: true };
    },
    requireCleanForFileOp: async () => true,
    withFileLock: async (_path, operation) => operation(),
    refreshLibraryFile: async () => ({ tunes: [{ id: "one" }, { id: "two" }] }),
    selectTune: async (id) => { selectedTuneId = id; },
    setStatus() {},
    showSaveError: async () => {},
    showToast() {},
  },
});
await feature.apply();
assert.ok(written && written.text.includes("G:[period] Contemporary"), "file scope must write transformed text");
assert.equal(written.options.expectedData, fileText, "file scope must guard its atomic write with the disk text read");
assert.equal(selectedTuneId, "two", "file scope must reload the same tune index after writing");
fileScope.value = "tune";
await feature.apply();
assert.ok(appliedCurrentText.includes("G:[period] Contemporary"), "current-tune scope must update the editor text");

console.log("library catalog facets harness: all tests passed");
