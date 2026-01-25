// ABC file encoding helpers.
//
// ABC supports a directive like:
//   %%abc-charset iso-8859-1
// which indicates how the *file bytes* should be decoded.
//
// Important: this directive must be discovered *before* decoding the full file.
// We probe the first chunk as latin1 (ASCII-compatible) to read the directive safely.
//
// Keep this module dependency-free and tolerant-read / strict-write.

function parseAbcCharsetDirective(text) {
  const src = String(text || "");
  const m = src.match(/^%%\s*abc-charset\s+([^\s%]+)\s*$/gmi);
  if (!m || !m.length) return "";
  // Use the last directive if multiple exist (matches abc2svg's “last wins” behavior in many directives).
  const last = m[m.length - 1] || "";
  const mm = String(last).match(/^%%\s*abc-charset\s+([^\s%]+)\s*$/i);
  return mm ? String(mm[1] || "").trim() : "";
}

function resolveNodeEncodingFromAbcCharsetName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "";
  if (n === "iso-8859-1" || n === "iso8859-1" || n === "isolatin1" || n === "latin1") return "latin1";
  if (n === "utf-8" || n === "utf8" || n === "unicode-1-1-utf-8") return "utf8";
  return "";
}

function detectAbcTextEncodingFromBuffer(buf) {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ""), "utf8");
  const probe = buffer.subarray(0, 16 * 1024).toString("latin1");
  const declaredRaw = parseAbcCharsetDirective(probe);
  const encoding = resolveNodeEncodingFromAbcCharsetName(declaredRaw) || "utf8";
  return { encoding, declared: declaredRaw };
}

function decodeAbcTextFromBuffer(buf) {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ""), "utf8");
  const detected = detectAbcTextEncodingFromBuffer(buffer);
  const text = buffer.toString(detected.encoding);
  return { text, encoding: detected.encoding, declared: detected.declared };
}

function detectAbcTextEncodingFromText(text) {
  const head = String(text || "").slice(0, 64 * 1024);
  const declaredRaw = parseAbcCharsetDirective(head);
  const encoding = resolveNodeEncodingFromAbcCharsetName(declaredRaw) || "utf8";
  return { encoding, declared: declaredRaw };
}

function assertEncodableLatin1(text) {
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code > 0xff) {
      const ch = s[i];
      const label = ch ? JSON.stringify(ch) : "<char>";
      throw new Error(`Text is not encodable in iso-8859-1 (found ${label} U+${code.toString(16).toUpperCase()}).`);
    }
  }
}

function encodeAbcTextToBuffer(text) {
  const s = String(text == null ? "" : text);
  const detected = detectAbcTextEncodingFromText(s);
  if (detected.encoding === "latin1") {
    assertEncodableLatin1(s);
    return { buffer: Buffer.from(s, "latin1"), encoding: "latin1", declared: detected.declared };
  }
  return { buffer: Buffer.from(s, "utf8"), encoding: "utf8", declared: detected.declared };
}

module.exports = {
  decodeAbcTextFromBuffer,
  encodeAbcTextToBuffer,
  detectAbcTextEncodingFromBuffer,
  detectAbcTextEncodingFromText,
  resolveNodeEncodingFromAbcCharsetName,
};

