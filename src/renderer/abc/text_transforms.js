function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function parseLengthString(lenStr) {
  if (!lenStr) return { num: 1, den: 1 };
  if (/^\/+$/.test(lenStr)) {
    return { num: 1, den: 2 ** lenStr.length };
  }
  if (/^\d+$/.test(lenStr)) {
    return { num: Number(lenStr), den: 1 };
  }
  const slashOnly = lenStr.match(/^(\d+)(\/+)$/);
  if (slashOnly) {
    const num = Number(slashOnly[1]);
    const den = 2 ** slashOnly[2].length;
    return { num, den };
  }
  const ratio = lenStr.match(/^(\d+)\/(\d+)$/);
  if (ratio) {
    return { num: Number(ratio[1]), den: Number(ratio[2]) };
  }
  const denomOnly = lenStr.match(/^\/(\d+)$/);
  if (denomOnly) {
    return { num: 1, den: Number(denomOnly[1]) };
  }
  const trailingSlash = lenStr.match(/^(\d+)\/$/);
  if (trailingSlash) {
    return { num: Number(trailingSlash[1]), den: 2 };
  }
  return null;
}

function formatLengthString(num, den) {
  if (den === 1) {
    return num === 1 ? "" : String(num);
  }
  if (num === 1) return `/${den}`;
  return `${num}/${den}`;
}

function scaleLengthString(lenStr, factorNum, factorDen) {
  const parsed = parseLengthString(lenStr);
  if (!parsed) return lenStr;
  let num = parsed.num * factorNum;
  let den = parsed.den * factorDen;
  const div = gcd(num, den);
  num /= div;
  den /= div;
  return formatLengthString(num, den);
}

function scaleLengthsInLine(line, factorNum, factorDen) {
  if (!line) return line;
  if (/^\s*%/.test(line)) return line;
  if (/^\s*[wW]:/.test(line)) return line;
  if (/^\s*[A-Za-z]:/.test(line)) return line;

  let inQuote = false;
  let inGrace = false;
  let i = 0;
  let out = "";

  const pushChar = () => {
    out += line[i];
    i += 1;
  };

  while (i < line.length) {
    const ch = line[i];
    // Skip decorations like !fermata! and +trill+ (and anything inside them).
    if (!inQuote && !inGrace && (ch === "!" || ch === "+")) {
      const next = line.indexOf(ch, i + 1);
      if (next >= 0) {
        out += line.slice(i, next + 1);
        i = next + 1;
        continue;
      }
    }
    // Skip inline fields like [K:D] or [M:9/8] (but not chord brackets like [CEG]).
    if (!inQuote && !inGrace && ch === "[" && /[A-Za-z]:/.test(line.slice(i + 1, i + 3))) {
      const next = line.indexOf("]", i + 1);
      if (next >= 0) {
        out += line.slice(i, next + 1);
        i = next + 1;
        continue;
      }
    }
    if (ch === "\"") {
      inQuote = !inQuote;
      pushChar();
      continue;
    }
    if (!inQuote && ch === "{") {
      inGrace = true;
      pushChar();
      continue;
    }
    if (inGrace && ch === "}") {
      inGrace = false;
      pushChar();
      continue;
    }
    if (!inQuote && !inGrace && ch === "%") {
      out += line.slice(i);
      break;
    }
    if (!inQuote && !inGrace) {
      let j = i;
      while (line[j] === "^" || line[j] === "_" || line[j] === "=") j += 1;
      if (/[A-Ga-gxzZ]/.test(line[j] || "")) {
        j += 1;
        while (line[j] === "," || line[j] === "'") j += 1;
        const lenStart = j;
        while (/[0-9/]/.test(line[j] || "")) j += 1;
        const lenStr = line.slice(lenStart, j);
        const scaled = scaleLengthString(lenStr, factorNum, factorDen);
        out += line.slice(i, lenStart) + scaled;
        i = j;
        continue;
      }
    }
    pushChar();
  }
  return out;
}

function adjustDefaultLengthLine(line, factorNum, factorDen) {
  const match = line.match(/^L:\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return line;
  let num = Number(match[1]);
  let den = Number(match[2]);
  num *= factorNum;
  den *= factorDen;
  const div = gcd(num, den);
  num /= div;
  den /= div;
  return `L:${num}/${den}`;
}

function transformLengthScaling(text, mode) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const factorNum = mode === "double" ? 2 : 1;
  const factorDen = mode === "double" ? 1 : 2;
  const lFactorNum = mode === "double" ? 1 : 2;
  const lFactorDen = mode === "double" ? 2 : 1;
  const out = [];
  let i = 0;
  let inTextBlock = false;

  while (i < lines.length) {
    if (/^\s*%%\s*begintext\b/i.test(lines[i])) {
      inTextBlock = true;
    }
    if (inTextBlock) {
      out.push(lines[i]);
      if (/^\s*%%\s*endtext\b/i.test(lines[i])) inTextBlock = false;
      i += 1;
      continue;
    }
    if (!/^\s*X:/.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const start = i;
    i += 1;
    while (i < lines.length && !/^\s*X:/.test(lines[i])) i += 1;
    const block = lines.slice(start, i);
    let kIndex = -1;
    for (let j = 0; j < block.length; j += 1) {
      if (/^\s*K:/.test(block[j])) {
        kIndex = j;
        break;
      }
    }
    if (kIndex === -1) {
      out.push(...block);
      continue;
    }

    let hasL = false;
    for (let j = 0; j < kIndex; j += 1) {
      if (/^\s*L:/.test(block[j])) {
        block[j] = adjustDefaultLengthLine(block[j].trim(), lFactorNum, lFactorDen);
        hasL = true;
        break;
      }
    }
    if (!hasL) {
      const baseLine = adjustDefaultLengthLine("L:1/8", lFactorNum, lFactorDen);
      block.splice(kIndex, 0, baseLine);
      kIndex += 1;
    }

    for (let j = kIndex + 1; j < block.length; j += 1) {
      block[j] = scaleLengthsInLine(block[j], factorNum, factorDen);
    }
    out.push(...block);
  }
  return out.join("\n");
}

function scaleTempoLine(line, factor) {
  const match = String(line || "").match(/^(\s*Q:\s*.*?)(\d+(?:\.\d+)?)(\s*)$/);
  if (!match) return line;
  const value = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(factor) || factor <= 0) return line;
  const scaled = value * factor;
  const formatted = Number.isInteger(scaled) ? String(scaled) : String(Number(scaled.toFixed(6)));
  return `${match[1]}${formatted}${match[3]}`;
}

function transformTempoScaling(text, factor) {
  const numericFactor = Number(factor);
  if (!Number.isFinite(numericFactor) || numericFactor <= 0) return String(text || "");
  return String(text || "")
    .split(/\r\n|\n|\r/)
    .map((line) => /^\s*Q:/.test(line) ? scaleTempoLine(line, numericFactor) : line)
    .join("\n");
}

function scaleAbcFractionDenominator(text, factor) {
  const numericFactor = Number(factor);
  if (!Number.isFinite(numericFactor) || numericFactor <= 0) return String(text || "");
  return String(text || "").replace(/(\d+)\s*\/\s*(\d+)/g, (all, num, den) => {
    const nextDen = Number(den) / numericFactor;
    if (!Number.isInteger(nextDen) || nextDen <= 0) return all;
    return `${num}/${nextDen}`;
  });
}

function scaleAbcUnitFieldBody(tag, body, factor) {
  const field = String(tag || "").toUpperCase();
  const source = String(body || "");
  if (field === "M" || field === "L") {
    return source.replace(/^(\s*)(\d+\s*\/\s*\d+)/, (_all, leading, fraction) => (
      leading + scaleAbcFractionDenominator(fraction, factor)
    ));
  }
  if (field === "Q") {
    const equalsIndex = source.indexOf("=");
    if (equalsIndex < 0) return source;
    return scaleAbcFractionDenominator(source.slice(0, equalsIndex), factor) + source.slice(equalsIndex);
  }
  return source;
}

function scaleInlineAbcUnitFields(line, factor) {
  const source = String(line || "");
  let output = "";
  let index = 0;
  let inQuote = false;
  while (index < source.length) {
    const ch = source[index];
    if (ch === "\"") {
      inQuote = !inQuote;
      output += ch;
      index += 1;
      continue;
    }
    if (!inQuote && ch === "%") {
      output += source.slice(index);
      break;
    }
    const field = !inQuote ? source.slice(index).match(/^\[([MLQ]):([^\]]*)\]/i) : null;
    if (field) {
      output += `[${field[1]}:${scaleAbcUnitFieldBody(field[1], field[2], factor)}]`;
      index += field[0].length;
      continue;
    }
    output += ch;
    index += 1;
  }
  return output;
}

function transformAbcUnitScaling(text, factor) {
  return String(text || "")
    .split(/(\r\n|\n|\r)/)
    .map((line) => {
      if (/^(?:\r\n|\n|\r)$/.test(line)) return line;
      const field = String(line || "").match(/^(\s*)([MLQ]):([\s\S]*)$/i);
      if (field) {
        return `${field[1]}${field[2]}:${scaleAbcUnitFieldBody(field[2], field[3], factor)}`;
      }
      if (/^\s*(?:%|[wW]:)/.test(line)) return line;
      return scaleInlineAbcUnitFields(line, factor);
    })
    .join("");
}

function ensureCopyTitleInAbc(abcText) {
  const text = String(abcText || "");
  if (!text.trim()) return text;
  const lines = text.split(/\r\n|\n|\r/);
  const titleIdx = lines.findIndex((line) => /^T:/.test(line));
  const prefix = "(Copy) ";
  if (titleIdx >= 0) {
    const raw = lines[titleIdx].replace(/^T:\s*/, "").trim();
    if (/^\(copy\)\s*/i.test(raw)) return text;
    const title = raw || "Untitled";
    lines[titleIdx] = `T:${prefix}${title}`;
    return lines.join("\n");
  }
  const xIdx = lines.findIndex((line) => /^X:/.test(line));
  const insertIdx = xIdx >= 0 ? xIdx + 1 : 0;
  lines.splice(insertIdx, 0, `T:${prefix}Untitled`);
  return lines.join("\n");
}

function getNextXNumber(existingContent) {
  let max = 0;
  const re = /^\s*X:\s*(\d+)/gm;
  let match;
  const text = String(existingContent || "");
  while ((match = re.exec(text)) !== null) {
    const num = Number(match[1]);
    if (Number.isFinite(num)) max = Math.max(max, num);
  }
  return max + 1;
}

function ensureXNumberInAbc(abcText, xNumber) {
  const text = String(abcText || "");
  if (!text.trim()) return text;
  const lines = text.split(/\r\n|\n|\r/);
  const idx = lines.findIndex((line) => /^\s*X:/.test(line));
  const line = `X:${xNumber}`;
  if (idx >= 0) {
    const rawLine = String(lines[idx] || "");
    const prefix = rawLine.match(/^(\s*)X:/) ? RegExp.$1 : "";
    const normalizedX = `${prefix}${line}`;
    // Normalize appended tunes to X-first form. Any preamble lines before X
    // are preserved after X so tune segmentation stays deterministic.
    return [normalizedX, ...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n");
  }
  lines.unshift(line);
  return lines.join("\n");
}

function appendTuneToContent(existingContent, tuneText) {
  const existing = existingContent || "";
  const tune = String(tuneText || "").replace(/\s+$/, "");
  if (!existing.trim()) return `${tune}\n`;
  let separator = "\n\n";
  if (existing.endsWith("\n\n")) separator = "";
  else if (existing.endsWith("\n")) separator = "\n";
  return `${existing}${separator}${tune}\n`;
}

function renumberXLinesConsecutive(fullText) {
  const text = String(fullText || "");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\n|\r/);
  let foundAny = false;
  let n = 0;
  const out = [];
  for (const line of lines) {
    const match = String(line || "").match(/^(\s*X:\s*)(.*)$/);
    if (!match) {
      out.push(line);
      continue;
    }
    foundAny = true;
    n += 1;
    const prefix = match[1] || "X:";
    out.push(`${prefix}${n}`);
  }
  if (!foundAny) return { ok: false, error: "No X: headers found in file." };
  return { ok: true, text: out.join(newline), count: n };
}

function renumberXInTextKeepingFirst(abcText) {
  const lines = String(abcText || "").split(/\r\n|\n|\r/);
  const xStartRe = /^(\s*X:\s*)(.*)$/;
  const out = [];
  let base = null;
  let tuneIndex = 0;

  for (const line of lines) {
    const match = line.match(xStartRe);
    if (!match) {
      out.push(line);
      continue;
    }

    const prefix = match[1];
    const rest = match[2] || "";
    const numMatch = rest.match(/^(\s*)(\d+)(.*)$/);

    if (base == null) {
      if (numMatch) {
        const num = Number(numMatch[2]);
        if (Number.isFinite(num)) {
          base = num;
          tuneIndex = 0;
          out.push(line);
          continue;
        }
      }

      base = 1;
      tuneIndex = 0;
      out.push(`${prefix}${base}${rest}`);
      continue;
    }

    tuneIndex += 1;
    const next = base + tuneIndex;
    if (numMatch) out.push(`${prefix}${numMatch[1]}${next}${numMatch[3]}`);
    else out.push(`${prefix}${next}${rest}`);
  }

  if (base == null) return { ok: false, error: "No X: headers found in file." };

  return {
    ok: true,
    abcText: out.join("\n"),
    base,
    tuneCount: tuneIndex + 1,
  };
}

function removeTuneFromContent(content, startOffset, endOffset) {
  let before = String(content || "").slice(0, startOffset);
  let after = String(content || "").slice(endOffset);
  if (/\r?\n$/.test(before) && /^\r?\n/.test(after)) {
    after = after.replace(/^\r?\n/, "");
  }
  return before + after;
}

export {
  appendTuneToContent,
  ensureCopyTitleInAbc,
  ensureXNumberInAbc,
  getNextXNumber,
  removeTuneFromContent,
  renumberXInTextKeepingFirst,
  renumberXLinesConsecutive,
  transformLengthScaling,
  transformAbcUnitScaling,
  transformTempoScaling,
};
