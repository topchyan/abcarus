import {
  BAR_SEP_NO_SPACE,
  splitLineIntoParts,
} from "./bar_metrics.js";

function splitMusicTokens(text) {
  const tokens = [];
  let token = "";
  let quote = false;
  let decoration = false;
  let escaped = false;
  for (const ch of String(text || "").trim()) {
    if (escaped) {
      token += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      token += ch;
      escaped = true;
      continue;
    }
    if (ch === '"' && !decoration) {
      quote = !quote;
      token += ch;
      continue;
    }
    if (ch === "!" && !quote) {
      decoration = !decoration;
      token += ch;
      continue;
    }
    if (/\s/.test(ch) && !quote && !decoration) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }
    token += ch;
  }
  if (token) tokens.push(token);
  return tokens;
}

function alignBeams(bars) {
  if (!bars || !bars.length) return bars || [];
  const barParts = bars.map(splitMusicTokens);
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

function parseGridLine(line) {
  const cells = [];
  const separators = [];
  let cell = "";
  for (const part of splitLineIntoParts(String(line || "").trim())) {
    if (BAR_SEP_NO_SPACE.test(part || "")) {
      cells.push(cell.trim());
      separators.push(String(part || "").trim());
      cell = "";
    } else {
      cell += part;
    }
  }
  cells.push(cell.trim());
  let prefix = "";
  if (!cells[0] && separators.length) {
    prefix = `${separators.shift()} `;
    cells.shift();
  }
  return { cells, separators, prefix };
}

function separatorLayout(rows, separatorIndex) {
  const tokens = rows
    .map((row) => row.separators[separatorIndex])
    .filter(Boolean);
  let maxPipeOffset = 0;
  let maxAfterPipe = 0;
  for (const token of tokens) {
    const pipeOffset = token.lastIndexOf("|");
    maxPipeOffset = Math.max(maxPipeOffset, Math.max(0, pipeOffset));
    maxAfterPipe = Math.max(maxAfterPipe, pipeOffset >= 0 ? token.length - pipeOffset - 1 : token.length);
  }
  return { maxPipeOffset, maxAfterPipe };
}

function formatSeparator(token, layout) {
  const text = String(token || "");
  const pipeOffset = text.lastIndexOf("|");
  if (pipeOffset < 0) {
    const width = layout.maxPipeOffset + 1 + layout.maxAfterPipe;
    return text.padEnd(Math.max(text.length, width), " ");
  }
  const left = " ".repeat(Math.max(0, layout.maxPipeOffset - pipeOffset));
  const right = " ".repeat(Math.max(0, layout.maxAfterPipe - (text.length - pipeOffset - 1)));
  return `${left}${text}${right}`;
}

function alignLines(_wholeAbc, lines, alignInsideBarsToo) {
  if (!lines.length) return lines;
  const rows = lines.map((line) => ({
    ...parseGridLine(line),
    lyric: /^\s*w:/.test(String(line || "")),
  }));
  for (const row of rows) {
    if (row.lyric) row.cells = row.cells.map((cell) => String(cell || "").replace(/\s+/g, " ").trim());
  }
  const maxCells = Math.max(...rows.map((row) => row.cells.length));
  const cellWidths = Array(maxCells).fill(0);

  for (let cellIndex = 0; cellIndex < maxCells; cellIndex += 1) {
    if (alignInsideBarsToo) {
      const musicRows = rows.filter((row) => !row.lyric && cellIndex < row.cells.length);
      const alignedMusic = alignBeams(musicRows.map((row) => row.cells[cellIndex]));
      for (let i = 0; i < musicRows.length; i += 1) {
        musicRows[i].cells[cellIndex] = alignedMusic[i];
      }
    }
    cellWidths[cellIndex] = Math.max(
      0,
      ...rows.map((row) => (
        String(row.cells[cellIndex] || "").length
        + (cellIndex === 0 ? String(row.prefix || "").length : 0)
      )),
    );
  }

  const maxSeparators = Math.max(...rows.map((row) => row.separators.length));
  const separatorLayouts = Array.from(
    { length: maxSeparators },
    (_unused, index) => separatorLayout(rows, index),
  );

  return rows.map((row) => {
    let out = "";
    for (let i = 0; i < row.cells.length; i += 1) {
      const cell = `${i === 0 ? row.prefix : ""}${String(row.cells[i] || "")}`;
      if (i < row.separators.length) {
        const cellWidth = cellWidths[i] + 1;
        out += cell.padEnd(cellWidth, " ");
        out += formatSeparator(row.separators[i], separatorLayouts[i]);
        if (i + 1 < row.cells.length) out += " ";
      } else {
        out += cell;
      }
    }
    return out.trimEnd();
  });
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

function getBarSeparatorVisualColumns(line) {
  const parts = splitLineIntoParts(String(line || ""));
  const cols = [];
  let offset = 0;
  for (const part of parts) {
    const text = String(part || "");
    const m = text.match(BAR_SEP_NO_SPACE);
    if (m) {
      const pipeOffset = m[0].lastIndexOf("|");
      cols.push(offset + m.index + Math.max(0, pipeOffset));
    }
    offset += text.length;
  }
  return cols;
}

function hasStableBarGrid(lines) {
  const columns = lines.map(getBarSeparatorVisualColumns);
  if (columns.length < 2 || !columns[0].length) return false;
  if (!columns.every((cols) => cols.length === columns[0].length)) return false;
  return columns.every((cols) => cols.every((col, i) => col === columns[0][i]));
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
    const gridEntries = [];
    for (const candidate of group) {
      gridEntries.push({ idx: candidate.idx, line: candidate.line });
      let lyricIdx = candidate.idx + 1;
      while (lyricIdx < lines.length && /^\s*w:/.test(lines[lyricIdx] || "")) {
        gridEntries.push({ idx: lyricIdx, line: lines[lyricIdx] });
        lyricIdx += 1;
      }
    }
    const gridLines = gridEntries.map((entry) => entry.line);
    if (hasStableBarGrid(gridLines)) continue;

    const aligned = alignLines(tuneText, gridLines, true);
    for (let i = 0; i < gridEntries.length; i += 1) {
      out[gridEntries[i].idx] = aligned[i];
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
