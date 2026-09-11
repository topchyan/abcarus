function createScoreHighlightController({
  documentRef,
  getOutElement,
  getRenderPane,
  getEditorView,
  clampNumber,
  getFollowPlayheadPad,
  getFollowPlayheadWidth,
  getFollowPlayheadShift,
  findMeasureRangeAt,
  mapEditorOffsetToRenderIdx,
  requestAnimationFrameRef = (callback) => requestAnimationFrame(callback),
  getFollowEnabled = () => false,
  isRawMode = () => false,
  isPlaying = () => false,
  shouldRevealCursorInScore = () => false,
  resolveEditorMeasureRangeForScore = () => null,
  scrollToNote = () => {},
} = {}) {
  let lastSvgFollowBarEls = [];
  let lastSvgFollowMeasureEls = [];
  let lastSvgPlayheadEl = null;
  let lastSvgPlayheadSvg = null;
  let lastNoteSelection = [];
  let noteHighlightIndexCache = null;
  let pendingCursorNoteHighlightRaf = null;
  let pendingCursorNoteHighlightIdx = null;
  let pendingCursorScoreRevealRaf = null;
  let pendingCursorScoreRevealIdx = null;

  function clearSvgFollowBarHighlight() {
    for (const el of lastSvgFollowBarEls) {
      try { el.classList.remove("svg-follow-bar"); } catch {}
    }
    lastSvgFollowBarEls = [];
  }

  function clearSvgFollowMeasureHighlight() {
    for (const el of lastSvgFollowMeasureEls) {
      try { el.remove(); } catch {}
    }
    lastSvgFollowMeasureEls = [];
  }

  function clearSvgPlayhead() {
    if (lastSvgPlayheadEl) {
      try { lastSvgPlayheadEl.remove(); } catch {}
    }
    const out = getOutElement();
    if (out) {
      try {
        const leftovers = out.querySelectorAll(".svg-playhead-line");
        leftovers.forEach((el) => {
          try { el.remove(); } catch {}
        });
      } catch {}
    }
    lastSvgPlayheadEl = null;
    lastSvgPlayheadSvg = null;
  }

  function getSvgPlayheadElement() {
    return lastSvgPlayheadEl || null;
  }

  function getOrCreateSvgOverlayHost(svg, parentEl) {
    if (!svg) return null;
    const hostParent = (parentEl && parentEl.nodeType === 1 && svg.contains(parentEl)) ? parentEl : svg;
    const existing = Array.from(hostParent.children || []).find((el) => {
      try { return el && el.matches && el.matches("g.abcarus-svg-overlays"); } catch { return false; }
    });
    if (existing) return existing;
    const g = documentRef.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "abcarus-svg-overlays");
    try {
      hostParent.insertBefore(g, hostParent.firstChild || null);
    } catch {
      try { hostParent.appendChild(g); } catch {}
    }
    return g;
  }

  function getRectAttr(el, name) {
    const v = Number(el && typeof el.getAttribute === "function" ? el.getAttribute(name) : NaN);
    return Number.isFinite(v) ? v : null;
  }

  function rectsOverlap(aTop, aBottom, bTop, bBottom) {
    const top = Math.max(aTop, bTop);
    const bottom = Math.min(aBottom, bBottom);
    return bottom > top ? (bottom - top) : 0;
  }

  function findNearestBarElForNote(noteEl) {
    if (!noteEl || !getOutElement()) return null;
    const svg = noteEl.ownerSVGElement;
    if (!svg) return null;
    const nx = getRectAttr(noteEl, "x");
    const ny = getRectAttr(noteEl, "y");
    const nh = getRectAttr(noteEl, "height");
    if (nx == null || ny == null || nh == null) return null;
    const noteTop = ny;
    const noteBottom = ny + nh;
    const noteX = nx + (getRectAttr(noteEl, "width") || 0) * 0.5;

    const barEls = Array.from(svg.querySelectorAll(".bar-hl"));
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const el of barEls) {
      const by = getRectAttr(el, "y");
      const bh = getRectAttr(el, "height");
      const bx = getRectAttr(el, "x");
      const bw = getRectAttr(el, "width");
      if (by == null || bh == null || bx == null) continue;
      const overlap = rectsOverlap(noteTop, noteBottom, by, by + bh);
      if (overlap <= 0) continue;
      const barX = (bw != null && bw > 0) ? (bx + bw / 2) : bx;
      const dx = Math.abs(barX - noteX);
      const dy = Math.abs(by - noteTop);
      const score = dx + dy * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function highlightSvgFollowMeasureForNote(noteEl, barEl) {
    if (!noteEl) return false;
    const svg = noteEl.ownerSVGElement;
    if (!svg) return false;

    const b = barEl || findNearestBarElForNote(noteEl);
    if (!b) return false;

    const bandY = getRectAttr(b, "y");
    const bandH = getRectAttr(b, "height");
    if (bandY == null || bandH == null) return false;
    const bandTop = bandY;
    const bandBottom = bandY + bandH;

    const noteX = getRectAttr(noteEl, "x");
    const noteW = getRectAttr(noteEl, "width") || 0;
    if (noteX == null) return false;
    const noteCenterX = noteX + noteW * 0.5;

    const barsOnLine = Array.from(svg.querySelectorAll(".bar-hl")).map((el) => {
      const x = getRectAttr(el, "x");
      const w = getRectAttr(el, "width");
      const y = getRectAttr(el, "y");
      const h = getRectAttr(el, "height");
      if (x == null || y == null || h == null) return null;
      const overlap = rectsOverlap(bandTop, bandBottom, y, y + h);
      if (overlap <= 0) return null;
      const xCenter = (w != null && w > 0) ? (x + w / 2) : x;
      return { el, x, xCenter, y, h };
    }).filter(Boolean);

    const notesOnLine = Array.from(svg.querySelectorAll(".note-hl")).map((el) => {
      const x = getRectAttr(el, "x");
      const y = getRectAttr(el, "y");
      const w = getRectAttr(el, "width");
      const h = getRectAttr(el, "height");
      if (x == null || y == null || w == null || h == null) return null;
      const overlap = rectsOverlap(bandTop, bandBottom, y, y + h);
      if (overlap <= 0) return null;
      return { x, y, w, h };
    }).filter(Boolean);

    let lineMinX = null;
    let lineMaxX = null;
    for (const n of notesOnLine) {
      const left = n.x;
      const right = n.x + n.w;
      lineMinX = (lineMinX == null) ? left : Math.min(lineMinX, left);
      lineMaxX = (lineMaxX == null) ? right : Math.max(lineMaxX, right);
    }

    let leftBarX = null;
    let rightBarX = null;
    for (const bar of barsOnLine) {
      const bx = Number.isFinite(bar.xCenter) ? bar.xCenter : bar.x;
      if (bx <= noteCenterX) {
        leftBarX = (leftBarX == null) ? bx : Math.max(leftBarX, bx);
      } else {
        rightBarX = (rightBarX == null) ? bx : Math.min(rightBarX, bx);
      }
    }

    const pad = 10;
    const fallbackLeft = lineMinX != null ? Math.max(0, lineMinX - pad) : Math.max(0, noteCenterX - 120);
    const fallbackRight = lineMaxX != null ? (lineMaxX + pad) : (noteCenterX + 120);
    const leftX = (leftBarX != null) ? leftBarX : fallbackLeft;
    const rightX = (rightBarX != null) ? rightBarX : fallbackRight;
    const width = Math.max(0, rightX - leftX);
    if (width < 4) return false;

    clearSvgFollowMeasureHighlight();
    const host = getOrCreateSvgOverlayHost(svg, b && b.parentNode);
    if (!host) return false;
    const rect = documentRef.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", "svg-follow-measure");
    rect.setAttribute("x", String(leftX));
    rect.setAttribute("y", String(bandTop));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(bandH));
    rect.setAttribute("pointer-events", "none");
    try { host.appendChild(rect); } catch {}
    lastSvgFollowMeasureEls = [rect];
    return true;
  }

  function highlightSvgFollowBarAtEditorOffset(editorOffset) {
    const out = getOutElement();
    if (!out || !getRenderPane()) return false;
    if (!Number.isFinite(editorOffset)) return false;
    const editorView = getEditorView();
    if (!editorView) return false;
    const editorText = editorView.state.doc.toString();
    const measure = findMeasureRangeAt(editorText, editorOffset);
    const barEls = measure ? Array.from(out.querySelectorAll(".bar-hl")) : [];
    if (measure && barEls.length) {
      const start = mapEditorOffsetToRenderIdx(measure.start);
      const end = mapEditorOffsetToRenderIdx(measure.end);
      const hits = barEls.filter((el) => {
        const s = Number(el.dataset && el.dataset.start);
        const e = Number(el.dataset && el.dataset.end);
        if (!Number.isFinite(s)) return false;
        const stop = Number.isFinite(e) ? e : s + 1;
        return s < end && stop > start;
      });
      if (hits.length) {
        clearSvgFollowBarHighlight();
        lastSvgFollowBarEls = hits;
        for (const el of lastSvgFollowBarEls) {
          try { el.classList.add("svg-follow-bar"); } catch {}
        }
        return true;
      }
    }
    clearSvgFollowBarHighlight();
    return false;
  }

  function setSvgPlayheadFromElements(noteEl, preferredBarEl) {
    if (!noteEl) {
      clearSvgPlayhead();
      return;
    }
    const svg = noteEl.ownerSVGElement;
    if (!svg) return;
    const hostParent = (noteEl.parentNode && noteEl.parentNode.nodeType === 1 && svg.contains(noteEl.parentNode))
      ? noteEl.parentNode
      : svg;

    const xRaw = Number(noteEl.getAttribute("x"));
    const wRaw = Number(noteEl.getAttribute("width"));
    const yRaw = Number(noteEl.getAttribute("y"));
    const hRaw = Number(noteEl.getAttribute("height"));
    if (!Number.isFinite(xRaw)) return;
    const xCenter = xRaw + (Number.isFinite(wRaw) ? (wRaw / 2) : 0);
    const width = Number.isFinite(wRaw) ? wRaw : 0;

    let y = Number.isFinite(yRaw) ? yRaw : 0;
    let h = Number.isFinite(hRaw) ? hRaw : 0;
    const barEl = preferredBarEl && preferredBarEl.ownerSVGElement === svg ? preferredBarEl : null;
    if (barEl) {
      const by = Number(barEl.getAttribute("y"));
      const bh = Number(barEl.getAttribute("height"));
      if (Number.isFinite(by)) y = by;
      if (Number.isFinite(bh)) h = bh;
    }
    const pad = clampNumber(getFollowPlayheadPad(), 0, 24, 8);
    const yTop = Math.max(0, y - pad);
    const height = Math.max(1, h + pad * 2);

    if (lastSvgPlayheadSvg && lastSvgPlayheadSvg !== svg) {
      clearSvgPlayhead();
    }
    if (lastSvgPlayheadEl && lastSvgPlayheadEl.parentNode && lastSvgPlayheadEl.parentNode !== hostParent) {
      try { lastSvgPlayheadEl.remove(); } catch {}
      lastSvgPlayheadEl = null;
    }
    if (!lastSvgPlayheadEl || lastSvgPlayheadSvg !== svg || (lastSvgPlayheadEl && lastSvgPlayheadEl.parentNode !== hostParent)) {
      const rect = documentRef.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "svg-playhead-line");
      rect.setAttribute("width", String(clampNumber(getFollowPlayheadWidth(), 1, 6, 2)));
      rect.setAttribute("rx", "1");
      rect.setAttribute("ry", "1");
      rect.setAttribute("pointer-events", "none");
      try { hostParent.appendChild(rect); } catch { try { svg.appendChild(rect); } catch {} }
      lastSvgPlayheadEl = rect;
      lastSvgPlayheadSvg = svg;
    }
    try {
      const wSetting = clampNumber(getFollowPlayheadWidth(), 1, 6, 2);
      const halfW = wSetting / 2;
      const shift = clampNumber(getFollowPlayheadShift(), -20, 20, 0);
      const leadGap = Math.max(3, Math.min(8, width * 0.28));
      const xTarget = xCenter - leadGap + shift;

      lastSvgPlayheadEl.setAttribute("width", String(wSetting));
      lastSvgPlayheadEl.setAttribute("rx", String(Math.max(0, Math.min(2, halfW))));
      lastSvgPlayheadEl.setAttribute("ry", String(Math.max(0, Math.min(2, halfW))));
      lastSvgPlayheadEl.setAttribute("x", String(xTarget - halfW));
      lastSvgPlayheadEl.setAttribute("y", String(yTop));
      lastSvgPlayheadEl.setAttribute("height", String(height));
    } catch {}
  }

  function pickClosestNoteElement(els) {
    const renderPane = getRenderPane();
    if (!renderPane || !els || !els.length) return null;
    const viewTop = renderPane.scrollTop;
    const viewCenter = viewTop + renderPane.clientHeight / 2;
    let best = null;
    let bestDist = Infinity;
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      const containerRect = renderPane.getBoundingClientRect();
      const offsetTop = rect.top - containerRect.top + renderPane.scrollTop;
      const dist = Math.abs(offsetTop - viewCenter);
      if (dist < bestDist) {
        best = el;
        bestDist = dist;
      }
    }
    return best;
  }

  function invalidateNoteHighlightIndexCache() {
    noteHighlightIndexCache = null;
  }

  function clearNoteSelection() {
    for (const el of lastNoteSelection) {
      try { el.classList.remove("note-select"); } catch {}
    }
    lastNoteSelection = [];
  }

  function extractRenderIdxFromElementClass(el) {
    if (el && typeof el.getAttribute === "function") {
      const raw = Number(el.getAttribute("data-start"));
      if (Number.isFinite(raw)) return raw;
    }
    if (!el || !el.classList) return null;
    for (const cls of Array.from(el.classList)) {
      const m = String(cls || "").match(/^_(\d+)_$/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function buildNoteHighlightIndexCache() {
    if (noteHighlightIndexCache) return noteHighlightIndexCache;
    const out = getOutElement();
    if (!out) return null;
    const map = new Map();
    const idxs = [];
    const els = out.querySelectorAll(".note-hl");
    for (const el of Array.from(els || [])) {
      const idx = extractRenderIdxFromElementClass(el);
      if (!Number.isFinite(idx)) continue;
      if (!map.has(idx)) {
        map.set(idx, []);
        idxs.push(idx);
      }
      map.get(idx).push(el);
    }
    idxs.sort((a, b) => a - b);
    noteHighlightIndexCache = { map, idxs };
    return noteHighlightIndexCache;
  }

  function queryNoteHighlightElementsByRenderIdx(renderIdx) {
    if (!Number.isFinite(renderIdx) || renderIdx < 0) return [];
    const cache = buildNoteHighlightIndexCache();
    if (!cache || !cache.map) return [];
    const hit = cache.map.get(renderIdx);
    return Array.isArray(hit) ? hit : [];
  }

  function findNearestNoteHighlightElements(renderIdx, maxDelta = 240) {
    const idx = Number(renderIdx);
    if (!Number.isFinite(idx)) return [];
    const cap = Math.max(0, Number(maxDelta) || 0);
    const cache = buildNoteHighlightIndexCache();
    if (!cache || !cache.map || !Array.isArray(cache.idxs) || !cache.idxs.length) return [];

    const exact = cache.map.get(idx);
    if (Array.isArray(exact) && exact.length) return exact;

    const list = cache.idxs;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < idx) lo = mid + 1;
      else hi = mid;
    }
    const right = lo < list.length ? list[lo] : null;
    const left = lo > 0 ? list[lo - 1] : null;

    const rightDist = Number.isFinite(right) ? Math.abs(right - idx) : Infinity;
    const leftDist = Number.isFinite(left) ? Math.abs(idx - left) : Infinity;
    let winner = null;
    if (rightDist === leftDist) {
      winner = Number.isFinite(right) ? right : left;
    } else {
      winner = rightDist < leftDist ? right : left;
    }
    if (!Number.isFinite(winner)) return [];
    if (Math.abs(winner - idx) > cap) return [];
    const hit = cache.map.get(winner);
    return Array.isArray(hit) ? hit : [];
  }

  function findNoteHighlightElementsInRenderRange(renderStart, renderEnd) {
    const start = Number(renderStart);
    const end = Number(renderEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const cache = buildNoteHighlightIndexCache();
    if (!cache || !cache.map || !Array.isArray(cache.idxs)) return [];
    const matches = [];
    for (const idx of cache.idxs) {
      if (idx < start) continue;
      if (idx > end) break;
      const elements = cache.map.get(idx);
      if (Array.isArray(elements)) matches.push(...elements);
    }
    return matches;
  }

  function highlightRenderNoteAtIndex(renderIdx, { scrollToNote: scroll = scrollToNote } = {}) {
    const out = getOutElement();
    if (!out) return;
    clearNoteSelection();
    if (!Number.isFinite(renderIdx)) return;
    const els = out.querySelectorAll("._" + renderIdx + "_");
    if (!els.length) return;
    lastNoteSelection = Array.from(els);
    for (const el of lastNoteSelection) {
      try { el.classList.add("note-select"); } catch {}
    }
    const chosen = pickClosestNoteElement(lastNoteSelection);
    if (chosen) scroll(chosen);
  }

  function highlightEditorNoteAtIndex(editorIdx, { scrollToNote: scroll = scrollToNote } = {}) {
    const renderIdx = Number.isFinite(editorIdx) ? mapEditorOffsetToRenderIdx(editorIdx) : editorIdx;
    highlightRenderNoteAtIndex(renderIdx, { scrollToNote: scroll });
  }

  function scheduleCursorNoteHighlight(editorIdx) {
    pendingCursorNoteHighlightIdx = editorIdx;
    if (pendingCursorNoteHighlightRaf != null) return;
    pendingCursorNoteHighlightRaf = requestAnimationFrameRef(() => {
      pendingCursorNoteHighlightRaf = null;
      const next = pendingCursorNoteHighlightIdx;
      pendingCursorNoteHighlightIdx = null;
      if (!getFollowEnabled() || isRawMode() || isPlaying()) return;
      highlightEditorNoteAtIndex(next, { scrollToNote });
    });
  }

  function revealEditorCursorInScore(editorIdx) {
    if (isRawMode() || isPlaying() || !shouldRevealCursorInScore()) return false;
    const editorView = getEditorView();
    const editorText = editorView && editorView.state && editorView.state.doc
      ? editorView.state.doc.toString()
      : "";
    const measure = resolveEditorMeasureRangeForScore(editorText, editorIdx);
    const targetEditorIdx = measure && Number.isFinite(measure.from) ? measure.from : editorIdx;
    const renderIdx = Number.isFinite(targetEditorIdx)
      ? mapEditorOffsetToRenderIdx(targetEditorIdx)
      : targetEditorIdx;
    if (!Number.isFinite(renderIdx)) return false;
    const renderEnd = measure && Number.isFinite(measure.to)
      ? mapEditorOffsetToRenderIdx(measure.to)
      : renderIdx;
    const inMeasure = findNoteHighlightElementsInRenderRange(renderIdx, renderEnd);
    const exact = queryNoteHighlightElementsByRenderIdx(renderIdx);
    const candidates = inMeasure.length
      ? inMeasure
      : exact.length ? exact : findNearestNoteHighlightElements(renderIdx);
    const chosen = candidates.length ? pickClosestNoteElement(candidates) : null;
    if (!chosen) {
      clearSvgFollowMeasureHighlight();
      return false;
    }
    highlightSvgFollowMeasureForNote(chosen, findNearestBarElForNote(chosen));
    const scrollTarget = lastSvgFollowMeasureEls[0] || chosen;
    scrollToNote(scrollTarget, { placement: "comfortable-center" });
    return true;
  }

  function scheduleCursorScoreReveal(editorIdx) {
    pendingCursorScoreRevealIdx = editorIdx;
    if (pendingCursorScoreRevealRaf != null) return;
    pendingCursorScoreRevealRaf = requestAnimationFrameRef(() => {
      pendingCursorScoreRevealRaf = null;
      const next = pendingCursorScoreRevealIdx;
      pendingCursorScoreRevealIdx = null;
      revealEditorCursorInScore(next);
    });
  }

  return {
    clearNoteSelection,
    clearSvgFollowBarHighlight,
    clearSvgFollowMeasureHighlight,
    clearSvgPlayhead,
    extractRenderIdxFromElementClass,
    findNoteHighlightElementsInRenderRange,
    findNearestBarElForNote,
    findNearestNoteHighlightElements,
    getSvgPlayheadElement,
    highlightSvgFollowBarAtEditorOffset,
    highlightSvgFollowMeasureForNote,
    highlightEditorNoteAtIndex,
    highlightRenderNoteAtIndex,
    invalidateNoteHighlightIndexCache,
    pickClosestNoteElement,
    queryNoteHighlightElementsByRenderIdx,
    revealEditorCursorInScore,
    scheduleCursorNoteHighlight,
    scheduleCursorScoreReveal,
    setSvgPlayheadFromElements,
  };
}

export { createScoreHighlightController };
