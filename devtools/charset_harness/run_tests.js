#!/usr/bin/env node
const { decodeAbcTextFromBuffer, encodeAbcTextToBuffer } = require("../../src/main/abcCharset");

function fail(msg) {
  throw new Error(msg);
}

function assertEq(label, a, b) {
  if (a !== b) fail(`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function main() {
  // 1) ISO-8859-1 decode via directive.
  // "é" in latin1 is 0xE9. We embed bytes directly so UTF-8 decoding would be wrong.
  const latin1Bytes = Buffer.from(
    "%%abc-charset iso-8859-1\nX:1\nT:Caf\u00E9\nK:C\nC\n",
    "latin1"
  );
  const decoded = decodeAbcTextFromBuffer(latin1Bytes);
  assertEq("decode.encoding", decoded.encoding, "latin1");
  if (!decoded.text.includes("Café")) fail("decode: expected latin1 text to contain Café");

  // 2) UTF-8 default when no directive.
  const utf8Bytes = Buffer.from("X:1\nT:Café\nK:C\nC\n", "utf8");
  const decodedUtf8 = decodeAbcTextFromBuffer(utf8Bytes);
  assertEq("decodeUtf8.encoding", decodedUtf8.encoding, "utf8");
  if (!decodedUtf8.text.includes("Café")) fail("decodeUtf8: expected utf8 text to contain Café");

  // 3) latin1 strict-write: reject non-latin1 code points.
  let threw = false;
  try {
    encodeAbcTextToBuffer("%%abc-charset iso-8859-1\nX:1\nT:Snowman ☃\nK:C\nC\n");
  } catch {
    threw = true;
  }
  if (!threw) fail("encode: expected latin1 encoding to reject non-latin1 characters");

  // 4) latin1 round-trip.
  const encoded = encodeAbcTextToBuffer("%%abc-charset iso-8859-1\nX:1\nT:Café\nK:C\nC\n");
  assertEq("encode.encoding", encoded.encoding, "latin1");
  const decoded2 = decodeAbcTextFromBuffer(encoded.buffer);
  if (!decoded2.text.includes("Café")) fail("round-trip: expected Café");

  process.stdout.write("PASS charset harness\n");
}

try {
  main();
} catch (e) {
  process.stdout.write(`FAIL charset harness: ${e && e.message ? e.message : String(e)}\n`);
  process.exitCode = 1;
}

