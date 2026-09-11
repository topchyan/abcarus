function splitInlineComment(line) {
  const s = String(line || "");
  let idx = -1;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "%" && s[i - 1] !== "\\") {
      idx = i;
      break;
    }
  }
  if (idx === -1) return { head: s, comment: "" };
  return { head: s.slice(0, idx), comment: s.slice(idx) };
}

function isAbcFieldLine(line) {
  const s = String(line || "");
  return /^[\t ]*[A-Za-z]:/.test(s) || /^[\t ]*%/.test(s);
}

function isLyricLine(line) {
  return /^[\t ]*w:/.test(String(line || ""));
}

function isInlineFieldOnlyLine(line) {
  const s = String(line || "").trim();
  if (!s.startsWith("[")) return false;
  // Lines like: [M:7/8][Q:1/4=220]
  return /^\[[A-Za-z]:/.test(s);
}

function hasInlineComment(line) {
  const s = String(line || "");
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "%" && s[i - 1] !== "\\") {
      // If there is non-whitespace before %, it's an inline comment.
      return Boolean(s.slice(0, i).trim());
    }
  }
  return false;
}

function consumeBarlineToken(src, start) {
  const s = String(src || "");
  const i = start;
  if (i < 0 || i >= s.length) return null;
  // Common bracketed barline: [|
  if (s.startsWith("[|", i)) return { text: "[|", end: i + 2 };
  // Common barline/repeat tokens with colon.
  if (s[i] === ":" && (s[i + 1] === ":" || s[i + 1] === "|")) {
    let j = i;
    while (j < s.length && (s[j] === ":" || s[j] === "|")) j += 1;
    if (/[0-9]/.test(s[j] || "") && s[j + 1] === "$") j += 2;
    if (s[j] === "]" && !/[0-9]/.test(s[j + 1] || "")) j += 1;
    if (s[j] === "[" && /[0-9|:\]]/.test(s[j + 1] || "")) {
      j += 1;
      if (/[0-9|:\]]/.test(s[j] || "")) j += 1;
    }
    return { text: s.slice(i, j), end: j };
  }
  // Standard barlines contain at least one '|'
  if (s[i] === "|") {
    let j = i;
    while (j < s.length) {
      const ch = s[j];
      if (ch === "|" || ch === ":" || ch === "]") {
        j += 1;
        continue;
      }
      if (ch === "[") {
        // Keep "[1", "[2", "[|" as barline-related continuations, but do not
        // consume inline fields like "[K:...]" into bar tokens.
        const next = s[j + 1] || "";
        if (/[0-9|:\]]/.test(next)) {
          j += 1;
          continue;
        }
      }
      break;
    }
    // xml2abc emits a volta and forced system break as one unit: `|1$`.
    // Keep this exact sequence together while reflowing; otherwise `1$` can
    // become the next line's text and abc2svg loses the volta label.
    if (/[0-9]/.test(s[j] || "") && s[j + 1] === "$") j += 2;
    return { text: s.slice(i, j), end: j };
  }
  return null;
}

function splitMusicLineIntoMeasureChunks(line) {
  const { head, comment } = splitInlineComment(line);
  const src = String(head || "");
  const chunks = [];
  let current = "";

  let i = 0;
  let inQuote = false;
  let inDecoration = false;
  let hasBarContent = false;

  const append = (value) => {
    current += String(value || "");
  };
  const pushChunk = () => {
    const text = current.trim();
    if (text) chunks.push(text);
    current = "";
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuote) {
      append(ch);
      if (ch === "\"") inQuote = false;
      i += 1;
      continue;
    }
    if (inDecoration) {
      append(ch);
      if (ch === "!") inDecoration = false;
      i += 1;
      continue;
    }

    if (ch === "\"") {
      inQuote = true;
      append(ch);
      i += 1;
      continue;
    }
    if (ch === "!") {
      inDecoration = true;
      append(ch);
      i += 1;
      continue;
    }

    // Preserve bracketed inline fields verbatim: [K:...], [V:...], [I:...], etc.
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        append(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
    }

    const bar = consumeBarlineToken(src, i);
    if (bar) {
      append(bar.text);
      i = bar.end;
      if (hasBarContent) {
        pushChunk();
      }
      hasBarContent = false;
      let k = i;
      while (k < src.length && (src[k] === " " || src[k] === "\t")) k += 1;
      if (k > i && current.trim() === String(bar.text || "").trim()) append(" ");
      i = k;
      continue;
    }

    // Count a bar only when there was some musical content since the previous barline.
    // Include common rest tokens: z (rest), x (invisible rest), Z (multi-measure rest).
    if (/[A-Ga-gzxZ]/.test(ch)) hasBarContent = true;
    append(ch);
    i += 1;
  }

  if (current.trim()) pushChunk();
  if (comment && chunks.length) {
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${comment.trim()}`;
  } else if (comment) {
    chunks.push(comment.trim());
  }
  return chunks;
}

function groupChunksIntoLines(chunks, measuresPerLine) {
  const n = Math.max(1, Math.trunc(Number(measuresPerLine) || 0));
  const src = Array.isArray(chunks) ? chunks.filter((chunk) => String(chunk || "").trim()) : [];
  if (!src.length) return [];
  const lines = [];
  for (let i = 0; i < src.length; i += n) {
    const group = src.slice(i, i + n).map((chunk) => String(chunk || "").trim());
    let line = "";
    for (const chunk of group) {
      if (!line) {
        line = chunk;
        continue;
      }
      if (/^\[[A-Za-z]:/.test(chunk) || /^[0-9]/.test(chunk)) {
        line += chunk;
      } else {
        line += ` ${chunk}`;
      }
    }
    lines.push(line);
  }
  return lines;
}

function reflowMeasuresInMusicLine(line, measuresPerLine) {
  return groupChunksIntoLines(splitMusicLineIntoMeasureChunks(line), measuresPerLine).join("\n");
}

function stripMusicLineJoinMarkers(text) {
  let out = String(text || "").trim();
  out = out.replace(/\\\s*$/, "").trimEnd();
  if (/(^|[^\\])\$\s*$/.test(out)) out = out.replace(/\$\s*$/, "").trimEnd();
  return out;
}

function joinPendingMusicLine(pendingMusic, line) {
  const prefix = String(pendingMusic || "").match(/^\s*/)?.[0] || "";
  const left = stripMusicLineJoinMarkers(pendingMusic);
  const right = stripMusicLineJoinMarkers(String(line || "").trimStart());
  // Preserve common first/second ending syntax when it lands on a line boundary: `|1` / `|2`.
  if (left.endsWith("|") && /^[0-9]/.test(right)) {
    return `${prefix}${left.trim()}${right}`;
  }
  return `${prefix}${left.trim()} ${right}`;
}

function stripLyricLineJoinMarkers(text) {
  let out = String(text || "").trim();
  out = out.replace(/\\\s*$/, "").trimEnd();
  if (/(^|[^\\])\$\s*$/.test(out)) out = out.replace(/\$\s*$/, "").trimEnd();
  return out;
}

function countLyricNoteAnchors(musicChunk) {
  const src = String(musicChunk || "");
  let count = 0;
  let i = 0;
  let inQuote = false;
  let inDecoration = false;
  let inChord = false;
  while (i < src.length) {
    const ch = src[i];
    if (inQuote) {
      if (ch === "\"") inQuote = false;
      i += 1;
      continue;
    }
    if (inDecoration) {
      if (ch === "!") inDecoration = false;
      i += 1;
      continue;
    }
    if (ch === "\"") {
      inQuote = true;
      i += 1;
      continue;
    }
    if (ch === "!") {
      inDecoration = true;
      i += 1;
      continue;
    }
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        i = close + 1;
        continue;
      }
    }
    const bar = consumeBarlineToken(src, i);
    if (bar) {
      i = bar.end;
      continue;
    }
    if (ch === "{") {
      const close = src.indexOf("}", i + 1);
      if (close !== -1) {
        i = close + 1;
        continue;
      }
    }
    if (ch === "[") {
      inChord = true;
      i += 1;
      continue;
    }
    if (inChord) {
      if (/[A-Ga-g]/.test(ch)) {
        count += 1;
        while (i < src.length && src[i] !== "]") i += 1;
        inChord = false;
        if (src[i] === "]") i += 1;
        continue;
      }
      if (ch === "]") inChord = false;
      i += 1;
      continue;
    }
    if (/[A-Ga-g]/.test(ch)) {
      count += 1;
      i += 1;
      while (/[',0-9/]/.test(src[i] || "")) i += 1;
      continue;
    }
    i += 1;
  }
  return count;
}

function splitLyricBodyOnExplicitBars(body) {
  const src = String(body || "");
  const chunks = [];
  let current = "";
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    current += ch;
    if (ch === "|" && src[i - 1] !== "\\") {
      const text = formatLyricChunk(current);
      if (text) chunks.push(text);
      current = "";
    }
  }
  const tail = formatLyricChunk(current);
  if (tail) chunks.push(tail);
  return chunks;
}

function formatLyricChunk(text) {
  const src = String(text || "").trim();
  if (!src) return "";
  let out = "";
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "|" && src[i - 1] !== "\\") {
      const left = out.trimEnd();
      out = left ? `${left} |` : "|";
      continue;
    }
    out += ch;
  }
  return out.trim();
}

function getLyricAdvanceTokenEnds(body) {
  const src = String(body || "");
  const ends = [];
  let i = 0;
  while (i < src.length) {
    while (src[i] === " " || src[i] === "\t") i += 1;
    if (!src[i]) break;
    const start = i;
    const ch = src[i];
    if (ch === "|" && src[i - 1] !== "\\") {
      i += 1;
      continue;
    }
    if (ch === "*" || ch === "_" || ch === "-") {
      i += 1;
      ends.push(i);
      continue;
    }
    while (i < src.length) {
      const c = src[i];
      if (!c || c === " " || c === "\t") break;
      if ((c === "|" || c === "*" || c === "_") && src[i - 1] !== "\\") break;
      if (c === "\\") {
        i += 2;
        continue;
      }
      i += 1;
    }
    if (i > start) ends.push(i);
  }
  return ends;
}

function splitLyricBodyByNoteCounts(body, noteCounts) {
  const src = String(body || "");
  const counts = Array.isArray(noteCounts) ? noteCounts.map((n) => Math.max(0, Number(n) || 0)) : [];
  const tokenEnds = getLyricAdvanceTokenEnds(src);
  if (!tokenEnds.length || !counts.length) return null;
  const chunks = [];
  let tokenIndex = 0;
  let start = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const n = counts[i];
    tokenIndex += n;
    const end = tokenIndex > 0 ? tokenEnds[Math.min(tokenIndex, tokenEnds.length) - 1] : start;
    if (!Number.isFinite(end)) break;
    let text = src.slice(start, end).trim();
    if (text && !/[|]$/.test(text)) text = `${text} |`;
    text = formatLyricChunk(text);
    if (text) chunks.push(text);
    start = end;
    while (src[start] === " " || src[start] === "\t") start += 1;
    if (tokenIndex >= tokenEnds.length) break;
  }
  const tail = src.slice(start).trim();
  if (tail) chunks.push(tail);
  return chunks.length ? chunks : null;
}

function splitLyricLineIntoChunks(line, musicChunks) {
  const m = String(line || "").match(/^(\s*w:\s*)([\s\S]*)$/);
  if (!m) return null;
  const prefix = m[1] || "w:";
  const body = stripLyricLineJoinMarkers(m[2] || "");
  const hasExplicitBars = /(^|[^\\])\|/.test(body);
  const chunks = hasExplicitBars
    ? splitLyricBodyOnExplicitBars(body)
    : splitLyricBodyByNoteCounts(body, (musicChunks || []).map(countLyricNoteAnchors));
  if (!chunks || !chunks.length) return null;
  return { prefix, chunks };
}

function groupLyricChunksIntoLines(lyric, measuresPerLine) {
  if (!lyric || !Array.isArray(lyric.chunks) || !lyric.chunks.length) return null;
  const grouped = groupChunksIntoLines(lyric.chunks, measuresPerLine);
  return grouped.map((line) => `${lyric.prefix}${line}`);
}

function reflowMusicWithLyrics(musicText, lyricLines, measuresPerLine) {
  const musicChunks = splitMusicLineIntoMeasureChunks(musicText);
  if (!musicChunks.length) return [reflowMeasuresInMusicLine(musicText, measuresPerLine), ...lyricLines];
  const lyricChunks = lyricLines.map((line) => splitLyricLineIntoChunks(line, musicChunks));
  if (lyricChunks.some((lyric) => !lyric)) {
    return [groupChunksIntoLines(musicChunks, measuresPerLine).join("\n"), ...lyricLines];
  }

  const musicGroups = groupChunksIntoLines(musicChunks, measuresPerLine);
  const lyricGroups = lyricChunks.map((lyric) => groupLyricChunksIntoLines(lyric, measuresPerLine));
  if (lyricGroups.some((group) => !group || group.length !== musicGroups.length)) {
    return [musicGroups.join("\n"), ...lyricLines];
  }

  const out = [];
  for (let i = 0; i < musicGroups.length; i += 1) {
    out.push(musicGroups[i]);
    for (const group of lyricGroups) out.push(group[i]);
  }
  return out;
}

function parseLinebreakMarkerFromDirective(line) {
  const src = String(line || "");
  const m = src.match(/^\s*(?:I:|%%)\s*linebreak\b(.*)$/i);
  if (!m) return null;
  const { head } = splitInlineComment(m[1] || "");
  const body = String(head || "").trim();
  if (!body) return "$";
  return body[0] || "$";
}

function reflowMusicByLinebreakMarker(line, markerChar) {
  const src = String(line || "");
  const marker = String(markerChar || "$");
  if (!src || !marker) return src;
  const markerCh = marker[0];
  if (!markerCh || !src.includes(markerCh)) return src;

  const out = [];
  let i = 0;
  let inQuote = false;
  let inDecoration = false;

  while (i < src.length) {
    const ch = src[i];

    if (inQuote) {
      out.push(ch);
      if (ch === "\"") inQuote = false;
      i += 1;
      continue;
    }
    if (inDecoration) {
      out.push(ch);
      if (ch === "!") inDecoration = false;
      i += 1;
      continue;
    }
    if (ch === "\"") {
      inQuote = true;
      out.push(ch);
      i += 1;
      continue;
    }
    if (ch === "!") {
      inDecoration = true;
      out.push(ch);
      i += 1;
      continue;
    }

    if (ch === markerCh && src[i - 1] !== "\\") {
      out.push(ch);
      i += 1;
      while (i < src.length && (src[i] === " " || src[i] === "\t")) i += 1;
      if (i < src.length && src[i] === "%") {
        out.push(" ");
        out.push(src.slice(i).trimEnd());
        i = src.length;
      }
      if (i < src.length) out.push("\n");
      continue;
    }

    out.push(ch);
    i += 1;
  }

  if (out.length && out[out.length - 1] === "\n") out.pop();
  return out.join("");
}

export function normalizeMeasuresLineBreaks(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (/^\s*%%\s*begintext\b/i.test(line)) inTextBlock = true;
    if (inTextBlock) {
      out.push(line);
      if (/^\s*%%\s*endtext\b/i.test(line)) inTextBlock = false;
      continue;
    }
    const next = lines[i + 1];
    const prev = out.length ? out[out.length - 1] : "";
    const nextIsComment = next && /^\s*%/.test(next);
    const prevIsComment = /^\s*%/.test(prev || "");
    if (/^\s*%Error\b/i.test(line)) {
      out.push("%");
      continue;
    }
    if (next && /^\s*%/.test(next) && /\\\s*$/.test(line)) {
      line = line.replace(/\\\s*$/, "");
    }
    if (line.trim() === "\\") {
      out.push("%");
      continue;
    }
    // Guard: blank lines terminate tunes in ABC. Only allow them as tune separators (before next X:) or inside begintext.
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      while (j < lines.length && /^\s*%/.test(lines[j])) j += 1;
      const nextNonEmpty = j < lines.length ? lines[j] : "";
      const looksLikeTuneSeparator = !nextNonEmpty || /^\s*X:/.test(nextNonEmpty);
      if (looksLikeTuneSeparator) {
        out.push("");
      } else if (nextIsComment || prevIsComment) {
        out.push("%");
      } else {
        // Replace accidental blank line with a harmless comment to avoid truncating the tune.
        out.push("%");
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

export function transformMeasuresPerLine(abcText, measuresPerLine) {
  const n = Math.max(1, Math.trunc(Number(measuresPerLine) || 0));
  if (!Number.isFinite(n) || n <= 0) return String(abcText || "");

  const lines = String(abcText || "").split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  let pendingMusic = null;
  let pendingLyrics = [];
  let pendingLyricIndex = 0;

  const appendPendingLyric = (line) => {
    const m = String(line || "").match(/^(\s*w:\s*)([\s\S]*)$/);
    if (!m) return false;
    if (pendingLyricIndex < pendingLyrics.length) {
      const prev = pendingLyrics[pendingLyricIndex];
      const pm = String(prev || "").match(/^(\s*w:\s*)([\s\S]*)$/);
      if (!pm) return false;
      const prefix = pm[1] || "w:";
      const left = stripLyricLineJoinMarkers(pm[2] || "");
      const right = stripLyricLineJoinMarkers(m[2] || "");
      pendingLyrics[pendingLyricIndex] = `${prefix}${left}${left && right ? " " : ""}${right}`;
    } else {
      pendingLyrics.push(line);
    }
    pendingLyricIndex += 1;
    return true;
  };

  const flushPending = () => {
    if (!pendingMusic) return;
    if (pendingLyrics.length) {
      out.push(...reflowMusicWithLyrics(pendingMusic, pendingLyrics, n));
    } else {
      out.push(reflowMeasuresInMusicLine(pendingMusic, n));
    }
    pendingMusic = null;
    pendingLyrics = [];
    pendingLyricIndex = 0;
  };

  for (const line of lines) {
    if (/^\s*%%\s*begintext\b/i.test(line)) inTextBlock = true;
    if (inTextBlock) {
      flushPending();
      out.push(line);
      if (/^\s*%%\s*endtext\b/i.test(line)) inTextBlock = false;
      continue;
    }
    if (!line) {
      flushPending();
      out.push(line);
      continue;
    }
    if (isLyricLine(line) && pendingMusic) {
      appendPendingLyric(line);
      continue;
    }
    if (isAbcFieldLine(line)) {
      flushPending();
      out.push(line);
      continue;
    }
    if (isInlineFieldOnlyLine(line)) {
      flushPending();
      out.push(line);
      continue;
    }
    if (hasInlineComment(line)) {
      flushPending();
      out.push(reflowMeasuresInMusicLine(line, n));
      continue;
    }

    // Merge adjacent music lines so that changing measures-per-line can reflow existing output.
    if (!pendingMusic) {
      pendingMusic = line;
    } else {
      pendingMusic = joinPendingMusicLine(pendingMusic, line);
    }
    pendingLyricIndex = 0;
  }
  flushPending();
  return out.join("\n");
}

export function transformMeasuresByLinebreakMarker(abcText, markerOverride) {
  const lines = String(abcText || "").split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  let pendingMusic = null;
  let pendingComments = [];
  let currentMarker = String(markerOverride || "").trim();
  if (!currentMarker) currentMarker = "$";
  currentMarker = currentMarker[0] || "$";

  const flushPending = () => {
    if (!pendingMusic) return;
    const rebuilt = reflowMusicByLinebreakMarker(pendingMusic, currentMarker);
    const chunks = String(rebuilt || "").split("\n");
    if (chunks.length && pendingComments.length) {
      const tail = pendingComments.join(" ").trim();
      if (tail) chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${tail}`;
      pendingComments = [];
    }
    out.push(...chunks);
    pendingMusic = null;
  };

  for (const line of lines) {
    if (/^\s*%%\s*begintext\b/i.test(line)) inTextBlock = true;
    if (inTextBlock) {
      flushPending();
      out.push(line);
      if (/^\s*%%\s*endtext\b/i.test(line)) inTextBlock = false;
      continue;
    }
    const nextMarker = parseLinebreakMarkerFromDirective(line);
    if (nextMarker) {
      flushPending();
      out.push(line);
      if (!markerOverride) currentMarker = nextMarker;
      continue;
    }
    if (!line) {
      flushPending();
      out.push(line);
      continue;
    }
    if (isAbcFieldLine(line)) {
      flushPending();
      out.push(line);
      continue;
    }
    if (isInlineFieldOnlyLine(line)) {
      flushPending();
      out.push(line);
      continue;
    }
    if (hasInlineComment(line)) {
      // Keep marker comments (e.g. `$ % 12`) attached to the same reflow chunk.
      // If there is pending music, merge this commented line into it and flush once.
      const { head, comment } = splitInlineComment(line);
      const markerInHead = String(head || "").includes(currentMarker);
      if (pendingMusic && markerInHead) {
        const prefix = pendingMusic.match(/^\s*/)?.[0] || "";
        const left = pendingMusic.trimEnd();
        const right = String(line || "").trimStart();
        if (left.endsWith("|") && /^[0-9]/.test(right)) {
          pendingMusic = `${prefix}${left.trim()}${right}`;
        } else {
          pendingMusic = `${prefix}${left.trim()} ${right}`;
        }
        flushPending();
      } else if (pendingMusic) {
        const prefix = pendingMusic.match(/^\s*/)?.[0] || "";
        const left = pendingMusic.trimEnd();
        const right = String(head || "").trimStart();
        if (left.endsWith("|") && /^[0-9]/.test(right)) {
          pendingMusic = `${prefix}${left.trim()}${right}`;
        } else {
          pendingMusic = `${prefix}${left.trim()} ${right}`;
        }
        const c = String(comment || "").trim();
        if (c) pendingComments.push(c);
      } else {
        flushPending();
        const rebuilt = reflowMusicByLinebreakMarker(line, currentMarker);
        out.push(...String(rebuilt || "").split("\n"));
      }
      continue;
    }

    if (!pendingMusic) {
      pendingMusic = line;
    } else {
      const prefix = pendingMusic.match(/^\s*/)?.[0] || "";
      const left = pendingMusic.trimEnd();
      const right = line.trimStart();
      if (left.endsWith("|") && /^[0-9]/.test(right)) {
        pendingMusic = `${prefix}${left.trim()}${right}`;
      } else {
        pendingMusic = `${prefix}${left.trim()} ${right}`;
      }
    }
  }

  flushPending();
  return out.join("\n");
}
