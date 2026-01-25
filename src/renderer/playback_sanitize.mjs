export function sanitizeAbcForPlayback(text) {
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

    // 2b) Normalize start-repeat at the very start of a music line: `||:` -> `|:`.
    // Some playback parsers treat the leading `||:` as two barlines and can shift repeat starts.
    // Keep offsets stable by preserving the original character count (pad with a space).
    const beforeStartRepeat = musicPart;
    musicPart = musicPart.replace(/^([ \t]*)\|\|:(\s?)/, (_m, indent, ws) => `${indent}|:${ws} `);
    if (musicPart !== beforeStartRepeat) warnings.push({ kind: "repeat-start-doublebar", line: lineIndex + 1 });

    // 3) Replace spacer rests `y` with normal rests `z` (playback-only stability).
    // Target `y` tokens with optional durations like `y4`, `y2/`, `y/2`.
    const beforeY = musicPart;
    musicPart = musicPart.replace(/(^|[^A-Za-z0-9_])y(?=([0-9]|\/|$))/g, "$1z");
    if (musicPart !== beforeY) warnings.push({ kind: "spacer-rest-y", line: lineIndex + 1 });

    out.push(`${musicPart}${commentPart}`);
  }

  return { text: out.join("\n"), warnings };
}

