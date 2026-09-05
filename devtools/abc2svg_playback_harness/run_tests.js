#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const ABC2SVG_PATH = path.join(ROOT, "third_party", "abc2svg", "abc2svg-1.js");
const MIDI_PATH = path.join(ROOT, "third_party", "abc2svg", "MIDI-1.js");
const SND_PATH = path.join(ROOT, "third_party", "abc2svg", "snd-1.js");

function fail(message) {
  throw new Error(String(message || "Test failed"));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function createSandbox() {
  const sessionStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    navigator: {},
    alert() {},
    prompt() { return null; },
    sessionStorage,
    window: null,
    exports: {},
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(ABC2SVG_PATH, "utf8"), sandbox, { filename: "abc2svg-1.js" });
  vm.runInContext(fs.readFileSync(MIDI_PATH, "utf8"), sandbox, { filename: "MIDI-1.js" });
  vm.runInContext(fs.readFileSync(SND_PATH, "utf8"), sandbox, { filename: "snd-1.js" });
  return sandbox;
}

function parseOnce(sandbox, abcText) {
  const AbcCtor = sandbox.abc2svg && sandbox.abc2svg.Abc;
  assert(typeof AbcCtor === "function", "abc2svg constructor unavailable");
  const messages = [];
  const user = {
    img_out() {},
    err(m) { messages.push(String(m || "")); },
    errmsg(m) { messages.push(String(m || "")); },
  };
  const abc = new AbcCtor(user);
  abc.tosvg("test", String(abcText || ""));
  return { abc, messages };
}

function countGeneratedDrumNotes(sandbox, parsed) {
  const toAudio = sandbox && typeof sandbox.ToAudio === "function" ? sandbox.ToAudio() : null;
  assert(toAudio && typeof toAudio.add === "function", "ToAudio.add is unavailable");
  const tunes = parsed && parsed.abc && Array.isArray(parsed.abc.tunes) ? parsed.abc.tunes : [];
  assert(tunes.length > 0, "No tunes parsed for audio generation");
  let count = 0;
  for (const tune of tunes) {
    toAudio.add(tune[0], tune[1], tune[3]);
    const seen = new Set();
    for (let s = tune[0]; s && !seen.has(s); s = s.ts_next) {
      seen.add(s);
      const voiceId = s && s.p_v && s.p_v.id != null ? String(s.p_v.id) : "";
      if (voiceId !== "_drum" || !Array.isArray(s.notes)) continue;
      count += s.notes.length;
    }
  }
  return count;
}

function collectPlaybackNoteOffsets(sandbox, parsed, startOffset) {
  const toAudio = sandbox && typeof sandbox.ToAudio === "function" ? sandbox.ToAudio() : null;
  assert(toAudio && typeof toAudio.add === "function", "ToAudio.add is unavailable");
  const tunes = parsed && parsed.abc && Array.isArray(parsed.abc.tunes) ? parsed.abc.tunes : [];
  assert(tunes.length > 0, "No tunes parsed for playback sequence");
  const tune = tunes[0];
  toAudio.add(tune[0], tune[1], tune[3]);

  let start = tune[0];
  while (start && !(Array.isArray(start.notes) && Number(start.istart) >= startOffset)) {
    start = start.ts_next;
  }
  assert(start, `No playback symbol found at or after offset ${startOffset}`);

  const offsets = [];
  const playback = {
    conf: { speed: 1 },
    tgen: 3600,
    get_time() { return -0.3; },
    midi_ctrl() {},
    midi_prog() {},
    note_run(_playback, symbol) { offsets.push(Number(symbol.istart)); },
    v_c: [],
    c_i: [],
    stop: false,
    s_end: null,
    s_cur: start,
    repn: false,
    repv: 0,
  };
  const originalSetTimeout = sandbox.setTimeout;
  sandbox.setTimeout = () => 0;
  try {
    sandbox.abc2svg.play_next(playback);
  } finally {
    sandbox.setTimeout = originalSetTimeout;
  }
  return offsets;
}

function countBoundedPlaybackNotes(sandbox, start, end) {
  let count = 0;
  const playback = {
    conf: { speed: 1 },
    tgen: 3600,
    get_time() { return -0.3; },
    midi_ctrl() {},
    midi_prog() {},
    note_run() { count += 1; },
    v_c: [],
    c_i: [],
    stop: false,
    s_end: end,
    s_cur: start,
    repn: false,
    repv: 0,
  };
  const originalSetTimeout = sandbox.setTimeout;
  sandbox.setTimeout = () => 0;
  try {
    sandbox.abc2svg.play_next(playback);
  } finally {
    sandbox.setTimeout = originalSetTimeout;
  }
  return count;
}

function countNativeLoopNotes(sandbox, start, end, stopAfter) {
  let count = 0;
  const loopStart = {
    type: -1,
    dur: 0,
    ptim: Number(start.ptim) || 0,
    time: Number(start.time) || 0,
    v: start.v,
    p_v: start.p_v,
    seqst: true,
    ts_prev: start.ts_prev || null,
    ts_next: start,
  };
  const playback = {
    conf: { speed: 1 },
    tgen: 3600,
    get_time() { return -0.3; },
    midi_ctrl() {},
    midi_prog() {},
    note_run(state) {
      count += 1;
      if (count >= stopAfter) state.stop = true;
    },
    onend() {},
    v_c: [],
    c_i: [],
    stop: false,
    s_end: end,
    s_cur: loopStart,
    s_loop: loopStart,
    repn: false,
    repv: 0,
  };
  const originalSetTimeout = sandbox.setTimeout;
  sandbox.setTimeout = () => 0;
  try {
    sandbox.abc2svg.play_next(playback);
  } finally {
    sandbox.setTimeout = originalSetTimeout;
  }
  return count;
}

const DRUM_TUNE = `X:1
T:Drum Hook Regression
M:4/4
L:1/8
Q:1/4=120
K:C
V:1
%%MIDI drumon
%%MIDI drum dddddddd 36 42 42 42 38 42 42 42
CDEF GABc|cBAG FEDC|]
`;

const DRUM_CONTINUATION_TUNE = `X:2
T:Drum Continuation Regression
M:10/8
L:1/16
K:C
V:1
%%MIDI drum d2dd2d2d2d
%%MIDI drum +: 64 62 62 64 62 62
%%MIDI drum +: 100 90 70 90 70 70
%%MIDI drumon
C2D2E2F2G2 |]
`;

const REPEATED_PART_TUNE = `X:3
T:Playback from inside a repeated P part
P:(AB)3
K:
P:A
c|c|1d|e:|2e|f||
P:B
a|g|1a|c:|2a|g||
`;

const FOUR_BAR_DRUM_TUNE = `X:114
T:Zeybekiko
M:9/8
L:1/8
Q:1/8=160
K:none
%%MIDI drumbars 1
%%MIDI drum ddddddddd 36 42 38 42 36 42 38 42 36
%%MIDI drumon
z9 | z9 | z9 | z9 |]
`;

function main() {
  const sandbox = createSandbox();
  assert(sandbox.abc2svg && sandbox.abc2svg.drum, "snd-1.js did not register abc2svg.drum");
  assert(typeof sandbox.abc2svg.drum === "object", "abc2svg.drum should remain an object in current upstream");
  assert(typeof sandbox.abc2svg.drum.beg_end === "function", "abc2svg.drum.beg_end missing");

  const drum = parseOnce(sandbox, DRUM_TUNE);
  assert(drum.messages.length === 0, `native drum tune reported errors: ${drum.messages.join("; ")}`);
  assert(countGeneratedDrumNotes(sandbox, drum) > 0, "native drum tune did not generate drum notes");
  const continuation = parseOnce(sandbox, DRUM_CONTINUATION_TUNE);
  assert(
    continuation.messages.some((m) => /Bad value in %%MIDI drum/i.test(m)),
    "readable %%MIDI drum +: continuation unexpectedly parsed; update ABCarus if upstream adds support"
  );
  const repeatedParts = parseOnce(sandbox, REPEATED_PART_TUNE);
  assert(repeatedParts.messages.length === 0, `repeated-part tune reported errors: ${repeatedParts.messages.join("; ")}`);
  const partAStart = REPEATED_PART_TUNE.indexOf("c|c|1d");
  const insidePartA = REPEATED_PART_TUNE.indexOf("2e|f");
  assert(partAStart >= 0 && insidePartA >= 0, "repeated-part fixture offsets are unavailable");
  const fromBoundary = collectPlaybackNoteOffsets(sandbox, repeatedParts, partAStart);
  const fromInside = collectPlaybackNoteOffsets(sandbox, repeatedParts, insidePartA);
  const boundaryPrefix = [
    partAStart,
    partAStart + 2,
    REPEATED_PART_TUNE.indexOf("1d") + 1,
    REPEATED_PART_TUNE.indexOf("e:|"),
  ];
  const insidePrefix = [
    REPEATED_PART_TUNE.indexOf("2e") + 1,
    REPEATED_PART_TUNE.indexOf("f||"),
    REPEATED_PART_TUNE.indexOf("a|g|"),
    REPEATED_PART_TUNE.indexOf("g|1a"),
  ];
  assert(
    fromBoundary.slice(0, 4).join(",") === boundaryPrefix.join(","),
    `playback from P:A boundary has an unexpected prefix: ${fromBoundary.slice(0, 8).join(",")}`
  );
  assert(
    fromInside.slice(0, 4).join(",") === insidePrefix.join(","),
    `playback from inside P:A restarted A instead of continuing to B: ${fromInside.slice(0, 8).join(",")}`
  );
  const fourBars = parseOnce(sandbox, FOUR_BAR_DRUM_TUNE);
  const fourBarTune = fourBars.abc.tunes[0];
  sandbox.ToAudio().add(fourBarTune[0], fourBarTune[1], fourBarTune[3]);
  const sourceRests = [];
  for (let s = fourBarTune[0], guard = 0; s && guard < 1000; s = s.ts_next, guard += 1) {
    if (Number.isFinite(s.istart) && s.dur > 0 && s.p_v && s.p_v.id === "1") sourceRests.push(s);
  }
  assert(sourceRests.length === 4, `expected four source rests, got ${sourceRests.length}`);
  let normalizedEnd = sourceRests[3].ts_next;
  assert(
    normalizedEnd && !Number.isFinite(normalizedEnd.istart) && normalizedEnd.p_v.id === "_drum",
    "fixture no longer exposes generated drums immediately after the final source rest"
  );
  while (normalizedEnd && !Number.isFinite(normalizedEnd.istart)) normalizedEnd = normalizedEnd.ts_next;
  assert(normalizedEnd && normalizedEnd.bar_type === "|]", "normalized range end must reach the final barline");
  assert(
    countBoundedPlaybackNotes(sandbox, sourceRests[0], normalizedEnd) === 36,
    "bounded playback must retain all nine drum hits in each of four selected measures"
  );
  assert(
    countNativeLoopNotes(sandbox, sourceRests[0], normalizedEnd, 72) === 72,
    "native zero-gap looping must play two complete four-measure drum cycles"
  );
  console.log("% PASS abc2svg playback harness: native drums and repeated P: cursor starts are available");
}

try {
  main();
} catch (error) {
  console.error("% FAIL abc2svg playback harness:", error && error.message ? error.message : String(error));
  process.exit(1);
}
