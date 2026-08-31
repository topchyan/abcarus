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

const { createMidiEditorAdapter } = await importRendererModule(
  resolve("src/renderer/tools/midi_input/midi_editor_adapter.js"),
);
const { shouldShowMidiStatusButton } = await importRendererModule(
  resolve("src/renderer/tools/midi_input/midi_input_popover_controller.js"),
);

assert.equal(shouldShowMidiStatusButton({ enabled: false, devices: 0 }), false);
assert.equal(shouldShowMidiStatusButton({ enabled: false, devices: 1 }), false);
assert.equal(shouldShowMidiStatusButton({ enabled: true, devices: 0 }), true);
assert.equal(shouldShowMidiStatusButton({ enabled: true, devices: 1 }), true);

function createView(selection) {
  const calls = [];
  const child = {};
  const view = {
    dom: { contains: (element) => element === child },
    state: { selection: { main: { ...selection } } },
    dispatch: (transaction) => calls.push(transaction),
  };
  return { calls, child, view };
}

const main = createView({ from: 4, to: 7, empty: false });
const header = createView({ from: 2, to: 2, empty: true });
const documentRef = { activeElement: main.child };
const adapter = createMidiEditorAdapter({
  documentRef,
  getMainEditorView: () => main.view,
  getHeaderEditorView: () => header.view,
  EditorSelectionRef: { cursor: (position) => ({ cursor: position }) },
});

assert.equal(adapter.getActiveEditorView(), main.view);
assert.equal(adapter.insertTextAtCursor("ABC"), true);
assert.deepEqual(main.calls.pop(), {
  changes: { from: 4, to: 7, insert: "ABC" },
  selection: { cursor: 7 },
  userEvent: "input",
});

documentRef.activeElement = header.child;
assert.equal(adapter.deleteCharBeforeCursor(), true);
assert.deepEqual(header.calls.pop(), {
  changes: { from: 1, to: 2, insert: "" },
  selection: { cursor: 1 },
  userEvent: "delete",
});

header.view.state.selection.main = { from: 2, to: 5, empty: false };
assert.equal(adapter.deleteCharBeforeCursor(), true);
assert.deepEqual(header.calls.pop(), {
  changes: { from: 2, to: 5, insert: "" },
  selection: { cursor: 2 },
  userEvent: "delete",
});

documentRef.activeElement = {};
assert.equal(adapter.insertTextAtCursor("x"), false);
assert.equal(adapter.deleteCharBeforeCursor(), false);

console.log("midi input harness: all tests passed");
