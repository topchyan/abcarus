const ARMENIAN_RE = /[\u0531-\u058f\ufb13-\ufb17]/u;
const LYRIC_LINE_RE = /^(\s*w:)(.*)$/iu;
const TEXT_FIELD_RE = /^(\s*)(T|C|O|A|R|S|N|Z|H|W):(.*)$/u;

const TRANSLITERATION_PROFILES = Object.freeze([
  { id: "hubschmann-meillet", label: "Classical scholarly (Hübschmann-Meillet)", shortLabel: "Hübschmann-Meillet" },
  { id: "bgn-pcgn", label: "Readable Latin (BGN/PCGN)", shortLabel: "BGN/PCGN" },
  { id: "iso-9985", label: "ISO 9985 (Latin, reversible)", shortLabel: "ISO 9985" },
  { id: "ipa-eastern", label: "Eastern Armenian (IPA)", shortLabel: "Eastern IPA" },
  { id: "ipa-western", label: "Western Armenian (IPA)", shortLabel: "Western IPA" },
]);

function collectLyricLines(abcText) {
  return String(abcText || "")
    .split(/\r\n|\n|\r/)
    .map((line, index) => {
      const match = line.match(LYRIC_LINE_RE);
      return match ? { index, prefix: match[1], body: match[2], line } : null;
    })
    .filter(Boolean);
}

function hasArmenianLyrics(abcText) {
  return collectLyricLines(abcText).some((entry) => ARMENIAN_RE.test(entry.body));
}

function transliterateLyricLines(abcText, { standard, transliterate } = {}) {
  if (typeof transliterate !== "function") throw new Error("Armenian transliteration engine is unavailable.");
  return collectLyricLines(abcText).map((entry) => (
    `${entry.prefix}${transliterate(entry.body, { standard })}`
  ));
}

function parseEditedLyricLines(text) {
  const rawLines = String(text || "").split(/\r\n|\n|\r/);
  if (rawLines.length && rawLines.at(-1) === "") rawLines.pop();
  return rawLines.map((line) => {
    const match = line.match(LYRIC_LINE_RE);
    if (!match) throw new Error("Every generated lyric row must start with w:.");
    return `${match[1]}${match[2]}`;
  });
}

function addTransliterationNote(abcText, profileLabel) {
  const lines = String(abcText || "").split(/\r\n|\n|\r/);
  const note = `N:Lyrics transliterated from Armenian (${profileLabel}, experimental)`;
  const keyIndex = lines.findIndex((line) => /^\s*K:/i.test(line));
  lines.splice(keyIndex >= 0 ? keyIndex : Math.min(1, lines.length), 0, note);
  return lines.join("\n");
}

function transliterateAdditionalText(abcText, {
  mode = "both",
  standard,
  transliterate,
} = {}) {
  if (typeof transliterate !== "function") throw new Error("Armenian transliteration engine is unavailable.");
  const lines = String(abcText || "").split(/\r\n|\n|\r/);
  const output = [];
  let inTextBlock = false;
  let textBlockOriginal = [];
  let textBlockGenerated = [];

  const transliterateQuotedText = (line) => String(line || "").replace(/"([^"]*)"/g, (quoted, body) => (
    ARMENIAN_RE.test(body) ? `"${transliterate(body, { standard })}"` : quoted
  ));

  for (const line of lines) {
    if (/^\s*%%begintext\b/i.test(line)) {
      inTextBlock = true;
      textBlockOriginal = [];
      textBlockGenerated = [];
      output.push(line);
      continue;
    }
    if (inTextBlock && /^\s*%%endtext\b/i.test(line)) {
      const hasArmenianText = textBlockOriginal.some((textLine) => ARMENIAN_RE.test(textLine));
      if (!hasArmenianText) {
        output.push(...textBlockOriginal);
      } else if (mode === "both") {
        output.push(...textBlockOriginal, "", ...textBlockGenerated);
      } else {
        output.push(...textBlockGenerated);
      }
      output.push(line);
      inTextBlock = false;
      continue;
    }
    if (inTextBlock) {
      textBlockOriginal.push(line);
      textBlockGenerated.push(ARMENIAN_RE.test(line) ? transliterate(line, { standard }) : line);
      continue;
    }

    const field = line.match(TEXT_FIELD_RE);
    if (!field || !ARMENIAN_RE.test(field[3])) {
      const textDirective = line.match(/^(\s*%%(?:text|center|left|right)\s+)(.*)$/i);
      if (textDirective && ARMENIAN_RE.test(textDirective[2])) {
        output.push(`${textDirective[1]}${transliterate(textDirective[2], { standard })}`);
      } else {
        output.push(transliterateQuotedText(line));
      }
      continue;
    }
    const generated = `${field[1]}${field[2]}:${transliterate(field[3], { standard })}`;
    if (field[2] === "W" && mode === "both") output.push(line, generated);
    else output.push(generated);
  }

  if (inTextBlock) output.push(...(mode === "both" ? textBlockOriginal : []), ...textBlockGenerated);
  return output.join("\n");
}

function buildTransliteratedTune(abcText, generatedLyricsText, {
  mode = "both",
  profileLabel = "experimental",
} = {}) {
  const source = String(abcText || "");
  const sourceLyrics = collectLyricLines(source);
  const generated = parseEditedLyricLines(generatedLyricsText);
  if (!sourceLyrics.length) throw new Error("The active tune has no w: lyric lines.");
  if (generated.length !== sourceLyrics.length) {
    throw new Error(`Expected ${sourceLyrics.length} generated w: lines, found ${generated.length}.`);
  }

  const generatedByLine = new Map(sourceLyrics.map((entry, index) => [entry.index, generated[index]]));
  const output = [];
  String(source).split(/\r\n|\n|\r/).forEach((line, index) => {
    const replacement = generatedByLine.get(index);
    if (replacement == null) output.push(line);
    else if (mode === "transliterated") output.push(replacement);
    else output.push(line, replacement);
  });
  return addTransliterationNote(output.join("\n"), profileLabel);
}

function joinFileHeaderAndTune(headerText, tuneText) {
  const header = String(headerText || "").trimEnd();
  const tune = String(tuneText || "").trimStart();
  return header ? `${header}\n\n${tune.trimEnd()}\n` : `${tune.trimEnd()}\n`;
}

function prepareTransliteratedCopy(abcText, { xNumber = 1 } = {}) {
  const lines = String(abcText || "").split(/\r\n|\n|\r/);
  const xIndex = lines.findIndex((line) => /^\s*X:/i.test(line));
  if (xIndex >= 0) lines[xIndex] = lines[xIndex].replace(/^(\s*X:\s*).*$/i, `$1${xNumber}`);
  else lines.unshift(`X:${xNumber}`);
  return lines.join("\n");
}

function insertTuneAfterOffset(fileText, tuneText, endOffset) {
  const content = String(fileText || "");
  const offset = Number(endOffset);
  if (!Number.isFinite(offset) || offset < 0 || offset > content.length) {
    throw new Error("Active tune boundaries are stale. Refresh the Library and try again.");
  }
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  let before = content.slice(0, offset);
  let inserted = String(tuneText || "").replace(/\s+$/, "");
  let after = content.slice(offset);
  if (before && !/\r?\n$/.test(before)) before += newline;
  if (before && !/\r?\n\r?\n$/.test(before)) before += newline;
  inserted += newline;
  if (after && !/^\r?\n/.test(after)) inserted += newline;
  else if (/^\r?\n/.test(after)) after = after.replace(/^\r?\n/, "");
  return `${before}${inserted}${after}`;
}

function suggestTransliteratedFileName(filePath, {
  fallback = "transliterated.abc",
  xNumber = "",
  title = "",
  profileId = "",
} = {}) {
  const name = String(filePath || "").split(/[\\/]/).pop() || fallback;
  const base = name.replace(/\.abc$/i, "") || "transliterated";
  const parts = [base];
  if (String(xNumber || "").trim()) parts.push(`X${String(xNumber).trim()}`);
  if (String(title || "").trim()) parts.push(String(title).trim());
  const suffix = ` - transliterated${profileId ? `-${profileId}` : ""}.abc`;
  const maxPrefixLength = Math.max(24, 120 - suffix.length);
  const prefix = parts.join(" - ").slice(0, maxPrefixLength).replace(/[. ]+$/g, "") || "transliterated";
  return `${prefix}${suffix}`;
}

export {
  TRANSLITERATION_PROFILES,
  buildTransliteratedTune,
  collectLyricLines,
  hasArmenianLyrics,
  insertTuneAfterOffset,
  joinFileHeaderAndTune,
  parseEditedLyricLines,
  prepareTransliteratedCopy,
  suggestTransliteratedFileName,
  transliterateAdditionalText,
  transliterateLyricLines,
};
