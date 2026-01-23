function findLineStart(text, index) {
  if (!index || index <= 0) return 0;
  const i = Number(index);
  if (!Number.isFinite(i) || i <= 0) return 0;
  const prevNl = text.lastIndexOf("\n", i - 1);
  return prevNl >= 0 ? prevNl + 1 : 0;
}

function segmentTunes(fullText) {
  const text = String(fullText || "");
  const tunes = [];
  // Allow leading whitespace: other parsers in the app accept `^\s*X:`.
  const xLineRe = /^\s*X:\s*(.*)$/gm;
  let match;

  while ((match = xLineRe.exec(text)) !== null) {
    const start = findLineStart(text, match.index);
    const rawXLine = match[0] || "X:";
    const xValue = match[1] != null ? String(match[1]) : "";
    tunes.push({ start, end: text.length, rawXLine, xValue });
  }

  for (let i = 0; i < tunes.length; i += 1) {
    const next = tunes[i + 1];
    if (next) tunes[i].end = next.start;
  }

  const firstStart = tunes.length ? tunes[0].start : text.length;
  const preambleSlice = { start: 0, end: firstStart };
  return { preambleSlice, tunes };
}

module.exports = {
  segmentTunes,
};
