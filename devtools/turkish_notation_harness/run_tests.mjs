#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/renderer/tools/transforms/abc_transform_feature.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const source = result.outputFiles[0].text;
const encoded = Buffer.from(source, "utf8").toString("base64");
const { createAbcTransformFeature } = await import(`data:text/javascript;base64,${encoded}`);

const input = [
  "X:141",
  "T:Turkish sample",
  "M:10/16",
  "L:1/8",
  "Q:1/8=120",
  "K:C _2B^3f",
  "%%MIDI temperamentequal 53",
  "V:1 clef=treble transpose=-17",
  '"Am" C D E F G A B c | ^4F _1B =B |',
].join("\n");
let output = input;
const statuses = [];
let turkishAlignCalls = 0;
const feature = createAbcTransformFeature({
  windowRef: {},
  getEditorText: () => output,
  getHeaderText: () => "",
  getSettings: () => ({
    useNativeTranspose: true,
    supportMicrotonalNotation: true,
  }),
  alignBarsInText: (text) => {
    turkishAlignCalls += 1;
    return text;
  },
  applyTransformedText: (text) => { output = text; },
  setStatus: (status) => statuses.push(status),
  showTransformError: async (message) => { throw new Error(message); },
});

await feature.apply({ turkishNotation: { direction: "toConcert" } });
assert.equal(turkishAlignCalls, 1, "Bolahenk/concert conversion should align rewritten notation");
assert.match(output, /^M:10\/16$/m);
assert.match(output, /^L:1\/8$/m);
assert.match(output, /^Q:1\/8=120$/m);
assert.match(output, /^K:none \^3c \^3f$/m);
assert.match(output, /^%%MIDI temperamentequal 53$/m);
assert.match(output, /transpose\s*=\s*-17/);
assert.match(output, /^"Em" G, A, B, C D E F G \| \^4C \^4F \^5F \|$/m);
assert.equal(statuses.at(-1), "Converted (experimental)");

await feature.apply({ turkishNotation: { direction: "toBolahenk" } });
assert.equal(turkishAlignCalls, 2, "reverse Bolahenk/concert conversion should align rewritten notation");
assert.match(output, /^M:10\/16$/m);
assert.match(output, /^L:1\/8$/m);
assert.match(output, /^Q:1\/8=120$/m);
assert.match(output, /^K:none \^3f _\/B$/m);
assert.match(output, /^%%MIDI temperamentequal 53$/m);
assert.match(output, /transpose\s*=\s*-17/);
assert.match(output, /^"Am" C D E F G A B c \| \^4F _1B =B \|$/m);

let disabledError = "";
const disabledFeature = createAbcTransformFeature({
  windowRef: {},
  getEditorText: () => input,
  getSettings: () => ({ supportMicrotonalNotation: false }),
  showTransformError: async (message) => { disabledError = message; },
});
await disabledFeature.apply({ turkishNotation: { direction: "toConcert" } });
assert.match(disabledError, /Enable Support microtonal notation/);

const rhythmInput = [
  "X:1",
  "M:10/8",
  "L:1/8",
  "Q:1/8=120",
  "K:C",
  'C2 D2 E2 F2 G2 | [M:6/8][L:1/16][Q:"Fast" 1/8=180] C6 | "[M:7/8]" % [M:9/8]',
].join("\n");
let rhythmOutput = rhythmInput;
let rhythmAlignCalls = 0;
const rhythmFeature = createAbcTransformFeature({
  windowRef: {},
  getEditorText: () => rhythmOutput,
  getSettings: () => ({}),
  alignBarsInText: (text) => {
    rhythmAlignCalls += 1;
    return text;
  },
  applyTransformedText: (text) => { rhythmOutput = text; },
  showTransformError: async (message) => { throw new Error(message); },
});

await rhythmFeature.apply({ doubleLengths: true });
assert.equal(rhythmAlignCalls, 1, "Double should align rewritten notation");
assert.match(rhythmOutput, /^M:10\/8$/m);
assert.match(rhythmOutput, /^L:1\/16$/m);
assert.match(rhythmOutput, /^Q:1\/8=120$/m);
assert.match(rhythmOutput, /^C4 D4 E4 F4 G4 \| \[M:6\/8\]\[L:1\/16\]\[Q:"Fast" 1\/8=180\] C12 \| "\[M:7\/8\]" % \[M:9\/8\]$/m);
await rhythmFeature.apply({ halfLengths: true });
assert.equal(rhythmAlignCalls, 2, "Half should align rewritten notation");
assert.equal(rhythmOutput, rhythmInput, "Double/Half must remain an exact ABC re-encoding round trip");

await rhythmFeature.apply({ mertebe: "augment" });
assert.equal(rhythmAlignCalls, 3, "Mertebe augment should align rewritten notation");
assert.match(rhythmOutput, /^M:10\/4$/m);
assert.match(rhythmOutput, /^L:1\/4$/m);
assert.match(rhythmOutput, /^Q:1\/4=120$/m);
assert.match(rhythmOutput, /^C2 D2 E2 F2 G2 \| \[M:6\/4\]\[L:1\/8\]\[Q:"Fast" 1\/4=180\] C6 \| "\[M:7\/8\]" % \[M:9\/8\]$/m);
await rhythmFeature.apply({ mertebe: "diminish" });
assert.equal(rhythmAlignCalls, 4, "Mertebe diminish should align rewritten notation");
assert.equal(rhythmOutput, rhythmInput, "Mertebe augment/diminish must be an exact notation-value round trip");

let transposeOutput = [
  "X:2",
  "M:4/4",
  "L:1/4",
  "K:C",
  "C D E F | G A B c |",
].join("\n");
let transposeAlignCalls = 0;
const transposeFeature = createAbcTransformFeature({
  windowRef: {},
  getEditorText: () => transposeOutput,
  getHeaderText: () => "",
  getSettings: () => ({ useNativeTranspose: true }),
  alignBarsInText: (text) => {
    transposeAlignCalls += 1;
    return text;
  },
  applyTransformedText: (text) => { transposeOutput = text; },
  showTransformError: async (message) => { throw new Error(message); },
});
await transposeFeature.apply({ transposeSemitones: 1 });
assert.equal(transposeAlignCalls, 1, "Transpose should align rewritten notation");

let layoutOutput = [
  "X:3",
  "M:4/4",
  "L:1/4",
  "I:linebreak $",
  "K:C",
  "C D E F | $ G A B c |",
].join("\n");
let layoutAlignCalls = 0;
const layoutFeature = createAbcTransformFeature({
  windowRef: {},
  getEditorText: () => layoutOutput,
  alignBarsInText: (text) => {
    layoutAlignCalls += 1;
    return text;
  },
  applyTransformedText: (text) => { layoutOutput = text; },
  showTransformError: async (message) => { throw new Error(message); },
});
await layoutFeature.apply({ linebreakMarker: true });
assert.equal(layoutAlignCalls, 1, "Linebreak reflow should align rewritten notation");
await layoutFeature.apply({ measuresPerLine: 1 });
assert.equal(layoutAlignCalls, 2, "Measures-per-line should align rewritten notation");

console.log("turkish notation harness: all tests passed");
