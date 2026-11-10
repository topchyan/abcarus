#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const ABC2SVG_DIR = process.env.ABC2SVG_CANDIDATE_DIR
  ? path.resolve(process.env.ABC2SVG_CANDIDATE_DIR)
  : path.join(ROOT, "third_party", "abc2svg");
const ABC2SVG_PATH = path.join(ABC2SVG_DIR, "abc2svg-1.js");
const MIDI_PATH = path.join(ABC2SVG_DIR, "MIDI-1.js");
const SND_PATH = path.join(ABC2SVG_DIR, "snd-1.js");

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

function verifyPinnedPlaybackRuntime() {
  const source = fs.readFileSync(SND_PATH, "utf8");
  assert(
    source.includes("Math.max(.01,parm.release*(conf.release==undefined?1:conf.release))"),
    "abc2svg must apply the configured SoundFont release scale"
  );
  assert(
    !source.includes("linearRampToValueAtTime(.01,t+d+parm.release)"),
    "abc2svg still contains the audible SoundFont release tail"
  );
  assert(
    !source.includes("sort((a,b)=>{(a.generator.velRange?.lo||0)"),
    "abc2svg velocity-layer comparator does not return its result"
  );
  assert(
    source.includes("g.gain.cancelAndHoldAtTime(t+d)"),
    "abc2svg must truncate SoundFont envelope automation at note-off"
  );
}

function verifySoundfontEnvelopeStopsAtNoteOff() {
  const sandbox = createSandbox();
  const soundfontPath = path.join(ROOT, "third_party", "sf2", "TimGM6mb.sf2");
  sandbox.abc2svg.sf2 = fs.readFileSync(soundfontPath).toString("base64");

  class FakeAudioParam {
    constructor(value = 1) {
      this.value = value;
      this.events = [];
    }
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push({ kind: "set", value, time });
    }
    linearRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push({ kind: "linear", value, time });
    }
    exponentialRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push({ kind: "exponential", value, time });
    }
    cancelScheduledValues(time) {
      this.events = this.events.filter((event) => event.time < time);
    }
    cancelAndHoldAtTime(time) {
      this.cancelScheduledValues(time);
      this.events.push({ kind: "hold", value: this.value, time });
    }
  }

  const sources = [];
  const audioContext = {
    currentTime: 0,
    destination: {},
    createBuffer(_channels, length, sampleRate) {
      const data = new Float32Array(length);
      return { sampleRate, getChannelData() { return data; } };
    },
    createBufferSource() {
      const source = {
        playbackRate: new FakeAudioParam(),
        detune: new FakeAudioParam(),
        target: null,
        startTime: null,
        stopTime: null,
        connect(target) { this.target = target; },
        start(time) { this.startTime = time; sources.push(this); },
        stop(time) { this.stopTime = time; },
      };
      return source;
    },
    createGain() {
      return { gain: new FakeAudioParam(), connect() {}, disconnect() {} };
    },
    createStereoPanner() {
      return { pan: new FakeAudioParam(0), connect() {} };
    },
  };

  const parsed = parseOnce(sandbox, `X:1
L:1/8
Q:1/4=240
M:4/4
K:C
C |]
`);
  assert(parsed.messages.length === 0, `SoundFont envelope fixture reported errors: ${parsed.messages.join("; ")}`);
  const tune = parsed.abc.tunes[0];
  sandbox.ToAudio().add(tune[0], tune[1], tune[3]);
  const audio = sandbox.Audio5({ ac: audioContext, sfu: "TimGM6mb.sf2", speed: 1, release: 0.25, onend() {} });
  audio.play(tune[0], null, 0, false);

  assert(sources.length === 1, `expected one SoundFont source, got ${sources.length}`);
  const envelope = sources[0].target && sources[0].target.gain;
  assert(envelope, "SoundFont source was not connected to a gain envelope");
  const held = envelope.events.find((event) => event.kind === "hold");
  assert(held, "SoundFont envelope was not held at note-off");
  const lateBeforeRelease = envelope.events.filter((event) => (
    event.kind !== "hold"
    && event.kind !== "linear"
    && event.time > held.time
  ));
  assert(
    lateBeforeRelease.length === 0,
    `SoundFont envelope contains automation after note-off: ${JSON.stringify(lateBeforeRelease)}`
  );
  const release = envelope.events[envelope.events.length - 1];
  assert(
    release.kind === "linear" && release.value === 0 && release.time > held.time,
    `SoundFont release must fade from the held note-off level to silence: ${JSON.stringify(envelope.events)}`
  );
  const releaseSeconds = release.time - held.time;
  assert(
    releaseSeconds > 0.2 && releaseSeconds < 0.35,
    `SoundFont release scale was not applied: ${releaseSeconds}s`
  );
  assert(
    Math.abs(sources[0].stopTime - release.time) < 1e-9,
    "SoundFont source must stop when its scaled release reaches silence"
  );
  audio.stop();
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

function collectDirectLoopOffsets(sandbox, start, stopAfter) {
  const offsets = [];
  const playback = {
    conf: { speed: 1 },
    tgen: 3600,
    get_time() { return -0.3; },
    midi_ctrl() {},
    midi_prog() {},
    note_run(state, symbol) {
      offsets.push(Number(symbol.istart));
      if (offsets.length >= stopAfter) state.stop = true;
    },
    onend() {},
    v_c: [],
    c_i: [],
    stop: false,
    s_end: null,
    s_cur: start,
    s_loop: start,
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

const DISTANT_VOLTA_TUNE = `X:4
T:Variant separated from repeat bar
M:2/4
L:1/4
K:C
|: C D |1 E F :| y [2 G A |]
`;

const PART_ORDER_ENDINGS_TUNE = `X:5
T:Playback from inside numbered endings
P:BC (AB)2
L:1/8
M:3/8
K:C
P:A
|:g3|c3|1a3:|2f3|
P:B
|:a3|1g3:|2c3:|3d3:|4f3|
P:C
|:e3|c3|1g3:|2b3|
`;

const PART_REPEAT_LOOP_TUNE = `X:6
T:Parts and repeats loop
P:AB
M:2/4
L:1/2
K:C
P:A
|:A|1B:|2c|
P:B
|:D|1E:|2F|]
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

function assertPartOrderLoop(sandbox, order) {
  const source = `X:7
T:Parts loop ${order}
P:${order}
M:2/4
L:1/2
K:C
P:A
A|
P:B
B|
P:C
C|]
`;
  const parsed = parseOnce(sandbox, source);
  assert(parsed.messages.length === 0, `${order} part-order loop reported errors: ${parsed.messages.join("; ")}`);
  const tune = parsed.abc.tunes[0];
  sandbox.ToAudio().add(tune[0], tune[1], tune[3]);
  const offsetsByPart = {};
  for (let s = tune[0], guard = 0; s && guard < 1000; s = s.ts_next, guard += 1) {
    if (!Array.isArray(s.notes) || !Number.isFinite(s.istart) || Number(s.dur) <= 0) continue;
    offsetsByPart[source[s.istart]] = Number(s.istart);
  }
  const expected = [...order, ...order].map((part) => offsetsByPart[part]);
  const actual = collectDirectLoopOffsets(sandbox, tune[0], expected.length);
  assert(actual.join(",") === expected.join(","), `${order} loop order is wrong: ${actual.join(",")}`);
}

function main() {
  verifyPinnedPlaybackRuntime();
  verifySoundfontEnvelopeStopsAtNoteOff();
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
  const distantVolta = parseOnce(sandbox, DISTANT_VOLTA_TUNE);
  assert(distantVolta.messages.length === 0, `distant-volta tune reported errors: ${distantVolta.messages.join("; ")}`);
  const distantVoltaOffsets = collectPlaybackNoteOffsets(
    sandbox,
    distantVolta,
    DISTANT_VOLTA_TUNE.indexOf("C D")
  );
  const expectedDistantVoltaOffsets = ["C D", "D |1", "E F", "F :|", "C D", "D |1", "G A", "A |]"]
    .map((token) => DISTANT_VOLTA_TUNE.indexOf(token));
  assert(
    distantVoltaOffsets.slice(0, 8).join(",") === expectedDistantVoltaOffsets.join(","),
    `variant separated from :| has an unexpected playback sequence: ${distantVoltaOffsets.slice(0, 10).join(",")}`
  );
  const orderedEndings = parseOnce(sandbox, PART_ORDER_ENDINGS_TUNE);
  assert(orderedEndings.messages.length === 0, `part-order tune reported errors: ${orderedEndings.messages.join("; ")}`);
  const partA = PART_ORDER_ENDINGS_TUNE.indexOf("P:A\n");
  const partB = PART_ORDER_ENDINGS_TUNE.indexOf("P:B\n");
  const partC = PART_ORDER_ENDINGS_TUNE.indexOf("P:C\n");
  const noteAt = (part, token) => PART_ORDER_ENDINGS_TUNE.indexOf(token, part) + token.search(/[a-g]/);
  const a = [noteAt(partA, "|:g3"), noteAt(partA, "|c3"), noteAt(partA, "|1a3"), noteAt(partA, "|:g3"), noteAt(partA, "|c3"), noteAt(partA, "|2f3")];
  const b = [noteAt(partB, "|:a3"), noteAt(partB, "|1g3"), noteAt(partB, "|:a3"), noteAt(partB, "|2c3"), noteAt(partB, "|:a3"), noteAt(partB, "|3d3"), noteAt(partB, "|:a3"), noteAt(partB, "|4f3")];
  const c = [noteAt(partC, "|1g3"), noteAt(partC, "|:e3"), noteAt(partC, "|c3"), noteAt(partC, "|2b3")];
  const fromCFirstEnding = collectPlaybackNoteOffsets(sandbox, orderedEndings, c[0]);
  const expectedOrdered = [...c, ...a, ...b, ...a, ...b];
  assert(
    fromCFirstEnding.slice(0, expectedOrdered.length).join(",") === expectedOrdered.join(","),
    `repeat state leaked across P: transitions: ${fromCFirstEnding.slice(0, expectedOrdered.length).join(",")}`
  );
  assertPartOrderLoop(sandbox, "ABAC");
  assertPartOrderLoop(sandbox, "BCA");
  assertPartOrderLoop(sandbox, "CABA");
  const repeatLoop = parseOnce(sandbox, PART_REPEAT_LOOP_TUNE);
  assert(repeatLoop.messages.length === 0, `part-repeat loop reported errors: ${repeatLoop.messages.join("; ")}`);
  const repeatLoopTune = repeatLoop.abc.tunes[0];
  sandbox.ToAudio().add(repeatLoopTune[0], repeatLoopTune[1], repeatLoopTune[3]);
  const repeatOffsets = collectDirectLoopOffsets(sandbox, repeatLoopTune[0], 16);
  const repeatNoteAt = (token) => PART_REPEAT_LOOP_TUNE.indexOf(token) + token.search(/[A-Ga-g]/);
  const oneCycle = [
    repeatNoteAt("|:A"), repeatNoteAt("|1B"), repeatNoteAt("|:A"), repeatNoteAt("|2c"),
    repeatNoteAt("|:D"), repeatNoteAt("|1E"), repeatNoteAt("|:D"), repeatNoteAt("|2F"),
  ];
  assert(
    repeatOffsets.join(",") === [...oneCycle, ...oneCycle].join(","),
    `repeat state was not reset between P: loop cycles: ${repeatOffsets.join(",")}`
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
  console.log("% PASS abc2svg playback harness: drums, P: loops, repeated starts, and distant voltas are available");
}

try {
  main();
} catch (error) {
  console.error("% FAIL abc2svg playback harness:", error && error.message ? error.message : String(error));
  process.exit(1);
}
