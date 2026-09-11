const BAR_SEP_SYMBOLS = [
  "|:::",
  ":::|",
  ":::",
  ":|][|:",
  ":|[2",
  ":|]2",
  ":||:",
  "[|]",
  ":|]",
  "[|:",
  ":||",
  "||:",
  ":|:",
  "|::",
  "::|",
  "|[1",
  ":|2",
  "|]",
  "||",
  "[|",
  "::",
  ".|",
  "|1",
  "|:",
  ":|",
  "[1",
  "[2",
  "|",
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BAR_SEP = new RegExp(
  `(${BAR_SEP_SYMBOLS.map((s) => `\\s*${escapeRegExp(s)}\\s*`).join("|")})`
);
const BAR_SEP_NO_SPACE_SOURCE = `(${BAR_SEP_SYMBOLS.map((s) => escapeRegExp(s)).join("|")})`;
const BAR_SEP_NO_SPACE = new RegExp(BAR_SEP_NO_SPACE_SOURCE);

function findBarSeparators(line) {
  const text = String(line || "");
  const re = new RegExp(BAR_SEP_NO_SPACE_SOURCE, "g");
  const matches = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      token: match[0],
    });
  }
  return matches;
}

function splitLineIntoParts(line) {
  return String(line || "").split(BAR_SEP).filter((p) => p);
}

function removeNonNoteFragments(abc) {
  let out = String(abc || "");
  out = out.replace(/^%.*$/gm, "");
  out = out.replace(/\[\w:.*?\]/g, "");
  out = out.replace(/\\"/g, "");
  out = out.replace(/".*?"/g, "");
  out = out.replace(/\{.*?\}/g, "");
  out = out.replace(/!.+?!/g, "");
  out = out.replace(/\+.+?\+/g, "");
  return out;
}

function replaceChordsByFirstNote(abc) {
  const cleaned = removeNonNoteFragments(abc);
  const notePattern = /([_=^]?[A-Ga-gxz](,+|'+)?)(\d{0,2}\/\d{1,2}|\/+|\d{0,2})([><]?)/;
  return cleaned.replace(/\[.*?\]/g, (m) => {
    const match = m.match(notePattern);
    return match ? match[0] : "";
  });
}

function getDefaultLen(abc) {
  const text = String(abc || "");
  if (/^L:\s*mcm_default/m.test(text)) return "mcm_default";
  const match = text.match(/^L:\s*(\d+)\/(\d+)/m);
  if (match) return Number(match[1]) / Number(match[2]);
  return 1 / 8;
}

function getMetre(abc) {
  const match = String(abc || "").match(/^M:\s*(\d+)\/(\d+)/m);
  if (match) return Number(match[1]) / Number(match[2]);
  return 1;
}

function getBarLengthCore(abc, defaultLength, metre) {
  let body = removeNonNoteFragments(abc);
  body = replaceChordsByFirstNote(body);
  const notePattern = /([_=^]?[A-Ga-gxz](,+|'+)?)(\d{0,3}(?:\/\d{0,3})*)(\.*)([><]?)/g;
  const tupletPattern = /\(([1-9])(?::([1-9]?))?(?::([1-9]?))?/g;
  let total = 0;
  let lastBroken = "";
  let tupletNotesLeft = 0;
  let tupletNotes = 0;
  let tupletTime = 2;

  const tokens = [];
  let match;
  while ((match = notePattern.exec(body)) !== null) {
    tokens.push({ type: "note", match });
  }
  notePattern.lastIndex = 0;
  while ((match = tupletPattern.exec(body)) !== null) {
    tokens.push({ type: "tuplet", match });
  }
  tokens.sort((a, b) => a.match.index - b.match.index);

  for (const token of tokens) {
    if (token.type === "tuplet") {
      tupletNotes = Number(token.match[1]);
      const q = token.match[2] ? Number(token.match[2]) : null;
      if (q) {
        tupletTime = q;
      } else if (tupletNotes === 3 || tupletNotes === 6) {
        tupletTime = 2;
      } else if (tupletNotes === 2 || tupletNotes === 4 || tupletNotes === 8) {
        tupletTime = 3;
      } else {
        tupletTime = (metre * 1) % 1 === 0 ? 2 : 3;
      }
      tupletNotesLeft = token.match[3] ? Number(token.match[3]) : tupletNotes;
      continue;
    }

    const lengthStr = token.match[3] || "";
    const dots = token.match[4] || "";
    const broken = token.match[5] || "";
    let mult = 1;

    if (defaultLength === "mcm_default") {
      const base = lengthStr.split("/")[0] || "1";
      mult = 1 / Number(base);
      for (let i = 0; i < dots.length; i += 1) mult *= 1.5;
      total += mult;
      continue;
    }

    if (broken === ">" || lastBroken === "<") mult = 1.5;
    else if (broken === "<" || lastBroken === ">") mult = 0.5;
    lastBroken = broken;

    const dividend = lengthStr.split("/")[0];
    if (dividend) mult *= Number(dividend);
    const divMatches = lengthStr.match(/\/(\d*)/g) || [];
    for (const divMatch of divMatches) {
      const num = divMatch.slice(1);
      mult /= num ? Number(num) : 2;
    }

    if (tupletNotesLeft) {
      mult *= tupletTime / tupletNotes;
      tupletNotesLeft -= 1;
    }
    total += mult * defaultLength;
  }
  return total;
}

function getBarLength(abc, defaultLength, metre) {
  const text = String(abc || "");
  // `&` creates overlays (parallel strands) inside a bar. For bar-length checks we must
  // compare strand durations and use the longest one, not sum all strands serially.
  if (text.includes("&")) {
    const layers = text.split("&").map((s) => s.trim()).filter(Boolean);
    if (layers.length > 1) {
      let maxLen = 0;
      for (const layer of layers) {
        const len = getBarLengthCore(layer, defaultLength, metre);
        if (Number.isFinite(len) && len > maxLen) maxLen = len;
      }
      return maxLen;
    }
  }
  return getBarLengthCore(text, defaultLength, metre);
}

function isLikelyAnacrusis(bar, defaultLength, metre) {
  if (!bar || BAR_SEP_NO_SPACE.test(bar)) return false;
  const actual = getBarLength(bar, defaultLength, metre);
  return actual <= metre * 0.8;
}

function gcdInt(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  if (!x) return y || 1;
  if (!y) return x || 1;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

export {
  BAR_SEP_NO_SPACE,
  findBarSeparators,
  gcdInt,
  getBarLength,
  getDefaultLen,
  getMetre,
  isLikelyAnacrusis,
  splitLineIntoParts,
};
