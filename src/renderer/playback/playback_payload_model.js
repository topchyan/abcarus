function normalizeLeadingInlineDirectivesForPlayback(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  const tokenRe = /^\[\s*([A-Za-z]+)\s*:\s*([^\]]*)\]\s*/;

  for (const rawLine of lines) {
    const indent = String(rawLine || "").match(/^[\t ]*/)?.[0] ?? "";
    let rest = String(rawLine || "").slice(indent.length);
    if (!rest.startsWith("[")) {
      out.push(rawLine);
      continue;
    }

    const directives = [];
    const keptTokens = [];
    let consumedAny = false;

    while (rest.startsWith("[")) {
      const match = rest.match(tokenRe);
      if (!match) break;
      consumedAny = true;
      const rawToken = match[0];
      const field = String(match[1] || "").trim().toUpperCase();
      const value = String(match[2] || "").trim();
      rest = rest.slice(rawToken.length);

      let converted = null;
      if ((field === "M" || field === "L" || field === "Q") && value) {
        converted = `${field}:${value}`;
      } else if (field === "I" && /^MIDI\s+/i.test(value)) {
        const cleaned = value.replace(/^MIDI\s+/i, "").trim();
        if (cleaned) converted = `%%MIDI ${cleaned}`;
      }

      if (converted) {
        directives.push(`${indent}${converted}`);
      } else {
        keptTokens.push(rawToken.trim());
      }
    }

    if (!consumedAny || !directives.length) {
      out.push(rawLine);
      continue;
    }

    out.push(...directives);
    const keptPrefix = keptTokens.length ? `${keptTokens.join(" ")} ` : "";
    const remainder = `${indent}${keptPrefix}${rest}`.replace(/[ \t]+$/g, "");
    if (remainder.trim()) out.push(remainder);
  }

  return out.join("\n");
}

function splitDirectiveComment(rawLine) {
  const line = String(rawLine || "");
  let start = 0;
  while (start < line.length && /\s/.test(line[start])) start += 1;
  const scanFrom = line.startsWith("%%", start) ? start + 2 : start;
  const idx = line.indexOf("%", scanFrom);
  if (idx < 0) return { code: line, comment: "" };
  return { code: line.slice(0, idx), comment: line.slice(idx) };
}

function parseReadableDrumContinuationNumbers(rawLine) {
  const parts = splitDirectiveComment(rawLine);
  const code = String(parts.code || "");
  const prefixed = code.match(/^\s*%%\s*MIDI\s+drum\s+\+:\s*(.*)$/i);
  const bare = prefixed ? null : code.match(/^\s*\+:\s*(.*)$/i);
  const payload = prefixed ? prefixed[1] : (bare ? bare[1] : "");
  if (!payload) return [];
  return payload
    .trim()
    .split(/\s+/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
}

function isReadableDrumContinuationLine(rawLine) {
  const code = splitDirectiveComment(rawLine).code;
  return /^\s*%%\s*MIDI\s+drum\s+\+:/i.test(code) || /^\s*\+:/i.test(code);
}

function commentPlaceholderOfLength(length) {
  const len = Math.max(0, Math.floor(Number(length) || 0));
  return len > 0 ? `%${" ".repeat(Math.max(0, len - 1))}` : "%";
}

function distributePlaceholderLengths(originalLengths, targetTotal) {
  const lengths = (Array.isArray(originalLengths) ? originalLengths : [])
    .map((n) => Math.max(1, Math.floor(Number(n) || 0)));
  const minTotal = lengths.length;
  if (!lengths.length) return [];
  let currentTotal = lengths.reduce((sum, n) => sum + n, 0);
  const target = Math.max(minTotal, Math.floor(Number(targetTotal) || minTotal));
  for (let i = lengths.length - 1; i >= 0 && currentTotal > target; i -= 1) {
    const reduceBy = Math.min(lengths[i] - 1, currentTotal - target);
    lengths[i] -= reduceBy;
    currentTotal -= reduceBy;
  }
  return lengths;
}

function normalizeReadableMidiDrumsForPlayback(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  let changed = false;
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const parts = splitDirectiveComment(rawLine);
    const mainMatch = String(parts.code || "").match(/^(\s*%%\s*MIDI\s+drum\s+)(?!\+:)(.*)$/i);
    if (!mainMatch) {
      out.push(rawLine);
      continue;
    }

    const continuationLines = [];
    let j = i + 1;
    while (j < lines.length && isReadableDrumContinuationLine(lines[j])) {
      continuationLines.push(lines[j]);
      j += 1;
    }

    if (!continuationLines.length) {
      out.push(rawLine);
      continue;
    }

    const mainTokens = String(mainMatch[2] || "").trim().split(/\s+/).filter(Boolean);
    const isInt = (t) => /^-?\d+$/.test(String(t || "").trim());
    let firstNum = -1;
    for (let n = 0; n < mainTokens.length; n += 1) {
      if (isInt(mainTokens[n])) {
        firstNum = n;
        break;
      }
    }
    const patternTokens = (firstNum === -1 ? mainTokens : mainTokens.slice(0, firstNum)).filter((t) => t !== "+:");
    const numbers = firstNum === -1 ? [] : mainTokens.slice(firstNum).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    for (const continuation of continuationLines) {
      numbers.push(...parseReadableDrumContinuationNumbers(continuation));
    }

    if (!patternTokens.length || !numbers.length) {
      out.push(rawLine);
      continue;
    }

    const canonicalPrefix = String(mainMatch[1] || "").replace(/\s+$/g, " ");
    const canonicalLine = `${canonicalPrefix}${patternTokens.join("")} ${numbers.join(" ")}${parts.comment || ""}`;
    const originalBlockLength = [rawLine, ...continuationLines]
      .reduce((sum, line) => sum + String(line || "").length, 0);
    const placeholderLengths = distributePlaceholderLengths(
      continuationLines.map((line) => String(line || "").length),
      originalBlockLength - canonicalLine.length
    );

    out.push(canonicalLine);
    for (let n = 0; n < continuationLines.length; n += 1) {
      out.push(commentPlaceholderOfLength(placeholderLengths[n] || 1));
    }
    changed = true;
    i = j - 1;
  }

  return changed ? out.join("\n") : String(text || "");
}

function commentOutMidiDirectiveLine(rawLine) {
  const line = String(rawLine || "");
  const idx = line.indexOf("%%");
  if (idx >= 0) return `${line.slice(0, idx)}% ${line.slice(idx + 2)}`;
  const plusIdx = line.indexOf("+");
  if (plusIdx >= 0) return `${line.slice(0, plusIdx)}% ${line.slice(plusIdx)}`;
  return line.length > 0 ? `%${" ".repeat(Math.max(0, line.length - 1))}` : "%";
}

function relocateMidiDrumDirectivesIntoBody(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const drumLineRe = /^\s*%%\s*MIDI\s+drum(on|off|bars)?\b/i;
  let insertAt = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*K:/.test(line) || /^\s*\[\s*K:/.test(line)) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt < 0) return { text: String(text || ""), moved: 0, insertedLength: 0 };

  const moved = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i >= insertAt) break;
    const line = lines[i];
    if (!drumLineRe.test(line)) continue;
    moved.push(line);
    lines[i] = commentOutMidiDirectiveLine(line);
  }
  if (!moved.length) return { text: lines.join("\n"), moved: 0, insertedLength: 0 };

  const inserted = [...moved, "%"];
  const insertedLength = inserted.reduce((sum, line) => sum + String(line || "").length, 0) + inserted.length;
  lines.splice(insertAt, 0, ...inserted);
  return { text: lines.join("\n"), moved: moved.length, insertedLength };
}

function injectGchordOn(text, insertAt) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  let hasGchordPattern = false;
  let hasGchordToggle = false;
  let hasChordSymbol = false;
  let inTextBlock = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^%%\s*begintext\b/i.test(trimmed)) {
      inTextBlock = true;
      continue;
    }
    if (/^%%\s*endtext\b/i.test(trimmed)) {
      inTextBlock = false;
      continue;
    }
    if (inTextBlock) continue;
    if (/^%/.test(trimmed) && !/^%%/.test(trimmed)) continue;
    if (/^%%MIDI\s+gchord(on|off)\b/i.test(trimmed)) {
      hasGchordToggle = true;
      continue;
    }
    if (/^%%MIDI\s+gchord\b/i.test(trimmed)) {
      hasGchordPattern = true;
      continue;
    }
    if (/^%%/.test(trimmed) || /^\s*[A-Za-z]:/.test(rawLine)) continue;
    const quoted = rawLine.matchAll(/"([^"]*)"/g);
    for (const match of quoted) {
      const value = String(match[1] || "").trim();
      if (/^[A-Ga-g][#b♯♭]?(?:$|[0-9(+/\-]|[ø°o]|m(?![a-z])|maj|min|dim|aug|sus|add|no|omit)/i.test(value)) {
        hasChordSymbol = true;
        break;
      }
    }
  }

  if ((!hasGchordPattern && !hasChordSymbol) || hasGchordToggle) {
    return { text, changed: false, offsetDelta: 0 };
  }

  const safeInsertAt = Number.isFinite(insertAt) ? insertAt : 0;
  let insertText = "%%MIDI gchordon\n";
  if (safeInsertAt > 0 && text[safeInsertAt - 1] !== "\n") {
    insertText = `\n${insertText}`;
  }
  const merged = `${text.slice(0, safeInsertAt)}${insertText}${text.slice(safeInsertAt)}`;
  return { text: merged, changed: true, offsetDelta: insertText.length };
}

function normalizeDollarLineBreaksForPlayback(text) {
  const src = String(text || "");
  if (!src.includes("$")) return src;
  // Playback-only cleanup:
  // - Drop "$ %..." tails (common bar/line markers used for layout, irrelevant for playback/drums).
  // - Replace other '$' occurrences with whitespace (some playback parsers treat '$' as a literal token and break repeats).
  const lines = src.split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    // Don't modify linebreak directives themselves; some files use `I:linebreak $`.
    if (!inTextBlock && (/^\s*I:\s*linebreak\b/i.test(rawLine) || /^\s*%%\s*linebreak\b/i.test(rawLine))) {
      out.push(rawLine);
      continue;
    }
    if (inTextBlock || !rawLine.includes("$")) {
      out.push(rawLine);
      continue;
    }
    let lineOut = "";
    let inQuote = false;
    for (let i = 0; i < rawLine.length; i += 1) {
      const ch = rawLine[i];
      if (ch === "\"") {
        inQuote = !inQuote;
        lineOut += ch;
        continue;
      }
      if (!inQuote && ch === "$") {
        lineOut += " ";
        continue;
      }
      lineOut += ch;
    }
    out.push(lineOut);
  }
  return out.join("\n");
}

function normalizeBlankLinesForPlayback(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  if (lines.length <= 2) return String(text || "");
  const out = [];
  let inTextBlock = false;
  let inBody = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (!inBody && (/^\s*K:/.test(line) || /^\s*\[\s*K:/.test(trimmed))) inBody = true;
    if (!inBody || inTextBlock) {
      out.push(line);
      continue;
    }
    if (trimmed !== "") {
      out.push(line);
      continue;
    }
    // Inside tune body, blank lines can be parsed as tune separators and stop playback.
    // Keep output stable by replacing them with comment placeholders.
    out.push("%");
  }
  return out.join("\n");
}

function sanitizeAbcForPlayback(text) {
  const src = String(text || "");
  const lines = src.split(/\r\n|\n|\r/);
  const out = [];
  const warnings = [];
  let inTextBlock = false;
  let inBody = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (!inBody && (/^\s*K:/.test(rawLine) || /^\s*\[\s*K:/.test(trimmed))) inBody = true;

    if (inTextBlock || !inBody) {
      // Still remove line-continuation backslashes outside text blocks even before body;
      // they are never meaningful for playback parsing.
      const cleaned = rawLine.replace(/[ \t]*\\\s*$/, (m) => {
        warnings.push({ kind: "line-continuation", line: lineIndex + 1 });
        return " ".repeat(String(m || "").length);
      });
      out.push(cleaned);
      continue;
    }

    // Split comments (keep them intact; only sanitize music part).
    let musicPart = rawLine;
    let commentPart = "";
    if (!trimmed.startsWith("%%")) {
      const commentIdx = rawLine.indexOf("%");
      if (commentIdx >= 0) {
        musicPart = rawLine.slice(0, commentIdx);
        commentPart = rawLine.slice(commentIdx);
      }
    }

    // 1) Remove trailing line-continuation backslash: `...\` -> `...`
    musicPart = musicPart.replace(/[ \t]*\\\s*$/, (m) => {
      warnings.push({ kind: "line-continuation", line: lineIndex + 1 });
      return " ".repeat(String(m || "").length);
    });

    // 2) Make multi-repeat tokens more stable: `|:::` -> `|::`, `:::` -> `::`, `:::|` -> `::|`
    // Keep `::` unchanged (common boundary repeat); only collapse 3+ down to the double-repeat form.
    const beforeRepeats = musicPart;
    musicPart = musicPart
      .replace(/\|:{3,}/g, (m) => `|::${" ".repeat(Math.max(0, String(m || "").length - 3))}`)
      .replace(/:{3,}\|/g, (m) => `::|${" ".repeat(Math.max(0, String(m || "").length - 3))}`)
      .replace(/:{3,}/g, (m) => `::${" ".repeat(Math.max(0, String(m || "").length - 2))}`);
    if (musicPart !== beforeRepeats) warnings.push({ kind: "multi-repeat-simplified", line: lineIndex + 1 });

    // 3) Replace spacer rests `y` with normal rests `z` (playback-only stability).
    // Target `y` tokens with optional durations like `y4`, `y2/`, `y/2`.
    const beforeY = musicPart;
    musicPart = musicPart.replace(/(^|[^A-Za-z0-9_])y(?=([0-9]|\/|$))/g, "$1z");
    if (musicPart !== beforeY) warnings.push({ kind: "spacer-rest-y", line: lineIndex + 1 });

    out.push(`${musicPart}${commentPart}`);
  }

  return { text: out.join("\n"), warnings };
}

function normalizeKeyFieldToBeLastBeforeBodyForPlayback(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const isTuneStart = (line) => /^\s*X:/.test(line);
  const isFieldLine = (line) => /^\s*[A-Za-z]:/.test(line);
  const isContinuationLine = (line) => /^\s*\+:\s*/.test(line);
  const isKeyLine = (line) => /^\s*K:/.test(line);
  const isVoiceLine = (line) => /^\s*V:/.test(line);
  const isPartLine = (line) => /^\s*P:/.test(line);
  const isCommentLine = (line) => /^\s*%/.test(line);
  const isDirectiveLine = (line) => /^\s*%%/.test(line);
  const beginsBlock = (trimmed) => {
    if (!/^%%\s*begin/i.test(trimmed)) return null;
    if (/^%%\s*begintext\b/i.test(trimmed)) return "text";
    if (/^%%\s*beginsvg\b/i.test(trimmed)) return "svg";
    if (/^%%\s*beginps\b/i.test(trimmed)) return "ps";
    return "other";
  };
  const endsBlock = (trimmed, block) => {
    if (!block) return false;
    if (block === "text") return /^%%\s*endtext\b/i.test(trimmed);
    if (block === "svg") return /^%%\s*endsvg\b/i.test(trimmed);
    if (block === "ps") return /^%%\s*endps\b/i.test(trimmed);
    if (block === "other") return /^%%\s*end/i.test(trimmed);
    return false;
  };

  const normalizeTune = (start, end) => {
    let kIdx = -1;
    for (let i = start; i < end; i += 1) {
      if (isKeyLine(lines[i])) { kIdx = i; break; }
    }
    if (kIdx < 0) return false;

    let block = null;
    let bodyStart = end;
    for (let j = kIdx + 1; j < end; j += 1) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (block) {
        if (endsBlock(trimmed, block)) block = null;
        continue;
      }
      const begin = beginsBlock(trimmed);
      if (begin) {
        block = begin;
        continue;
      }
      if (!trimmed) continue;
      if (isCommentLine(raw)) continue;
      // Treat P: like tune-body start for playback ordering: K: must be the last *header* field,
      // but P: is a body marker and often precedes the first music line.
      if (isPartLine(raw)) { bodyStart = j; break; }
      // Inline field-only lines like `[P:A]` or `[M:...]` are tune-body directives (even if they contain no notes).
      // Treat them as the body start so we don't reorder K: past them (it can break P: parts playback).
      if (isInlineFieldOnlyLine(raw)) { bodyStart = j; break; }
      if (isDirectiveLine(raw) || isFieldLine(raw) || isContinuationLine(raw)) continue;
      bodyStart = j;
      break;
    }
    if (bodyStart <= kIdx + 1) return false;

    let hasPostKeyHeader = false;
    for (let j = kIdx + 1; j < bodyStart; j += 1) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (isCommentLine(raw)) continue;
      if (isDirectiveLine(raw) || isFieldLine(raw) || isContinuationLine(raw)) {
        hasPostKeyHeader = true;
        break;
      }
    }
    if (!hasPostKeyHeader) return false;

    const insertAt = bodyStart - 1;
    if (insertAt <= kIdx) return false;

    // Offset-stable normalization:
    // Instead of moving lines (which shifts character offsets and breaks Follow/SVG mapping),
    // relocate the *content* of K: to the last header line slot while preserving line lengths.
    //
    // We intentionally sacrifice the original content of the destination line (typically %%score / directives),
    // but keep all other post-K header lines (notably V:) intact.
    //
    // If the last header line is a voice header, we refuse to do the swap (losing V: would break playback).
    // In that rare case, we keep the original order and let other compat paths handle playback.
    const dstRaw = lines[insertAt] || "";
    if (isVoiceLine(dstRaw)) return false;

    const kLine = lines[kIdx] || "";
    const dstLen = String(dstRaw).length;
    const kTrimmed = kLine.replace(/[\r\n]+$/, "");
    if (dstLen < kTrimmed.length) return false;
    const kPadded = (kTrimmed.length >= dstLen)
      ? kTrimmed.slice(0, dstLen)
      : (kTrimmed + " ".repeat(dstLen - kTrimmed.length));

    const srcLen = String(kLine).length;
    const placeholder = srcLen <= 0 ? "%" : (`%${" ".repeat(Math.max(0, srcLen - 1))}`);

    lines[kIdx] = placeholder;
    lines[insertAt] = kPadded;
    return true;
  };

  let changed = false;
  let start = 0;
  let sawTuneStart = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (isTuneStart(lines[i])) {
      if (sawTuneStart) {
        if (normalizeTune(start, i)) changed = true;
        start = i;
      } else {
        sawTuneStart = true;
        start = i;
      }
    }
  }
  if (normalizeTune(sawTuneStart ? start : 0, lines.length)) changed = true;
  return { text: lines.join("\n"), changed };
}

function stripLyricsForPlayback(text) {
  // Important: keep the output string length identical to the input.
  // Follow/highlighting depends on stable character offsets between playback text and rendered SVG.
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (inTextBlock) {
      out.push(line);
      continue;
    }
    if (/^\s*w:/.test(line) || /^\s*W:/.test(line)) {
      const len = String(line || "").length;
      if (len <= 0) out.push("%");
      else out.push(`%${" ".repeat(Math.max(0, len - 1))}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function normalizeBarsForPlayback(text) {
  // abc2svg is strict about barline consistency across voices. Some sources mix `||` and `|` at the same moment,
  // which other players may ignore. For playback-only stability, normalize multi-bars to a single bar.
  // Keep string length stable for Follow mapping: replace `||` with `| ` (bar + space).
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (inTextBlock) {
      out.push(rawLine);
      continue;
    }
    // Leave directives untouched.
    if (/^\s*%%/.test(rawLine) || /^\s*[A-Za-z]:/.test(rawLine) || isInlineFieldOnlyLine(rawLine)) {
      out.push(rawLine);
      continue;
    }
    out.push(rawLine.replace(/\|\|/g, "| "));
  }
  return out.join("\n");
}

function stripChordSymbolsForPlayback(text) {
  const src = String(text || "");
  if (!src.includes("\"")) return src;
  const lines = src.split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (inTextBlock) {
      out.push(rawLine);
      continue;
    }
    // Do not touch header/directive-only lines (e.g. V:... nm="...").
    // We only want to suppress inline chord symbols in music body lines.
    if (/^\s*%%/.test(rawLine) || /^\s*[A-Za-z]:/.test(rawLine) || isInlineFieldOnlyLine(rawLine)) {
      out.push(rawLine);
      continue;
    }
    // Remove chord symbols / annotations in quotes. Playback stability > chord display here.
    // Keep the rest of the line intact and preserve line length for Follow mapping.
    const stripped = rawLine.replace(/\"[^\"]*\"/g, (m) => " ".repeat(String(m || "").length));
    if (stripped.trim() === "") {
      const len = String(stripped || "").length;
      out.push(len > 0 ? `%${" ".repeat(Math.max(0, len - 1))}` : "%");
    } else {
      out.push(stripped);
    }
  }
  return out.join("\n");
}

export {
  detectKeyFieldNotLastBeforeBody,
  injectGchordOn,
  isInlineFieldOnlyLine,
  normalizeBarsForPlayback,
  normalizeBlankLinesForPlayback,
  normalizeDollarLineBreaksForPlayback,
  normalizeKeyFieldToBeLastBeforeBodyForPlayback,
  normalizeLeadingInlineDirectivesForPlayback,
  normalizeReadableMidiDrumsForPlayback,
  relocateMidiDrumDirectivesIntoBody,
  sanitizeAbcForPlayback,
  stripChordSymbolsForPlayback,
  stripLyricsForPlayback,
};
import {
  detectKeyFieldNotLastBeforeBody,
  isInlineFieldOnlyLine,
} from "../abc/abc_structure_model.js";
