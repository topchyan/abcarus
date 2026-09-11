import {
  Decoration,
  RangeSetBuilder,
} from "../../../third_party/codemirror/cm.js";

function buildSingleRangeMarkDecorations(state, range, className) {
  const r = range || null;
  if (!r) return Decoration.none;
  const max = state.doc.length;
  const from = Math.max(0, Math.min(Number(r.from), max));
  const to = Math.max(from, Math.min(Number(r.to), max));
  if (to <= from) return Decoration.none;
  return Decoration.set([Decoration.mark({ class: className }).range(from, to)]);
}

function buildErrorActivationDecorations(state, range) {
  return buildSingleRangeMarkDecorations(state, range, "cm-error-activation");
}

function buildPracticeBarDecorations(state, range) {
  return buildSingleRangeMarkDecorations(state, range, "cm-practice-bar");
}

function buildVoiceMeasurePeerDecorations(state, ranges) {
  if (!state || !state.doc || !Array.isArray(ranges) || !ranges.length) return Decoration.none;
  const builder = new RangeSetBuilder();
  const max = state.doc.length;
  for (const range of ranges) {
    if (!range) continue;
    const from = Math.max(0, Math.min(Number(range.from) || 0, max));
    const to = Math.max(from, Math.min(Number(range.to) || 0, max));
    if (to <= from) continue;
    builder.add(from, to, Decoration.mark({
      class: "cm-voice-measure-peer",
      attributes: { title: `Corresponding bar ${range.barNumber} in V:${range.voiceId}` },
    }));
  }
  return builder.finish();
}

function createTextWidget(className, text) {
  return {
    eq(other) {
      return Boolean(other && other.className === className && other.text === text);
    },
    toDOM() {
      const el = document.createElement("span");
      el.className = className;
      el.textContent = text;
      return el;
    },
    className,
    text,
  };
}

function buildAbDecorations(state, markers) {
  if (!state || !state.doc || !markers || !Number.isFinite(markers.start) || !Number.isFinite(markers.end)) {
    return Decoration.none;
  }
  const builder = new RangeSetBuilder();
  const max = state.doc.length;
  const start = Math.max(0, Math.min(max, Math.floor(markers.start)));
  const end = Math.max(start, Math.min(max, Math.floor(markers.end)));
  const rangeTo = Math.max(start + 1, end);
  builder.add(start, rangeTo, Decoration.mark({ class: "cm-ab-range" }));
  builder.add(start, start + 1, Decoration.widget({
    side: -1,
    widget: createTextWidget("cm-ab-marker cm-ab-marker-a", "A"),
  }));
  builder.add(Math.max(start, end - 1), Math.max(start, end - 1) + 1, Decoration.widget({
    side: 1,
    widget: createTextWidget("cm-ab-marker cm-ab-marker-b", "B"),
  }));
  return builder.finish();
}

function buildMeasureErrorDecorations(state, ranges) {
  if (!ranges || !ranges.length) return Decoration.none;
  const builder = new RangeSetBuilder();
  const max = state.doc.length;
  for (const range of ranges) {
    const from = Math.max(0, Math.min(range.start, max));
    const to = Math.max(from, Math.min(range.end, max));
    if (to <= from) continue;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    let added = false;
    for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo += 1) {
      const line = state.doc.line(lineNo);
      const lineFrom = line.from;
      const lineTo = line.to;
      let commentIdx = -1;
      for (let i = 0; i < line.length; i += 1) {
        if (line.text[i] === "%" && line.text[i - 1] !== "\\") {
          commentIdx = i;
          break;
        }
      }
      const contentEnd = commentIdx >= 0 ? lineFrom + commentIdx : lineTo;
      const contentText = line.text.slice(0, commentIdx >= 0 ? commentIdx : line.text.length);
      if (!contentText.trim()) continue;
      const segStart = Math.max(from, lineFrom);
      const segEnd = Math.min(to, contentEnd);
      if (segEnd <= segStart) continue;
      for (let pos = segStart; pos < segEnd; pos += 1) {
        if (state.doc.sliceString(pos, pos + 1) === "|") {
          builder.add(pos, pos + 1, Decoration.mark({ class: "cm-measure-error" }));
          added = true;
        }
      }
    }
    if (!added) {
      const markEnd = Math.min(from + 1, to);
      if (markEnd > from) builder.add(from, markEnd, Decoration.mark({ class: "cm-measure-error" }));
    }
  }
  return builder.finish();
}

function buildBarMismatchDecorations(state, markers) {
  if (!state || !state.doc || !Array.isArray(markers) || !markers.length) return Decoration.none;
  const builder = new RangeSetBuilder();
  const max = state.doc.length;
  const lineInfo = new Map();
  const ranges = [];

  const pushLineInfo = (line, label, detail) => {
    if (!line) return;
    const key = line.number;
    let entry = lineInfo.get(key);
    if (!entry) {
      entry = { line, labels: [], details: [] };
      lineInfo.set(key, entry);
    }
    if (label && !entry.labels.includes(label)) entry.labels.push(label);
    if (detail && entry.details.length < 3 && !entry.details.includes(detail)) entry.details.push(detail);
  };

  for (const marker of markers) {
    if (!marker || !Number.isFinite(marker.offset)) continue;
    const pos = Math.max(0, Math.min(max, Math.floor(marker.offset)));
    const len = Math.max(1, Math.min(6, Math.floor(marker.len || 1)));
    const to = Math.max(pos, Math.min(max, pos + len));
    const line = state.doc.lineAt(pos);
    const label = marker.label
      ? String(marker.label)
      : (marker.deltaText ? `#${marker.barNumber} ${marker.deltaText}` : `#${marker.barNumber}`);
    const detail = marker.detail || label;
    pushLineInfo(line, label, detail);
    ranges.push({
      from: pos,
      to,
      value: Decoration.mark({
        class: "cm-bar-mismatch-mark",
        attributes: {
          title: detail,
          "data-bar-mismatch": label,
          "data-bar-number": String(marker.barNumber || ""),
        },
      }),
    });
  }

  for (const entry of lineInfo.values()) {
    const labels = entry.labels.slice(0, 3);
    const more = entry.labels.length - labels.length;
    const labelText = more > 0 ? `${labels.join(", ")} (+${more})` : labels.join(", ");
    const detailText = entry.details.join(" \u00b7 ");
    ranges.push({
      from: entry.line.from,
      to: entry.line.from,
      value: Decoration.line({
        class: "cm-bar-mismatch-line",
        attributes: {
          title: detailText || labelText,
          "data-bar-mismatch": labelText,
        },
      }),
    });
  }

  const getSide = (value) => {
    if (!value) return 0;
    if (Number.isFinite(value.startSide)) return Number(value.startSide);
    if (value.spec && Number.isFinite(value.spec.side)) return Number(value.spec.side);
    return 0;
  };
  ranges.sort((a, b) => {
    const fromDiff = a.from - b.from;
    if (fromDiff) return fromDiff;
    const sideDiff = getSide(a.value) - getSide(b.value);
    if (sideDiff) return sideDiff;
    return a.to - b.to;
  });
  for (const r of ranges) {
    builder.add(r.from, r.to, r.value);
  }
  return builder.finish();
}

function buildIntonationHighlightDecorations(state, ranges) {
  if (!state || !state.doc) return Decoration.none;
  const builder = new RangeSetBuilder();
  const length = state.doc.length;
  for (const range of ranges || []) {
    if (!range) continue;
    const start = Math.max(0, Math.min(length, Number(range.start) || 0));
    const end = Math.max(start, Math.min(length, Number(range.end) || start));
    if (end <= start) continue;
    builder.add(start, end, Decoration.mark({ class: "cm-intonation-highlight" }));
  }
  return builder.finish();
}

function buildPayloadLayerDecorations(state, { payloadMode, showLayers, layerSpans } = {}) {
  if (!state || !state.doc) return Decoration.none;
  if (!payloadMode || !showLayers) return Decoration.none;
  if (!Array.isArray(layerSpans) || !layerSpans.length) return Decoration.none;
  const builder = new RangeSetBuilder();
  const maxLine = state.doc.lines;
  for (const span of layerSpans) {
    if (!span) continue;
    const cls = span.className ? String(span.className) : "";
    if (!cls) continue;
    const fromLine = Math.max(1, Math.min(maxLine, Number(span.fromLine) || 1));
    const toLine = Math.max(fromLine, Math.min(maxLine, Number(span.toLine) || fromLine));
    for (let lineNo = fromLine; lineNo <= toLine; lineNo += 1) {
      const line = state.doc.line(lineNo);
      builder.add(line.from, line.from, Decoration.line({ class: cls }));
      builder.add(line.from, line.to, Decoration.mark({ class: cls }));
    }
  }
  return builder.finish();
}

export {
  buildAbDecorations,
  buildBarMismatchDecorations,
  buildErrorActivationDecorations,
  buildIntonationHighlightDecorations,
  buildMeasureErrorDecorations,
  buildPayloadLayerDecorations,
  buildPracticeBarDecorations,
  buildVoiceMeasurePeerDecorations,
};
