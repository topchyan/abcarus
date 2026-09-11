#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const result = await build({
  entryPoints: [resolve("src/renderer/library/reorder_tune_action.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const encoded = Buffer.from(result.outputFiles[0].text, "utf8").toString("base64");
const { createReorderTuneAction } = await import(`data:text/javascript;base64,${encoded}`);

const clipboardBuild = await build({
  entryPoints: [resolve("src/renderer/library/tune_clipboard_controller.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const clipboardEncoded = Buffer.from(clipboardBuild.outputFiles[0].text, "utf8").toString("base64");
const { createTuneClipboardController } = await import(`data:text/javascript;base64,${clipboardEncoded}`);

const filePath = "/music/tunes.abc";
const blocks = [
  "X:10\nT:First\nK:C\nC |\n\n",
  "X:20\nT:Second\nK:C\nD |\n\n",
  "X:30\nT:Third\nK:C\nE |\n",
];
const sourceText = `% header\n${blocks.join("")}`;
let offset = sourceText.indexOf("X:10");
const tunes = blocks.map((text, index) => {
  const startOffset = offset;
  offset += text.length;
  return {
    id: `tune-${index}`,
    tuneUid: `uid-${index}`,
    tuneIndex: index,
    startOffset,
    endOffset: offset,
  };
});
const file = { path: filePath, tunes };
const tuneLookup = createTuneClipboardController({
  state: { getLibraryIndex: () => ({ files: [file] }) },
});
assert.equal(tuneLookup.findTuneById("uid-1").tune.id, "tune-1", "active tuneUid must resolve for shortcuts");
let written = "";
let selected = "";

const action = createReorderTuneAction({
  state: {
    getActiveTuneId: () => "tune-1",
    getActiveTuneIndex: () => 1,
    getActiveTuneMeta: () => ({ path: filePath, tuneIndex: 1 }),
    getActiveTuneUid: () => "uid-1",
  },
  actions: {
    findTuneById: (id) => {
      const tune = tunes.find((entry) => entry.id === id || entry.tuneUid === id);
      return tune ? { file, tune } : null;
    },
    pathsEqual: (left, right) => left === right,
    readFile: async () => ({ ok: true, data: sourceText }),
    refreshLibraryFile: async () => ({
      path: filePath,
      tunes: [
        { id: "new-first" },
        { id: "new-third" },
        { id: "new-second" },
      ],
    }),
    requireCleanForFileOp: async () => true,
    selectTune: async (id) => { selected = id; return { ok: true }; },
    withFileLock: async (_path, operation) => operation(),
    writeFile: async (_path, text, options) => {
      assert.equal(options.expectedData, sourceText);
      written = text;
      return { ok: true };
    },
  },
});

const unchanged = await action.reorderTune("tune-1", { targetTuneId: "tune-2", placement: "before" });
assert.equal(unchanged.boundary, true);
assert.equal(written, "", "dropping at the existing boundary must not rewrite the file");

const moved = await action.reorderTune("tune-1", { direction: 1 });
assert.equal(moved.ok, true);
assert.ok(written.indexOf("T:First") < written.indexOf("T:Third"));
assert.ok(written.indexOf("T:Third") < written.indexOf("T:Second"));
assert.deepEqual(Array.from(written.matchAll(/^X:\s*(\d+)/gm), (match) => match[1]), ["10", "20", "30"]);
assert.match(written, /X:20\nT:Third/);
assert.match(written, /X:30\nT:Second/);
assert.equal(selected, "new-second", "the active tune must remain active after its offset changes");

console.log("reorder tune harness: all tests passed");
