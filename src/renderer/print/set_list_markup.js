import { matchBarToken } from "../abc/bar_tokens.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractAbcField(text, field) {
  const match = String(text || "").match(new RegExp(`^\\s*${field}:\\s*(.*?)\\s*$`, "mi"));
  return match ? String(match[1] || "").trim() : "";
}

function formatSetListIndexTempo(text, tempoScale = 1) {
  const raw = extractAbcField(text, "Q").replace(/"(?:\\.|[^"])*"/g, " ").trim();
  if (!raw) return "";
  const scale = Number(tempoScale);
  const multiplier = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const equals = raw.match(/^(.*?)\s*=\s*(\d+(?:\.\d+)?)\s*$/);
  const bare = equals ? null : raw.match(/^(\d+(?:\.\d+)?)\s*$/);
  const bpm = Number(equals ? equals[2] : (bare ? bare[1] : NaN));
  if (!Number.isFinite(bpm)) return "";
  const adjusted = Math.round(bpm * multiplier * 10) / 10;
  const value = Number.isInteger(adjusted) ? String(adjusted) : adjusted.toFixed(1);
  const beat = equals ? String(equals[1] || "").trim() : "";
  return beat ? `Tempo ${beat} = ${value}` : `Tempo ${value} BPM`;
}

function numberSetListTuneTitle(text, number) {
  const source = String(text || "");
  const label = `${Math.max(1, Number(number) || 1)}. `;
  if (/^T:/m.test(source)) return source.replace(/^T:\s*/m, `T:${label}`);
  if (/^X:.*$/m.test(source)) return source.replace(/^X:.*$/m, (line) => `${line}\nT:${label}Untitled`);
  return source;
}

function takeOpeningSoundingNotes(text, maxNotes = 12) {
  const source = String(text || "");
  const limit = Math.max(1, Number(maxNotes) || 12);
  let output = "";
  let notes = 0;
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    const token = matchBarToken(source, i);
    if (token) {
      output += token.token;
      i += token.len;
      continue;
    }
    if (ch === "{" || ch === "!" || ch === "+") {
      const close = ch === "{" ? "}" : ch;
      const end = source.indexOf(close, i + 1);
      if (end >= 0) {
        output += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const end = source.indexOf("]", i + 1);
      if (end >= 0) {
        const bracket = source.slice(i, end + 1);
        output += bracket;
        i = end + 1;
        if (!/^\[[A-Za-z]:/.test(bracket) && /[A-Ga-g]/.test(bracket)) notes += 1;
        while (i < source.length && /[0-9/.,'<>-]/.test(source[i])) output += source[i++];
        if (notes >= limit) break;
        continue;
      }
    }
    output += ch;
    i += 1;
    if (!/[A-Ga-g]/.test(ch)) continue;
    while (i < source.length && /[0-9/.,'<>-]/.test(source[i])) output += source[i++];
    notes += 1;
    if (notes >= limit) break;
  }
  return output.trim();
}

function stripIncipitAnnotations(text) {
  const source = String(text || "");
  let output = "";
  let inQuote = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote && ch === "\\" && i + 1 < source.length) {
      i += 1;
      continue;
    }
    if (!inQuote) output += ch;
  }
  return output.replace(/\[P:[^\]]*\]/gi, " ");
}

function trimLeadingIncipitSilence(text) {
  const source = String(text || "");
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    const token = matchBarToken(source, i);
    if (token) {
      i += token.len;
      continue;
    }
    if (ch === "{" || ch === "!" || ch === "+") {
      const close = ch === "{" ? "}" : ch;
      const end = source.indexOf(close, i + 1);
      if (end >= 0) {
        if (ch === "{" && /[A-Ga-g]/.test(source.slice(i + 1, end))) return source.slice(i).trim();
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const end = source.indexOf("]", i + 1);
      if (end >= 0) {
        const bracket = source.slice(i, end + 1);
        if (!/^\[[A-Za-z]:/.test(bracket) && /[A-Ga-g]/.test(bracket)) return source.slice(i).trim();
        i = end + 1;
        continue;
      }
    }
    if (/[A-Ga-g]/.test(ch)) {
      let start = i;
      while (start > 0 && /[_=^]/.test(source[start - 1])) start -= 1;
      return source.slice(start).trim();
    }
    i += 1;
  }
  return "";
}

function buildSetListIncipitAbc(text, maxNotes = 12) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const fields = [];
  const body = [];
  let afterKey = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!afterKey) {
      if (/^(?:X|M|L|K):/.test(trimmed)) fields.push(line);
      if (/^V:/.test(trimmed)) {
        fields.push(line.replace(/\s+(?:nm|snm|name|sname)="[^"]*"/g, ""));
      }
      if (/^K:/.test(trimmed)) afterKey = true;
      continue;
    }
    if (/^V:/.test(trimmed)) {
      if (body.length) break;
      fields.push(line.replace(/\s+(?:nm|snm|name|sname)="[^"]*"/g, ""));
      continue;
    }
    if (!trimmed || /^%/.test(trimmed) || /^[A-Za-z]:/.test(trimmed)) continue;
    body.push(line);
  }
  if (!fields.some((line) => /^\s*X:/.test(line))) fields.unshift("X:1");
  const incipitBody = trimLeadingIncipitSilence(stripIncipitAnnotations(body.join(" ")));
  const opening = takeOpeningSoundingNotes(incipitBody, maxNotes);
  return opening
    ? `%%singleline 1\n%%trimsvg 1\n%%stretchlast 0\n%%topspace 0\n%%musicspace 0\n%%scale .72\n%%leftmargin 0\n%%rightmargin 0\n%%writefields Q 0\n${fields.join("\n")}\n${opening} |]\n`
    : "";
}

function buildSetListCoverMarkup({ title, itemCount, updatedAt } = {}) {
  const date = new Date(String(updatedAt || ""));
  const updated = Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "";
  return `<section class="print-tune set-list-cover" style="min-height:88vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">
    <h1 style="margin:0;font:600 34px/1.2 sans-serif;">${escapeHtml(title || "Untitled Set List")}</h1>
    <div style="margin-top:14px;font:15px/1.4 sans-serif;color:#555;">Set List</div>
    <div style="margin-top:34px;font:13px/1.5 sans-serif;color:#666;">${Math.max(0, Number(itemCount) || 0)} tunes${updated ? ` · Updated ${escapeHtml(updated)}` : ""}</div>
  </section>`;
}

function buildSetListIndexMarkup({ title, entries, numberTunes = false } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const hasIncipits = list.some((entry) => Boolean(entry && entry.incipitSvg));
  const rows = list.map((entry, index) => {
    const ordinal = numberTunes ? `${index + 1}.` : "";
    const details = [entry.meter ? `M: ${entry.meter}` : "", entry.tempo || ""]
      .filter(Boolean).join(" · ");
    const practiceNote = String(entry.practiceNote || "").trim();
    const incipit = entry.incipitSvg
      ? `<div class="set-list-index-incipit" style="min-width:0;display:flex;align-items:center;">${entry.incipitSvg}</div>`
      : (hasIncipits ? `<div></div>` : "");
    const qr = entry.qrDataUrl && entry.sourceUrl
      ? `<a href="${escapeHtml(entry.sourceUrl)}" title="Open source" style="justify-self:end;align-self:center;"><img src="${escapeHtml(entry.qrDataUrl)}" alt="" style="width:24px;height:24px;display:block;"></a>`
      : "";
    const columns = hasIncipits
      ? "24px minmax(145px,.8fr) minmax(280px,2fr) 28px"
      : "24px minmax(0,1fr) 28px";
    return `<div class="set-list-index-row" style="display:grid;grid-template-columns:${columns};gap:7px;align-items:center;padding:2px 0;border-bottom:1px solid #ddd;break-inside:avoid;min-width:0;">
      <div style="font:600 11px/1.2 sans-serif;color:#555;text-align:right;">${ordinal}</div>
      <div style="min-width:0;"><div style="font:600 12px/1.2 sans-serif;overflow-wrap:anywhere;">${escapeHtml(entry.title || "Untitled")}</div><div style="margin-top:1px;font:10px/1.2 sans-serif;color:#666;">${escapeHtml(details)}</div>${practiceNote ? `<div style="margin-top:2px;font:9px/1.2 sans-serif;color:#555;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere;">${escapeHtml(practiceNote)}</div>` : ""}</div>
      ${incipit}<div>${qr}</div>
    </div>`;
  });
  const indexColumns = hasIncipits ? "1fr" : "repeat(2,minmax(0,1fr))";
  return `<section class="print-tune set-list-index" style="box-sizing:border-box;">
    <style>.set-list-index-incipit svg{display:block;width:auto!important;height:auto!important;max-width:100%}</style>
    <h1 style="margin:0 0 12px;font:600 21px/1.2 sans-serif;">${escapeHtml(title || "Untitled Set List")} · Index</h1>
    <div style="display:grid;grid-template-columns:${indexColumns};column-gap:20px;align-items:start;">${rows.join("\n")}</div>
  </section>`;
}

function normalizeSetListHeaderTemplate(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = raw.replace(/\s+$/, "");
  if (!trimmed) return "";
  return `${trimmed}\n`;
}

function getSetListFileHeaderText(setListHeaderText) {
  const tpl = normalizeSetListHeaderTemplate(setListHeaderText);
  if (!tpl) return "";
  return `% Generated by ABCarus Set List\n${tpl}`;
}

function composeSetListRenderHeader(embeddedHeaderText, setListHeaderText) {
  const parts = [embeddedHeaderText, setListHeaderText]
    .map((value) => normalizeSetListHeaderTemplate(value))
    .filter(Boolean);
  return parts.join("");
}

function getPrintableSetListItems(items) {
  return Array.isArray(items)
    ? items.filter((item) => item && (!item.export || item.export.includeInPdf !== false))
    : [];
}

function namespaceSetListSvgIds(markup, namespace) {
  const raw = String(markup || "");
  const prefix = String(namespace || "abcarus-set-list")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "abcarus-set-list";
  const ids = Array.from(new Set(
    Array.from(raw.matchAll(/\bid\s*=\s*["']([^"']+)["']/g), (match) => match[1]),
  ));
  let output = raw;
  for (const id of ids) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextId = `${prefix}-${id}`;
    output = output
      .replace(new RegExp(`(\\bid\\s*=\\s*["'])${escapedId}(["'])`, "g"), `$1${nextId}$2`)
      .replace(new RegExp(`((?:xlink:href|href)\\s*=\\s*["']#)${escapedId}(["'])`, "g"), `$1${nextId}$2`)
      .replace(new RegExp(`(url\\(\\s*["']?#)${escapedId}(["']?\\s*\\))`, "g"), `$1${nextId}$2`);
  }
  return output;
}

function shouldInjectNewPageBeforeTune(tuneText, { mode, idx, pageBreakBefore = false }) {
  if (idx <= 0) return false;
  if (pageBreakBefore) return true;
  if (mode === "none") return false;
  if (mode === "perTune") return true;
  if (mode !== "auto") return false;
  const text = String(tuneText || "");
  const lines = text.split(/\r\n|\n|\r/);
  const nonEmpty = [];
  for (let i = 0; i < lines.length; i++) {
    const l = String(lines[i] || "").trim();
    if (!l) continue;
    nonEmpty.push(l);
    if (nonEmpty.length >= 3) break;
  }
  if (nonEmpty.some((l) => l.startsWith("%%newpage"))) return false;
  const lineCount = lines.length;
  const long = lineCount >= 80 || text.length >= 5000;
  return long;
}

function buildSetListExportAbc({
  items,
  headerText,
  pageBreaks,
  ensureXNumberInAbc,
  appendTuneToContent,
} = {}) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const renumber = typeof ensureXNumberInAbc === "function"
    ? ensureXNumberInAbc
    : (text) => text;
  const appendTune = typeof appendTuneToContent === "function"
    ? appendTuneToContent
    : (content, tune) => `${content || ""}${tune || ""}`;

  let out = "";
  const fileHeader = getSetListFileHeaderText(headerText);
  if (fileHeader.trim()) out = `${fileHeader}\n`;

  let writtenCount = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const raw = String(item.text || "");
    if (!raw.trim()) continue;

    let tune = raw;
    const inject = shouldInjectNewPageBeforeTune(tune, {
      mode: pageBreaks,
      idx: writtenCount,
      pageBreakBefore: Boolean(item.export && item.export.pageBreakBefore),
    });
    if (inject) tune = `%%newpage\n${tune}`;

    tune = renumber(tune, writtenCount + 1);
    out = appendTune(out, tune);
    writtenCount += 1;
  }
  return out;
}

export {
  buildSetListCoverMarkup,
  buildSetListExportAbc,
  buildSetListIncipitAbc,
  buildSetListIndexMarkup,
  composeSetListRenderHeader,
  getPrintableSetListItems,
  getSetListFileHeaderText,
  namespaceSetListSvgIds,
  numberSetListTuneTitle,
  formatSetListIndexTempo,
  normalizeSetListHeaderTemplate,
  shouldInjectNewPageBeforeTune,
};
