import {
  EditorView,
  EditorState,
  EditorSelection,
  basicSetup,
  keymap,
  Decoration,
  RangeSetBuilder,
  ViewPlugin,
  indentUnit,
  openSearchPanel,
  gotoLine,
  foldService,
  foldGutter,
  lineNumbers,
} from "../../third_party/codemirror/cm.js";
import { initSettings } from "./settings.js";
import { transformTranspose } from "./transpose.mjs";
import {
  buildDefaultDrumVelocityMap,
  clampVelocity,
  DEFAULT_DRUM_VELOCITY,
  velocityToDynamic,
} from "./drums.js";

const $editorHost = document.getElementById("abc-editor");
const $out = document.getElementById("out");
const $status = document.getElementById("status");
const $cursorStatus = document.getElementById("cursorStatus");
const $bufferStatus = document.getElementById("bufferStatus");
const $toolStatus = document.getElementById("toolStatus");
const $main = document.querySelector("main");
const $divider = document.getElementById("paneDivider");
const $renderPane = document.querySelector(".render-pane");
const $sidebar = document.querySelector(".sidebar");
const $scanStatus = document.getElementById("scanStatus");
const $libraryTree = document.getElementById("libraryTree");
const $dirtyIndicator = document.getElementById("dirtyIndicator");
const $fileTuneSelect = document.getElementById("fileTuneSelect");
const $fileHeaderPanel = document.getElementById("fileHeaderPanel");
const $fileHeaderToggle = document.getElementById("fileHeaderToggle");
const $fileHeaderEditor = document.getElementById("fileHeaderEditor");
const $fileHeaderSave = document.getElementById("fileHeaderSave");
const $fileHeaderReload = document.getElementById("fileHeaderReload");
const $groupBy = document.getElementById("groupBy");
const $sortBy = document.getElementById("sortBy");
const $librarySearch = document.getElementById("librarySearch");
const $btnLibraryMenu = document.getElementById("btnLibraryMenu");
const $btnToggleLibrary = document.getElementById("btnToggleLibrary");
const $btnFileNew = document.getElementById("btnFileNew");
const $btnFileOpen = document.getElementById("btnFileOpen");
const $btnFileSave = document.getElementById("btnFileSave");
const $btnFileClose = document.getElementById("btnFileClose");
const $btnPlay = document.getElementById("btnPlay");
const $btnPause = document.getElementById("btnPause");
const $btnStop = document.getElementById("btnStop");
const $btnPlayPause = document.getElementById("btnPlayPause");
const $btnRestart = document.getElementById("btnRestart");
const $btnPrevMeasure = document.getElementById("btnPrevMeasure");
const $btnNextMeasure = document.getElementById("btnNextMeasure");
const $btnResetLayout = document.getElementById("btnResetLayout");
const $btnToggleFollow = document.getElementById("btnToggleFollow");
const $btnToggleGlobals = document.getElementById("btnToggleGlobals");
const $btnToggleErrors = document.getElementById("btnToggleErrors");
const $soundfontLabel = document.getElementById("soundfontLabel");
const $soundfontSelect = document.getElementById("soundfontSelect");
const $soundfontAdd = document.getElementById("soundfontAdd");
const $soundfontRemove = document.getElementById("soundfontRemove");
const $rightSplit = document.querySelector(".right-split");
const $splitDivider = document.getElementById("splitDivider");
const $errorPane = document.getElementById("errorPane");
const $errorList = document.getElementById("errorList");
const $scanErrorTunes = document.getElementById("scanErrorTunes");
const $fileNameMeta = document.getElementById("fileNameMeta");
const $sidebarSplit = document.getElementById("sidebarSplit");
const $toast = document.getElementById("toast");
const $errorsIndicator = document.getElementById("errorsIndicator");
const $errorsFocusMessage = document.getElementById("errorsFocusMessage");
const $errorsPopover = document.getElementById("errorsPopover");
const $errorsPopoverTitle = document.getElementById("errorsPopoverTitle");
const $errorsListPopover = document.getElementById("errorsList");
const $sidebarBody = document.querySelector(".sidebar-body");
const $editorPane = document.querySelector(".editor-pane");
const $findLibraryModal = document.getElementById("findLibraryModal");
const $findLibraryClose = document.getElementById("findLibraryClose");
const $findLibraryApply = document.getElementById("findLibraryApply");
const $findLibraryClear = document.getElementById("findLibraryClear");
const $findLibraryTag = document.getElementById("findLibraryTag");
const $findLibraryValue = document.getElementById("findLibraryValue");
const $moveTuneModal = document.getElementById("moveTuneModal");
const $moveTuneClose = document.getElementById("moveTuneClose");
const $moveTuneTarget = document.getElementById("moveTuneTarget");
const $moveTuneApply = document.getElementById("moveTuneApply");
const $moveTuneCancel = document.getElementById("moveTuneCancel");
const $aboutModal = document.getElementById("aboutModal");
const $aboutClose = document.getElementById("aboutClose");
const $aboutInfo = document.getElementById("aboutInfo");
const $aboutCopy = document.getElementById("aboutCopy");
const $disclaimerModal = document.getElementById("disclaimerModal");
const $disclaimerOk = document.getElementById("disclaimerOk");
const $headerStateMarker = document.getElementById("headerStateMarker");

const DEFAULT_ABC = "";
const TEMPLATE_ABC = `X:1
T:Title          % Required for identification
T:Subtitle       % Useful if applicable
C:Composer       % Highly Important
H:History        % Informational
O:Origin         % Informational
N:Notes          % Informational
S:Source         % Informational
Z:Copyright      % Important, if applicable
F:From           % URL or File
G:Grouping       % Not important
L:1/8            % Note length, highly useful
M:4/4            % Meter, highly useful
Q:1/4=60 "Slow"  % Tempo, highly useful
V:1 clef=treble  % Voice definition, highly useful
K:C              % Key, Required, must precede the score
P:A
  A2 A2 E4  | E2 E2 A4  :||
w:AB-Ca-rus | AB-Ca-rus
`;

let currentDoc = null;
let suppressDirty = false;
let editorView = null;
let headerEditorView = null;
let headerCollapsed = true;
let abandonFlowInProgress = false;
let headerDirty = false;
let suppressHeaderDirty = false;
let lastHeaderToastFilePath = null;
let headerEditorFilePath = null;
let lastErrors = [];
let errorsPopoverOpen = false;
let isNewTuneDraft = false;

// PlaybackRange must be initialized before initEditor() runs (selection listeners fire early).
let playbackRange = {
  startOffset: 0,
  endOffset: null,
  origin: "cursor",
  loop: false,
};
let activePlaybackRange = null;
let activePlaybackEndAbcOffset = null;
var pendingPlaybackRangeOrigin = null;
let suppressPlaybackRangeSelectionSync = false;
let playbackStartArmed = false;
let playbackRunId = 0;
let lastTraceRunId = 0;
let lastTracePlaybackIdx = null;
let lastTraceTimestamp = null;
let playbackTraceSeq = 0;
let lastRhythmErrorSuggestion = null;
let errorsEnabled = false;

let errorActivationHighlightRange = null; // {from,to} editor offsets
let errorActivationHighlightVersion = 0;
let suppressErrorActivationClear = false;
let lastSvgErrorActivationEls = [];
let activeErrorHighlight = null; // {id, from, to, tuneId, filePath, message, messageKey, lastSvgRenderIdx}
let activeErrorNavIndex = -1;
let lastNoErrorsToastAtMs = 0;

function normalizeErrorMessageForMatch(message) {
  const msg = String(message || "").trim();
  if (!msg) return "";
  const withoutCount = msg.replace(/\s+×\s*\d+\s*$/i, "").trim();
  // abc2svg errors often include location prefixes; match on the human-relevant tail.
  const lower = withoutCount.toLowerCase();
  const idxWarn = lower.lastIndexOf("warning:");
  if (idxWarn !== -1) return withoutCount.slice(idxWarn + "warning:".length).trim().toLowerCase();
  const idxErr = lower.lastIndexOf("error:");
  if (idxErr !== -1) return withoutCount.slice(idxErr + "error:".length).trim().toLowerCase();
  return lower;
}

function computeErrorId(entry) {
  if (!entry) return "";
  const tuneId = entry.tuneId || "";
  const filePath = entry.filePath || "";
  const messageKey = normalizeErrorMessageForMatch(entry.message || "");
  const start = Number(entry.errorStartOffset);
  const line = Number(entry.loc ? entry.loc.line : NaN);
  const col = Number(entry.loc ? entry.loc.col : NaN);
  const posKey = Number.isFinite(start)
    ? `o${start}`
    : (Number.isFinite(line) ? `l${line}c${Number.isFinite(col) ? col : 0}` : "na");
  // Unique enough to distinguish multiple same-message errors in the same tune,
  // while still allowing reconcileActiveErrorHighlightAfterRender() to re-anchor by message.
  return `${tuneId}|${filePath}|${messageKey}|${posKey}`;
}

function getSortedErrorsForNav() {
  const items = Array.isArray(lastErrors) ? lastErrors.slice() : [];
  const withKeys = items.map((entry) => {
    const tuneIdKey = String(entry && (entry.tuneId || entry.tuneKey) ? (entry.tuneId || entry.tuneKey) : "");
    const start = Number(entry && entry.errorStartOffset);
    const line = Number(entry && entry.loc ? entry.loc.line : NaN);
    const col = Number(entry && entry.loc ? entry.loc.col : NaN);
    const messageKey = normalizeErrorMessageForMatch(entry && entry.message ? entry.message : "");
    const pos = Number.isFinite(start)
      ? start
      : (Number.isFinite(line) ? (line * 100000 + (Number.isFinite(col) ? col : 0)) : Number.POSITIVE_INFINITY);
    return {
      entry,
      id: computeErrorId(entry),
      tuneIdKey,
      pos,
      messageKey,
    };
  }).filter((x) => x.entry && x.id);

  withKeys.sort((a, b) => {
    if (a.tuneIdKey !== b.tuneIdKey) return a.tuneIdKey.localeCompare(b.tuneIdKey);
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.messageKey !== b.messageKey) return a.messageKey.localeCompare(b.messageKey);
    return a.id.localeCompare(b.id);
  });
  return withKeys;
}

function syncActiveErrorNavIndex(sortedItemsArg) {
  const items = Array.isArray(sortedItemsArg) ? sortedItemsArg : getSortedErrorsForNav();
  if (!items.length) {
    activeErrorNavIndex = -1;
    return;
  }

  if (activeErrorHighlight && activeErrorHighlight.id) {
    const found = items.findIndex((x) => x.id === activeErrorHighlight.id);
    if (found !== -1) {
      activeErrorNavIndex = found;
      return;
    }

    const targetPos = Number.isFinite(activeErrorHighlight.from) ? activeErrorHighlight.from : 0;
    const targetTune = activeErrorHighlight.tuneId ? String(activeErrorHighlight.tuneId) : "";
    let bestIdx = -1;
    let bestDist = Infinity;

    const consider = (x, idx) => {
      const dist = Math.abs((Number.isFinite(x.pos) ? x.pos : targetPos) - targetPos);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    };

    if (targetTune) {
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        const tuneId = it.entry && it.entry.tuneId ? String(it.entry.tuneId) : "";
        if (tuneId !== targetTune) continue;
        consider(it, i);
      }
    }
    if (bestIdx === -1) {
      for (let i = 0; i < items.length; i += 1) consider(items[i], i);
    }
    if (bestIdx !== -1) activeErrorNavIndex = bestIdx;
    return;
  }

  if (activeErrorNavIndex >= items.length) activeErrorNavIndex = items.length - 1;
  if (activeErrorNavIndex < -1) activeErrorNavIndex = -1;
}

async function activateErrorByNav(delta) {
  if (!errorsEnabled) return;
  if (isPlaying || isPaused) {
    showToast("Stop playback to navigate errors");
    return;
  }
  const items = getSortedErrorsForNav();
  if (!items.length) {
    const now = Date.now();
    if (!lastNoErrorsToastAtMs || now - lastNoErrorsToastAtMs > 2000) {
      lastNoErrorsToastAtMs = now;
      showToast("No errors");
    }
    return;
  }

  const step = delta >= 0 ? 1 : -1;
  let nextIdx = activeErrorNavIndex;
  if (!Number.isFinite(nextIdx) || nextIdx < 0) {
    nextIdx = step > 0 ? 0 : items.length - 1;
  } else {
    nextIdx = (nextIdx + step + items.length) % items.length;
  }

  await jumpToError(items[nextIdx].entry);
}

function clearActiveErrorHighlight(reason) {
  const allowed = new Set(["resolved", "abandon", "switch", "docReplaced"]);
  if (!allowed.has(reason)) {
    console.error("[abcarus] Error highlight cleared for disallowed reason:", reason);
  }
  const prev = activeErrorHighlight;
  activeErrorHighlight = null;
  activeErrorNavIndex = -1;
  if (reason === "resolved" && prev && Array.isArray(lastErrors) && lastErrors.length) {
    const items = getSortedErrorsForNav();
    if (items.length) {
      const targetPos = Number.isFinite(prev.from) ? prev.from : 0;
      const targetTune = prev.tuneId ? String(prev.tuneId) : "";
      let bestIdx = -1;
      let bestDist = Infinity;
      const consider = (x, idx) => {
        const dist = Math.abs((Number.isFinite(x.pos) ? x.pos : targetPos) - targetPos);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      };
      if (targetTune) {
        for (let i = 0; i < items.length; i += 1) {
          const it = items[i];
          const tuneId = it.entry && it.entry.tuneId ? String(it.entry.tuneId) : "";
          if (tuneId !== targetTune) continue;
          consider(it, i);
        }
      }
      if (bestIdx === -1) {
        for (let i = 0; i < items.length; i += 1) consider(items[i], i);
      }
      if (bestIdx !== -1) activeErrorNavIndex = bestIdx;
    }
  }
  errorActivationHighlightRange = null;
  errorActivationHighlightVersion += 1;
  clearSvgErrorActivationHighlight();
  clearErrorFocusMessage();
  if (!editorView) return;
  suppressErrorActivationClear = true;
  editorView.dispatch({
    selection: editorView.state.selection,
    scrollIntoView: false,
  });
  setTimeout(() => { suppressErrorActivationClear = false; }, 0);
}

function setActiveErrorHighlight(entry, from, to) {
  if (!editorView) return;
  const docLen = editorView.state.doc.length;
  const a = Math.max(0, Math.min(Number(from), docLen));
  const b = Math.max(a, Math.min(Number(to), docLen));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return;

  const id = computeErrorId(entry);
  if (!id) return;

  if (activeErrorHighlight && activeErrorHighlight.id !== id) {
    clearActiveErrorHighlight("switch");
  }

  activeErrorHighlight = {
    id,
    from: a,
    to: b,
    tuneId: entry && entry.tuneId ? entry.tuneId : null,
    filePath: entry && entry.filePath ? entry.filePath : null,
    message: entry && entry.message ? entry.message : null,
    messageKey: normalizeErrorMessageForMatch(entry && entry.message ? entry.message : ""),
    lastSvgRenderIdx: null,
  };
  syncActiveErrorNavIndex();

  errorActivationHighlightRange = { from: a, to: b };
  errorActivationHighlightVersion += 1;
  setErrorFocusMessage(entry, a);
  if (errorsPopoverOpen) {
    renderErrorsPopoverList();
    positionErrorsPopover();
  }
}

function clearErrorsFeatureState() {
  toggleErrorsPopover(false);
  clearActiveErrorHighlight("docReplaced");
  tuneErrorFilter = false;
  tuneErrorScanInFlight = false;
  tuneErrorScanToken += 1;
  setScanErrorButtonActive(false);
  setScanErrorButtonState(false);
  clearErrors();
  // Ensure any "errors-only" filtering in the tune dropdown is cleared immediately.
  updateFileContext();
  // Leaving "Errors" mode should also leave looped error playback mode.
  try {
    setPlaybackRange({
      startOffset: playbackRange.startOffset,
      endOffset: playbackRange.endOffset,
      origin: playbackRange.origin || "cursor",
      loop: false,
    });
  } catch {}
  updateLibraryStatus();
  updateErrorsIndicatorAndPopover();
}

function updateErrorsFeatureUI() {
  if ($btnToggleErrors) {
    $btnToggleErrors.classList.toggle("toggle-active", Boolean(errorsEnabled));
    $btnToggleErrors.textContent = "Errors";
    $btnToggleErrors.setAttribute("aria-pressed", errorsEnabled ? "true" : "false");
  }
  if ($btnPrevMeasure) {
    $btnPrevMeasure.hidden = !errorsEnabled;
    $btnPrevMeasure.disabled = !errorsEnabled;
  }
  if ($btnNextMeasure) {
    $btnNextMeasure.hidden = !errorsEnabled;
    $btnNextMeasure.disabled = !errorsEnabled;
  }
  if ($scanErrorTunes) {
    $scanErrorTunes.hidden = !errorsEnabled;
    $scanErrorTunes.disabled = !errorsEnabled;
  }
  if ($errorsIndicator) {
    if (!errorsEnabled) {
      $errorsIndicator.hidden = true;
      $errorsIndicator.disabled = true;
    }
  }
  if ($errorsFocusMessage) {
    if (!errorsEnabled) {
      $errorsFocusMessage.hidden = true;
      $errorsFocusMessage.textContent = "";
    }
  }
}

function setErrorsEnabled(next, { triggerRefresh = false } = {}) {
  const enabled = Boolean(next);
  if (enabled === errorsEnabled) {
    updateErrorsFeatureUI();
    return;
  }
  errorsEnabled = enabled;
  if (!errorsEnabled) {
    clearErrorsFeatureState();
  } else {
    // On enable: lightweight refresh so errors appear immediately.
    if (triggerRefresh) {
      refreshErrorsNow();
    } else {
      renderNow();
    }
  }
  updateErrorsFeatureUI();
}

function buildErrorActivationDecorations(state) {
  const r = errorActivationHighlightRange;
  if (!r) return Decoration.none;
  const max = state.doc.length;
  const from = Math.max(0, Math.min(Number(r.from), max));
  const to = Math.max(from, Math.min(Number(r.to), max));
  if (to <= from) return Decoration.none;
  return Decoration.set([Decoration.mark({ class: "cm-error-activation" }).range(from, to)]);
}

const errorActivationHighlightPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.version = errorActivationHighlightVersion;
    this.decorations = buildErrorActivationDecorations(view.state);
  }
  update(update) {
    if (update.docChanged && activeErrorHighlight && errorActivationHighlightRange) {
      try {
        const oldFrom = Number(errorActivationHighlightRange.from);
        const oldTo = Number(errorActivationHighlightRange.to);
        if (Number.isFinite(oldFrom) && Number.isFinite(oldTo) && oldTo > oldFrom) {
          const mappedFrom = update.changes.mapPos(oldFrom, 1);
          const mappedTo = update.changes.mapPos(oldTo, -1);
          const max = update.state.doc.length;
          const from = Math.max(0, Math.min(mappedFrom, max));
          const to = Math.max(from, Math.min(mappedTo, max));
          errorActivationHighlightRange = { from, to };
          activeErrorHighlight.from = from;
          activeErrorHighlight.to = to;
        }
      } catch {}
    }
    if (update.docChanged) {
      try {
        this.decorations = this.decorations.map(update.changes);
      } catch {}
    }
    if (this.version !== errorActivationHighlightVersion) {
      this.version = errorActivationHighlightVersion;
      this.decorations = buildErrorActivationDecorations(update.state);
    }
  }
}, {
  decorations: (v) => v.decorations,
});

function clearSvgErrorActivationHighlight() {
  for (const el of lastSvgErrorActivationEls) {
    try { el.classList.remove("svg-error-activation"); } catch {}
  }
  lastSvgErrorActivationEls = [];
}

function highlightSvgAtEditorOffset(editorOffset) {
  if (!$out || !$renderPane) return false;
  if (!Number.isFinite(editorOffset)) return false;
  const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
    ? lastRenderPayload.offset
    : 0;
  const renderIdx = editorOffset + renderOffset;

  // Prefer measure-wide highlighting when possible (easier to spot than a single glyph).
  if (editorView) {
    try {
      const editorText = editorView.state.doc.toString();
      const measure = findMeasureRangeAt(editorText, editorOffset);
      const barEls = measure ? Array.from($out.querySelectorAll(".bar-hl")) : [];
      if (measure && barEls.length) {
        const start = measure.start + renderOffset;
        const end = measure.end + renderOffset;
        const hits = barEls.filter((el) => {
          const s = Number(el.dataset && el.dataset.start);
          return Number.isFinite(s) && s >= start && s < end;
        });
        if (hits.length) {
          clearSvgErrorActivationHighlight();
          lastSvgErrorActivationEls = hits;
          for (const el of lastSvgErrorActivationEls) {
            try { el.classList.add("svg-error-activation"); } catch {}
          }
          const chosen = pickClosestNoteElement(lastSvgErrorActivationEls);
          if (chosen) maybeScrollRenderToNote(chosen);
          if (activeErrorHighlight && Number.isFinite(start)) {
            activeErrorHighlight.lastSvgRenderIdx = start;
          }
          return true;
        }
      }
    } catch {}
  }

  let els = $out.querySelectorAll("._" + renderIdx + "_");
  if ((!els || !els.length) && Number.isFinite(renderIdx)) {
    // Small, deterministic fallback: search backward for a nearby mapped glyph.
    // This helps when the error points into a token but the SVG mapping only exists at the token start.
    const maxBack = 200;
    for (let d = 1; d <= maxBack; d += 1) {
      const probe = renderIdx - d;
      if (probe < 0) break;
      els = $out.querySelectorAll("._" + probe + "_");
      if (els && els.length) break;
    }
  }
  if (!els || !els.length) return false;

  clearSvgErrorActivationHighlight();
  lastSvgErrorActivationEls = Array.from(els);
  for (const el of lastSvgErrorActivationEls) {
    try { el.classList.add("svg-error-activation"); } catch {}
  }
  const chosen = pickClosestNoteElement(lastSvgErrorActivationEls);
  if (chosen) maybeScrollRenderToNote(chosen);
  if (activeErrorHighlight && Number.isFinite(renderIdx)) {
    activeErrorHighlight.lastSvgRenderIdx = renderIdx;
  }
  return true;
}

const debugLogBuffer = [];
function recordDebugLog(level, args, stackOverride) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message: Array.isArray(args) ? args.map((a) => {
      if (a instanceof Error) return a.stack || a.message || String(a);
      try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); }
    }).join(" ") : String(args || ""),
    stack: stackOverride || null,
  };
  debugLogBuffer.push(entry);
  if (debugLogBuffer.length > 300) debugLogBuffer.splice(0, debugLogBuffer.length - 300);
}

(() => {
  if (window.__abcarusConsoleWrapped) return;
  window.__abcarusConsoleWrapped = true;
  const origErr = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args) => {
    try { recordDebugLog("error", args); } catch {}
    origErr(...args);
  };
  console.warn = (...args) => {
    try { recordDebugLog("warn", args); } catch {}
    origWarn(...args);
  };
  window.addEventListener("error", (e) => {
    try {
      recordDebugLog("window.error", [e && e.message ? e.message : "Window error"], e && e.error ? (e.error.stack || e.error.message) : null);
    } catch {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const reason = e && e.reason ? e.reason : null;
      recordDebugLog("unhandledrejection", [reason && reason.message ? reason.message : String(reason || "Unhandled rejection")], reason && reason.stack ? reason.stack : null);
    } catch {}
  });
})();

const MIN_PANE_WIDTH = 220;
const MIN_RIGHT_PANE_WIDTH = 220;
const MIN_ERROR_PANE_HEIGHT = 120;
const USE_ERROR_OVERLAY = true;
const LIBRARY_SEARCH_DEBOUNCE_MS = 180;
let settingsController = null;
let disclaimerShown = false;

function buildAbcDecorations(state) {
  const builder = new RangeSetBuilder();
  let inTextBlock = false;

  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const text = line.text;

    if (/^%%\s*begintext\b/i.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-directive" }));
      inTextBlock = true;
      continue;
    }

    if (/^%%\s*endtext\b/i.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-directive" }));
      inTextBlock = false;
      continue;
    }

    if (inTextBlock) {
      if (text.length) {
        builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-textblock" }));
      }
      continue;
    }

    if (/^%%/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-directive" }));
      continue;
    }

    if (/^%/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-comment" }));
      continue;
    }

    if (/^w:/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-lyric-inline" }));
      continue;
    }

    if (/^W:/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-lyric-block" }));
      continue;
    }

    if (/^[A-Z]:/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-header" }));
      continue;
    }

    if (text.trim().length) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-notes" }));
    }
  }

  return builder.finish();
}

const abcHighlight = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildAbcDecorations(view.state);
  }
  update(update) {
    if (update.docChanged) {
      this.decorations = buildAbcDecorations(update.state);
    }
  }
}, {
  decorations: (v) => v.decorations,
});

function setPaneSizes(leftWidth) {
  if (!$main || !$divider || !$sidebar) return;
  const total = $main.clientWidth;
  const dividerWidth = $divider.offsetWidth || 6;
  const min = Math.min(MIN_PANE_WIDTH, Math.max(0, (total - dividerWidth) / 2));
  const clamped = Math.max(min, Math.min(leftWidth, total - min - dividerWidth));
  lastSidebarWidth = clamped;
  $main.style.gridTemplateColumns = `${clamped}px ${dividerWidth}px 1fr`;
}

function initPaneResizer() {
  if (!$main || !$divider || !$sidebar) return;

  $divider.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $divider.setPointerCapture(e.pointerId);

    const startLeft = $sidebar.getBoundingClientRect().width;
    const startX = e.clientX;

    const onMove = (ev) => {
      setPaneSizes(startLeft + (ev.clientX - startX));
    };

    const onUp = (ev) => {
      $divider.releasePointerCapture(e.pointerId);
      $divider.removeEventListener("pointermove", onMove);
      $divider.removeEventListener("pointerup", onUp);
      $divider.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("resizing");
    };

    document.body.classList.add("resizing");
    $divider.addEventListener("pointermove", onMove);
    $divider.addEventListener("pointerup", onUp);
    $divider.addEventListener("pointercancel", onUp);
  });

  window.addEventListener("resize", () => {
    if (!isLibraryVisible) return;
    setPaneSizes($sidebar.getBoundingClientRect().width);
  });
}

let lastEditorWidth = 320;

function setRightPaneSizes(leftWidth) {
  if (!$rightSplit || !$splitDivider || !$renderPane || !$editorPane) return;
  const total = $rightSplit.clientWidth;
  const dividerWidth = $splitDivider.offsetWidth || 6;
  const min = Math.min(MIN_RIGHT_PANE_WIDTH, Math.max(0, (total - dividerWidth) / 2));
  const clamped = Math.max(min, Math.min(leftWidth, total - min - dividerWidth));
  lastEditorWidth = clamped;
  $rightSplit.style.gridTemplateColumns = `${clamped}px ${dividerWidth}px 1fr`;
}

function initRightPaneResizer() {
  if (!$rightSplit || !$splitDivider || !$renderPane || !$editorPane) return;
  $splitDivider.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $splitDivider.setPointerCapture(e.pointerId);
    const startLeft = $editorPane.getBoundingClientRect().width;
    const startX = e.clientX;

    const onMove = (ev) => {
      setRightPaneSizes(startLeft + (ev.clientX - startX));
    };

    const onUp = (ev) => {
      $splitDivider.releasePointerCapture(e.pointerId);
      $splitDivider.removeEventListener("pointermove", onMove);
      $splitDivider.removeEventListener("pointerup", onUp);
      $splitDivider.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("resizing-cols");
    };

    document.body.classList.add("resizing-cols");
    $splitDivider.addEventListener("pointermove", onMove);
    $splitDivider.addEventListener("pointerup", onUp);
    $splitDivider.addEventListener("pointercancel", onUp);
  });

  window.addEventListener("resize", () => {
    setRightPaneSizes(lastEditorWidth || MIN_RIGHT_PANE_WIDTH);
  });
}

function resetRightPaneSplit() {
  if (!$rightSplit) return;
  const total = $rightSplit.clientWidth;
  const dividerWidth = $splitDivider ? ($splitDivider.offsetWidth || 6) : 6;
  const leftWidth = Math.max(MIN_RIGHT_PANE_WIDTH, Math.floor((total - dividerWidth) / 2));
  setRightPaneSizes(leftWidth);
}

let lastErrorHeight = 180;

function setSidebarSplitSizes(topHeight) {
  if (USE_ERROR_OVERLAY) return;
  if (!$sidebarBody || !$sidebarSplit || !$errorPane || !$libraryTree) return;
  const total = $sidebarBody.clientHeight;
  const dividerHeight = $sidebarSplit.offsetHeight || 6;
  const min = Math.min(MIN_ERROR_PANE_HEIGHT, Math.max(0, (total - dividerHeight) / 2));
  const clamped = Math.max(min, Math.min(topHeight, total - min - dividerHeight));
  lastErrorHeight = total - clamped - dividerHeight;
  $sidebarBody.style.gridTemplateRows = `${clamped}px ${dividerHeight}px 1fr`;
}

function initSidebarResizer() {
  if (USE_ERROR_OVERLAY) return;
  if (!$sidebarBody || !$sidebarSplit || !$errorPane || !$libraryTree) return;

  $sidebarSplit.addEventListener("pointerdown", (e) => {
    if (!$sidebar.classList.contains("has-errors")) return;
    e.preventDefault();
    $sidebarSplit.setPointerCapture(e.pointerId);
    const startTop = $libraryTree.getBoundingClientRect().height;
    const startY = e.clientY;

    const onMove = (ev) => {
      setSidebarSplitSizes(startTop + (ev.clientY - startY));
    };

    const onUp = (ev) => {
      $sidebarSplit.releasePointerCapture(e.pointerId);
      $sidebarSplit.removeEventListener("pointermove", onMove);
      $sidebarSplit.removeEventListener("pointerup", onUp);
      $sidebarSplit.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("resizing-rows");
    };

    document.body.classList.add("resizing-rows");
    $sidebarSplit.addEventListener("pointermove", onMove);
    $sidebarSplit.addEventListener("pointerup", onUp);
    $sidebarSplit.addEventListener("pointercancel", onUp);
  });

  window.addEventListener("resize", () => {
    if (!$sidebar.classList.contains("has-errors")) return;
    setSidebarSplitSizes($libraryTree.getBoundingClientRect().height);
  });
}

let libraryIndex = null;
let libraryFilter = null;
let libraryFilterLabel = "";
let libraryTextFilter = "";
let tuneErrorFilter = false;
let tuneErrorScanToken = 0;
let tuneErrorScanInFlight = false;
let suppressRecentEntries = false;
let toastTimer = null;
let errorLineOffset = 0;
let measureErrorRanges = [];
let measureErrorVersion = 0;
let measureErrorRenderRanges = [];
let lastRenderPayload = null;
let globalHeaderText = "";
let globalHeaderEnabled = true;
let globalHeaderLocalText = "";
let globalHeaderUserText = "";
let globalHeaderGlobalText = "";
let soundfontName = "TimGM6mb.sf2";
let soundfontSource = "abc2svg.sf2";
let soundfontReadyName = null;
let soundfontLoadPromise = null;
let soundfontLoadTarget = null;
let soundfontStatusTimer = null;
const STREAMING_SF2 = new Set();
let soundfontOptionsLoaded = false;
let soundfontOptionsLoading = null;
const fileContentCache = new Map();
let activeTuneId = null;
let activeTuneMeta = null;
let activeFilePath = null;
let isLibraryVisible = true;
let lastSidebarWidth = 280;
const collapsedFiles = new Set();
const collapsedGroups = new Set();
let groupMode = "file";
let sortMode = "update_desc";
let sortModeIsAuto = false;
let toolHealth = null;
let toolHealthError = "";
let toolWarningShown = false;
const groupSortPrefs = new Map();
let renamingFilePath = null;
let renameInFlight = false;
let librarySearchTimer = null;
let pendingLibrarySearch = "";

const GROUP_LABELS = {
  file: "File",
  x: "X",
  composer: "C",
  meter: "M",
  key: "K",
  unit: "L",
  tempo: "Q",
  rhythm: "R",
  source: "S",
  origin: "O",
  group: "G",
};

function setScanStatus(text) {
  const value = String(text || "");
  if (/^Done\b/i.test(value)) {
    if ($scanStatus) $scanStatus.textContent = "";
    setStatus(value);
    return;
  }
  if ($scanStatus) $scanStatus.textContent = value;
}

function setLibraryErrorIndexForTune(tuneId, count) {
  if (!tuneId) return;
  if (count > 0) libraryErrorIndex.set(tuneId, count);
  else libraryErrorIndex.delete(tuneId);
  if (tuneErrorFilter && !tuneErrorScanInFlight) {
    updateFileContext();
  }
}

function clearErrorIndexForFile(entry) {
  if (!entry || !entry.tunes) return;
  for (const tune of entry.tunes) {
    if (tune && tune.id) libraryErrorIndex.delete(tune.id);
  }
}

function updateLibraryErrorIndexFromCurrentErrors() {
  if (!activeTuneId) return;
  let count = 0;
  for (const entry of errorEntries) {
    if (entry.tuneId === activeTuneId) count += entry.count || 1;
  }
  setLibraryErrorIndexForTune(activeTuneId, count);
}

function stripFileExtension(name) {
  const value = String(name || "");
  return value.replace(/\.[^.]+$/, "");
}

function setFileNameMeta(name) {
  if (!$fileNameMeta) return;
  $fileNameMeta.textContent = name || "Untitled";
  updateWindowTitle();
}

function updateWindowTitle() {
  const base = ($fileNameMeta && $fileNameMeta.textContent) ? $fileNameMeta.textContent : "Untitled";
  const tuneDirty = Boolean(currentDoc && currentDoc.dirty);
  const hasHeader = computeHeaderPresence() === "present";
  const headerTag = hasHeader ? (headerDirty ? " [Header*]" : " [Header]") : "";
  const tuneTag = tuneDirty ? " *" : "";
  document.title = `ABCarus — ${base}${headerTag}${tuneTag}`;
}

function buildTuneMetaLabel(metadata) {
  if (!metadata) return "Untitled";
  const xPart = metadata.xNumber ? `X:${metadata.xNumber}` : "";
  const title = metadata.title || "";
  const label = `${xPart} ${title}`.trim();
  return label || "Untitled";
}

function setTuneMetaText(text) {
  setBufferStatus(text || "");
}

function setDirtyIndicator(isDirty) {
  if (!$dirtyIndicator) return;
  const tuneDirty = Boolean(isDirty);
  const hdrDirty = Boolean(headerDirty);
  if (tuneDirty && hdrDirty) {
    $dirtyIndicator.textContent = "Header+Tune: Unsaved";
    $dirtyIndicator.classList.add("active");
  } else if (hdrDirty) {
    $dirtyIndicator.textContent = "Header: Unsaved";
    $dirtyIndicator.classList.add("active");
  } else if (tuneDirty) {
    $dirtyIndicator.textContent = "Tune: Unsaved";
    $dirtyIndicator.classList.add("active");
  } else {
    $dirtyIndicator.textContent = "";
    $dirtyIndicator.classList.remove("active");
  }
  updateLibraryDirtyState(tuneDirty || hdrDirty);
  updateWindowTitle();
}

function computeHeaderPresence() {
  const entry = getActiveFileEntry();
  if (!entry) return "none";
  const currentHeader = getHeaderEditorValue();
  const hasHeader = Boolean(String(currentHeader || "").trim());
  if (hasHeader || headerDirty) return "present";
  return "none";
}

function updateHeaderStateUI({ announce = false } = {}) {
  const presence = computeHeaderPresence();
  const state = (presence === "present")
    ? (headerDirty ? "present_dirty" : "present_clean")
    : "none";

  if ($fileHeaderToggle) {
    $fileHeaderToggle.classList.toggle("present", presence === "present");
    $fileHeaderToggle.classList.toggle("dirty", Boolean(headerDirty));
    if (state === "none") {
      $fileHeaderToggle.title = "No file header in this file.";
    } else if (state === "present_clean") {
      $fileHeaderToggle.title = "File header present (affects rendering & playback).";
    } else {
      $fileHeaderToggle.title = "File header modified (unsaved) — affects rendering & playback.";
    }
  }
  if ($headerStateMarker) {
    $headerStateMarker.textContent = (state === "none") ? "—" : (state === "present_clean" ? "✓" : "✓*");
  }

  setDirtyIndicator(Boolean(currentDoc && currentDoc.dirty));

  if (announce) {
    if (!activeFilePath) return;
    if (lastHeaderToastFilePath === activeFilePath) return;
    lastHeaderToastFilePath = activeFilePath;
    if (presence === "present") showToast("File header detected (affects rendering & playback).", 2600);
    else showToast("No file header in this file.", 2600);
  }
}

function updateLibraryDirtyState(isDirty) {
  if (!activeFilePath || !$libraryTree) return;
  const fileNodes = $libraryTree.querySelectorAll(".tree-file");
  for (const node of fileNodes) {
    const label = node.querySelector(".tree-label");
    if (!label) continue;
    const isActive = label.dataset && label.dataset.filePath === activeFilePath;
    node.classList.toggle("dirty", isActive && Boolean(isDirty));
  }
}

function buildTuneSelectOptions(fileEntry) {
  if (!$fileTuneSelect) return;
  $fileTuneSelect.textContent = "";
  if (!fileEntry || !fileEntry.tunes || !fileEntry.tunes.length) {
    $fileTuneSelect.disabled = true;
    return;
  }
  const sourceTunes = fileEntry.tunes.slice().sort((a, b) => (Number(a.xNumber) || 0) - (Number(b.xNumber) || 0));
  const tunes = tuneErrorFilter
    ? sourceTunes.filter((tune) => libraryErrorIndex.has(tune.id))
    : sourceTunes;
  if (isNewTuneDraft) {
    const option = document.createElement("option");
    option.value = "__new__";
    option.textContent = "(New tune draft)";
    option.selected = true;
    $fileTuneSelect.appendChild(option);
  }
  if (tuneErrorFilter && tuneErrorScanInFlight && !libraryErrorIndex.size) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "(Scanning errors…)";
    option.disabled = true;
    option.selected = true;
    $fileTuneSelect.appendChild(option);
    $fileTuneSelect.disabled = true;
    return;
  }
  if (!tunes.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = tuneErrorFilter ? "(No error tunes)" : "(No tunes)";
    option.disabled = true;
    option.selected = true;
    $fileTuneSelect.appendChild(option);
    $fileTuneSelect.disabled = true;
    return;
  }
  for (const tune of tunes) {
    const option = document.createElement("option");
    option.value = tune.id;
    const title = tune.title || tune.preview || "";
    const label = tune.xNumber ? `X:${tune.xNumber} ${title}`.trim() : title || tune.id;
    option.textContent = label;
    $fileTuneSelect.appendChild(option);
  }
  $fileTuneSelect.disabled = false;
  if (!isNewTuneDraft && activeTuneId) $fileTuneSelect.value = activeTuneId;
  if (!isNewTuneDraft && !$fileTuneSelect.value) {
    $fileTuneSelect.selectedIndex = 0;
  }
}

function updateFileContext() {
  const entry = getActiveFileEntry();
  if (!entry) {
    if ($fileTuneSelect) {
      $fileTuneSelect.textContent = "";
      $fileTuneSelect.disabled = true;
    }
    setScanErrorButtonVisibility(null);
    setScanErrorButtonActive(false);
    return;
  }
  buildTuneSelectOptions(entry);
  setScanErrorButtonVisibility(entry);
  setScanErrorButtonActive(tuneErrorFilter);
}

function setHeaderEditorValue(text) {
  if (!headerEditorView) return;
  if (text != null && typeof text !== "string") {
    console.error("[abcarus] setHeaderEditorValue received non-string; dropped:", Object.prototype.toString.call(text));
    return;
  }
  const doc = headerEditorView.state.doc;
  headerEditorView.dispatch({
    changes: { from: 0, to: doc.length, insert: text || "" },
  });
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

const measureErrorPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.version = measureErrorVersion;
    this.decorations = buildMeasureErrorDecorations(view.state, measureErrorRanges);
  }
  update(update) {
    if (update.docChanged) {
      try {
        this.decorations = this.decorations.map(update.changes);
      } catch {}
      if (measureErrorRanges && measureErrorRanges.length) {
        try {
          const max = update.state.doc.length;
          const mapped = [];
          for (const r of measureErrorRanges) {
            const start = update.changes.mapPos(Number(r.start), 1);
            const end = update.changes.mapPos(Number(r.end), -1);
            const s = Math.max(0, Math.min(start, max));
            const e = Math.max(s, Math.min(end, max));
            if (e > s) mapped.push({ start: s, end: e });
          }
          measureErrorRanges = mapped;
        } catch {}
      }
    }
    if (update.docChanged || update.selectionSet || this.version !== measureErrorVersion) {
      this.version = measureErrorVersion;
      this.decorations = buildMeasureErrorDecorations(update.state, measureErrorRanges);
    }
  }
}, {
  decorations: (v) => v.decorations,
});

function setMeasureErrorRanges(ranges) {
  measureErrorRanges = ranges || [];
  measureErrorVersion += 1;
  if (!editorView) return;
  editorView.dispatch({
    selection: editorView.state.selection,
    scrollIntoView: false,
  });
}

function getHeaderEditorValue() {
  if (!headerEditorView) return "";
  return headerEditorView.state.doc.toString();
}

function setHeaderCollapsed(collapsed) {
  headerCollapsed = collapsed;
  if ($fileHeaderPanel) {
    $fileHeaderPanel.classList.toggle("collapsed", headerCollapsed);
  }
}

function toggleHeaderCollapsed() {
  setHeaderCollapsed(!headerCollapsed);
}

function normalizeSortText(text) {
  return String(text || "").toLowerCase();
}

function compareSortText(a, b) {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), undefined, { numeric: true });
}

function getTuneSortValue(tune) {
  if (!tune) return null;
  const xNum = Number(tune.xNumber);
  if (Number.isFinite(xNum)) return xNum;
  return null;
}

function getFileLabel(file) {
  return (file && file.basename) ? file.basename : safeBasename(file && file.path ? file.path : "");
}

function getTuneLabel(tune) {
  if (!tune) return "";
  const title = tune.title || tune.preview || "";
  const composer = tune.composer || "";
  const key = tune.key || "";
  const label = [title, composer, key].filter(Boolean).join(" - ");
  if (label) return label;
  if (tune.xNumber) return `X:${tune.xNumber}`;
  return "";
}

function getEntryTuneCount(entry) {
  if (!entry || !entry.tunes) return 0;
  return entry.tunes.length || 0;
}

function sortLibraryFiles(files) {
  const list = (files || []).map((file) => ({
    ...file,
    tunes: Array.isArray(file.tunes) ? file.tunes.slice() : [],
  }));
  const dir = sortMode.endsWith("desc") ? -1 : 1;
  if (sortMode.startsWith("update_")) {
    list.sort((a, b) => ((a.updatedAtMs || 0) - (b.updatedAtMs || 0)) * dir);
    return list;
  }
  if (sortMode.startsWith("count_")) {
    list.sort((a, b) => {
      const diff = (getEntryTuneCount(a) - getEntryTuneCount(b)) * dir;
      if (diff) return diff;
      return compareSortText(getFileLabel(a), getFileLabel(b)) * dir;
    });
  } else {
    list.sort((a, b) => compareSortText(getFileLabel(a), getFileLabel(b)) * dir);
  }
  for (const file of list) {
    if (file.tunes && file.tunes.length) {
      if (groupMode === "file") {
        const tuneDir = sortMode.startsWith("file_") ? dir : 1;
        file.tunes.sort((a, b) => {
          const aX = getTuneSortValue(a);
          const bX = getTuneSortValue(b);
          if (Number.isFinite(aX) && Number.isFinite(bX) && aX !== bX) {
            return (aX - bX) * tuneDir;
          }
          if (Number.isFinite(aX) && !Number.isFinite(bX)) return -1 * tuneDir;
          if (!Number.isFinite(aX) && Number.isFinite(bX)) return 1 * tuneDir;
          return compareSortText(getTuneLabel(a), getTuneLabel(b)) * tuneDir;
        });
      } else {
        file.tunes.sort((a, b) => compareSortText(getTuneLabel(a), getTuneLabel(b)) * dir);
      }
    }
  }
  return list;
}

function sortGroupEntries(entries) {
  const list = entries ? entries.slice() : [];
  const dir = sortMode.endsWith("desc") ? -1 : 1;
  if (sortMode.startsWith("update_")) {
    list.sort((a, b) => ((a.updatedAtMs || 0) - (b.updatedAtMs || 0)) * dir);
  } else if (sortMode.startsWith("count_")) {
    list.sort((a, b) => {
      const diff = (getEntryTuneCount(a) - getEntryTuneCount(b)) * dir;
      if (diff) return diff;
      return compareSortText(a.label, b.label) * dir;
    });
  } else {
    list.sort((a, b) => compareSortText(a.label, b.label) * dir);
  }
  return list;
}

function setSortMode(mode, isAuto = false) {
  sortMode = mode;
  sortModeIsAuto = isAuto;
  if ($sortBy) $sortBy.value = mode;
}

function maybeAutoSortForGroup(mode) {
  if (mode === "file") {
    if (sortModeIsAuto && sortMode.startsWith("count_")) {
      setSortMode("file_desc", true);
    }
    return;
  }
  if (sortMode.startsWith("file_")) {
    setSortMode("count_desc", true);
  }
}

function getVisibleLibraryFiles() {
  if (libraryFilter) return libraryFilter;
  return libraryIndex ? (libraryIndex.files || []) : [];
}

function setLibraryFilter(filteredFiles, label) {
  libraryFilter = filteredFiles;
  libraryFilterLabel = label || "";
  renderLibraryTree();
  updateLibraryStatus();
}

function clearLibraryFilter() {
  libraryFilter = null;
  libraryFilterLabel = "";
  renderLibraryTree();
  updateLibraryStatus();
}

function getActiveFileEntry() {
  if (!libraryIndex || !libraryIndex.files || !activeFilePath) return null;
  return libraryIndex.files.find((file) => file.path === activeFilePath) || null;
}

function updateFileHeaderPanel() {
  if (!$fileHeaderPanel || !$fileHeaderEditor) return;
  const entry = getActiveFileEntry();
  if (!entry) {
    $fileHeaderPanel.classList.remove("active");
    suppressHeaderDirty = true;
    setHeaderEditorValue("");
    suppressHeaderDirty = false;
    headerDirty = false;
    headerEditorFilePath = null;
    updateHeaderStateUI();
    return;
  }
  $fileHeaderPanel.classList.add("active");
  if (headerEditorFilePath !== entry.path) {
    suppressHeaderDirty = true;
    setHeaderEditorValue(entry.headerText || "");
    suppressHeaderDirty = false;
    headerDirty = false;
    headerEditorFilePath = entry.path || null;
  }
  updateHeaderStateUI({ announce: true });
}

function findHeaderEndOffset(content) {
  const match = String(content || "").match(/^\s*X:/m);
  if (!match) return String(content || "").length;
  return Number.isFinite(match.index) ? match.index : 0;
}

function closeFindLibraryModal() {
  if (!$findLibraryModal) return;
  $findLibraryModal.classList.remove("open");
  $findLibraryModal.setAttribute("aria-hidden", "true");
}

function applyFindLibraryModal() {
  if (!$findLibraryTag || !$findLibraryValue) return;
  const tag = String($findLibraryTag.value || "").toUpperCase();
  const value = String($findLibraryValue.value || "").trim();
  if (!value) {
    setStatus("Enter a value to search.");
    return;
  }
  applyLibraryTagFilter(tag, value);
  closeFindLibraryModal();
}

function normalizeFilterValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchTuneField(tune, tag, value) {
  const needle = normalizeFilterValue(value);
  if (!needle) return false;
  const fieldMap = {
    X: tune.xNumber,
    T: tune.title,
    C: tune.composer,
    M: tune.meter,
    K: tune.key,
    L: tune.unitLength,
    Q: tune.tempo,
    R: tune.rhythm,
    S: tune.source,
    O: tune.origin,
    G: tune.group,
  };
  const raw = fieldMap[tag] || "";
  return normalizeFilterValue(raw).includes(needle);
}

function applyLibraryTagFilter(tag, value) {
  if (!libraryIndex || !libraryIndex.files) return;
  const filtered = [];
  for (const file of libraryIndex.files) {
    const tunes = (file.tunes || []).filter((tune) => matchTuneField(tune, tag, value));
    if (tunes.length) {
      filtered.push({
        path: file.path,
        basename: file.basename,
        headerText: file.headerText || "",
        headerEndOffset: file.headerEndOffset || 0,
        updatedAtMs: file.updatedAtMs || 0,
        tunes,
      });
    }
  }
  setLibraryFilter(filtered, `${tag}:${value}`);
}

function updateLibraryStatus() {
  if (libraryFilterLabel) {
    setScanStatus(`Filter: ${libraryFilterLabel}`);
    return;
  }
  if (tuneErrorFilter) {
    if (!tuneErrorScanInFlight) setScanStatus("Filter: Error tunes");
    return;
  }
  if (libraryTextFilter) {
    setScanStatus(`Search: ${libraryTextFilter}`);
    return;
  }
  if (libraryIndex) {
    setScanStatus(`Done (${(libraryIndex.files || []).length} files)`);
    return;
  }
  setScanStatus("Idle");
}

function matchLibraryText(value, needle) {
  if (!value) return false;
  return normalizeFilterValue(value).includes(needle);
}

function tuneMatchesText(tune, needle) {
  if (!tune) return false;
  if (matchLibraryText(tune.title, needle)) return true;
  if (matchLibraryText(tune.preview, needle)) return true;
  if (matchLibraryText(tune.composer, needle)) return true;
  if (matchLibraryText(tune.key, needle)) return true;
  if (matchLibraryText(tune.meter, needle)) return true;
  if (matchLibraryText(tune.unitLength, needle)) return true;
  if (matchLibraryText(tune.tempo, needle)) return true;
  if (matchLibraryText(tune.rhythm, needle)) return true;
  if (matchLibraryText(tune.source, needle)) return true;
  if (matchLibraryText(tune.origin, needle)) return true;
  if (matchLibraryText(tune.group, needle)) return true;
  if (matchLibraryText(String(tune.xNumber || ""), needle)) return true;
  return false;
}

function applyLibraryTextFilter(files, query) {
  const needle = normalizeFilterValue(query);
  if (!needle) return files;
  const filtered = [];
  for (const file of files || []) {
    const tunes = Array.isArray(file.tunes) ? file.tunes : [];
    const fileMatch = matchLibraryText(file.basename, needle);
    const matchedTunes = fileMatch ? tunes : tunes.filter((tune) => tuneMatchesText(tune, needle));
    if (matchedTunes.length || fileMatch) {
      filtered.push({
        path: file.path,
        basename: file.basename,
        headerText: file.headerText || "",
        headerEndOffset: file.headerEndOffset || 0,
        updatedAtMs: file.updatedAtMs || 0,
        tunes: matchedTunes,
      });
    }
  }
  return filtered;
}


function promptFindInLibrary() {
  if (!libraryIndex) {
    setStatus("Load a library folder first.");
    return;
  }
  if ($findLibraryModal) {
    $findLibraryModal.classList.add("open");
    $findLibraryModal.setAttribute("aria-hidden", "false");
    if ($findLibraryValue) $findLibraryValue.focus();
  }
}

function getEditorValue() {
  if (!editorView) return "";
  return editorView.state.doc.toString();
}

function openFindPanel(view) {
  openSearchPanel(view);
  applySearchPanelHints(view);
  return true;
}

function openReplacePanel(view) {
  openSearchPanel(view);
  applySearchPanelHints(view);
  setTimeout(() => {
    const panel = view.dom.querySelector(".cm-search");
    if (!panel) return;
    const replace = panel.querySelector("input[name='replace']");
    if (replace) {
      replace.focus();
      replace.select();
    }
  }, 0);
  return true;
}

function getSelectedLines(state) {
  const lines = [];
  const seen = new Set();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    const last = (range.to === toLine.from && range.to > range.from)
      ? Math.max(fromLine.number, toLine.number - 1)
      : toLine.number;
    for (let lineNo = fromLine.number; lineNo <= last; lineNo += 1) {
      const line = state.doc.line(lineNo);
      if (seen.has(line.from)) continue;
      seen.add(line.from);
      lines.push(line);
    }
  }
  return lines;
}

function indentSelectionMore(view) {
  if (view.state.readOnly) return false;
  const unit = view.state.facet(indentUnit);
  const changes = getSelectedLines(view.state).map((line) => ({
    from: line.from,
    insert: unit,
  }));
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: "input.indent" });
  return true;
}

function indentSelectionLess(view) {
  if (view.state.readOnly) return false;
  const unit = view.state.facet(indentUnit);
  const unitSize = unit.length;
  const changes = [];
  for (const line of getSelectedLines(view.state)) {
    const match = /^[\t ]+/.exec(line.text);
    if (!match) continue;
    const prefix = match[0];
    let remove = 0;
    if (prefix.startsWith("\t")) remove = 1;
    else remove = Math.min(prefix.length, unitSize);
    if (remove > 0) {
      changes.push({ from: line.from, to: line.from + remove, insert: "" });
    }
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: "delete.dedent" });
  return true;
}

function setSearchQueryPattern(pattern, useRegex = true) {
  if (!editorView) return;
  openSearchPanel(editorView);
  setTimeout(() => {
    const panel = editorView.dom.querySelector(".cm-search");
    if (!panel) return;
    const searchInput = panel.querySelector("input[name='search']");
    const regexInput = panel.querySelector("input[name='re']");
    if (!searchInput || !regexInput) return;
    searchInput.value = pattern;
    regexInput.checked = useRegex;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    if (useRegex) {
      regexInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    searchInput.focus();
    searchInput.select();
  }, 0);
}

function foldBeginTextBlocks(state, lineStart, lineEnd) {
  const line = state.doc.lineAt(lineStart);
  if (!/^%%\s*begintext\b/i.test(line.text)) return null;
  for (let i = line.number + 1; i <= state.doc.lines; i += 1) {
    const next = state.doc.line(i);
    if (/^%%\s*endtext\b/i.test(next.text)) {
      return { from: line.to, to: next.from };
    }
  }
  return null;
}

function moveLineSelection(view, delta) {
  const { state } = view;
  const ranges = [];
  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    const targetLineNumber = Math.max(1, Math.min(state.doc.lines, line.number + delta));
    const targetLine = state.doc.line(targetLineNumber);
    const col = range.head - line.from;
    const pos = Math.min(targetLine.to, targetLine.from + col);
    ranges.push(EditorSelection.cursor(pos));
  }
  view.dispatch({ selection: EditorSelection.create(ranges), scrollIntoView: true });
  return true;
}

function resetLayout() {
  if (settingsController) settingsController.zoomReset();
  resetRightPaneSplit();
}

function refreshErrorsNow() {
  if (!errorsEnabled) {
    showToast("Errors disabled");
    return;
  }
  if (t) {
    clearTimeout(t);
    t = null;
  }
  renderNow();
  if (tuneErrorFilter && !tuneErrorScanInFlight) {
    const entry = getActiveFileEntry();
    if (entry) {
      tuneErrorScanToken += 1;
      tuneErrorScanInFlight = true;
      setScanErrorButtonActive(true);
      scanActiveFileForTuneErrors(entry).catch(() => {});
      updateLibraryStatus();
    }
  }
}

async function loadLastRecentEntry() {
  if (!window.api || typeof window.api.getLastRecent !== "function") return;
  const res = await window.api.getLastRecent();
  if (!res || !res.entry) return;
  if (res.type === "tune") {
    await openRecentTune(res.entry);
  } else if (res.type === "file") {
    await openRecentFile(res.entry);
  }
}

function setEditorValue(text) {
  if (!editorView) return;
  if (text != null && typeof text !== "string") {
    console.error("[abcarus] setEditorValue received non-string; dropped:", Object.prototype.toString.call(text));
    return;
  }
  const doc = editorView.state.doc;
  editorView.dispatch({
    changes: { from: 0, to: doc.length, insert: text || "" },
  });
}

function initEditor() {
  if (editorView || !$editorHost) return;
  const customKeys = keymap.of([
    { key: "Ctrl-s", run: () => { fileSave(); return true; } },
    { key: "Mod-s", run: () => { fileSave(); return true; } },
    { key: "Ctrl-f", run: openFindPanel },
    { key: "Mod-f", run: openFindPanel },
    { key: "Ctrl-h", run: openReplacePanel },
    { key: "Mod-h", run: openReplacePanel },
    { key: "Ctrl-g", run: gotoLine },
    { key: "Mod-g", run: gotoLine },
    { key: "Ctrl-F7", run: (view) => moveLineSelection(view, 1) },
    { key: "Mod-F7", run: (view) => moveLineSelection(view, 1) },
    { key: "Ctrl-F5", run: (view) => moveLineSelection(view, -1) },
    { key: "Mod-F5", run: (view) => moveLineSelection(view, -1) },
	    { key: "Tab", run: indentSelectionMore },
	    { key: "Shift-Tab", run: indentSelectionLess },
	    { key: "F2", run: () => { toggleLibrary(); return true; } },
	    { key: "F5", run: () => { transportTogglePlayPause(); return true; } },
	    { key: "F6", run: () => { activateErrorByNav(-1); return true; } },
	    { key: "F7", run: () => { activateErrorByNav(1); return true; } },
	    { key: "F4", run: () => { startPlaybackAtIndex(0); return true; } },
	    { key: "F8", run: () => { resetLayout(); return true; } },
	    { key: "F9", run: () => { refreshErrorsNow(); return true; } },
	  ]);
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      if (!suppressDirty && currentDoc) {
        currentDoc.content = update.state.doc.toString();
        currentDoc.dirty = true;
        setDirtyIndicator(true);
      }
      if (t) clearTimeout(t);
      t = setTimeout(renderNow, 400);
    }
    if (update.selectionSet && !isPlaying) {
      const idx = update.state.selection.main.anchor;
      highlightNoteAtIndex(idx);
      if (!suppressPlaybackRangeSelectionSync) {
        const origin = pendingPlaybackRangeOrigin || "cursor";
        pendingPlaybackRangeOrigin = null;
        updatePlaybackRangeFromSelection(update.state.selection, origin);
      } else {
        pendingPlaybackRangeOrigin = null;
      }
    }
    if (update.selectionSet || update.docChanged) {
      const pos = update.state.selection.main.head;
      const lineInfo = update.state.doc.lineAt(pos);
      setCursorStatus(
        lineInfo.number,
        pos - lineInfo.from + 1,
        pos + 1,
        update.state.doc.lines,
        update.state.doc.length
      );
    }
  });
  const state = EditorState.create({
    doc: DEFAULT_ABC,
    extensions: [
      basicSetup,
      abcHighlight,
      measureErrorPlugin,
      errorActivationHighlightPlugin,
      updateListener,
      customKeys,
      foldService.of(foldBeginTextBlocks),
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
    ],
  });
  editorView = new EditorView({
    state,
    parent: $editorHost,
  });

  // Clear the active error highlight only on an explicit user click outside the highlight range.
  // This avoids accidental clearing from programmatic selection changes (follow playback, jump, etc.).
  editorView.dom.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (suppressErrorActivationClear) return;
    if (!activeErrorHighlight) return;
    if (!Number.isFinite(activeErrorHighlight.from) || !Number.isFinite(activeErrorHighlight.to)) return;
    const pos = editorView.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    const inside = pos >= activeErrorHighlight.from && pos <= activeErrorHighlight.to;
    if (!inside) clearActiveErrorHighlight("abandon");
  }, true);

  editorView.dom.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    showContextMenuAt(ev.clientX, ev.clientY, { type: "editor" });
  });
  setCursorStatus(1, 1, 1, state.doc.lines, state.doc.length);
}

function initSearchPanelShortcuts() {
  const findButtonByLabel = (panel, label) => {
    if (!panel) return null;
    const buttons = Array.from(panel.querySelectorAll("button"));
    const want = String(label || "").trim().toLowerCase();
    return buttons.find((btn) => String(btn.textContent || "").trim().toLowerCase() === want) || null;
  };

  const triggerPanelAction = (panel, action) => {
    const btn = findButtonByLabel(panel, action);
    if (!btn) return false;
    btn.click();
    return true;
  };

  document.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    const panel = activeEl && activeEl.closest ? activeEl.closest(".cm-search") : null;
    if (!panel) return;

    const key = e.key;
    const isEnter = key === "Enter";
    const isF3 = key === "F3";
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    // Enter / Shift+Enter: next/previous match (standard behavior in many editors).
    if (isEnter && !ctrl && !alt) {
      e.preventDefault();
      e.stopPropagation();
      triggerPanelAction(panel, shift ? "previous" : "next");
      return;
    }

    // F3 / Shift+F3: next/previous match (common desktop shortcut).
    if (isF3 && !ctrl && !alt) {
      e.preventDefault();
      e.stopPropagation();
      triggerPanelAction(panel, shift ? "previous" : "next");
      return;
    }

    // Ctrl+Enter: replace (when replace UI is present).
    if (isEnter && ctrl && !alt && !shift) {
      e.preventDefault();
      e.stopPropagation();
      triggerPanelAction(panel, "replace");
      return;
    }

    // Ctrl+Shift+Enter OR Alt+Enter: replace all (avoid Ctrl+A which is "select all" in inputs).
    if (isEnter && ((ctrl && shift) || alt)) {
      e.preventDefault();
      e.stopPropagation();
      triggerPanelAction(panel, "replace all");
    }
  }, true);
}

function applySearchPanelHints(view) {
  if (!view) return;
  setTimeout(() => {
    const panel = view.dom.querySelector(".cm-search");
    if (!panel) return;
    try {
      const next = panel.querySelector("button[name='next']");
      if (next) next.title = "Next (Enter / F3)";
      const prev = panel.querySelector("button[name='prev']");
      if (prev) prev.title = "Previous (Shift+Enter / Shift+F3)";
      const all = panel.querySelector("button[name='select']");
      if (all) all.title = "Select all matches";
      const replaceBtn = panel.querySelector("button[name='replace']");
      if (replaceBtn) replaceBtn.title = "Replace (Ctrl+Enter)";
      const replaceAllBtn = panel.querySelector("button[name='replaceAll']");
      if (replaceAllBtn) replaceAllBtn.title = "Replace all (Ctrl+Shift+Enter / Alt+Enter)";
    } catch {}
  }, 0);
}

function initHeaderEditor() {
  if (headerEditorView || !$fileHeaderEditor) return;
  let headerRenderTimer = null;
  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (suppressHeaderDirty) return;
    headerDirty = true;
    updateHeaderStateUI();
    if (headerRenderTimer) clearTimeout(headerRenderTimer);
    headerRenderTimer = setTimeout(() => {
      headerRenderTimer = null;
      renderNow();
    }, 300);
  });
  const state = EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      abcHighlight,
      updateListener,
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
    ],
  });
  headerEditorView = new EditorView({
    state,
    parent: $fileHeaderEditor,
  });
}

function setActiveTuneText(text, metadata, options = {}) {
  if (activeErrorHighlight) clearActiveErrorHighlight("docReplaced");
  isNewTuneDraft = false;
  resetPlaybackState();
  suppressDirty = true;
  setEditorValue(text);
  suppressDirty = false;
  if (metadata) {
    activeTuneMeta = { ...metadata };
    activeFilePath = metadata.path || null;
    refreshHeaderLayers().catch(() => {});
    setTuneMetaText(buildTuneMetaLabel(metadata));
    setFileNameMeta(stripFileExtension(metadata.basename || ""));
    if (currentDoc) {
      currentDoc.path = metadata.path || null;
      currentDoc.content = text;
      currentDoc.dirty = false;
    } else {
      currentDoc = { path: metadata.path || null, dirty: false, content: text };
    }
    if (!options.suppressRecent && !suppressRecentEntries && window.api && typeof window.api.addRecentTune === "function") {
      window.api.addRecentTune({
        path: metadata.path,
        basename: metadata.basename,
        xNumber: metadata.xNumber,
        title: metadata.title || "",
        startLine: metadata.startLine,
        endLine: metadata.endLine,
        startOffset: metadata.startOffset,
        endOffset: metadata.endOffset,
      });
    }
    if (!options.suppressRecent && !suppressRecentEntries && window.api && typeof window.api.addRecentFile === "function") {
      window.api.addRecentFile({
        path: metadata.path,
        basename: metadata.basename,
      });
    }
    updateFileContext();
    setDirtyIndicator(false);
  } else {
    activeTuneMeta = null;
    activeTuneId = null;
    activeFilePath = null;
    isNewTuneDraft = false;
    refreshHeaderLayers().catch(() => {});
    setTuneMetaText("Untitled");
    setFileNameMeta("Untitled");
    if (currentDoc) {
      currentDoc.path = null;
      currentDoc.content = text || "";
      currentDoc.dirty = false;
    } else {
      currentDoc = { path: null, dirty: false, content: text || "" };
    }
    updateFileContext();
    setDirtyIndicator(false);
    headerDirty = false;
    updateHeaderStateUI();
  }
  updateFileHeaderPanel();
  renderNow();
}

function setLibraryVisible(visible) {
  isLibraryVisible = visible;
  document.body.classList.toggle("library-hidden", !visible);
  if (visible) {
    setPaneSizes(lastSidebarWidth || MIN_PANE_WIDTH);
  } else if ($main) {
    $main.style.gridTemplateColumns = `0px 0px 1fr`;
  }
}

function toggleLibrary() {
  setLibraryVisible(!isLibraryVisible);
}

function getGroupValue(tune, mode) {
  if (!tune) return "";
  if (mode === "x") return tune.xNumber || "";
  if (mode === "composer") return tune.composer || "";
  if (mode === "meter") return tune.meter || "";
  if (mode === "key") return tune.key || "";
  if (mode === "unit") return tune.unitLength || "";
  if (mode === "tempo") return tune.tempo || "";
  if (mode === "rhythm") return tune.rhythm || "";
  if (mode === "source") return tune.source || "";
  if (mode === "origin") return tune.origin || "";
  if (mode === "group") return tune.group || "";
  return "";
}

function buildGroupEntries(files, mode) {
  if (mode === "file") {
    return files.map((file) => ({
      id: file.path,
      label: file.basename,
      tunes: Array.isArray(file.tunes) ? file.tunes : [],
      isFile: true,
      updatedAtMs: file.updatedAtMs || 0,
    }));
  }

  const entries = new Map();
  for (const file of files) {
    const tunes = Array.isArray(file.tunes) ? file.tunes : [];
    for (const tune of tunes) {
      const value = getGroupValue(tune, mode) || "Unknown";
      const groupId = `${mode}:${value}`;
      if (!entries.has(groupId)) {
        entries.set(groupId, {
          id: groupId,
          label: `${GROUP_LABELS[mode]}: ${value}`,
          tunes: [],
          isFile: false,
          updatedAtMs: 0,
        });
      }
      entries.get(groupId).tunes.push(tune);
      const updatedAtMs = file.updatedAtMs || 0;
      const entry = entries.get(groupId);
      if (updatedAtMs > (entry.updatedAtMs || 0)) entry.updatedAtMs = updatedAtMs;
    }
  }
  return Array.from(entries.values());
}

function renderLibraryTree(files = null) {
  if (!$libraryTree) return;
  $libraryTree.style.display = "";
  $libraryTree.innerHTML = "";
  const sourceFiles = files || getVisibleLibraryFiles();
  const filteredFiles = libraryTextFilter
    ? applyLibraryTextFilter(sourceFiles, libraryTextFilter)
    : sourceFiles;
  const hasRenameTarget = renamingFilePath
    && filteredFiles
      .some((file) => file.path === renamingFilePath);
  if (renamingFilePath && !hasRenameTarget) renamingFilePath = null;
  const sortedFiles = sortLibraryFiles(filteredFiles);
  const entries = sortGroupEntries(buildGroupEntries(sortedFiles, groupMode));
  for (const entry of entries) {
    const fileNode = document.createElement("div");
    fileNode.className = "tree-file";
    if (entry.isFile && activeFilePath === entry.id) fileNode.classList.add("active");
    const isCollapsed = entry.isFile
      ? collapsedFiles.has(entry.id)
      : collapsedGroups.has(entry.id);
    if (isCollapsed) fileNode.classList.add("collapsed");

    if (entry.isFile && entry.id === renamingFilePath) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "tree-label tree-rename";
      input.value = entry.label || "";
      input.dataset.filePath = entry.id;
      input.addEventListener("keydown", async (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          await commitRenameFile(entry.id, input.value);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          renamingFilePath = null;
          renderLibraryTree(sourceFiles);
        }
      });
      input.addEventListener("blur", async () => {
        await commitRenameFile(entry.id, input.value);
      });
      fileNode.appendChild(input);
    } else {
      const fileLabel = document.createElement("button");
      fileLabel.type = "button";
      fileLabel.className = "tree-label tree-file-label";
      fileLabel.dataset.filePath = entry.id;
      const labelText = document.createElement("span");
      labelText.className = "tree-label-text";
      labelText.textContent = entry.label;
      const count = document.createElement("span");
      count.className = "tree-count";
      count.textContent = String(entry.tunes.length || 0);
      fileLabel.append(labelText, count);
      fileLabel.addEventListener("click", (ev) => {
        // Prevent accidental double-toggle when user double-clicks to load.
        if (entry.isFile && ev && ev.detail && ev.detail > 1) return;
        if (entry.isFile) {
          activeFilePath = entry.id;
          if (collapsedFiles.has(entry.id)) collapsedFiles.delete(entry.id);
          else collapsedFiles.add(entry.id);
        } else {
          if (collapsedGroups.has(entry.id)) collapsedGroups.delete(entry.id);
          else collapsedGroups.add(entry.id);
        }
        renderLibraryTree(sourceFiles);
      });
      fileLabel.addEventListener("dblclick", (ev) => {
        if (!entry.isFile) return;
        ev.preventDefault();
        ev.stopPropagation();
        requestLoadLibraryFile(entry.id).catch(() => {});
      });
      fileLabel.addEventListener("contextmenu", (ev) => {
        if (!entry.isFile) return;
        ev.preventDefault();
        activeFilePath = entry.id;
        renderLibraryTree(sourceFiles);
        showContextMenuAt(ev.clientX, ev.clientY, { type: "file", filePath: entry.id });
      });
      fileLabel.addEventListener("dragover", (ev) => {
        if (!entry.isFile) return;
        ev.preventDefault();
        fileLabel.classList.add("drop-target");
      });
      fileLabel.addEventListener("dragleave", () => {
        fileLabel.classList.remove("drop-target");
      });
      fileLabel.addEventListener("drop", async (ev) => {
        if (!entry.isFile) return;
        ev.preventDefault();
        fileLabel.classList.remove("drop-target");
        const tuneId = ev.dataTransfer.getData("text/plain");
        if (!tuneId) return;
        const res = findTuneById(tuneId);
        if (!res) return;
        try {
          const text = await getTuneText(res.tune, res.file);
          clipboardTune = {
            text,
            sourcePath: res.file.path,
            tuneId,
            mode: "move",
          };
          await pasteClipboardToFile(entry.id);
        } catch (e) {
          await showSaveError(e && e.message ? e.message : String(e));
        }
      });
      fileNode.appendChild(fileLabel);
    }

    const children = document.createElement("div");
    children.className = "tree-children";

    for (const tune of entry.tunes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tree-label tune-label";
      button.draggable = true;
      const labelNumber = tune.xNumber || String(tune.indexInFile);
      const title = tune.title || tune.preview || "";
      const composer = tune.composer ? ` - ${tune.composer}` : "";
      const key = tune.key ? ` - ${tune.key}` : "";
      button.textContent = `${labelNumber}: ${title}${composer}${key}`.trim();
      button.dataset.tuneId = tune.id;
      if (tune.id === activeTuneId) button.classList.add("active");
      button.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData("text/plain", tune.id);
        ev.dataTransfer.effectAllowed = "move";
      });
      button.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        const targetPath = entry.isFile
          ? entry.id
          : String(tune.id || "").split("::")[0];
	        if (targetPath) {
	          activeFilePath = targetPath;
	          renderLibraryTree(sourceFiles);
	        }
	        showContextMenuAt(ev.clientX, ev.clientY, { type: "tune", tuneId: tune.id });
	      });
      button.addEventListener("click", () => {
        const targetPath = entry.isFile
          ? entry.id
          : String(tune.id || "").split("::")[0];
	        if (targetPath) {
	          activeFilePath = targetPath;
	          renderLibraryTree(sourceFiles);
	        }
	        selectTune(tune.id);
	      });
      children.appendChild(button);
    }

    fileNode.appendChild(children);
    $libraryTree.appendChild(fileNode);
  }
  updateFileHeaderPanel();
}

function markActiveTuneButton(tuneId) {
  if ($libraryTree) {
    const buttons = $libraryTree.querySelectorAll(".tree-label");
    for (const btn of buttons) {
      if (btn.dataset && btn.dataset.tuneId) {
        btn.classList.toggle("active", btn.dataset.tuneId === tuneId);
      }
    }
  }
}

async function selectTune(tuneId, options = {}) {
  if (!libraryIndex || !tuneId) return;
  if (!options.skipConfirm) {
    const ok = await ensureSafeToAbandonCurrentDoc("switching tunes");
    if (!ok) return { ok: false, cancelled: true };
  }
  let selected = null;
  let fileMeta = null;

  for (const file of libraryIndex.files) {
    const found = file.tunes.find((t) => t.id === tuneId);
    if (found) {
      selected = found;
      fileMeta = file;
      break;
    }
  }

  if (!selected || !fileMeta) return { ok: false, error: "Tune not found." };

  let content = fileContentCache.get(fileMeta.path);
  if (content == null) {
    const res = await readFile(fileMeta.path);
    if (!res.ok) {
      logErr(res.error || "Unable to read file.");
      return { ok: false, error: res.error || "Unable to read file." };
    }
    content = res.data;
    fileContentCache.set(fileMeta.path, content);
  }

  const tuneText = content.slice(selected.startOffset, selected.endOffset);
  activeTuneId = tuneId;
  markActiveTuneButton(tuneId);
  setActiveTuneText(tuneText, {
    id: selected.id,
    path: fileMeta.path,
    basename: fileMeta.basename,
    xNumber: selected.xNumber,
    title: selected.title || "",
    startLine: selected.startLine,
    endLine: selected.endLine,
    startOffset: selected.startOffset,
    endOffset: selected.endOffset,
  }, { suppressRecent: options.suppressRecent || false });
  setDirtyIndicator(false);
  return { ok: true };
}

// Canonical Library Tree open entrypoint: `selectTune(tuneId)`.
// This wrapper reuses the same loading/confirm logic for the modal.
async function openTuneFromLibrarySelection(selection) {
  if (!selection) {
    const msg = "No selection.";
    logErr(msg);
    return { ok: false, error: msg };
  }

  const normalizeLibraryPath = (input) => {
    let value = String(input || "").trim();
    if (!value) return "";
    value = value.replace(/\\/g, "/");
    value = value.replace(/^\.\//, "");
    value = value.replace(/\/{2,}/g, "/");
    return value;
  };

  const filePath = selection.filePath || selection.path || null;
  const tuneId = selection.tuneId || selection.id || null;
  const tuneNo = selection.tuneNo != null ? String(selection.tuneNo) : null;
  const xNumber = selection.xNumber != null ? String(selection.xNumber) : null;

  if (!filePath) {
    const msg = "Cannot open selection: missing file path (row may be demo data).";
    logErr(msg);
    return { ok: false, error: msg };
  }
  if (!tuneId && !tuneNo && !xNumber) {
    const msg = "Cannot open selection: missing tune id/number.";
    logErr(msg);
    return { ok: false, error: msg };
  }

  const wantedPath = normalizeLibraryPath(filePath);

  const ok = await ensureSafeToAbandonCurrentDoc("opening a library tune");
  if (!ok) return { ok: false, cancelled: true };

  const dir = safeDirname(filePath);
  if (!dir) {
    const msg = "Invalid file path.";
    logErr(msg);
    return { ok: false, error: msg };
  }

  const findFileEntry = () => {
    if (!libraryIndex || !Array.isArray(libraryIndex.files)) return null;
    return libraryIndex.files.find((f) => normalizeLibraryPath(f && f.path) === wantedPath) || null;
  };

  let fileEntry = findFileEntry();
  if (!fileEntry) {
    await loadLibraryFromFolder(dir);
    if (!libraryIndex || !Array.isArray(libraryIndex.files)) {
      const msg = "Library not loaded.";
      logErr(msg);
      return { ok: false, error: msg };
    }
    fileEntry = findFileEntry();
  }
  if (!fileEntry) {
    const msg = `File not found in library: ${filePath}`;
    logErr(msg);
    return { ok: false, error: msg };
  }

  let tune = null;
  if (tuneId) tune = (fileEntry.tunes || []).find((t) => t.id === tuneId) || null;
  if (!tune && tuneNo) {
    tune = (fileEntry.tunes || []).find((t) => String(t.xNumber || "") === tuneNo) || null;
  }
  if (!tune && xNumber) {
    tune = (fileEntry.tunes || []).find((t) => String(t.xNumber || "") === xNumber) || null;
  }
  if (!tune) {
    const msg = `Tune not found in file: ${safeBasename(filePath)}${tuneNo ? ` (X:${tuneNo})` : (xNumber ? ` (X:${xNumber})` : "")}`;
    logErr(msg);
    return { ok: false, error: msg };
  }

  const res = await selectTune(tune.id, { skipConfirm: true });
  if (res && res.ok) return { ok: true };
  if (res && res.cancelled) return { ok: false, cancelled: true };
  return { ok: false, error: (res && res.error) ? res.error : "Unable to open tune." };
}

window.openTuneFromLibrarySelection = openTuneFromLibrarySelection;

async function openRecentTune(entry) {
  if (!entry || !entry.path) return;
  const ok = await ensureSafeToAbandonCurrentDoc("opening a recent tune");
  if (!ok) return;

  const dir = safeDirname(entry.path);
  await loadLibraryFromFolder(dir);
  if (libraryIndex && libraryIndex.files) {
    const id = `${entry.path}::${entry.startOffset || 0}`;
    const fileEntry = libraryIndex.files.find((f) => f.path === entry.path);
    const tune = fileEntry ? fileEntry.tunes.find((t) => t.id === id) : null;
    if (tune) {
      await selectTune(tune.id);
      return;
    }
  }
  const res = await readFile(entry.path);
  if (!res.ok) {
    logErr(res.error || "Unable to read file.");
    return;
  }
  fileContentCache.set(entry.path, res.data);
  const startOffset = entry.startOffset || 0;
  const endOffset = entry.endOffset || res.data.length;
  const tuneText = res.data.slice(startOffset, endOffset);
  setActiveTuneText(tuneText, {
    id: `${entry.path}::${startOffset}`,
    path: entry.path,
    basename: entry.basename || safeBasename(entry.path),
    xNumber: entry.xNumber || "",
    title: entry.title || "",
    startLine: entry.startLine || 1,
    endLine: entry.endLine || countLines(tuneText),
    startOffset,
    endOffset,
  });
  setDirtyIndicator(false);
}

async function openRecentFile(entry) {
  if (!entry || !entry.path) return;
  const ok = await ensureSafeToAbandonCurrentDoc("opening a recent file");
  if (!ok) return;
  await loadLibraryFileIntoEditor(entry.path);
}

async function openRecentFolder(entry) {
  if (!entry || !entry.path) return;
  const ok = await ensureSafeToAbandonCurrentDoc("opening a recent folder");
  if (!ok) return;
  await loadLibraryFromFolder(entry.path);
}

async function scanAndLoadLibrary() {
  if (!window.api) return;
  const ok = await ensureSafeToAbandonCurrentDoc("opening a folder");
  if (!ok) return;
  const folder = await showOpenFolderDialog();
  if (!folder) return;

  await loadLibraryFromFolder(folder);
  if (window.api && typeof window.api.addRecentFolder === "function") {
    window.api.addRecentFolder({ path: folder, label: folder });
  }
}

async function refreshLibraryIndex() {
  if (!window.api || typeof window.api.scanLibrary !== "function") return;
  if (!libraryIndex || !libraryIndex.root) {
    setStatus("Load a library folder first.");
    return;
  }
  setScanStatus("Refreshing…");
  fileContentCache.clear();
  libraryErrorIndex.clear();
  if (libraryIndex && libraryIndex.root) {
    setFileNameMeta(stripFileExtension(safeBasename(libraryIndex.root)));
  }
  try {
    const result = await window.api.scanLibrary(libraryIndex.root);
    libraryIndex = result || { root: libraryIndex.root, files: [] };
	    if (libraryFilterLabel) {
	      clearLibraryFilter();
	    } else {
	      renderLibraryTree();
	      updateLibraryStatus();
	    }
	  } catch (e) {
	    setScanStatus("Refresh failed.");
	    logErr(e && e.message ? e.message : String(e));
  }
}

async function loadLibraryFromFolder(folder) {
  if (!window.api || !folder) return;
  setScanStatus("Scanning…");
  fileContentCache.clear();
  libraryErrorIndex.clear();
  activeTuneId = null;
  setTuneMetaText("No tune selected.");
  setFileNameMeta(stripFileExtension(safeBasename(folder || "")));
  suppressDirty = true;
  setEditorValue("");
  suppressDirty = false;
  if (currentDoc) {
    currentDoc.path = null;
    currentDoc.content = "";
    currentDoc.dirty = false;
  }
  setDirtyIndicator(false);

  try {
    const result = await window.api.scanLibrary(folder);
    libraryIndex = result || { root: folder, files: [] };
    clearLibraryFilter();
    collapsedFiles.clear();
    collapsedGroups.clear();
    activeFilePath = null;
    if (groupMode === "file") {
      for (const file of libraryIndex.files || []) {
        collapsedFiles.add(file.path);
      }
	    } else {
	      const groups = buildGroupEntries(libraryIndex.files || [], groupMode);
	      for (const group of groups) collapsedGroups.add(group.id);
	    }
	    renderLibraryTree();
	    let firstTuneId = null;
	    for (const file of libraryIndex.files || []) {
	      if (file.tunes && file.tunes.length) {
	        firstTuneId = file.tunes[0].id;
        break;
      }
    }
    if (firstTuneId) {
      await selectTune(firstTuneId);
    }
    updateLibraryStatus();
  } catch (e) {
    setScanStatus("Scan failed");
    logErr((e && e.stack) ? e.stack : String(e));
  }
}

async function loadLibraryFileIntoEditor(filePath) {
  if (!filePath) return { ok: false, error: "Missing file path." };
  const resolveFromIndex = async () => {
    if (!libraryIndex || !libraryIndex.files) return { ok: false };
    const fileEntry = libraryIndex.files.find((f) => f.path === filePath) || null;
    if (!fileEntry) return { ok: false };
    if (fileEntry.tunes && fileEntry.tunes.length) {
      await selectTune(fileEntry.tunes[0].id);
      return { ok: true };
    }
    return { ok: false, error: `No tunes found in file: ${safeBasename(filePath)}` };
  };

  const inMemory = await resolveFromIndex();
  if (inMemory.ok) return inMemory;

  const dir = safeDirname(filePath);
  await loadLibraryFromFolder(dir);
  const afterLoad = await resolveFromIndex();
  if (afterLoad.ok) return afterLoad;
  return { ok: false, error: afterLoad.error || `File not found in library: ${safeBasename(filePath)}` };
}

async function requestLoadLibraryFile(filePath) {
  if (!filePath) {
    showToast("No file selected.", 2400);
    return false;
  }
  const ok = await ensureSafeToAbandonCurrentDoc("loading another file");
  if (!ok) return false;
  try {
    const res = await loadLibraryFileIntoEditor(filePath);
    if (res && res.ok) return true;
    const msg = res && res.error ? res.error : "Unable to load file.";
    logErr(msg);
    showToast(msg, 3000);
    return false;
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    logErr(msg);
    showToast("Unable to load file.", 3000);
    return false;
  }
}

if ($btnToggleLibrary) {
  $btnToggleLibrary.addEventListener("click", () => {
    openLibraryListFromCurrentLibraryIndex();
  });
}

if ($errorsIndicator) {
  $errorsIndicator.addEventListener("click", () => {
    if ($errorsIndicator.disabled) return;
    toggleErrorsPopover(!errorsPopoverOpen);
  });
}

document.addEventListener("click", (e) => {
  if (!errorsPopoverOpen) return;
  const target = e.target;
  if ($errorsPopover && $errorsPopover.contains(target)) return;
  if ($errorsIndicator && $errorsIndicator.contains(target)) return;
  toggleErrorsPopover(false);
}, true);

document.addEventListener("keydown", (e) => {
  if (!errorsPopoverOpen) return;
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  toggleErrorsPopover(false);
}, true);

if ($errorsListPopover) {
  $errorsListPopover.addEventListener("click", (e) => {
    const row = e.target && e.target.closest ? e.target.closest(".errors-row") : null;
    if (!row || !row.dataset) return;
    const idx = Number(row.dataset.index);
    const item = Number.isFinite(idx) ? lastErrors[idx] : null;
    if (!item) return;
    toggleErrorsPopover(false);
    jumpToError(item).catch(() => {});
  });
}

if ($groupBy) {
  $groupBy.addEventListener("change", () => {
    groupMode = $groupBy.value || "file";
    collapsedGroups.clear();
    const savedSort = groupSortPrefs.get(groupMode);
    if (savedSort) {
      setSortMode(savedSort, false);
    } else {
      maybeAutoSortForGroup(groupMode);
    }
	    if (libraryIndex && libraryIndex.files) {
	      if (groupMode === "file") {
	        collapsedFiles.clear();
	        for (const file of libraryIndex.files) collapsedFiles.add(file.path);
	      } else {
	        const groups = buildGroupEntries(libraryIndex.files, groupMode);
	        for (const group of groups) collapsedGroups.add(group.id);
	      }
	      renderLibraryTree();
	    }
	  });
	}

if ($sortBy) {
  if ($sortBy.value) sortMode = $sortBy.value;
	  $sortBy.addEventListener("change", () => {
	    sortMode = $sortBy.value || "update_desc";
	    sortModeIsAuto = false;
	    groupSortPrefs.set(groupMode, sortMode);
	    renderLibraryTree();
	  });
	}

if ($librarySearch) {
  $librarySearch.addEventListener("input", () => {
    scheduleLibrarySearch($librarySearch.value || "");
  });
  $librarySearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      libraryTextFilter = "";
      $librarySearch.value = "";
	      if (librarySearchTimer) {
	        clearTimeout(librarySearchTimer);
	        librarySearchTimer = null;
	      }
	      renderLibraryTree();
	      updateLibraryStatus();
	      e.preventDefault();
	    }
	  });
	}

if ($scanErrorTunes) {
  $scanErrorTunes.addEventListener("click", () => {
    if (!errorsEnabled) {
      showToast("Errors disabled");
      return;
    }
    if (tuneErrorScanInFlight) return;
    const entry = getActiveFileEntry();
    if (!entry) return;
    clearErrors();
    if (tuneErrorFilter) {
      tuneErrorFilter = false;
      tuneErrorScanToken += 1;
      buildTuneSelectOptions(entry);
      setScanErrorButtonActive(false);
      updateLibraryStatus();
      return;
    }
    tuneErrorFilter = true;
    tuneErrorScanToken += 1;
    tuneErrorScanInFlight = true;
    buildTuneSelectOptions(entry);
    setScanErrorButtonActive(true);
    scanActiveFileForTuneErrors(entry).catch(() => {});
    updateLibraryStatus();
  });
}

if ($btnLibraryMenu) {
  $btnLibraryMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = $btnLibraryMenu.getBoundingClientRect();
    showContextMenuAt(rect.right, rect.bottom, { type: "library" });
    e.preventDefault();
  });
}

if ($btnFileNew) {
  $btnFileNew.addEventListener("click", async () => {
    try { await fileNew(); } catch (e) { logErr((e && e.stack) ? e.stack : String(e)); }
  });
}
if ($btnFileOpen) {
  $btnFileOpen.addEventListener("click", async () => {
    try { await fileOpen(); } catch (e) { logErr((e && e.stack) ? e.stack : String(e)); }
  });
}
if ($btnFileSave) {
  $btnFileSave.addEventListener("click", async () => {
    try { await fileSave(); } catch (e) { logErr((e && e.stack) ? e.stack : String(e)); }
  });
}
if ($btnFileClose) {
  $btnFileClose.addEventListener("click", async () => {
    try { await fileClose(); } catch (e) { logErr((e && e.stack) ? e.stack : String(e)); }
  });
}

if ($fileTuneSelect) {
  $fileTuneSelect.addEventListener("change", () => {
    const tuneId = $fileTuneSelect.value;
    if (tuneId === "__new__") return;
    if (isNewTuneDraft) isNewTuneDraft = false;
    if (tuneId) selectTune(tuneId);
  });
}

if (window.api && typeof window.api.onLibraryProgress === "function") {
  let scanStatusClearTimer = null;
  window.api.onLibraryProgress((payload) => {
    if (!payload) return;
    if (payload.phase === "discover") {
      if (scanStatusClearTimer) {
        clearTimeout(scanStatusClearTimer);
        scanStatusClearTimer = null;
      }
      setScanStatus(`Scanning… ${payload.filesFound || 0} files`);
    } else if (payload.phase === "parse") {
      const total = payload.total || 0;
      const index = payload.index || 0;
      setScanStatus(`Indexing… ${index}/${total}`);
      if (total > 0 && index >= total) {
        if (scanStatusClearTimer) clearTimeout(scanStatusClearTimer);
        scanStatusClearTimer = setTimeout(() => {
          scanStatusClearTimer = null;
          setScanStatus("");
        }, 600);
      }
    }
  });
}

function createBlankDocument() {
  return {
    path: null,
    dirty: false,
    content: DEFAULT_ABC,
  };
}

// debounce
let t = null;

function setStatus(s) {
  $status.textContent = s;
  const loading = String(s || "").toLowerCase().startsWith("loading the sound font");
  $status.classList.toggle("status-loading", loading);
}

function setBufferStatus(text) {
  if (!$bufferStatus) return;
  $bufferStatus.textContent = text || "";
}

function formatDefaultLenText(defaultLen) {
  if (defaultLen === "mcm_default") return "mcm_default";
  if (!Number.isFinite(defaultLen)) return "?";
  const inv = Math.round(1 / defaultLen);
  if (Number.isFinite(inv) && inv > 0) return `1/${inv}`;
  return String(defaultLen);
}

function parseMeterParts(abc) {
  const match = String(abc || "").match(/^M:\s*(\d+)\s*\/\s*(\d+)/m);
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return null;
  return { num, den };
}

function formatMeterInfo(abc) {
  const parts = parseMeterParts(abc);
  if (!parts) return { text: "M: (unknown)", expectedWhole: null, expectedUnits: null };
  const expectedWhole = parts.num / parts.den;
  const beatsText = `${parts.num}×1/${parts.den}`;
  const compoundText = (parts.den === 8 && parts.num > 3 && parts.num % 3 === 0)
    ? `; compound: ${parts.num / 3}×3/8`
    : "";
  return {
    text: `M:${parts.num}/${parts.den} (beats: ${beatsText}${compoundText})`,
    expectedWhole,
  };
}

function computeMeasureStatsAt(editorText, anchorOffset) {
  if (!editorText || !Number.isFinite(anchorOffset)) return null;
  const range = findMeasureRangeAt(editorText, anchorOffset);
  if (!range) return null;
  const defaultLen = getDefaultLen(editorText);
  const metre = getMetre(editorText);
  const meterInfo = formatMeterInfo(editorText);
  const slice = editorText.slice(range.start, range.end);
  const actualWhole = getBarLength(slice, defaultLen, metre);
  const expectedWhole = meterInfo.expectedWhole;

  let actualUnits = null;
  let expectedUnits = null;
  if (defaultLen !== "mcm_default" && Number.isFinite(defaultLen) && defaultLen > 0) {
    actualUnits = Number.isFinite(actualWhole) ? actualWhole / defaultLen : null;
    expectedUnits = Number.isFinite(expectedWhole) ? expectedWhole / defaultLen : null;
  }

  return {
    meterInfo,
    defaultLen,
    range,
    actualWhole,
    expectedWhole,
    actualUnits,
    expectedUnits,
  };
}

function setErrorFocusMessage(entry, from) {
  if (!$errorsFocusMessage) return;
  if (!editorView) return;
  const navItems = getSortedErrorsForNav();
  const navId = computeErrorId(entry);
  const navIdx = navId ? navItems.findIndex((x) => x.id === navId) : -1;
  const navPrefix = (navIdx !== -1 && navItems.length) ? `${navIdx + 1}/${navItems.length} ` : "";

  const text = editorView.state.doc.toString();
  const parts = parseMeterParts(text);
  const stats = computeMeasureStatsAt(text, from);

  let msg = entry && entry.message ? String(entry.message) : "";
  // Strip abc2svg location prefixes like "out:35:67 Error:" and any X:... wrapper.
  msg = msg.replace(/^\s*\w+:\d+:\d+\s+/i, "").trim();
  msg = msg.replace(/^\s*(warning|error)\s*:\s*/i, "").trim();
  msg = msg.replace(/^\s*X:\s*\d+\s+[^:]*:\s*/i, "").trim();
  msg = msg.replace(/\s+\(abc2svg\)\s*$/i, "").trim();

  let out = "";
  if (parts && stats && Number.isFinite(stats.actualWhole)) {
    const expectedBeats = parts.num;
    const actualBeats = stats.actualWhole * parts.den;
    const diff = actualBeats - expectedBeats;
    if (Number.isFinite(diff) && Math.abs(diff) >= 0.01) {
      out = `Beats: ${actualBeats.toFixed(2)} (expected ${expectedBeats}, Δ ${diff.toFixed(2)})`;
    }
  }
  if (msg) {
    out = out ? `${out} — ${msg}` : msg;
  }

  const final = out ? `${navPrefix}${out}`.trim() : "";
  $errorsFocusMessage.textContent = final;
  $errorsFocusMessage.hidden = !final;
  $errorsFocusMessage.title = msg || "";
}

function clearErrorFocusMessage() {
  if (!$errorsFocusMessage) return;
  $errorsFocusMessage.textContent = "";
  $errorsFocusMessage.hidden = true;
  $errorsFocusMessage.title = "";
}

function showToast(message, durationMs = 4000) {
  if (!$toast) return;
  $toast.textContent = message || "";
  $toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $toast.classList.remove("show");
    toastTimer = null;
  }, durationMs);
}

function normalizeErrors(entries) {
  const out = [];
  const list = Array.isArray(entries) ? entries : [];
  for (const entry of list) {
    if (!entry) continue;
    const count = entry.count && entry.count > 1 ? entry.count : 1;
    const msg = entry.message ? String(entry.message) : "Unknown error";
    const message = count > 1 ? `${msg} ×${count}` : msg;
    const tuneKey = entry.tuneId || entry.xNumber || "";
    const tuneTitle = entry.tuneLabel || entry.title || "Untitled";
    const loc = entry.loc ? { line: entry.loc.line, col: entry.loc.col } : null;
    const measureRange = entry.measureRange && Number.isFinite(entry.measureRange.start) && Number.isFinite(entry.measureRange.end)
      ? { start: entry.measureRange.start, end: entry.measureRange.end }
      : null;
    out.push({
      tuneKey,
      tuneId: entry.tuneId || null,
      filePath: entry.filePath || null,
      tuneTitle,
      message,
      source: "abc2svg",
      loc,
      measureRange,
      errorStartOffset: measureRange ? measureRange.start : null,
      errorEndOffset: measureRange ? measureRange.end : null,
    });
  }
  return out;
}

function updateErrorsIndicatorAndPopover() {
  if (!errorsEnabled) {
    if ($errorsIndicator) {
      $errorsIndicator.textContent = "Errors: 0";
      $errorsIndicator.disabled = true;
      $errorsIndicator.hidden = true;
    }
    if ($errorsFocusMessage) {
      $errorsFocusMessage.textContent = "";
      $errorsFocusMessage.hidden = true;
    }
    if (errorsPopoverOpen) toggleErrorsPopover(false);
    return;
  }
  const n = lastErrors.length;
  if ($errorsIndicator) {
    $errorsIndicator.textContent = `Errors: ${n}`;
    $errorsIndicator.disabled = n === 0;
    $errorsIndicator.hidden = n === 0;
  }
  if (errorsPopoverOpen && n === 0) {
    toggleErrorsPopover(false);
    return;
  }
  if (errorsPopoverOpen) {
    renderErrorsPopoverList();
    positionErrorsPopover();
  }
}

function setScanErrors(errorsArray) {
  lastErrors = normalizeErrors(errorsArray);
  updateErrorsIndicatorAndPopover();
  syncActiveErrorNavIndex();
}

function reconcileActiveErrorHighlightAfterRender({ renderSucceeded = false } = {}) {
  if (!activeErrorHighlight || !editorView) return;
  if (!Array.isArray(errorEntries) || !errorEntries.length) {
    // Only clear when we know a render completed and produced no errors.
    if (renderSucceeded) {
      clearActiveErrorHighlight("resolved");
    }
    return;
  }
  const candidates = errorEntries.filter((e) => {
    if (!e) return false;
    if (activeErrorHighlight.tuneId && e.tuneId && e.tuneId !== activeErrorHighlight.tuneId) return false;
    if (activeErrorHighlight.filePath && e.filePath && e.filePath !== activeErrorHighlight.filePath) return false;
    return normalizeErrorMessageForMatch(e.message || "") === String(activeErrorHighlight.messageKey || "");
  });
  if (!candidates.length) {
    clearActiveErrorHighlight("resolved");
    return;
  }

  const toRange = (entry) => {
    if (entry.measureRange && Number.isFinite(entry.measureRange.start) && Number.isFinite(entry.measureRange.end) && entry.measureRange.end > entry.measureRange.start) {
      return { from: entry.measureRange.start, to: entry.measureRange.end };
    }
    if (entry.loc && Number.isFinite(entry.loc.line)) {
      const pos = getEditorIndexFromLoc(entry.loc);
      if (Number.isFinite(pos)) {
        const max = editorView.state.doc.length;
        return { from: pos, to: Math.min(pos + 1, max) };
      }
    }
    return null;
  };

  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const r = toRange(c);
    if (!r) continue;
    const dist = Math.abs(r.from - activeErrorHighlight.from);
    if (dist < bestDist) {
      bestDist = dist;
      best = { entry: c, range: r };
    }
  }
  if (!best) return;

  const from = Number(best.range.from);
  const to = Number(best.range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
  if (from !== activeErrorHighlight.from || to !== activeErrorHighlight.to) {
    setActiveErrorHighlight(best.entry, from, to);
    highlightSvgAtEditorOffset(from);
  } else {
    setErrorFocusMessage(best.entry, from);
  }
}

function renderErrorsPopoverList() {
  if (!$errorsListPopover) return;
  $errorsListPopover.textContent = "";
  if (!lastErrors.length) return;
  const activeId = activeErrorHighlight && activeErrorHighlight.id ? String(activeErrorHighlight.id) : "";
  for (let i = 0; i < lastErrors.length; i += 1) {
    const err = lastErrors[i];
    const row = document.createElement("div");
    row.className = "errors-row";
    const rowId = computeErrorId(err);
    if (rowId && activeId && rowId === activeId) row.classList.add("active");
    row.dataset.index = String(i);
    const label = err.tuneTitle ? String(err.tuneTitle) : "Untitled";
    const source = err.source ? ` (${err.source})` : "";
    row.textContent = `${label} — ${err.message}${source}`;
    $errorsListPopover.appendChild(row);
  }
  if ($errorsPopoverTitle) {
    $errorsPopoverTitle.textContent = `Errors (${lastErrors.length})`;
  }
}

function positionErrorsPopover() {
  if (!$errorsPopover || !$errorsIndicator) return;
  const rect = $errorsIndicator.getBoundingClientRect();
  const pop = $errorsPopover;
  const margin = 10;

  pop.style.left = "0px";
  pop.style.top = "0px";
  pop.style.maxHeight = "min(320px, calc(100vh - 24px))";

  const popRect = pop.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;

  let left = rect.left;
  left = Math.max(margin, Math.min(vw - margin - popRect.width, left));

  let top = rect.top - popRect.height - 8;
  if (top < margin) {
    top = rect.bottom + 8;
  }
  top = Math.max(margin, Math.min(vh - margin - popRect.height, top));

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function toggleErrorsPopover(open) {
  const wantOpen = Boolean(open);
  if (wantOpen && lastErrors.length === 0) return;
  errorsPopoverOpen = wantOpen;
  if (!$errorsPopover) return;
  $errorsPopover.classList.toggle("hidden", !wantOpen);
  if (wantOpen) {
    renderErrorsPopoverList();
    positionErrorsPopover();
  }
}

async function jumpToError(errItem) {
  if (!errItem) return;
  if (!errorsEnabled) {
    showToast("Errors disabled");
    return;
  }
  const targetFilePath = errItem.filePath || null;
  const targetTuneId = errItem.tuneId || null;
  if (targetFilePath && targetTuneId && typeof window.openTuneFromLibrarySelection === "function") {
    const res = await window.openTuneFromLibrarySelection({ filePath: targetFilePath, tuneId: targetTuneId });
    if (!res || !res.ok) return;
  } else if (targetTuneId) {
    await selectTune(targetTuneId);
  }

  if (!editorView) return;
  const doc = editorView.state.doc;
  const docLen = doc.length;
  let errorStartOffset = Number(errItem.errorStartOffset);
  let errorEndOffset = Number(errItem.errorEndOffset);
  if (!Number.isFinite(errorStartOffset) || !Number.isFinite(errorEndOffset) || errorEndOffset <= errorStartOffset) {
    // Fallback for errors that don't have measureRange: use line/col location if available.
    const loc = errItem.loc || null;
    if (loc && Number.isFinite(loc.line)) {
      const lineNo = Math.max(1, Math.min(doc.lines, Number(loc.line)));
      const line = doc.line(lineNo);
      const col = Number.isFinite(loc.col) ? Math.max(1, Number(loc.col)) : 1;
      const pos = Math.max(line.from, Math.min(line.to, line.from + col - 1));
      errorStartOffset = pos;
      errorEndOffset = Math.max(
        Math.min(line.to, pos + 16),
        Math.min(pos + 1, docLen)
      );
    }
  }
  if (!Number.isFinite(errorStartOffset) || !Number.isFinite(errorEndOffset) || errorEndOffset <= errorStartOffset) {
    console.error("[abcarus] Error activation missing/invalid offsets:", {
      errorStartOffset: errItem.errorStartOffset,
      errorEndOffset: errItem.errorEndOffset,
      loc: errItem.loc || null,
    });
    return;
  }
  if (errorStartOffset < 0 || errorEndOffset > docLen) {
    console.error("[abcarus] Error activation offsets out of bounds:", { errorStartOffset, errorEndOffset, docLen });
    return;
  }
  pendingPlaybackRangeOrigin = "error";
  setActiveErrorHighlight(errItem, errorStartOffset, errorEndOffset);
  suppressErrorActivationClear = true;
  const effects = [];
  if (typeof EditorView.scrollIntoView === "function") {
    try {
      effects.push(EditorView.scrollIntoView(errorStartOffset, { y: "center" }));
    } catch {}
  }
  editorView.dispatch({
    selection: EditorSelection.cursor(errorStartOffset),
    effects,
    scrollIntoView: true,
  });
  setTimeout(() => { suppressErrorActivationClear = false; }, 0);
  editorView.focus();

  // Best-effort: scroll notation to the same location.
  if (!highlightSvgAtEditorOffset(errorStartOffset)) {
    requestAnimationFrame(() => { highlightSvgAtEditorOffset(errorStartOffset); });
  }

  const msg = String(errItem.message || "");
  if (/bad measure duration/i.test(msg)) {
    applyPlaybackRangeFromError({ ...errItem, errorStartOffset, errorEndOffset });
  }
}

function suggestPlaybackRangeForRhythmError(errItem) {
  if (!editorView || !errItem) return null;
  const docLen = editorView.state.doc.length;
  const start = Number(errItem.errorStartOffset);
  const end = Number(errItem.errorEndOffset);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0 || start > docLen || end > docLen || end <= start) return null;

  const coverageOk = (suggestedStart, suggestedEnd, method) => {
    const ok = suggestedStart <= start && suggestedEnd >= end && suggestedStart < suggestedEnd;
    if (!ok) {
      console.error(
        "[abcarus] Rhythm error PlaybackRange coverage failed:",
        { method, errorStart: start, errorEnd: end, suggestedStart, suggestedEnd }
      );
    }
    return ok;
  };

  const src = editorView.state.doc.toString();
  const base = findMeasureRangeAt(src, Math.max(0, Math.min(docLen - 1, start)));
  if (!base) {
    const pad = 240;
    const windowStart = Math.max(0, start - pad);
    const windowEnd = Math.min(docLen, end + pad);
    let suggestedStart = windowStart;
    let suggestedEnd = windowEnd;

    const startProbe = Math.max(windowStart, Math.min(docLen, start));
    const startSlice = src.slice(windowStart, Math.min(docLen, startProbe + 1));
    const barStartLocal = startSlice.lastIndexOf("|");
    if (barStartLocal !== -1) {
      suggestedStart = windowStart + barStartLocal;
    } else {
      const nlStartLocal = startSlice.lastIndexOf("\n");
      if (nlStartLocal !== -1) suggestedStart = windowStart + nlStartLocal;
    }

    const endProbe = Math.max(0, Math.min(docLen, end));
    const endSlice = src.slice(endProbe, windowEnd);
    const barEndLocal = endSlice.indexOf("|");
    if (barEndLocal !== -1) {
      suggestedEnd = Math.min(docLen, endProbe + barEndLocal);
    } else {
      const nlEndLocal = endSlice.indexOf("\n");
      if (nlEndLocal !== -1) suggestedEnd = Math.min(docLen, endProbe + nlEndLocal);
    }

    suggestedStart = Math.max(0, Math.min(suggestedStart, docLen));
    suggestedEnd = Math.max(0, Math.min(suggestedEnd, docLen));
    if (suggestedEnd <= suggestedStart) {
      suggestedStart = windowStart;
      suggestedEnd = windowEnd;
    }
    if (!coverageOk(suggestedStart, suggestedEnd, "fallback")) return null;
    return {
      startOffset: suggestedStart,
      endOffset: suggestedEnd,
      origin: "error",
      loop: true,
      suggestedMethod: "fallback",
    };
  }

  const prev = base.start > 0 ? findMeasureRangeAt(src, base.start - 1) : null;
  const next = base.end < docLen ? findMeasureRangeAt(src, base.end + 1) : null;

  const startOffset = Math.min(prev ? prev.start : base.start, base.start);
  const endOffset = Math.max(next ? next.end : base.end, base.end);
  if (!coverageOk(startOffset, endOffset, "measure")) return null;
  return {
    startOffset,
    endOffset,
    origin: "error",
    loop: true,
    suggestedMethod: "measure",
  };
}

function applyPlaybackRangeFromError(errItem) {
  try {
    if (!errorsEnabled) return;
    if (isPlaying) return;
    const suggested = suggestPlaybackRangeForRhythmError(errItem);
    if (!suggested) return;
    lastRhythmErrorSuggestion = {
      at: new Date().toISOString(),
      tuneId: errItem && errItem.tuneId ? errItem.tuneId : null,
      filePath: errItem && errItem.filePath ? errItem.filePath : null,
      message: errItem && errItem.message ? errItem.message : null,
      errorStartOffset: errItem && Number.isFinite(errItem.errorStartOffset) ? errItem.errorStartOffset : null,
      errorEndOffset: errItem && Number.isFinite(errItem.errorEndOffset) ? errItem.errorEndOffset : null,
      startOffset: suggested.startOffset,
      endOffset: suggested.endOffset,
      origin: "error",
      loop: true,
      suggestedMethod: suggested.suggestedMethod || null,
    };
    setPlaybackRange({
      startOffset: suggested.startOffset,
      endOffset: suggested.endOffset,
      origin: "error",
      loop: true,
    });
    suppressPlaybackRangeSelectionSync = true;
    setEditorSelectionAt(suggested.startOffset);
  } catch (e) {
    console.error("[abcarus] Failed to apply PlaybackRange from error:", (e && e.message) ? e.message : String(e));
  } finally {
    suppressPlaybackRangeSelectionSync = false;
  }
}

function renderToolStatus() {
  if (!$toolStatus) return;
  const warnings = [];
  const details = [];
  if (toolHealth) {
    const entries = [
      ["abc2abc", "abc2abc"],
      ["abc2xml", "abc2xml"],
      ["xml2abc", "xml2abc"],
      ["python", "Python"],
    ];
    for (const [key, label] of entries) {
      const info = toolHealth[key];
      if (!info || info.ok) continue;
      const msg = info.error || info.detail || "Unavailable";
      warnings.push(label);
      details.push(`${label}: ${msg}`);
    }
  }

  let text = "";
  let title = "";
  let shouldWarn = false;

  if (toolHealthError) {
    text = "Tool check failed";
    title = toolHealthError;
    shouldWarn = true;
  } else if (warnings.length) {
    text = `Missing tools: ${warnings.join(", ")}`;
    title = details.join("\n");
    shouldWarn = true;
  }

  if (!shouldWarn) {
    $toolStatus.textContent = "";
    $toolStatus.title = "";
    $toolStatus.classList.remove("warn");
    $toolStatus.style.display = "none";
    return;
  }

  $toolStatus.textContent = text;
  $toolStatus.title = title;
  $toolStatus.classList.add("warn");
  $toolStatus.style.display = "";
  if (warnings.length && !toolWarningShown) {
    showToast(text);
    toolWarningShown = true;
  }
}

async function checkExternalTools() {
  if (!window.api || typeof window.api.checkConversionTools !== "function") return;
  try {
    const res = await window.api.checkConversionTools();
    if (!res) {
      toolHealthError = "Tool check failed.";
      toolHealth = null;
      renderToolStatus();
      return;
    }
    if (!res.ok) {
      toolHealthError = res.error || "Tool check failed.";
      toolHealth = null;
      renderToolStatus();
      return;
    }
    toolHealthError = "";
    toolHealth = res.tools || null;
  } catch (e) {
    toolHealth = null;
    toolHealthError = (e && e.message) ? e.message : String(e);
  }
  renderToolStatus();
}

function setScanErrorButtonState(isScanning) {
  if (!$scanErrorTunes) return;
  $scanErrorTunes.disabled = Boolean(isScanning);
}

function applyLibrarySearch(value) {
  libraryTextFilter = String(value || "").trim();
  renderLibraryTree();
  updateLibraryStatus();
}

function scheduleLibrarySearch(value) {
  pendingLibrarySearch = value;
  if (librarySearchTimer) clearTimeout(librarySearchTimer);
  librarySearchTimer = setTimeout(() => {
    librarySearchTimer = null;
    applyLibrarySearch(pendingLibrarySearch);
  }, LIBRARY_SEARCH_DEBOUNCE_MS);
}

function setScanErrorButtonActive(isActive) {
  if (!$scanErrorTunes) return;
  const active = Boolean(isActive);
  $scanErrorTunes.classList.toggle("toggle-active", active);
  if ($fileTuneSelect) {
    $fileTuneSelect.classList.toggle("error-filter-active", active);
  }
}

function setScanErrorButtonVisibility(entry) {
  if (!$scanErrorTunes) return;
  const tuneCount = entry && Array.isArray(entry.tunes) ? entry.tunes.length : 0;
  const shouldShow = tuneCount > 1;
  $scanErrorTunes.style.display = shouldShow ? "" : "none";
  if (!shouldShow) {
    tuneErrorFilter = false;
    tuneErrorScanInFlight = false;
    setScanErrorButtonState(false);
    setScanErrorButtonActive(false);
  }
}

function setSoundfontStatus(text, autoClearMs) {
  setBufferStatus(text || "");
  if (soundfontStatusTimer) clearTimeout(soundfontStatusTimer);
  soundfontStatusTimer = null;
  if (text && autoClearMs) {
    soundfontStatusTimer = setTimeout(() => {
      setBufferStatus("");
      soundfontStatusTimer = null;
    }, autoClearMs);
  }
}

function setSoundfontCaption(text) {
  if (!$soundfontLabel) return;
  const next = text || "Soundfont:";
  $soundfontLabel.textContent = next;
  const isLoading = String(next).toLowerCase().includes("loading");
  $soundfontLabel.classList.toggle("loading", isLoading);
}

function toFileUrl(filePath) {
  const raw = String(filePath || "");
  if (!raw) return "";
  if (raw.startsWith("file://")) return raw;
  if (/^[a-zA-Z]:\\/.test(raw)) {
    return `file:///${raw.replace(/\\/g, "/")}`;
  }
  if (raw.startsWith("/")) return new URL(raw, window.location.href).href;
  return raw;
}

function isSoundfontPath(value) {
  const raw = String(value || "");
  return raw.startsWith("file://") || raw.startsWith("/") || /^[a-zA-Z]:\\/.test(raw);
}

function getSoundfontLabel(name) {
  const raw = String(name || "");
  if (!raw) return "";
  if (raw.startsWith("/") || /^[a-zA-Z]:\\/.test(raw)) {
    if (window.api && typeof window.api.pathBasename === "function") {
      return window.api.pathBasename(raw);
    }
    const parts = raw.split(/[\\/]/);
    return parts[parts.length - 1] || raw;
  }
  return raw;
}

async function updateSoundfontLoadingStatus(name) {
  if (soundfontLoadTarget !== name) return;
  setSoundfontCaption("Loading...");
}

function setCursorStatus(line, col, offset, totalLines, totalChars) {
  if (!$cursorStatus) return;
  $cursorStatus.textContent = `Ln ${line}/${totalLines}, Col ${col}  •  Ch ${offset}/${totalChars}`;
}

function applyTransformedText(text) {
  if (!currentDoc) currentDoc = createBlankDocument();
  suppressDirty = true;
  setEditorValue(text);
  suppressDirty = false;
  currentDoc.content = text || "";
  currentDoc.dirty = true;
  renderNow();
}

const BAR_SEP_SYMBOLS = [
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
const BAR_SEP_NO_SPACE = new RegExp(
  `(${BAR_SEP_SYMBOLS.map((s) => escapeRegExp(s)).join("|")})`
);

function splitLineIntoParts(line) {
  const parts = line.split(BAR_SEP).filter((p) => p);
  return parts;
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
  if (/^L:\s*mcm_default/m.test(abc)) return "mcm_default";
  const match = abc.match(/^L:\s*(\d+)\/(\d+)/m);
  if (match) return Number(match[1]) / Number(match[2]);
  return 1 / 8;
}

function getMetre(abc) {
  const match = abc.match(/^M:\s*(\d+)\/(\d+)/m);
  if (match) return Number(match[1]) / Number(match[2]);
  return 1;
}

function getBarLength(abc, defaultLength, metre) {
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

function isLikelyAnacrusis(bar, defaultLength, metre) {
  if (!bar || BAR_SEP_NO_SPACE.test(bar)) return false;
  const actual = getBarLength(bar, defaultLength, metre);
  return actual <= metre * 0.8;
}

function alignBeams(bars) {
  if (!bars || !bars.length) return bars || [];
  const barParts = bars.map((b) => b.split(/ +/));
  const lengths = barParts.map((p) => p.length);
  const numParts = lengths.length ? Math.min(...lengths) : 0;
  if (!Number.isFinite(numParts) || numParts <= 0) return bars;
  for (let i = 0; i < numParts; i += 1) {
    const parts = barParts.map((p) => p[i] || "");
    const maxLen = Math.max(...parts.map((p) => p.length));
    for (let lineNo = 0; lineNo < barParts.length; lineNo += 1) {
      barParts[lineNo][i] = (barParts[lineNo][i] || "").padEnd(maxLen, " ");
    }
  }
  return barParts.map((p) => p.join(" "));
}

function alignBars(bars, alignInsideBarsToo) {
  let aligned = bars.slice();
  if (BAR_SEP_NO_SPACE.test(bars[0])) {
    aligned = aligned.map((b) => ` ${b.trim()} `);
  } else if (alignInsideBarsToo) {
    aligned = alignBeams(aligned);
  }
  const maxLen = Math.max(...aligned.map((b) => b.length));
  return aligned.map((b) => b.padEnd(maxLen, " "));
}

function alignBarSeparators(barSeps) {
  let bars = barSeps.map((b) => ` ${b.trim()} `);
  const useRjust = bars.some((b) => b.includes(":|"));
  if (bars.some((b) => b.includes("|"))) {
    const maxPos = Math.max(...bars.map((b) => b.lastIndexOf("|")));
    bars = bars.map((b) => {
      const p = b.lastIndexOf("|");
      if (p >= 0 && p < maxPos) return " ".repeat(maxPos - p) + b;
      return b;
    });
    const maxLen = Math.max(...bars.map((b) => b.length));
    return bars.map((b) => b.padEnd(maxLen, " "));
  }
  const maxLen = Math.max(...bars.map((b) => b.length));
  return useRjust ? bars.map((b) => b.padStart(maxLen, " ")) : bars.map((b) => b.padEnd(maxLen, " "));
}

function alignLines(wholeAbc, lines, alignInsideBarsToo) {
  const n = lines.length;
  if (!n) return lines;
  const lineParts = lines.map((line) => splitLineIntoParts(line.trim()));
  const lengths = lineParts.map((lp) => lp.length);
  const maxLen = lengths.length ? Math.max(...lengths) : 0;
  const numBars = maxLen + 1;
  if (!Number.isFinite(numBars) || numBars <= 0) return lines;
  for (let lineNo = 0; lineNo < lineParts.length; lineNo += 1) {
    lineParts[lineNo].push("");
    if (lineParts[lineNo].length < numBars) {
      lineParts[lineNo].push(...Array(numBars - lineParts[lineNo].length).fill(""));
    }
  }

  const defaultLen = getDefaultLen(wholeAbc);
  const metre = getMetre(wholeAbc);
  let firstBarHandled = false;

  for (let i = 0; i < numBars; i += 1) {
    if (!firstBarHandled && lineParts.some((lp) => /[a-gA-Gxz]/.test(lp[i] || ""))) {
      firstBarHandled = true;
      const isAna = lineParts.map((lp) => isLikelyAnacrusis(lp[i], defaultLen, metre));
      if (isAna.some(Boolean) && !isAna.every(Boolean)) {
        for (let lineNo = 0; lineNo < n; lineNo += 1) {
          if (!isAna[lineNo]) lineParts[lineNo].splice(i, 0, "");
        }
      }
    }

    const anyIsBarSep = lineParts.some((lp) => BAR_SEP_NO_SPACE.test(lp[i] || ""));
    if (anyIsBarSep) {
      for (let lineNo = 0; lineNo < n; lineNo += 1) {
        if (!BAR_SEP_NO_SPACE.test(lineParts[lineNo][i] || "")) {
          lineParts[lineNo].splice(i, 0, "");
        }
      }
    }

    const bars = lineParts.map((lp) => lp[i]);
    const aligned = anyIsBarSep
      ? alignBarSeparators(bars)
      : alignBars(bars, alignInsideBarsToo);
    for (let lineNo = 0; lineNo < n; lineNo += 1) {
      lineParts[lineNo][i] = aligned[lineNo];
    }
  }

  let out = lineParts.map((parts) => parts.join(""));
  if (out.every((l) => l.startsWith(" "))) out = out.map((l) => l.slice(1));
  return out;
}

function alignBarsInTune(lines, tuneText) {
  const out = lines.slice();
  let inText = false;
  let headerEnded = false;
  const candidates = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^%%\s*begintext\b/i.test(line)) {
      inText = true;
      continue;
    }
    if (/^%%\s*endtext\b/i.test(line)) {
      inText = false;
      continue;
    }
    if (!headerEnded) {
      if (/^\s*K:/.test(line)) headerEnded = true;
      continue;
    }
    if (inText) continue;
    if (/^\s*%/.test(line)) continue;
    if (/^\s*[A-Za-z]:/.test(line)) continue;
    if (!BAR_SEP_NO_SPACE.test(line)) continue;
    candidates.push({ idx: i, line });
  }

  if (!candidates.length) return out;
  const aligned = alignLines(tuneText, candidates.map((c) => c.line), true);
  for (let i = 0; i < candidates.length; i += 1) {
    out[candidates[i].idx] = aligned[i];
  }
  return out;
}

function alignBarsInText(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let start = 0;

  const flushBlock = (blockLines, isTune) => {
    if (!blockLines.length) return;
    if (isTune) {
      const tuneText = blockLines.join("\n");
      out.push(...alignBarsInTune(blockLines, tuneText));
    } else {
      out.push(...blockLines);
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*X:/.test(lines[i])) {
      flushBlock(lines.slice(start, i), false);
      start = i;
      i += 1;
      while (i < lines.length && !/^\s*X:/.test(lines[i])) i += 1;
      flushBlock(lines.slice(start, i), true);
      start = i;
      i -= 1;
    }
  }

  flushBlock(lines.slice(start), false);
  return out.join("\n");
}

function alignBarsInEditor() {
  const text = getEditorValue();
  if (!text.trim()) {
    setStatus("No notation to align.");
    return;
  }
  const aligned = alignBarsInText(text);
  if (aligned === text) {
    setStatus("Already aligned.");
    return;
  }
  applyTransformedText(aligned);
  setStatus("OK");
}

const errorEntries = [];
const errorEntryMap = new Map();
const libraryErrorIndex = new Map();
let lastNoteSelection = [];

function showErrorsVisible(visible) {
  // Errors are surfaced via the always-visible "Errors: N" indicator + popover.
  // Keep the legacy sidebar errors pane inactive to avoid duplicate UX.
  if ($sidebar) $sidebar.classList.remove("has-errors");
  if ($sidebarBody) $sidebarBody.classList.remove("errors-visible");
  void visible;
}

function clearErrors() {
  if (!errorsEnabled) {
    errorEntries.length = 0;
    errorEntryMap.clear();
    if ($errorList) $errorList.textContent = "";
    showErrorsVisible(false);
    measureErrorRenderRanges = [];
    setMeasureErrorRanges([]);
    setScanErrors([]);
    return;
  }
  errorEntries.length = 0;
  errorEntryMap.clear();
  if ($errorList) $errorList.textContent = "";
  showErrorsVisible(false);
  measureErrorRenderRanges = [];
  setMeasureErrorRanges([]);
  setScanErrors([]);
}

let contextMenu = null;
let contextMenuTarget = null;
let clipboardTune = null;
let pendingMoveTuneId = null;

function initContextMenu() {
  contextMenu = document.createElement("div");
  contextMenu.className = "context-menu";
  contextMenu.setAttribute("role", "menu");
  document.body.appendChild(contextMenu);

  contextMenu.addEventListener("click", async (e) => {
    const target = e.target && e.target.closest ? e.target.closest(".context-menu-item") : null;
    if (!target || !target.dataset) return;
    const action = target.dataset.action;
    const menuTarget = contextMenuTarget;
    if (action === "loadFile" && menuTarget && menuTarget.type === "file") {
      hideContextMenu();
      await requestLoadLibraryFile(menuTarget.filePath);
      return;
    }
    if (action === "deleteTune" && menuTarget && menuTarget.type === "tune") {
      await deleteTuneById(menuTarget.tuneId);
      hideContextMenu();
      return;
    }
    if (action === "copyTune" && menuTarget && menuTarget.type === "tune") {
      await copyTuneById(menuTarget.tuneId, "copy");
      hideContextMenu();
      return;
    }
    if (action === "duplicateTune" && menuTarget && menuTarget.type === "tune") {
      await duplicateTuneById(menuTarget.tuneId);
      hideContextMenu();
      return;
    }
    if (action === "cutTune" && menuTarget && menuTarget.type === "tune") {
      await copyTuneById(menuTarget.tuneId, "move");
      hideContextMenu();
      return;
    }
    if (action === "pasteTune" && menuTarget && menuTarget.type === "file") {
      await pasteClipboardToFile(menuTarget.filePath);
      hideContextMenu();
      return;
    }
    if (action === "findLibrary") {
      promptFindInLibrary();
      hideContextMenu();
      return;
    }
    if (action === "clearSearch") {
      libraryTextFilter = "";
      if ($librarySearch) $librarySearch.value = "";
      renderLibraryTree();
      updateLibraryStatus();
      hideContextMenu();
      return;
    }
    if (action === "refreshLibrary") {
      await refreshLibraryIndex();
      hideContextMenu();
      return;
    }
    if (action === "renameFile" && menuTarget && menuTarget.type === "file") {
      beginRenameFile(menuTarget.filePath);
      hideContextMenu();
      return;
    }
    if (action === "moveTune" && menuTarget && menuTarget.type === "tune") {
      openMoveTuneModal(menuTarget.tuneId);
      hideContextMenu();
    }
    if (action === "editorCut" && menuTarget && menuTarget.type === "editor") {
      if (editorView) editorView.focus();
      document.execCommand("cut");
      hideContextMenu();
      return;
    }
    if (action === "editorCopy" && menuTarget && menuTarget.type === "editor") {
      if (editorView) editorView.focus();
      document.execCommand("copy");
      hideContextMenu();
      return;
    }
    if (action === "editorPaste" && menuTarget && menuTarget.type === "editor") {
      if (editorView) editorView.focus();
      document.execCommand("paste");
      hideContextMenu();
    }
  });

  document.addEventListener("click", (e) => {
    if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
  });
  window.addEventListener("blur", () => hideContextMenu());
}

function buildContextMenuItems(items) {
  contextMenu.textContent = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "context-menu-item";
    row.textContent = item.label;
    row.dataset.action = item.action;
    if (item.danger) row.classList.add("danger");
    if (item.disabled) {
      row.classList.add("disabled");
    }
    row.setAttribute("role", "menuitem");
    contextMenu.appendChild(row);
  }
}

function showContextMenuAt(x, y, target) {
  if (!contextMenu) initContextMenu();
  contextMenuTarget = target;
  if (target.type === "tune") {
    buildContextMenuItems([
      { label: "Copy Tune", action: "copyTune" },
      { label: "Duplicate Tune", action: "duplicateTune" },
      { label: "Cut Tune", action: "cutTune" },
      { label: "Move to…", action: "moveTune" },
      { label: "Delete Tune…", action: "deleteTune", danger: true },
    ]);
  } else if (target.type === "file") {
    buildContextMenuItems([
      { label: "Load", action: "loadFile", disabled: !target.filePath },
      { label: "Paste Tune", action: "pasteTune", disabled: !clipboardTune },
      { label: "Refresh Library", action: "refreshLibrary" },
      { label: "Rename File…", action: "renameFile" },
    ]);
  } else if (target.type === "library") {
    buildContextMenuItems([
      { label: "Refresh Library", action: "refreshLibrary" },
      { label: "Find in Library…", action: "findLibrary" },
      { label: "Clear Search", action: "clearSearch", disabled: !libraryTextFilter },
    ]);
  } else if (target.type === "editor") {
    buildContextMenuItems([
      { label: "Cut", action: "editorCut" },
      { label: "Copy", action: "editorCopy" },
      { label: "Paste", action: "editorPaste" },
    ]);
  }
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.add("open");
  const rect = contextMenu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (rect.right > window.innerWidth) left = Math.max(8, x - rect.width);
  if (rect.bottom > window.innerHeight) top = Math.max(8, y - rect.height);
  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
}

function hideContextMenu() {
  if (!contextMenu) return;
  contextMenu.classList.remove("open");
  contextMenuTarget = null;
}

function buildRenameTargetPath(oldPath, inputName) {
  const trimmed = String(inputName || "").trim();
  if (!trimmed) return "";
  if (/[\\/]/.test(trimmed)) return "";
  let name = trimmed;
  if (!/\.[^.]+$/.test(name)) name += ".abc";
  const dir = safeDirname(oldPath);
  if (!dir) return "";
  return `${dir}/${name}`;
}

function beginRenameFile(filePath) {
  if (!filePath) return;
  renamingFilePath = filePath;
  renderLibraryTree();
  requestAnimationFrame(() => {
    const input = $libraryTree
      ? $libraryTree.querySelector(`input[data-file-path="${CSS.escape(filePath)}"]`)
      : null;
    if (input) {
      input.focus();
      input.select();
    }
  });
}

async function commitRenameFile(oldPath, inputName) {
  if (renameInFlight) return;
  if (!renamingFilePath || renamingFilePath !== oldPath) return;
  renameInFlight = true;
  try {
    const newPath = buildRenameTargetPath(oldPath, inputName);
    if (!newPath) {
      renamingFilePath = null;
      renderLibraryTree();
      return;
    }
    if (newPath === oldPath) {
      renamingFilePath = null;
      renderLibraryTree();
      return;
    }
    if (await fileExists(newPath)) {
      await showSaveError("A file with that name already exists.");
      renamingFilePath = null;
      renderLibraryTree();
      return;
    }
    const res = await renameFile(oldPath, newPath);
    if (!res || !res.ok) {
      await showSaveError(res && res.error ? res.error : "Unable to rename file.");
      renamingFilePath = null;
      renderLibraryTree();
      return;
    }
    renamingFilePath = null;
    await renameLibraryFile(oldPath, newPath);
  } finally {
    renameInFlight = false;
  }
}

function openMoveTuneModal(tuneId) {
  if (!$moveTuneModal || !$moveTuneTarget) return;
  if (!libraryIndex || !libraryIndex.files || !libraryIndex.files.length) {
    showSaveError("Load a library folder first.");
    return;
  }
  pendingMoveTuneId = tuneId;
  $moveTuneTarget.textContent = "";
  for (const file of libraryIndex.files) {
    const opt = document.createElement("option");
    opt.value = file.path;
    opt.textContent = file.basename || safeBasename(file.path);
    $moveTuneTarget.appendChild(opt);
  }
  if (activeFilePath) $moveTuneTarget.value = activeFilePath;
  $moveTuneModal.classList.add("open");
  $moveTuneModal.setAttribute("aria-hidden", "false");
}

function closeMoveTuneModal() {
  if (!$moveTuneModal) return;
  $moveTuneModal.classList.remove("open");
  $moveTuneModal.setAttribute("aria-hidden", "true");
  pendingMoveTuneId = null;
}

async function moveTuneToFile(tuneId, targetPath) {
  if (!tuneId || !targetPath) return;
  const res = findTuneById(tuneId);
  if (!res) return;
  if (res.file.path === targetPath) {
    await showSaveError("Target file is the same as source.");
    return;
  }
  try {
    const text = await getTuneText(res.tune, res.file);
    clipboardTune = {
      text,
      sourcePath: res.file.path,
      tuneId,
      mode: "move",
    };
    await pasteClipboardToFile(targetPath);
  } catch (e) {
    await showSaveError(e && e.message ? e.message : String(e));
  }
}

function parseErrorLocation(message) {
  const text = String(message);
  let match = text.match(/:(\d+):(\d+)/);
  if (match) {
    return { line: Number(match[1]), col: Number(match[2]) };
  }
  match = text.match(/line\s+(\d+)\s*[,;]?\s*col(?:umn)?\s+(\d+)/i);
  if (match) {
    return { line: Number(match[1]), col: Number(match[2]) };
  }
  return null;
}

function setErrorLineOffsetFromHeader(headerText) {
  if (!headerText || !String(headerText).trim()) {
    errorLineOffset = 0;
    return;
  }
  const trimmed = String(headerText).replace(/[\r\n]+$/, "");
  errorLineOffset = trimmed ? trimmed.split(/\r\n|\n|\r/).length : 0;
}

function applyMeasureHighlights(renderOffset) {
  if (!$out) return;
  const notes = $out.querySelectorAll(".note-hl, .bar-hl");
  for (const note of notes) note.classList.remove("measure-error");
  const useRenderRanges = measureErrorRenderRanges && measureErrorRenderRanges.length;
  if (!useRenderRanges && !measureErrorRanges.length) return;
  const ranges = useRenderRanges
    ? measureErrorRenderRanges
    : measureErrorRanges.map((range) => ({
      start: range.start + (renderOffset || 0),
      end: range.end + (renderOffset || 0),
    }));
  const barEls = Array.from($out.querySelectorAll(".bar-hl"));
  if (barEls.length) {
    for (const bar of barEls) {
      const start = Number(bar.dataset && bar.dataset.start);
      if (!Number.isFinite(start)) continue;
      const hit = ranges.some((range) => start >= range.start && start < range.end);
      if (hit) bar.classList.add("measure-error");
    }
    return;
  }
  const noteEls = Array.from($out.querySelectorAll(".note-hl"));
  for (const range of ranges) {
    let first = null;
    let last = null;
    for (const note of noteEls) {
      const start = Number(note.dataset && note.dataset.start);
      if (!Number.isFinite(start)) continue;
      if (start >= range.start && start < range.end) {
        if (!first) first = note;
        last = note;
      }
    }
    if (first) first.classList.add("measure-error");
    if (last && last !== first) last.classList.add("measure-error");
  }
}

function isMeasureCheckEnabled() {
  const text = getEditorValue();
  const match = String(text || "").match(/^M:\s*(.+)$/m);
  if (!match) return false;
  const value = String(match[1] || "").trim().toLowerCase();
  return value !== "none";
}

function injectCheckbarsDirective(text) {
  const src = String(text || "");
  if (!src.trim()) return src;
  if (/%%\s*checkbars\b/i.test(src)) return src;
  const lines = src.split(/\r\n|\n|\r/);
  const xIdx = lines.findIndex((line) => /^\s*X:/.test(line));
  const insertIdx = xIdx >= 0 ? xIdx : 0;
  lines.splice(insertIdx, 0, "%%checkbars 1");
  return lines.join("\n");
}

function getEditorIndexFromLoc(loc) {
  if (!editorView || !loc) return null;
  const line = Math.max(1, Math.min(loc.line, editorView.state.doc.lines));
  const lineInfo = editorView.state.doc.line(line);
  const col = Math.max(1, loc.col || 1);
  return Math.min(lineInfo.to, lineInfo.from + col - 1);
}

function getTextIndexFromLoc(text, loc) {
  if (!loc) return null;
  const lines = String(text || "").split(/\r\n|\n|\r/);
  if (!lines.length) return 0;
  const line = Math.max(1, Math.min(loc.line || 1, lines.length));
  const col = Math.max(1, loc.col || 1);
  let idx = 0;
  for (let i = 0; i < line - 1; i += 1) {
    idx += lines[i].length + 1;
  }
  idx += Math.min(col - 1, lines[line - 1].length);
  return idx;
}

function findMeasureRangeAt(text, pos) {
  const src = String(text || "");
  if (!src) return null;
  let idx = Math.max(0, Math.min(pos, Math.max(0, src.length - 1)));
  while (idx > 0) {
    const lineStart = Math.max(0, src.lastIndexOf("\n", idx - 1) + 1);
    const lineText = src.slice(lineStart, idx + 1);
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith("%")) {
      idx = lineStart - 1;
      continue;
    }
    const commentIdx = src.indexOf("%", lineStart);
    if (commentIdx !== -1 && commentIdx <= idx && src[commentIdx - 1] !== "\\") {
      idx = commentIdx - 1;
      continue;
    }
    while (idx > lineStart && /[\s|:]/.test(src[idx])) idx -= 1;
    if (idx <= lineStart && /[\s|:]/.test(src[idx])) {
      idx = lineStart - 1;
      continue;
    }
    break;
  }
  idx = Math.max(0, idx);
  const start = src.lastIndexOf("|", Math.max(0, idx));
  const end = src.indexOf("|", Math.max(0, idx + 1));
  const rangeStart = start >= 0 ? start : 0;
  const rangeEnd = end >= 0 ? end + 1 : src.length;
  if (rangeEnd <= rangeStart) return null;
  return { start: rangeStart, end: rangeEnd };
}

function buildErrorTuneLabel(meta) {
  if (!meta) return "";
  const xPart = meta.xNumber ? `X:${meta.xNumber}` : "";
  const title = meta.title || "";
  return `${xPart} ${title}`.trim() || meta.id || "";
}

function getErrorGroupKey(entry) {
  if (entry && entry.tuneId) return entry.tuneId;
  if (entry && entry.filePath) return entry.filePath;
  return "general";
}

function getErrorGroupLabel(entry) {
  if (!entry) return "General";
  const basename = entry.fileBasename || (entry.filePath ? safeBasename(entry.filePath) : "");
  const tuneLabel = entry.tuneLabel || "";
  if (basename && tuneLabel) return `${basename} — ${tuneLabel}`;
  if (basename) return basename;
  if (tuneLabel) return tuneLabel;
  return "General";
}

function renderErrorList() {
  if (!$errorList) return;
  $errorList.textContent = "";
  if (!errorEntries.length) return;
  const groups = new Map();
  for (const entry of errorEntries) {
    const key = getErrorGroupKey(entry);
    if (!groups.has(key)) {
      groups.set(key, { key, label: getErrorGroupLabel(entry), entries: [], count: 0 });
    }
    const group = groups.get(key);
    group.entries.push(entry);
    group.count += entry.count || 1;
  }
  for (const group of groups.values()) {
    const details = document.createElement("details");
    details.className = "error-group";
    if (group.key === activeTuneId) details.open = true;
    const summary = document.createElement("summary");
    summary.className = "error-group-summary";
    summary.textContent = `${group.label} (${group.count})`;
    details.appendChild(summary);
    for (const entry of group.entries) {
      const item = document.createElement("div");
      item.className = "error-item";
      item.dataset.index = String(entry.index);
      if (entry.loc) {
        const loc = document.createElement("div");
        loc.className = "error-loc";
        loc.textContent = `Line ${entry.loc.line}, Col ${entry.loc.col}`;
        item.appendChild(loc);
      }
      const msg = document.createElement("div");
      msg.className = "error-msg";
      msg.textContent = entry.count && entry.count > 1
        ? `${entry.message} ×${entry.count}`
        : entry.message;
      item.appendChild(msg);
      details.appendChild(item);
    }
    $errorList.appendChild(details);
  }
}

function addError(message, locOverride, contextOverride) {
  if (!errorsEnabled) return;
  const renderLoc = locOverride || parseErrorLocation(message);
  const context = contextOverride || (activeTuneMeta ? {
    tuneId: activeTuneMeta.id,
    filePath: activeTuneMeta.path || null,
    fileBasename: activeTuneMeta.basename || (activeTuneMeta.path ? safeBasename(activeTuneMeta.path) : ""),
    tuneLabel: buildErrorTuneLabel(activeTuneMeta),
    xNumber: activeTuneMeta.xNumber || "",
    title: activeTuneMeta.title || "",
  } : null);
  const entry = {
    message: String(message),
    loc: renderLoc ? { line: renderLoc.line, col: renderLoc.col } : null,
    renderLoc: renderLoc ? { line: renderLoc.line, col: renderLoc.col } : null,
    tuneId: context ? context.tuneId || null : null,
    filePath: context ? context.filePath || null : null,
    fileBasename: context ? context.fileBasename || "" : "",
    tuneLabel: context ? context.tuneLabel || "" : "",
    xNumber: context ? context.xNumber || "" : "",
    title: context ? context.title || "" : "",
    count: 1,
    index: -1,
  };
  if (entry.loc && errorLineOffset) {
    if (entry.loc.line <= errorLineOffset) {
      entry.loc = null;
    } else {
      entry.loc = {
        line: entry.loc.line - errorLineOffset,
        col: entry.loc.col,
      };
    }
  }
  const allowMeasureRange = !(context && context.skipMeasureRange);
  if (allowMeasureRange && entry.renderLoc && /Bad measure duration/i.test(entry.message) && isMeasureCheckEnabled()) {
    const payload = lastRenderPayload || getRenderPayload();
    const renderText = payload && payload.text ? payload.text : getEditorValue();
    const renderOffset = payload && payload.offset ? payload.offset : 0;
    const renderIdx = getTextIndexFromLoc(renderText, entry.renderLoc);
    if (Number.isFinite(renderIdx)) {
      const renderRange = findMeasureRangeAt(renderText, renderIdx);
      if (renderRange && renderRange.end > renderRange.start) {
        const editorStart = renderRange.start - renderOffset;
        const editorEnd = renderRange.end - renderOffset;
        const editorRange = (editorStart >= 0 && editorEnd > editorStart)
          ? { start: editorStart, end: editorEnd }
          : null;
        entry.measureRange = editorRange;
        const renderDupe = measureErrorRenderRanges.some((r) => r.start === renderRange.start && r.end === renderRange.end);
        if (!renderDupe) {
          measureErrorRenderRanges.push(renderRange);
        }
        if (editorRange) {
          const dupe = measureErrorRanges.some((r) => r.start === editorRange.start && r.end === editorRange.end);
          if (!dupe) {
            measureErrorRanges.push(editorRange);
            setMeasureErrorRanges(measureErrorRanges);
          }
        }
      }
    }
  }

  const key = `${getErrorGroupKey(entry)}|${entry.message}|${entry.loc ? entry.loc.line : ""}|${entry.loc ? entry.loc.col : ""}`;
  const existing = errorEntryMap.get(key);
  if (existing) {
    existing.count += 1;
    renderErrorList();
    showErrorsVisible(true);
    setScanErrors(errorEntries);
    return;
  }
  entry.index = errorEntries.length;
  errorEntries.push(entry);
  errorEntryMap.set(key, entry);
  renderErrorList();
  showErrorsVisible(true);
  setScanErrors(errorEntries);
}

function logErr(m, loc, context) {
  if (!errorsEnabled) return;
  addError(m, loc, context);
}

function clearNoteSelection() {
  for (const el of lastNoteSelection) {
    el.classList.remove("note-select");
  }
  lastNoteSelection = [];
}

function pickClosestNoteElement(els) {
  if (!$renderPane || !els || !els.length) return null;
  const viewTop = $renderPane.scrollTop;
  const viewCenter = viewTop + $renderPane.clientHeight / 2;
  let best = null;
  let bestDist = Infinity;
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    const containerRect = $renderPane.getBoundingClientRect();
    const offsetTop = rect.top - containerRect.top + $renderPane.scrollTop;
    const dist = Math.abs(offsetTop - viewCenter);
    if (dist < bestDist) {
      best = el;
      bestDist = dist;
    }
  }
  return best;
}

function highlightNoteAtIndex(idx) {
  if (!$out) return;
  clearNoteSelection();
  const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
    ? lastRenderPayload.offset
    : 0;
  const renderIdx = Number.isFinite(idx) ? idx + renderOffset : idx;
  const els = $out.querySelectorAll("._" + renderIdx + "_");
  if (!els.length) return;
  lastNoteSelection = Array.from(els);
  for (const el of lastNoteSelection) el.classList.add("note-select");
  const chosen = pickClosestNoteElement(lastNoteSelection);
  if (chosen) maybeScrollRenderToNote(chosen);
}

function highlightRenderNoteAtIndex(renderIdx) {
  if (!$out) return;
  clearNoteSelection();
  if (!Number.isFinite(renderIdx)) return;
  const els = $out.querySelectorAll("._" + renderIdx + "_");
  if (!els.length) return;
  lastNoteSelection = Array.from(els);
  for (const el of lastNoteSelection) el.classList.add("note-select");
  const chosen = pickClosestNoteElement(lastNoteSelection);
  if (chosen) maybeScrollRenderToNote(chosen);
}

function setEditorSelectionAt(idx) {
  if (!editorView || !Number.isFinite(idx)) return;
  const max = editorView.state.doc.length;
  const pos = Math.max(0, Math.min(idx, max));
  editorView.dispatch({
    selection: EditorSelection.cursor(pos),
    scrollIntoView: true,
  });
  highlightNoteAtIndex(pos);
}

function setEditorSelectionRange(start, end) {
  if (!editorView || !Number.isFinite(start)) return;
  const max = editorView.state.doc.length;
  const anchor = Math.max(0, Math.min(start, max));
  const head = Number.isFinite(end) ? Math.max(anchor, Math.min(end, max)) : anchor;
  editorView.dispatch({
    selection: EditorSelection.range(anchor, head),
    scrollIntoView: true,
  });
  highlightNoteAtIndex(anchor);
}

function setEditorSelectionAtLineCol(line, col) {
  if (!editorView || !Number.isFinite(line) || !Number.isFinite(col)) return;
  const lineInfo = editorView.state.doc.line(Math.max(1, Math.min(line, editorView.state.doc.lines)));
  const pos = Math.min(lineInfo.to, lineInfo.from + Math.max(0, col - 1));
  setEditorSelectionAt(pos);
}

function latinize(text) {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function sanitizeFileBaseName(text) {
  const cleaned = latinize(text)
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "untitled";
  return cleaned.replace(/\s+/g, "-").slice(0, 80);
}

function parseAbcHeaderFields(text) {
  const fields = { title: "", composer: "", key: "" };
  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (const line of lines) {
    if (!fields.title && /^T:/.test(line)) {
      fields.title = line.replace(/^T:\s*/, "").trim();
    } else if (!fields.composer && /^C:/.test(line)) {
      fields.composer = line.replace(/^C:\s*/, "").trim();
    } else if (!fields.key && /^K:/.test(line)) {
      fields.key = line.replace(/^K:\s*/, "").trim();
      break;
    }
  }
  return fields;
}

function getSuggestedBaseName() {
  const parsed = parseAbcHeaderFields(getEditorValue());
  const title = (activeTuneMeta && activeTuneMeta.title) || parsed.title || "untitled";
  const composer = (activeTuneMeta && activeTuneMeta.composer) || parsed.composer || "";
  const key = (activeTuneMeta && activeTuneMeta.key) || parsed.key || "";
  const parts = [title, composer, key].filter(Boolean);
  return sanitizeFileBaseName(parts.join(" - "));
}

function getPlaybackText() {
  const payload = getPlaybackPayload();
  return payload.text;
}

function getDefaultSaveDir() {
  if (activeFilePath) return safeDirname(activeFilePath);
  if (libraryIndex && libraryIndex.root) return libraryIndex.root;
  if (currentDoc && currentDoc.path) return safeDirname(currentDoc.path);
  return null;
}

function getCurrentNotationMarkup() {
  if (!$out) return "";
  const markup = $out.innerHTML.trim();
  return markup;
}

function applyPrintDebugMarkup(markup) {
  if (!markup) return markup;
  if (window.__abcarusDebugPrintNoRaster) {
    return `${markup}\n<!--abcarus:no-raster-->`;
  }
  return markup;
}

function getSongbookSuggestedBaseName() {
  if (activeFilePath) {
    const raw = safeBasename(activeFilePath).replace(/\.abc$/i, "");
    return sanitizeFileBaseName(raw || "songbook");
  }
  return getSuggestedBaseName();
}

async function runPrintAction(type) {
  if (!window.api) return;
  setStatus("Rendering…");
  const renderRes = await renderCurrentTuneSvgMarkupForPrint();
  if (!renderRes.ok) {
    setStatus("Error");
    logErr(renderRes.error || "Unable to render.");
    return;
  }
  const svgMarkup = applyPrintDebugMarkup(renderRes.svg);
  let res = null;
  if (type === "preview" && typeof window.api.printPreview === "function") {
    res = await window.api.printPreview(svgMarkup);
  } else if (type === "print" && typeof window.api.printDialog === "function") {
    res = await window.api.printDialog(svgMarkup);
  } else if (type === "pdf" && typeof window.api.exportPdf === "function") {
    res = await window.api.exportPdf(svgMarkup, getSuggestedBaseName());
  }
  if (res && res.ok) {
    setStatus("OK");
    if (type === "pdf" && res.path) {
      showToast(`Exported PDF: ${res.path}`);
    }
  } else if (res && res.error) {
    setStatus("Error");
    logErr(res.error);
  }
}

function ensureOnePerPageDirective(text) {
  const value = String(text || "");
  if (/^%%\s*oneperpage\b/im.test(value)) return value;
  const prefix = "%%oneperpage 1\n";
  if (!value.trim()) return prefix;
  if (value.startsWith("\ufeff")) {
    return `\ufeff${prefix}${value.slice(1)}`;
  }
  return `${prefix}${value}`;
}

function ensureAbc2svgModulesReady(content) {
  return new Promise((resolve) => {
    if (!window.abc2svg || !window.abc2svg.modules || typeof window.abc2svg.modules.load !== "function") {
      resolve(true);
      return;
    }
    const done = window.abc2svg.modules.load(content, () => resolve(true), () => resolve(false));
    if (done) resolve(true);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPrintTuneLabel(tune) {
  if (!tune) return "Untitled";
  const xPart = tune.xNumber ? `X:${tune.xNumber}` : "";
  const title = tune.title || tune.preview || "";
  return `${xPart} ${title}`.trim() || tune.id || "Untitled";
}

function buildPrintErrorCard(entry, tune, errors) {
  if (!errors || !errors.length) return "";
  const label = buildPrintTuneLabel(tune);
  const basename = entry && entry.basename ? entry.basename : "Tune";
  const seen = new Map();
  for (const err of errors) {
    const loc = err && err.loc ? `Line ${err.loc.line}, Col ${err.loc.col}` : "";
    const msg = err && err.message ? err.message : "Unknown error";
    const key = `${msg}|${loc}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const items = [];
  for (const [key, count] of seen.entries()) {
    const [msg, loc] = key.split("|");
    const locText = loc ? `<div class="print-error-loc">${escapeHtml(loc)}</div>` : "";
    const countText = count > 1 ? ` ×${count}` : "";
    items.push(`<li>${locText}<div class="print-error-msg">${escapeHtml(msg)}${countText}</div></li>`);
  }
  return `
    <div class="print-error-card">
      <div class="print-error-title">${escapeHtml(basename)} — ${escapeHtml(label)}</div>
      <ul class="print-error-list">
        ${items.join("")}
      </ul>
    </div>
  `;
}

function buildPrintErrorSummary(entry, items, totalTunes) {
  if (!items || !items.length) return "";
  const totalErrors = items.reduce((sum, item) => sum + item.count, 0);
  const list = items.map((item) => {
    const label = buildPrintTuneLabel(item.tune);
    const countText = item.count > 1 ? ` (${item.count})` : "";
    return `<li>${escapeHtml(label)}${countText}</li>`;
  }).join("");
  const basename = entry && entry.basename ? entry.basename : "Songbook";
  return `
    <div class="print-error-summary">
      <div class="print-error-title">${escapeHtml(basename)} — Print Summary</div>
      <div class="print-error-meta">Rendered ${totalTunes} tunes. ${items.length} tunes with issues (${totalErrors} errors).</div>
      <ul class="print-error-list">
        ${list}
      </ul>
    </div>
  `;
}

async function scanActiveFileForTuneErrors(entry) {
  if (!errorsEnabled) return;
  if (!entry || !entry.path) return;
  if (currentDoc && currentDoc.dirty) {
    const choice = await confirmUnsavedChanges("scanning error tunes");
    if (choice === "cancel") {
      tuneErrorScanInFlight = false;
      setScanErrorButtonState(false);
      return;
    }
    if (choice === "save") {
      const ok = await performSaveFlow();
      if (!ok) {
        tuneErrorScanInFlight = false;
        setScanErrorButtonState(false);
        return;
      }
    }
  }
  const token = ++tuneErrorScanToken;
  tuneErrorScanInFlight = true;
  setScanErrorButtonState(true);
  clearErrorIndexForFile(entry);
  const contentRes = await getFileContentCached(entry.path);
  if (!contentRes.ok) {
    tuneErrorScanInFlight = false;
    setScanErrorButtonState(false);
    return;
  }
  const tunes = entry.tunes || [];
  setErrorLineOffsetFromHeader("");
  const previousTuneId = activeTuneId;
  const previousEditorScroll = editorView && editorView.scrollDOM ? editorView.scrollDOM.scrollTop : 0;
  const previousRenderScroll = $renderPane ? $renderPane.scrollTop : 0;
  suppressRecentEntries = true;
  for (let i = 0; i < tunes.length; i += 1) {
    if (!tuneErrorFilter || token !== tuneErrorScanToken) {
      suppressRecentEntries = false;
      tuneErrorScanInFlight = false;
      setScanErrorButtonState(false);
      return;
    }
    const tune = tunes[i];
    if (!tune || !Number.isFinite(tune.startOffset) || !Number.isFinite(tune.endOffset)) {
      setLibraryErrorIndexForTune(tune && tune.id ? tune.id : "", 0);
      continue;
    }
    await selectTune(tune.id, { skipConfirm: true, suppressRecent: true });
    const hasError = Boolean(libraryErrorIndex.has(tune.id));
    setLibraryErrorIndexForTune(tune.id, hasError ? 1 : 0);
    if (i % 10 === 0) {
      setStatus(`Scanning error tunes… ${i + 1}/${tunes.length}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  suppressRecentEntries = false;
  let restoredTuneId = previousTuneId;
  if (tuneErrorFilter) {
    const firstErrorTune = tunes.find((tune) => tune && libraryErrorIndex.has(tune.id));
    if (firstErrorTune && firstErrorTune.id) {
      restoredTuneId = firstErrorTune.id;
    }
  }
  if (restoredTuneId && restoredTuneId !== activeTuneId) {
    await selectTune(restoredTuneId, { skipConfirm: true });
  }
  if (editorView && editorView.scrollDOM) editorView.scrollDOM.scrollTop = previousEditorScroll;
  if ($renderPane) $renderPane.scrollTop = previousRenderScroll;
  tuneErrorScanInFlight = false;
  setScanErrorButtonState(false);
  buildTuneSelectOptions(entry);
  setScanErrors(errorEntries);
  setStatus("OK");
}

async function renderAbcToSvgMarkup(abcText, options = {}) {
  const errors = [];
  try {
    ensureAbc2svgLoader();
    const normalized = normalizeHeaderNoneSpacing(abcText);
    const sepStrip = stripSepForRender(normalized);
    const renderText = sepStrip.text;
    const noteSepFallback = sepStrip.replaced;
    const ready = await ensureAbc2svgModulesReady(renderText);
    if (!ready) return { ok: false, error: "ABC modules failed to load." };
    const svgParts = [];
    const context = options && options.errorContext ? options.errorContext : null;
    const stopOnFirstError = Boolean(options && options.stopOnFirstError);
    const noSvg = Boolean(options && options.noSvg);
    const user = {
      img_out: (s) => {
        if (!noSvg) svgParts.push(s);
      },
      err: (msg) => {
        const entry = { message: String(msg) };
        errors.push(entry);
        if (!options || !options.suppressGlobalErrors) logErr(msg, null, context);
        if (stopOnFirstError) throw new Error(entry.message);
      },
      errmsg: (msg, line, col) => {
        const loc = Number.isFinite(line) && Number.isFinite(col)
          ? { line: line + 1, col: col + 1 }
          : null;
        const entry = { message: String(msg), loc };
        errors.push(entry);
        if (!options || !options.suppressGlobalErrors) logErr(msg, loc, context);
        if (stopOnFirstError) throw new Error(entry.message);
      },
    };
    const AbcCtor = getAbcCtor();
    if (!AbcCtor) return { ok: false, error: "abc2svg constructor not found." };
    const abc = new AbcCtor(user);
    abc.tosvg("out", renderText);
    if (window.abc2svg && typeof window.abc2svg.abc_end === "function") {
      window.abc2svg.abc_end();
    }
    const svg = svgParts.join("");
    if (noSvg) return { ok: true, svg: "", errors };
    if (!svg.trim()) return { ok: false, error: "No SVG output produced.", svg, errors };
    return { ok: true, svg, errors };
  } catch (e) {
    const message = (e && e.message) ? e.message : String(e);
    if (stopOnFirstError) return { ok: false, error: message, errors };
    return { ok: false, error: message };
  }
}

async function renderCurrentTuneSvgMarkupForPrint() {
  const payload = getRenderPayload();
  const text = payload && payload.text ? payload.text : "";
  if (!text.trim()) return { ok: false, error: "No notation to print." };
  return renderAbcToSvgMarkup(text);
}

async function getFileContentCached(filePath) {
  let content = fileContentCache.get(filePath);
  if (content == null) {
    const res = await readFile(filePath);
    if (!res.ok) return res;
    content = res.data;
    fileContentCache.set(filePath, content);
  }
  return { ok: true, data: content };
}

async function renderPrintAllSvgMarkup(entry, content, options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  if (!entry || !entry.tunes || !entry.tunes.length) {
    return { ok: false, error: "No tunes to print." };
  }
  const debug = Boolean(window.__abcarusDebugPrintAll);
  const debugInfo = debug ? {
    file: entry.path || "",
    totalTunes: entry.tunes.length,
    rendered: 0,
    skipped: 0,
    tunes: [],
  } : null;
  const parts = [];
  const summary = [];
  for (let i = 0; i < entry.tunes.length; i += 1) {
    const tune = entry.tunes[i];
    if (onProgress && (i % 5 === 0 || i === entry.tunes.length - 1)) {
      onProgress(i + 1, entry.tunes.length);
    }
    if (!tune || !Number.isFinite(tune.startOffset) || !Number.isFinite(tune.endOffset)) {
      if (debugInfo) debugInfo.skipped += 1;
      continue;
    }
    const tuneText = String(content || "").slice(tune.startOffset, tune.endOffset);
    if (!tuneText.trim()) {
      if (debugInfo) debugInfo.skipped += 1;
      continue;
    }
    const effectiveHeader = (entry && entry.path && entry.path === activeFilePath) ? getHeaderEditorValue() : (entry.headerText || "");
    const prefix = buildHeaderPrefix(effectiveHeader, false, tuneText);
    const block = prefix.text ? `${prefix.text}${tuneText}` : tuneText;
    const meta = debugInfo ? {
      id: tune.id,
      xNumber: tune.xNumber,
      title: tune.title || "",
      startOffset: tune.startOffset,
      endOffset: tune.endOffset,
      hasX: /^\s*X:/.test(tuneText),
      headerKeys: collectHeaderKeys(tuneText).size,
      blockLength: block.length,
    } : null;
    const context = {
      tuneId: tune.id,
      filePath: entry.path || null,
      fileBasename: entry.basename || "",
      tuneLabel: buildPrintTuneLabel(tune),
      xNumber: tune.xNumber || "",
      title: tune.title || "",
      skipMeasureRange: true,
    };
    setErrorLineOffsetFromHeader(prefix.text);
    const res = await renderAbcToSvgMarkup(block, { errorContext: context });
    const tuneErrors = res.errors ? res.errors.slice() : [];
    if (!res.ok && res.error) {
      tuneErrors.push({ message: res.error });
      logErr(res.error, null, context);
    }
    const tuneMarkup = [];
    if (res.svg && res.svg.trim()) {
      tuneMarkup.push(res.svg.trim());
    }
    if (tuneErrors.length) {
      const uniqueKeys = new Set(tuneErrors.map((err) => {
        const msg = err && err.message ? err.message : "Unknown error";
        const loc = err && err.loc ? `Line ${err.loc.line}, Col ${err.loc.col}` : "";
        return `${msg}|${loc}`;
      }));
      summary.push({ tune, count: uniqueKeys.size });
      setLibraryErrorIndexForTune(tune.id, uniqueKeys.size);
    } else {
      setLibraryErrorIndexForTune(tune.id, 0);
    }
    if (tuneMarkup.length) {
      parts.push(`<div class="print-tune">${tuneMarkup.join("\n")}</div>`);
      if (debugInfo && meta) {
        meta.svgLength = res.svg.length;
        debugInfo.rendered += 1;
        debugInfo.tunes.push(meta);
      }
    } else if (debugInfo && meta) {
      meta.svgLength = 0;
      debugInfo.tunes.push(meta);
      debugInfo.skipped += 1;
    }
  }
  setErrorLineOffsetFromHeader("");
  if (!parts.length) return { ok: false, error: "No SVG output produced." };
  const svg = parts.join("\n");
  if (debugInfo) {
    debugInfo.svgParts = parts.length;
    console.info("[print-all]", debugInfo);
    window.__abcarusDebugPrintAllSvg = svg;
  }
  return { ok: true, svg };
}

async function runPrintAllAction(type) {
  if (!window.api) return;
  const entry = getActiveFileEntry();
  if (!entry || !entry.path) {
    setStatus("No active file to print.");
    return;
  }
  if (currentDoc && currentDoc.dirty) {
    const choice = await confirmUnsavedChanges("printing all tunes");
    if (choice === "cancel") return;
    if (choice === "save") {
      const ok = await performSaveFlow();
      if (!ok) return;
    }
  }

  const contentRes = await getFileContentCached(entry.path);
  if (!contentRes.ok) {
    setStatus("Error");
    logErr(contentRes.error || "Unable to read file.");
    return;
  }
  setStatus("Rendering…");
  const renderRes = await renderPrintAllSvgMarkup(entry, contentRes.data || "", {
    onProgress: (current, total) => {
      setStatus(`Rendering tunes… ${current}/${total}`);
    },
  });
  if (!renderRes.ok) {
    setStatus("Error");
    logErr(renderRes.error || "Unable to render.");
    return;
  }
  const svgMarkup = applyPrintDebugMarkup(renderRes.svg);

  let res = null;
  if (type === "preview" && typeof window.api.printPreview === "function") {
    res = await window.api.printPreview(svgMarkup);
  } else if (type === "print" && typeof window.api.printDialog === "function") {
    res = await window.api.printDialog(svgMarkup);
  } else if (type === "pdf" && typeof window.api.exportPdf === "function") {
    res = await window.api.exportPdf(svgMarkup, getSongbookSuggestedBaseName());
  }

  if (res && res.ok) {
    setStatus("OK");
    if (type === "pdf" && res.path) {
      showToast(`Exported PDF: ${res.path}`);
    }
  } else if (res && res.error) {
    setStatus("Error");
    logErr(res.error);
  }
}

function setCurrentDocument(doc) {
  currentDoc = doc;
  updateUIFromDocument(doc);
}

function clearCurrentDocument() {
  currentDoc = null;
  showEmptyState();
}

function updateUIFromDocument(doc) {
  suppressDirty = true;
  setEditorValue(doc ? doc.content : "");
  suppressDirty = false;
  renderNow();
}

function showEmptyState() {
  suppressDirty = true;
  setEditorValue("");
  suppressDirty = false;
  $out.innerHTML = "";
  activeTuneMeta = null;
  activeTuneId = null;
  activeFilePath = null;
  headerDirty = false;
  setTuneMetaText("Untitled");
  setFileNameMeta("Untitled");
  clearErrors();
  setStatus("Ready");
  updateFileHeaderPanel();
  updateHeaderStateUI();
}

function getAbcCtor() {
  return (window.abc2svg && window.abc2svg.Abc) ? window.abc2svg.Abc : window.Abc;
}

function ensureAbc2svgLoader() {
  if (!window.abc2svg || window.abc2svg.__abcarusLoader) return;
  const base = new URL("../../third_party/abc2svg/", window.location.href).href;
  const loaded = new Set();
  window.abc2svg.loadjs = (fn, relay, onerror) => {
    if (loaded.has(fn)) {
      if (relay) relay();
      return;
    }
    const script = document.createElement("script");
    script.src = `${base}${fn}`;
    script.async = true;
    script.onload = () => {
      loaded.add(fn);
      if (relay) relay();
    };
    script.onerror = () => {
      if (onerror) onerror(fn);
    };
    document.head.appendChild(script);
  };
  window.abc2svg.__abcarusLoader = true;
}

function ensureAbc2svgModules(content) {
  if (!window.abc2svg || !window.abc2svg.modules || typeof window.abc2svg.modules.load !== "function") {
    return true;
  }
  return window.abc2svg.modules.load(content, renderNow, logErr);
}

function normalizeHeaderNoneSpacing(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  for (const line of lines) {
    const match = line.match(/^(\s*[KM]:)(\s+)(none\b.*)$/i);
    if (match) {
      const lead = match[1];
      const gap = match[2] || "";
      const rest = match[3] || "";
      out.push(`${lead}${rest}${" ".repeat(gap.length)}`);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

function assertCleanAbcText(text, originLabel) {
  const src = String(text || "");
  if (src.includes("[object Object]")) {
    console.error(`[abcarus] ABC text corruption detected (${originLabel || "unknown"}): contains "[object Object]"`);
    return false;
  }
  return true;
}

function stripSepForRender(text) {
  const value = String(text || "");
  const stripped = value.replace(/^[ \t]*%%sep\b.*$/gmi, "% %%sep disabled");
  return { text: stripped, replaced: stripped !== value };
}

function normalizeBarToken(token) {
  if (!token) return "";
  if (
    token.includes("|:") ||
    token.includes(":|") ||
    token.includes("|1") ||
    token.includes("|2") ||
    token.includes("[1") ||
    token.includes("[2")
  ) {
    return "|";
  }
  return token;
}

function hasRepeatTokens(text) {
  return /(\|\:|\:\||\|1|\|2|\[1|\[2)/.test(text);
}

function expandRepeatsInString(line) {
  const value = String(line || "").trim();
  if (!value || !hasRepeatTokens(value)) return line;
  const bars = [];
  let current = "";
  let startToken = "";
  let inQuote = false;
  for (let i = 0; i < value.length; ) {
    const ch = value[i];
    if (ch === "\"") {
      inQuote = !inQuote;
      current += ch;
      i += 1;
      continue;
    }
    if (!inQuote) {
      const token = matchBarToken(value, i);
      if (token) {
        bars.push({ startToken, content: current.trim() });
        startToken = token.token;
        current = "";
        i += token.len;
        continue;
      }
    }
    current += ch;
    i += 1;
  }
  if (current.trim() || startToken) {
    bars.push({ startToken, content: current.trim() });
  }
  if (bars.length === 0) return line;

  const out = [];
  let repeatStart = null;
  let firstEndStart = null;
  let secondEndStart = null;

  const emitBars = (slice) => {
    for (const bar of slice) {
      const token = normalizeBarToken(bar.startToken);
      if (bar.content) out.push(`${token}${bar.content}`);
      else if (token) out.push(token);
    }
  };

  for (let i = 0; i < bars.length; i += 1) {
    const token = bars[i].startToken || "";
    if (token.includes("|:")) {
      repeatStart = i;
      continue;
    }
    if (repeatStart != null && (token.includes("|1") || token.includes("[1"))) {
      firstEndStart = i;
      continue;
    }
    if (repeatStart != null && (token.includes("|2") || token.includes("[2"))) {
      secondEndStart = i;
      continue;
    }
    if (repeatStart != null && token.includes(":|")) {
      const repeatEnd = i;
      if (firstEndStart != null && secondEndStart != null) {
        const partA = bars.slice(repeatStart + 1, firstEndStart);
        const partB = bars.slice(firstEndStart, secondEndStart);
        const partC = bars.slice(secondEndStart, repeatEnd);
        emitBars(partA);
        emitBars(partB);
        emitBars(partA);
        emitBars(partC);
      } else {
        const part = bars.slice(repeatStart + 1, repeatEnd);
        emitBars(part);
        emitBars(part);
      }
      repeatStart = null;
      firstEndStart = null;
      secondEndStart = null;
      continue;
    }
    if (repeatStart == null) {
      emitBars([bars[i]]);
    }
  }

  if (!out.length) {
    emitBars(bars);
  }
  return out.join(" ");
}

function expandRepeatsForPlayback(text) {
  if (!hasRepeatTokens(String(text || ""))) return text;
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let buffer = [];
  let inBody = false;

  const flushBuffer = () => {
    if (!buffer.length) return;
    const expanded = expandRepeatsInString(buffer.join(" "));
    out.push(expanded);
    buffer = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!inBody && /^K:/.test(trimmed)) {
      flushBuffer();
      out.push(rawLine);
      inBody = true;
      continue;
    }
    if (!inBody || /^%/.test(trimmed) || /^%%/.test(trimmed) || /^[Ww]:/.test(trimmed)
      || (/^[A-Za-z]:/.test(trimmed) && !/^V:/.test(trimmed))) {
      flushBuffer();
      out.push(rawLine);
      continue;
    }
    if (/^V:/.test(trimmed)) {
      flushBuffer();
      out.push(rawLine);
      continue;
    }
    buffer.push(rawLine);
  }
  flushBuffer();
  return out.join("\n");
}

function renderNow() {
  clearNoteSelection();
  clearErrors();
  $out.innerHTML = "";
  const currentText = getEditorValue();
  if (!currentText.trim()) {
    setStatus("Ready");
    updateLibraryErrorIndexFromCurrentErrors();
    reconcileActiveErrorHighlightAfterRender({ renderSucceeded: true });
    return;
  }
  const renderPayload = getRenderPayload();
  if (!assertCleanAbcText(renderPayload.text, "renderNow")) {
    logErr("ABC text corruption detected (render).");
    setStatus("Error");
    updateLibraryErrorIndexFromCurrentErrors();
    return;
  }
  let renderText = normalizeHeaderNoneSpacing(renderPayload.text);
  const sepStrip = stripSepForRender(renderText);
  renderText = sepStrip.text;
  const sepFallbackUsed = sepStrip.replaced;
  lastRenderPayload = {
    text: renderText,
    offset: renderPayload.offset || 0,
  };
  setErrorLineOffsetFromHeader(renderPayload.text.slice(0, renderPayload.offset || 0));
  setStatus("Rendering…");

  try {
    ensureAbc2svgLoader();
    if (!ensureAbc2svgModules(renderText)) {
      setStatus("Loading modules…");
      return;
    }

    let attempts = 0;
    while (attempts < 2) {
      try {
        const svgParts = [];
        let abcInstance = null;

        const user = {
          img_out: (s) => svgParts.push(s),
          err: (msg) => logErr(msg),
          errmsg: (msg, line, col) => {
            const loc = Number.isFinite(line) && Number.isFinite(col)
              ? { line: line + 1, col: col + 1 }
              : null;
            logErr(msg, loc);
          },
          anno_stop: (type, start, stop, x, y, w, h) => {
            if (!abcInstance) return;
            if (type === "beam" || type === "slur" || type === "tuplet") return;
            const cls = type === "bar" ? "bar-hl" : "note-hl";
            abcInstance.out_svg(
              '<rect class="' + cls + ' _' + start + '_" data-start="' + start + '" data-end="' + stop + '" x="'
            );
            abcInstance.out_sxsy(x, '" y="', y);
            abcInstance.out_svg(
              '" width="' + w.toFixed(2) + '" height="' + abcInstance.sh(h).toFixed(2) + '"/>\n'
            );
          },
        };

        const AbcCtor = getAbcCtor();
        if (!AbcCtor) throw new Error("abc2svg constructor not found. Check third_party/abc2svg scripts.");

        const abc = new AbcCtor(user);
        abcInstance = abc;
        abc.tosvg("out", renderText);

        const svg = svgParts.join("");
        if (!svg.trim()) throw new Error("No SVG output produced (see errors).");
        $out.innerHTML = svg;
        applyMeasureHighlights(renderPayload.offset || 0);
        // Keep notation synced to the editor selection (especially after edits re-render the SVG).
        if (editorView) {
          const anchor = editorView.state.selection.main.anchor;
          highlightNoteAtIndex(anchor);
          if (errorActivationHighlightRange && Number.isFinite(errorActivationHighlightRange.from)) {
            highlightSvgAtEditorOffset(errorActivationHighlightRange.from);
          }
        }
        if (sepFallbackUsed) {
          setBufferStatus("Note: %%sep ignored for rendering.");
        }
        setStatus("OK");
        updateLibraryErrorIndexFromCurrentErrors();
        reconcileActiveErrorHighlightAfterRender({ renderSucceeded: true });
        break;
      } catch (e) {
        throw e;
      }
    }
  } catch (e) {
    logErr((e && e.stack) ? e.stack : String(e));
    setStatus("Error");
    updateLibraryErrorIndexFromCurrentErrors();
    reconcileActiveErrorHighlightAfterRender({ renderSucceeded: false });
  }
}

initEditor();
initSearchPanelShortcuts();
initHeaderEditor();
setHeaderCollapsed(headerCollapsed);
setCurrentDocument(createBlankDocument());
updateWindowTitle();
updateHeaderStateUI();
initPaneResizer();
initRightPaneResizer();
initSidebarResizer();
setLibraryVisible(false);

// Preload soundfont in background to avoid first-play delay.
(async () => {
  try {
    await ensureSoundfontLoaded();
    setStatus("OK");
  } catch (e) {
    logErr((e && e.stack) ? e.stack : String(e));
    setStatus("Error");
  }
})();

checkExternalTools().catch(() => {});

function serializeDocument(doc) {
  return doc.content;
}

function deserializeToDocument(data) {
  return {
    path: null,
    dirty: false,
    content: data,
  };
}

async function confirmUnsavedChanges(contextLabel) {
  if (!window.api || typeof window.api.confirmUnsavedChanges !== "function") return "cancel";
  return window.api.confirmUnsavedChanges(contextLabel);
}

async function confirmOverwrite(filePath) {
  if (!window.api || typeof window.api.confirmOverwrite !== "function") return "cancel";
  return window.api.confirmOverwrite(filePath);
}

async function confirmAppendToFile(filePath) {
  if (!window.api || typeof window.api.confirmAppendToFile !== "function") return "cancel";
  return window.api.confirmAppendToFile(filePath);
}

async function confirmDeleteTune(label) {
  if (!window.api || typeof window.api.confirmDeleteTune !== "function") return "cancel";
  return window.api.confirmDeleteTune(label);
}

async function showOpenDialog() {
  if (!window.api || typeof window.api.showOpenDialog !== "function") return null;
  return window.api.showOpenDialog();
}

async function showSaveDialog(suggestedName, suggestedDir) {
  if (!window.api || typeof window.api.showSaveDialog !== "function") return null;
  return window.api.showSaveDialog(suggestedName, suggestedDir);
}

async function showOpenFolderDialog() {
  if (!window.api || typeof window.api.showOpenFolderDialog !== "function") return null;
  return window.api.showOpenFolderDialog();
}

async function mkdirp(dirPath) {
  if (!window.api || typeof window.api.mkdirp !== "function") return { ok: false, error: "API missing" };
  return window.api.mkdirp(dirPath);
}

async function writeFile(filePath, data) {
  if (!window.api || typeof window.api.writeFile !== "function") return { ok: false, error: "API missing" };
  return window.api.writeFile(filePath, data);
}

async function renameFile(oldPath, newPath) {
  if (!window.api || typeof window.api.renameFile !== "function") return { ok: false, error: "API missing" };
  return window.api.renameFile(oldPath, newPath);
}

async function readFile(filePath) {
  if (!window.api || typeof window.api.readFile !== "function") return { ok: false, error: "API missing" };
  return window.api.readFile(filePath);
}

async function fileExists(filePath) {
  if (!window.api || typeof window.api.fileExists !== "function") return false;
  return window.api.fileExists(filePath);
}

function safeBasename(filePath) {
  if (window.api && typeof window.api.pathBasename === "function") {
    return window.api.pathBasename(filePath);
  }
  return String(filePath || "").split("/").pop() || "";
}

function safeDirname(filePath) {
  if (window.api && typeof window.api.pathDirname === "function") {
    return window.api.pathDirname(filePath);
  }
  return String(filePath || "").split("/").slice(0, -1).join("/");
}

function countLines(text) {
  if (!text) return 1;
  return text.split(/\r\n|\n|\r/).length;
}

function updateLibraryAfterSave(filePath, startOffset, oldEndOffset, newEndOffset, deltaLen, deltaLines, newLineCount) {
  if (!libraryIndex) return;
  const fileEntry = libraryIndex.files.find((f) => f.path === filePath);
  if (!fileEntry) return;

  for (const tune of fileEntry.tunes) {
    if (tune.startOffset === startOffset && tune.endOffset === oldEndOffset) {
      tune.endOffset = newEndOffset;
      tune.endLine = tune.startLine + newLineCount - 1;
    } else if (tune.startOffset >= oldEndOffset) {
      tune.startOffset += deltaLen;
      tune.endOffset += deltaLen;
      tune.startLine += deltaLines;
      tune.endLine += deltaLines;
      tune.id = `${filePath}::${tune.startOffset}`;
    } else if (tune.endOffset > oldEndOffset) {
      tune.endOffset += deltaLen;
      tune.endLine += deltaLines;
    }
  }

  renderLibraryTree();
  markActiveTuneButton(activeTuneId);
}

async function saveActiveTuneToSource() {
  if (!activeTuneMeta || !activeTuneMeta.path) {
    return { ok: false, error: "No active tune to save." };
  }
  const filePath = activeTuneMeta.path;
  let content = fileContentCache.get(filePath);
  if (content == null) {
    const res = await readFile(filePath);
    if (!res.ok) return res;
    content = res.data;
    fileContentCache.set(filePath, content);
  }

  const startOffset = activeTuneMeta.startOffset;
  const endOffset = activeTuneMeta.endOffset;
  let newText = getEditorValue();
  const oldText = content.slice(startOffset, endOffset);
  const expectedX = String(activeTuneMeta.xNumber || "");
  if (expectedX) {
    const trimmed = oldText.replace(/^\s+/, "");
    const xMatch = trimmed.match(/^X:\s*(\d+)/);
    if (!xMatch || xMatch[1] !== expectedX) {
      return {
        ok: false,
        error: `Refusing to save: tune offsets look stale (expected X:${expectedX}). Reload the tune and try again.`,
      };
    }
  } else {
    const trimmed = oldText.replace(/^\s+/, "");
    if (!/^X:\s*\d+/.test(trimmed)) {
      return {
        ok: false,
        error: "Refusing to save: tune offsets look stale. Reload the tune and try again.",
      };
    }
  }
  const oldEndsWithNewline = /\r?\n$/.test(oldText);
  const newEndsWithNewline = /\r?\n$/.test(newText);
  if (oldEndsWithNewline && !newEndsWithNewline) {
    const newline = oldText.endsWith("\r\n") ? "\r\n" : "\n";
    newText += newline;
  }
  const updated = content.slice(0, startOffset) + newText + content.slice(endOffset);
  const res = await writeFile(filePath, updated);
  if (!res.ok) return res;

  fileContentCache.set(filePath, updated);
  const deltaLen = newText.length - (endOffset - startOffset);
  const oldLineCount = countLines(oldText);
  const newLineCount = countLines(newText);
  const deltaLines = newLineCount - oldLineCount;
  const newEndOffset = startOffset + newText.length;

  updateLibraryAfterSave(filePath, startOffset, endOffset, newEndOffset, deltaLen, deltaLines, newLineCount);

  activeTuneMeta.endOffset = newEndOffset;
  activeTuneMeta.endLine = activeTuneMeta.startLine + newLineCount - 1;
  return { ok: true };
}

async function showSaveError(message) {
  if (!window.api || typeof window.api.showSaveError !== "function") return;
  await window.api.showSaveError(message);
}

async function showOpenError(message) {
  if (!window.api || typeof window.api.showOpenError !== "function") return;
  await window.api.showOpenError(message);
}

async function openExternal(url) {
  if (!window.api || typeof window.api.openExternal !== "function") return;
  const res = await window.api.openExternal(url);
  if (res && res.error) logErr(res.error);
}

function nowCompactStamp() {
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

function safeString(value, maxLen = 250000) {
  const s = String(value == null ? "" : value);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}\n\n…(truncated ${s.length - maxLen} chars)…`;
}

function safeJsonStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (k, v) => {
      if (typeof v === "object" && v) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      if (typeof v === "string" && v.length > 250000) return safeString(v);
      return v;
    },
    2
  );
}

async function buildDebugDumpSnapshot() {
  let aboutInfo = null;
  if (window.api && typeof window.api.getAboutInfo === "function") {
    try { aboutInfo = await window.api.getAboutInfo(); } catch {}
  }

  const playbackDebug = (window.__abcarusPlaybackDebug && typeof window.__abcarusPlaybackDebug === "object")
    ? window.__abcarusPlaybackDebug
    : null;

  const playbackPayload = (() => {
    try {
      if (lastPlaybackPayloadCache && lastPlaybackPayloadCache.text) {
        return {
          text: safeString(lastPlaybackPayloadCache.text, 350000),
          offset: lastPlaybackPayloadCache.offset || 0,
          cached: true,
        };
      }
      const p = getPlaybackPayload();
      return {
        text: safeString(p && p.text ? p.text : "", 350000),
        offset: p && p.offset ? p.offset : 0,
        cached: false,
      };
    } catch (e) {
      return { error: (e && e.message) ? e.message : String(e) };
    }
  })();

  return {
    kind: "abcarus-debug-dump",
    createdAt: new Date().toISOString(),
    about: aboutInfo,
    debugLog: debugLogBuffer.slice(),
    selection: editorView ? {
      anchor: editorView.state.selection.main.anchor,
      head: editorView.state.selection.main.head,
    } : null,
    document: {
      currentDocPath: currentDoc ? (currentDoc.path || null) : null,
      currentDocDirty: currentDoc ? Boolean(currentDoc.dirty) : null,
      activeTuneMeta: activeTuneMeta ? {
        id: activeTuneMeta.id || null,
        path: activeTuneMeta.path || null,
        basename: activeTuneMeta.basename || null,
        xNumber: activeTuneMeta.xNumber || null,
        title: activeTuneMeta.title || null,
        startOffset: activeTuneMeta.startOffset || null,
        endOffset: activeTuneMeta.endOffset || null,
        startLine: activeTuneMeta.startLine || null,
        endLine: activeTuneMeta.endLine || null,
      } : null,
      header: {
        presence: (typeof computeHeaderPresence === "function") ? computeHeaderPresence() : null,
        dirty: Boolean(headerDirty),
        collapsed: Boolean(headerCollapsed),
      },
      editorText: safeString(getEditorValue(), 350000),
      headerText: safeString(getHeaderEditorValue(), 250000),
    },
    playback: {
      isPlaying: Boolean(isPlaying),
      isPaused: Boolean(isPaused),
      waitingForFirstNote: Boolean(waitingForFirstNote),
      followPlayback: Boolean(followPlayback),
      followVoiceId,
      followVoiceIndex,
      soundfontName: soundfontName || null,
      soundfontSource: soundfontSource || null,
      playbackIndexOffset,
      playbackRange: clonePlaybackRange(playbackRange),
      activePlaybackRange: activePlaybackRange ? clonePlaybackRange(activePlaybackRange) : null,
      activePlaybackEndAbcOffset,
      payload: playbackPayload,
      debugState: playbackDebug && typeof playbackDebug.getState === "function" ? playbackDebug.getState() : null,
      timeline: playbackDebug && typeof playbackDebug.getTimeline === "function" ? playbackDebug.getTimeline() : null,
      trace: playbackDebug && typeof playbackDebug.getTrace === "function" ? playbackDebug.getTrace() : playbackNoteTrace.slice(),
      lastRhythmErrorSuggestion,
    },
    render: {
      lastRenderPayload: lastRenderPayload ? {
        offset: lastRenderPayload.offset || 0,
        text: lastRenderPayload.text ? safeString(lastRenderPayload.text, 350000) : "",
      } : null,
    },
    errors: {
      count: Array.isArray(errorEntries) ? errorEntries.length : null,
      activeHighlight: activeErrorHighlight ? {
        id: activeErrorHighlight.id,
        from: activeErrorHighlight.from,
        to: activeErrorHighlight.to,
        tuneId: activeErrorHighlight.tuneId,
        filePath: activeErrorHighlight.filePath,
        message: activeErrorHighlight.message,
        messageKey: activeErrorHighlight.messageKey,
        lastSvgRenderIdx: activeErrorHighlight.lastSvgRenderIdx,
      } : null,
      entries: Array.isArray(errorEntries)
        ? errorEntries.slice(0, 200).map((e) => ({
          message: e.message,
          loc: e.loc || null,
          tuneId: e.tuneId || null,
          filePath: e.filePath || null,
          xNumber: e.xNumber || null,
          title: e.title || null,
          count: e.count || 1,
        }))
        : null,
    },
  };
}

async function dumpDebugToFile(filePathArg) {
  try {
    const suggested = `abcarus-debug-${nowCompactStamp()}.json`;
    let suggestedDir = "";
    try {
      const href = String(window.location && window.location.href ? window.location.href : "");
      if (href.startsWith("file://") && window.api && typeof window.api.pathDirname === "function" && typeof window.api.pathJoin === "function") {
        const p = decodeURIComponent(new URL(href).pathname || "");
        if (p.includes("/src/renderer/")) {
          const rendererDir = window.api.pathDirname(p);
          const srcDir = window.api.pathDirname(rendererDir);
          const rootDir = window.api.pathDirname(srcDir);
          suggestedDir = window.api.pathJoin(rootDir, "debug_dumps");
        }
      }
    } catch {}
    if (!suggestedDir) {
      suggestedDir = activeTuneMeta && activeTuneMeta.path ? safeDirname(activeTuneMeta.path) : "";
    }
    if (suggestedDir) {
      const res = await mkdirp(suggestedDir);
      if (!res || !res.ok) {
        suggestedDir = activeTuneMeta && activeTuneMeta.path ? safeDirname(activeTuneMeta.path) : "";
      }
    }
    const filePath = filePathArg || (await showSaveDialog(suggested, suggestedDir));
    if (!filePath) return { ok: false, cancelled: true };
    const snapshot = await buildDebugDumpSnapshot();
    const json = safeJsonStringify(snapshot);
    const res = await writeFile(filePath, json);
    if (!res || !res.ok) {
      await showSaveError((res && res.error) ? res.error : "Unable to write debug dump.");
      return { ok: false, error: (res && res.error) ? res.error : "Unable to write debug dump." };
    }
    showToast(`Saved debug dump: ${safeBasename(filePath)}`, 3000);
    return { ok: true, path: filePath };
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    await showSaveError(msg);
    return { ok: false, error: msg };
  }
}

window.dumpDebugToFile = dumpDebugToFile;

function formatAboutInfo(info) {
  if (!info) return "No system info available.";
  const osParts = [info.platform, info.arch, info.osRelease].filter(Boolean).join(" ").trim();
  const distro = info.distroPrettyName
    || [info.distroName, info.distroVersion].filter(Boolean).join(" ").trim()
    || "";
  return [
    `Version: ${info.appVersion || ""}`.trim(),
    `Build: ${info.build || ""}`.trim(),
    `Commit: ${info.commit || ""}`.trim(),
    `Channel: ${info.channel || ""}`.trim(),
    "Status: Early-stage release (functional, not yet guaranteed stable).",
    "Disclaimer: docs/DISCLAIMER.md",
    `Date: ${info.buildDate || ""}`.trim(),
    `Electron: ${info.electron || ""}`.trim(),
    `ElectronBuildId: ${info.electronBuildId || ""}`.trim(),
    `Chromium: ${info.chrome || ""}`.trim(),
    `Node.js: ${info.node || ""}`.trim(),
    `V8: ${info.v8 || ""}`.trim(),
    `OS: ${osParts}`.trim(),
    distro ? `Distro: ${distro}` : "",
    info.sessionType ? `Session: ${info.sessionType}` : "",
    (info.xdgCurrentDesktop || info.desktopSession || info.desktop) ? `Desktop: ${info.xdgCurrentDesktop || info.desktopSession || info.desktop}` : "",
    (info.waylandDisplay || info.display) ? `Display: ${(info.waylandDisplay ? `wayland:${info.waylandDisplay}` : "")}${(info.waylandDisplay && info.display) ? " " : ""}${(info.display ? `x11:${info.display}` : "")}` : "",
    (info.lcAll || info.lang) ? `Locale: ${info.lcAll || info.lang}` : "",
    info.pythonVersion ? `Python: ${info.pythonVersion}` : "",
  ].filter(Boolean).join("\n");
}

let libraryListYieldedByThisOpen = false;
document.addEventListener("library-modal:closed", () => {
  if (!libraryListYieldedByThisOpen) return;
  document.body.classList.remove("library-list-open");
  libraryListYieldedByThisOpen = false;
});

function openLibraryListFromCurrentLibraryIndex() {
  if (!libraryIndex || !libraryIndex.root || !Array.isArray(libraryIndex.files) || !libraryIndex.files.length) {
    setStatus("Load a library folder first.");
    return false;
  }
  if (!window.openLibraryModal) return false;

  const pad2 = (n) => String(n).padStart(2, "0");
  const formatYmd = (ms) => {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const rows = [];
  for (const file of libraryIndex.files) {
    const modified = file && file.updatedAtMs ? formatYmd(file.updatedAtMs) : "";
    const filePath = file && file.path ? file.path : "";
    const fileLabel = file && file.basename ? file.basename : safeBasename(filePath);
    const tunes = file && Array.isArray(file.tunes) ? file.tunes : [];
    for (const tune of tunes) {
      const xNumber = tune && tune.xNumber != null ? tune.xNumber : "";
      rows.push({
        file: fileLabel,
        filePath,
        tuneId: tune && tune.id ? tune.id : "",
        tuneNo: xNumber,
        xNumber,
        title: tune && (tune.title || tune.preview) ? (tune.title || tune.preview) : "",
        composer: tune && tune.composer ? tune.composer : "",
        origin: tune && tune.origin ? tune.origin : "",
        group: tune && tune.group ? tune.group : "",
        key: tune && tune.key ? tune.key : "",
        meter: tune && tune.meter ? tune.meter : "",
        tempo: tune && tune.tempo ? tune.tempo : "",
        rhythm: tune && tune.rhythm ? tune.rhythm : "",
        modified,
      });
    }
  }

  libraryListYieldedByThisOpen = false;
  if (isLibraryVisible) {
    document.body.classList.add("library-list-open");
    libraryListYieldedByThisOpen = true;
  }

  window.openLibraryModal(rows);
  return true;
}

async function openAbout() {
  if (!$aboutModal || !$aboutInfo) return;
  let infoText = "Loading…";
  $aboutInfo.textContent = infoText;
  $aboutModal.classList.add("open");
  $aboutModal.setAttribute("aria-hidden", "false");
  if (window.api && typeof window.api.getAboutInfo === "function") {
    const info = await window.api.getAboutInfo();
    infoText = formatAboutInfo(info);
  }
  $aboutInfo.textContent = infoText;
}

function closeAbout() {
  if (!$aboutModal) return;
  $aboutModal.classList.remove("open");
  $aboutModal.setAttribute("aria-hidden", "true");
}

function showDisclaimerIfNeeded(settings) {
  if (disclaimerShown) return;
  if (!$disclaimerModal || !$disclaimerOk) return;
  if (!settings || settings.disclaimerSeen) return;
  disclaimerShown = true;
  $disclaimerModal.classList.add("open");
  $disclaimerModal.setAttribute("aria-hidden", "false");
}

async function dismissDisclaimer() {
  if (!$disclaimerModal) return;
  $disclaimerModal.classList.remove("open");
  $disclaimerModal.setAttribute("aria-hidden", "true");
  if (window.api && typeof window.api.updateSettings === "function") {
    await window.api.updateSettings({ disclaimerSeen: true });
  }
}

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

function normalizeMeasuresLineBreaks(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    const next = lines[i + 1];
    const prev = out.length ? out[out.length - 1] : "";
    const nextIsComment = next && /^\s*%/.test(next);
    const prevIsComment = /^\s*%/.test(prev || "");
    if (/^\s*%Error\b/i.test(line)) {
      out.push("%");
      continue;
    }
    if (next && /^\s*%/.test(next) && /\\\s*$/.test(line)) {
      line = line.replace(/\\\s*$/, "");
    }
    if (line.trim() === "\\") {
      out.push("%");
      continue;
    }
    if (!line.trim() && (nextIsComment || prevIsComment)) {
      out.push("%");
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function stripInlineCommentsForMeasures(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  for (const line of lines) {
    let idx = -1;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === "%" && line[i - 1] !== "\\") {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      out.push(line);
      continue;
    }
    const before = line.slice(0, idx);
    if (!before.trim()) {
      out.push(line);
      continue;
    }
    out.push(before.replace(/\s+$/, ""));
  }
  return out.join("\n");
}

async function applyAbc2abcTransform(options) {
  const abcText = getEditorValue();
  if (!abcText.trim()) {
    setStatus("No notation to transform.");
    return;
  }
  if (options.doubleLengths && options.halfLengths) {
    await showSaveError("Choose either double or half note lengths, not both.");
    return;
  }
  const hasOnlyLengthTransform = (options.doubleLengths || options.halfLengths)
    && options.transposeSemitones == null
    && !options.measuresPerLine
    && !options.voice
    && options.renumberX == null;
  if (hasOnlyLengthTransform) {
    const mode = options.doubleLengths ? "double" : "half";
    const transformed = transformLengthScaling(abcText, mode);
    applyTransformedText(transformed);
    setStatus("OK");
    return;
  }
  const hasOnlyTranspose = options.transposeSemitones != null
    && !options.measuresPerLine
    && !options.voice
    && options.renumberX == null
    && !options.doubleLengths
    && !options.halfLengths;
  if (hasOnlyTranspose) {
    const transformed = transformTranspose(abcText, Number(options.transposeSemitones));
    const aligned = alignBarsInText(transformed);
    applyTransformedText(aligned);
    setStatus("OK");
    return;
  }
  if (!window.api || typeof window.api.runAbc2abc !== "function") return;
  setStatus("Running abc2abc…");
  const abcInput = options.measuresPerLine
    ? stripInlineCommentsForMeasures(abcText)
    : abcText;
  const res = await window.api.runAbc2abc(abcInput, options);
  if (!res || res.canceled) {
    setStatus("Ready");
    return;
  }
  if (!res.ok) {
    const msg = formatConversionError(res);
    logErr(msg);
    setStatus("Error");
    await showSaveError(msg);
    return;
  }
  const transformed = options.measuresPerLine
    ? normalizeMeasuresLineBreaks(res.abcText || "")
    : (res.abcText || "");
  applyTransformedText(transformed);
  if (res.warnings) logErr(`abc2abc warning: ${res.warnings}`);
  setStatus("OK");
}

function formatConversionError(res) {
  if (!res) return "Unknown error.";
  const parts = [];
  if (res.error) parts.push(String(res.error));
  if (res.detail) parts.push(String(res.detail));
  if (!parts.length) return "Unknown error.";
  return parts.join("\n\n");
}

function deriveTitleFromPath(filePath) {
  if (!filePath) return "Imported tune";
  const name = safeBasename(filePath) || "Imported tune";
  const base = name.replace(/\.[^.]+$/, "");
  return base.trim() || "Imported tune";
}

function ensureTitleInAbc(abcText, fallbackTitle) {
  const text = String(abcText || "");
  if (!text.trim()) return text;
  if (/^T:/m.test(text)) return text;
  const title = fallbackTitle || "Imported tune";
  const lines = text.split(/\r\n|\n|\r/);
  const xIdx = lines.findIndex((line) => /^X:/.test(line));
  const insertIdx = xIdx >= 0 ? xIdx + 1 : 0;
  lines.splice(insertIdx, 0, `T:${title}`);
  return lines.join("\n");
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

async function confirmAbandonIfDirty(contextLabel) {
  const tuneDirty = Boolean(currentDoc && currentDoc.dirty);
  const hdrDirty = Boolean(headerDirty);
  if (!tuneDirty && !hdrDirty) return true;

  const choice = await confirmUnsavedChanges(contextLabel);
  if (choice === "cancel") return false;
  if (choice === "dont_save") {
    if (hdrDirty) {
      showToast("Header changes are unsaved. Save or cancel.", 2600);
      return false;
    }
    return true;
  }

  const ok = await performSaveFlow();
  return Boolean(ok);
}

async function ensureSafeToAbandonCurrentDoc(actionLabel) {
  return confirmAbandonIfDirty(actionLabel);
}

async function performSaveFlow() {
  if (!currentDoc) return false;

  if (headerDirty && activeFilePath) {
    try {
      await saveFileHeaderText(activeFilePath, getHeaderEditorValue());
      headerDirty = false;
      updateHeaderStateUI();
      setStatus("Header saved.");
    } catch (e) {
      await showSaveError(e && e.message ? e.message : String(e));
      updateHeaderStateUI();
      return false;
    }
  }

  if (activeTuneMeta && activeTuneMeta.path) {
    const res = await saveActiveTuneToSource();
    if (res.ok) {
      currentDoc.dirty = false;
      updateUIFromDocument(currentDoc);
      setDirtyIndicator(false);
      return true;
    }
    await showSaveError(res.error || "Unknown error");
    return false;
  }

  if (currentDoc.path) {
    const content = serializeDocument(currentDoc);
    const res = await writeFile(currentDoc.path, content);
    if (res.ok) {
      fileContentCache.set(currentDoc.path, content);
      currentDoc.dirty = false;
      setDirtyIndicator(false);
      setFileNameMeta(stripFileExtension(safeBasename(currentDoc.path)));
      updateFileHeaderPanel();
      return true;
    }
    await showSaveError(res.error || "Unable to save file.");
    return false;
  }

  return performSaveAsFlow();
}

async function performSaveAsFlow() {
  if (!currentDoc) return false;

  const suggestedName = `${getSuggestedBaseName()}.abc`;
  const suggestedDir = getDefaultSaveDir();
  const filePath = await showSaveDialog(suggestedName, suggestedDir);
  if (!filePath) return false;

  const res = await writeFile(filePath, serializeDocument(currentDoc));
  if (res.ok) {
    const content = serializeDocument(currentDoc);
    currentDoc.path = filePath;
    currentDoc.dirty = false;
    activeFilePath = filePath;
    fileContentCache.set(filePath, content);

    const updatedFile = await refreshLibraryFile(filePath);
    if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
      const tune = updatedFile.tunes[0];
      activeTuneId = tune.id;
      markActiveTuneButton(activeTuneId);
      const tuneText = content.slice(tune.startOffset, tune.endOffset);
      setActiveTuneText(tuneText, {
        id: tune.id,
        path: updatedFile.path,
        basename: updatedFile.basename,
        xNumber: tune.xNumber,
        title: tune.title || "",
        composer: tune.composer || "",
        key: tune.key || "",
        startLine: tune.startLine,
        endLine: tune.endLine,
        startOffset: tune.startOffset,
        endOffset: tune.endOffset,
      });
    } else {
      updateUIFromDocument(currentDoc);
      setFileNameMeta(stripFileExtension(safeBasename(filePath)));
      setTuneMetaText(safeBasename(filePath));
    }
    updateFileHeaderPanel();
    setDirtyIndicator(false);
    return true;
  }

  await showSaveError(res.error || "Unknown error");
  return false;
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

function getNextXNumber(existingContent) {
  let max = 0;
  const re = /^X:\s*(\d+)/gm;
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
  const idx = lines.findIndex((line) => /^X:/.test(line));
  const line = `X:${xNumber}`;
  if (idx >= 0) {
    lines[idx] = line;
    return lines.join("\n");
  }
  lines.unshift(line);
  return lines.join("\n");
}

function removeTuneFromContent(content, startOffset, endOffset) {
  let before = content.slice(0, startOffset);
  let after = content.slice(endOffset);
  if (/\r?\n$/.test(before) && /^\r?\n/.test(after)) {
    after = after.replace(/^\r?\n/, "");
  }
  return before + after;
}

async function refreshLibraryFile(filePath) {
  if (!window.api || typeof window.api.parseLibraryFile !== "function") return null;
  const res = await window.api.parseLibraryFile(filePath);
  if (!res || !res.files || !res.files.length) return null;
  const updatedFile = res.files[0];
  if (!libraryIndex) {
    libraryIndex = { root: res.root, files: [updatedFile] };
  } else {
    const idx = libraryIndex.files.findIndex((f) => f.path === updatedFile.path);
    if (idx >= 0) libraryIndex.files[idx] = updatedFile;
    else libraryIndex.files.push(updatedFile);
  }
  renderLibraryTree();
  updateFileContext();
  return updatedFile;
}

async function renameLibraryFile(oldPath, newPath) {
  if (!window.api || typeof window.api.parseLibraryFile !== "function") return null;
  const res = await window.api.parseLibraryFile(newPath);
  if (!res || !res.files || !res.files.length) return null;
  const updatedFile = res.files[0];
  if (!libraryIndex) {
    libraryIndex = { root: res.root, files: [updatedFile] };
  } else {
    libraryIndex.files = (libraryIndex.files || []).filter((f) => f.path !== oldPath);
    libraryIndex.files.push(updatedFile);
  }

  if (fileContentCache.has(oldPath)) {
    fileContentCache.set(newPath, fileContentCache.get(oldPath));
    fileContentCache.delete(oldPath);
  }

  if (activeFilePath === oldPath) activeFilePath = newPath;

  if (activeTuneMeta && activeTuneMeta.path === oldPath) {
    activeTuneMeta.path = newPath;
    const tune = (updatedFile.tunes || []).find((t) => t.startOffset === activeTuneMeta.startOffset);
    if (tune) {
      activeTuneId = tune.id;
      activeTuneMeta.xNumber = tune.xNumber;
      activeTuneMeta.title = tune.title || "";
      activeTuneMeta.composer = tune.composer || "";
      activeTuneMeta.key = tune.key || "";
    } else {
      activeTuneId = `${newPath}::${activeTuneMeta.startOffset}`;
    }
    setTuneMetaText(buildTuneMetaLabel(activeTuneMeta));
    setFileNameMeta(stripFileExtension(updatedFile.basename || ""));
    markActiveTuneButton(activeTuneId);
  }

  renderLibraryTree();
  return updatedFile;
}

async function saveFileHeaderText(filePath, headerText) {
  const res = await readFile(filePath);
  if (!res.ok) throw new Error(res.error || "Unable to read file.");
  const content = res.data || "";
  const headerEndOffset = findHeaderEndOffset(content);
  const oldHeaderText = content.slice(0, headerEndOffset);
  const suffix = content.slice(headerEndOffset);
  let header = String(headerText || "");
  if (header && !/[\r\n]$/.test(header) && /^\s*X:/.test(suffix)) {
    header += "\n";
  }
  const updated = header ? header + suffix : suffix;
  const writeRes = await writeFile(filePath, updated);
  if (!writeRes.ok) throw new Error(writeRes.error || "Unable to write file.");
  fileContentCache.set(filePath, updated);
  const updatedFile = await refreshLibraryFile(filePath);
  if (activeTuneMeta && activeTuneMeta.path === filePath) {
    const deltaLen = header.length - oldHeaderText.length;
    const deltaLines = countLines(header) - countLines(oldHeaderText);
    activeTuneMeta.startOffset += deltaLen;
    activeTuneMeta.endOffset += deltaLen;
    activeTuneMeta.startLine += deltaLines;
    activeTuneMeta.endLine += deltaLines;
    activeTuneId = `${filePath}::${activeTuneMeta.startOffset}`;
    markActiveTuneButton(activeTuneId);
    const label = updatedFile ? updatedFile.basename : safeBasename(filePath);
    setTuneMetaText(buildTuneMetaLabel(activeTuneMeta));
    setFileNameMeta(stripFileExtension(label || ""));
  }
}

function findTuneById(tuneId) {
  if (!libraryIndex || !tuneId) return null;
  for (const file of libraryIndex.files) {
    const tune = file.tunes.find((t) => t.id === tuneId);
    if (tune) return { tune, file };
  }
  return null;
}

async function getTuneText(tune, fileMeta) {
  let content = fileContentCache.get(fileMeta.path);
  if (content == null) {
    const res = await readFile(fileMeta.path);
    if (!res.ok) throw new Error(res.error || "Unable to read file.");
    content = res.data;
    fileContentCache.set(fileMeta.path, content);
  }
  return content.slice(tune.startOffset, tune.endOffset);
}

async function copyTuneById(tuneId, mode) {
  const res = findTuneById(tuneId);
  if (!res) return;
  try {
    const text = await getTuneText(res.tune, res.file);
    clipboardTune = {
      text,
      sourcePath: res.file.path,
      tuneId,
      mode,
    };
    setStatus(mode === "move" ? "Tune cut to buffer." : "Tune copied to buffer.");
    setBufferStatus(mode === "move" ? "Buffer: cut tune" : "Buffer: copied tune");
  } catch (e) {
    await showSaveError(e && e.message ? e.message : String(e));
  }
}

async function duplicateTuneById(tuneId) {
  const res = findTuneById(tuneId);
  if (!res) return;
  try {
    const text = await getTuneText(res.tune, res.file);
    const prepared = ensureCopyTitleInAbc(text);
    const updatedContent = await appendTuneTextToFile(res.file.path, prepared);
    const updatedFile = await refreshLibraryFile(res.file.path);
    activeFilePath = res.file.path;
    if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
      const tune = updatedFile.tunes[updatedFile.tunes.length - 1];
      activeTuneId = tune.id;
      markActiveTuneButton(activeTuneId);
      const tuneText = updatedContent.slice(tune.startOffset, tune.endOffset);
      setActiveTuneText(tuneText, {
        id: tune.id,
        path: updatedFile.path,
        basename: updatedFile.basename,
        xNumber: tune.xNumber,
        title: tune.title || "",
        composer: tune.composer || "",
        key: tune.key || "",
        startLine: tune.startLine,
        endLine: tune.endLine,
        startOffset: tune.startOffset,
        endOffset: tune.endOffset,
      });
    }
    setStatus("OK");
  } catch (e) {
    await showSaveError(e && e.message ? e.message : String(e));
  }
}

async function appendTuneTextToFile(filePath, text) {
  const res = await readFile(filePath);
  if (!res.ok) throw new Error(res.error || "Unable to read file.");
  const nextX = getNextXNumber(res.data || "");
  const prepared = ensureXNumberInAbc(text, nextX);
  const updated = appendTuneToContent(res.data || "", prepared);
  const writeRes = await writeFile(filePath, updated);
  if (!writeRes.ok) throw new Error(writeRes.error || "Unable to append to file.");
  fileContentCache.set(filePath, updated);
  return updated;
}

async function pasteClipboardToFile(targetPath) {
  if (!clipboardTune || !clipboardTune.text) {
    await showSaveError("Nothing to paste yet.");
    return;
  }
  if (!targetPath) {
    await showSaveError("Select a target file in the Library panel first.");
    return;
  }
  if (clipboardTune.sourcePath && clipboardTune.sourcePath === targetPath) {
    await showSaveError("Target file is the same as source.");
    return;
  }

  const confirm = await confirmAppendToFile(targetPath);
  if (confirm !== "append") return;

  try {
    await appendTuneTextToFile(targetPath, clipboardTune.text);
    await refreshLibraryFile(targetPath);
    activeFilePath = targetPath;

    if (clipboardTune.mode === "move") {
      const res = findTuneById(clipboardTune.tuneId);
      if (res && res.file && res.file.path) {
        const sourcePath = res.file.path;
        const sourceRes = await readFile(sourcePath);
        if (!sourceRes.ok) throw new Error(sourceRes.error || "Unable to read source file.");
        const updatedSource = removeTuneFromContent(
          sourceRes.data || "",
          res.tune.startOffset,
          res.tune.endOffset
        );
        const writeRes = await writeFile(sourcePath, updatedSource);
        if (!writeRes.ok) throw new Error(writeRes.error || "Unable to update source file.");
        fileContentCache.set(sourcePath, updatedSource);
        await refreshLibraryFile(sourcePath);
        if (activeTuneId === clipboardTune.tuneId) {
          activeTuneId = null;
          activeTuneMeta = null;
          setCurrentDocument(createBlankDocument());
        }
      }
      clipboardTune = null;
      setBufferStatus("");
    }
    setStatus("OK");
  } catch (e) {
    await showSaveError(e && e.message ? e.message : String(e));
  }
}

async function deleteTuneById(tuneId) {
  if (!libraryIndex || !tuneId) return;
  const ok = await ensureSafeToAbandonCurrentDoc("deleting a tune");
  if (!ok) return;

  let selected = null;
  let fileMeta = null;
  for (const file of libraryIndex.files) {
    const found = file.tunes.find((t) => t.id === tuneId);
    if (found) {
      selected = found;
      fileMeta = file;
      break;
    }
  }
  if (!selected || !fileMeta) return;

  const label = selected.title || selected.preview || `X:${selected.xNumber || ""}`.trim();
  const confirm = await confirmDeleteTune(label);
  if (confirm !== "delete") return;

  const res = await readFile(fileMeta.path);
  if (!res.ok) {
    await showSaveError(res.error || "Unable to read file.");
    return;
  }

  const updated = removeTuneFromContent(res.data || "", selected.startOffset, selected.endOffset);
  const writeRes = await writeFile(fileMeta.path, updated);
  if (!writeRes.ok) {
    await showSaveError(writeRes.error || "Unable to delete tune.");
    return;
  }

  fileContentCache.set(fileMeta.path, updated);
  const updatedFile = await refreshLibraryFile(fileMeta.path);
  if (activeTuneId === tuneId) {
    activeTuneId = null;
    activeTuneMeta = null;
    setCurrentDocument(createBlankDocument());
  }

  if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
    activeFilePath = fileMeta.path;
  } else {
    activeFilePath = null;
  }
}

async function performAppendFlow() {
  const filePath = activeFilePath;
  if (!filePath) {
    await showSaveError("Select a target file in the Library panel first.");
    return false;
  }

  const confirm = await confirmAppendToFile(filePath);
  if (confirm !== "append") return false;

  const res = await readFile(filePath);
  if (!res.ok) {
    await showSaveError(res.error || "Unable to read file.");
    return false;
  }

  const nextX = getNextXNumber(res.data || "");
  const prepared = ensureXNumberInAbc(serializeDocument(currentDoc), nextX);
  const updated = appendTuneToContent(res.data || "", prepared);
  const writeRes = await writeFile(filePath, updated);
  if (!writeRes.ok) {
    await showSaveError(writeRes.error || "Unable to append to file.");
    return false;
  }

  fileContentCache.set(filePath, updated);

  const updatedFile = await refreshLibraryFile(filePath);
  if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
    const tune = updatedFile.tunes[updatedFile.tunes.length - 1];
    activeTuneId = tune.id;
    markActiveTuneButton(activeTuneId);
    setActiveTuneText(getEditorValue(), {
      id: tune.id,
      path: updatedFile.path,
      basename: updatedFile.basename,
      xNumber: tune.xNumber,
      title: tune.title || "",
      startLine: tune.startLine,
      endLine: tune.endLine,
      startOffset: tune.startOffset,
      endOffset: tune.endOffset,
    });
  } else {
    currentDoc.path = filePath;
    currentDoc.dirty = false;
    updateUIFromDocument(currentDoc);
  }
  setDirtyIndicator(false);

  return true;
}

async function fileNew() {
  const ok = await ensureSafeToAbandonCurrentDoc("creating a new file");
  if (!ok) return;
  setActiveTuneText("", null);
  setDirtyIndicator(false);
}

async function fileNewFromTemplate() {
  const ok = await ensureSafeToAbandonCurrentDoc("creating a new file");
  if (!ok) return;
  setActiveTuneText(TEMPLATE_ABC, null);
  if (currentDoc) currentDoc.dirty = true;
  setDirtyIndicator(true);
}

function buildNewTuneDraftTemplate(nextX) {
  const x = Number.isFinite(Number(nextX)) ? Number(nextX) : "";
  const xLine = x ? `X:${x}` : "X:";
  return [
    xLine,
    "T:",
    "C:",
    "M:4/4",
    "L:1/8",
    "Q:1/4=120",
    "K:C",
    "",
  ].join("\n");
}

function setNewTuneDraftInActiveFile(text, { filePath, basename, xNumber } = {}) {
  if (!editorView) return;
  if (!filePath) return;
  if (activeErrorHighlight) clearActiveErrorHighlight("docReplaced");
  resetPlaybackState();

  suppressDirty = true;
  setEditorValue(text);
  suppressDirty = false;

  isNewTuneDraft = true;
  activeTuneMeta = null;
  activeTuneId = null;
  activeFilePath = filePath;

  refreshHeaderLayers().catch(() => {});
  const label = xNumber ? `New tune (X:${xNumber})` : "New tune";
  setTuneMetaText(label);
  setFileNameMeta(stripFileExtension(basename || safeBasename(filePath)));

  if (currentDoc) {
    currentDoc.path = null;
    currentDoc.content = text || "";
    currentDoc.dirty = false;
  }
  updateFileContext();
  setDirtyIndicator(false);
  updateFileHeaderPanel();
  renderNow();
}

async function fileNewTune() {
  const entry = getActiveFileEntry();
  if (!entry || !entry.path) {
    showToast("Load a library file first.", 2400);
    return;
  }
  const ok = await ensureSafeToAbandonCurrentDoc("creating a new tune");
  if (!ok) return;

  let nextX = "";
  try {
    const res = await getFileContentCached(entry.path);
    if (res && res.ok) nextX = getNextXNumber(res.data || "");
  } catch {}

  const template = buildNewTuneDraftTemplate(nextX);
  setNewTuneDraftInActiveFile(template, {
    filePath: entry.path,
    basename: entry.basename || safeBasename(entry.path),
    xNumber: nextX,
  });
  showToast("New tune draft (use Append to Active File to save into this file).", 2600);
}

async function fileOpen() {
  const ok = await ensureSafeToAbandonCurrentDoc("opening a file");
  if (!ok) return;

  const filePath = await showOpenDialog();
  if (!filePath) return;

  await loadLibraryFromFolder(safeDirname(filePath));
  if (libraryIndex && libraryIndex.files) {
    const fileEntry = libraryIndex.files.find((f) => f.path === filePath);
    if (fileEntry && fileEntry.tunes && fileEntry.tunes.length) {
      await selectTune(fileEntry.tunes[0].id);
    } else {
      setActiveTuneText("", null);
    }
  }
}

async function importMusicXml() {
  const ok = await ensureSafeToAbandonCurrentDoc("importing a file");
  if (!ok) return;
  if (!window.api || typeof window.api.importMusicXml !== "function") return;

  setStatus("Importing…");
  const res = await window.api.importMusicXml();
  if (!res || res.canceled) {
    setStatus("Ready");
    return;
  }
  if (!res.ok) {
    const msg = formatConversionError(res);
    logErr(msg);
    setStatus("Error");
    await showOpenError(msg);
    return;
  }

  if (!currentDoc) setCurrentDocument(createBlankDocument());
  const fallbackTitle = deriveTitleFromPath(res.sourcePath);
  let prepared = ensureTitleInAbc(res.abcText || "", fallbackTitle);
  if (window.api && typeof window.api.runAbc2abc === "function") {
    const transformRes = await window.api.runAbc2abc(prepared, { measuresPerLine: 4 });
    if (transformRes && transformRes.ok && transformRes.abcText) {
      prepared = transformRes.abcText;
      if (transformRes.warnings) logErr(`abc2abc warning: ${transformRes.warnings}`);
    } else if (transformRes && !transformRes.canceled) {
      const msg = formatConversionError(transformRes);
      logErr(msg);
      await showOpenError(msg);
    }
  }
  const aligned = alignBarsInText(prepared);
  const finalText = aligned || prepared;
  setActiveTuneText(finalText, null);
  if (currentDoc) currentDoc.dirty = true;
  if (res.warnings) logErr(`Import warning: ${res.warnings}`);
  setStatus("OK");
}

async function fileSave() {
  if (!currentDoc) return;
  await performSaveFlow();
}

async function fileSaveAs() {
  if (!currentDoc) return;
  await performSaveAsFlow();
}

async function requestCloseDocument() {
  if (abandonFlowInProgress) return;
  if (!currentDoc) return;
  abandonFlowInProgress = true;
  try {
    const ok = await confirmAbandonIfDirty("closing this file");
    if (!ok) return;
    clearCurrentDocument();
    setDirtyIndicator(false);
  } finally {
    abandonFlowInProgress = false;
  }
}

async function requestQuitApplication() {
  if (abandonFlowInProgress) return;
  abandonFlowInProgress = true;
  try {
    const ok = await confirmAbandonIfDirty("quitting");
    if (!ok) return;
    if (window.api && typeof window.api.quitApplication === "function") {
      await window.api.quitApplication();
    }
  } finally {
    abandonFlowInProgress = false;
  }
}

async function fileClose() {
  await requestCloseDocument();
}

async function exportMusicXml() {
  if (!window.api || typeof window.api.exportMusicXml !== "function") return;
  const abcText = getEditorValue();
  if (!abcText.trim()) {
    setStatus("No notation to export.");
    return;
  }

  setStatus("Exporting…");
  const res = await window.api.exportMusicXml(abcText, getSuggestedBaseName());
  if (!res || res.canceled) {
    setStatus("Ready");
    return;
  }
  if (!res.ok) {
    const msg = formatConversionError(res);
    logErr(msg);
    setStatus("Error");
    await showSaveError(msg);
    return;
  }

  if (res.warnings) logErr(`Export warning: ${res.warnings}`);
  setStatus("OK");
}

async function appQuit() {
  await requestQuitApplication();
}

function wireMenuActions() {
  if (!window.api || typeof window.api.onMenuAction !== "function") return;
  window.api.onMenuAction(async (action) => {
    try {
      const actionType = typeof action === "string" ? action : action && action.type;
      if (actionType === "new") await fileNew();
      else if (actionType === "newTune") await fileNewTune();
      else if (actionType === "newFromTemplate") await fileNewFromTemplate();
      else if (actionType === "open") await fileOpen();
      else if (actionType === "openFolder") await scanAndLoadLibrary();
      else if (actionType === "importMusicXml") await importMusicXml();
      else if (actionType === "save") await fileSave();
      else if (actionType === "saveAs") await fileSaveAs();
      else if (actionType === "appendToActiveFile") await performAppendFlow();
      else if (actionType === "printPreview") await runPrintAction("preview");
      else if (actionType === "print") await runPrintAction("print");
      else if (actionType === "printAll") await runPrintAllAction("print");
      else if (actionType === "exportMusicXml") await exportMusicXml();
      else if (actionType === "exportPdf") await runPrintAction("pdf");
      else if (actionType === "exportPdfAll") await runPrintAllAction("pdf");
      else if (actionType === "close") await requestCloseDocument();
      else if (actionType === "quit") await requestQuitApplication();
      else if (actionType === "libraryList") {
        openLibraryListFromCurrentLibraryIndex();
      }
      else if (actionType === "toggleLibrary") toggleLibrary();
      else if (actionType === "openRecentTune" && action && action.entry) {
        await openRecentTune(action.entry);
      }
      else if (actionType === "openRecentFile" && action && action.entry) {
        await openRecentFile(action.entry);
      }
      else if (actionType === "openRecentFolder" && action && action.entry) {
        await openRecentFolder(action.entry);
      }
      else if (actionType === "find" && editorView) openFindPanel(editorView);
      else if (actionType === "replace" && editorView) openReplacePanel(editorView);
      else if (actionType === "gotoLine" && editorView) gotoLine(editorView);
      else if (actionType === "findLibrary") promptFindInLibrary();
      else if (actionType === "clearLibraryFilter") clearLibraryFilter();
      else if (actionType === "playStart") await startPlaybackAtIndex(0);
      else if (actionType === "playPrev") await startPlaybackAtMeasureOffset(-1);
      else if (actionType === "playToggle") { await transportTogglePlayPause(); }
      else if (actionType === "playNext") await startPlaybackAtMeasureOffset(1);
      else if (actionType === "resetLayout") resetLayout();
      else if (actionType === "helpGuide") await openExternal("https://abcplus.sourceforge.net/abcplus_en.pdf");
      else if (actionType === "helpLink" && action && action.url) await openExternal(action.url);
      else if (actionType === "about") await openAbout();
      else if (actionType === "transformTransposeUp") await applyAbc2abcTransform({ transposeSemitones: 1 });
      else if (actionType === "transformTransposeDown") await applyAbc2abcTransform({ transposeSemitones: -1 });
      else if (actionType === "transformDouble") await applyAbc2abcTransform({ doubleLengths: true });
      else if (actionType === "transformHalf") await applyAbc2abcTransform({ halfLengths: true });
      else if (actionType === "transformMeasures" && action && Number.isFinite(action.value)) {
        await applyAbc2abcTransform({ measuresPerLine: action.value });
      }
      else if (actionType === "alignBars") alignBarsInEditor();
      else if (actionType === "settings" && settingsController) settingsController.openSettings();
      else if (actionType === "zoomIn" && settingsController) { if (!shouldIgnoreMenuZoomAction()) settingsController.zoomIn(); }
      else if (actionType === "zoomOut" && settingsController) { if (!shouldIgnoreMenuZoomAction()) settingsController.zoomOut(); }
      else if (actionType === "zoomReset" && settingsController) {
        if (!shouldIgnoreMenuZoomAction()) {
          settingsController.zoomReset();
          requestAnimationFrame(() => centerRenderPaneOnCurrentAnchor());
        }
      }
      else if (actionType === "toggleFileHeader") toggleHeaderCollapsed();
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

wireMenuActions();

if (window.api && typeof window.api.onAppRequestQuit === "function") {
  window.api.onAppRequestQuit(() => {
    requestQuitApplication();
  });
}

settingsController = initSettings(window.api);
if (window.api && typeof window.api.getSettings === "function") {
  window.api.getSettings().then((settings) => {
    if (settings) {
      setGlobalHeaderFromSettings(settings);
      setSoundfontFromSettings(settings);
      setDrumVelocityFromSettings(settings);
      setFollowFromSettings(settings);
      updateGlobalHeaderToggle();
      updateErrorsFeatureUI();
      loadSoundfontSelectOptions();
      refreshHeaderLayers().catch(() => {});
      showDisclaimerIfNeeded(settings);
    }
  }).catch(() => {});
}
if (window.api && typeof window.api.onSettingsChanged === "function") {
  window.api.onSettingsChanged((settings) => {
    const prevHeader = `${globalHeaderEnabled}|${globalHeaderText}`;
    const prevSoundfont = soundfontName;
    setGlobalHeaderFromSettings(settings);
    setSoundfontFromSettings(settings);
    setDrumVelocityFromSettings(settings);
    setFollowFromSettings(settings);
    updateGlobalHeaderToggle();
    updateErrorsFeatureUI();
    loadSoundfontSelectOptions();
    refreshHeaderLayers().catch(() => {});
    showDisclaimerIfNeeded(settings);
    if (settings && prevHeader !== `${globalHeaderEnabled}|${globalHeaderText}`) renderNow();
    if (settings && prevSoundfont !== soundfontName) {
      resetSoundfontCache();
      if (player && typeof player.stop === "function") {
        suppressOnEnd = true;
        player.stop();
      }
      player = null;
      playbackState = null;
      playbackIndexOffset = 0;
      ensureSoundfontLoaded().catch(() => setSoundfontStatus("Soundfont load failed", 5000));
    }
  });
}
if (settingsController && editorView) {
  editorView.dom.addEventListener("focusin", () => {
    settingsController.setActivePane("editor");
  });
}

if ($renderPane && settingsController) {
  $renderPane.addEventListener("pointerdown", () => {
    settingsController.setActivePane("render");
  });
}

let lastZoomShortcutAtMs = 0;
function markZoomShortcut() {
  lastZoomShortcutAtMs = Date.now();
}
function shouldIgnoreMenuZoomAction() {
  return Date.now() - lastZoomShortcutAtMs < 150;
}

function centerRenderPaneOnCurrentAnchor() {
  if (!$out || !$renderPane || !editorView) return;
  const editorOffset = (activeErrorHighlight && Number.isFinite(activeErrorHighlight.from))
    ? activeErrorHighlight.from
    : editorView.state.selection.main.anchor;
  const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
    ? lastRenderPayload.offset
    : 0;
  const renderIdx = Number(editorOffset) + renderOffset;
  if (!Number.isFinite(renderIdx)) return;
  let els = $out.querySelectorAll("._" + renderIdx + "_");
  if ((!els || !els.length) && Number.isFinite(renderIdx)) {
    const maxBack = 200;
    for (let d = 1; d <= maxBack; d += 1) {
      const probe = renderIdx - d;
      if (probe < 0) break;
      els = $out.querySelectorAll("._" + probe + "_");
      if (els && els.length) break;
    }
  }
  if (!els || !els.length) return;
  const chosen = pickClosestNoteElement(Array.from(els));
  if (!chosen) return;
  const containerRect = $renderPane.getBoundingClientRect();
  const targetRect = chosen.getBoundingClientRect();
  const centerTop = targetRect.top - containerRect.top + $renderPane.scrollTop - ($renderPane.clientHeight / 2) + (targetRect.height / 2);
  const centerLeft = targetRect.left - containerRect.left + $renderPane.scrollLeft - ($renderPane.clientWidth / 2) + (targetRect.width / 2);
  $renderPane.scrollTop = Math.max(0, centerTop);
  $renderPane.scrollLeft = Math.max(0, centerLeft);
}

// Prevent Chromium page-zoom shortcuts fighting the app's render/editor zoom.
document.addEventListener("keydown", (e) => {
  if (!settingsController) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return;
  const key = String(e.key || "");
  const target = e.target;
  const tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
  if (tag === "input" || tag === "textarea") return;

  const isZoomIn = key === "+" || (key === "=" && e.shiftKey);
  const isZoomOut = key === "-" || key === "_";
  const isZoomReset = key === "0";
  if (!isZoomIn && !isZoomOut && !isZoomReset) return;

  e.preventDefault();
  e.stopPropagation();
  markZoomShortcut();

  // Keyboard zoom is primarily intended for the notation pane.
  settingsController.setActivePane("render");
  if (isZoomIn) settingsController.zoomIn();
  else if (isZoomOut) settingsController.zoomOut();
  else {
    settingsController.zoomReset();
    requestAnimationFrame(() => centerRenderPaneOnCurrentAnchor());
  }
}, true);

document.addEventListener("wheel", (e) => {
  if (!settingsController) return;
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const direction = e.deltaY > 0 ? -1 : 1;
  if (direction > 0) settingsController.zoomIn();
  else settingsController.zoomOut();
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (String(e.key || "").toLowerCase() !== "h") return;
  e.preventDefault();
  toggleHeaderCollapsed();
});

// Hidden debug shortcut:
// - Cmd/Ctrl+Alt+Shift+D dumps a debug JSON snapshot
// - Cmd/Ctrl+Shift+F9 dumps a debug JSON snapshot (avoids Alt+Shift conflicts on some DEs)
document.addEventListener("keydown", (e) => {
  const key = String(e.key || "").toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  const isDumpChord = (mod && e.altKey && e.shiftKey && key === "d")
    || (mod && e.shiftKey && !e.altKey && key === "f9");
  if (!isDumpChord) return;
  const target = e.target;
  const tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
  if (tag === "input" || tag === "textarea") return;
  e.preventDefault();
  dumpDebugToFile().catch(() => {});
});

initContextMenu();

requestAnimationFrame(() => {
  resetLayout();
});

loadLastRecentEntry();

if ($errorList) {
  $errorList.addEventListener("click", async (e) => {
    const item = e.target && e.target.closest ? e.target.closest(".error-item") : null;
    if (!item) return;
    const index = Number(item.dataset.index);
    const entry = Number.isFinite(index) ? errorEntries[index] : null;
    if (!entry) return;
    if (entry.tuneId && entry.tuneId !== activeTuneId) {
      await selectTune(entry.tuneId);
    }
    if (entry.loc) {
      setEditorSelectionAtLineCol(entry.loc.line, entry.loc.col);
    }
    if (entry.renderLoc && lastRenderPayload && lastRenderPayload.text) {
      const renderIdx = getTextIndexFromLoc(lastRenderPayload.text, entry.renderLoc);
      if (Number.isFinite(renderIdx)) highlightRenderNoteAtIndex(renderIdx);
    }
  });
}

if ($out) {
  $out.addEventListener("click", (e) => {
    const target = e.target;
    if (!target || !target.classList) return;
    if (!target.classList.contains("note-hl")) return;
    const start = Number(target.dataset && target.dataset.start);
    const end = Number(target.dataset && target.dataset.end);
    if (Number.isFinite(start)) {
      const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
        ? lastRenderPayload.offset
        : 0;
      const editorStart = Math.max(0, start - renderOffset);
      const editorEndRaw = Number.isFinite(end) && end > start ? end : start + 1;
      const editorEnd = Math.max(editorStart, editorEndRaw - renderOffset);
      pendingPlaybackRangeOrigin = "svg";
      setEditorSelectionRange(editorStart, editorEnd);
      setPlaybackRange({
        startOffset: editorStart,
        endOffset: editorEnd,
        origin: "svg",
        loop: playbackRange.loop,
      });
    }
  });
}

if ($findLibraryClose) {
  $findLibraryClose.addEventListener("click", () => {
    closeFindLibraryModal();
  });
}

if ($findLibraryModal) {
  $findLibraryModal.addEventListener("click", (e) => {
    if (e.target === $findLibraryModal) closeFindLibraryModal();
  });
}

if ($findLibraryApply) {
  $findLibraryApply.addEventListener("click", () => {
    applyFindLibraryModal();
  });
}

if ($findLibraryClear) {
  $findLibraryClear.addEventListener("click", () => {
    clearLibraryFilter();
    closeFindLibraryModal();
  });
}

if ($findLibraryValue) {
  $findLibraryValue.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyFindLibraryModal();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFindLibraryModal();
    }
  });
}

if ($moveTuneClose) {
  $moveTuneClose.addEventListener("click", () => {
    closeMoveTuneModal();
  });
}

if ($moveTuneCancel) {
  $moveTuneCancel.addEventListener("click", () => {
    closeMoveTuneModal();
  });
}

if ($moveTuneApply) {
  $moveTuneApply.addEventListener("click", async () => {
    const targetPath = $moveTuneTarget ? $moveTuneTarget.value : "";
    const tuneId = pendingMoveTuneId;
    closeMoveTuneModal();
    if (tuneId && targetPath) await moveTuneToFile(tuneId, targetPath);
  });
}

if ($moveTuneModal) {
  $moveTuneModal.addEventListener("click", (e) => {
    if (e.target === $moveTuneModal) closeMoveTuneModal();
  });
}

if ($aboutClose) {
  $aboutClose.addEventListener("click", () => {
    closeAbout();
  });
}

if ($aboutModal) {
  $aboutModal.addEventListener("click", (e) => {
    if (e.target === $aboutModal) closeAbout();
  });
}

if ($aboutCopy) {
  $aboutCopy.addEventListener("click", async () => {
    if (!$aboutInfo) return;
    const text = $aboutInfo.textContent || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch (e) {
      logErr(e && e.message ? e.message : String(e));
      setStatus("Copy failed.");
    }
  });
}

if ($disclaimerOk) {
  $disclaimerOk.addEventListener("click", () => {
    dismissDisclaimer();
  });
}

if ($fileHeaderSave) {
  $fileHeaderSave.addEventListener("click", async () => {
    const entry = getActiveFileEntry();
    if (!entry || !entry.path) {
      setStatus("No active file to update.");
      return;
    }
    try {
      await saveFileHeaderText(entry.path, getHeaderEditorValue());
      headerDirty = false;
      updateHeaderStateUI();
      setStatus("Header saved.");
    } catch (e) {
      await showSaveError(e && e.message ? e.message : String(e));
    }
  });
}

if ($fileHeaderReload) {
  $fileHeaderReload.addEventListener("click", () => {
    headerEditorFilePath = null;
    headerDirty = false;
    updateFileHeaderPanel();
  });
}

if ($fileHeaderToggle) {
  $fileHeaderToggle.addEventListener("click", () => {
    if (!getActiveFileEntry()) {
      showToast("No library file loaded.", 2400);
      return;
    }
    toggleHeaderCollapsed();
  });
}

// ---------- AUDIO ----------

let player = null;
var isPlaying = false;
let isPaused = false;
let suppressOnEnd = false;
let lastPlaybackIdx = null;
let lastRenderIdx = null;
let lastStartPlaybackIdx = 0;
let resumeStartIdx = null;
let playbackState = null;
let playbackIndexOffset = 0;
let lastDrumPlaybackActive = false;
let waitingForFirstNote = false;
let isPreviewing = false;
let followPlayback = true;
let followVoiceId = null;
let followVoiceIndex = null;
let drumVelocityMap = buildDefaultDrumVelocityMap();
let lastPlaybackMeta = null;
let lastDrumInjectInput = null;
let lastDrumInjectResult = null;
let lastPlaybackPayloadCache = null;
let lastSoundfontApplied = null;
let lastPreparedPlaybackKey = null;
let playbackNoteTrace = [];

function playbackGuardError(message) {
  console.error(`[abcarus][playback-range] ${message}`);
}

function stopPlaybackFromGuard(message) {
  playbackGuardError(message);
  if (player && (isPlaying || isPaused) && typeof player.stop === "function") {
    suppressOnEnd = true;
    try { player.stop(); } catch {}
  }
  isPlaying = false;
  isPaused = false;
  waitingForFirstNote = false;
  resumeStartIdx = null;
  activePlaybackRange = null;
  activePlaybackEndAbcOffset = null;
  playbackStartArmed = false;
  setStatus("OK");
  updatePlayButton();
  clearNoteSelection();
}

function clonePlaybackRange(r) {
  if (!r || typeof r !== "object") {
    return { startOffset: 0, endOffset: null, origin: "cursor", loop: false };
  }
  return {
    startOffset: Number(r.startOffset) || 0,
    endOffset: (r.endOffset == null) ? null : Number(r.endOffset),
    origin: r.origin || "cursor",
    loop: Boolean(r.loop),
  };
}

function setPlaybackRange(next) {
  const nextRange = clonePlaybackRange(next);

  if (isPlaying) {
    if (activePlaybackRange && activePlaybackRange.loop && nextRange.startOffset !== activePlaybackRange.startOffset) {
      stopPlaybackFromGuard("Looping PlaybackRange.startOffset mutated during playback.");
      return;
    }
    playbackGuardError("PlaybackRange updated while playing; change deferred until stop.");
    return;
  }

  playbackRange = nextRange;
}

function updatePlaybackRangeFromSelection(selection, origin) {
  if (!selection || !editorView) return;
  if (isPlaying) return;
  // While an error anchor is active, keep the error-derived PlaybackRange stable and loopable.
  // The user can move the cursor to fix the error without losing the loop range.
  if (activeErrorHighlight && playbackRange && playbackRange.origin === "error" && playbackRange.loop) return;
  const max = editorView.state.doc.length;
  const main = selection.main || null;
  if (!main) return;

  const anchor = Math.max(0, Math.min(Number(main.anchor) || 0, max));
  const head = Math.max(0, Math.min(Number(main.head) || 0, max));
  const start = Math.min(anchor, head);
  const end = Math.max(anchor, head);
  const isRange = end > start;

  setPlaybackRange({
    startOffset: start,
    endOffset: isRange ? end : null,
    origin: origin || (isRange ? "selection" : "cursor"),
    loop: Boolean(activeErrorHighlight && playbackRange.loop),
  });
}

function appendPlaybackTrace(evt) {
  if (!evt) return;
  playbackNoteTrace.push(evt);
  const max = 2000;
  if (playbackNoteTrace.length > max) {
    playbackNoteTrace = playbackNoteTrace.slice(playbackNoteTrace.length - max);
  }
}

function getPlaybackSourceKey() {
  const tuneText = getEditorValue();
  const entry = getActiveFileEntry();
  const prefixPayload = buildHeaderPrefix(entry ? getHeaderEditorValue() : "", false, tuneText);
  const baseText = prefixPayload.text ? `${prefixPayload.text}${tuneText}` : tuneText;
  const repeatsFlag = window.__abcarusPlaybackExpandRepeats === true ? "exp:on" : "exp:off";
  return `${baseText}|||${prefixPayload.offset || 0}|||${repeatsFlag}`;
}

function updatePlayButton() {
  if ($btnPlay) {
    $btnPlay.classList.toggle("active", Boolean(isPlaying));
    $btnPlay.disabled = false;
  }
  if ($btnPause) {
    $btnPause.classList.toggle("active", Boolean(isPaused));
    $btnPause.disabled = !(isPlaying || isPaused);
  }
  if ($btnStop) {
    $btnStop.disabled = !(isPlaying || isPaused || waitingForFirstNote);
  }
  if ($btnPlayPause) {
    $btnPlayPause.classList.toggle("active", Boolean(isPlaying || isPaused));
    $btnPlayPause.disabled = false;
    if (isPlaying) $btnPlayPause.textContent = "Pause";
    else if (isPaused) $btnPlayPause.textContent = "Resume";
    else $btnPlayPause.textContent = "Play";
  }
}

async function transportTogglePlayPause() {
  if (isPlaying) {
    pausePlayback();
    return;
  }
  await startPlaybackFromRange();
}

async function transportPlay() {
  if (isPlaying) return;
  await startPlaybackFromRange();
}

async function transportPause() {
  if (isPlaying) {
    pausePlayback();
    return;
  }
  if (isPaused) {
    await startPlaybackFromRange();
  }
}

function resetPlaybackState() {
  stopPlaybackForRestart();
  suppressOnEnd = false;
  isPlaying = false;
  isPaused = false;
  waitingForFirstNote = false;
  isPreviewing = false;
  lastPlaybackIdx = null;
  lastRenderIdx = null;
  lastStartPlaybackIdx = 0;
  resumeStartIdx = null;
  playbackState = null;
  playbackIndexOffset = 0;
  activePlaybackRange = null;
  activePlaybackEndAbcOffset = null;
  playbackStartArmed = false;
  clearNoteSelection();
  updatePlayButton();
  setSoundfontCaption();
}

function highlightSourceAt(idx, on) {
  if (!isPlaying) return;
  if (!Number.isFinite(idx)) return;
  if (!editorView) return;
  const max = editorView.state.doc.length;
  const safeIdx = Math.max(0, Math.min(idx, max));
  const end = Math.min(safeIdx + 1, max);

  if (on) {
    lastRenderIdx = safeIdx;
    try { editorView.focus(); } catch {}
    editorView.dispatch({ selection: { anchor: safeIdx, head: end } });
    const lineBlock = editorView.lineBlockAt(safeIdx);
    const lineTop = lineBlock.top;
    const viewTop = editorView.scrollDOM.scrollTop;
    const viewBottom = viewTop + editorView.scrollDOM.clientHeight;
    const margin = Math.max(lineBlock.height * 4, 64);
    if (lineTop < viewTop + margin) {
      editorView.scrollDOM.scrollTop = Math.max(0, lineTop - margin);
    } else if (lineTop > viewBottom - margin) {
      editorView.scrollDOM.scrollTop = Math.max(
        0,
        lineTop - editorView.scrollDOM.clientHeight + margin
      );
    }
  } else if (lastRenderIdx === idx) {
    const safeOff = Math.max(0, Math.min(idx, max));
    editorView.dispatch({ selection: { anchor: safeOff, head: safeOff } });
  }
}

function maybeScrollRenderToNote(el) {
  if (!$renderPane || !el) return;
  const containerRect = $renderPane.getBoundingClientRect();
  const targetRect = el.getBoundingClientRect();
  const offsetTop = targetRect.top - containerRect.top + $renderPane.scrollTop;
  const offsetLeft = targetRect.left - containerRect.left + $renderPane.scrollLeft;
  const viewTop = $renderPane.scrollTop;
  const viewBottom = viewTop + $renderPane.clientHeight;
  const viewLeft = $renderPane.scrollLeft;
  const viewRight = viewLeft + $renderPane.clientWidth;
  const linePad = Math.max(80, targetRect.height * 8);
  if (offsetTop < viewTop + linePad) {
    $renderPane.scrollTop = Math.max(0, offsetTop - linePad);
  } else if (offsetTop > viewBottom - linePad) {
    $renderPane.scrollTop = Math.max(0, offsetTop - $renderPane.clientHeight + linePad);
  }
  const colPad = Math.max(80, targetRect.width * 8);
  if (offsetLeft < viewLeft + colPad) {
    $renderPane.scrollLeft = Math.max(0, offsetLeft - colPad);
  } else if (offsetLeft > viewRight - colPad) {
    $renderPane.scrollLeft = Math.max(0, offsetLeft - $renderPane.clientWidth + colPad);
  }
}

async function ensureSoundfontLoaded() {
  // уже загружен
  const desired = soundfontName || "TimGM6mb.sf2";
  if (
    soundfontReadyName === desired
    && (soundfontSource !== "abc2svg.sf2" || (window.abc2svg && window.abc2svg.sf2))
  ) return;
  if (soundfontLoadPromise && soundfontLoadTarget === desired) return soundfontLoadPromise;

  if (!window.abc2svg) window.abc2svg = {};

  const loadSoundfont = async (name) => {
    const isPath = name.startsWith("/") || /^[a-zA-Z]:\\/.test(name) || name.startsWith("file://");
    const sf2Url = isPath
      ? toFileUrl(name)
      : new URL(`../../third_party/sf2/${name}`, window.location.href).href;
    if (isPath || STREAMING_SF2.has(name)) {
      window.abc2svg.sf2 = null;
      soundfontSource = sf2Url;
      soundfontReadyName = name;
      return;
    }
    if (!window.api || typeof window.api.readFileBase64 !== "function") {
      throw new Error("preload API missing: window.api.readFileBase64");
    }
    const b64 = await window.api.readFileBase64(sf2Url);
    if (!b64 || !b64.length) throw new Error("SF2 base64 is empty");
    window.abc2svg.sf2 = b64; // чистый base64 (как ты и хотел)
    soundfontSource = "abc2svg.sf2";
    soundfontReadyName = name;
  };

  soundfontLoadTarget = desired;
  setSoundfontCaption("Loading...");
  updateSoundfontLoadingStatus(desired);
  soundfontLoadPromise = (async () => {
    let ok = false;
    try {
      await loadSoundfont(desired);
      ok = true;
    } catch (e) {
      if (desired === "TimGM6mb.sf2") throw e;
      await loadSoundfont("TimGM6mb.sf2");
      ok = true;
    } finally {
      soundfontLoadPromise = null;
      soundfontLoadTarget = null;
      if (ok) setSoundfontStatus("", 0);
      if (!waitingForFirstNote) setSoundfontCaption();
      if (ok && !isPlaying && !isPaused && !waitingForFirstNote) setStatus("OK");
    }
  })();
  return soundfontLoadPromise;
}

async function ensureSoundfontReady() {
  await ensureSoundfontLoaded();
  const desired = soundfontSource || "abc2svg.sf2";
  const p = ensurePlayer();
  if (typeof p.set_sfu === "function" && desired !== lastSoundfontApplied) {
    p.set_sfu(desired);
    lastSoundfontApplied = desired;
  }
}

function ensurePlayer() {
  if (player) return player;

  if (typeof window.AbcPlay !== "function") {
    throw new Error("AbcPlay not found (snd-1.js not loaded?)");
  }

  player = AbcPlay({
    onend: () => {
      if (suppressOnEnd) return;
      if (isPreviewing) {
        isPreviewing = false;
        return;
      }
      const shouldLoop = Boolean(activePlaybackRange && activePlaybackRange.loop);
      isPlaying = false;
      isPaused = false;
      waitingForFirstNote = false;
      setStatus("OK");
      updatePlayButton();
      clearNoteSelection();
      if (!shouldLoop) {
        resumeStartIdx = null;
        activePlaybackRange = null;
        activePlaybackEndAbcOffset = null;
        playbackStartArmed = false;
      }
      if (followPlayback && lastRenderIdx != null && editorView) {
        // When looping, keep the visual follow-cursor without mutating PlaybackRange (loop invariance).
        suppressPlaybackRangeSelectionSync = true;
        try {
          editorView.dispatch({ selection: { anchor: lastRenderIdx, head: lastRenderIdx } });
        } finally {
          suppressPlaybackRangeSelectionSync = false;
        }
      }
      if (shouldLoop) {
        queueMicrotask(() => {
          startPlaybackFromRange(activePlaybackRange).catch(() => {});
        });
      }
    },
    onnote: (i, on) => {
      const editorIdx = Math.max(0, i - playbackIndexOffset);
      const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
        ? lastRenderPayload.offset
        : 0;
        const renderIdx = editorIdx + renderOffset;
        const editorLen = editorView ? editorView.state.doc.length : 0;
        const fromInjected = editorLen && editorIdx >= editorLen;
        lastPlaybackIdx = i;
      if (on && waitingForFirstNote) {
        waitingForFirstNote = false;
        setStatus("Playing…");
        setSoundfontCaption();
      }
      if (isPreviewing) return;
      if (
        on
        && activePlaybackEndAbcOffset != null
        && Number.isFinite(activePlaybackEndAbcOffset)
        && i >= activePlaybackEndAbcOffset
      ) {
        stopPlaybackForRestart();
        isPlaying = false;
        isPaused = false;
        waitingForFirstNote = false;
        setStatus("OK");
        updatePlayButton();
        clearNoteSelection();
        if (activePlaybackRange && activePlaybackRange.loop) {
          queueMicrotask(() => {
            startPlaybackFromRange(activePlaybackRange).catch(() => {});
          });
        } else {
          resumeStartIdx = null;
          activePlaybackRange = null;
          activePlaybackEndAbcOffset = null;
          playbackStartArmed = false;
        }
        return;
      }
      if (on && !fromInjected) {
        const timestamp = typeof performance !== "undefined" ? performance.now() : Date.now();
        const seq = (playbackTraceSeq += 1);
        if (lastTraceRunId !== playbackRunId) {
          stopPlaybackFromGuard("Trace run id mismatch.");
          return;
        }
        if (activePlaybackRange && activePlaybackRange.loop && playbackRange.startOffset !== activePlaybackRange.startOffset) {
          stopPlaybackFromGuard("Loop invariance violated: PlaybackRange.startOffset mutated.");
          return;
        }
        if (lastTracePlaybackIdx != null && seq < lastTracePlaybackIdx) {
          stopPlaybackFromGuard("Trace playbackIdx is not monotonic.");
          return;
        }
        if (lastTraceTimestamp != null && timestamp < lastTraceTimestamp) {
          stopPlaybackFromGuard("Trace timestamp is decreasing.");
          return;
        }
        if (activePlaybackRange && activePlaybackRange.endOffset != null) {
          const endAbc = Number(activePlaybackRange.endOffset) + playbackIndexOffset;
          if (Number.isFinite(endAbc) && i > endAbc) {
            stopPlaybackFromGuard("End offset violated: note beyond endOffset was emitted.");
            return;
          }
        }
        lastTracePlaybackIdx = seq;
        lastTraceTimestamp = timestamp;
        const currentEditorOffset = toEditorOffset(i);
        const rangeStartEditorOffset = activePlaybackRange ? activePlaybackRange.startOffset : playbackRange.startOffset;
        appendPlaybackTrace({
          rangeStartOffset: rangeStartEditorOffset,
          currentAbcOffset: Number.isFinite(currentEditorOffset) ? currentEditorOffset : editorIdx,
          rangeStartEditorOffset,
          currentEditorOffset: Number.isFinite(currentEditorOffset) ? currentEditorOffset : editorIdx,
          currentIstart: i,
          origin: activePlaybackRange ? activePlaybackRange.origin : playbackRange.origin,
          playbackIdx: seq,
          editorIdx: Number.isFinite(currentEditorOffset) ? currentEditorOffset : editorIdx,
          timestamp,
          atMs: timestamp,
        });
      }
      if (!followPlayback || fromInjected) return;
      if (followVoiceId || followVoiceIndex != null) {
        const symbol = findSymbolAtOrBefore(i);
        if (symbol && symbol.p_v) {
          const sameId = followVoiceId && symbol.p_v.id === followVoiceId;
          const sameIndex = followVoiceIndex != null && symbol.p_v.v === followVoiceIndex;
          if (!sameId && !sameIndex) return;
        }
      }
      lastRenderIdx = editorIdx;
      const els = $out.querySelectorAll("._" + renderIdx + "_");
      for (const el of els) {
        if (on) el.classList.add("note-on");
        else el.classList.remove("note-on");
      }
      if (on && els.length) {
        const chosen = pickClosestNoteElement(Array.from(els));
        if (chosen) maybeScrollRenderToNote(chosen);
      }
      highlightSourceAt(editorIdx, on);
    },
    errmsg: (m, line, col) => {
      const loc = Number.isFinite(line) && Number.isFinite(col)
        ? { line: line + 1, col: col + 1 }
        : null;
      logErr(m, loc);
    },
    err: (m) => logErr(m),
  });

  // чтобы в консоли можно было смотреть:
  window.p = player;

  // лечим NaN-speed из localStorage:
  if (typeof player.set_speed === "function") player.set_speed(1);

  // КЛЮЧ: говорим snd-1.js брать SF2 из window.abc2svg.sf2
  if (typeof player.set_sfu === "function") player.set_sfu(soundfontSource || "abc2svg.sf2");
  try { sessionStorage.setItem("audio", "sf2"); } catch {}

  return player;
}

function buildPlaybackState(firstSymbol) {
  const symbols = [];
  const measures = [];
  const barIstarts = [];
  const pushUnique = (arr, symbol) => {
    if (!symbol || !Number.isFinite(symbol.istart)) return;
    if (arr.length && arr[arr.length - 1].istart === symbol.istart) return;
    arr.push({ istart: symbol.istart, symbol });
  };
  const isPlayableSymbol = (symbol) => !!(symbol && Number.isFinite(symbol.dur) && symbol.dur > 0);
  const isBarLikeSymbol = (symbol) => !!(symbol && (symbol.bar_type || symbol.type === 14));

  let s = firstSymbol;
  let guard = 0;

  if (s) pushUnique(symbols, s);
  if (s) pushUnique(measures, s);

  while (s && guard < 200000) {
    pushUnique(symbols, s);
    if (isBarLikeSymbol(s) && s.ts_next) {
      pushUnique(measures, s.ts_next);
      barIstarts.push(s.istart);
    }
    s = s.ts_next;
    guard += 1;
  }

  const symbolIstarts = symbols.map((item) => item.istart);
  const measureIstarts = measures.map((item) => item.istart);
  const timeline = symbols.map((item) => {
    const sym = item.symbol;
    return {
      istart: item.istart,
      time: Number.isFinite(sym && sym.time) ? sym.time : null,
      dur: Number.isFinite(sym && sym.dur) ? sym.dur : null,
      type: Number.isFinite(sym && sym.type) ? sym.type : null,
    };
  });

  let startSymbol = firstSymbol;
  if (!startSymbol || !Number.isFinite(startSymbol.istart)) {
    startSymbol = symbols.length ? symbols[0].symbol : firstSymbol;
  }
  if (!isPlayableSymbol(startSymbol)) {
    const playable = symbols.find((item) => isPlayableSymbol(item.symbol));
    if (playable) startSymbol = playable.symbol;
  }
  return {
    startSymbol,
    symbols,
    measures,
    symbolIstarts,
    measureIstarts,
    barIstarts,
    timeline,
  };
}

function setFollowVoiceFromPlayback() {
  followVoiceId = null;
  followVoiceIndex = null;
  if (!playbackState || !playbackState.startSymbol) return;
  const voice = playbackState.startSymbol.p_v;
  if (!voice) return;
  if (voice.id) followVoiceId = voice.id;
  if (Number.isFinite(voice.v)) followVoiceIndex = voice.v;
}

function findSymbolAtOrBefore(idx) {
  if (!playbackState || !playbackState.symbols.length) return null;
  const list = playbackState.symbolIstarts || [];
  let lo = 0;
  let hi = list.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid];
    if (v <= idx) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const item = playbackState.symbols[best];
  return item ? item.symbol : null;
}

function findSymbolAtOrAfter(idx) {
  if (!playbackState || !playbackState.symbols.length) return null;
  const list = playbackState.symbolIstarts || [];
  if (!list.length) return null;
  let lo = 0;
  let hi = list.length - 1;
  let best = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid];
    if (v >= idx) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  const item = playbackState.symbols[best];
  return item ? item.symbol : null;
}

function findMeasureIndex(idx) {
  if (!playbackState || !playbackState.measures.length) return 0;
  const list = playbackState.measureIstarts || [];
  let lo = 0;
  let hi = list.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid];
    if (v <= idx) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function stopPlaybackForRestart() {
  if (player && typeof player.stop === "function") {
    suppressOnEnd = true;
    player.stop();
  }
  clearNoteSelection();
}

function stopPlaybackTransport() {
  if (player && (isPlaying || isPaused || waitingForFirstNote) && typeof player.stop === "function") {
    suppressOnEnd = true;
    try { player.stop(); } catch {}
  }
  isPlaying = false;
  isPaused = false;
  waitingForFirstNote = false;
  resumeStartIdx = null;
  activePlaybackRange = null;
  activePlaybackEndAbcOffset = null;
  playbackStartArmed = false;
  setStatus("OK");
  updatePlayButton();
  clearNoteSelection();
  setSoundfontCaption();

  // After an explicit Stop, reset the playhead back to the start (like a classic transport).
  // The user can then move the cursor/selection to choose a new start location.
  try {
    setPlaybackRange({ startOffset: 0, endOffset: null, origin: "cursor", loop: false });
    if (editorView) {
      suppressPlaybackRangeSelectionSync = true;
      try {
        editorView.dispatch({ selection: { anchor: 0, head: 0 } });
      } finally {
        suppressPlaybackRangeSelectionSync = false;
      }
    }
  } catch {}
}

function toDerivedOffset(editorOffset) {
  const raw = Number(editorOffset);
  if (!Number.isFinite(raw)) return null;
  return raw + (playbackIndexOffset || 0);
}

function toEditorOffset(derivedOffset) {
  const raw = Number(derivedOffset);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, raw - (playbackIndexOffset || 0));
}

function setGlobalHeaderFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  const next = String(settings.globalHeaderText || "");
  globalHeaderText = next;
  globalHeaderEnabled = settings.globalHeaderEnabled !== false;
}

function updateGlobalHeaderToggle() {
  if (!$btnToggleGlobals) return;
  $btnToggleGlobals.classList.toggle("toggle-active", globalHeaderEnabled);
  $btnToggleGlobals.textContent = "Globals";
  $btnToggleGlobals.setAttribute("aria-pressed", globalHeaderEnabled ? "true" : "false");
}

function updateFollowToggle() {
  if (!$btnToggleFollow) return;
  $btnToggleFollow.classList.toggle("toggle-active", followPlayback);
  $btnToggleFollow.textContent = "Follow";
  $btnToggleFollow.setAttribute("aria-pressed", followPlayback ? "true" : "false");
}

function setFollowFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  if (settings.followPlayback === undefined) return;
  followPlayback = settings.followPlayback !== false;
  updateFollowToggle();
}

function setSoundfontFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  const next = String(settings.soundfontName || "");
  soundfontName = next || "TimGM6mb.sf2";
  updateSoundfontSelectValue();
}

function setDrumVelocityFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  const next = settings.drumVelocityMap;
  const base = buildDefaultDrumVelocityMap();
  if (next && typeof next === "object") {
    for (const [key, value] of Object.entries(next)) {
      const pitch = Number(key);
      if (!Number.isFinite(pitch)) continue;
      base[pitch] = clampVelocity(value);
    }
  }
  drumVelocityMap = base;
}

function updateSoundfontSelectValue() {
  if (!$soundfontSelect) return;
  const current = soundfontName || "TimGM6mb.sf2";
  if ($soundfontSelect.value !== current) $soundfontSelect.value = current;
}

async function loadSoundfontSelectOptions(force) {
  if (!$soundfontSelect) return;
  if (soundfontOptionsLoading && !force) return soundfontOptionsLoading;
  if (force) {
    soundfontOptionsLoading = null;
    soundfontOptionsLoaded = false;
  }
  soundfontOptionsLoading = (async () => {
    let fonts = [];
    if (window.api && typeof window.api.listSoundfonts === "function") {
      try {
        const list = await window.api.listSoundfonts();
        if (Array.isArray(list)) fonts = list;
      } catch {}
    }
    const fallback = "TimGM6mb.sf2";
    const current = soundfontName || fallback;
    const normalize = (item) => {
      if (!item) return null;
      if (typeof item === "string") {
        return { name: item, source: isSoundfontPath(item) ? "user" : "bundled" };
      }
      if (typeof item === "object" && item.name) {
        return { name: String(item.name), source: item.source === "user" ? "user" : "bundled" };
      }
      return null;
    };
    let normalized = fonts.map(normalize).filter(Boolean);
    if (current && !normalized.some((item) => item.name === current)) {
      normalized.unshift({ name: current, source: isSoundfontPath(current) ? "user" : "bundled" });
    }
    if (!normalized.some((item) => item.name === fallback)) {
      normalized.unshift({ name: fallback, source: "bundled" });
    }
    const seen = new Set();
    $soundfontSelect.textContent = "";
    for (const item of normalized) {
      if (!item || !item.name || seen.has(item.name)) continue;
      seen.add(item.name);
      const option = document.createElement("option");
      option.value = item.name;
      const label = getSoundfontLabel(item.name);
      const suffix = item.source === "user" ? " (user)" : " (bundled)";
      option.textContent = `${label}${suffix}`;
      $soundfontSelect.appendChild(option);
    }
    soundfontOptionsLoaded = true;
    updateSoundfontSelectValue();
  })();
  return soundfontOptionsLoading;
}

function resetSoundfontCache() {
  if (window.abc2svg) window.abc2svg.sf2 = null;
  if (window.abcsf2 && Array.isArray(window.abcsf2)) window.abcsf2.length = 0;
  soundfontSource = "abc2svg.sf2";
  soundfontReadyName = null;
  soundfontLoadPromise = null;
  soundfontLoadTarget = null;
}

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
  "oneperpage",
  "pagewidth",
  "pageheight",
  "staffwidth",
  "scale",
  "titlefont",
  "subtitlefont",
  "composerfont",
  "partsfont",
  "textfont",
  "gchordfont",
  "vocalfont",
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
]);

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

async function loadHeaderLayer(path) {
  if (!path) return "";
  try {
    const res = await readFile(path);
    if (!res || !res.ok) return "";
    return normalizeHeaderLayer(res.data);
  } catch {
    return "";
  }
}

async function refreshHeaderLayers() {
  const prev = `${globalHeaderGlobalText}|${globalHeaderLocalText}|${globalHeaderUserText}`;
  let globalPath = "";
  let userPath = "";
  if (window.api && typeof window.api.getSettingsPaths === "function") {
    try {
      const res = await window.api.getSettingsPaths();
      globalPath = res && res.globalPath ? res.globalPath : "";
      userPath = res && res.userPath ? res.userPath : "";
    } catch {}
  }
  let localPath = "";
  if (activeFilePath && window.api && typeof window.api.pathDirname === "function") {
    const dir = window.api.pathDirname(activeFilePath);
    if (window.api.pathJoin) {
      localPath = window.api.pathJoin(dir, "local_settings.abc");
    } else if (dir) {
      localPath = dir.endsWith("/") || dir.endsWith("\\") ? `${dir}local_settings.abc` : `${dir}/local_settings.abc`;
    }
  }
  const [globalText, localText, userText] = await Promise.all([
    loadHeaderLayer(globalPath),
    loadHeaderLayer(localPath),
    loadHeaderLayer(userPath),
  ]);
  globalHeaderGlobalText = globalText;
  globalHeaderLocalText = localText;
  globalHeaderUserText = userText;
  const next = `${globalHeaderGlobalText}|${globalHeaderLocalText}|${globalHeaderUserText}`;
  if (next !== prev) renderNow();
}

function buildHeaderPrefix(entryHeader, includeCheckbars, tuneText) {
  const parts = [];
  const tuneHeaderKeys = tuneText ? collectHeaderKeys(tuneText) : new Set();
  const layers = [];
  if (globalHeaderEnabled) {
    const globalHeaderRaw = normalizeHeaderLayer(globalHeaderGlobalText);
    if (globalHeaderRaw) layers.push(globalHeaderRaw);
    const localHeaderRaw = normalizeHeaderLayer(globalHeaderLocalText);
    if (localHeaderRaw) layers.push(localHeaderRaw);
    const userHeaderRaw = normalizeHeaderLayer(globalHeaderUserText);
    if (userHeaderRaw) layers.push(userHeaderRaw);
    const legacyHeaderRaw = normalizeHeaderLayer(globalHeaderText);
    if (legacyHeaderRaw) layers.push(legacyHeaderRaw);
  }
  const fileHeaderRaw = String(entryHeader || "");
  if (fileHeaderRaw.trim()) layers.push(fileHeaderRaw.replace(/[\r\n]+$/, ""));
  const deduped = dedupeHeaderLayers(layers, tuneHeaderKeys);
  let header = deduped.join("\n");
  if (includeCheckbars && isMeasureCheckEnabled()) {
    header = injectCheckbarsDirective(header);
  }
  if (!header.trim()) return { text: "", offset: 0 };
  const prefix = /[\r\n]$/.test(header) ? header : `${header}\n`;
  return { text: prefix, offset: prefix.length };
}

function parseFraction(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "C") return { num: 4, den: 4 };
  if (raw === "C|") return { num: 2, den: 2 };
  const match = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return { num, den };
}

function normalizeFraction(frac) {
  if (!frac) return null;
  let num = frac.num;
  let den = frac.den;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  const sign = den < 0 ? -1 : 1;
  num *= sign;
  den *= sign;
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
}

function fractionDiv(a, b) {
  return normalizeFraction({ num: a.num * b.den, den: a.den * b.num });
}

function fractionMul(a, b) {
  return normalizeFraction({ num: a.num * b.num, den: a.den * b.den });
}

function fractionMulInt(a, k) {
  return normalizeFraction({ num: a.num * k, den: a.den });
}

function fractionToNumber(a) {
  return a.num / a.den;
}

function formatDuration(mult) {
  const frac = normalizeFraction(mult);
  if (!frac) return "";
  if (frac.num === frac.den) return "";
  if (frac.den === 1) return String(frac.num);
  if (frac.num === 1) return `/${frac.den}`;
  return `${frac.num}/${frac.den}`;
}

function parseDrumPattern(pattern) {
  const raw = String(pattern || "").trim();
  if (!raw) return null;
  const tokens = [];
  let hitIndex = 0;
  let totalUnits = 0;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch !== "d" && ch !== "z") {
      i += 1;
      continue;
    }
    i += 1;
    let num = "";
    while (i < raw.length && /[0-9]/.test(raw[i])) {
      num += raw[i];
      i += 1;
    }
    const len = num ? Number(num) : 1;
    if (!Number.isFinite(len) || len <= 0) continue;
    const token = { type: ch, len };
    if (ch === "d") {
      token.hitIndex = hitIndex;
      hitIndex += 1;
    }
    tokens.push(token);
    totalUnits += len;
  }
  if (!tokens.length || totalUnits <= 0) return null;
  return { tokens, totalUnits, hitCount: hitIndex };
}

function matchBarToken(line, idx) {
  const chunk = line.slice(idx);
  for (const token of BAR_SEP_SYMBOLS) {
    if (chunk.startsWith(token)) return { token, len: token.length };
  }
  return null;
}

function slicePatternTokens(tokens, startUnit, length) {
  const out = [];
  let cursor = 0;
  for (const token of tokens) {
    const tokenStart = cursor;
    const tokenEnd = cursor + token.len;
    if (tokenEnd <= startUnit) {
      cursor = tokenEnd;
      continue;
    }
    if (tokenStart >= startUnit + length) break;
    const sliceStart = Math.max(tokenStart, startUnit);
    const sliceEnd = Math.min(tokenEnd, startUnit + length);
    const sliceLen = sliceEnd - sliceStart;
    if (sliceLen > 0) {
      let type = token.type;
      let hitIndex = token.hitIndex;
      if (token.type === "d" && sliceStart > tokenStart) {
        type = "z";
        hitIndex = null;
      }
      out.push({ type, len: sliceLen, hitIndex });
    }
    cursor = tokenEnd;
  }
  return out;
}

function buildPitchMap(pitches) {
  const unique = [];
  const seen = new Set();
  for (const pitch of pitches) {
    if (!Number.isFinite(pitch)) continue;
    if (seen.has(pitch)) continue;
    seen.add(pitch);
    unique.push(pitch);
  }
  const palette = [
    "C,", "D,", "E,", "F,", "G,", "A,", "B,",
    "C", "D", "E", "F", "G", "A", "B",
    "c", "d", "e", "f", "g", "a", "b",
    "c'", "d'", "e'", "f'", "g'", "a'", "b'",
  ];
  const map = new Map();
  let idx = 0;
  for (const pitch of unique) {
    const note = palette[idx % palette.length];
    map.set(pitch, note);
    idx += 1;
  }
  return map;
}

function extractDrumPlaybackBars(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  let meter = { num: 4, den: 4 };
  let unit = { num: 1, den: 8 };
  let drumOn = false;
  let drumBars = 1;
  let currentPattern = null;
  let inBody = false;
  let currentVoice = null;
  let primaryVoice = null;
  let firstVoice = null;
  let pendingStartToken = null;
  let hasContent = false;
  let leadingToken = null;
  let inTextBlock = false;
  const bars = [];
  const patterns = [];
  const parseFieldValue = (line, field) => {
    const re = new RegExp(`\\b${field}:\\s*([^\\]\\s]+)`);
    const match = line.match(re);
    return match ? match[1] : null;
  };
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("V:")) {
      const v = trimmed.slice(2).trim().split(/\s+/)[0];
      if (v) {
        currentVoice = v;
        if (!firstVoice) firstVoice = v;
        if (inBody && !primaryVoice) primaryVoice = v;
      }
    }
    if (!inBody) {
      const kValue = parseFieldValue(trimmed, "K");
      if (kValue != null) {
        inBody = true;
        if (!primaryVoice && firstVoice) primaryVoice = firstVoice;
      }
    }
    const meterValue = parseFieldValue(trimmed, "M");
    if (meterValue) {
      const parsed = parseFraction(meterValue);
      if (parsed) meter = parsed;
    }
    const unitValue = parseFieldValue(trimmed, "L");
    if (unitValue) {
      const parsed = parseFraction(unitValue);
      if (parsed) unit = parsed;
    }
    if (/^%%MIDI\s+drumon\b/i.test(trimmed)) {
      drumOn = true;
      continue;
    }
    if (/^%%MIDI\s+drumoff\b/i.test(trimmed)) {
      drumOn = false;
      continue;
    }
    const drumBarsMatch = trimmed.match(/^%%MIDI\s+drumbars\s+(\d+)/i);
    if (drumBarsMatch) {
      const nextBars = Number(drumBarsMatch[1]);
      if (Number.isFinite(nextBars) && nextBars > 0) drumBars = nextBars;
      continue;
    }
    const drumMatch = trimmed.match(/^%%MIDI\s+drum\s+(.+)$/i);
    if (drumMatch) {
      const parts = drumMatch[1].trim().split(/\s+/);
      const patternText = parts.shift();
      const pattern = parseDrumPattern(patternText);
      if (pattern) {
        const nums = parts.map((n) => Number(n)).filter((n) => Number.isFinite(n));
        const pitchCount = pattern.hitCount || 0;
        const pitches = nums.slice(0, pitchCount);
        const velocities = nums.slice(pitchCount, pitchCount * 2);
        currentPattern = {
          id: patterns.length + 1,
          raw: patternText,
          tokens: pattern.tokens,
          totalUnits: pattern.totalUnits,
          hitCount: pattern.hitCount,
          pitches,
          velocities,
        };
        patterns.push(currentPattern);
      }
      continue;
    }
    if (!inBody) continue;
    if (/^%/.test(trimmed)) continue;
    if (/^%%\s*begintext\b/i.test(trimmed)) {
      inTextBlock = true;
      continue;
    }
    if (/^%%\s*endtext\b/i.test(trimmed)) {
      inTextBlock = false;
      continue;
    }
    if (inTextBlock) continue;
    if (/^%%/.test(trimmed)) continue;
    if (/^[Ww]:/.test(trimmed)) continue;
    if (/^[A-Za-z]:/.test(trimmed) && !/^V:/.test(trimmed)) continue;
    if (!primaryVoice && currentVoice) primaryVoice = currentVoice;
    if (primaryVoice && currentVoice && currentVoice !== primaryVoice) continue;
    let line = rawLine;
    if (!trimmed.startsWith("%%")) {
      const idx = line.indexOf("%");
      if (idx >= 0) line = line.slice(0, idx);
    }
    let inQuote = false;
    for (let i = 0; i < line.length; ) {
      const ch = line[i];
      if (ch === "\"") {
        inQuote = !inQuote;
        i += 1;
        continue;
      }
      if (!inQuote) {
        const token = matchBarToken(line, i);
        if (token) {
          if (hasContent) {
            bars.push({
              meter,
              unit,
              drumOn,
              drumBars,
              pattern: currentPattern,
              startToken: pendingStartToken,
              endToken: token.token,
            });
            pendingStartToken = null;
            hasContent = false;
          } else {
            pendingStartToken = token.token;
            if (!leadingToken && bars.length === 0) {
              leadingToken = token.token;
            }
          }
          i += token.len;
          continue;
        }
        if (/[A-Ga-gz]/.test(ch)) hasContent = true;
      }
      i += 1;
    }
  }
  return { bars, patterns, leadingToken };
}

function buildDrumVoiceText(info) {
  if (!info || !info.bars || !info.bars.length) return "";
  const bars = info.bars;
  const usedPitches = [];
  let hasActivePattern = false;
  for (const bar of bars) {
    if (!bar.drumOn || !bar.pattern || !bar.pattern.pitches) continue;
    hasActivePattern = true;
    for (const pitch of bar.pattern.pitches) usedPitches.push(pitch);
  }
  if (!usedPitches.length) {
    if (!hasActivePattern) return "";
    usedPitches.push(35);
  }
  const pitchMap = buildPitchMap(usedPitches);
  const drummapLines = [];
  for (const [pitch, note] of pitchMap.entries()) {
    drummapLines.push(`%%MIDI drummap ${note} ${pitch}`);
  }

  const out = [];
  out.push("V:DRUM clef=perc name=\"Drums\"");
  out.push("%%MIDI channel 10");
  out.push(...drummapLines);

  let patternKey = null;
  let patternBarIndex = 0;
  let wasOn = false;
  let barInLine = 0;
  let lineBuffer = "";
  let sep = info.leadingToken || "";

  const flushLine = () => {
    if (lineBuffer) out.push(lineBuffer);
    lineBuffer = "";
    barInLine = 0;
  };

  for (const bar of bars) {
    const meter = normalizeFraction(bar.meter) || { num: 4, den: 4 };
    const unit = normalizeFraction(bar.unit) || { num: 1, den: 8 };
    const barUnits = fractionDiv(meter, unit);
    let barText = "";

    if (!bar.drumOn || !bar.pattern) {
      barText = `z${formatDuration(barUnits)}`;
      patternKey = null;
      patternBarIndex = 0;
      wasOn = false;
    } else {
      const pattern = bar.pattern;
      const key = `${pattern.id}:${bar.drumBars}`;
      if (!wasOn || key !== patternKey) patternBarIndex = 0;
      patternKey = key;
      wasOn = true;

      let drumBars = Number(bar.drumBars) || 1;
      let startUnit = 0;
      let length = pattern.totalUnits;
      if (drumBars > 1 && pattern.totalUnits % drumBars === 0) {
        length = pattern.totalUnits / drumBars;
        startUnit = length * (patternBarIndex % drumBars);
      } else {
        drumBars = 1;
        startUnit = 0;
        length = pattern.totalUnits;
      }
      const slice = slicePatternTokens(pattern.tokens, startUnit, length);
      const unitDur = fractionDiv(barUnits, { num: length, den: 1 });
      const parts = [];
      for (const token of slice) {
        const dur = fractionMulInt(unitDur, token.len);
        const durText = formatDuration(dur);
        if (token.type === "z") {
          parts.push(`z${durText}`);
          continue;
        }
        const pitchList = pattern.pitches || [];
        const pitch = pitchList.length
          ? pitchList[token.hitIndex % pitchList.length]
          : 35;
        const note = pitchMap.get(pitch) || "C";
        parts.push(`${note}${durText}`);
      }
      barText = parts.join("");
      patternBarIndex += 1;
    }

    if (bar.startToken) sep = bar.startToken;
    lineBuffer += `${sep}${barText}`;
    sep = bar.endToken || "|";
    barInLine += 1;
    if (barInLine >= 4) flushLine();
  }
  if (lineBuffer) {
    lineBuffer += sep;
    flushLine();
  }
  return out.join("\n");
}

function injectDrumPlayback(text) {
  if (text === lastDrumInjectInput && lastDrumInjectResult) {
    return lastDrumInjectResult;
  }
  lastDrumPlaybackActive = false;
  if (/^\s*V:\s*DRUM\b/im.test(text || "")) {
    const res = { text, changed: false, insertAtLine: null, lineCount: 0 };
    lastDrumInjectInput = text;
    lastDrumInjectResult = res;
    return res;
  }
  const info = extractDrumPlaybackBars(text);
  const drumVoice = buildDrumVoiceText(info);
  if (!drumVoice) {
    const res = { text, changed: false, insertAtLine: null, lineCount: 0 };
    lastDrumInjectInput = text;
    lastDrumInjectResult = res;
    return res;
  }
  lastDrumPlaybackActive = true;
  if (window.__abcarusDebugDrums) {
    console.log("[abcarus] drum voice:\n" + drumVoice);
  }
  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (/^%/.test(trimmed)) continue;
    if (/^%%score\b/i.test(trimmed)) {
      if (!/\bDRUM\b/.test(lines[i])) lines[i] = `${lines[i]} DRUM`;
      break;
    }
    if (/^%%staves\b/i.test(trimmed)) {
      if (!/\bDRUM\b/.test(lines[i])) lines[i] = `${lines[i]} DRUM`;
      break;
    }
  }
  let insertAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\s*%+sep\b/i.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  for (let i = insertAt - 1; i >= 0; i -= 1) {
    if (lines[i].trim() === "") {
      lines[i] = "%";
    } else {
      break;
    }
  }
  const drumLines = drumVoice.split("\n");
  lines.splice(insertAt, 0, ...drumLines);
  const merged = lines.join("\n");
  const suffix = merged.endsWith("\n") ? "" : "\n";
  const res = {
    text: `${merged}${suffix}`,
    changed: true,
    insertAtLine: insertAt + 1,
    lineCount: drumLines.length,
  };
  lastDrumInjectInput = text;
  lastDrumInjectResult = res;
  return res;
}

function injectGchordOn(text, insertAt) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  let hasGchordPattern = false;
  let hasGchordToggle = false;
  let inTextBlock = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^%%\s*begintext\b/i.test(trimmed)) {
      inTextBlock = true;
      continue;
    }
    if (/^%%\s*endtext\b/i.test(trimmed)) {
      inTextBlock = false;
      continue;
    }
    if (inTextBlock) continue;
    if (/^%/.test(trimmed) && !/^%%/.test(trimmed)) continue;
    if (/^%%MIDI\s+gchord(on|off)\b/i.test(trimmed)) {
      hasGchordToggle = true;
      continue;
    }
    if (/^%%MIDI\s+gchord\b/i.test(trimmed)) {
      hasGchordPattern = true;
    }
  }

  if (!hasGchordPattern || hasGchordToggle) {
    return { text, changed: false, offsetDelta: 0 };
  }

  const safeInsertAt = Number.isFinite(insertAt) ? insertAt : 0;
  let insertText = "%%MIDI gchordon\n";
  if (safeInsertAt > 0 && text[safeInsertAt - 1] !== "\n") {
    insertText = `\n${insertText}`;
  }
  const merged = `${text.slice(0, safeInsertAt)}${insertText}${text.slice(safeInsertAt)}`;
  return { text: merged, changed: true, offsetDelta: insertText.length };
}

function getPlaybackPayload() {
  const tuneText = getEditorValue();
  const entry = getActiveFileEntry();
  const prefixPayload = buildHeaderPrefix(entry ? getHeaderEditorValue() : "", false, tuneText);
  const baseText = prefixPayload.text ? `${prefixPayload.text}${tuneText}` : tuneText;
  const repeatsFlag = window.__abcarusPlaybackExpandRepeats === true ? "exp:on" : "exp:off";
  const sourceKey = `${baseText}|||${prefixPayload.offset || 0}|||${repeatsFlag}`;
  if (lastPlaybackPayloadCache && lastPlaybackPayloadCache.key === sourceKey) {
    lastPlaybackMeta = lastPlaybackPayloadCache.meta
      || { drumInsertAtLine: null, drumLineCount: 0 };
    return {
      text: lastPlaybackPayloadCache.text,
      offset: lastPlaybackPayloadCache.offset,
    };
  }
  let payload = prefixPayload.text
    ? { text: `${prefixPayload.text}${tuneText}`, offset: prefixPayload.offset }
    : { text: tuneText, offset: 0 };
  const gchordInjected = injectGchordOn(payload.text, prefixPayload.offset || 0);
  if (gchordInjected.changed) {
    payload = {
      text: gchordInjected.text,
      offset: (payload.offset || 0) + (gchordInjected.offsetDelta || 0),
    };
  }
  const drumInjected = injectDrumPlayback(payload.text);
  if (drumInjected.changed) payload = { text: drumInjected.text, offset: payload.offset };
  lastPlaybackMeta = drumInjected.changed
    ? { drumInsertAtLine: drumInjected.insertAtLine, drumLineCount: drumInjected.lineCount }
    : { drumInsertAtLine: null, drumLineCount: 0 };
  if (window.__abcarusPlaybackExpandRepeats === true) {
    payload = {
      text: expandRepeatsForPlayback(payload.text),
      offset: payload.offset,
    };
  }
  lastPlaybackPayloadCache = {
    key: sourceKey,
    text: payload.text,
    offset: payload.offset,
    meta: lastPlaybackMeta,
  };
  lastPreparedPlaybackKey = sourceKey;
  assertCleanAbcText(payload.text, "playback payload");
  return payload;
}

function getRenderPayload() {
  const tuneText = getEditorValue();
  const entry = getActiveFileEntry();
  const prefixPayload = buildHeaderPrefix(entry ? getHeaderEditorValue() : "", true, tuneText);
  if (!prefixPayload.text) return { text: tuneText, offset: 0 };
  const out = { text: `${prefixPayload.text}${tuneText}`, offset: prefixPayload.offset };
  assertCleanAbcText(out.text, "render payload");
  return out;
}

async function preparePlayback() {
  clearErrors();
  await ensureSoundfontReady();
  const p = ensurePlayer();
  if (player && typeof player.stop === "function") {
    suppressOnEnd = true;
    player.stop();
  }
  if (typeof p.clear === "function") p.clear();

  try { sessionStorage.setItem("audio", "sf2"); } catch {}

  const AbcCtor = getAbcCtor();
  const logPlaybackErr = (message, line, col) => {
    let loc = null;
    if (Number.isFinite(line) && Number.isFinite(col)) {
      loc = { line: line + 1, col: col + 1 };
    } else {
      loc = parseErrorLocation(message);
    }
    const drumStart = (lastPlaybackMeta && Number.isFinite(lastPlaybackMeta.drumInsertAtLine))
      ? lastPlaybackMeta.drumInsertAtLine
      : null;
    const drumLines = (lastPlaybackMeta && Number.isFinite(lastPlaybackMeta.drumLineCount))
      ? lastPlaybackMeta.drumLineCount
      : 0;
    const inDrumBlock = loc
      && drumStart
      && drumLines > 0
      && loc.line >= drumStart
      && loc.line < (drumStart + drumLines);
    if (inDrumBlock) {
      const cleaned = String(message || "").replace(/^\s*play:\d+:\d+\s*/i, "").trim();
      logErr(cleaned || message, null, { skipMeasureRange: true });
      return;
    }
    logErr(message, loc, { skipMeasureRange: true });
  };
  const user = {
    img_out: () => {},
    err: (m) => logPlaybackErr(m),
    errmsg: (m, line, col) => logPlaybackErr(m, line, col),
    abcplay: p,
  };
  const abc = new AbcCtor(user);
  const playbackPayload = getPlaybackPayload();
  if (!assertCleanAbcText(playbackPayload.text, "preparePlayback")) {
    throw new Error("ABC text corruption detected (playback).");
  }
  if (window.__abcarusDebugDrums) {
    const lines = String(playbackPayload.text || "").split(/\r\n|\n|\r/);
    const drumLines = lines.filter((line) => /DRUM|drum|drummap|MIDI channel/i.test(line));
    const tail = lines.slice(-60);
    console.log("[abcarus] playback payload (drum lines):\n" + drumLines.join("\n"));
    console.log("[abcarus] playback payload (tail):\n" + tail.join("\n"));
  }
  if (window.__abcarusDebugPlayback) {
    const lines = String(playbackPayload.text || "").split(/\r\n|\n|\r/);
    console.log("[abcarus] playback payload (head):\n" + lines.slice(0, 40).join("\n"));
  }
  playbackIndexOffset = playbackPayload.offset || 0;
  setErrorLineOffsetFromHeader(playbackPayload.text.slice(0, playbackIndexOffset));
  const playbackText = normalizeHeaderNoneSpacing(playbackPayload.text);
  abc.tosvg("play", playbackText);

  const tunes = abc.tunes || [];
  if (!tunes.length) throw new Error("No tunes parsed; cannot play.");

  for (const t of tunes) {
    p.add(t[0], t[1], t[3]);
  }

  playbackState = buildPlaybackState(tunes[0][0]);
  playbackNoteTrace = [];
  window.__abcarusPlaybackDebug = {
    getState: () => ({
      preparedKey: lastPreparedPlaybackKey,
      playbackIndexOffset,
      startIstart: playbackState && playbackState.startSymbol ? playbackState.startSymbol.istart : null,
      measures: playbackState ? playbackState.measures.length : 0,
      symbols: playbackState ? playbackState.symbols.length : 0,
      bars: playbackState && playbackState.barIstarts ? playbackState.barIstarts.length : 0,
    }),
    getPlaybackRange: () => clonePlaybackRange(playbackRange),
    getTimeline: () => (playbackState ? playbackState.timeline : []),
    getTrace: () => playbackNoteTrace.slice(),
    clearTrace: () => { playbackNoteTrace = []; },
  };
  if (window.__abcarusDebugPlayback) {
    const symPreview = playbackState.symbols.slice(0, 10).map((item) => {
      const sym = item.symbol || {};
      return {
        istart: sym.istart,
        time: sym.time,
        bar_type: sym.bar_type,
        type: sym.type || sym.sym || sym.name,
      };
    });
    const measPreview = playbackState.measures.slice(0, 6).map((item) => item.istart);
    console.log("[abcarus] playback symbols head:", symPreview);
    console.log("[abcarus] playback measures head:", measPreview);
    console.log("[abcarus] playback start:", playbackState.startSymbol && playbackState.startSymbol.istart);
  }
  setFollowVoiceFromPlayback();
  return p;
}

function startPlaybackFromPrepared(startIdx) {
  if (!playbackStartArmed) {
    stopPlaybackFromGuard("Playback start invoked outside startPlaybackFromRange().");
    return;
  }
  const startSymbol = findSymbolAtOrAfter(startIdx);
  if (!startSymbol) throw new Error("Playback start not found.");

  let start = startSymbol;
  if (playbackState && playbackState.symbols.length) {
    const isPlayable = (symbol) => !!(symbol && Number.isFinite(symbol.dur) && symbol.dur > 0);
    if (!isPlayable(start)) {
      const fallback = playbackState.symbols.find((item) =>
        item.symbol && Number.isFinite(item.symbol.istart) && item.symbol.istart >= start.istart && isPlayable(item.symbol)
      );
      if (fallback) start = fallback.symbol;
    }
  }

  lastStartPlaybackIdx = Number.isFinite(start.istart) ? start.istart : 0;
  lastPlaybackIdx = null;
  lastRenderIdx = null;
  resumeStartIdx = null;
  suppressOnEnd = true;

  player.play(start, null, 0);
  isPlaying = true;
  isPaused = false;
  if (!waitingForFirstNote) setStatus("Playing…");
  updatePlayButton();
  setTimeout(() => {
    suppressOnEnd = false;
  }, 0);
}

function resolvePlaybackEndAbcOffset(range, startAbcOffset) {
  if (!range || range.endOffset == null) return null;
  const endOffset = Number(range.endOffset);
  if (!Number.isFinite(endOffset)) return null;
  const endAbcOffset = endOffset + playbackIndexOffset;
  if (!Number.isFinite(endAbcOffset) || endAbcOffset <= startAbcOffset) return null;
  const sym = findSymbolAtOrAfter(endAbcOffset);
  if (!sym || !Number.isFinite(sym.istart)) return null;
  return sym.istart;
}

async function startPlaybackFromRange(rangeOverride) {
  if (!editorView) return;
  const range = clonePlaybackRange(rangeOverride || playbackRange);
  const max = editorView.state.doc.length;
  if (!Number.isFinite(range.startOffset) || range.startOffset < 0 || range.startOffset > max) {
    showToast("Playback range start is invalid.", 2600);
    return;
  }

  // Guard: only one active PlaybackRange at a time.
  if (activePlaybackRange && isPlaying) {
    stopPlaybackFromGuard("Second PlaybackRange attempted to become active while playing.");
    return;
  }

  clearNoteSelection();
  const sourceKey = getPlaybackSourceKey();
  const canReuse = playbackState && lastPreparedPlaybackKey && lastPreparedPlaybackKey === sourceKey && player;
  waitingForFirstNote = true;
  if (!canReuse) {
    stopPlaybackForRestart();
    const desired = soundfontName || "TimGM6mb.sf2";
    setSoundfontCaption("Loading...");
    updateSoundfontLoadingStatus(desired);
    await preparePlayback();
  } else {
    await ensureSoundfontReady();
    stopPlaybackForRestart();
  }

  const startAbcOffset = toDerivedOffset(range.startOffset);
  if (!Number.isFinite(startAbcOffset)) {
    showToast("Playback range start is invalid.", 2600);
    return;
  }
  const startSym = findSymbolAtOrAfter(startAbcOffset);
  if (!startSym || !Number.isFinite(startSym.istart)) {
    showToast("Playback start is not mappable.", 2600);
    waitingForFirstNote = false;
    return;
  }

  // Guard: ensure we map startOffset deterministically (no fallback mapping).
  if (startSym.istart < startAbcOffset) {
    stopPlaybackFromGuard("PlaybackRange.startOffset mapped to a symbol before startOffset.");
    return;
  }

  // Switch semantics guard (Option B): playbackRange changes while playing are deferred; we also freeze loop start.
  activePlaybackRange = range;
  activePlaybackEndAbcOffset = (range.endOffset == null) ? null : (Number(range.endOffset) + playbackIndexOffset);
  if (activePlaybackEndAbcOffset != null && !Number.isFinite(activePlaybackEndAbcOffset)) activePlaybackEndAbcOffset = null;
  if (activePlaybackEndAbcOffset != null && activePlaybackEndAbcOffset <= startSym.istart) activePlaybackEndAbcOffset = null;

  playbackRunId += 1;
  lastTraceRunId = playbackRunId;
  lastTracePlaybackIdx = null;
  lastTraceTimestamp = null;
  playbackTraceSeq = 0;

  playbackStartArmed = true;
  startPlaybackFromPrepared(startSym.istart);
  playbackStartArmed = false;
}

async function startPlaybackAtIndex(startIdx) {
  if (!editorView) return;
  const max = editorView.state.doc.length;
  const next = Number.isFinite(startIdx) ? Math.max(0, Math.min(startIdx, max)) : 0;
  setPlaybackRange({
    startOffset: next,
    endOffset: null,
    origin: "cursor",
    loop: playbackRange.loop,
  });
  await startPlaybackFromRange();
}

function pausePlayback() {
  if (!player || !isPlaying) return;
  resumeStartIdx = Number.isFinite(lastPlaybackIdx) ? lastPlaybackIdx : lastStartPlaybackIdx;
  stopPlaybackForRestart();
  isPlaying = false;
  isPaused = true;
  waitingForFirstNote = false;
  setStatus("Paused");
  updatePlayButton();
  setSoundfontCaption();
  if (Number.isFinite(lastRenderIdx)) {
    setPlaybackRange({
      startOffset: lastRenderIdx,
      endOffset: null,
      origin: "cursor",
      loop: playbackRange.loop,
    });
  }
  if (followPlayback && lastRenderIdx != null && editorView) {
    const max = editorView.state.doc.length;
    const idx = Math.max(0, Math.min(lastRenderIdx, max));
    editorView.dispatch({ selection: { anchor: idx, head: idx } });
  }
}

async function startPlaybackAtMeasureOffset(delta) {
  clearNoteSelection();
  const sourceKey = getPlaybackSourceKey();
  const canReuse = playbackState && lastPreparedPlaybackKey && lastPreparedPlaybackKey === sourceKey && player;
  if (!canReuse) {
    stopPlaybackForRestart();
    await preparePlayback();
  } else {
    await ensureSoundfontReady();
    stopPlaybackForRestart();
  }
  if (!playbackState || !playbackState.measures.length) {
    setPlaybackRange({
      startOffset: 0,
      endOffset: null,
      origin: "cursor",
      loop: playbackRange.loop,
    });
    await startPlaybackFromRange();
    return;
  }
  const baseIdx = Number.isFinite(lastPlaybackIdx) ? lastPlaybackIdx : lastStartPlaybackIdx;
  const current = findMeasureIndex(baseIdx);
  const targetIndex = Math.max(0, Math.min(playbackState.measures.length - 1, current + delta));
  const target = playbackState.measures[targetIndex];
  const targetIdx = target && Number.isFinite(target.istart) ? target.istart : 0;
  const editorStart = Math.max(0, targetIdx - playbackIndexOffset);
  setPlaybackRange({
    startOffset: editorStart,
    endOffset: null,
    origin: "cursor",
    loop: playbackRange.loop,
  });
  await startPlaybackFromRange();
}

async function playDrumPreview(pitch, velocity) {
  const midiPitch = Number.isFinite(Number(pitch)) ? Number(pitch) : 35;
  const dyn = velocityToDynamic(velocity);
  try {
    if (isPlaying || isPaused) {
      stopPlaybackForRestart();
      isPlaying = false;
      isPaused = false;
      waitingForFirstNote = false;
      updatePlayButton();
    }
    isPreviewing = true;
    await ensureSoundfontLoaded();
    const p = ensurePlayer();
    if (typeof p.set_sfu === "function") p.set_sfu(soundfontSource || "abc2svg.sf2");
    try { sessionStorage.setItem("audio", "sf2"); } catch {}
    if (typeof p.clear === "function") p.clear();
    const AbcCtor = getAbcCtor();
    const user = {
      img_out: () => {},
      err: (m) => logErr(m),
      errmsg: (m) => logErr(m),
      abcplay: p,
    };
    const abc = new AbcCtor(user);
    const abcText = [
      "X:1",
      "L:1/4",
      "M:4/4",
      "K:C",
      "V:DRUM clef=perc name=\"Drums\"",
      "%%MIDI channel 10",
      `%%MIDI drummap C, ${midiPitch}`,
      `!${dyn}!C,`,
      "",
    ].join("\n");
    abc.tosvg("drum_preview", abcText);
    const tunes = abc.tunes || [];
    if (!tunes.length) return;
    p.add(tunes[0][0], tunes[0][1], tunes[0][3]);
    p.play(tunes[0][0], null, 0);
  } catch (e) {
    logErr((e && e.stack) ? e.stack : String(e));
    isPreviewing = false;
  }
}

if ($btnPlayPause) {
  $btnPlayPause.addEventListener("click", async () => {
    try {
      if (isPlaying) {
        pausePlayback();
        return;
      }
      if (isPaused) {
        await startPlaybackFromRange();
        return;
      }
      await startPlaybackFromRange();
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($btnPlay) {
  $btnPlay.addEventListener("click", async () => {
    try {
      await transportPlay();
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($btnPause) {
  $btnPause.addEventListener("click", async () => {
    try {
      await transportPause();
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($btnStop) {
  $btnStop.addEventListener("click", () => {
    stopPlaybackTransport();
  });
}

if ($btnRestart) {
  $btnRestart.addEventListener("click", async () => {
    try {
      await startPlaybackAtIndex(0);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($btnPrevMeasure) {
  $btnPrevMeasure.addEventListener("click", async () => {
    try {
      await activateErrorByNav(-1);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($btnNextMeasure) {
  $btnNextMeasure.addEventListener("click", async () => {
    try {
      await activateErrorByNav(1);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

document.addEventListener("drum:preview", (event) => {
  const detail = event && event.detail ? event.detail : {};
  playDrumPreview(detail.pitch, detail.velocity);
});

if ($soundfontSelect) {
  loadSoundfontSelectOptions();
  $soundfontSelect.addEventListener("change", () => {
    const next = $soundfontSelect.value || "TimGM6mb.sf2";
    soundfontName = next;
    resetSoundfontCache();
    if (player && typeof player.stop === "function") {
      suppressOnEnd = true;
      player.stop();
    }
    player = null;
    playbackState = null;
    playbackIndexOffset = 0;
    isPlaying = false;
    isPaused = false;
    waitingForFirstNote = false;
    updatePlayButton();
    setSoundfontCaption("Loading...");
    updateSoundfontLoadingStatus(next);
    ensureSoundfontLoaded().catch(() => setSoundfontStatus("Soundfont load failed", 5000));
    if (window.api && typeof window.api.updateSettings === "function") {
      window.api.updateSettings({ soundfontName: next }).catch(() => {});
    }
  });
}

if ($soundfontAdd) {
  $soundfontAdd.addEventListener("click", async () => {
    try {
      if (!window.api || typeof window.api.pickSoundfont !== "function") return;
      const picked = await window.api.pickSoundfont();
      if (!picked) return;
      if (!/\.sf2$/i.test(String(picked))) {
        setStatus("Soundfont must be a .sf2 file.");
        return;
      }
      if (window.api && typeof window.api.fileExists === "function") {
        const exists = await window.api.fileExists(picked);
        if (!exists) {
          setStatus("Soundfont file not found.");
          return;
        }
      }
      let current = {};
      if (typeof window.api.getSettings === "function") {
        try {
          current = await window.api.getSettings();
        } catch {}
      }
      const existing = Array.isArray(current.soundfontPaths) ? current.soundfontPaths : [];
      const nextPaths = existing.includes(picked) ? existing : [...existing, picked];
      if (window.api && typeof window.api.updateSettings === "function") {
        await window.api.updateSettings({ soundfontPaths: nextPaths, soundfontName: picked });
      }
      soundfontName = picked;
      updateSoundfontSelectValue();
      loadSoundfontSelectOptions(true);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
    }
  });
}

if ($soundfontRemove) {
  $soundfontRemove.addEventListener("click", async () => {
    const current = $soundfontSelect ? $soundfontSelect.value : "";
    if (!current) return;
    if (!isSoundfontPath(current)) {
      setStatus("Bundled soundfonts cannot be removed.");
      return;
    }
    const label = getSoundfontLabel(current);
    if (window.api && typeof window.api.confirmRemoveSoundfont === "function") {
      const ok = await window.api.confirmRemoveSoundfont(label);
      if (!ok) return;
    } else if (!window.confirm(`Remove "${label}" from the list?`)) {
      return;
    }
    if (!window.api || typeof window.api.getSettings !== "function") return;
    try {
      const settings = await window.api.getSettings();
      const existing = Array.isArray(settings.soundfontPaths) ? settings.soundfontPaths : [];
      const nextPaths = existing.filter((item) => item !== current);
      const fallback = "TimGM6mb.sf2";
      const nextName = current === soundfontName ? fallback : soundfontName;
      if (window.api && typeof window.api.updateSettings === "function") {
        await window.api.updateSettings({
          soundfontPaths: nextPaths,
          soundfontName: nextName,
        });
      }
      soundfontName = nextName;
      updateSoundfontSelectValue();
      loadSoundfontSelectOptions(true);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
    }
  });
}

if ($btnResetLayout) {
  $btnResetLayout.addEventListener("click", () => {
    resetLayout();
  });
}

if ($btnToggleFollow) {
  $btnToggleFollow.addEventListener("click", async () => {
    if (window.api && typeof window.api.updateSettings === "function") {
      await window.api.updateSettings({ followPlayback: !followPlayback });
      return;
    }
    followPlayback = !followPlayback;
    updateFollowToggle();
  });
}

if ($btnToggleErrors) {
  $btnToggleErrors.addEventListener("click", async () => {
    const next = !errorsEnabled;
    if (!next) {
      if (window.api && typeof window.api.updateSettings === "function") {
        window.api.updateSettings({ errorsEnabled: false }).catch(() => {});
      }
      setErrorsEnabled(false, { triggerRefresh: false });
      return;
    }
    // Enabling errors is session-only (not persisted).
    setErrorsEnabled(true, { triggerRefresh: true });
  });
}

if ($btnToggleGlobals) {
  $btnToggleGlobals.addEventListener("click", async () => {
    if (!window.api || typeof window.api.updateSettings !== "function") return;
    await window.api.updateSettings({ globalHeaderEnabled: !globalHeaderEnabled });
  });
}

updatePlayButton();
updateFollowToggle();
