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

const { createPlaybackDomain } = await importBundledModule(
  "src/renderer/playback/playback_domain.js",
);
const { createPlaybackTransportState } = await importBundledModule(
  "src/renderer/playback/playback_transport_state.js",
);
const { createPlaybackTransportController } = await importBundledModule(
  "src/renderer/playback/playback_transport_controller.js",
);
const { createAbSelectionPlaybackController } = await importBundledModule(
  "src/renderer/playback/ab_selection_playback_controller.js",
);
const { hasIntentionalSelectionPlaybackSpan } = await importBundledModule(
  "src/renderer/playback/selection_playback_model.js",
);
const {
  advanceFocusScoreSelection,
  advanceScoreRenderSelection,
  applyScoreRenderSelectionToFocusPlan,
  resolveFocusMeasureNumberAtRenderOffset,
} = await importBundledModule(
  "src/renderer/playback/focus_score_selection_model.js",
);

assert.deepEqual(
  advanceFocusScoreSelection({ fromMeasure: 0, toMeasure: 0, awaitingEnd: false }, 6),
  { fromMeasure: 6, toMeasure: 6, awaitingEnd: true },
);
assert.deepEqual(
  advanceScoreRenderSelection(null, { playStart: 900, playEnd: 940 }),
  { playStart: 900, playEnd: 940, awaitingEnd: true },
);
assert.deepEqual(
  advanceScoreRenderSelection(
    { playStart: 900, playEnd: 940, awaitingEnd: true },
    { playStart: 700, playEnd: 760 },
  ),
  { playStart: 700, playEnd: 940, awaitingEnd: false },
);
assert.deepEqual(
  applyScoreRenderSelectionToFocusPlan(
    { ok: true, plan: { startOffset: 400, endOffset: 440, mode: "segment" } },
    { playStart: 380, playEnd: 420 },
    (offset) => offset - 100,
    1000,
  ),
  { ok: true, plan: { startOffset: 280, endOffset: 320, mode: "segment" } },
  "physical score boundaries must override a later number-derived Focus range",
);
assert.deepEqual(
  advanceFocusScoreSelection({ fromMeasure: 6, toMeasure: 6, awaitingEnd: true }, 3),
  { fromMeasure: 3, toMeasure: 6, awaitingEnd: false },
);
assert.deepEqual(
  advanceFocusScoreSelection({ fromMeasure: 3, toMeasure: 6, awaitingEnd: false }, 9),
  { fromMeasure: 9, toMeasure: 9, awaitingEnd: true },
);
const scoreMeasureIndex = {
  anchor: 0,
  istarts: [100, 140, 180],
  byNumber: new Map([[1, [100]], [2, [140]], [3, [180]]]),
};
assert.equal(resolveFocusMeasureNumberAtRenderOffset(scoreMeasureIndex, 100), 1);
assert.equal(resolveFocusMeasureNumberAtRenderOffset(scoreMeasureIndex, 179), 2);
assert.equal(resolveFocusMeasureNumberAtRenderOffset(scoreMeasureIndex, 220), 3);

{
  const playbackStarts = [];
  const playbackRanges = [];
  let pendingRange = {
    startOffset: 10,
    endOffset: 14,
    origin: "selection",
    loop: true,
  };
  const editorView = {
    state: {
      doc: { length: 30 },
      selection: { main: { anchor: 10, head: 14 } },
    },
  };
  const selectionRuntime = {
    captureSelection: () => {},
    clearAbMutedVoices: () => {},
    setAbMutedVoiceIds: () => {},
  };
  const scoreSelectionController = createAbSelectionPlaybackController({
    selectionPlaybackRuntime: selectionRuntime,
    getSettings: () => ({ playbackSelectionLoopEnabled: true }),
    getEditorView: () => editorView,
    getEditorText: () => "X:1\nK:C\nCDEF GABc\n",
    isRawMode: () => false,
    isPayloadMode: () => false,
    getPlaybackRange: () => pendingRange,
    setPlaybackRange: (range) => playbackRanges.push(range),
    startPlaybackFromRange: async (range) => playbackStarts.push(range),
    parseMutedVoiceSetting: () => [],
    hasIntentionalSelectionPlaybackSpan,
  });

  assert.equal(
    await scoreSelectionController.playSelectionOnce(),
    true,
    "an explicit score selection must not require a barline inside its editor span",
  );
  assert.equal(playbackStarts.length, 1);
  assert.deepEqual(playbackRanges[0], {
    startOffset: 10,
    endOffset: 14,
    origin: "selection",
    loop: true,
  });

  playbackStarts.length = 0;
  playbackRanges.length = 0;
  pendingRange = {
    startOffset: 10,
    endOffset: 14,
    origin: "cursor",
    loop: false,
  };
  assert.equal(
    await scoreSelectionController.playSelectionOnce(),
    false,
    "an accidental short editor selection must keep the existing intent gate",
  );
  assert.equal(playbackStarts.length, 0);
}

const endState = createPlaybackTransportState();
endState.activePlaybackRange = { startOffset: 0, endOffset: null, origin: "transport", loop: false };
endState.isPlaying = true;
const completed = endState.consumePlaybackEnd();
assert.equal(completed.shouldLoop, false);
assert.equal(endState.restartOnNextPlay, true);
assert.equal(endState.consumeRestartOnNextPlay(), true);
assert.equal(endState.restartOnNextPlay, false);
endState.isPlaying = true;
endState.activePlaybackRange = { startOffset: 0, endOffset: null, origin: "transport", loop: true };
endState.consumePlaybackEnd();
assert.equal(endState.restartOnNextPlay, false);

const startCalls = [];
const controllerTransport = createPlaybackTransportState();
controllerTransport.restartOnNextPlay = true;
const controller = createPlaybackTransportController({
  transport: controllerTransport,
  getEditorView: () => ({ state: { doc: { length: 10 }, selection: { main: { anchor: 9, head: 9 } } } }),
  getFocusModeEnabled: () => false,
  startPlaybackAtIndex: async (index) => startCalls.push(index),
  startPlaybackFromRange: async () => {},
  pausePlayback: () => {},
  playSelectionOnce: async () => false,
  updatePlayButton: () => {},
  clearNoteSelection: () => {},
  resetPlaybackUiState: () => {},
  setSoundfontCaption: () => {},
  showToast: () => {},
});
controllerTransport.practiceTempoMultiplier = 0.75;
assert.equal(
  controller.buildTransportPlaybackPlan().tempoMultiplier,
  0.75,
  "runtime tempo multiplier must apply outside Focus mode",
);
await controller.transportPlay();
assert.deepEqual(startCalls, [0]);
assert.equal(controllerTransport.restartOnNextPlay, false);

const trace = [];
const transport = {
  isPlaying: false,
  isPaused: false,
  waitingForFirstNote: false,
  playbackIndexOffset: 12,
  playbackLoopFromMeasure: 4,
  playbackLoopToMeasure: 8,
  playbackState: {
    byTime: [],
    byIstart: [],
    measureStarts: [],
  },
  appendTrace: (event) => trace.push(event),
};
let focusEnabled = true;
const focusCalls = [];
const focusController = {
  computePlaybackPlan: () => ({ ok: true, start: 4 }),
  normalizeLoopBounds: (from, to) => ({ from, to }),
  normalizeLoopBoundsForPlayback: () => true,
  maybeResetLoopForTune: (...args) => focusCalls.push(args),
  clearScoreSelection: () => "cleared",
  getFocusScoreSelectionBounds: () => ({ fromMeasure: 2, toMeasure: 5 }),
  getFocusScoreRenderSelection: () => ({ playStart: 20, playEnd: 80 }),
  resolveScoreMeasureNumber: (offset) => offset + 1,
  selectScoreMeasureAtRenderOffset: (offset) => ({ selected: offset }),
  setEnabled: (...args) => focusCalls.push(["setEnabled", ...args]),
  toggle: () => focusCalls.push(["toggle"]),
};
const uiCalls = [];
const domain = createPlaybackDomain({
  transport,
  selectionRuntime: {},
  getEditorLength: () => 100,
  getFocusModeEnabled: () => focusEnabled,
  getFocusModeController: () => focusController,
  getPlaybackUiController: () => ({
    handlePlaybackGuardStop: (message) => uiCalls.push(message),
    isPlaybackBusy: () => Boolean(
      transport.isPlaying || transport.isPaused || transport.waitingForFirstNote
    ),
  }),
});

assert.equal(domain.isBusy(), false);
assert.equal(domain.isFollowEnabled(), true);
domain.setFollowEnabled(false);
assert.equal(domain.isFollowEnabled(), false);
assert.deepEqual(domain.computeFocusPlan(), { ok: true, start: 4 });
assert.equal(domain.clearFocusScoreSelection(), "cleared");
assert.deepEqual(domain.getFocusScoreSelectionBounds(), { fromMeasure: 2, toMeasure: 5 });
assert.deepEqual(domain.getFocusScoreRenderSelection(), { playStart: 20, playEnd: 80 });
assert.equal(domain.resolveFocusScoreMeasureNumber(8), 9);
assert.deepEqual(domain.selectFocusScoreMeasure(8), { selected: 8 });
assert.deepEqual(domain.normalizeFocusLoopBounds(2, 7), { from: 2, to: 7 });
assert.equal(domain.normalizeFocusLoopBoundsForPlayback(), true);
domain.resetFocusLoopForTune("tune-1", { updateUi: false });
assert.deepEqual(focusCalls, [["tune-1", { updateUi: false }]]);
domain.setFocusEnabled(true);
domain.toggleFocus();
domain.stopFromGuard("guard");
assert.deepEqual(focusCalls.slice(1), [["setEnabled", true], ["toggle"]]);
assert.deepEqual(uiCalls, ["guard"]);
assert.match(domain.getFollowPipelineVersion(), /^follow-/);
transport.waitingForFirstNote = true;
assert.equal(domain.isBusy(), true);
transport.waitingForFirstNote = false;

assert.throws(
  () => domain.getPayload(),
  /Playback controller is not attached: payload/,
);

const calls = [];
domain.attach({
  abSelection: {
    getSelectionSettings: () => ({ suppressRepeats: false, allowMidiDrums: true }),
    getSelectionRange: () => ({ startOffset: 2, endOffset: 7 }),
    withTempPlaybackFlags: (flags, action) => {
      calls.push(["flags", flags]);
      return action();
    },
  },
  payload: {
    getPlaybackPayload: () => ({ text: "X:1\nK:C\n", offset: 12 }),
    getPlaybackSourceKey: () => "source-key",
  },
  transport: {
    setPlaybackRange: (range) => calls.push(["range", range]),
    stopPlaybackTransport: () => calls.push("stop"),
  },
});

assert.deepEqual(domain.getScopedSettingsForOrigin("focus"), {
  suppressRepeats: true,
  allowMidiDrums: true,
});
focusEnabled = false;
assert.deepEqual(domain.getScopedSettingsForOrigin("focus"), {
  suppressRepeats: false,
  allowMidiDrums: true,
});
assert.deepEqual(domain.withScopedOrigin({ loop: true }, "selection"), {
  loop: true,
  origin: "selection",
});
assert.equal(domain.toDerivedOffset(8), 20);
assert.equal(domain.toEditorOffset(20), 8);
assert.equal(domain.toDerivedOffset("bad"), null);
assert.equal(domain.getSourceKey(), "source-key");
assert.equal(domain.getPayload().offset, 12);
assert.deepEqual(domain.getSelectionRange(), { startOffset: 2, endOffset: 7 });
domain.setRange({ startOffset: 1, endOffset: 3 });
domain.stopTransport();
domain.appendTrace({ index: 5 });
assert.deepEqual(trace, [{ index: 5 }]);
assert.deepEqual(calls, [
  ["range", { startOffset: 1, endOffset: 3 }],
  "stop",
]);

const rendererSource = await readFile("src/renderer/renderer.js", "utf8");
assert.doesNotMatch(rendererSource, /function\s+getPlaybackPayload\s*\(/);
assert.doesNotMatch(rendererSource, /function\s+startPlaybackFromRange\s*\(/);
assert.doesNotMatch(rendererSource, /function\s+setPlaybackRange\s*\(/);
assert.doesNotMatch(rendererSource, /function\s+getScopedPlaybackSettingsForOrigin\s*\(/);
assert.doesNotMatch(rendererSource, /buildPlaybackStateModel|snapIstartToPlayableModel/);
assert.doesNotMatch(
  rendererSource,
  /playbackTransport\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/,
);
assert.doesNotMatch(
  rendererSource,
  /from\s+["']\.\/playback\/(?:ab_loop_runtime|ab_marker_extension|ab_selection_playback_controller|drum_preview_controller|focus_mode_controller|follow_highlight_settings|playback_autoscroll_controller|playback_follow_controller|playback_payload_controller|playback_player_controller|playback_prepare_controller|playback_start_controller|playback_transport_controller|playback_transport_state|selection_playback_runtime|soundfont_controller)\.js["']/,
);
assert.doesNotMatch(
  rendererSource,
  /\b(?:playbackTransport|selectionPlaybackRuntime|abLoopRuntime|soundfontController|focusModeController|playbackUiController)\b/,
);
assert.match(rendererSource, /createPlaybackDomain\s*\(/);
assert.match(rendererSource, /playbackDomain\.initialize\s*\(/);

console.log("playback domain harness: all tests passed");
