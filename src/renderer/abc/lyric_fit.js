import { BAR_SEP_NO_SPACE, splitLineIntoParts } from "./bar_metrics.js";

function musicCells(line) {
  return splitLineIntoParts(String(line || ""))
    .filter((part) => !BAR_SEP_NO_SPACE.test(part || ""));
}

function lyricCells(line) {
  const body = String(line || "").replace(/^\s*w:\s*/, "");
  return splitLineIntoParts(body)
    .filter((part) => !BAR_SEP_NO_SPACE.test(part || ""));
}

function countNoteAnchors(text) {
  const src = String(text || "");
  let count = 0;
  let quote = false;
  let decoration = false;
  let grace = false;
  let chord = false;
  let chordCounted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' && !decoration && !grace && !chord) {
      quote = !quote;
      continue;
    }
    if (quote) continue;
    if (ch === "!" && !grace && !chord) {
      decoration = !decoration;
      continue;
    }
    if (decoration) continue;
    if (ch === "{" && !chord) {
      grace = true;
      continue;
    }
    if (ch === "}" && grace) {
      grace = false;
      continue;
    }
    if (grace) continue;
    if (ch === "[") {
      if (/^[A-Za-z]:/.test(src.slice(i + 1))) {
        const close = src.indexOf("]", i + 1);
        if (close >= 0) i = close;
        continue;
      }
      chord = true;
      chordCounted = false;
      continue;
    }
    if (chord) {
      if (ch === "]") {
        chord = false;
        continue;
      }
      if (!chordCounted && /[A-Ga-g]/.test(ch)) {
        count += 1;
        chordCounted = true;
      }
      continue;
    }
    if (/[A-Ga-g]/.test(ch)) {
      count += 1;
      while (/[',0-9/]/.test(src[i + 1] || "")) i += 1;
    }
  }
  return count;
}

function countLyricAdvances(text) {
  const src = String(text || "").trim();
  if (!src) return 0;
  let count = 0;
  let token = "";
  let escaped = false;
  const flush = () => {
    if (token) count += 1;
    token = "";
  };
  for (const ch of src) {
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
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (ch === "*" || ch === "_") {
      flush();
      count += 1;
      continue;
    }
    token += ch;
  }
  flush();
  return count;
}

function analyzeLyricFitInText(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const mismatches = [];
  let checkedBars = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(?:%|[A-Za-z]:)/.test(line) || !BAR_SEP_NO_SPACE.test(line)) continue;
    const lyrics = [];
    let lyricIndex = i + 1;
    while (lyricIndex < lines.length && /^\s*w:/.test(lines[lyricIndex] || "")) {
      lyrics.push({ line: lyricIndex + 1, cells: lyricCells(lines[lyricIndex]) });
      lyricIndex += 1;
    }
    if (!lyrics.length) continue;
    const notes = musicCells(line).map(countNoteAnchors);
    for (const lyric of lyrics) {
      for (let bar = 0; bar < Math.min(notes.length, lyric.cells.length); bar += 1) {
        const advances = countLyricAdvances(lyric.cells[bar]);
        if (!advances) continue;
        checkedBars += 1;
        if (notes[bar] === advances) continue;
        mismatches.push({
          line: lyric.line,
          bar: bar + 1,
          notes: notes[bar],
          lyrics: advances,
          suggestion: notes[bar] > advances
            ? `add ${notes[bar] - advances} * or _ marker(s)`
            : `join or revise ${advances - notes[bar]} lyric advance(s), for example with ~`,
        });
      }
    }
    i = lyricIndex - 1;
  }
  return { checkedBars, mismatches };
}

export {
  analyzeLyricFitInText,
  countLyricAdvances,
  countNoteAnchors,
};
