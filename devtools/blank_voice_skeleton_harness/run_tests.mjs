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
assert.equal(sameVoice.ok, true);
assert.equal(sameVoice.targetVoiceId, "2");
assert.equal(sameVoice.createdTarget, false);
assert.equal(sameVoice.change.insert, "%%voicecolor gray\nx8 | x8 |:\n");

const missingTargetSource = `X:68
%%score (1 2) (3 4)
T:Groong ousdi gookas
M:3/4
L:1/8
K:Cm
V:1 stem=up
c c | d4 e>d | c6 |
c4 z | F6 ||

% V:2 stem=down
% E2 | F4 G>F | E6 |
`;
const createTargetPlan = planBlankVoiceSkeleton(missingTargetSource, {
  sourceVoiceId: "1",
  targetOffset: missingTargetSource.indexOf("c c |") + 1,
});
assert.equal(createTargetPlan.ok, true);
assert.equal(createTargetPlan.targetVoiceId, "2");
assert.equal(createTargetPlan.createdTarget, true);
assert.match(createTargetPlan.change.insert, /^V:2\nx2 \| x6 \| x6 \|\nx5 \| x6 \|\|\n$/);
const createdTargetText = `${missingTargetSource.slice(0, createTargetPlan.change.from)}${createTargetPlan.change.insert}${missingTargetSource.slice(createTargetPlan.change.to)}`;
assert.match(createdTargetText, /% E2 \| F4 G>F \| E6 \|\nV:2\nx2 \| x6 \| x6 \|/);

const visibleTargetPlan = planBlankVoiceSkeleton(missingTargetSource, {
  sourceVoiceId: "1",
  targetOffset: missingTargetSource.indexOf("c c |") + 1,
  restSymbol: "z",
});
assert.equal(visibleTargetPlan.ok, true);
assert.match(visibleTargetPlan.change.insert, /^V:2\nz2 \| z6 \| z6 \|\nz5 \| z6 \|\|\n$/);

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
