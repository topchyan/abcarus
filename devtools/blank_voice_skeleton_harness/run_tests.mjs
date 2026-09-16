#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const bundled = await build({
  entryPoints: [resolve("src/renderer/abc/blank_voice_skeleton.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const { planBlankVoiceSkeleton } = await import(`data:text/javascript;base64,${encoded}`);

const source = `X:1
T:Skeleton
M:4/4
L:1/8
K:C
V:1 clef=treble
V:2 clef=bass
V:1
C2 D2 E2 F2 | G2 A2 B2 c2 |:
V:2
%%voicecolor gray
x8 | x8 |:
W:Words must remain outside the voice block
`;

const targetOffset = source.indexOf("x8 | x8") + 1;
const plan = planBlankVoiceSkeleton(source, { sourceVoiceId: "1", targetOffset });
assert.equal(plan.ok, true);
assert.equal(plan.sourceVoiceId, "1");
assert.equal(plan.targetVoiceId, "2");
assert.equal(plan.targetHasPitchedMusic, false);
assert.equal(plan.change.insert, "%%voicecolor gray\nx8 | x8 |:\n");
const updated = `${source.slice(0, plan.change.from)}${plan.change.insert}${source.slice(plan.change.to)}`;
assert.match(updated, /V:2\n%%voicecolor gray\nx8 \| x8 \|:\nW:Words must remain outside the voice block/);

const alteredTarget = source.replace("x8 | x8 |:", "G2 A2 B2 c2 | x8 |:");
const alteredPlan = planBlankVoiceSkeleton(alteredTarget, {
  sourceVoiceId: "1",
  targetOffset: alteredTarget.lastIndexOf("G2 A2") + 1,
});
assert.equal(alteredPlan.ok, true);
assert.equal(alteredPlan.targetHasPitchedMusic, true);

const sameVoice = planBlankVoiceSkeleton(source, {
  sourceVoiceId: "1",
  targetOffset: source.indexOf("C2 D2") + 1,
});
assert.deepEqual(sameVoice, { ok: false, error: "Choose a different target voice." });

const repeatSource = `X:2
M:2/4
L:1/8
K:C
V:1
|: C2 D2 |1 E2 F2 :|2 G2 A2 |]
V:2
x4 | x4 | x4 |]
`;
const repeatPlan = planBlankVoiceSkeleton(repeatSource, {
  targetOffset: repeatSource.lastIndexOf("x4") + 1,
});
assert.equal(repeatPlan.ok, true);
assert.match(repeatPlan.change.insert, /^\|: x4 \|1 x4 :\|2 x4 \|\]\n$/);

const variableMeterSource = `X:3
M:2/4
L:1/8
K:C
V:1
[P:A]
C2 D2 |
[M:3/4] E2 F2 G2 |
[P:B]
[M:2/4] A2 B2 |]
V:2
x4 | x6 | x4 |]
`;
const variableMeterPlan = planBlankVoiceSkeleton(variableMeterSource, {
  targetOffset: variableMeterSource.lastIndexOf("x4") + 1,
});
assert.equal(variableMeterPlan.ok, true);
assert.equal(
  variableMeterPlan.change.insert,
  "[P:A]\nx4 |\n[M:3/4] x6 |\n[P:B]\n[M:2/4] x4 |]\n",
);

console.log("blank voice skeleton tests: OK");
