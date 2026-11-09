#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "../..");
const candidateDir = process.env.ABC2SVG_CANDIDATE_DIR
  ? path.resolve(process.env.ABC2SVG_CANDIDATE_DIR)
  : null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadSandbox() {
  assert(candidateDir, "Set ABC2SVG_CANDIDATE_DIR to the built abc2svg candidate directory");
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    navigator: {},
    alert() {},
    prompt() { return null; },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    exports: {},
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ["abc2svg-1.js", "MIDI-1.js", "perc-1.js", "swing-1.js", "snd-1.js"]) {
    const filePath = path.join(candidateDir, file);
    assert(fs.existsSync(filePath), `Candidate is missing ${file}`);
    vm.runInContext(fs.readFileSync(filePath, "utf8"), sandbox, { filename: filePath });
  }
  return sandbox;
}

function parse(sandbox, source) {
  const errors = [];
  const abc = new sandbox.abc2svg.Abc({
    img_out() {},
    err(message) { errors.push(String(message || "")); },
    errmsg(message) { errors.push(String(message || "")); },
    anno_start() {},
    anno_stop() {},
  });
  abc.tosvg("upgrade-gate", source);
  assert(abc.tunes.length === 1, "Candidate did not produce one tune model");
  return { abc, tune: abc.tunes[0], errors };
}

function symbols(first) {
  const result = [];
  const seen = new Set();
  for (let symbol = first; symbol && !seen.has(symbol); symbol = symbol.ts_next) {
    seen.add(symbol);
    result.push(symbol);
  }
  return result;
}

function approx(actual, expected, label) {
  assert(Math.abs(Number(actual) - expected) < 0.01, `${label}: expected ${expected}, got ${actual}`);
}

const BLOCK_OWNERSHIP = `X:1
T:Formatting block ownership
M:4/4
L:1/4
%%score (S A) (T B)
K:C
V:S
C4|
V:A
E4|
V:T
G,4|
V:B
C,4|
%%vskip 12
%%leftmargin 1.5cm
%%rightmargin 1.5cm
%%scale 0.95
%%staffwidth 15cm
%%begintext
Formatting text
%%endtext
%%multicol start
%%begintext
Column one
%%endtext
%%multicol new
%%begintext
Column two
%%endtext
%%multicol end
`;

const PLAYBACK_BLOCKS = `X:2
T:Playback block ownership
M:4/4
L:1/8
K:C
V:1
CDEF GABc|]
V:2 perc=MIDIdrum
%%playswing 60 0 40
%%MIDI program 41
%%MIDI control 7 100
%%MIDI gchordon
%%MIDI drumon
CDEF GABc|]
`;

const SWING_SIMPLE = `X:3
T:Simple swing timing
M:4/4
L:1/8
K:C
%%playswing 60 0 40
C D E F|]
`;

const VALID_CLEFS = `X:4
T:Exact clef forms
M:4/4
L:1/4
K:C
V:1 clef=G
C4|]
V:2 clef=G2
C4|]
V:3 clef=G+8
C4|]
V:4 clef=F4-8
C4|]
V:5 clef=C3^8
C4|]
`;

function main() {
  const sandbox = loadSandbox();
  const version = `${sandbox.abc2svg.version || "unknown"} ${sandbox.abc2svg.vdate || ""}`.trim();

  const ownership = parse(sandbox, BLOCK_OWNERSHIP);
  assert(ownership.errors.length === 0, `formatting fixture errors: ${ownership.errors.join("; ")}`);
  const blockType = sandbox.abc2svg.C.BLOCK;
  const formattingBlocks = symbols(ownership.tune[0]).filter((symbol) => (
    symbol.type === blockType
    && ["vskip", "leftmargin", "rightmargin", "scale", "staffwidth", "text"].includes(symbol.subtype)
  ));
  assert(formattingBlocks.length >= 6, `expected formatting blocks, got ${formattingBlocks.map((s) => s.subtype).join(",")}`);
  const misplaced = formattingBlocks.filter((symbol) => String(symbol.p_v && symbol.p_v.id) !== "S");
  assert(
    misplaced.length === 0,
    `formatting blocks remained in a secondary voice: ${misplaced.map((s) => `${s.subtype}:${s.p_v && s.p_v.id}`).join(", ")}`
  );

  const playback = parse(sandbox, PLAYBACK_BLOCKS);
  assert(playback.errors.length === 0, `playback-block fixture errors: ${playback.errors.join("; ")}`);
  const playbackSubtypes = ["swing", "midiprog", "midictl", "midigch", "mididrum"];
  const playbackBlocks = symbols(playback.tune[0]).filter((symbol) => playbackSubtypes.includes(symbol.subtype));
  const foundSubtypes = new Set(playbackBlocks.map((symbol) => symbol.subtype));
  for (const subtype of playbackSubtypes) {
    assert(foundSubtypes.has(subtype), `expected ${subtype} playback block, got ${[...foundSubtypes].join(",")}`);
  }
  for (const symbol of playbackBlocks) {
    assert(
      String(symbol.p_v && symbol.p_v.id) === "2",
      `${symbol.subtype} moved out of voice 2: ${playbackBlocks.map((s) => `${s.subtype}:${s.p_v && s.p_v.id}`).join(", ")}`
    );
    assert(symbol.play && symbol.invis, `${symbol.subtype} is no longer a playback-only invisible block`);
  }

  const swing = parse(sandbox, SWING_SIMPLE);
  assert(swing.errors.length === 0, `swing fixture errors: ${swing.errors.join("; ")}`);
  sandbox.ToAudio().add(swing.tune[0], swing.tune[1], swing.tune[3]);
  const notes = symbols(swing.tune[0]).filter((symbol) => Array.isArray(symbol.notes) && Number(symbol.dur) > 0);
  assert(notes.length >= 2, "swing fixture has fewer than two playable notes");
  approx(notes[0].dur, 230.4, "first swung eighth duration");
  approx(notes[1].time, 230.4, "second swung eighth start");
  approx(notes[1].dur, 153.6, "second swung eighth duration");

  const clefs = parse(sandbox, VALID_CLEFS);
  assert(clefs.errors.length === 0, `valid clef forms reported errors: ${clefs.errors.join("; ")}`);

  const sndSource = fs.readFileSync(path.join(candidateDir, "snd-1.js"), "utf8");
  assert(
    sndSource.includes("linearRampToValueAtTime(0,t+d+parm.release)"),
    "SoundFont release does not ramp to silent gain"
  );
  assert(
    !sndSource.includes("sort((a,b)=>{(a.generator.velRange?.lo||0)"),
    "SoundFont velocity-layer comparator has a block body without a return value"
  );

  console.log(`abc2svg upgrade gate: all tests passed (${version})`);
}

try {
  main();
} catch (error) {
  console.error("abc2svg upgrade gate failed:", error && error.message ? error.message : String(error));
  process.exit(1);
}
