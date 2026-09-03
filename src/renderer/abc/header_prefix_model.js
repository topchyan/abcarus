function normalizeHeaderLayer(text) {
  if (text == null) return "";
  if (typeof text !== "string") {
    console.error("[abcarus] header layer is not a string; dropped:", Object.prototype.toString.call(text));
    return "";
  }
  const raw = text;
  if (!raw.trim()) return "";
  return raw.replace(/[\r\n]+$/, "");
}

const SINGLETON_HEADER_FIELDS = new Set([
  "K",
  "M",
  "L",
  "Q",
  "R",
  "C",
  "T",
  "S",
  "O",
  "G",
]);

const SINGLETON_HEADER_DIRECTIVES = new Set([
  "musicfont",
  "oneperpage",
  "pagewidth",
  "pageheight",
  "staffwidth",
  "scale",
  "annotationfont",
  "footerfont",
  "headerfont",
  "historyfont",
  "infofont",
  "titlefont",
  "subtitlefont",
  "composerfont",
  "partsfont",
  "textfont",
  "gchordfont",
  "tempofont",
  "tupletfont",
  "voicefont",
  "vocalfont",
  "wordsfont",
  "measurefont",
  "repeatfont",
  "measurenb",
  "landscape",
  "papersize",
  "leftmargin",
  "rightmargin",
  "topmargin",
  "botmargin",
  "staffsep",
  "systemsep",
  "stretchlast",
  "stretchstaff",
  "titleformat",
]);

function moveTuneScopedDirectivesIntoTune(headerText, tuneText) {
  const sourceHeader = String(headerText || "");
  const sourceTune = String(tuneText || "");
  if (!sourceHeader || !/^[\t ]*X:/m.test(sourceTune)) {
    return { headerText: sourceHeader, tuneText: sourceTune };
  }

  const tuneScoped = [];
  const remaining = [];
  for (const line of sourceHeader.split("\n")) {
    if (/^[\t ]*%%\s*titleformat\b/i.test(line)) tuneScoped.push(line);
    else remaining.push(line);
  }
  if (!tuneScoped.length) return { headerText: sourceHeader, tuneText: sourceTune };

  const directiveText = `${tuneScoped.join("\n")}\n`;
  return {
    headerText: remaining.join("\n"),
    tuneText: sourceTune.replace(
      /^([\t ]*X:[^\r\n]*(?:\r\n|\n|\r))/m,
      `$1${directiveText}`,
    ),
  };
}

function composeHeaderPrefixPayload(prefixPayload, tuneText) {
  const payload = prefixPayload || {};
  const body = typeof payload.tuneText === "string" ? payload.tuneText : String(tuneText || "");
  return payload.text ? `${payload.text}${body}` : body;
}

function getHeaderLineKey(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("%")) {
    if (!trimmed.startsWith("%%")) return null;
    const match = trimmed.match(/^%%\s*([A-Za-z0-9_-]+)/);
    if (!match) return null;
    const name = match[1].toLowerCase();
    if (!SINGLETON_HEADER_DIRECTIVES.has(name)) return null;
    return `%%${name}`;
  }
  const fieldMatch = trimmed.match(/^([A-Za-z]):/);
  if (!fieldMatch) return null;
  const field = fieldMatch[1].toUpperCase();
  if (!SINGLETON_HEADER_FIELDS.has(field)) return null;
  return field;
}

function getHeaderSectionLines(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let sawHeader = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isBlank = trimmed === "";
    const isHeader = /^[A-Za-z]:/.test(line) || /^%/.test(line);
    if (isHeader) sawHeader = true;
    if (sawHeader && isBlank) break;
    if (!isHeader && !isBlank) break;
    out.push(line);
  }
  return out;
}

function collectHeaderKeys(text) {
  const keys = new Set();
  const lines = getHeaderSectionLines(text);
  for (const line of lines) {
    const key = getHeaderLineKey(line);
    if (key) keys.add(key);
  }
  return keys;
}

function dedupeHeaderLayers(layers, blockedKeys) {
  const seen = new Set(blockedKeys || []);
  const kept = layers.map(() => []);
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i];
    const lines = String(layer || "").split(/\r\n|\n|\r/);
    for (const line of lines) {
      const key = getHeaderLineKey(line);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      kept[i].push(line);
    }
  }
  return kept.map((lines) => lines.join("\n")).filter((text) => text.trim());
}

function dedupeHeaderLayersWithMeta(layers, blockedKeys) {
  const seen = new Set(blockedKeys || []);
  const kept = layers.map(() => []);
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i];
    const text = layer && layer.text ? String(layer.text) : "";
    const lines = text.split(/\r\n|\n|\r/);
    for (const line of lines) {
      const key = getHeaderLineKey(line);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      kept[i].push(line);
    }
  }
  const out = [];
  for (let i = 0; i < layers.length; i += 1) {
    const meta = layers[i] || {};
    const text = kept[i].join("\n");
    if (!text.trim()) continue;
    out.push({ ...meta, text });
  }
  return out;
}

function buildHeaderPrefixFromLayers({ layers = [], includeCheckbars = false, tuneText = "" } = {}) {
  const tuneHeaderKeys = tuneText ? collectHeaderKeys(tuneText) : new Set();
  const deduped = dedupeHeaderLayers(layers, tuneHeaderKeys);
  let header = deduped.join("\n");
  if (!header.trim()) return { text: "", offset: 0 };
  if (includeCheckbars && !/%%\s*checkbars\b/i.test(header)) {
    header = `%%checkbars 1\n${header}`;
  }
  const fullPrefix = /[\r\n]$/.test(header) ? header : `${header}\n`;
  const moved = moveTuneScopedDirectivesIntoTune(fullPrefix, tuneText);
  const prefix = moved.headerText && !/[\r\n]$/.test(moved.headerText)
    ? `${moved.headerText}\n`
    : moved.headerText;
  return {
    text: prefix,
    tuneText: moved.tuneText,
    offset: prefix.length + moved.tuneText.length - String(tuneText || "").length,
    lineOffsetText: fullPrefix,
  };
}

function buildHeaderPrefixWithLayerSpansFromLayers({ layers = [], includeCheckbars = false, tuneText = "" } = {}) {
  const tuneHeaderKeys = tuneText ? collectHeaderKeys(tuneText) : new Set();
  let deduped = dedupeHeaderLayersWithMeta(layers, tuneHeaderKeys);

  if (includeCheckbars) {
    const has = deduped.some((l) => /%%\s*checkbars\b/i.test(String(l && l.text ? l.text : "")));
    if (!has) {
      deduped = [{ kind: "abcarus", text: "%%checkbars 1" }, ...deduped];
    }
  }

  const normalized = deduped.map((l) => ({ ...l, text: String(l.text || "").replace(/[\r\n]+$/, "") }))
    .filter((l) => String(l.text || "").trim());
  const joined = normalized.map((l) => l.text).join("\n");
  if (!joined.trim()) return { text: "", offset: 0, spans: [] };

  const spans = [];
  let lineNo = 1;
  for (let i = 0; i < normalized.length; i += 1) {
    const layer = normalized[i];
    const cls = layer.kind === "fileHeader" ? "cm-payload-layer-fileheader" : "cm-payload-layer-abcarus";
    const lineCount = String(layer.text || "").split(/\r\n|\n|\r/).length;
    spans.push({ fromLine: lineNo, toLine: lineNo + Math.max(0, lineCount - 1), className: cls });
    lineNo += lineCount;
  }

  const prefix = /[\r\n]$/.test(joined) ? joined : `${joined}\n`;
  return { text: prefix, offset: prefix.length, spans };
}

function sanitizeFileHeaderForInteractiveRender(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!raw.trim()) return "";
  const lines = raw.split("\n");
  const out = [];
  let inTextBlock = false;
  let inSvgBlock = false;

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (/^%%\s*beginsvg\b/i.test(trimmed)) {
      inSvgBlock = true;
      out.push(line);
      continue;
    }
    if (inSvgBlock) {
      out.push(line);
      if (/^%%\s*endsvg\b/i.test(trimmed)) inSvgBlock = false;
      continue;
    }
    if (/^%%\s*begintext\b/i.test(trimmed)) {
      inTextBlock = true;
      out.push(line);
      continue;
    }
    if (inTextBlock) {
      out.push(line);
      if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
      continue;
    }
    if (!trimmed) {
      out.push("");
      continue;
    }
    if (/^%%/.test(trimmed)) {
      out.push(line);
      continue;
    }
    if (/^%/.test(trimmed) || /^[A-Za-z]:/.test(trimmed)) {
      out.push(line);
      continue;
    }
  }
  return out.join("\n").replace(/\s+$/, "");
}

function sanitizeFileHeaderForPerTuneRender(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!raw.trim()) return "";
  const lines = raw.split("\n");
  const out = [];
  let inTextBlock = false;
  let inSvgBlock = false;

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (/^%%\s*beginsvg\b/i.test(trimmed)) {
      inSvgBlock = true;
      out.push(line);
      continue;
    }
    if (inSvgBlock) {
      out.push(line);
      if (/^%%\s*endsvg\b/i.test(trimmed)) inSvgBlock = false;
      continue;
    }
    if (/^%%\s*begintext\b/i.test(trimmed)) {
      inTextBlock = true;
      out.push(line);
      continue;
    }
    if (inTextBlock) {
      out.push(line);
      if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
      continue;
    }
    if (!trimmed) {
      out.push("");
      continue;
    }
    if (/^%%/.test(trimmed)) {
      out.push(line);
      continue;
    }
    if (/^%/.test(trimmed) || /^[A-Za-z]:/.test(trimmed)) {
      out.push(line);
      continue;
    }
  }
  return out.join("\n").replace(/\s+$/, "");
}

export {
  buildHeaderPrefixFromLayers,
  buildHeaderPrefixWithLayerSpansFromLayers,
  composeHeaderPrefixPayload,
  collectHeaderKeys,
  normalizeHeaderLayer,
  sanitizeFileHeaderForInteractiveRender,
  sanitizeFileHeaderForPerTuneRender,
};
