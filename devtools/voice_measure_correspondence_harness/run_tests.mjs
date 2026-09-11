#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const bundled = await build({
  entryPoints: [resolve("src/renderer/abc/voice_measure_correspondence_model.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const {
  analyzeVoiceMeasureCorrespondence,
  getCorrespondingMeasureRanges,
  getReferenceMeasureRangeAt,
} = await import(`data:text/javascript;base64,${encoded}`);

const matched = `X:1
M:2/4
L:1/8
K:C
V:1
|: C2 D2 |1 E2 F2 :|2 G2 A2 |]
V:2
|: x4 |1 x4 :|2 x4 |]
`;
const matchedAnalysis = analyzeVoiceMeasureCorrespondence(matched);
assert.equal(matchedAnalysis.compatible, true);
assert.equal(matchedAnalysis.voices.get("1").length, 3);
assert.equal(matchedAnalysis.voices.get("2").length, 3);
const targetOffset = matched.lastIndexOf("x4") + 1;
const correspondence = getCorrespondingMeasureRanges(matched, targetOffset);
assert.equal(correspondence.ranges.length, 1);
assert.equal(correspondence.ranges[0].voiceId, "1");
assert.equal(correspondence.ranges[0].barNumber, 3);
assert.match(matched.slice(correspondence.ranges[0].from, correspondence.ranges[0].to), /G2 A2/);

const referenceRange = getReferenceMeasureRangeAt(matched, targetOffset).range;
assert.equal(referenceRange.voiceId, "1");
assert.equal(referenceRange.sourceVoiceId, "2");
assert.equal(referenceRange.barNumber, 3);
assert.match(matched.slice(referenceRange.from, referenceRange.to), /G2 A2/);

const primaryOffset = matched.indexOf("E2 F2") + 1;
const primaryRange = getReferenceMeasureRangeAt(matched, primaryOffset).range;
assert.equal(primaryRange.voiceId, "1");
assert.equal(primaryRange.sourceVoiceId, "1");
assert.equal(primaryRange.barNumber, 2);

const countMismatch = matched.replace("|: x4 |1 x4 :|2 x4 |]", "|: x4 |1 x4 |]");
const countAnalysis = analyzeVoiceMeasureCorrespondence(countMismatch);
assert.equal(countAnalysis.compatible, false);
assert.match(countAnalysis.mismatches[0].detail, /has 2 measures; V:1 has 3/);

const voltaMismatch = matched.replace("|: x4 |1 x4 :|2 x4 |]", "|: x4 |2 x4 :|2 x4 |]");
const voltaAnalysis = analyzeVoiceMeasureCorrespondence(voltaMismatch);
assert.equal(voltaAnalysis.compatible, false);
assert.match(voltaAnalysis.mismatches[0].detail, /different repeat or volta at bar 1/);

console.log("voice measure correspondence tests: OK");
