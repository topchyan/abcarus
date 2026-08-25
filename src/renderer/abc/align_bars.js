import {
  BAR_SEP_NO_SPACE,
  getDefaultLen,
  getMetre,
  isLikelyAnacrusis,
  splitLineIntoParts,
} from "./bar_metrics.js";

function alignBeams(bars) {
  if (!bars || !bars.length) return bars || [];
  const barParts = bars.map((b) => b.split(/ +/));
  const lengths = barParts.map((p) => p.length);
  const numParts = lengths.length ? Math.min(...lengths) : 0;
  if (!Number.isFinite(numParts) || numParts <= 0) return bars;
  for (let i = 0; i < numParts; i += 1) {
    const parts = barParts.map((p) => p[i] || "");
    const maxLen = Math.max(...parts.map((p) => p.length));
    for (let lineNo = 0; lineNo < barParts.length; lineNo += 1) {
      barParts[lineNo][i] = (barParts[lineNo][i] || "").padEnd(maxLen, " ");
    }
  }
  return barParts.map((p) => p.join(" "));
}

function alignBars(bars, alignInsideBarsToo) {
  let aligned = bars.slice();
  if (BAR_SEP_NO_SPACE.test(bars[0])) {
    aligned = aligned.map((b) => ` ${b.trim()} `);
  } else if (alignInsideBarsToo) {
    aligned = alignBeams(aligned);
  }
  const maxLen = Math.max(...aligned.map((b) => b.length));
  return aligned.map((b) => b.padEnd(maxLen, " "));
}

function alignBarSeparators(barSeps) {
  let bars = barSeps.map((b) => ` ${b.trim()} `);
  const useRjust = bars.some((b) => b.includes(":|"));
  if (bars.some((b) => b.includes("|"))) {
    const maxPos = Math.max(...bars.map((b) => b.lastIndexOf("|")));
    bars = bars.map((b) => {
      const p = b.lastIndexOf("|");
      if (p >= 0 && p < maxPos) return " ".repeat(maxPos - p) + b;
      return b;
    });
    const maxLen = Math.max(...bars.map((b) => b.length));
    return bars.map((b) => b.padEnd(maxLen, " "));
  }
  const maxLen = Math.max(...bars.map((b) => b.length));
  return useRjust ? bars.map((b) => b.padStart(maxLen, " ")) : bars.map((b) => b.padEnd(maxLen, " "));
}

function alignLines(wholeAbc, lines, alignInsideBarsToo) {
  const n = lines.length;
  if (!n) return lines;
  const lineParts = lines.map((line) => splitLineIntoParts(line.trim()));
  const lengths = lineParts.map((lp) => lp.length);
  const maxLen = lengths.length ? Math.max(...lengths) : 0;
  const numBars = maxLen + 1;
  if (!Number.isFinite(numBars) || numBars <= 0) return lines;
  for (let lineNo = 0; lineNo < lineParts.length; lineNo += 1) {
    lineParts[lineNo].push("");
    if (lineParts[lineNo].length < numBars) {
      lineParts[lineNo].push(...Array(numBars - lineParts[lineNo].length).fill(""));
    }
  }

  const defaultLen = getDefaultLen(wholeAbc);
  const metre = getMetre(wholeAbc);
  let firstBarHandled = false;

  for (let i = 0; i < numBars; i += 1) {
    if (!firstBarHandled && lineParts.some((lp) => /[a-gA-Gxz]/.test(lp[i] || ""))) {
      firstBarHandled = true;
      const isAna = lineParts.map((lp) => isLikelyAnacrusis(lp[i], defaultLen, metre));
      if (isAna.some(Boolean) && !isAna.every(Boolean)) {
        for (let lineNo = 0; lineNo < n; lineNo += 1) {
          if (!isAna[lineNo]) lineParts[lineNo].splice(i, 0, "");
        }
      }
    }

    const anyIsBarSep = lineParts.some((lp) => BAR_SEP_NO_SPACE.test(lp[i] || ""));
    if (anyIsBarSep) {
      for (let lineNo = 0; lineNo < n; lineNo += 1) {
        if (!BAR_SEP_NO_SPACE.test(lineParts[lineNo][i] || "")) {
          lineParts[lineNo].splice(i, 0, "");
        }
      }
    }

    const bars = lineParts.map((lp) => lp[i]);
    const aligned = anyIsBarSep
      ? alignBarSeparators(bars)
      : alignBars(bars, alignInsideBarsToo);
    for (let lineNo = 0; lineNo < n; lineNo += 1) {
      lineParts[lineNo][i] = aligned[lineNo];
    }
  }

  let out = lineParts.map((parts) => parts.join(""));
  if (out.every((l) => l.startsWith(" "))) out = out.map((l) => l.slice(1));
  return out;
}

function getBarSeparatorColumns(line) {
  const parts = splitLineIntoParts(String(line || ""));
  const cols = [];
  let offset = 0;
  for (const part of parts) {
    const m = String(part || "").match(BAR_SEP_NO_SPACE);
    if (m) cols.push(offset + m.index);
    offset += String(part || "").length;
  }
  return cols;
}

function alignLyricLineToMusicLine(lyricLine, alignedMusicLine) {
  const m = String(lyricLine || "").match(/^(\s*w:\s*)([\s\S]*)$/);
  if (!m) return lyricLine;
  const prefix = m[1] || "";
  const body = m[2] || "";
  const parts = splitLineIntoParts(body);
  const lyricSepCount = parts.filter((p) => BAR_SEP_NO_SPACE.test(p || "")).length;
  const musicCols = getBarSeparatorColumns(alignedMusicLine);
  if (!lyricSepCount || !musicCols.length) return lyricLine;
  if (lyricSepCount < musicCols.length - 1 || lyricSepCount > musicCols.length) return lyricLine;
  const leadingSpaces = String(alignedMusicLine || "").match(/^\s*/)?.[0]?.length || 0;
  const firstMusicSepIsLeading = musicCols[0] === leadingSpaces
    && BAR_SEP_NO_SPACE.test(String(alignedMusicLine || "").slice(leadingSpaces));
  const musicColOffset = lyricSepCount === musicCols.length - 1 && firstMusicSepIsLeading ? 1 : 0;

  let out = prefix;
  let sepIndex = 0;
  for (const part of parts) {
    if (BAR_SEP_NO_SPACE.test(part || "")) {
      const target = musicCols[sepIndex + musicColOffset];
      if (!Number.isFinite(target)) return lyricLine;
      if (out.length < target) out += " ".repeat(target - out.length);
      else if (/\S$/.test(out)) out += " ";
      out += String(part || "").trim();
      if (/\s$/.test(String(part || "")) || sepIndex < lyricSepCount - 1) out += " ";
      sepIndex += 1;
    } else {
      out += part;
    }
  }
  return out;
}

function alignBarsInTune(lines, tuneText) {
  const out = lines.slice();
  let inText = false;
  let headerEnded = false;
  const groups = [];
  let candidates = [];
  const flushCandidates = () => {
    if (!candidates.length) return;
    groups.push(candidates);
    candidates = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^%%\s*begintext\b/i.test(line)) {
      flushCandidates();
      inText = true;
      continue;
    }
    if (/^%%\s*endtext\b/i.test(line)) {
      inText = false;
      continue;
    }
    if (!headerEnded) {
      if (/^\s*K:/.test(line)) headerEnded = true;
      continue;
    }
    if (inText) {
      flushCandidates();
      continue;
    }
    if (/^\s*w:/.test(line)) {
      continue;
    }
    if (
      /^\s*%/.test(line)
      || /^\s*[A-Za-z]:/.test(line)
      || !BAR_SEP_NO_SPACE.test(line)
    ) {
      flushCandidates();
      continue;
    }
    candidates.push({ idx: i, line });
  }
  flushCandidates();

  if (!groups.length) return out;
  for (const group of groups) {
    const aligned = alignLines(tuneText, group.map((c) => c.line), true);
    for (let i = 0; i < group.length; i += 1) {
      out[group[i].idx] = aligned[i];
      let lyricIdx = group[i].idx + 1;
      while (lyricIdx < out.length && /^\s*w:/.test(out[lyricIdx] || "")) {
        out[lyricIdx] = alignLyricLineToMusicLine(out[lyricIdx], aligned[i]);
        lyricIdx += 1;
      }
    }
  }
  return out;
}

function alignBarsInText(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let start = 0;

  const flushBlock = (blockLines, isTune) => {
    if (!blockLines.length) return;
    if (isTune) {
      const tuneText = blockLines.join("\n");
      out.push(...alignBarsInTune(blockLines, tuneText));
    } else {
      out.push(...blockLines);
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*X:/.test(lines[i])) {
      flushBlock(lines.slice(start, i), false);
      start = i;
      i += 1;
      while (i < lines.length && !/^\s*X:/.test(lines[i])) i += 1;
      flushBlock(lines.slice(start, i), true);
      start = i;
      i -= 1;
    }
  }

  flushBlock(lines.slice(start), false);
  return out.join("\n");
}

export {
  alignBarsInText,
  getBarSeparatorColumns,
};
