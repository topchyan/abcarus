#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const bundled = await build({
  entryPoints: [resolve("src/renderer/abc/measure_input_assistance.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const {
  computeMeasureInputAssistance,
  planMeasureTabAction,
} = await import(`data:text/javascript;base64,${encoded}`);
const keymapBundle = await build({
  entryPoints: [resolve("src/renderer/editor/main_editor_keymap.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const keymapEncoded = Buffer.from(keymapBundle.outputFiles[0].text, "utf8").toString("base64");
const { runMeasureTab } = await import(`data:text/javascript;base64,${keymapEncoded}`);

function at(text, needle, offset = 0) {
  const index = text.indexOf(needle);
  assert.notEqual(index, -1, `Missing test needle: ${needle}`);
  return index + offset;
}

const base = `X:1
T:Input assistance
M:4/4
L:1/8
K:C
C2 D2 | E2 F2 G2 A2 | B2 c2 d2 e2 f2 |
`;

const incomplete = computeMeasureInputAssistance(base, at(base, "C2 D2", 2));
assert.equal(incomplete.state, "incomplete");
assert.equal(incomplete.text, "Measure 4/8");

const complete = computeMeasureInputAssistance(base, at(base, "E2 F2 G2 A2", 4));
assert.equal(complete.state, "complete");
assert.equal(complete.text, "Measure 8/8");

const overfull = computeMeasureInputAssistance(base, at(base, "B2 c2 d2 e2 f2", 6));
assert.equal(overfull.state, "overfull");
assert.equal(overfull.text, "Measure 10/8");

const contextual = `X:1
M:4/4
L:1/8
K:C
C2 D2 E2 F2 |
M:3/8
L:1/16
G2 A2 B2 |
`;
const local = computeMeasureInputAssistance(contextual, at(contextual, "G2 A2 B2", 3));
assert.equal(local.state, "complete");
assert.equal(local.text, "Measure 6/6");
assert.equal(local.meter, "3/8");
assert.equal(local.defaultLength, "1/16");

const none = `X:1
M:none
L:1/8
K:none
CDEF |
`;
assert.equal(computeMeasureInputAssistance(none, at(none, "CDEF", 2)), null);
assert.equal(computeMeasureInputAssistance(base, at(base, "T:Input", 2)), null);

const doubleRepeat = `X:1
M:3/4
L:1/8
K:Dm
D2 E2 F2 :: G2 A2 B2 ::
`;
const afterDoubleRepeat = computeMeasureInputAssistance(
  doubleRepeat,
  at(doubleRepeat, "G2 A2 B2", 4),
);
assert.equal(afterDoubleRepeat.state, "complete");
assert.equal(afterDoubleRepeat.text, "Measure 6/6");

const continuedSection = `X:241
M:C
L:1/8
K:Am
[P:C] \\
"BbM7" z2 {g}f e eddc | "Am" z2 {f}e d dccB | "G" z2 {e}d c cBAB | "C" c8 |  \\
"F" z2 AB AB c2 | "C/E" z2 Bc Bc d2 |`;
const continuedBarline = at(continuedSection, '"C" c8 |', 7);
const continuedSpace = continuedBarline + 1;
const continuedNextMeasure = at(continuedSection, '"F" z2 AB', 5);
assert.equal(computeMeasureInputAssistance(continuedSection, continuedBarline).text, "Measure 8/8");
assert.equal(computeMeasureInputAssistance(continuedSection, continuedSpace).text, "Measure 8/8");
assert.equal(computeMeasureInputAssistance(continuedSection, continuedNextMeasure).text, "Measure 8/8");

const commonTime = `X:1
M:C
L:1/4
K:C
C D E F |
`;
const common = computeMeasureInputAssistance(commonTime, at(commonTime, "C D E F", 3));
assert.equal(common.state, "complete");
assert.equal(common.text, "Measure 4/4");

const tabInsert = `X:1
M:4/4
L:1/8
K:C
C2 D2 E2 F2`;
assert.deepEqual(planMeasureTabAction(tabInsert, tabInsert.length), {
  action: "insert",
  from: tabInsert.length,
  insert: " | ",
  state: "complete",
  text: "Measure 8/8",
});
const tabTransactions = [];
const tabView = {
  state: {
    readOnly: false,
    doc: { toString: () => tabInsert },
    selection: {
      ranges: [{ from: tabInsert.length, to: tabInsert.length }],
      main: { from: tabInsert.length, to: tabInsert.length, head: tabInsert.length },
    },
  },
  dispatch: (transaction) => tabTransactions.push(transaction),
};
assert.equal(runMeasureTab(tabView), true);
assert.deepEqual(tabTransactions[0], {
  changes: { from: tabInsert.length, insert: " | " },
  selection: { anchor: tabInsert.length + 3 },
  userEvent: "input",
});

const tabAlignSource = `X:1
M:4/4
L:1/4
K:C
"Am" C D E F | G A B c |
C D E F`;
const tabAlignTransactions = [];
const tabAlignView = {
  state: {
    readOnly: false,
    doc: { toString: () => tabAlignSource },
    selection: {
      ranges: [{ from: tabAlignSource.length, to: tabAlignSource.length }],
      main: { from: tabAlignSource.length, to: tabAlignSource.length, head: tabAlignSource.length },
    },
  },
  dispatch: (transaction) => tabAlignTransactions.push(transaction),
};
assert.equal(runMeasureTab(tabAlignView), true);
assert.deepEqual(tabAlignTransactions[0], {
  changes: {
    from: 0,
    to: tabAlignSource.length,
    insert: `X:1
M:4/4
L:1/4
K:C
"Am" C D E F | G A B c |
C    D E F   |`,
  },
  selection: { anchor: `X:1
M:4/4
L:1/4
K:C
"Am" C D E F | G A B c |
C    D E F   |`.length },
  userEvent: "input",
});

const tabIncomplete = tabInsert.replace(" E2 F2", "");
assert.equal(planMeasureTabAction(tabIncomplete, tabIncomplete.length).action, "incomplete");

const tabOverfull = `${tabInsert} G2`;
assert.equal(planMeasureTabAction(tabOverfull, tabOverfull.length).action, "overfull");

const existingBar = `${tabInsert}   | G2`;
const beforeExistingBar = at(existingBar, "F2   |", 2);
const advance = planMeasureTabAction(existingBar, beforeExistingBar);
assert.equal(advance.action, "advance");
assert.equal(existingBar.slice(advance.to), "G2");

const continued = `X:573
T:Freedom Come All Ye
M:3/4
L:1/8
K:D
A>F|D2 D>E      FA|B2     A2\\
Bd |A2 G>A      FD|`;
const beforeContinuation = at(continued, "A2\\\nBd", 2);
assert.equal(planMeasureTabAction(continued, beforeContinuation).action, "incomplete");
const beforeContinuedBar = at(continued, "Bd |", 2);
assert.equal(planMeasureTabAction(continued, beforeContinuedBar).action, "advance");

const continuedWithoutBar = `X:1
M:3/4
L:1/8
K:D
B2 A2\\
Bd`;
assert.equal(planMeasureTabAction(continuedWithoutBar, continuedWithoutBar.length).action, "insert");

const completeBeforeContinuation = `X:1
M:3/4
L:1/8
K:D
B2 A2 Bd\\`;
const beforeContinuationPlan = planMeasureTabAction(
  completeBeforeContinuation,
  completeBeforeContinuation.length,
);
assert.equal(beforeContinuationPlan.action, "insert");
assert.equal(beforeContinuationPlan.from, completeBeforeContinuation.length - 1);

const multipleVoices = `X:1
M:4/4
L:1/8
K:C
V:1
C2 D2 E2 F2
V:2
G2 A2 B2 c2`;
assert.equal(planMeasureTabAction(multipleVoices, multipleVoices.length).action, "unsupported");

assert.equal(planMeasureTabAction("X:1\nM:none\nK:C\nCDEF", 21).action, "unsupported");
assert.equal(planMeasureTabAction(base, at(base, "T:Input", 2)), null);

console.log("measure input assistance tests: OK");
