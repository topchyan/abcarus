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
    return { text: s.slice(i, j), end: j };
  }
  // Standard barlines contain at least one '|'
  if (s[i] === "|") {
    let j = i;
    while (j < s.length && (s[j] === "|" || s[j] === ":" || s[j] === "]" || s[j] === "[")) j += 1;
    return { text: s.slice(i, j), end: j };
  }
  return null;
}

function reflowMeasuresInMusicLine(line, measuresPerLine) {
  const n = Math.max(1, Math.trunc(Number(measuresPerLine) || 0));
  if (!Number.isFinite(n) || n <= 0) return String(line || "");

  const { head, comment } = splitInlineComment(line);
  const src = String(head || "");
  const out = [];

  let count = 0;
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

    // Preserve bracketed inline fields verbatim: [K:...], [V:...], [I:...], etc.
    if (ch === "[" && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) {
      const close = src.indexOf("]", i);
      if (close !== -1) {
        out.push(src.slice(i, close + 1));
        i = close + 1;
        continue;
      }
    }

    const bar = consumeBarlineToken(src, i);
    if (bar) {
      out.push(bar.text);
      i = bar.end;
      count += 1;
      if (count % n === 0) {
        const beforeBreak = out[out.length - 1] || "";
        // If we are at end-of-line, never emit a trailing newline (it creates an empty line after join()).
        // Also, trim leading spaces on the next segment.
        let k = i;
        while (k < src.length && (src[k] === " " || src[k] === "\t")) k += 1;
        if (k < src.length) {
          // Avoid duplicating breaks on already-broken lines.
          if (!/\n$/.test(beforeBreak)) out.push("\n");
          i = k;
        }
      }
      continue;
    }

    out.push(ch);
    i += 1;
  }

  // Never end with a newline: it would create an empty line after outer joins.
  if (out.length && out[out.length - 1] === "\n") out.pop();
  const rebuilt = out.join("");
  return rebuilt + (comment || "");
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
    // Guard: never leave an empty line after transforms, since blank lines terminate tunes in ABC.
    if (!line.trim()) {
      if (nextIsComment || prevIsComment) out.push("%");
      // Otherwise: drop it.
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

  for (const line of lines) {
    if (/^\s*%%\s*begintext\b/i.test(line)) inTextBlock = true;
    if (inTextBlock) {
      out.push(line);
      if (/^\s*%%\s*endtext\b/i.test(line)) inTextBlock = false;
      continue;
    }
    if (!line) {
      out.push(line);
      continue;
    }
    if (isAbcFieldLine(line)) {
      out.push(line);
      continue;
    }
    out.push(reflowMeasuresInMusicLine(line, n));
  }
  return out.join("\n");
}

