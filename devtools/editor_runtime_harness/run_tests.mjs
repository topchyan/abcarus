#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function importBundledModule(filePath) {
  const result = await build({
    entryPoints: [resolve(filePath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const source = result.outputFiles[0].text;
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const { createEditorRuntime } = await importBundledModule(
  "src/renderer/editor/editor_runtime.js",
);
const { createEditStateController } = await importBundledModule(
  "src/renderer/app/document/edit_state_controller.js",
);

const dispatched = [];
const doc = {
  length: 3,
  lines: 1,
  line: () => ({ from: 0, to: 3 }),
  toString: () => "ABC",
};
const view = {
  dom: { contains: () => false },
  scrollDOM: { scrollTop: 0 },
  state: {
    doc,
    selection: { main: { anchor: 1 }, ranges: [] },
  },
  dispatch: (transaction) => dispatched.push(transaction),
};
const featureCalls = [];
const runtime = createEditorRuntime({
  createFeature: (options) => ({
    init: () => view,
    clearPendingRender: () => featureCalls.push("clear"),
    refreshCursorStatus: () => featureCalls.push("cursor"),
    setPendingPlaybackRangeOrigin: (value) => featureCalls.push(["origin", value]),
    setSuppressPlaybackRangeSelectionSync: (value) => featureCalls.push(["sync", value]),
  }),
});

assert.equal(runtime.hasView(), false);
assert.equal(runtime.init({ host: {} }), view);
assert.equal(runtime.hasView(), true);
assert.equal(runtime.getText(), "ABC");
assert.equal(runtime.getLength(), 3);
assert.equal(runtime.getSelection(), view.state.selection);
assert.equal(runtime.getDom(), view.dom);

runtime.setText("DEF");
assert.deepEqual(dispatched.at(-1).changes, { from: 0, to: 3, insert: "DEF" });

assert.equal(runtime.isDirtySuppressed(), false);
runtime.withDirtySuppressed(() => {
  assert.equal(runtime.isDirtySuppressed(), true);
});
assert.equal(runtime.isDirtySuppressed(), false);
runtime.setDirtySuppressed(true);
runtime.setTextClean("G");
assert.equal(runtime.isDirtySuppressed(), true);
runtime.setDirtySuppressed(false);

runtime.setScroll(42);
assert.equal(runtime.getScroll(), 42);
assert.equal(runtime.getIndexFromLoc({ line: 1, col: 9 }), 3);
assert.equal(runtime.refresh(), true);
assert.equal(runtime.resetSelectionToStart(), true);

runtime.clearPendingRender();
runtime.refreshCursorStatus();
runtime.setPendingPlaybackRangeOrigin("svg");
runtime.setSuppressPlaybackRangeSelectionSync(true);
assert.deepEqual(featureCalls, [
  "clear",
  "cursor",
  ["origin", "svg"],
  ["sync", true],
]);

const rendererSource = await readFile("src/renderer/renderer.js", "utf8");
assert.doesNotMatch(rendererSource, /\blet\s+editorView\b/);
assert.doesNotMatch(rendererSource, /\blet\s+suppressDirty\b/);
assert.doesNotMatch(rendererSource, /\bcreateMainEditorFeature\s*\(/);
assert.match(rendererSource, /createEditorRuntime\s*\(/);

const cancelButton = { disabled: true };
let headerDirty = false;
let currentDoc = { dirty: false };
const editState = createEditStateController({
  elements: { cancelButton },
  state: { getCurrentDoc: () => currentDoc, getHeaderDirty: () => headerDirty },
});
editState.setDirtyIndicator(false);
assert.equal(cancelButton.disabled, true, "Cancel must be disabled for a clean document");
editState.setDirtyIndicator(true);
assert.equal(cancelButton.disabled, false, "Tune edits must enable Cancel");
headerDirty = true;
editState.setDirtyIndicator(false);
assert.equal(cancelButton.disabled, false, "Header edits must enable Cancel");
headerDirty = false;
editState.setDirtyIndicator(false);
assert.equal(cancelButton.disabled, true, "Restoring clean state must disable Cancel");
currentDoc = { dirty: true };
editState.setDirtyIndicator(false);
assert.equal(cancelButton.disabled, false, "Dirty editor must keep Cancel enabled even after a stale clean update");
currentDoc = { dirty: false };
editState.setDirtyIndicator(false);
assert.equal(cancelButton.disabled, true, "Clean editor must disable Cancel");

console.log("editor runtime harness: all tests passed");
