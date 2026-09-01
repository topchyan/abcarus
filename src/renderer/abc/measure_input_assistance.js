import {
  BAR_SEP_NO_SPACE,
  getBarLength,
  splitLineIntoParts,
} from "./bar_metrics.js";

function parseFraction(value) {
  const match = String(value || "").trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return null;
  return { num, den, value: num / den };
}

function parseMeter(value) {
  const token = String(value || "").trim();
  if (/^C$/i.test(token)) return { num: 4, den: 4, value: 1 };
  if (/^C\|$/i.test(token)) return { num: 2, den: 2, value: 1 };
  return parseFraction(token);
}

function lineRangeAt(text, offset) {
  const src = String(text || "");
  const pos = Math.max(0, Math.min(Number(offset) || 0, src.length));
  const start = Math.max(0, src.lastIndexOf("\n", Math.max(0, pos - 1)) + 1);
  const next = src.indexOf("\n", pos);
  return { start, end: next >= 0 ? next : src.length };
}

function isMusicLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("%")) return false;
  if (/^[A-Za-z]:/.test(trimmed)) return false;
  return !/^\[[A-Za-z]:[^\]]*\]\s*$/.test(trimmed);
}

function findBodyStart(text) {
  const match = String(text || "").match(/^\s*K:[^\r\n]*(?:\r?\n|\r|$)/m);
  return match ? match.index + match[0].length : null;
}

function findLastContextField(text, offset, field) {
  const prefix = String(text || "").slice(0, Math.max(0, Number(offset) || 0));
  const pattern = new RegExp(`(?:^\\s*${field}:\\s*([^\\s%\\]]+)|\\[\\s*${field}:\\s*([^\\]]+)\\])`, "gim");
  let value = "";
  let match;
  while ((match = pattern.exec(prefix)) !== null) value = String(match[1] || match[2] || "").trim();
  return value;
}

function stripNonMusicLines(text) {
  return String(text || "")
    .split(/\r\n|\n|\r/)
    .filter((line) => isMusicLine(line))
    .map(stripComment)
    .join(" ");
}

function stripComment(line) {
  const value = String(line || "");
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "%" && value[i - 1] !== "\\") return value.slice(0, i);
  }
  return value;
}

function findMeasureBounds(text, bodyStart, offset) {
  const src = String(text || "");
  const separators = [];
  let lineStart = Math.max(0, bodyStart);
  while (lineStart <= src.length) {
    const nextLine = src.indexOf("\n", lineStart);
    const lineEnd = nextLine >= 0 ? nextLine : src.length;
    const rawLine = src.slice(lineStart, lineEnd);
    if (isMusicLine(rawLine)) {
      const line = stripComment(rawLine);
      const parts = splitLineIntoParts(line);
      let cursor = 0;
      for (const part of parts) {
        const value = String(part || "");
        const found = line.indexOf(value, cursor);
        const relativeStart = found >= 0 ? found : cursor;
        cursor = relativeStart + value.length;
        if (!BAR_SEP_NO_SPACE.test(value.trim())) continue;
        separators.push({
          start: lineStart + relativeStart,
          end: lineStart + relativeStart + value.length,
        });
      }
    }
    if (nextLine < 0) break;
    lineStart = nextLine + 1;
  }

  let start = bodyStart;
  let end = src.length;
  for (const separator of separators) {
    if (separator.end <= offset) start = separator.end;
    else if (separator.start >= offset) {
      end = separator.start;
      break;
    }
  }
  return { start, end };
}

function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function formatUnits(value) {
  if (!Number.isFinite(value)) return "?";
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.001) return String(rounded);
  const scale = 96;
  const numerator = Math.round(value * scale);
  const divisor = gcd(numerator, scale);
  return `${numerator / divisor}/${scale / divisor}`;
}

function computeMeasureInputAssistance(text, offset) {
  const src = String(text || "");
  if (!src || !Number.isFinite(Number(offset))) return null;
  const pos = Math.max(0, Math.min(Math.floor(Number(offset)), src.length));
  const lineRange = lineRangeAt(src, pos);
  if (!isMusicLine(src.slice(lineRange.start, lineRange.end))) return null;

  const bodyStart = findBodyStart(src);
  if (bodyStart == null || pos < bodyStart) return null;

  const meterRaw = findLastContextField(src, pos, "M");
  if (!meterRaw || /^none$/i.test(meterRaw)) return null;
  const meter = parseMeter(meterRaw);
  if (!meter) return null;

  const defaultLengthRaw = findLastContextField(src, pos, "L") || "1/8";
  const defaultLength = parseFraction(defaultLengthRaw);
  if (!defaultLength) return null;

  const { start, end } = findMeasureBounds(src, bodyStart, pos);
  if (end < start || pos < start || pos > end) return null;

  const measureText = stripNonMusicLines(src.slice(start, end));
  if (!measureText.trim()) return null;
  const actualWhole = getBarLength(measureText, defaultLength.value, meter.value);
  if (!Number.isFinite(actualWhole)) return null;

  const actualUnits = actualWhole / defaultLength.value;
  const expectedUnits = meter.value / defaultLength.value;
  const tolerance = Math.max(0.001, expectedUnits * 0.001);
  const delta = actualUnits - expectedUnits;
  const state = Math.abs(delta) <= tolerance
    ? "complete"
    : (delta < 0 ? "incomplete" : "overfull");

  return {
    state,
    actualUnits,
    expectedUnits,
    meter: `${meter.num}/${meter.den}`,
    defaultLength: `${defaultLength.num}/${defaultLength.den}`,
    range: { start, end },
    text: `Measure ${formatUnits(actualUnits)}/${formatUnits(expectedUnits)}`,
  };
}

export {
  computeMeasureInputAssistance,
  formatUnits,
  isMusicLine,
};
