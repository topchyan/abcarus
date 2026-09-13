import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ABC_TRANSPOSE_API_VERSION,
  transposeAbc,
} from "../../src/shared/abc-transpose/index.mjs";

const fixtureUrl = new URL("../../src/shared/abc-transpose/fixtures/v1.json", import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));

assert.equal(ABC_TRANSPOSE_API_VERSION, "abcarus.abc-transpose.v1");
assert.equal(fixture.schema, "abcarus.abc-transpose.fixtures.v1");

for (const testCase of fixture.cases) {
  const result = transposeAbc(testCase);
  assert.equal(result.ok, true, `${testCase.id}: ${result.error || "failed"}`);
  assert.equal(result.apiVersion, ABC_TRANSPOSE_API_VERSION, testCase.id);
  assert.equal(result.edo, testCase.expectedEdo, testCase.id);
  assert.equal(result.strategy, testCase.expectedStrategy, testCase.id);
  assert.equal(result.text, testCase.expectedText, testCase.id);
}

const invalid = transposeAbc({ sourceText: "X:1\nK:C\nC|\n", semitones: 1.5 });
assert.equal(invalid.ok, false);
assert.equal(invalid.code, "INVALID_ARGUMENT");

console.log(`transpose contract: ${fixture.cases.length} portable fixtures passed`);
