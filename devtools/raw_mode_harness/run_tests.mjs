#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function importRendererModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const { createRawModeFeature } = await importRendererModule(resolve("src/renderer/tools/raw_mode/raw_mode_feature.js"));

const layoutCss = await readFile(resolve("src/renderer/style.css"), "utf8");
assert.match(
  layoutCss,
  /body\.raw-mode \.right-split \.editor-pane\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*1;/,
  "Raw mode must place the editor in the only visible split grid cell",
);

function createHarness({ readDelay = 0, confirmChoice = "cancel" } = {}) {
  const filePath = "/tmp/raw-mode.abc";
  const fullText = "%%abc-charset utf-8\nX:1\nT:One\nK:C\nC|\nX:2\nT:Two\nK:D\nD|\n";
  let currentDoc = { path: filePath, content: "X:1\nT:One\nK:C\nC|\n", dirty: false };
  let activeFilePath = filePath;
  let activeTuneId = `${filePath}::1`;
  let suppressDirty = false;
  let editorText = currentDoc.content;
  let ensureSafeCalls = 0;
  let readCalls = 0;
  let selectedTuneCalls = 0;
  let dirtyIndicator = false;
  let headerCleanCalls = 0;
  let rawContextCalls = 0;
  let confirmCalls = 0;
  let fileContextUpdates = 0;
  const writes = [];
  const rawButtonState = { active: false, ariaPressed: "false" };
  const rawButton = {
    classList: {
      toggle(name, enabled) {
        if (name === "toggle-active") rawButtonState.active = Boolean(enabled);
      },
    },
    setAttribute(name, value) {
      if (name === "aria-pressed") rawButtonState.ariaPressed = String(value);
    },
  };

  const tunes = [
    {
      id: `${filePath}::1`,
      path: filePath,
      basename: "raw-mode.abc",
      indexInFile: 1,
      xNumber: "1",
      title: "One",
      startOffset: 18,
      endOffset: 38,
    },
    {
      id: `${filePath}::2`,
      path: filePath,
      basename: "raw-mode.abc",
      indexInFile: 2,
      xNumber: "2",
      title: "Two",
      startOffset: 38,
      endOffset: fullText.length,
    },
  ];
  const fileEntry = { path: filePath, basename: "raw-mode.abc", headerEndOffset: 18, tunes };

  const feature = createRawModeFeature({
    elements: { rawButton },
    getCurrentDoc: () => currentDoc,
    patchCurrentDoc: (patch) => {
      currentDoc = { ...(currentDoc || {}), ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "dirty")) currentDoc.dirty = Boolean(patch.dirty);
      if (Object.prototype.hasOwnProperty.call(patch, "content")) currentDoc.content = String(patch.content || "");
    },
    getActiveFilePath: () => activeFilePath,
    beginRawFullFileContext: (next, source) => {
      rawContextCalls += 1;
      assert.equal(source, "raw_mode", "raw enter must use a raw full-file save session source");
      activeFilePath = next || "";
    },
    getActiveTuneId: () => activeTuneId,
    getActiveTuneMeta: () => tunes[0],
    setRawActiveTuneContext: (tuneId) => { activeTuneId = tuneId; },
    getHeaderDirty: () => false,
    setHeaderClean: () => { headerCleanCalls += 1; },
    getHeaderText: () => fullText.slice(0, fileEntry.headerEndOffset),
    getEditorText: () => editorText,
    setEditorText: (text) => {
      editorText = String(text || "");
      if (!suppressDirty) currentDoc = { ...currentDoc, content: editorText, dirty: true };
    },
    setSuppressDirty: (value) => { suppressDirty = Boolean(value); },
    readFile: async () => {
      readCalls += 1;
      if (readDelay > 0) await new Promise((resolve) => setTimeout(resolve, readDelay));
      return { ok: true, data: fullText };
    },
    writeFile: async (path, data, options = {}) => {
      assert.equal(path, filePath, "raw save should write the active file");
      assert.equal(Object.prototype.hasOwnProperty.call(options, "expectedData"), false, "raw save should not use a stale disk baseline");
      writes.push({ path, data, options });
      return { ok: true };
    },
    refreshLibraryFile: async () => fileEntry,
    getActiveFileEntry: () => fileEntry,
    findHeaderEndOffset: () => fileEntry.headerEndOffset,
    findTuneById: (tuneId) => {
      const tune = tunes.find((t) => t.id === tuneId);
      return tune ? { file: fileEntry, tune } : null;
    },
    safeFirstTuneId: () => tunes[0].id,
    selectTune: async (tuneId) => {
      selectedTuneCalls += 1;
      activeTuneId = tuneId;
      const tune = tunes.find((t) => t.id === tuneId) || tunes[0];
      const tuneText = fullText.slice(tune.startOffset, tune.endOffset);
      editorText = tuneText;
      currentDoc = { path: filePath, content: tuneText, dirty: false };
      return { ok: true };
    },
    ensureSafeToAbandonCurrentDoc: async () => {
      ensureSafeCalls += 1;
      assert.equal(currentDoc.dirty, false, "raw enter must not ask to abandon a phantom dirty document");
      return true;
    },
    confirmUnsavedChanges: async () => {
      confirmCalls += 1;
      return confirmChoice;
    },
    setDirtyIndicator: (next) => { dirtyIndicator = Boolean(next); },
    updateHeaderStateUI: () => {},
    updateFileHeaderPanel: () => {},
    updateFileContext: () => { fileContextUpdates += 1; },
  });

  return {
    feature,
    get currentDoc() { return currentDoc; },
    get dirtyIndicator() { return dirtyIndicator; },
    get ensureSafeCalls() { return ensureSafeCalls; },
    get readCalls() { return readCalls; },
    get selectedTuneCalls() { return selectedTuneCalls; },
    get headerCleanCalls() { return headerCleanCalls; },
    get rawContextCalls() { return rawContextCalls; },
    get confirmCalls() { return confirmCalls; },
    get fileContextUpdates() { return fileContextUpdates; },
    get writes() { return writes; },
    get rawButtonState() { return { ...rawButtonState }; },
    markDirty() { currentDoc = { ...currentDoc, dirty: true }; },
  };
}

async function testCleanRawRoundTripDoesNotDirtyDocument() {
  const h = createHarness();
  await h.feature.enter();
  assert.equal(h.feature.isEnabled(), true, "raw mode should be enabled after enter");
  assert.deepEqual(h.rawButtonState, { active: true, ariaPressed: "true" }, "raw button should expose its active state");
  assert.equal(h.currentDoc.dirty, false, "raw enter should keep current document clean");
  assert.equal(h.dirtyIndicator, false, "raw enter should clear dirty indicator");
  assert.equal(h.rawContextCalls, 1, "raw enter should establish full-file context once");
  assert.ok(h.fileContextUpdates >= 1, "raw enter should refresh and lock tune context controls");

  await h.feature.exit({
    ensureSafe: async () => {
      throw new Error("clean raw exit must not ask for unsaved changes");
    },
  });
  assert.equal(h.feature.isEnabled(), false, "raw mode should be disabled after exit");
  assert.deepEqual(h.rawButtonState, { active: false, ariaPressed: "false" }, "raw button should clear its active state");
  assert.equal(h.currentDoc.dirty, false, "raw exit should restore a clean tune document");

  await h.feature.enter();
  assert.equal(h.currentDoc.dirty, false, "second raw enter should still be clean");
  assert.equal(h.ensureSafeCalls, 2, "each clean enter should pass through abandon preflight");
}

async function testConcurrentRawEnterIsIgnored() {
  const h = createHarness({ readDelay: 10 });
  await Promise.all([h.feature.enter(), h.feature.enter()]);
  assert.equal(h.feature.isEnabled(), true, "raw mode should be enabled once");
  assert.equal(h.readCalls, 1, "concurrent raw enter should not duplicate file loads");
  assert.equal(h.ensureSafeCalls, 1, "concurrent raw enter should not duplicate abandon preflight");
  assert.equal(h.currentDoc.dirty, false, "concurrent raw enter should leave a clean document");
}

async function testRawSaveWritesTheFullBuffer() {
  const h = createHarness();
  await h.feature.enter();
  assert.equal(await h.feature.save(), true, "raw save should write the full editable buffer");
  assert.equal(h.writes.length, 1, "raw save should perform one direct file write");
}

async function testDiscardClearsDirtyState() {
  const h = createHarness();
  assert.equal(await h.feature.discardUnsavedRawState(), true, "discard should reload the raw file");
  assert.equal(h.currentDoc.dirty, false, "discard should clear current document dirty flag");
  assert.equal(h.headerCleanCalls, 1, "discard should mark header clean");
  assert.equal(h.dirtyIndicator, false, "discard should clear dirty indicator");
}

async function testDirtyRawExitUsesOwnedConfirmationFlow() {
  const canceled = createHarness({ confirmChoice: "cancel" });
  await canceled.feature.enter();
  canceled.markDirty();
  await canceled.feature.exit();
  assert.equal(canceled.confirmCalls, 1, "dirty raw exit should ask once");
  assert.equal(canceled.feature.isEnabled(), true, "cancel should keep raw mode active");

  const discarded = createHarness({ confirmChoice: "dont_save" });
  await discarded.feature.enter();
  discarded.markDirty();
  await discarded.feature.exit();
  assert.equal(discarded.confirmCalls, 1, "discarding raw exit should ask once");
  assert.equal(discarded.feature.isEnabled(), false, "Don't Save should leave raw mode");
  assert.equal(discarded.currentDoc.dirty, false, "Don't Save should clear raw dirty state");
}

try {
  await testCleanRawRoundTripDoesNotDirtyDocument();
  await testConcurrentRawEnterIsIgnored();
  await testRawSaveWritesTheFullBuffer();
  await testDiscardClearsDirtyState();
  await testDirtyRawExitUsesOwnedConfirmationFlow();
  console.log("[raw_mode_harness] OK");
} catch (err) {
  console.log("[raw_mode_harness] FAIL");
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
}
