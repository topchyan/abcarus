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
  return num / den;
}

function parseMeter(value) {
  const text = String(value || "").trim();
  if (/^C$/i.test(text)) return 1;
  if (/^C\|$/i.test(text)) return 1;
  return parseFraction(text);
}

function voiceIdFromLine(line) {
  const match = String(line || "").match(/^\s*V:\s*([^\s%]+)/i);
  return match ? String(match[1] || "").trim() : "";
}

function isMusicLine(line) {
  const text = String(line || "").trim();
  if (!text || text.startsWith("%")) return false;
  if (/^[A-Za-z]:/.test(text)) return false;
  return true;
}

function hasPitchedMusic(text) {
  const stripped = String(text || "")
    .replace(/%.*$/gm, "")
    .replace(/"(?:\\.|[^"\\])*"/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/![^!]*!/g, "")
    .replace(/\+[^+]*\+/g, "")
    .replace(/\[[A-Za-z]:[^\]]*\]/g, "");
  return /[_=^]?[A-Ga-g]/.test(stripped);
}

function formatLengthMultiplier(value) {
  const length = Number(value);
  if (!Number.isFinite(length) || length <= 0) return null;
  const rounded = Math.round(length);
  if (Math.abs(length - rounded) <= 1e-8) return rounded === 1 ? "x" : `x${rounded}`;
  for (let denominator = 2; denominator <= 15360; denominator += 1) {
    const numerator = Math.round(length * denominator);
    if (Math.abs(length - (numerator / denominator)) > 1e-9) continue;
    return numerator === 1 ? `x/${denominator}` : `x${numerator}/${denominator}`;
  }
  return null;
}

function getLineRecords(text) {
  const src = String(text || "");
  const lines = src.split(/\r\n|\n|\r/);
  const lineEnding = src.includes("\r\n") ? "\r\n" : (src.includes("\r") ? "\r" : "\n");
  const records = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    records.push({ index, line, start: offset, end: offset + line.length, nextStart: offset + line.length + (index < lines.length - 1 ? lineEnding.length : 0) });
    offset += line.length + (index < lines.length - 1 ? lineEnding.length : 0);
  }
  return { lineEnding, records };
}

function getVoiceBlocks(text) {
  const { records } = getLineRecords(text);
  const blocks = [];
  let bodyStarted = false;
  let active = null;
  for (const record of records) {
    if (!bodyStarted && /^\s*K:/.test(record.line)) bodyStarted = true;
    if (!bodyStarted) continue;
    if (active && /^\s*(?:W:|w:|X:)/.test(record.line)) {
      active.end = record.start;
      active = null;
    }
    const voiceId = voiceIdFromLine(record.line);
    if (!voiceId) continue;
    if (active) active.end = record.start;
    active = {
      voiceId,
      headerStart: record.start,
      bodyStart: record.nextStart,
      end: String(text || "").length,
      headerLine: record.index,
    };
    blocks.push(active);
  }
  return blocks;
}

function findActiveVoiceBlock(text, offset) {
  const blocks = getVoiceBlocks(text);
  const position = Math.max(0, Math.min(Number(offset) || 0, String(text || "").length));
  return blocks.find((block) => position >= block.headerStart && position <= block.end) || null;
}

function selectVoiceMusicBlock(text, voiceId) {
  const blocks = getVoiceBlocks(text).filter((block) => block.voiceId === voiceId);
  return blocks.find((block) => hasPitchedMusic(String(text || "").slice(block.bodyStart, block.end))) || null;
}

function isSourceStructuralLine(line) {
  const text = String(line || "").trim();
  return /^\s*(?:M:|L:|K:|P:|I:\s*linebreak\b)/i.test(text);
}

function getInlineStructuralFields(text) {
  const fields = [];
  const pattern = /\[\s*([MLKP])\s*:\s*([^\]]*)\]/gi;
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    fields.push({
      type: String(match[1] || "").toUpperCase(),
      value: String(match[2] || "").trim(),
      text: match[0],
    });
  }
  return fields;
}

function resolveContextBefore(text) {
  let meter = null;
  let defaultLength = null;
  for (const line of String(text || "").split(/\r\n|\n|\r/)) {
    const meterMatch = line.match(/^\s*M:\s*([^%\s]+)/i);
    if (meterMatch) meter = parseMeter(meterMatch[1]);
    const lengthMatch = line.match(/^\s*L:\s*([^%\s]+)/i);
    if (lengthMatch) defaultLength = parseFraction(lengthMatch[1]);
  }
  return { meter, defaultLength };
}

function buildSkeletonBody(sourceText, lineEnding, initialContext = {}) {
  const lines = String(sourceText || "").split(/\r\n|\n|\r/);
  let meter = initialContext.meter || null;
  let defaultLength = initialContext.defaultLength || null;
  let measureBuffer = "";
  let measureFields = [];
  const output = [];

  const updateContext = (line) => {
    const meterMatch = String(line || "").match(/^\s*M:\s*([^%\s]+)/i);
    if (meterMatch) meter = parseMeter(meterMatch[1]);
    const lengthMatch = String(line || "").match(/^\s*L:\s*([^%\s]+)/i);
    if (lengthMatch) defaultLength = parseFraction(lengthMatch[1]);
  };

  const flushMeasure = (barToken) => {
    const length = getBarLength(measureBuffer, defaultLength, meter);
    const multiplier = Number.isFinite(length) && Number.isFinite(defaultLength) && defaultLength > 0
      ? formatLengthMultiplier(length / defaultLength)
      : null;
    if (!multiplier) return null;
    measureBuffer = "";
    const prefix = measureFields.join(" ");
    measureFields = [];
    return `${prefix} ${multiplier} ${barToken}`.trim();
  };

  for (const rawLine of lines) {
    if (isSourceStructuralLine(rawLine)) {
      updateContext(rawLine);
      output.push(rawLine);
      continue;
    }
    if (/^(?:\s*\[\s*[MLKP]\s*:[^\]]*\]\s*)+$/i.test(rawLine)) {
      for (const field of getInlineStructuralFields(rawLine)) {
        if (field.type === "M") meter = parseMeter(field.value);
        if (field.type === "L") defaultLength = parseFraction(field.value);
      }
      output.push(String(rawLine || "").trim());
      continue;
    }
    if (!isMusicLine(rawLine)) continue;
    const pieces = [];
    for (const part of splitLineIntoParts(rawLine)) {
      const token = String(part || "").trim();
      if (!token) continue;
      if (BAR_SEP_NO_SPACE.test(token)) {
        if (!measureBuffer.trim()) {
          pieces.push(token);
          continue;
        }
        const generated = flushMeasure(token);
        if (!generated) return { ok: false, error: "Unable to calculate a source measure duration." };
        pieces.push(generated);
      } else {
        for (const field of getInlineStructuralFields(part)) {
          measureFields.push(field.text);
          if (field.type === "M") meter = parseMeter(field.value);
          if (field.type === "L") defaultLength = parseFraction(field.value);
        }
        measureBuffer += ` ${part}`;
      }
    }
    if (pieces.length) output.push(pieces.join(" "));
  }

  if (measureBuffer.trim()) {
    const generated = flushMeasure("");
    if (!generated) return { ok: false, error: "Unable to calculate the final source measure duration." };
    output.push(generated);
  }
  return { ok: true, text: output.join(lineEnding).replace(/\s+$/g, "") };
}

function splitTargetDecoration(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const firstMusic = lines.findIndex((line) => isMusicLine(line));
  if (firstMusic < 0) return { prefix: lines.join("\n").replace(/\s+$/g, ""), suffix: "" };
  let lastMusic = firstMusic;
  for (let index = firstMusic + 1; index < lines.length; index += 1) {
    if (isMusicLine(lines[index])) lastMusic = index;
  }
  return {
    prefix: lines.slice(0, firstMusic).join("\n").replace(/\s+$/g, ""),
    suffix: lines.slice(lastMusic + 1).join("\n").replace(/^\s+|\s+$/g, ""),
  };
}

function planBlankVoiceSkeleton(text, { sourceVoiceId = "1", targetOffset } = {}) {
  const src = String(text || "");
  const target = findActiveVoiceBlock(src, targetOffset);
  if (!target) return { ok: false, error: "Place the cursor in the target voice." };
  if (target.voiceId === String(sourceVoiceId)) return { ok: false, error: "Choose a different target voice." };
  const source = selectVoiceMusicBlock(src, String(sourceVoiceId));
  if (!source) return { ok: false, error: `V:${sourceVoiceId} has no music block to copy.` };
  const { lineEnding } = getLineRecords(src);
  const skeleton = buildSkeletonBody(
    src.slice(source.bodyStart, source.end),
    lineEnding,
    resolveContextBefore(src.slice(0, source.bodyStart)),
  );
  if (!skeleton.ok) return skeleton;
  const targetBody = src.slice(target.bodyStart, target.end);
  const decoration = splitTargetDecoration(targetBody);
  const replacement = [decoration.prefix, skeleton.text, decoration.suffix].filter(Boolean).join(lineEnding);
  return {
    ok: true,
    sourceVoiceId: String(sourceVoiceId),
    targetVoiceId: target.voiceId,
    targetHasPitchedMusic: hasPitchedMusic(targetBody),
    change: { from: target.bodyStart, to: target.end, insert: replacement ? `${replacement}${lineEnding}` : "" },
  };
}

export {
  planBlankVoiceSkeleton,
};
