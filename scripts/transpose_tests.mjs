import assert from "assert";
import { transformTranspose, parseABCToPitchEvents } from "../src/renderer/transpose.mjs";

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run("parses pitch events", () => {
  const events = parseABCToPitchEvents("K:none\nCDE\n");
  assert.strictEqual(events.length, 3);
});

run("chromatic transpose K:none (+1, flat)", () => {
  const input = "X:1\nK:none\nCDEFGABc\n";
  const expected = "X:1\nK:none\n_D_EF_G_A_Bc_d\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("tonal transpose K:C (+1 -> Db)", () => {
  const input = "X:1\nK:C\nCDEFGABc\n";
  const expected = "X:1\nK:Db\nDEFGABcd\n";
  const output = transformTranspose(input, 1, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("bar accidentals reset", () => {
  const input = "X:1\nK:C\n^F F F|F\n";
  const expected = "X:1\nK:C\n_G G G|F\n";
  const output = transformTranspose(input, 0, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("key signature accidental defaults", () => {
  const input = "X:1\nK:G\nF F|F\n";
  const expected = "X:1\nK:G\nF F|F\n";
  const output = transformTranspose(input, 0, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("quarter-tone transpose K:none", () => {
  const input = "X:1\nK:none\n^/D _/D | D\n";
  const expected = "X:1\nK:none\n_/E ^/D | _E\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("quarter-tone respell flat preference", () => {
  const input = "X:1\nK:none\n^/C\n";
  const expected = "X:1\nK:none\n^/C\n";
  const output = transformTranspose(input, 0, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("quoted text untouched", () => {
  const input = "X:1\nK:none\n\"CDE\" CDE\n";
  const expected = "X:1\nK:none\n\"CDE\" _D_EF\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("inline directives untouched", () => {
  const input = "X:1\nK:none\n[I:some CDE] CDE\n";
  const expected = "X:1\nK:none\n[I:some CDE] _D_EF\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("bang directives untouched", () => {
  const input = "X:1\nK:none\n!fine! CDE !D.S.alfine!\n";
  const expected = "X:1\nK:none\n!fine! _D_EF !D.S.alfine!\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("key signature microtonal accidental transposed", () => {
  const input = "X:1\nK:none ^/f clef=treble\nf\n";
  const expected = "X:1\nK:none ^/g clef=treble\n^/g\n";
  const output = transformTranspose(input, 2, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});
