#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const bundled = await build({
  entryPoints: [resolve("src/renderer/library/renumber_x_action.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const { createRenumberXAction } = await import(`data:text/javascript;base64,${encoded}`);
const transformsBundle = await build({
  entryPoints: [resolve("src/renderer/abc/text_transforms.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const transformsEncoded = Buffer.from(transformsBundle.outputFiles[0].text, "utf8").toString("base64");
const { renumberXLinesConsecutive } = await import(`data:text/javascript;base64,${transformsEncoded}`);

const filePath = "/music/Ara_Dinkjian_etc.abc";
const before = "X:1\nT:Moved tune\nK:C\nC|\n\nX:241\nT:Another tune\nK:D\nD|\n\nX:17\nT:Last tune\nK:G\nG|\n";
const after = "X:1\nT:Moved tune\nK:C\nC|\n\nX:2\nT:Another tune\nK:D\nD|\n\nX:3\nT:Last tune\nK:G\nG|\n";
let diskText = before;
let loaded = 0;
let status = "";
const errors = [];

const action = createRenumberXAction({
  state: {
    getActiveTuneMeta: () => ({ path: filePath }),
    getCurrentDocumentPath: () => filePath,
    getRawMode: () => false,
  },
  actions: {
    requireCleanForFileOp: async () => true,
    readFile: async (path) => ({ ok: path === filePath, data: diskText }),
    renumberXLinesConsecutive,
    writeFile: async (path, text, options) => {
      assert.equal(path, filePath);
      assert.equal(options.expectedData, before);
      diskText = text;
      return { ok: true };
    },
    refreshLibraryFile: async (path, options) => {
      assert.equal(path, filePath);
      assert.deepEqual(options, { force: true });
      return { ok: true };
    },
    loadLibraryFileIntoEditor: async (path, options) => {
      assert.equal(path, filePath);
      assert.deepEqual(options, { skipConfirm: true, suppressRecent: true });
      loaded += 1;
      return { ok: true };
    },
    setStatus: (value) => { status = value; },
    showSaveError: async (value) => { errors.push(String(value)); },
  },
});

await action.renumberXInActiveFile();
assert.equal(diskText, after, "Renumber X must follow the physical order of X headers");
assert.equal(loaded, 1, "Renumber X must reload the currently open file");
assert.equal(status, "Renumbered X.");
assert.deepEqual(errors, []);

console.log("[renumber_x_harness] OK");
