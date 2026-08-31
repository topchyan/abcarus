#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { build } from "esbuild";
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

const { createRenderRuntime } = await importBundledModule(
  "src/renderer/render/render_runtime.js",
);
const { createScoreInteractionController } = await importBundledModule(
  "src/renderer/render/score_interaction_controller.js",
);
const { createHeaderLayersController } = await importBundledModule(
  "src/renderer/render/header_layers_controller.js",
);

{
  const files = new Map([
    ["/app/global_settings.abc", "%%titlefont Default 20"],
    ["/scores/local_settings.abc", "%%pagewidth 20cm"],
    ["/profile/user_settings.abc", "%%MIDI program 24"],
  ]);
  const controller = createHeaderLayersController({
    api: {
      getSettingsPaths: async () => ({
        globalPath: "/app/global_settings.abc",
        userPath: "/profile/user_settings.abc",
      }),
      pathDirname: () => "/scores",
      pathJoin: (dir, name) => `${dir}/${name}`,
    },
    readFile: async (filePath) => files.has(filePath)
      ? { ok: true, data: files.get(filePath) }
      : { ok: false },
    getActiveFilePath: () => "/scores/tunes.abc",
  });

  controller.setFromSettings({
    globalHeaderEnabled: true,
    globalHeaderText: "%%MIDI program 1",
  });
  await controller.refreshHeaderLayers();
  const enabled = controller.buildHeaderPrefix("%%scale 0.8", false, "X:1\nK:C\n").text;
  assert.match(enabled, /%%titlefont Default 20/);
  assert.match(enabled, /%%pagewidth 20cm/);
  assert.match(enabled, /%%MIDI program 24/);
  assert.doesNotMatch(enabled, /%%MIDI program 1/);
  assert.match(enabled, /%%scale 0\.8/);

  controller.setFromSettings({ globalHeaderEnabled: false });
  const disabled = controller.buildHeaderPrefix("%%scale 0.8", false, "X:1\nK:C\n").text;
  assert.doesNotMatch(disabled, /%%titlefont|%%pagewidth|%%MIDI program 24/);
  assert.match(disabled, /%%scale 0\.8/);
}

{
  const errors = [];
  const runtime = createRenderRuntime({
    consoleRef: {
      error: (message) => errors.push(message),
    },
  });

  assert.equal(runtime.assertCleanAbcText("X:1\nK:C\n", "test"), true);
  assert.equal(runtime.assertCleanAbcText("[object Object]", "test"), false);
  assert.equal(errors.length, 1);
  assert.equal(runtime.normalizeAccThreeQuarterToneForAbc2svg("^3/4C _3/4D"), "^3/2C _3/2D");

  runtime.initializePayload({
    getEditorText: () => "X:1\nK:C\n",
    buildHeaderPrefix: () => ({ text: "", offset: 0 }),
  });
  assert.deepEqual(runtime.getRenderPayload(), { text: "X:1\nK:C\n", offset: 0 });

  const payload = {
    offset: 10,
    compatMap: {
      shifts: [{ srcPos: 15, outPos: 17, delta: 2 }],
    },
  };
  assert.equal(runtime.mapEditorOffsetToRenderIdx(5, payload), 17);
  assert.equal(runtime.mapRenderIdxToEditorOffset(17, payload), 5);
}

{
  const listeners = new Map();
  const note = {
    getBoundingClientRect: () => ({ top: 250, left: 350, width: 20, height: 10 }),
  };
  const output = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    querySelectorAll: (selector) => selector === "._120_" ? [note] : [],
  };
  const renderPane = {
    scrollTop: 10,
    scrollLeft: 20,
    clientHeight: 200,
    clientWidth: 300,
    getBoundingClientRect: () => ({ top: 50, left: 100 }),
  };
  const selections = [];
  const playbackRanges = [];
  const origins = [];
  const controller = createScoreInteractionController({
    outputElement: output,
    renderPane,
    getEditorView: () => ({
      state: {
        selection: { main: { anchor: 20 } },
      },
    }),
    mapEditorOffsetToRenderIdx: (value) => value + 100,
    mapRenderIdxToEditorOffset: (value) => value - 100,
    pickClosestNoteElement: (elements) => elements[0] || null,
    setEditorSelectionRange: (start, end) => selections.push([start, end]),
    setPendingPlaybackRangeOrigin: (origin) => origins.push(origin),
    getPlaybackRange: () => ({ loop: true }),
    setPlaybackRange: (range) => playbackRanges.push(range),
    setTimeoutRef: (callback) => callback(),
    clearTimeoutRef: () => {},
  });

  assert.equal(controller.centerCurrentAnchor(), true);
  assert.equal(renderPane.scrollTop, 115);
  assert.equal(renderPane.scrollLeft, 130);

  assert.equal(controller.wireOutputSelection(), true);
  assert.equal(controller.wireOutputSelection(), false);
  const target = {
    classList: { contains: (name) => name === "note-hl" },
    dataset: { start: "120", end: "125" },
  };
  assert.equal(controller.handleOutputClick({ target }), true);
  assert.deepEqual(origins, ["score-note"]);
  assert.deepEqual(selections, [[20, 25]]);
  assert.deepEqual(playbackRanges, [{
    startOffset: 20,
    endOffset: null,
    origin: "score-note",
    loop: false,
  }]);
  assert.equal(typeof listeners.get("click"), "function");
  assert.equal(typeof listeners.get("dblclick"), "function");
  assert.equal(typeof listeners.get("abcarus:score-rendered"), "function");
  assert.equal(typeof listeners.get("abcarus:focus-selection-changed"), "function");
}

console.log("render domain harness: all tests passed");
