import {
  EditorView,
  EditorState,
  EditorSelection,
  basicSetup,
  Compartment,
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
  autocompletion,
  CompletionContext,
} from "../../third_party/codemirror/cm.js";
import { initSettings } from "./settings.js";
import { transformTranspose } from "./transpose.mjs";
import { normalizeMeasuresLineBreaks, transformMeasuresPerLine } from "./measures.mjs";
import {
  buildDefaultDrumVelocityMap,
  clampVelocity,
  DEFAULT_DRUM_VELOCITY,
  velocityToDynamic,
} from "./drums.js";
import { createLibraryViewStore } from "./library/store.js";
import { createLibraryActions } from "./library/actions.js";
import { normalizeLibraryPath, pathsEqual } from "./library/path_utils.js";

const $editorHost = document.getElementById("abc-editor");
const $out = document.getElementById("out");
const $status = document.getElementById("status");
const $cursorStatus = document.getElementById("cursorStatus");
const $bufferStatus = document.getElementById("bufferStatus");
const $toolStatus = document.getElementById("toolStatus");
const $hoverStatus = document.getElementById("hoverStatus");
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
const $xIssuesModal = document.getElementById("xIssuesModal");
const $xIssuesInfo = document.getElementById("xIssuesInfo");
const $xIssuesClose = document.getElementById("xIssuesClose");
const $xIssuesCopy = document.getElementById("xIssuesCopy");
const $xIssuesJump = document.getElementById("xIssuesJump");
const $xIssuesAutoFix = document.getElementById("xIssuesAutoFix");
const $groupBy = document.getElementById("groupBy");
const $sortBy = document.getElementById("sortBy");
const $librarySearch = document.getElementById("librarySearch");
const $btnLibraryRefresh = document.getElementById("btnLibraryRefresh");
const $libraryRoot = document.getElementById("libraryRoot");
const $btnLibraryClearFilter = document.getElementById("btnLibraryClearFilter");
const $btnToggleLibrary = document.getElementById("btnToggleLibrary");
const $btnFileNew = document.getElementById("btnFileNew");
const $btnFileOpen = document.getElementById("btnFileOpen");
const $btnFileSave = document.getElementById("btnFileSave");
const $btnFileClose = document.getElementById("btnFileClose");
const $btnToggleRaw = document.getElementById("btnToggleRaw");
const $btnPlay = document.getElementById("btnPlay");
const $btnPause = document.getElementById("btnPause");
const $btnStop = document.getElementById("btnStop");
const $btnPlayPause = document.getElementById("btnPlayPause");
const $practiceTempoWrap = document.getElementById("practiceTempoWrap");
const $practiceTempo = document.getElementById("practiceTempo");
const $practiceLoopWrap = document.getElementById("practiceLoopWrap");
const $practiceLoopEnabled = document.getElementById("practiceLoopEnabled");
const $practiceLoopFrom = document.getElementById("practiceLoopFrom");
const $practiceLoopTo = document.getElementById("practiceLoopTo");
const $btnRestart = document.getElementById("btnRestart");
	const $btnPrevMeasure = document.getElementById("btnPrevMeasure");
	const $btnNextMeasure = document.getElementById("btnNextMeasure");
const $btnResetLayout = document.getElementById("btnResetLayout");
const $btnToggleSplit = document.getElementById("btnToggleSplit");
	const $btnFocusMode = document.getElementById("btnFocusMode");
	const $btnFonts = document.getElementById("btnFonts");
	const $btnToggleFollow = document.getElementById("btnToggleFollow");
	const $btnToggleGlobals = document.getElementById("btnToggleGlobals");
	const $btnToggleErrors = document.getElementById("btnToggleErrors");
const $soundfontLabel = document.getElementById("soundfontLabel");
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
const $moveTuneModal = document.getElementById("moveTuneModal");
const $moveTuneClose = document.getElementById("moveTuneClose");
const $moveTuneTarget = document.getElementById("moveTuneTarget");
const $moveTuneApply = document.getElementById("moveTuneApply");
const $moveTuneCancel = document.getElementById("moveTuneCancel");
const $aboutModal = document.getElementById("aboutModal");
const $aboutClose = document.getElementById("aboutClose");
const $aboutInfo = document.getElementById("aboutInfo");
const $aboutCopy = document.getElementById("aboutCopy");
const $setListModal = document.getElementById("setListModal");
const $setListClose = document.getElementById("setListClose");
const $setListEmpty = document.getElementById("setListEmpty");
const $setListItems = document.getElementById("setListItems");
const $setListHeader = document.getElementById("setListHeader");
const $setListClear = document.getElementById("setListClear");
const $setListSaveAbc = document.getElementById("setListSaveAbc");
const $setListExportPdf = document.getElementById("setListExportPdf");

const abcHighlightCompartment = new Compartment();
const abcDiagnosticsCompartment = new Compartment();
const abcCompletionCompartment = new Compartment();
const abcTuningModeCompartment = new Compartment();

function buildAbcCompletionSource() {
  const keyOptions = [
    "C",
    "G",
    "D",
    "A",
    "E",
    "B",
    "F#",
    "C#",
    "F",
    "Bb",
    "Eb",
    "Ab",
    "Db",
    "Gb",
    "Cb",
    "Am",
    "Em",
    "Bm",
    "F#m",
    "C#m",
    "G#m",
    "D#m",
    "A#m",
    "Dm",
    "Gm",
    "Cm",
    "Fm",
    "Bbm",
    "Ebm",
    "Abm",
  ].map((label) => ({ label, type: "keyword" }));

  const meterOptions = [
    "4/4",
    "3/4",
    "2/4",
    "6/8",
    "12/8",
    "2/2",
    "5/4",
    "7/8",
    "9/8",
    "C",
    "C|",
    "none",
  ].map((label) => ({ label, type: "keyword" }));

  const unitOptions = [
    "1/8",
    "1/16",
    "1/4",
    "1/2",
  ].map((label) => ({ label, type: "keyword" }));

  const midiDirectives = [
    { label: "%%MIDI program ", type: "keyword", info: "Select instrument program (0–127)" },
    { label: "%%MIDI instrument ", type: "keyword", info: "Alias of program (engine-defined)" },
    { label: "%%MIDI temperamentequal ", type: "keyword", info: "Enable EDO-N (e.g. 53)" },
    { label: "%%MIDI drum ", type: "keyword" },
    { label: "%%MIDI drumoff", type: "keyword" },
    { label: "%%MIDI drumon", type: "keyword" },
  ];

  /** @param {CompletionContext} context */
  return (context) => {
    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const lineText = line.text;
    const before = lineText.slice(0, pos - line.from);
    const beforeTrim = before.trimStart();

    // Offer `%%MIDI ...` directives at start of line (or after indentation).
    if (beforeTrim.startsWith("%%") || /^(\s*)$/.test(before)) {
      const m = context.matchBefore(/^\s*%%[A-Za-z]*$/);
      if (m) {
        return { from: line.from + m.from, options: midiDirectives, validFor: /^\s*%%[A-Za-z]*$/ };
      }
      const m2 = context.matchBefore(/^\s*%%MIDI\s+[A-Za-z]*$/);
      if (m2) {
        return { from: line.from + m2.from, options: midiDirectives, validFor: /^\s*%%MIDI\s+[A-Za-z]*$/ };
      }
    }

    // Header field values.
    if (/^\s*K:/.test(lineText)) {
      const m = context.matchBefore(/[A-Za-z#bm]*$/);
      if (m) return { from: line.from + m.from, options: keyOptions };
    }
    if (/^\s*M:/.test(lineText)) {
      const m = context.matchBefore(/[0-9C|/nobe]*$/i);
      if (m) return { from: line.from + m.from, options: meterOptions };
    }
    if (/^\s*L:/.test(lineText)) {
      const m = context.matchBefore(/[0-9/]*$/);
      if (m) return { from: line.from + m.from, options: unitOptions };
    }

    return null;
  };
}

function reconfigureAbcExtensions({
  highlightEnabled = true,
  diagnosticsEnabled = true,
  completionEnabled = true,
  tuningModeExtensions = [],
} = {}) {
  if (!editorView) return;

  const effects = [];
  effects.push(
    abcHighlightCompartment.reconfigure(highlightEnabled ? [abcHighlight] : [])
  );
  effects.push(
    abcDiagnosticsCompartment.reconfigure(
      diagnosticsEnabled
        ? [measureErrorPlugin, errorActivationHighlightPlugin, practiceBarHighlightPlugin]
        : []
    )
  );
  effects.push(
    abcCompletionCompartment.reconfigure(
      completionEnabled
        ? [autocompletion({ override: [buildAbcCompletionSource()], activateOnTyping: false })]
        : []
    )
  );
  effects.push(
    abcTuningModeCompartment.reconfigure(Array.isArray(tuningModeExtensions) ? tuningModeExtensions : [])
  );

  editorView.dispatch({
    effects,
    scrollIntoView: false,
  });
}
const $setListPrint = document.getElementById("setListPrint");
const $setListPageBreaks = document.getElementById("setListPageBreaks");
const $setListCompact = document.getElementById("setListCompact");
const $setListHeaderModal = document.getElementById("setListHeaderModal");
const $setListHeaderClose = document.getElementById("setListHeaderClose");
const $setListHeaderText = document.getElementById("setListHeaderText");
const $setListHeaderReset = document.getElementById("setListHeaderReset");
const $setListHeaderSave = document.getElementById("setListHeaderSave");
const $disclaimerModal = document.getElementById("disclaimerModal");
const $disclaimerOk = document.getElementById("disclaimerOk");
const $headerStateMarker = document.getElementById("headerStateMarker");

const DEFAULT_ABC = "";
const NEW_FILE_MINIMAL_ABC = `X:1
T:Untitled
K:none
`;
const TEMPLATE_ABC = `X:1
T:Կատակային Պար
T:Humoresque Dance
R:Dance
C:Հայ ժողովրդական / Armenian Folk
S:YouTube (see link)
F:https://www.youtube.com/watch?v=HrPq4KFGYXQ
Z:ABC transcription: ABCarus
P:(A B C A B)
L:1/16
Q:1/4=100
M:6/8
K:A
%%stretchlast
%%MIDI program 71
%%MIDI bassvol 80
%%MIDI bassprog 32
%%MIDI chordvol 100
%%MIDI chordprog 46
%%MIDI gchord fcfc
%%MIDI beatstring fpmpmpfpmpmp
%%MIDI drumon
%%MIDI drum d3dd2d2d2d2   39 42 42 39 42 36   50 90 90 50 90 90
%%writefields P 1
%%partsbox 1
%--------------------------------------------------------
[P:A]
"A"    ee2e2d c2dcBA      | "E"  B2cBAG   "A"   AGABcd  |
ee2e2d c2dcBA             | "E"  B2cBAG   "A"   ABGA3  :|
%
[P:B]
"F#m"  FF2FcB "Bm" B2cBAG | "C#" A2GABG   "F#m" FcBABG  |
"F#m"  FF2FcA "Bm" BAcB2G | "C#" AGBABG   "F#m" ABGF3  :|
%
[P:C]
"E7"   EEE2FG "A" AGABcd  | "E"  e2dc2B   "A"   AGBAGF  |
"E7"   EEE2FG "A" ABcde2  | "E"  e2dc2B   "A"   AGBA3  :|
%--------------------------------------------------------
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
let rawMode = false;
let rawModeFilePath = null;
let rawModeHeaderEndOffset = 0;
let rawModeOriginalTuneId = null;

let setListItems = [];
let setListPageBreaks = "perTune"; // perTune | none | auto
let setListCompact = false;
let setListHeaderText = "%%stretchlast 1\n";

const SET_LIST_STORAGE_KEY = "abcarus.setList.v1";
let setListSaveTimer = null;

function safeReadJsonLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeWriteJsonLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function saveSetListToStorageNow() {
  const payload = {
    version: "1",
    savedAtMs: Date.now(),
    pageBreaks: setListPageBreaks,
    compact: !!setListCompact,
    headerText: String(setListHeaderText || ""),
    items: Array.isArray(setListItems) ? setListItems.map((it) => ({
      id: it && it.id ? String(it.id) : "",
      sourceTuneId: it && it.sourceTuneId ? String(it.sourceTuneId) : "",
      sourcePath: it && it.sourcePath ? String(it.sourcePath) : "",
      xNumber: it && it.xNumber ? String(it.xNumber) : "",
      title: it && it.title ? String(it.title) : "",
      composer: it && it.composer ? String(it.composer) : "",
      headerText: it && it.headerText ? String(it.headerText) : "",
      text: it && it.text ? String(it.text) : "",
      addedAtMs: it && Number.isFinite(Number(it.addedAtMs)) ? Number(it.addedAtMs) : Date.now(),
    })) : [],
  };
  safeWriteJsonLocalStorage(SET_LIST_STORAGE_KEY, payload);
}

function scheduleSaveSetList() {
  if (setListSaveTimer) clearTimeout(setListSaveTimer);
  setListSaveTimer = setTimeout(() => {
    setListSaveTimer = null;
    saveSetListToStorageNow();
  }, 250);
}

function loadSetListFromStorage() {
  const saved = safeReadJsonLocalStorage(SET_LIST_STORAGE_KEY);
  if (!saved || typeof saved !== "object") return;
  const version = saved && saved.version ? String(saved.version) : "";
  if (version !== "1") return;

  const pageBreaks = saved.pageBreaks ? String(saved.pageBreaks) : "perTune";
  if (pageBreaks === "perTune" || pageBreaks === "none" || pageBreaks === "auto") {
    setListPageBreaks = pageBreaks;
  }
  setListCompact = Boolean(saved.compact);
  if (typeof saved.headerText === "string") {
    setListHeaderText = saved.headerText;
  }

  const itemsRaw = Array.isArray(saved.items) ? saved.items : [];
  const items = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const text = typeof it.text === "string" ? it.text : "";
    if (!text.trim()) continue;
    items.push({
      id: typeof it.id === "string" && it.id ? it.id : `${Date.now()}::${Math.random().toString(16).slice(2)}`,
      sourceTuneId: typeof it.sourceTuneId === "string" ? it.sourceTuneId : "",
      sourcePath: typeof it.sourcePath === "string" ? it.sourcePath : "",
      xNumber: typeof it.xNumber === "string" ? it.xNumber : "",
      title: typeof it.title === "string" ? it.title : "",
      composer: typeof it.composer === "string" ? it.composer : "",
      headerText: typeof it.headerText === "string" ? it.headerText : "",
      text,
      addedAtMs: Number.isFinite(Number(it.addedAtMs)) ? Number(it.addedAtMs) : Date.now(),
    });
    if (items.length >= 500) break;
  }
  setListItems = items;
}

loadSetListFromStorage();

function normalizeSetListHeaderTemplate(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = raw.replace(/\s+$/, "");
  if (!trimmed) return "";
  return `${trimmed}\n`;
}

function getSetListFileHeaderText() {
  const tpl = normalizeSetListHeaderTemplate(setListHeaderText);
  if (!tpl) return "";
  return `% Generated by ABCarus Set List\n${tpl}`;
}

function shouldUseZeroPageMarginsForSetList() {
  const header = String(setListHeaderText || "");
  const hasLeft0 = /^\s*%%\s*leftmargin\s+0(\s|$)/im.test(header);
  const hasRight0 = /^\s*%%\s*rightmargin\s+0(\s|$)/im.test(header);
  return hasLeft0 && hasRight0;
}

// PlaybackRange must be initialized before initEditor() runs (selection listeners fire early).
let playbackRange = {
  startOffset: 0,
  endOffset: null,
  origin: "cursor",
  loop: false,
};
let activePlaybackRange = null;
let activePlaybackEndAbcOffset = null;
let activePlaybackEndSymbol = null;
let activeLoopRange = null; // {startOffset,endOffset,origin,loop} - stable loop bounds (may differ from resume start)
var pendingPlaybackRangeOrigin = null;
let suppressPlaybackRangeSelectionSync = false;
let playbackStartArmed = false;
let playbackRunId = 0;
let lastTraceRunId = 0;
let lastTracePlaybackIdx = null;
let lastTraceTimestamp = null;
let playbackTraceSeq = 0;

	let practiceTempoMultiplier = 1;
	let playbackLoopEnabled = false;
	let playbackLoopFromMeasure = 0;
	let playbackLoopToMeasure = 0;
	let playbackLoopTuneId = null;
	const FOCUS_LOOP_DEFAULT_FROM = 1;
	const FOCUS_LOOP_DEFAULT_TO = 4;
	let currentPlaybackPlan = null;
	let pendingPlaybackPlan = null;
let transportPlayheadOffset = 0; // editor offset used for next transport start
let transportJumpHighlightActive = false;
let suppressTransportJumpClearOnce = false;
let lastRhythmErrorSuggestion = null;
let errorsEnabled = false;

let errorActivationHighlightRange = null; // {from,to} editor offsets
let errorActivationHighlightVersion = 0;
let suppressErrorActivationClear = false;
let lastSvgErrorActivationEls = [];
let practiceBarHighlightRange = null; // {from,to} editor offsets
let practiceBarHighlightVersion = 0;
let lastSvgPracticeBarEls = [];
let lastSvgFollowBarEls = [];
let lastSvgFollowMeasureEls = [];
let lastSvgPlayheadEl = null;
let lastSvgPlayheadSvg = null;
let lastSvgPlayheadXCenter = null;
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
      scheduleRenderNow();
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

function buildPracticeBarDecorations(state) {
  const r = practiceBarHighlightRange;
  if (!r) return Decoration.none;
  const max = state.doc.length;
  const from = Math.max(0, Math.min(Number(r.from), max));
  const to = Math.max(from, Math.min(Number(r.to), max));
  if (to <= from) return Decoration.none;
  return Decoration.set([Decoration.mark({ class: "cm-practice-bar" }).range(from, to)]);
}

const practiceBarHighlightPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.version = practiceBarHighlightVersion;
    this.decorations = buildPracticeBarDecorations(view.state);
  }
  update(update) {
    if (update.docChanged) {
      try {
        this.decorations = this.decorations.map(update.changes);
      } catch {}
      if (practiceBarHighlightRange) {
        try {
          const max = update.state.doc.length;
          const mappedFrom = update.changes.mapPos(Number(practiceBarHighlightRange.from), 1);
          const mappedTo = update.changes.mapPos(Number(practiceBarHighlightRange.to), -1);
          const from = Math.max(0, Math.min(mappedFrom, max));
          const to = Math.max(from, Math.min(mappedTo, max));
          practiceBarHighlightRange = (to > from) ? { from, to } : null;
        } catch {}
      }
    }
    if (update.docChanged || update.selectionSet || this.version !== practiceBarHighlightVersion) {
      this.version = practiceBarHighlightVersion;
      this.decorations = buildPracticeBarDecorations(update.state);
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

function clearSvgPracticeBarHighlight() {
  for (const el of lastSvgPracticeBarEls) {
    try { el.classList.remove("svg-practice-bar"); } catch {}
  }
  lastSvgPracticeBarEls = [];
}

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
  lastSvgPlayheadEl = null;
  lastSvgPlayheadSvg = null;
  lastSvgPlayheadXCenter = null;
}

	function getOrCreateSvgOverlayHost(svg, parentEl) {
	  if (!svg) return null;
	  const hostParent = (parentEl && parentEl.nodeType === 1 && svg.contains(parentEl)) ? parentEl : svg;
	  const existing = Array.from(hostParent.children || []).find((el) => {
	    try { return el && el.matches && el.matches("g.abcarus-svg-overlays"); } catch { return false; }
	  });
	  if (existing) return existing;
	  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
	  g.setAttribute("class", "abcarus-svg-overlays");
	  // Keep overlays in the same transform context as notes/bars by inserting into their parent group.
	  // Insert early so it stays behind notes.
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
  if (!noteEl || !$out) return null;
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
    // Prefer bars whose vertical span covers the note and are horizontally near the note.
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

  // Collect notes on the same staff band to approximate the visible line extents.
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
	  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
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
  if (!$out || !$renderPane) return false;
  if (!Number.isFinite(editorOffset)) return false;
  if (!editorView) return false;
  const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
    ? lastRenderPayload.offset
    : 0;
  const editorText = editorView.state.doc.toString();
  const measure = findMeasureRangeAt(editorText, editorOffset);
  const barEls = measure ? Array.from($out.querySelectorAll(".bar-hl")) : [];
  if (measure && barEls.length) {
    const start = measure.start + renderOffset;
    const end = measure.end + renderOffset;
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
  const pad = clampNumber(followPlayheadPad, 0, 24, 8);
  const yTop = Math.max(0, y - pad);
  const height = Math.max(1, h + pad * 2);

	  if (lastSvgPlayheadSvg && lastSvgPlayheadSvg !== svg) {
	    clearSvgPlayhead();
	  }
	  if (!lastSvgPlayheadEl || lastSvgPlayheadSvg !== svg || (lastSvgPlayheadEl && lastSvgPlayheadEl.parentNode !== hostParent)) {
	    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
	    rect.setAttribute("class", "svg-playhead-line");
	    rect.setAttribute("width", String(clampNumber(followPlayheadWidth, 1, 6, 2)));
	    rect.setAttribute("rx", "1");
	    rect.setAttribute("ry", "1");
	    rect.setAttribute("pointer-events", "none");
	    try { hostParent.appendChild(rect); } catch { try { svg.appendChild(rect); } catch {} }
	    lastSvgPlayheadEl = rect;
	    lastSvgPlayheadSvg = svg;
	  }
	  try {
	    // Place the playhead between the previous and current note positions when possible.
	    // Fallback: bias slightly left of the current note for better readability.
    const wSetting = clampNumber(followPlayheadWidth, 1, 6, 2);
    const halfW = wSetting / 2;
    const shift = clampNumber(followPlayheadShift, -20, 20, 0);
    const betweenWeight = clampNumber(followPlayheadBetweenNotesWeight, 0, 1, 1);
    const firstBias = clampNumber(followPlayheadFirstBias, 0, 20, 6);

    let xTarget = xCenter;
    if (Number.isFinite(lastSvgPlayheadXCenter)) {
      const midpoint = (lastSvgPlayheadXCenter + xCenter) / 2;
      xTarget = xCenter * (1 - betweenWeight) + midpoint * betweenWeight;
    } else {
      const autoBias = Math.max(4, Math.min(10, width * 0.35));
      xTarget = xCenter - (Number.isFinite(firstBias) ? firstBias : autoBias);
    }
    xTarget += shift;
    lastSvgPlayheadXCenter = xCenter;

    lastSvgPlayheadEl.setAttribute("width", String(wSetting));
    lastSvgPlayheadEl.setAttribute("rx", String(Math.max(0, Math.min(2, halfW))));
    lastSvgPlayheadEl.setAttribute("ry", String(Math.max(0, Math.min(2, halfW))));
    lastSvgPlayheadEl.setAttribute("x", String(xTarget - halfW));
    lastSvgPlayheadEl.setAttribute("y", String(yTop));
    lastSvgPlayheadEl.setAttribute("height", String(height));
  } catch {}
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
  // Debug log capture is opt-in to keep hot paths lean.
  // Enable via DevTools: `window.__abcarusDebugLog = true` then reload.
  if (window.__abcarusDebugLog !== true) return;
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

const devConfig = (() => {
  try {
    return (window.api && typeof window.api.getDevConfig === "function") ? (window.api.getDevConfig() || {}) : {};
  } catch {
    return {};
  }
})();
const AUTO_DUMP_DEFAULT_ENABLED = String(devConfig.ABCARUS_DEV_AUTO_DUMP || "") === "1";
const AUTO_DUMP_DIR_OVERRIDE = String(devConfig.ABCARUS_DEV_AUTO_DUMP_DIR || "");
const NATIVE_MIDI_DRUMS_DEFAULT_ENABLED = String(devConfig.ABCARUS_DEV_NATIVE_MIDI_DRUMS || "") === "1";
let autoDumpLastAtMs = 0;
let autoDumpSeq = 0;

function shouldAutoDump() {
  // Runtime override via DevTools (no reload): window.__abcarusAutoDumpOnError = true/false
  if (window.__abcarusAutoDumpOnError === true) return true;
  if (window.__abcarusAutoDumpOnError === false) return false;
  return AUTO_DUMP_DEFAULT_ENABLED;
}

function shouldUseNativeMidiDrums() {
  // Runtime override via DevTools (no reload): window.__abcarusNativeMidiDrums = true/false
  if (window.__abcarusNativeMidiDrums === true) return true;
  if (window.__abcarusNativeMidiDrums === false) return false;
  // If the user explicitly touched the setting, it wins over env defaults.
  if (latestSettingsSnapshot && latestSettingsSnapshot.playbackNativeMidiDrumsSetByUser) {
    return Boolean(latestSettingsSnapshot.playbackNativeMidiDrums);
  }
  return NATIVE_MIDI_DRUMS_DEFAULT_ENABLED;
}

function sanitizeDumpSlug(raw) {
  const base = String(raw || "").trim().toLowerCase() || "event";
  const cleaned = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "event";
}

function computeSuggestedDebugDumpDir() {
  if (AUTO_DUMP_DIR_OVERRIDE) return AUTO_DUMP_DIR_OVERRIDE;
  try {
    const href = String(window.location && window.location.href ? window.location.href : "");
    if (href.startsWith("file://") && window.api && typeof window.api.pathDirname === "function" && typeof window.api.pathJoin === "function") {
      const p = decodeURIComponent(new URL(href).pathname || "");
      if (p.includes("/src/renderer/")) {
        const rendererDir = window.api.pathDirname(p);
        const srcDir = window.api.pathDirname(rendererDir);
        const rootDir = window.api.pathDirname(srcDir);
        return window.api.pathJoin(rootDir, "scripts", "local", "debug_dumps");
      }
    }
  } catch {}
  return activeTuneMeta && activeTuneMeta.path ? safeDirname(activeTuneMeta.path) : "";
}

async function writeDebugDumpSnapshotToPath(filePath, { silent = false, reason = "" } = {}) {
  if (!filePath) return { ok: false, error: "No file path." };
  const snapshot = await buildDebugDumpSnapshot({ reason });
  const json = safeJsonStringify(snapshot);
  const res = await writeFile(filePath, json);
  if (!res || !res.ok) {
    if (!silent) {
      await showSaveError((res && res.error) ? res.error : "Unable to write debug dump.");
    }
    return { ok: false, error: (res && res.error) ? res.error : "Unable to write debug dump." };
  }
  if (!silent) showToast(`Saved debug dump: ${safeBasename(filePath)}`, 3000);
  return { ok: true, path: filePath };
}

function scheduleAutoDump(reason, extra) {
  if (!shouldAutoDump()) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - autoDumpLastAtMs < 6000) return;
  autoDumpLastAtMs = now;
  const seq = (autoDumpSeq += 1);
  const slug = sanitizeDumpSlug(reason);
  const fileName = `abcarus-auto-${nowCompactStamp()}-${slug}-${seq}.json`;
  const dir = computeSuggestedDebugDumpDir();
  if (!dir || !window.api || typeof window.api.mkdirp !== "function" || typeof window.api.pathJoin !== "function") return;
  const target = window.api.pathJoin(dir, fileName);
  window.api.mkdirp(dir).then(() => {
    writeDebugDumpSnapshotToPath(target, { silent: true, reason: `${slug}${extra ? ` ${safeString(String(extra || ""), 2000)}` : ""}` }).catch(() => {});
  }).catch(() => {});
}

(() => {
  // Console wrapping is opt-in to avoid overhead and surprising global side effects.
  // Enable via DevTools: `window.__abcarusDebugLog = true` then reload.
  if (window.__abcarusDebugLog !== true) return;
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

// Auto-dumps are cheap when disabled and invaluable when debugging: opt-in via ABCARUS_DEV_AUTO_DUMP=1.
window.addEventListener("error", (e) => {
  try {
    const msg = e && e.message ? String(e.message) : "window.error";
    scheduleAutoDump("window-error", msg);
  } catch {}
});
window.addEventListener("unhandledrejection", (e) => {
  try {
    const reason = e && e.reason ? e.reason : null;
    const msg = reason && reason.message ? String(reason.message) : String(reason || "unhandledrejection");
    scheduleAutoDump("unhandledrejection", msg);
  } catch {}
});

const MIN_PANE_WIDTH = 220;
const MIN_RIGHT_PANE_WIDTH = 220;
const MIN_RIGHT_PANE_HEIGHT = 180;
const MIN_ERROR_PANE_HEIGHT = 120;
const USE_ERROR_OVERLAY = true;
const LIBRARY_SEARCH_DEBOUNCE_MS = 180;
let settingsController = null;
let disclaimerShown = false;

function buildAbcDecorations(state) {
  const builder = new RangeSetBuilder();
  let inTextBlock = false;
  let lastNonEmptyKind = "";

  const findFirstUnescapedPercent = (text) => {
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "%" && text[i - 1] !== "\\") return i;
    }
    return -1;
  };

  const collectChordQuoteRanges = (text) => {
    const ranges = [];
    let inQuote = false;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== "\"") continue;
      if (text[i - 1] === "\\") continue;
      if (!inQuote) {
        inQuote = true;
        start = i;
        continue;
      }
      inQuote = false;
      ranges.push({ start, end: i + 1 });
    }
    if (inQuote) ranges.push({ start, end: text.length });
    return ranges;
  };

  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const text = line.text;
    const trimmed = text.trim();

    if (/^%%\s*begintext\b/i.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-directive" }));
      inTextBlock = true;
      lastNonEmptyKind = "directive";
      continue;
    }

    if (/^%%\s*endtext\b/i.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-directive" }));
      inTextBlock = false;
      lastNonEmptyKind = "directive";
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
      if (trimmed) lastNonEmptyKind = "directive";
      continue;
    }

    if (/^%/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-comment" }));
      if (trimmed) lastNonEmptyKind = "comment";
      continue;
    }

    if (/^w:/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-lyric-inline" }));
      if (trimmed) lastNonEmptyKind = "lyrics";
      continue;
    }

    if (/^W:/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-lyric-block" }));
      if (trimmed) lastNonEmptyKind = "lyrics";
      continue;
    }

    if (/^[A-Z]:/.test(text)) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-header" }));
      if (trimmed) lastNonEmptyKind = "header";
      continue;
    }

    // Field continuation marker (ABC 2.1/2.2).
    // If it continues a directive line (e.g. `%%MIDI ...`), highlight it as a directive; otherwise as a header field.
    if (/^\s*\+:\s*/.test(text)) {
      const cls = lastNonEmptyKind === "directive" ? "cm-abc-directive" : "cm-abc-header";
      builder.add(line.from, line.to, Decoration.mark({ class: cls }));
      continue;
    }

    if (text.trim().length) {
      builder.add(line.from, line.to, Decoration.mark({ class: "cm-abc-notes" }));
      if (trimmed) lastNonEmptyKind = "notes";

      const commentIdx = findFirstUnescapedPercent(text);
      const contentText = commentIdx >= 0 ? text.slice(0, commentIdx) : text;
      const chordRanges = collectChordQuoteRanges(contentText);
      for (const r of chordRanges) {
        const from = line.from + r.start;
        const to = line.from + r.end;
        if (to > from) builder.add(from, to, Decoration.mark({ class: "cm-abc-chord" }));
      }
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
  if (isLibraryVisible) {
    scheduleSaveLibraryPrefs({ libraryPaneWidth: Math.round(clamped) });
  }
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
let lastEditorHeight = 240;
let rightSplitOrientation = "vertical"; // "vertical" | "horizontal"
let rightSplitRatioVertical = 0.5;
let rightSplitRatioHorizontal = 0.5;
let suppressFollowScrollUntilMs = 0;
let splitPrevRenderZoom = null;
let splitZoomActive = false;

let layoutPrefsSaveTimer = null;
let pendingLayoutPrefsPatch = null;
const LAYOUT_PREFS_SAVE_DEBOUNCE_MS = 300;

function clampRatio(value, fallback = 0.5) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0.1, Math.min(0.9, v));
}

function scheduleSaveLayoutPrefs(patch) {
  if (!patch || typeof patch !== "object") return;
  if (!window.api || typeof window.api.updateSettings !== "function") return;
  pendingLayoutPrefsPatch = { ...(pendingLayoutPrefsPatch || {}), ...patch };
  if (layoutPrefsSaveTimer) clearTimeout(layoutPrefsSaveTimer);
  layoutPrefsSaveTimer = setTimeout(async () => {
    const nextPatch = pendingLayoutPrefsPatch;
    pendingLayoutPrefsPatch = null;
    layoutPrefsSaveTimer = null;
    if (!nextPatch) return;
    try { await window.api.updateSettings(nextPatch); } catch {}
  }, LAYOUT_PREFS_SAVE_DEBOUNCE_MS);
}

function isNormalModeForSplitToggle() {
  return !rawMode && !focusModeEnabled;
}

function applyRightSplitOrientation(next) {
  const normalized = (next === "horizontal") ? "horizontal" : "vertical";
  rightSplitOrientation = normalized;
  document.body.classList.toggle("right-split-horizontal", normalized === "horizontal");
  if ($splitDivider) {
    $splitDivider.setAttribute("aria-orientation", normalized === "horizontal" ? "horizontal" : "vertical");
  }
  if ($btnToggleSplit) {
    $btnToggleSplit.classList.toggle("toggle-active", normalized === "horizontal");
    $btnToggleSplit.setAttribute("aria-pressed", normalized === "horizontal" ? "true" : "false");
    $btnToggleSplit.title = normalized === "horizontal"
      ? "Toggle split orientation (Ctrl+Alt+\\) — Horizontal"
      : "Toggle split orientation (Ctrl+Alt+\\) — Vertical";
  }
}

function applyRightSplitSizesFromRatio() {
  if (!$rightSplit || !$splitDivider || !$editorPane) return;
  if (rawMode) {
    $rightSplit.style.gridTemplateColumns = "1fr";
    $rightSplit.style.gridTemplateRows = "1fr";
    return;
  }
  const dividerSize = (rightSplitOrientation === "horizontal")
    ? ($splitDivider.offsetHeight || 6)
    : ($splitDivider.offsetWidth || 6);

  if (rightSplitOrientation === "horizontal") {
    const total = $rightSplit.clientHeight;
    const min = Math.min(MIN_RIGHT_PANE_HEIGHT, Math.max(0, (total - dividerSize) / 2));
    const ratio = clampRatio(rightSplitRatioHorizontal, 0.5);
    const wanted = (total - dividerSize) * ratio;
    const clamped = Math.max(min, Math.min(wanted, total - min - dividerSize));
    lastEditorHeight = clamped;
    $rightSplit.style.gridTemplateColumns = "1fr";
    $rightSplit.style.gridTemplateRows = `${Math.round(clamped)}px ${dividerSize}px 1fr`;
  } else {
    const total = $rightSplit.clientWidth;
    const min = Math.min(MIN_RIGHT_PANE_WIDTH, Math.max(0, (total - dividerSize) / 2));
    const ratio = clampRatio(rightSplitRatioVertical, 0.5);
    const wanted = (total - dividerSize) * ratio;
    const clamped = Math.max(min, Math.min(wanted, total - min - dividerSize));
    lastEditorWidth = clamped;
    $rightSplit.style.gridTemplateRows = "1fr";
    $rightSplit.style.gridTemplateColumns = `${Math.round(clamped)}px ${dividerSize}px 1fr`;
  }
}

function setRightPaneSizes(leftWidth) {
  if (!$rightSplit || !$splitDivider || !$renderPane || !$editorPane) return;
  if (rawMode) {
    $rightSplit.style.gridTemplateColumns = "1fr";
    $rightSplit.style.gridTemplateRows = "1fr";
    return;
  }
  if (rightSplitOrientation === "horizontal") {
    const total = $rightSplit.clientHeight;
    const dividerHeight = $splitDivider.offsetHeight || 6;
    const min = Math.min(MIN_RIGHT_PANE_HEIGHT, Math.max(0, (total - dividerHeight) / 2));
    const clamped = Math.max(min, Math.min(leftWidth, total - min - dividerHeight));
    lastEditorHeight = clamped;
    rightSplitRatioHorizontal = clampRatio((total - dividerHeight) ? (clamped / (total - dividerHeight)) : rightSplitRatioHorizontal, rightSplitRatioHorizontal);
    $rightSplit.style.gridTemplateColumns = "1fr";
    $rightSplit.style.gridTemplateRows = `${Math.round(clamped)}px ${dividerHeight}px 1fr`;
    scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
  } else {
    const total = $rightSplit.clientWidth;
    const dividerWidth = $splitDivider.offsetWidth || 6;
    const min = Math.min(MIN_RIGHT_PANE_WIDTH, Math.max(0, (total - dividerWidth) / 2));
    const clamped = Math.max(min, Math.min(leftWidth, total - min - dividerWidth));
    lastEditorWidth = clamped;
    rightSplitRatioVertical = clampRatio((total - dividerWidth) ? (clamped / (total - dividerWidth)) : rightSplitRatioVertical, rightSplitRatioVertical);
    $rightSplit.style.gridTemplateRows = "1fr";
    $rightSplit.style.gridTemplateColumns = `${Math.round(clamped)}px ${dividerWidth}px 1fr`;
    scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
  }
}

function initRightPaneResizer() {
  if (!$rightSplit || !$splitDivider || !$renderPane || !$editorPane) return;
  $splitDivider.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $splitDivider.setPointerCapture(e.pointerId);
    const startRect = (rightSplitOrientation === "horizontal")
      ? $renderPane.getBoundingClientRect()
      : $editorPane.getBoundingClientRect();
    const startSize = (rightSplitOrientation === "horizontal") ? startRect.height : startRect.width;
    const startPos = (rightSplitOrientation === "horizontal") ? e.clientY : e.clientX;

    const onMove = (ev) => {
      const delta = (rightSplitOrientation === "horizontal") ? (ev.clientY - startPos) : (ev.clientX - startPos);
      setRightPaneSizes(startSize + delta);
    };

    const onUp = (ev) => {
      $splitDivider.releasePointerCapture(e.pointerId);
      $splitDivider.removeEventListener("pointermove", onMove);
      $splitDivider.removeEventListener("pointerup", onUp);
      $splitDivider.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("resizing-cols");
      document.body.classList.remove("resizing-rows");
    };

    if (rightSplitOrientation === "horizontal") document.body.classList.add("resizing-rows");
    else document.body.classList.add("resizing-cols");
    $splitDivider.addEventListener("pointermove", onMove);
    $splitDivider.addEventListener("pointerup", onUp);
    $splitDivider.addEventListener("pointercancel", onUp);
  });

  window.addEventListener("resize", () => {
    applyRightSplitSizesFromRatio();
  });
}

function resetRightPaneSplit() {
  if (!$rightSplit) return;
  if ($splitDivider) {
    if (rightSplitOrientation === "horizontal") {
      rightSplitRatioHorizontal = 0.5;
      scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
    } else {
      rightSplitRatioVertical = 0.5;
      scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
    }
  }
  applyRightSplitSizesFromRatio();
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
let libraryFullScanInFlight = false;
let libraryFullScanToken = "";
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
let abc2svgNotationFontFile = "";
let abc2svgTextFontFile = "";
let fontDirs = { bundledDir: "", userDir: "" };
let soundfontName = "TimGM6mb.sf2";
let soundfontSource = "abc2svg.sf2";
let soundfontReadyName = null;
let soundfontLoadPromise = null;
let soundfontLoadTarget = null;
let soundfontStatusTimer = null;
const STREAMING_SF2 = new Set();
const MAX_FILE_CONTENT_CACHE_ENTRIES = 12;
const fileContentCache = new Map();

function lruGet(map, key) {
  if (!map.has(key)) return undefined;
  const value = map.get(key);
  map.delete(key);
  map.set(key, value);
  return value;
}

function lruSet(map, key, value, maxEntries) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > maxEntries) {
    const firstKey = map.keys().next().value;
    if (firstKey == null) break;
    map.delete(firstKey);
  }
}

function getFileContentFromCache(filePath) {
  return lruGet(fileContentCache, filePath);
}

function setFileContentInCache(filePath, content) {
  lruSet(fileContentCache, filePath, content, MAX_FILE_CONTENT_CACHE_ENTRIES);
}
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
let pendingXIssuesFilePath = null;
let pendingXIssuesTuneId = null;
let suppressLibraryPrefsWrite = true;
let pendingLibraryPrefsPatch = null;
let libraryPrefsSaveTimer = null;
const LIBRARY_PREFS_SAVE_DEBOUNCE_MS = 400;
let lastAppliedLibraryPrefsSig = "";
let latestSettingsSnapshot = null;
let libraryUiStateTimer = null;
let libraryUiStateDirty = false;
const LIBRARY_UI_STATE_DEBOUNCE_MS = 300;

const libraryViewStore = createLibraryViewStore({
  getIndex: () => libraryIndex,
  safeBasename,
});
const libraryActions = createLibraryActions({
  openTuneFromSelection: openTuneFromLibrarySelection,
});
window.libraryActions = libraryActions;

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

function formatPathTail(filePath, segments = 3) {
  const raw = String(filePath || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return normalized;
  const tail = parts.slice(Math.max(0, parts.length - Math.max(1, segments))).join("/");
  return parts.length > segments ? `…/${tail}` : tail;
}

function getLibraryRootKey() {
  if (!libraryIndex || !libraryIndex.root) return null;
  const root = String(libraryIndex.root || "");
  const normalized = normalizeLibraryPath(root);
  return normalized || null;
}

function hasFullLibraryIndex() {
  return Boolean(libraryIndex && libraryIndex.indexMode === "full");
}

async function ensureFullLibraryIndex({ reason = "" } = {}) {
  if (!window.api || typeof window.api.scanLibrary !== "function") return false;
  if (!libraryIndex || !libraryIndex.root) return false;
  if (hasFullLibraryIndex()) return true;
  if (libraryFullScanInFlight) return false;

  libraryFullScanInFlight = true;
  const scanToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  libraryFullScanToken = scanToken;
  const root = libraryIndex.root;
  setScanStatus(reason ? `Indexing… (${reason})` : "Indexing…");
  try {
    const result = await window.api.scanLibrary(root, { token: scanToken });
    if (!result || !result.root || result.root !== root) return false;
    if (libraryFullScanToken !== scanToken) return false;
    libraryIndex = { ...result, indexMode: "full" };
    libraryViewStore.invalidate();
    updateLibraryRootUI();
    scheduleRenderLibraryTree();
    updateLibraryStatus();
    try {
      if (document.body.classList.contains("library-list-open")) {
        const rows = libraryViewStore.getModalRows();
        document.dispatchEvent(new CustomEvent("library-modal:update-rows", { detail: { rows } }));
      }
    } catch {}
    return true;
  } catch (e) {
    logErr(e && e.message ? e.message : String(e));
    setScanStatus("Indexing failed.");
    return false;
  } finally {
    if (libraryFullScanToken === scanToken) {
      libraryFullScanToken = "";
      libraryFullScanInFlight = false;
    }
  }
}

function isPathWithinRoot(filePath, rootPath) {
  const file = normalizeLibraryPath(String(filePath || ""));
  const root = normalizeLibraryPath(String(rootPath || ""));
  if (!file || !root) return false;
  if (pathsEqual(file, root)) return true;
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return file.startsWith(prefix);
}

function scheduleSaveLibraryPrefs(patch) {
  if (suppressLibraryPrefsWrite) return;
  if (!patch || typeof patch !== "object") return;
  if (!window.api || typeof window.api.updateSettings !== "function") return;

  pendingLibraryPrefsPatch = { ...(pendingLibraryPrefsPatch || {}), ...patch };
  if (libraryPrefsSaveTimer) clearTimeout(libraryPrefsSaveTimer);
  libraryPrefsSaveTimer = setTimeout(async () => {
    const nextPatch = pendingLibraryPrefsPatch;
    pendingLibraryPrefsPatch = null;
    libraryPrefsSaveTimer = null;
    if (!nextPatch) return;
    try {
      await window.api.updateSettings(nextPatch);
    } catch {}
  }, LIBRARY_PREFS_SAVE_DEBOUNCE_MS);
}

function computeLibraryUiStateSnapshot() {
  if (!libraryIndex || !libraryIndex.root) return null;
  const rootKey = getLibraryRootKey();
  if (!rootKey) return null;

  const files = Array.isArray(libraryIndex.files) ? libraryIndex.files : [];
  const expandedFiles = [];
  for (const file of files) {
    if (!file || !file.path) continue;
    if (!collapsedFiles.has(file.path)) expandedFiles.push(file.path);
  }

  const expandedGroupsByMode = {};
  if (groupMode !== "file" && files.length) {
    const groups = buildGroupEntries(files, groupMode);
    const expandedGroups = [];
    for (const group of groups) {
      if (!group || !group.id) continue;
      if (!collapsedGroups.has(group.id)) expandedGroups.push(group.id);
    }
    expandedGroupsByMode[groupMode] = expandedGroups;
  }

  const active = (activeFilePath && isPathWithinRoot(activeFilePath, libraryIndex.root)) ? activeFilePath : null;
  const activeTune = (activeTuneMeta && activeTuneMeta.path && isPathWithinRoot(activeTuneMeta.path, libraryIndex.root))
    ? {
      tuneId: activeTuneId || null,
      filePath: activeTuneMeta.path || null,
      xNumber: activeTuneMeta.xNumber != null ? String(activeTuneMeta.xNumber) : "",
      title: activeTuneMeta.title != null ? String(activeTuneMeta.title) : "",
      startOffset: Number.isFinite(Number(activeTuneMeta.startOffset)) ? Number(activeTuneMeta.startOffset) : null,
    }
    : {
      tuneId: activeTuneId || null,
      filePath: (active && isPathWithinRoot(active, libraryIndex.root)) ? active : null,
      xNumber: "",
      title: "",
      startOffset: null,
    };
  return {
    rootKey,
    state: {
      expandedFiles,
      expandedGroupsByMode,
      activeFilePath: active,
      activeTune,
    },
  };
}

function scheduleSaveLibraryUiState() {
  if (suppressLibraryPrefsWrite) return;
  if (!libraryIndex || !libraryIndex.root) return;
  if (!window.api || typeof window.api.updateSettings !== "function") return;

  libraryUiStateDirty = true;
  if (libraryUiStateTimer) clearTimeout(libraryUiStateTimer);
  libraryUiStateTimer = setTimeout(() => {
    libraryUiStateTimer = null;
    if (!libraryUiStateDirty) return;
    libraryUiStateDirty = false;
    const snap = computeLibraryUiStateSnapshot();
    if (!snap) return;
    scheduleSaveLibraryPrefs({
      libraryUiStateByRoot: {
        [snap.rootKey]: snap.state,
      },
    });
  }, LIBRARY_UI_STATE_DEBOUNCE_MS);
}

function applyLibraryUiStateFromSettings(settings) {
  if (!settings || !libraryIndex || !libraryIndex.root) return false;
  const rootKey = getLibraryRootKey();
  if (!rootKey) return false;
  const byRoot = settings.libraryUiStateByRoot && typeof settings.libraryUiStateByRoot === "object"
    ? settings.libraryUiStateByRoot
    : null;
  const entry = byRoot && byRoot[rootKey] && typeof byRoot[rootKey] === "object"
    ? byRoot[rootKey]
    : null;
  if (!entry) return { restoredFile: false, tuneSelection: null };

  const files = Array.isArray(libraryIndex.files) ? libraryIndex.files : [];
  const filePaths = files.map((f) => f && f.path).filter(Boolean);

  const expandedFiles = Array.isArray(entry.expandedFiles) ? entry.expandedFiles : [];
  const expandedFilesSet = new Set(expandedFiles.map((p) => String(p || "")).filter(Boolean));

  collapsedFiles.clear();
  for (const p of filePaths) collapsedFiles.add(p);
  for (const p of expandedFilesSet) collapsedFiles.delete(p);

  collapsedGroups.clear();
  if (groupMode !== "file" && files.length) {
    const groups = buildGroupEntries(files, groupMode);
    for (const group of groups) collapsedGroups.add(group.id);
    const byMode = entry.expandedGroupsByMode && typeof entry.expandedGroupsByMode === "object"
      ? entry.expandedGroupsByMode
      : null;
    const expandedGroups = byMode && Array.isArray(byMode[groupMode]) ? byMode[groupMode] : [];
    for (const id of expandedGroups) {
      if (!id) continue;
      collapsedGroups.delete(String(id));
    }
  }

  const savedActivePath = entry.activeFilePath ? String(entry.activeFilePath) : "";
  const hasFile = savedActivePath && filePaths.some((p) => pathsEqual(p, savedActivePath));
  if (hasFile) {
    activeFilePath = savedActivePath;
    collapsedFiles.delete(savedActivePath);
  }

  const activeTune = entry.activeTune && typeof entry.activeTune === "object" ? entry.activeTune : null;
  const tuneSelection = activeTune
    ? {
      tuneId: activeTune.tuneId ? String(activeTune.tuneId) : "",
      filePath: activeTune.filePath ? String(activeTune.filePath) : (hasFile ? savedActivePath : ""),
      xNumber: activeTune.xNumber != null ? String(activeTune.xNumber) : "",
      title: activeTune.title != null ? String(activeTune.title) : "",
      startOffset: Number.isFinite(Number(activeTune.startOffset)) ? Number(activeTune.startOffset) : null,
    }
    : null;

  return { restoredFile: Boolean(hasFile), tuneSelection };
}

async function restoreLibraryTuneSelection(selection) {
  if (!libraryIndex || !libraryIndex.root) return false;
  if (!selection) return false;

  const tuneId = selection.tuneId ? String(selection.tuneId) : "";
  const filePath = selection.filePath ? String(selection.filePath) : "";
  const xNumber = selection.xNumber ? String(selection.xNumber) : "";
  const title = selection.title ? String(selection.title) : "";
  const startOffset = selection.startOffset;

  const trySelect = async (id) => {
    if (!id) return false;
    try {
      const res = await selectTune(id, { skipConfirm: true, suppressRecent: true });
      if (res && res.ok) {
        renderLibraryTree();
        return true;
      }
    } catch {}
    return false;
  };

  if (tuneId) {
    const ok = await trySelect(tuneId);
    if (ok) return true;
  }

  let fileEntry = null;
  if (filePath && libraryIndex && Array.isArray(libraryIndex.files)) {
    fileEntry = libraryIndex.files.find((f) => pathsEqual(f.path, filePath)) || null;
  }

  if (fileEntry && (!fileEntry.tunes || !fileEntry.tunes.length) && window.api && typeof window.api.parseLibraryFile === "function") {
    try {
      const updated = await refreshLibraryFile(filePath);
      if (updated) fileEntry = updated;
    } catch {}
  }

  const tunes = fileEntry && Array.isArray(fileEntry.tunes) ? fileEntry.tunes : [];
  if (!tunes.length) return false;

  let candidate = null;
  if (Number.isFinite(startOffset)) {
    candidate = tunes.find((t) => Number(t.startOffset) === Number(startOffset)) || null;
  }
  if (!candidate && xNumber) {
    const matches = tunes.filter((t) => String(t.xNumber || "") === xNumber);
    if (matches.length === 1) candidate = matches[0];
    else if (matches.length > 1 && title) {
      const want = title.trim().toLowerCase();
      candidate = matches.find((t) => String(t.title || "").trim().toLowerCase() === want) || matches[0];
    } else if (matches.length) {
      candidate = matches[0];
    }
  }

  if (!candidate) return false;
  const id = candidate.id ? String(candidate.id) : "";
  return trySelect(id);
}

async function flushLibraryPrefsSave() {
  if (!window.api || typeof window.api.updateSettings !== "function") return;
  if (libraryUiStateTimer) {
    clearTimeout(libraryUiStateTimer);
    libraryUiStateTimer = null;
  }
  if (libraryUiStateDirty) {
    libraryUiStateDirty = false;
    const snap = computeLibraryUiStateSnapshot();
    if (snap) {
      pendingLibraryPrefsPatch = {
        ...(pendingLibraryPrefsPatch || {}),
        libraryUiStateByRoot: {
          [snap.rootKey]: snap.state,
        },
      };
    }
  }
  if (libraryPrefsSaveTimer) {
    clearTimeout(libraryPrefsSaveTimer);
    libraryPrefsSaveTimer = null;
  }
  const nextPatch = pendingLibraryPrefsPatch;
  pendingLibraryPrefsPatch = null;
  if (!nextPatch) return;
  try {
    await window.api.updateSettings(nextPatch);
  } catch {}
}

function applyLibraryPrefsFromSettings(settings) {
  if (!settings) return;
  const normalized = {
    libraryPaneVisible: Boolean(settings.libraryPaneVisible),
    libraryPaneWidth: Number.isFinite(Number(settings.libraryPaneWidth)) ? Math.round(Number(settings.libraryPaneWidth)) : null,
    libraryGroupBy: String(settings.libraryGroupBy || "").trim() || null,
    librarySortBy: String(settings.librarySortBy || "").trim() || null,
    libraryFilterText: String(settings.libraryFilterText || ""),
  };
  const sig = JSON.stringify(normalized);
  if (sig === lastAppliedLibraryPrefsSig) return;
  lastAppliedLibraryPrefsSig = sig;

  const prevSuppress = suppressLibraryPrefsWrite;
  suppressLibraryPrefsWrite = true;
  try {
    const nextGroup = normalized.libraryGroupBy || "";
    if (nextGroup && GROUP_LABELS[nextGroup]) groupMode = nextGroup;
    if ($groupBy) $groupBy.value = groupMode;

    const nextSort = normalized.librarySortBy || "";
    if (nextSort) setSortMode(nextSort, false);

    const nextFilter = normalized.libraryFilterText;
    if ($librarySearch) $librarySearch.value = nextFilter;
    if (librarySearchTimer) {
      clearTimeout(librarySearchTimer);
      librarySearchTimer = null;
    }
    pendingLibrarySearch = "";
    applyLibrarySearch(nextFilter);

    const width = normalized.libraryPaneWidth;
    if (Number.isFinite(width) && width > 0) lastSidebarWidth = width;

    const visible = normalized.libraryPaneVisible;
    setLibraryVisible(visible);
  } finally {
    suppressLibraryPrefsWrite = prevSuppress;
  }
}

function updateLibraryRootUI() {
  if (!$libraryRoot) return;
  const root = libraryIndex && libraryIndex.root ? String(libraryIndex.root) : "";
  const tail = formatPathTail(root, 3);
  $libraryRoot.textContent = tail ? `Library: ${tail}` : "Library: (none)";
  $libraryRoot.title = root;
}

function setScanStatus(text, title) {
  const value = String(text || "");
  const titleValue = title == null ? value : String(title || "");
  updateLibraryRootUI();
  const display = value || "";
  if ($scanStatus) {
    $scanStatus.textContent = display;
    $scanStatus.title = titleValue;
  }
  if (/^Done\b/i.test(value)) {
    setStatus(value);
  }
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
	  const tuneDirty = Boolean(currentDoc && currentDoc.dirty);
	  const dirtyTag = (tuneDirty || headerDirty) ? "*" : "";
	  const filePath = (currentDoc && currentDoc.path) ? String(currentDoc.path) : "";
	  const fileNameWithExt = filePath ? safeBasename(filePath) : "Untitled.abc";
	  const dirPath = filePath ? safeDirname(filePath) : (libraryIndex && libraryIndex.root ? String(libraryIndex.root) : "");
	  const dirShort = formatPathTail(dirPath, 3);
	  const display = dirShort ? `${dirShort}/${fileNameWithExt}` : fileNameWithExt;
	  document.title = `ABCarus — ${display}${dirtyTag}`;
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
  if (rawMode) {
    if (tuneDirty && hdrDirty) {
      $dirtyIndicator.textContent = "Header+File: Unsaved";
      $dirtyIndicator.classList.add("active");
    } else if (hdrDirty) {
      $dirtyIndicator.textContent = "Header: Unsaved";
      $dirtyIndicator.classList.add("active");
    } else if (tuneDirty) {
      $dirtyIndicator.textContent = "File: Unsaved";
      $dirtyIndicator.classList.add("active");
    } else {
      $dirtyIndicator.textContent = "";
      $dirtyIndicator.classList.remove("active");
    }
    updateLibraryDirtyState(tuneDirty || hdrDirty);
    updateWindowTitle();
    return;
  }
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

function getNavigableTuneIdsFromFileSelect() {
  if (!$fileTuneSelect || $fileTuneSelect.disabled) return [];
  const ids = [];
  for (const opt of Array.from($fileTuneSelect.options || [])) {
    if (!opt || opt.disabled) continue;
    const value = opt.value != null ? String(opt.value) : "";
    if (!value || value === "__new__") continue;
    ids.push(value);
  }
  return ids;
}

async function navigateTuneByDelta(delta) {
  // Prefer file order navigation based on the active tune metadata.
  // This stays stable even if the tune `<select>` temporarily drifts (filters, rebuilds, etc).
  const filePath = (activeTuneMeta && activeTuneMeta.path)
    ? String(activeTuneMeta.path)
    : (activeFilePath ? String(activeFilePath) : "");
  const fileEntry = (filePath && libraryIndex && Array.isArray(libraryIndex.files))
    ? (libraryIndex.files.find((f) => pathsEqual(f && f.path, filePath)) || null)
    : null;

  const orderedTunes = fileEntry && Array.isArray(fileEntry.tunes)
    ? fileEntry.tunes.slice().sort((a, b) => (Number(a.startOffset) || 0) - (Number(b.startOffset) || 0))
    : [];

  const selectedValue = ($fileTuneSelect && $fileTuneSelect.value != null) ? String($fileTuneSelect.value) : "";
  const findCurrentInOrdered = () => {
    if (!orderedTunes.length) return -1;
    if (activeTuneId) {
      const idx = orderedTunes.findIndex((t) => t && t.id === activeTuneId);
      if (idx >= 0) return idx;
    }
    if (activeTuneMeta && Number.isFinite(Number(activeTuneMeta.startOffset))) {
      const off = Number(activeTuneMeta.startOffset);
      const idx = orderedTunes.findIndex((t) => Number(t && t.startOffset) === off);
      if (idx >= 0) return idx;
    }
    if (selectedValue) {
      const idx = orderedTunes.findIndex((t) => t && t.id === selectedValue);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  let nextId = "";
  if (orderedTunes.length) {
    const currentIdx = findCurrentInOrdered();
    const startIdx = currentIdx >= 0 ? currentIdx : (delta > 0 ? 0 : orderedTunes.length - 1);
    const nextIdx = Math.max(0, Math.min(orderedTunes.length - 1, startIdx + delta));
    const nextTune = orderedTunes[nextIdx];
    nextId = nextTune && nextTune.id ? String(nextTune.id) : "";
    if (!nextId) return;
    if (currentIdx === nextIdx) {
      showToast(delta > 0 ? "Already at last tune." : "Already at first tune.", 1400);
      return;
    }
  } else {
    // Fallback: navigate within the tune `<select>` (respects error filtering).
    const ids = getNavigableTuneIdsFromFileSelect();
    if (!ids.length) {
      showToast(tuneErrorFilter ? "No error tunes in selection." : "No tunes to navigate.", 2000);
      return;
    }
    const selectedIsNavigable = selectedValue && ids.includes(selectedValue);
    const activeIsNavigable = activeTuneId && ids.includes(activeTuneId);
    const current = selectedIsNavigable ? selectedValue : (activeIsNavigable ? activeTuneId : "");
    const currentIdx = current ? ids.indexOf(current) : -1;
    const startIdx = currentIdx >= 0 ? currentIdx : (delta > 0 ? 0 : ids.length - 1);
    const nextIdx = Math.max(0, Math.min(ids.length - 1, startIdx + delta));
    nextId = ids[nextIdx];
    if (!nextId) return;
    if (currentIdx === nextIdx) {
      showToast(delta > 0 ? "Already at last tune." : "Already at first tune.", 1400);
      return;
    }
  }

  if (rawMode) {
    if ($fileTuneSelect) $fileTuneSelect.value = nextId;
    setActiveTuneInRaw(nextId);
    scrollToTuneInRaw(nextId);
    return;
  }
  await selectTune(nextId);
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
  if (Number.isFinite(entry.tuneCount)) return entry.tuneCount;
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
  scheduleRenderLibraryTree();
  updateLibraryStatus();
}

function clearLibraryFilter() {
  libraryFilter = null;
  libraryFilterLabel = "";
  scheduleRenderLibraryTree();
  updateLibraryStatus();
}

function getActiveFileEntry() {
  if (!libraryIndex || !libraryIndex.files || !activeFilePath) return null;
  return libraryIndex.files.find((file) => pathsEqual(file.path, activeFilePath)) || null;
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
  const nextHeaderText = entry.headerText || "";
  const shouldReplace = headerEditorFilePath !== entry.path
    || (!headerDirty && getHeaderEditorValue() !== nextHeaderText);
  if (shouldReplace) {
    suppressHeaderDirty = true;
    setHeaderEditorValue(nextHeaderText);
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

function normalizeFilterValue(value) {
  return String(value || "").trim().toLowerCase();
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
    const count = (libraryIndex.files || []).length;
    setScanStatus("Ready", `Ready (${count} files)`);
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

function highlightSvgPracticeBarAtEditorOffset(editorOffset) {
  if (!$out || !$renderPane) return false;
  if (!Number.isFinite(editorOffset)) return false;
  if (!editorView) return false;
  const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
    ? lastRenderPayload.offset
    : 0;
  const editorText = editorView.state.doc.toString();
  const measure = findMeasureRangeAt(editorText, editorOffset);
  const barEls = measure ? Array.from($out.querySelectorAll(".bar-hl")) : [];
  if (measure && barEls.length) {
    const start = measure.start + renderOffset;
    const end = measure.end + renderOffset;
    const hits = barEls.filter((el) => {
      const s = Number(el.dataset && el.dataset.start);
      const e = Number(el.dataset && el.dataset.end);
      if (!Number.isFinite(s)) return false;
      const stop = Number.isFinite(e) ? e : s + 1;
      return s < end && stop > start;
    });
    if (hits.length) {
      clearSvgPracticeBarHighlight();
      lastSvgPracticeBarEls = hits;
      for (const el of lastSvgPracticeBarEls) {
        try { el.classList.add("svg-practice-bar"); } catch {}
      }
      return true;
    }
  }
  clearSvgPracticeBarHighlight();
  return false;
}

function setPracticeBarHighlight(range) {
  const next = range && Number.isFinite(range.from) && Number.isFinite(range.to) && range.to > range.from
    ? { from: range.from, to: range.to }
    : null;
  if (
    practiceBarHighlightRange
    && next
    && practiceBarHighlightRange.from === next.from
    && practiceBarHighlightRange.to === next.to
  ) return;
  if (!practiceBarHighlightRange && !next) return;
  practiceBarHighlightRange = next;
  practiceBarHighlightVersion += 1;
  if (!editorView) return;
  editorView.dispatch({
    selection: editorView.state.selection,
    scrollIntoView: false,
  });
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

let startupLayoutResetDone = false;
let startupLayoutResetScheduled = false;

function scheduleStartupLayoutReset() {
  if (startupLayoutResetDone || startupLayoutResetScheduled) return;
  startupLayoutResetScheduled = true;
  requestAnimationFrame(() => {
    startupLayoutResetScheduled = false;
    if (startupLayoutResetDone) return;
    startupLayoutResetDone = true;
    try {
      // On startup, respect persisted zoom and split preferences.
      applyRightSplitSizesFromRatio();
    } catch {}
    requestAnimationFrame(() => {
      try { centerRenderPaneOnCurrentAnchor(); } catch {}
    });
  });
}

function refreshErrorsNow() {
  if (rawMode) {
    showToast("Raw mode: switch to tune mode for errors.", 2200);
    return;
  }
  if (!errorsEnabled) {
    showToast("Errors disabled");
    return;
  }
  if (t) {
    clearTimeout(t);
    t = null;
  }
  scheduleRenderNow();
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

function setRawModeUI(enabled) {
  rawMode = Boolean(enabled);
  if (rawMode && focusModeEnabled) setFocusModeEnabled(false);
  document.body.classList.toggle("raw-mode", rawMode);
  if ($btnToggleRaw) $btnToggleRaw.classList.toggle("toggle-active", rawMode);
  applyRightSplitSizesFromRatio();
  const disablePlayback = rawMode;
  if ($btnPlayPause) $btnPlayPause.disabled = disablePlayback;
  if ($btnStop) $btnStop.disabled = disablePlayback;
  if ($btnToggleFollow) $btnToggleFollow.disabled = disablePlayback;
  if ($btnToggleErrors) $btnToggleErrors.disabled = rawMode;
  if ($scanErrorTunes) $scanErrorTunes.disabled = rawMode;
  if ($errorsIndicator) $errorsIndicator.disabled = rawMode;
}

function buildRawFileText({ headerText, bodyText }) {
  let header = String(headerText || "");
  const body = String(bodyText || "");
  if (header && !/[\r\n]$/.test(header) && /^\s*X:/.test(body)) {
    header += "\n";
  }
  return header ? header + body : body;
}

async function performRawSaveFlow() {
  const filePath = rawModeFilePath || (currentDoc && currentDoc.path) || activeFilePath;
  if (!filePath) {
    await showSaveError("No file path available for raw save.");
    return false;
  }
  const preferred = (activeTuneMeta && pathsEqual(activeTuneMeta.path, filePath))
    ? { xNumber: activeTuneMeta.xNumber || "", indexInFile: activeTuneMeta.indexInFile || 0 }
    : { xNumber: "", indexInFile: 0 };
  const headerText = getHeaderEditorValue();
  const bodyText = getEditorValue();
  const fullText = buildRawFileText({ headerText, bodyText });
  return withFileLock(filePath, async () => {
    const cachedBefore = getFileContentFromCache(filePath);
    if (cachedBefore != null) {
      const diskRes = await readFile(filePath);
      if (!diskRes || !diskRes.ok) {
        await showSaveError((diskRes && diskRes.error) ? diskRes.error : "Unable to read file before saving.");
        return false;
      }
      const diskText = String(diskRes.data || "");
      if (diskText !== String(cachedBefore || "")) {
        await showSaveError("Refusing to save: file changed on disk. Refresh/reopen the file and try again.");
        return false;
      }
    }

    const res = await writeFile(filePath, fullText);
    if (!res || !res.ok) {
      await showSaveError((res && res.error) ? res.error : "Unable to save file.");
      return false;
    }
    setFileContentInCache(filePath, fullText);
    headerDirty = false;
    updateHeaderStateUI();
    if (currentDoc) {
      currentDoc.path = filePath;
      currentDoc.content = bodyText;
      currentDoc.dirty = false;
    }
    setDirtyIndicator(false);
    const updatedFile = await refreshLibraryFile(filePath, { force: true });
    if (updatedFile && Number.isFinite(updatedFile.headerEndOffset)) {
      rawModeHeaderEndOffset = Number(updatedFile.headerEndOffset) || 0;
    }
    if (rawMode) {
      const entry = updatedFile || (libraryIndex && libraryIndex.files
        ? libraryIndex.files.find((f) => pathsEqual(f.path, filePath))
        : null);
      const tunes = entry && entry.tunes ? entry.tunes : [];
      if (tunes.length) {
        let next = null;
        if (!next && Number.isFinite(Number(preferred.indexInFile)) && Number(preferred.indexInFile) > 0) {
          next = tunes[Math.min(tunes.length - 1, Math.max(0, Number(preferred.indexInFile) - 1))];
        }
        if (!next && preferred.xNumber) {
          next = tunes.find((t) => String(t.xNumber || "") === String(preferred.xNumber));
        }
        if (!next) next = tunes[0];
        if (next && next.id) {
          if ($fileTuneSelect) $fileTuneSelect.value = next.id;
          setActiveTuneInRaw(next.id);
        }
      }
    }
    setStatus("File saved.");
    return true;
  });
}

function scrollToPosInEditor(pos, { y = "start" } = {}) {
  if (!editorView) return;
  const docLen = editorView.state.doc.length;
  const safePos = Math.max(0, Math.min(Number(pos) || 0, docLen));
  const effects = [];
  if (typeof EditorView.scrollIntoView === "function") {
    try {
      effects.push(EditorView.scrollIntoView(safePos, { y }));
    } catch {}
  }
  editorView.dispatch({
    selection: EditorSelection.cursor(safePos),
    effects,
    scrollIntoView: true,
  });
}

function setActiveTuneInRaw(tuneId) {
  if (!tuneId) return;
  const res = findTuneById(tuneId);
  if (!res) return;
  activeTuneId = tuneId;
  activeTuneMeta = {
    id: res.tune.id,
    path: res.file.path,
    basename: res.file.basename,
    indexInFile: res.tune.indexInFile,
    xNumber: res.tune.xNumber,
    title: res.tune.title || "",
    composer: res.tune.composer || "",
    key: res.tune.key || "",
    startLine: res.tune.startLine,
    endLine: res.tune.endLine,
    startOffset: res.tune.startOffset,
    endOffset: res.tune.endOffset,
  };
  markActiveTuneButton(activeTuneId);
  setTuneMetaText(buildTuneMetaLabel(activeTuneMeta));
}

function scrollToTuneInRaw(tuneId) {
  const res = findTuneById(tuneId);
  if (!res) return;
  const bodyStart = Number(rawModeHeaderEndOffset) || 0;
  const pos = Math.max(0, Number(res.tune.startOffset) - bodyStart);
  scrollToPosInEditor(pos, { y: "start" });
}

async function enterRawMode() {
  const filePath = (activeTuneMeta && activeTuneMeta.path)
    ? activeTuneMeta.path
    : (activeFilePath || (currentDoc && currentDoc.path) || null);
  if (!filePath) {
    showToast("No active file to open in raw mode.", 2200);
    return;
  }
  const ok = await ensureSafeToAbandonCurrentDoc("switching to raw mode");
  if (!ok) return;

  try { stopPlaybackTransport(); } catch {}

  const readRes = await readFile(filePath);
  if (!readRes || !readRes.ok) {
    await showOpenError((readRes && readRes.error) ? readRes.error : "Unable to read file.");
    return;
  }

  activeFilePath = filePath;
  setFileContentInCache(filePath, readRes.data || "");
  const updatedFile = await refreshLibraryFile(filePath, { force: true });
  const entry = updatedFile || getActiveFileEntry();
  const headerEndOffset = entry && Number.isFinite(entry.headerEndOffset) ? Number(entry.headerEndOffset) : findHeaderEndOffset(readRes.data || "");
  const bodyText = String(readRes.data || "").slice(headerEndOffset);

  rawModeFilePath = filePath;
  rawModeHeaderEndOffset = headerEndOffset;
  rawModeOriginalTuneId = activeTuneId;

  suppressDirty = true;
  setEditorValue(bodyText);
  suppressDirty = false;
  if (currentDoc) {
    currentDoc.path = filePath;
    currentDoc.content = bodyText;
    currentDoc.dirty = false;
  }
  setRawModeUI(true);
  updateFileHeaderPanel();
  setDirtyIndicator(false);
  if (rawModeOriginalTuneId) {
    setActiveTuneInRaw(rawModeOriginalTuneId);
    scrollToTuneInRaw(rawModeOriginalTuneId);
  }
  setStatus("Raw mode.");
}

async function exitRawMode() {
  if (!rawMode) return;
  const fileDirty = Boolean(currentDoc && currentDoc.dirty);
  const hdrDirty = Boolean(headerDirty);
  if (fileDirty || hdrDirty) {
    const choice = await confirmUnsavedChanges("leaving raw mode");
    if (choice === "cancel") return;
    if (choice === "save") {
      const saved = await performRawSaveFlow();
      if (!saved) return;
    } else if (choice === "dont_save") {
      headerEditorFilePath = null;
      headerDirty = false;
      if (currentDoc) currentDoc.dirty = false;
      updateFileHeaderPanel();
      setDirtyIndicator(false);
    }
  }
  setRawModeUI(false);
  const tuneToRestore = activeTuneId || rawModeOriginalTuneId;
  rawModeFilePath = null;
  rawModeHeaderEndOffset = 0;
  rawModeOriginalTuneId = null;
  if (tuneToRestore) {
    const res = await selectTune(tuneToRestore, { skipConfirm: true });
    if (!res || !res.ok) {
      const entry = getActiveFileEntry();
      const firstId = entry && entry.tunes && entry.tunes[0] ? entry.tunes[0].id : null;
      if (firstId) await selectTune(firstId, { skipConfirm: true });
    }
  } else {
    const entry = getActiveFileEntry();
    const firstId = entry && entry.tunes && entry.tunes[0] ? entry.tunes[0].id : null;
    if (firstId) await selectTune(firstId, { skipConfirm: true });
  }
  setStatus("Ready");
}

async function leaveRawModeForAction(contextLabel) {
  if (!rawMode) return true;
  const fileDirty = Boolean(currentDoc && currentDoc.dirty);
  const hdrDirty = Boolean(headerDirty);
  if (fileDirty || hdrDirty) {
    const choice = await confirmUnsavedChanges(contextLabel || "continuing");
    if (choice === "cancel") return false;
    if (choice === "save") {
      const saved = await performRawSaveFlow();
      if (!saved) return false;
    } else if (choice === "dont_save") {
      headerEditorFilePath = null;
      headerDirty = false;
      if (currentDoc) currentDoc.dirty = false;
      updateFileHeaderPanel();
      setDirtyIndicator(false);
    }
  }
  setRawModeUI(false);
  rawModeFilePath = null;
  rawModeHeaderEndOffset = 0;
  rawModeOriginalTuneId = null;
  return true;
}

function toggleLineComments(view) {
  if (!view) return false;
  if (isPlaying || isPaused || waitingForFirstNote) {
    showToast("Playback active: stop before editing.", 2400);
    return true;
  }

  const doc = view.state.doc;
  const ranges = view.state.selection.ranges || [];
  if (!ranges.length) return false;

  const lineNumbers = new Set();
  for (const r of ranges) {
    const from = Math.min(r.from, r.to);
    const to = Math.max(r.from, r.to);
    const fromLine = doc.lineAt(from);
    const toLine = doc.lineAt(to);
    for (let n = fromLine.number; n <= toLine.number; n += 1) {
      lineNumbers.add(n);
    }
  }
  const lines = Array.from(lineNumbers).sort((a, b) => a - b);
  if (!lines.length) return false;

  const lineInfo = lines.map((n) => doc.line(n));
  const isCommented = (lineText) => {
    const m = /^[\t ]*/.exec(lineText);
    const i = m ? m[0].length : 0;
    return lineText[i] === "%";
  };
  const allCommented = lineInfo.every((ln) => isCommented(ln.text));

  const changes = [];
  for (let idx = lineInfo.length - 1; idx >= 0; idx -= 1) {
    const ln = lineInfo[idx];
    const text = ln.text;
    const m = /^[\t ]*/.exec(text);
    const indentLen = m ? m[0].length : 0;
    const at = ln.from + indentLen;
    if (allCommented) {
      if (text[indentLen] === "%") {
        const next = text[indentLen + 1];
        const removeLen = next === " " ? 2 : 1;
        changes.push({ from: at, to: at + removeLen, insert: "" });
      }
    } else {
      changes.push({ from: at, to: at, insert: "% " });
    }
  }

  if (!changes.length) return true;
  view.dispatch({ changes });
  return true;
}

function getFocusedEditorView() {
  const activeEl = document.activeElement;
  if (headerEditorView && headerEditorView.dom && activeEl && headerEditorView.dom.contains(activeEl)) return headerEditorView;
  if (editorView && editorView.dom && activeEl && editorView.dom.contains(activeEl)) return editorView;
  return editorView || headerEditorView || null;
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
    { key: "Ctrl-Alt-g", run: gotoLine },
    { key: "Mod-Alt-g", run: gotoLine },
    { key: "Ctrl-g", run: () => { goToMeasureFromMenu().catch(() => {}); return true; } },
    { key: "Mod-g", run: () => { goToMeasureFromMenu().catch(() => {}); return true; } },
    { key: "Ctrl-F7", run: (view) => moveLineSelection(view, 1) },
    { key: "Mod-F7", run: (view) => moveLineSelection(view, 1) },
		    { key: "Ctrl-F5", run: (view) => moveLineSelection(view, -1) },
		    { key: "Mod-F5", run: (view) => moveLineSelection(view, -1) },
		    { key: "Tab", run: indentSelectionMore },
		    { key: "Shift-Tab", run: indentSelectionLess },
		    { key: "Mod-/", run: toggleLineComments },
		    { key: "F5", run: () => { if (rawMode) { showToast("Raw mode: switch to tune mode to play.", 2200); return true; } togglePlayPauseEffective().catch(() => {}); return true; } },
		    { key: "F6", run: () => { if (rawMode) { showToast("Raw mode: switch to tune mode to navigate errors.", 2200); return true; } activateErrorByNav(-1); return true; } },
		    { key: "F7", run: () => { if (rawMode) { showToast("Raw mode: switch to tune mode to navigate errors.", 2200); return true; } activateErrorByNav(1); return true; } },
		    { key: "F4", run: () => { if (rawMode) { showToast("Raw mode: switch to tune mode to play.", 2200); return true; } startPlaybackAtIndex(0); return true; } },
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
      if (!rawMode) {
        if (t) clearTimeout(t);
        t = setTimeout(() => scheduleRenderNow(), 400);
      }
    }
	    if (!rawMode && update.selectionSet && !isPlaying) {
	      const idx = update.state.selection.main.anchor;
	      if (followPlayback) {
	        scheduleCursorNoteHighlight(idx);
	      } else {
        clearNoteSelection();
      }
      if (!suppressPlaybackRangeSelectionSync) {
        const origin = pendingPlaybackRangeOrigin || "cursor";
        pendingPlaybackRangeOrigin = null;
        updatePlaybackRangeFromSelection(update.state.selection, origin);
      } else {
        pendingPlaybackRangeOrigin = null;
      }
	      if (transportJumpHighlightActive) {
	        if (suppressTransportJumpClearOnce) {
	          suppressTransportJumpClearOnce = false;
	        } else {
	          transportJumpHighlightActive = false;
	          setPracticeBarHighlight(null);
	          clearSvgPracticeBarHighlight();
	        }
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
      abcHighlightCompartment.of([abcHighlight]),
      abcDiagnosticsCompartment.of([
        measureErrorPlugin,
        errorActivationHighlightPlugin,
        practiceBarHighlightPlugin,
      ]),
      abcCompletionCompartment.of([
        autocompletion({ override: [buildAbcCompletionSource()], activateOnTyping: false }),
      ]),
      abcTuningModeCompartment.of([]),
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
    try {
      wireSearchPanelHotkeys(panel);
    } catch {}
  }, 0);
}

function wireSearchPanelHotkeys(panel) {
  if (!panel || !panel.dataset) return;
  if (panel.dataset.abcarusHotkeys === "1") return;
  panel.dataset.abcarusHotkeys = "1";

  const clickNamed = (name) => {
    const btn = panel.querySelector(`button[name='${name}']`);
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  };

  panel.addEventListener("keydown", (ev) => {
    if (!ev) return;
    const key = String(ev.key || "");

    if (key === "F3") {
      if (ev.shiftKey) {
        if (clickNamed("prev")) ev.preventDefault();
      } else if (clickNamed("next")) {
        ev.preventDefault();
      }
      return;
    }

    if (key !== "Enter") return;
    const hasCtrl = Boolean(ev.ctrlKey || ev.metaKey);

    // Search navigation.
    if (!hasCtrl && !ev.altKey) {
      if (ev.shiftKey) {
        if (clickNamed("prev")) ev.preventDefault();
      } else if (clickNamed("next")) {
        ev.preventDefault();
      }
      return;
    }

    // Replace actions.
    if (hasCtrl || ev.altKey) {
      if (ev.shiftKey || ev.altKey) {
        if (clickNamed("replaceAll")) ev.preventDefault();
      } else if (clickNamed("replace")) {
        ev.preventDefault();
      }
    }
  }, true);
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
      scheduleRenderNow();
    }, 300);
  });
  const state = EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      abcHighlight,
      keymap.of([{ key: "Mod-/", run: toggleLineComments }]),
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
    scheduleSaveLibraryUiState();
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
    const markDirty = Boolean(options && options.markDirty);
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
      currentDoc.dirty = markDirty;
    } else {
      currentDoc = { path: null, dirty: markDirty, content: text || "" };
    }
    updateFileContext();
    setDirtyIndicator(markDirty);
    headerDirty = false;
    updateHeaderStateUI();
  }
  updateFileHeaderPanel();
  if (metadata && metadata.id) {
    maybeResetFocusLoopForTune(metadata.id);
  }
  scheduleRenderNow({ clearOutput: true });
}

function setLibraryVisible(visible, { persist = true } = {}) {
  isLibraryVisible = visible;
  document.body.classList.toggle("library-hidden", !visible);
  if (visible) {
    setPaneSizes(lastSidebarWidth || MIN_PANE_WIDTH);
  } else if ($main) {
    $main.style.gridTemplateColumns = `0px 0px 1fr`;
  }
  if (persist) {
    scheduleSaveLibraryPrefs({ libraryPaneVisible: Boolean(visible) });
  }
}

function toggleLibrary() {
  setLibraryVisible(!isLibraryVisible);
  // Toggling the library pane changes available width; reset the editor/render split so the UI looks tidy.
  requestAnimationFrame(() => {
    try { resetRightPaneSplit(); } catch {}
  });
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
      tuneCount: Number.isFinite(file.tuneCount) ? file.tuneCount : undefined,
      xIssues: file && file.xIssues ? file.xIssues : undefined,
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

let libraryTreeRenderScheduled = false;
let pendingLibraryTreeRenderFiles = null;

function scheduleRenderLibraryTree(files = null) {
  pendingLibraryTreeRenderFiles = files;
  if (libraryTreeRenderScheduled) return;
  libraryTreeRenderScheduled = true;
  requestAnimationFrame(() => {
    libraryTreeRenderScheduled = false;
    const nextFiles = pendingLibraryTreeRenderFiles;
    pendingLibraryTreeRenderFiles = null;
    renderLibraryTree(nextFiles);
  });
}

function renderLibraryTree(files = null) {
  if (!$libraryTree) return;
  $libraryTree.style.display = "";
  $libraryTree.textContent = "";
  const fragment = document.createDocumentFragment();
  const sourceFiles = files || getVisibleLibraryFiles();
  const filteredFiles = libraryTextFilter
    ? applyLibraryTextFilter(sourceFiles, libraryTextFilter)
    : sourceFiles;
  const hasRenameTarget = renamingFilePath
    && filteredFiles
      .some((file) => pathsEqual(file.path, renamingFilePath));
  if (renamingFilePath && !hasRenameTarget) renamingFilePath = null;
  const sortedFiles = sortLibraryFiles(filteredFiles);
  const entries = sortGroupEntries(buildGroupEntries(sortedFiles, groupMode));
  for (const entry of entries) {
    const fileNode = document.createElement("div");
    fileNode.className = "tree-file";
    if (entry.isFile && pathsEqual(activeFilePath, entry.id)) fileNode.classList.add("active");
    if (entry.isFile && entry.xIssues && entry.xIssues.ok === false) {
      fileNode.classList.add("x-issues");
      const parts = [];
      if (entry.xIssues.invalid) parts.push(`invalid X: ${entry.xIssues.invalid}`);
      if (entry.xIssues.missing) parts.push(`missing X: ${entry.xIssues.missing}`);
      if (entry.xIssues.duplicates) parts.push("duplicate X");
      if (parts.length) fileNode.title = `Index issue (${parts.join(", ")})`;
    }
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
      labelText.title = entry.label;
      const count = document.createElement("span");
      count.className = "tree-count";
      count.textContent = String(getEntryTuneCount(entry) || 0);
      fileLabel.append(labelText, count);
      fileLabel.addEventListener("click", (ev) => {
        // Prevent accidental double-toggle when user double-clicks to load.
        if (entry.isFile && ev && ev.detail && ev.detail > 1) return;
        showHoverStatus(entry.label);
        if (entry.isFile) {
          activeFilePath = entry.id;
          if (collapsedFiles.has(entry.id)) collapsedFiles.delete(entry.id);
          else collapsedFiles.add(entry.id);
        } else {
          if (collapsedGroups.has(entry.id)) collapsedGroups.delete(entry.id);
          else collapsedGroups.add(entry.id);
        }
        scheduleRenderLibraryTree(sourceFiles);
        scheduleSaveLibraryUiState();
      });
      fileLabel.addEventListener("dblclick", (ev) => {
        if (!entry.isFile) return;
        ev.preventDefault();
        ev.stopPropagation();
        requestLoadLibraryFile(entry.id).catch(() => {});
      });
      fileLabel.addEventListener("mouseenter", () => showHoverStatus(entry.label));
      fileLabel.addEventListener("mouseleave", () => restoreHoverStatus());
      fileLabel.addEventListener("focus", () => showHoverStatus(entry.label));
      fileLabel.addEventListener("blur", () => restoreHoverStatus());
      fileLabel.addEventListener("contextmenu", (ev) => {
        if (!entry.isFile) return;
        ev.preventDefault();
        activeFilePath = entry.id;
        scheduleRenderLibraryTree(sourceFiles);
        scheduleSaveLibraryUiState();
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
      const tuneLabel = `${labelNumber}: ${title}${composer}${key}`.trim();
      button.textContent = tuneLabel;
      button.title = tuneLabel;
      button.dataset.tuneId = tune.id;
      if (tune.id === activeTuneId) button.classList.add("active");
      button.addEventListener("mouseenter", () => showHoverStatus(tuneLabel));
      button.addEventListener("mouseleave", () => restoreHoverStatus());
      button.addEventListener("focus", () => showHoverStatus(tuneLabel));
      button.addEventListener("blur", () => restoreHoverStatus());
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
		          scheduleRenderLibraryTree(sourceFiles);
		        }
		        showContextMenuAt(ev.clientX, ev.clientY, { type: "tune", tuneId: tune.id });
		      });
      button.addEventListener("click", () => {
        pinHoverStatus(tuneLabel);
        const targetPath = entry.isFile
          ? entry.id
          : String(tune.id || "").split("::")[0];
		        if (targetPath) {
		          activeFilePath = targetPath;
		          scheduleRenderLibraryTree(sourceFiles);
		        }
		        if (rawMode) {
		          if ($fileTuneSelect) $fileTuneSelect.value = tune.id;
		          setActiveTuneInRaw(tune.id);
	          scrollToTuneInRaw(tune.id);
	          return;
	        }
          // Do not rely solely on `tune.id` (it can change if the file is re-parsed).
          // Use the tolerant open helper that can fall back to xNumber and force a re-parse.
          openTuneFromLibrarySelection({
            filePath: targetPath,
            tuneId: tune.id,
            xNumber: tune.xNumber,
          }).then((res) => {
            if (!res || !res.ok) {
              const msg = res && res.error ? res.error : "Unable to open tune.";
              showToast(msg, 3000);
            }
          }).catch(() => {
            showToast("Unable to open tune.", 3000);
          });
	      });
      children.appendChild(button);
    }

    fileNode.appendChild(children);
    fragment.appendChild(fileNode);
  }
  $libraryTree.appendChild(fragment);
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

  let content = getFileContentFromCache(fileMeta.path);
  if (content == null) {
    const res = await readFile(fileMeta.path);
    if (!res.ok) {
      logErr(res.error || "Unable to read file.");
      return { ok: false, error: res.error || "Unable to read file." };
    }
    content = res.data;
    setFileContentInCache(fileMeta.path, content);
  }

  const isTuneSliceValid = (fullText, tune) => {
    if (!fullText || !tune || !Number.isFinite(Number(tune.startOffset))) return false;
    const start = Number(tune.startOffset);
    const probe = String(fullText).slice(start, Math.min(fullText.length, start + 160));
    if (!/^\s*X:/.test(probe)) return false;
    const expectedX = tune && tune.xNumber != null ? String(tune.xNumber) : "";
    if (!expectedX.trim()) return true;
    const match = probe.match(/^\s*X:\s*(\d+)/);
    return Boolean(match && match[1] === expectedX.trim());
  };

  if (!options._reparsed && !isTuneSliceValid(content, selected)) {
    try {
      const updatedFile = await refreshLibraryFile(fileMeta.path, { force: true });
      const tunes = updatedFile && Array.isArray(updatedFile.tunes) ? updatedFile.tunes : [];
      const expectedX = selected && selected.xNumber != null ? String(selected.xNumber) : "";
      const expectedTitle = selected && selected.title ? String(selected.title).trim().toLowerCase() : "";
      const expectedStart = Number.isFinite(Number(selected.startOffset)) ? Number(selected.startOffset) : null;
      const expectedId = selected && selected.id ? String(selected.id) : "";

      let replacement = null;
      if (expectedId) replacement = tunes.find((t) => t && t.id && String(t.id) === expectedId) || null;
      if (!replacement && expectedStart != null) replacement = tunes.find((t) => Number(t.startOffset) === expectedStart) || null;
      if (!replacement && expectedX.trim()) {
        const matches = tunes.filter((t) => String(t && t.xNumber != null ? t.xNumber : "") === expectedX.trim());
        if (matches.length === 1) replacement = matches[0];
        else if (matches.length > 1 && expectedTitle) {
          replacement = matches.find((t) => String(t.title || "").trim().toLowerCase() === expectedTitle) || matches[0];
        } else if (matches.length) {
          replacement = matches[0];
        }
      }
      if (replacement && replacement.id) {
        return selectTune(replacement.id, { ...options, skipConfirm: true, _reparsed: true });
      }
    } catch {}
  }

  const tuneText = content.slice(selected.startOffset, selected.endOffset);
  activeTuneId = tuneId;
  if ($fileTuneSelect && !$fileTuneSelect.disabled) {
    try { $fileTuneSelect.value = tuneId; } catch {}
  }
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
    return libraryIndex.files.find((f) => pathsEqual(f && f.path, wantedPath)) || null;
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
    // The file may have been modified or re-parsed, making cached tune IDs stale.
    // Force a re-parse of the file and retry matching by id / X number.
    try {
      const refreshed = await refreshLibraryFile(fileEntry.path, { force: true });
      const tunes = refreshed && Array.isArray(refreshed.tunes) ? refreshed.tunes : (fileEntry.tunes || []);
      if (tuneId) tune = tunes.find((t) => t && t.id === tuneId) || null;
      if (!tune && tuneNo) tune = tunes.find((t) => String(t && (t.xNumber || "")) === tuneNo) || null;
      if (!tune && xNumber) tune = tunes.find((t) => String(t && (t.xNumber || "")) === xNumber) || null;
    } catch {}
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
    const fileEntry = libraryIndex.files.find((f) => pathsEqual(f.path, entry.path));
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
  setFileContentInCache(entry.path, res.data);
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
  const scanToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const rootAtStart = libraryIndex.root;
  setScanStatus("Refreshing…");
  fileContentCache.clear();
  libraryErrorIndex.clear();
  if (libraryIndex && libraryIndex.root) {
    setFileNameMeta(stripFileExtension(safeBasename(libraryIndex.root)));
  }
  try {
    if (typeof window.api.scanLibraryDiscover === "function") {
      const discovered = await window.api.scanLibraryDiscover(libraryIndex.root, { token: scanToken, computeMeta: true });
      if (discovered && discovered.root && Array.isArray(discovered.files)) {
        if (!libraryIndex || libraryIndex.root !== rootAtStart) return;
        libraryIndex = {
          root: discovered.root,
          files: (discovered.files || []).map((f) => ({ ...f, tunes: Array.isArray(f.tunes) ? f.tunes : [] })),
        };
        libraryViewStore.invalidate();
        updateLibraryRootUI();
        scheduleRenderLibraryTree();
        updateLibraryStatus();
      }
    }
    if (!libraryIndex || libraryIndex.root !== rootAtStart) return;
    await ensureFullLibraryIndex({ reason: "refresh" });
    if (libraryFilterLabel) clearLibraryFilter();
    else {
      scheduleRenderLibraryTree();
      updateLibraryStatus();
    }
		  } catch (e) {
		    setScanStatus("Refresh failed.");
		    logErr(e && e.message ? e.message : String(e));
	  }
}

async function loadLibraryFromFolder(folder) {
  if (!window.api || !folder) return;
  const scanToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    if (typeof window.api.scanLibraryDiscover === "function") {
      const discovered = await window.api.scanLibraryDiscover(folder, { token: scanToken, computeMeta: true });
      if (discovered && discovered.root && Array.isArray(discovered.files)) {
        if (!libraryIndex && folder !== discovered.root) {
          // proceed: first load
        }
        libraryIndex = {
          root: discovered.root,
          files: (discovered.files || []).map((f) => ({ ...f, tunes: Array.isArray(f.tunes) ? f.tunes : [] })),
        };
        libraryViewStore.invalidate();
        updateLibraryRootUI();
        clearLibraryFilter();
        collapsedFiles.clear();
        collapsedGroups.clear();
        activeFilePath = null;
        applyLibraryUiStateFromSettings(latestSettingsSnapshot);
        scheduleRenderLibraryTree();
        updateLibraryStatus();
      }
    }
    if (libraryIndex && libraryIndex.root && libraryIndex.root !== folder) {
      // User switched again while discover ran.
      return;
    }
    await ensureFullLibraryIndex({ reason: "library" });
    if (libraryIndex && libraryIndex.root && libraryIndex.root !== folder) return;

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
    const restoredSelection = applyLibraryUiStateFromSettings(latestSettingsSnapshot);
    scheduleRenderLibraryTree();
    let firstTuneId = null;
    const restoredTune = restoredSelection && restoredSelection.tuneSelection
      ? await restoreLibraryTuneSelection(restoredSelection.tuneSelection)
      : false;
    if (!restoredTune) {
      for (const file of libraryIndex.files || []) {
        if (file.tunes && file.tunes.length) {
          firstTuneId = file.tunes[0].id;
          break;
        }
      }
      if (firstTuneId) {
        await selectTune(firstTuneId);
      }
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
    const fileEntry = libraryIndex.files.find((f) => pathsEqual(f.path, filePath)) || null;
    if (!fileEntry) return { ok: false };
    if (fileEntry.tunes && fileEntry.tunes.length) {
      await selectTune(fileEntry.tunes[0].id);
      return { ok: true };
    }
    const tuneCount = Number.isFinite(fileEntry.tuneCount) ? fileEntry.tuneCount : null;
    const shouldTryParse = tuneCount == null || tuneCount > 0;
    if (shouldTryParse) {
      const updated = await refreshLibraryFile(filePath);
      if (updated && updated.tunes && updated.tunes.length) {
        await selectTune(updated.tunes[0].id);
        return { ok: true };
      }
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
  $btnToggleLibrary.addEventListener("click", (e) => {
    if (e && e.shiftKey) {
      openLibraryListFromCurrentLibraryIndex();
      return;
    }
    toggleLibrary();
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

// Global Stop shortcut (Esc): stop playback if it is active.
// Note: other Esc handlers (search, popovers, inputs) run in capture phase and will preventDefault/stopPropagation.
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if (e.key !== "Escape") return;
  if (!(isPlaying || isPaused || waitingForFirstNote)) return;
  // Avoid surprising behavior when typing in inputs (Escape is often used to clear/close UI).
  const el = e.target;
  const tag = el && el.tagName ? String(el.tagName).toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || (el && el.isContentEditable)) return;
  e.preventDefault();
  stopPlaybackTransport();
});

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
    scheduleSaveLibraryPrefs({ libraryGroupBy: groupMode, librarySortBy: sortMode });
    if (groupMode !== "file" && !hasFullLibraryIndex()) {
      ensureFullLibraryIndex({ reason: `group by ${groupMode}` }).catch(() => {});
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
          scheduleSaveLibraryUiState();
		    }
		  });
		}

if ($sortBy) {
  if ($sortBy.value) sortMode = $sortBy.value;
		  $sortBy.addEventListener("change", () => {
		    sortMode = $sortBy.value || "update_desc";
		    sortModeIsAuto = false;
		    groupSortPrefs.set(groupMode, sortMode);
        scheduleSaveLibraryPrefs({ librarySortBy: sortMode });
		    renderLibraryTree();
		  });
		}

if ($librarySearch) {
  $librarySearch.addEventListener("input", () => {
    scheduleLibrarySearch($librarySearch.value || "");
    scheduleSaveLibraryPrefs({ libraryFilterText: $librarySearch.value || "" });
  });
  $librarySearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      libraryTextFilter = "";
      $librarySearch.value = "";
      scheduleSaveLibraryPrefs({ libraryFilterText: "" });
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

if ($btnLibraryClearFilter) {
  $btnLibraryClearFilter.addEventListener("click", () => {
    libraryTextFilter = "";
    if ($librarySearch) $librarySearch.value = "";
    scheduleSaveLibraryPrefs({ libraryFilterText: "" });
    if (librarySearchTimer) {
      clearTimeout(librarySearchTimer);
      librarySearchTimer = null;
    }
    if (libraryFilterLabel) {
      clearLibraryFilter();
    } else {
      renderLibraryTree();
      updateLibraryStatus();
    }
  });
}

if ($btnLibraryRefresh) {
  $btnLibraryRefresh.addEventListener("click", async () => {
    try {
      await refreshLibraryIndex();
    } catch {}
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

function startScanForErrorsFromToolbarEnable() {
  if (!errorsEnabled) return;
  if (rawMode) return;
  if (isPlaying || isPaused) {
    showToast("Stop playback to scan errors");
    return;
  }
  if (tuneErrorScanInFlight) return;
  const entry = getActiveFileEntry();
  if (!entry) return;
  clearErrors();
  tuneErrorFilter = true;
  tuneErrorScanToken += 1;
  tuneErrorScanInFlight = true;
  buildTuneSelectOptions(entry);
  setScanErrorButtonActive(true);
  scanActiveFileForTuneErrors(entry).catch(() => {});
  updateLibraryStatus();
}

if ($btnFileNew) {
  $btnFileNew.addEventListener("click", async () => {
    try {
      if (rawMode) {
        const ok = await leaveRawModeForAction("creating a new file");
        if (!ok) return;
      }
      await fileNew();
    } catch (e) { logErr((e && e.stack) ? e.stack : String(e)); }
  });
}
if ($btnFileOpen) {
  $btnFileOpen.addEventListener("click", async () => {
    try {
      if (rawMode) {
        const ok = await leaveRawModeForAction("opening a file");
        if (!ok) return;
      }
      await fileOpen();
    } catch (e) { logErr((e && e.stack) ? e.stack : String(e)); }
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
if ($btnToggleRaw) {
  $btnToggleRaw.addEventListener("click", async () => {
    try {
      if (rawMode) await exitRawMode();
      else await enterRawMode();
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($fileTuneSelect) {
  $fileTuneSelect.addEventListener("change", () => {
    const tuneId = $fileTuneSelect.value;
    if (tuneId === "__new__") return;
    if (isNewTuneDraft) isNewTuneDraft = false;
    if (!tuneId) return;
    if (rawMode) {
      setActiveTuneInRaw(tuneId);
      scrollToTuneInRaw(tuneId);
      return;
    }
    selectTune(tuneId);
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
          updateLibraryStatus();
        }, 600);
      }
    } else if (payload.phase === "done") {
      const filesFound = payload.filesFound || 0;
      setScanStatus("Ready", `Ready (${filesFound} files)`);
      if (scanStatusClearTimer) clearTimeout(scanStatusClearTimer);
      scanStatusClearTimer = setTimeout(() => {
        scanStatusClearTimer = null;
        updateLibraryStatus();
      }, 900);
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
  const raw = String(s || "");
  const normalized = raw.trim();
  const display = normalized === "OK" ? "Ready" : raw;
  $status.textContent = display;
  const loading = String(display || "").toLowerCase().startsWith("loading the sound font");
  $status.classList.toggle("status-loading", loading);
}

function setButtonText(button, text) {
  if (!button) return;
  const span = button.querySelector ? button.querySelector(".btn-text") : null;
  const value = String(text || "");
  if (span) span.textContent = value;
  else button.textContent = value;
}

let pinnedHoverStatusText = "";

function setHoverStatus(text) {
  if (!$hoverStatus) return;
  const next = String(text || "");
  $hoverStatus.textContent = next;
  $hoverStatus.title = next;
}

function pinHoverStatus(text) {
  pinnedHoverStatusText = String(text || "");
  setHoverStatus(pinnedHoverStatusText);
}

function showHoverStatus(text) {
  const next = String(text || "");
  if (next) setHoverStatus(next);
  else setHoverStatus(pinnedHoverStatusText);
}

function restoreHoverStatus() {
  setHoverStatus(pinnedHoverStatusText);
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
  const suppressBeatsPrefix = /^meter mismatch:/i.test(msg) || /^repeat marker\b/i.test(msg);
  if (!suppressBeatsPrefix && parts && stats && Number.isFinite(stats.actualWhole)) {
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
  scheduleRenderLibraryTree();
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

async function updateSoundfontLoadingStatus(name) {
  if (soundfontLoadTarget !== name) return;
  setSoundfontCaption("Loading...");
}

function setCursorStatus(line, col, offset, totalLines, totalChars) {
  if (!$cursorStatus) return;
  const text = `Ln ${line}/${totalLines}, Col ${col}  •  Ch ${offset}/${totalChars}`;
  $cursorStatus.textContent = text;
  $cursorStatus.title = text;
}

function applyTransformedText(text) {
  if (!currentDoc) currentDoc = createBlankDocument();
  suppressDirty = true;
  setEditorValue(text);
  suppressDirty = false;
  currentDoc.content = text || "";
  currentDoc.dirty = true;
  scheduleRenderNow({ clearOutput: true });
}

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

function formatMetreFromText(abcText) {
  const text = String(abcText || "");
  const match = text.match(/^M:\s*([0-9]+)\s*\/\s*([0-9]+)\s*$/m);
  if (!match) return "";
  return `${match[1]}/${match[2]}`;
}

function detectMeterMismatchInBarlines(abcText) {
  const text = String(abcText || "");
  const metreText = formatMetreFromText(text) || "";
  if (!metreText) return null;
  const metre = getMetre(text);
  const defaultLen = getDefaultLen(text);
  if (!Number.isFinite(metre) || metre <= 0) return null;
  if (!Number.isFinite(defaultLen) && defaultLen !== "mcm_default") return null;

  const lines = text.split(/\r\n|\n|\r/);
  let metreLoc = null;
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const match = rawLine.match(/^(\s*)M:\s*([0-9]+)\s*\/\s*([0-9]+)/);
    if (!match) continue;
    const found = `${match[2]}/${match[3]}`;
    if (found !== metreText) continue;
    metreLoc = { line: i + 1, col: (match[1] ? match[1].length : 0) + 1 };
    break;
  }
  let inTextBlock = false;
  let inBody = false;
  let buffer = "";
  const bars = [];

  const flushBar = () => {
    const trimmed = buffer.trim();
    buffer = "";
    if (trimmed) bars.push(trimmed);
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) { inTextBlock = true; continue; }
    if (/^%%\s*endtext\b/i.test(trimmed)) { inTextBlock = false; continue; }
    if (inTextBlock) continue;

    if (!inBody) {
      if (/^\s*K:/.test(rawLine) || /^\s*\[\s*K:/.test(trimmed)) inBody = true;
      continue;
    }

    // Skip directives/fields/lyrics/comments.
    if (!trimmed) continue;
    if (/^%/.test(trimmed) && !/^%%/.test(trimmed)) continue;
    if (/^\s*%%/.test(rawLine)) continue;
    if (/^\s*[A-Za-z]:/.test(rawLine)) continue;

    // Strip inline comment.
    let line = rawLine;
    const idx = line.indexOf("%");
    if (idx >= 0) line = line.slice(0, idx);

    const parts = splitLineIntoParts(line);
    for (const part of parts) {
      const p = String(part || "");
      if (BAR_SEP_NO_SPACE.test(p.trim())) {
        flushBar();
        continue;
      }
      buffer += ` ${p}`;
    }
  }
  flushBar();

  const usable = [];
  for (const bar of bars) {
    const len = getBarLength(bar, defaultLen, metre);
    if (!Number.isFinite(len) || len <= 0) continue;
    usable.push({ bar, len });
  }
  if (usable.length < 6) return null;
  if (isLikelyAnacrusis(usable[0].bar, defaultLen, metre)) usable.shift();
  if (usable.length < 6) return null;

  const counts = new Map(); // multiple -> count
  const tol = 0.12;
  for (const item of usable) {
    const ratio = item.len / metre;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const rounded = Math.round(ratio);
    if (rounded < 2 || rounded > 8) continue;
    if (Math.abs(ratio - rounded) > tol) continue;
    counts.set(rounded, (counts.get(rounded) || 0) + 1);
  }
  if (!counts.size) return null;

  let best = { multiple: 0, count: 0 };
  for (const [multiple, count] of counts.entries()) {
    if (count > best.count) best = { multiple, count };
  }
  const total = usable.length;
  if (best.count < Math.max(4, Math.ceil(total * 0.6))) return null;

  const hint = metreText
    ? `Bars look ~${best.multiple}× longer than M:${metreText}`
    : `Bars look ~${best.multiple}× longer than the meter`;
  return {
    kind: "meter-mismatch",
    detail: `${hint}. Consider updating M: or adding barlines.`,
    multiple: best.multiple,
    barCount: total,
    matchCount: best.count,
    metre: metreText || null,
    loc: metreLoc,
  };
}

function detectRepeatMarkerAfterShortBar(abcText) {
  const text = String(abcText || "");
  const headerMetreText = formatMetreFromText(text) || "";
  if (!headerMetreText) return null;
  const headerMetre = getMetre(text);
  const defaultLen = getDefaultLen(text);
  if (!Number.isFinite(headerMetre) || headerMetre <= 0) return null;
  if (!Number.isFinite(defaultLen) && defaultLen !== "mcm_default") return null;

  let currentMetre = headerMetre;
  let currentMetreText = headerMetreText;

  const lines = text.split(/\r\n|\n|\r/);
  let inTextBlock = false;
  let inBody = false;
  let buffer = "";
  let lastStartToken = null;
  let lastTokenLoc = null;

  const flushBar = (endToken, endLoc) => {
    const bar = buffer.trim();
    buffer = "";
    if (!bar) return null;
    const len = getBarLength(bar, defaultLen, currentMetre);
    if (!Number.isFinite(len) || len <= 0) return null;
    const ratio = len / currentMetre;
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const isFullBar = Math.abs(ratio - 1) <= 0.15;
    if (isFullBar) return null;

    const token = String(endToken || "").trim();
    if (!token.includes(":")) return null;

    const isStartRepeatToken = token.includes("|:") || token.endsWith(":");
    const isEndRepeatToken = token.startsWith(":|") || token.includes(":|");
    // Treat a short bar immediately before a repeat marker as a valid incomplete bar:
    // - before start-repeat: pickup/anacrusis (e.g. "|:" / "::" / ":|:")
    // - before end-repeat: shortened closing bar (often balances an initial pickup)
    if ((isStartRepeatToken || isEndRepeatToken) && ratio <= 0.8) return null;

    const ratioText = ratio.toFixed(2).replace(/\.?0+$/, "");
    return {
      kind: "repeat-short-bar",
      detail: `Repeat marker "${token}" follows a bar of ~${ratioText}× length under M:${currentMetreText}. Consider fixing bar lengths or changing M: locally.`,
      metre: currentMetreText,
      ratio,
      token,
      startToken: lastStartToken || null,
      loc: endLoc || lastTokenLoc || null,
    };
  };

  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    const rawLine = lines[lineNo];
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) { inTextBlock = true; continue; }
    if (/^%%\s*endtext\b/i.test(trimmed)) { inTextBlock = false; continue; }
    if (inTextBlock) continue;

    if (!inBody) {
      if (/^\s*K:/.test(rawLine) || /^\s*\[\s*K:/.test(trimmed)) inBody = true;
      continue;
    }

    if (!trimmed) continue;
    if (/^%/.test(trimmed) && !/^%%/.test(trimmed)) continue;
    if (/^\s*%%/.test(rawLine)) continue;
    // Allow meter changes in the tune body.
    const bodyMeterMatch = trimmed.match(/^M:\s*(\d+)\s*\/\s*(\d+)/i);
    if (bodyMeterMatch) {
      const num = Number(bodyMeterMatch[1]);
      const den = Number(bodyMeterMatch[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && num > 0 && den > 0) {
        currentMetre = num / den;
        currentMetreText = `${bodyMeterMatch[1]}/${bodyMeterMatch[2]}`;
      }
      continue;
    }
    if (/^\s*[A-Za-z]:/.test(rawLine)) continue;

    let line = rawLine;
    const commentIdx = line.indexOf("%");
    if (commentIdx >= 0) line = line.slice(0, commentIdx);

    const parts = splitLineIntoParts(line);
    let cursor = 0;
    for (const part of parts) {
      const p = String(part || "");
      const pos = line.indexOf(p, cursor);
      const start = pos >= 0 ? pos : cursor;
      cursor = start + p.length;

      const token = p.trim();
      if (BAR_SEP_NO_SPACE.test(token)) {
        const loc = { line: lineNo + 1, col: start + 1 };
        if (!buffer.trim()) {
          lastStartToken = token;
          lastTokenLoc = loc;
          continue;
        }
        const warn = flushBar(token, loc);
        lastStartToken = token;
        lastTokenLoc = loc;
        if (warn) return warn;
        continue;
      }

      // Track inline meter changes like [M:6/8] in-order (can appear after barlines on the same line).
      const inlineMeterRe = /\[\s*M:\s*(\d+)\s*\/\s*(\d+)\s*\]/gi;
      let mm;
      while ((mm = inlineMeterRe.exec(p)) !== null) {
        const num = Number(mm[1]);
        const den = Number(mm[2]);
        if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) continue;
        currentMetre = num / den;
        currentMetreText = `${mm[1]}/${mm[2]}`;
      }
      buffer += ` ${p}`;
    }
  }

  return null;
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
let pendingCursorNoteHighlightRaf = null;
let pendingCursorNoteHighlightIdx = null;

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
    if (action === "addToSetList" && menuTarget) {
      const tuneId = menuTarget.type === "tune"
        ? menuTarget.tuneId
        : (menuTarget.type === "editor" ? activeTuneId : null);
      hideContextMenu();
      try {
        await addTuneToSetListByTuneId(tuneId);
        showToast("Added to Set List.", 2000);
        if ($setListModal && $setListModal.classList.contains("open")) renderSetList();
      } catch (e) {
        showToast(e && e.message ? e.message : String(e), 5000);
      }
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
    if (action === "xIssues" && menuTarget && menuTarget.type === "file") {
      hideContextMenu();
      await openXIssuesModalForFile(menuTarget.filePath);
      return;
    }
    if (action === "renumberXInFile" && menuTarget) {
      const filePath = menuTarget.type === "file"
        ? menuTarget.filePath
        : (menuTarget.type === "tune" && menuTarget.tuneId ? String(menuTarget.tuneId).split("::")[0] : null);
      if (filePath) {
        await renumberXInActiveFile(filePath);
      }
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
      { label: "Add to Set List", action: "addToSetList" },
      { label: "Copy Tune", action: "copyTune" },
      { label: "Duplicate Tune", action: "duplicateTune" },
      { label: "Cut Tune", action: "cutTune" },
      { label: "Move to…", action: "moveTune" },
      { label: "Renumber X (File)…", action: "renumberXInFile" },
      { label: "Delete Tune…", action: "deleteTune", danger: true },
    ]);
  } else if (target.type === "file") {
    const fileEntry = libraryIndex && Array.isArray(libraryIndex.files) && target.filePath
      ? libraryIndex.files.find((f) => pathsEqual(f.path, target.filePath))
      : null;
    const hasXIssues = Boolean(fileEntry && fileEntry.xIssues && fileEntry.xIssues.ok === false);
    buildContextMenuItems([
      { label: "Load", action: "loadFile", disabled: !target.filePath },
      { label: "Paste Tune", action: "pasteTune", disabled: !clipboardTune },
      { label: "Refresh Library", action: "refreshLibrary" },
      { label: "Rename File…", action: "renameFile" },
      { label: "X issues…", action: "xIssues", disabled: !hasXIssues },
      { label: "Renumber X…", action: "renumberXInFile", disabled: !target.filePath },
    ]);
  } else if (target.type === "library") {
    buildContextMenuItems([
      { label: "Refresh Library", action: "refreshLibrary" },
      { label: "Clear Search", action: "clearSearch", disabled: !libraryTextFilter },
    ]);
  } else if (target.type === "editor") {
    const canAdd = Boolean(activeTuneId) && !rawMode;
    buildContextMenuItems([
      { label: "Add Active Tune to Set List", action: "addToSetList", disabled: !canAdd },
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
    await withFileLocks([oldPath, newPath], async () => {
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
    });
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
  if (pathsEqual(res.file.path, targetPath)) {
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

function findMeasureStartOffsetByNumber(text, measureNumber) {
  const target = Number(measureNumber);
  if (!Number.isFinite(target) || target < 1) return null;
  const src = String(text || "");
  if (!src.trim()) return null;
  const len = src.length;

  const isSkippableLine = (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return true;
    if (trimmed.startsWith("%")) return true;
    if (/^%%/.test(trimmed)) return true;
    if (/^[A-Za-z]:/.test(trimmed)) return true;
    return false;
  };

  const isBodyLine = (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("%")) return false;
    if (/^%%/.test(trimmed)) return false;
    if (/^[A-Za-z]:/.test(trimmed)) return false;
    return true;
  };

  let inTextBlock = false;
  let started = false;
  let currentMeasure = 1;
  let currentStart = null;

  const lineStarts = [0];
  for (let i = 0; i < len; i += 1) {
    if (src[i] === "\n") lineStarts.push(i + 1);
  }
  lineStarts.push(len + 1);

  for (let li = 0; li < lineStarts.length - 1; li += 1) {
    const lineStart = lineStarts[li];
    const lineEnd = Math.min(len, lineStarts[li + 1] - 1);
    const rawLine = src.slice(lineStart, lineEnd);
    const trimmed = rawLine.trim();

    if (/^%%\s*begintext\b/i.test(trimmed)) { inTextBlock = true; continue; }
    if (/^%%\s*endtext\b/i.test(trimmed)) { inTextBlock = false; continue; }
    if (inTextBlock) continue;
    if (isSkippableLine(rawLine)) continue;
    if (!started && !isBodyLine(rawLine)) continue;
    if (!started) {
      started = true;
      // First measure begins at the first non-space character of the first body line.
      const firstNonSpace = rawLine.search(/\S/);
      currentStart = firstNonSpace >= 0 ? lineStart + firstNonSpace : lineStart;
      if (target === 1) return currentStart;
    }

    let inQuote = false;
    let inComment = false;
    for (let i = lineStart; i < lineEnd; i += 1) {
      const ch = src[i];
      if (inComment) continue;
      if (ch === "%" && src[i - 1] !== "\\") { inComment = true; continue; }
      if (ch === "\"") { inQuote = !inQuote; continue; }
      if (inQuote) continue;
      if (ch !== "|") continue;

      // Found a barline boundary. Next measure starts immediately after this boundary token sequence.
      let j = i + 1;
      while (j < lineEnd && /[:|\]\s]/.test(src[j])) j += 1;
      currentMeasure += 1;
      currentStart = j;
      if (currentMeasure === target) return currentStart;

      // Skip the rest of the boundary token sequence to avoid double-counting "||", "|]", "|:", etc.
      i = j - 1;
    }
  }

  return null;
}

let renderMeasureIndexCache = null; // { key, offset, istarts, anchor, byNumber }

function buildMeasureIstartsFromAbc2svg(firstSymbol) {
  const istarts = [];
  const pushUnique = (v) => {
    if (!Number.isFinite(v)) return;
    if (!istarts.length || istarts[istarts.length - 1] !== v) istarts.push(v);
  };
  const isBarLikeSymbol = (symbol) => !!(symbol && (symbol.bar_type || symbol.type === 14));
  let s = firstSymbol;
  let guard = 0;
  if (s && Number.isFinite(s.istart)) pushUnique(s.istart);
  while (s && guard < 200000) {
    if (isBarLikeSymbol(s) && s.ts_next && Number.isFinite(s.ts_next.istart)) {
      pushUnique(s.ts_next.istart);
    }
    s = s.ts_next;
    guard += 1;
  }
  const out = [];
  let last = null;
  for (const v of istarts.slice().sort((a, b) => a - b)) {
    if (!Number.isFinite(v)) continue;
    if (last == null || v !== last) out.push(v);
    last = v;
  }
  return out;
}

function buildMeasureStartsByNumberFromAbc2svg(firstSymbol) {
  const byNumber = new Map(); // number -> [istart...]
  const push = (n, istart) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return;
    const start = Number(istart);
    if (!Number.isFinite(start)) return;
    const list = byNumber.get(num) || [];
    if (!list.length || list[list.length - 1] !== start) list.push(start);
    byNumber.set(num, list);
  };
  const isBarLikeSymbol = (symbol) => !!(symbol && (symbol.bar_type || symbol.type === 14));

  // Measure 1 start should point at the first playable symbol, not at header tokens like Q:/K:/etc.
  // abc2svg's bar_num typically labels the barline *ending* measure 1 as 2, so we may not get a natural
  // (bar_num=1) mapping from barlines; we seed measure 1 explicitly.
  let s = firstSymbol;
  let guard = 0;
  let firstPlayableStart = null;
  while (s && guard < 200000) {
    const playable = Number.isFinite(s.dur) && s.dur > 0;
    if (playable && Number.isFinite(s.istart)) { firstPlayableStart = s.istart; break; }
    s = s.ts_next;
    guard += 1;
  }
  if (firstPlayableStart != null) {
    // Also expose as bar 0 for pickup-heavy sources.
    push(0, firstPlayableStart);
    push(1, firstPlayableStart);
  }

  s = firstSymbol;
  guard = 0;
  while (s && guard < 200000) {
    if (isBarLikeSymbol(s) && s.ts_next && Number.isFinite(s.ts_next.istart) && Number.isFinite(s.bar_num)) {
      push(s.bar_num, s.ts_next.istart);
    }
    s = s.ts_next;
    guard += 1;
  }

  // Normalize: sort each list and dedupe.
  for (const [k, list] of byNumber.entries()) {
    const out = [];
    let last = null;
    for (const v of list.slice().sort((a, b) => a - b)) {
      if (!Number.isFinite(v)) continue;
      if (last == null || v !== last) out.push(v);
      last = v;
    }
    byNumber.set(k, out);
  }

  return byNumber;
}

function neutralizeMidiDrumDirectivesForPlayback(text) {
  const raw = String(text || "");
  if (!/%%\s*MIDI\s+drum(on|bars)?\b/i.test(raw)) return raw;
  // Keep line lengths stable (istart mapping) by replacing "%%" with "% " (comment).
  return raw.split(/\r\n|\n|\r/).map((line) => {
    if (!/^\s*%%\s*MIDI\s+drum(on|bars)?\b/i.test(line)) return line;
    const idx = line.indexOf("%%");
    if (idx < 0) return line;
    return `${line.slice(0, idx)}% ${line.slice(idx + 2)}`;
  }).join("\n");
}

function relocateMidiDrumDirectivesIntoBody(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const drumLineRe = /^\s*%%\s*MIDI\s+drum(on|off|bars)?\b/i;
  let insertAt = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*K:/.test(line) || /^\s*\[\s*K:/.test(line)) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt < 0) return { text: String(text || ""), moved: 0 };

  const moved = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i >= insertAt) break;
    const line = lines[i];
    if (!drumLineRe.test(line)) continue;
    moved.push(line);
    // Leave a same-length comment behind to keep editor/istart mapping as stable as possible.
    const idx = line.indexOf("%%");
    if (idx >= 0) {
      lines[i] = `${line.slice(0, idx)}% ${line.slice(idx + 2)}`;
    } else {
      lines[i] = `% ${line}`;
    }
  }
  if (!moved.length) return { text: lines.join("\n"), moved: 0 };

  // Insert original directives after K: so abc2svg treats them as being "in a voice" (native mididrum blocks).
  lines.splice(insertAt, 0, ...moved, "%");
  return { text: lines.join("\n"), moved: moved.length };
}

function getRenderMeasureIndex() {
  if (!editorView) return null;
  const payload = getRenderPayload();
  const key = `${payload.offset || 0}|||${payload.text || ""}`;
  if (renderMeasureIndexCache && renderMeasureIndexCache.key === key) return renderMeasureIndexCache;

  try {
    const AbcCtor = getAbcCtor();
    const user = {
      img_out: () => {},
      err: () => {},
      errmsg: () => {},
    };
    const abc = new AbcCtor(user);
    const navText = neutralizeMidiDrumDirectivesForPlayback(payload.text || "");
    abc.tosvg("nav_measures", navText);
    const tunes = abc.tunes || [];
    const first = tunes && tunes[0] ? tunes[0][0] : null;
    if (!first) return null;
    const istarts = buildMeasureIstartsFromAbc2svg(first);
    if (!istarts.length) return null;
    const byNumber = buildMeasureStartsByNumberFromAbc2svg(first);
    const renderOffset = Number(payload.offset) || 0;
    const firstBodyStart = findMeasureStartOffsetByNumber(payload.text || "", 1);
    const minIstart = Math.max(
      renderOffset,
      Number.isFinite(firstBodyStart) ? firstBodyStart : 0
    );
    let anchor = istarts.findIndex((v) => v >= minIstart);
    if (!Number.isFinite(anchor) || anchor < 0) anchor = 0;
    renderMeasureIndexCache = { key, offset: renderOffset, istarts, anchor, byNumber };
    return renderMeasureIndexCache;
  } catch {
    return null;
  }
}

let goToMeasureModalEls = null;
function getGoToMeasureModal() {
  if (goToMeasureModalEls) return goToMeasureModalEls;

  const backdrop = document.createElement("div");
  backdrop.className = "abcarus-modal-backdrop hidden";

  const dialog = document.createElement("div");
  dialog.className = "abcarus-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "abcarus-modal-title";
  title.textContent = "Go to Measure";

  const body = document.createElement("div");
  body.className = "abcarus-modal-body";

  const label = document.createElement("label");
  label.className = "abcarus-modal-label";
  label.textContent = "Measure number:";

  const input = document.createElement("input");
  input.className = "abcarus-modal-input";
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.step = "1";
  input.autocomplete = "off";
  input.spellcheck = false;

  label.appendChild(input);
  body.appendChild(label);

  const buttons = document.createElement("div");
  buttons.className = "abcarus-modal-buttons";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn abcarus-modal-btn";
  cancel.textContent = "Cancel";

  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "btn abcarus-modal-btn primary";
  ok.textContent = "OK";

  buttons.append(cancel, ok);
  dialog.append(title, body, buttons);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  goToMeasureModalEls = { backdrop, dialog, input, ok, cancel };
  return goToMeasureModalEls;
}

async function promptGoToMeasureNumber() {
  const { backdrop, dialog, input, ok, cancel } = getGoToMeasureModal();
  backdrop.classList.remove("hidden");

  const prevActive = document.activeElement;

  const cleanup = () => {
    backdrop.classList.add("hidden");
    try {
      if (prevActive && typeof prevActive.focus === "function") prevActive.focus();
    } catch {}
  };

  return await new Promise((resolve) => {
    const finish = (value) => {
      teardown();
      cleanup();
      resolve(value);
    };

    const onBackdropMouseDown = (ev) => {
      if (ev.target === backdrop) finish(null);
    };
    const onKeyDown = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        finish(null);
        return;
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        finish(String(input.value || ""));
      }
    };
    const onOk = () => finish(String(input.value || ""));
    const onCancel = () => finish(null);

    const teardown = () => {
      backdrop.removeEventListener("mousedown", onBackdropMouseDown);
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeyDown, true);
    };

    backdrop.addEventListener("mousedown", onBackdropMouseDown);
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeyDown, true);

    requestAnimationFrame(() => {
      input.value = "";
      input.focus();
      input.select();
      try {
        dialog.scrollIntoView({ block: "center", inline: "center" });
      } catch {}
    });
  });
}

async function goToMeasureFromMenu() {
  if (!editorView) return;
  if (rawMode) {
    setStatus("Go to Measure is unavailable in Raw mode.");
    return;
  }
  if (isPlaybackBusy()) {
    setStatus("Stop playback first.");
    return;
  }
  setStatus("Go to Measure…");
  const raw = await promptGoToMeasureNumber();
  if (raw == null) return;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    showToast("Invalid measure number.", 2400);
    return;
  }
  const text = getEditorValue();
  let idx = null;
  const measureIndex = getRenderMeasureIndex();
  if (
    idx == null
    && measureIndex
    && measureIndex.byNumber
    && typeof measureIndex.byNumber.get === "function"
  ) {
    const list = measureIndex.byNumber.get(n);
    if (Array.isArray(list) && list.length) {
      const renderOffset = Number(measureIndex.offset) || 0;
      const cursor = editorView ? editorView.state.selection.main.anchor : 0;
      const currentRenderIdx = (Number(cursor) || 0) + renderOffset;
      let chosen = list[0];
      for (const v of list) {
        if (Number.isFinite(v) && v >= currentRenderIdx) { chosen = v; break; }
      }
      if (Number.isFinite(chosen)) idx = Math.max(0, Math.floor(chosen - renderOffset));
    }
  }
  if (idx == null && n >= 1 && measureIndex && Array.isArray(measureIndex.istarts) && measureIndex.istarts.length) {
    const anchor = Number.isFinite(measureIndex.anchor) ? measureIndex.anchor : 0;
    const slot = (n - 1) + anchor;
    const istart = measureIndex.istarts[slot];
    if (Number.isFinite(istart)) {
      idx = Math.max(0, Math.floor(istart - (Number(measureIndex.offset) || 0)));
      if (window.__abcarusDebugGoToMeasure) {
        try {
          console.log("[abcarus] goToMeasure", { n, anchor, slot, istart, renderOffset: measureIndex.offset, idx });
        } catch {}
      }
    }
  }
  if (idx == null && n >= 1) idx = findMeasureStartOffsetByNumber(text, n);
  if (idx == null) {
    showToast(`Measure ${n} not found.`, 2600);
    return;
  }
  const max = editorView.state.doc.length;
  const pos = Math.max(0, Math.min(idx, max));
  editorView.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });

  // Transport playhead: next Play starts from this measure (until Stop).
  transportPlayheadOffset = pos;
  pendingPlaybackPlan = buildTransportPlaybackPlan();

  // Visual feedback: highlight the target measure in both editor and score.
  try {
    const range = findMeasureRangeAt(text, pos);
    if (range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start) {
      setPracticeBarHighlight({ from: range.start, to: range.end });
      highlightSvgPracticeBarAtEditorOffset(pos);
      const chosen = lastSvgPracticeBarEls.length ? pickClosestNoteElement(lastSvgPracticeBarEls) : null;
      if (chosen) maybeScrollRenderToNote(chosen);
      transportJumpHighlightActive = true;
      suppressTransportJumpClearOnce = true;
    } else {
      highlightSvgAtEditorOffset(pos);
    }
  } catch {}
  setStatus(`Go to measure: ${n}`);
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
  const baseContext = activeTuneMeta ? {
    tuneId: activeTuneMeta.id,
    filePath: activeTuneMeta.path || null,
    fileBasename: activeTuneMeta.basename || (activeTuneMeta.path ? safeBasename(activeTuneMeta.path) : ""),
    tuneLabel: buildErrorTuneLabel(activeTuneMeta),
    xNumber: activeTuneMeta.xNumber || "",
    title: activeTuneMeta.title || "",
  } : null;
  const context = contextOverride
    ? { ...(baseContext || {}), ...contextOverride }
    : baseContext;
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

function scheduleCursorNoteHighlight(idx) {
  // Hot path: selection changes can fire frequently while typing/moving cursor.
  // Avoid synchronous SVG-wide querySelectorAll on every change; throttle to RAF and keep it opt-in via Follow.
  pendingCursorNoteHighlightIdx = idx;
  if (pendingCursorNoteHighlightRaf != null) return;
  pendingCursorNoteHighlightRaf = requestAnimationFrame(() => {
    pendingCursorNoteHighlightRaf = null;
    const next = pendingCursorNoteHighlightIdx;
    pendingCursorNoteHighlightIdx = null;
    if (!followPlayback) return;
    if (rawMode || isPlaying) return;
    highlightNoteAtIndex(next);
  });
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

function pickPreferredLatinText(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  let fallback = "";
  let best = "";
  let bestScore = -1;
  for (const raw of list) {
    const text = String(raw || "").trim();
    if (!text) continue;
    if (!fallback) fallback = text;
    const latin = latinize(text).trim();
    const letters = (latin.match(/[A-Za-z]/g) || []).length;
    const score = letters > 0 ? letters : 0;
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return best || fallback || "";
}

function hasAsciiAlnum(text) {
  const latin = latinize(String(text || "")).trim();
  return /[A-Za-z0-9]/.test(latin);
}

function parseAbcHeaderFields(text) {
  const fields = { titles: [], title: "", composer: "", key: "" };
  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (const line of lines) {
    if (/^T:/.test(line)) {
      const t = line.replace(/^T:\s*/, "").trim();
      if (t) fields.titles.push(t);
      if (!fields.title) fields.title = t;
    } else if (!fields.composer && /^C:/.test(line)) {
      fields.composer = line.replace(/^C:\s*/, "").trim();
    } else if (!fields.key && /^K:/.test(line)) {
      fields.key = line.replace(/^K:\s*/, "").trim();
      break;
    }
  }
  const preferred = pickPreferredLatinText(fields.titles);
  if (preferred) fields.title = preferred;
  return fields;
}

function parseTuneIdentityFields(text) {
  const out = { xNumber: "", title: "", composer: "", key: "", preview: "" };
  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (const line of lines) {
    if (!out.xNumber) {
      const m = line.match(/^X:\s*(\d+)/);
      if (m) out.xNumber = m[1];
    }
    if (!out.title && /^T:/.test(line)) out.title = line.replace(/^T:\s*/, "").trim();
    else if (!out.composer && /^C:/.test(line)) out.composer = line.replace(/^C:\s*/, "").trim();
    else if (!out.key && /^K:/.test(line)) {
      out.key = line.replace(/^K:\s*/, "").trim();
      break;
    }
  }
  out.preview = out.title || (out.xNumber ? `X:${out.xNumber}` : "");
  return out;
}

function getSuggestedBaseName() {
  const parsed = parseAbcHeaderFields(getEditorValue());
  const title = parsed.title || (activeTuneMeta && activeTuneMeta.title) || "untitled";
  const composerCandidate = parsed.composer || (activeTuneMeta && activeTuneMeta.composer) || "";
  const composer = hasAsciiAlnum(composerCandidate) ? composerCandidate : "";
  const parts = composer ? [title, composer] : [title];
  return sanitizeFileBaseName(parts.join("_"));
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
	    if (errorsEnabled && tuneErrorScanInFlight) {
	      const keyWarn = detectKeyFieldNotLastBeforeBody(renderText);
	      if (keyWarn && keyWarn.detail) {
	        const msg = `Warning: ${keyWarn.detail}`;
	        errors.push({ message: msg, loc: keyWarn.loc || null });
	        if (!options || !options.suppressGlobalErrors) {
	          logErr(msg, keyWarn.loc || null, { ...(context || {}), skipMeasureRange: true });
	        }
	      }
	    }
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
  let content = getFileContentFromCache(filePath);
  if (content == null) {
    const res = await readFile(filePath);
    if (!res.ok) return res;
    content = res.data;
    setFileContentInCache(filePath, content);
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
    const effectiveHeader = (entry && entry.path && pathsEqual(entry.path, activeFilePath)) ? getHeaderEditorValue() : (entry.headerText || "");
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

function getSetListSuggestedBaseName() {
  const base = getSongbookSuggestedBaseName();
  return sanitizeFileBaseName(`${base || "set-list"} - set-list`);
}

async function renderSetListSvgMarkupForPrint(options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const includeIssueCards = options.includeIssueCards !== false;
  const includeIssueSummary = options.includeIssueSummary !== false;
  if (!Array.isArray(setListItems) || setListItems.length === 0) {
    return { ok: false, error: "No tunes in Set List." };
  }

  const entry = { basename: "Set List" };
  const blocks = [];
  let current = [];
  const summary = [];

  const flush = () => {
    if (!current.length) return;
    blocks.push(current);
    current = [];
  };

  const total = setListItems.length;
  for (let i = 0; i < total; i += 1) {
    const item = setListItems[i] || {};
    const raw = String(item.text || "");
    if (onProgress && (i % 5 === 0 || i === total - 1)) onProgress(i + 1, total);
    if (!raw.trim()) continue;

    const tune = {
      id: item.sourceTuneId || item.id || "",
      xNumber: String(i + 1),
      title: item.title || "",
      preview: item.title || `X:${i + 1}`,
    };

    const breakBefore = setListPageBreaks === "perTune"
      ? i > 0
      : shouldInjectNewPageBeforeTune(raw, { mode: setListPageBreaks, idx: i });
    if (breakBefore) flush();

    const renumbered = ensureXNumberInAbc(raw, i + 1);
    const combinedHeader = `${getSetListFileHeaderText()}${item.headerText || ""}`;
    const prefix = buildHeaderPrefix(combinedHeader, false, renumbered);
    const block = prefix.text ? `${prefix.text}${renumbered}` : renumbered;
    const context = { tuneLabel: buildPrintTuneLabel(tune) };
    setErrorLineOffsetFromHeader(prefix.text);
    const res = await renderAbcToSvgMarkup(block, { errorContext: context });
    const tuneErrors = res.errors ? res.errors.slice() : [];
    if (!res.ok && res.error) tuneErrors.push({ message: res.error });

    if (tuneErrors.length) {
      const uniqueKeys = new Set(tuneErrors.map((err) => {
        const msg = err && err.message ? err.message : "Unknown error";
        const loc = err && err.loc ? `Line ${err.loc.line}, Col ${err.loc.col}` : "";
        return `${msg}|${loc}`;
      }));
      summary.push({ tune, count: uniqueKeys.size });
      if (includeIssueCards) current.push(buildPrintErrorCard(entry, tune, tuneErrors).trim());
    }

    if (res.svg && res.svg.trim()) {
      current.push(res.svg.trim());
    }

    if (setListPageBreaks === "perTune") flush();
  }
  flush();

  if (!blocks.length) return { ok: false, error: "No SVG output produced." };

  const parts = [];
  if (includeIssueSummary && summary.length) {
    parts.push(buildPrintErrorSummary(entry, summary, total).trim());
  }
  for (const block of blocks) {
    parts.push(`<div class="print-tune">${block.join("\n")}</div>`);
  }
  const issues = {
    totalTunes: total,
    tunesWithIssues: summary.length,
    totalErrors: summary.reduce((sum, item) => sum + (Number.isFinite(Number(item.count)) ? Number(item.count) : 0), 0),
  };
  return { ok: true, svg: parts.join("\n"), issues };
}

async function runPrintSetListAction(type) {
  if (!window.api) return;
  if (!Array.isArray(setListItems) || setListItems.length === 0) {
    setStatus("No Set List to print.");
    return;
  }
  setStatus("Rendering…");
  const showIssuesInMarkup = type === "preview";
  const renderRes = await renderSetListSvgMarkupForPrint({
    includeIssueCards: showIssuesInMarkup,
    includeIssueSummary: showIssuesInMarkup,
    onProgress: (current, total) => {
      setStatus(`Rendering tunes… ${current}/${total}`);
    },
  });
  if (!renderRes.ok) {
    setStatus("Error");
    logErr(renderRes.error || "Unable to render.");
    return;
  }

  let svgMarkup = applyPrintDebugMarkup(renderRes.svg);
  const zeroMargins = shouldUseZeroPageMarginsForSetList();
  if (zeroMargins) {
    svgMarkup = `<!--abcarus:pdf-no-margins-->\n<style>body{padding:0 !important}</style>\n${svgMarkup}`;
  }
  if (setListCompact) {
    svgMarkup = `<style>body{padding:12px !important}</style>\n${svgMarkup}`;
  }
  let res = null;
  if (type === "print" && typeof window.api.printDialog === "function") {
    res = await window.api.printDialog(svgMarkup);
  } else if (type === "pdf" && typeof window.api.exportPdf === "function") {
    res = await window.api.exportPdf(svgMarkup, getSetListSuggestedBaseName());
  } else if (type === "preview" && typeof window.api.printPreview === "function") {
    res = await window.api.printPreview(svgMarkup);
  }

  if (res && res.ok) {
    setStatus("OK");
    if (type === "pdf" && res.path) {
      const issues = renderRes.issues || null;
      const suffix = (issues && issues.tunesWithIssues)
        ? ` (${issues.tunesWithIssues} tunes had issues; use Preview for details)`
        : "";
      showToast(`Exported PDF: ${res.path}${suffix}`);
    }
  } else if (res && res.error && res.error !== "Canceled") {
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
  if (!rawMode) scheduleRenderNow({ clearOutput: true });
}

function showEmptyState() {
  setRawModeUI(false);
  rawModeFilePath = null;
  rawModeHeaderEndOffset = 0;
  rawModeOriginalTuneId = null;
  suppressDirty = true;
  setEditorValue("");
  suppressDirty = false;
  $out.innerHTML = "";
  setRenderBusy(false);
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
  return window.abc2svg.modules.load(content, () => scheduleRenderNow(), logErr);
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

function normalizeAccThreeQuarterToneForAbc2svg(text) {
  // abc2svg has built-in glyphs for quarter-tones as 1/2 semitone (acc-1_2) and 3/2 semitones (acc-3_2),
  // but some real-world ABC uses 3/4 tone accidentals written as "_3/4" or "^3/4".
  // For tolerant playback, normalize to the abc2svg-supported 3/2 semitone form (same musical intent).
  return String(text || "").replace(/([_^])3\/4/g, "$13/2");
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
  let replaced = false;
  // Important: keep the output string length identical to the input.
  // The SVG <-> editor mapping uses character offsets; changing length breaks follow/highlight after a %%sep line.
  const stripped = value.replace(/^[ \t]*%%sep\b.*$/gmi, (line) => {
    replaced = true;
    const len = String(line || "").length;
    if (len <= 0) return "%";
    return `%${" ".repeat(Math.max(0, len - 1))}`;
  });
  return { text: stripped, replaced };
}

function parseBarToken(rawToken) {
  const raw = String(rawToken || "");
  const digitMatch = raw.match(/(\d+)$/);
  const voltaNumber = digitMatch ? Number(digitMatch[1]) : null;
  const rawNoDigits = digitMatch ? raw.slice(0, raw.length - digitMatch[1].length) : raw;

  let normalized = rawNoDigits
    .replace(/[\[\]]/g, "|")
    .replace(/\./g, "|");
  normalized = normalized.replace(/\|+/g, "|");

  const isCombined = normalized === "::" || (/^:.*:$/.test(normalized) && normalized.includes("|"));
  const startMulti = normalized.match(/^\|(:{2,})/);
  const endMulti = normalized.match(/(:{2,})\|$/);

  const repeatCountStart = startMulti ? (startMulti[1].length + 1) : 0;
  const repeatCountEnd = endMulti ? (endMulti[1].length + 1) : 0;

  const isRepeatStart = isCombined || normalized.includes("|:") || repeatCountStart > 0;
  const isRepeatEnd = isCombined || normalized.includes(":|") || repeatCountEnd > 0;

  const isFirstEnding = voltaNumber === 1
    && /(?:\||\[|:)/.test(rawNoDigits);
  const isSecondEnding = voltaNumber === 2
    && /(?:\||\[|:)/.test(rawNoDigits);

  return {
    raw,
    rawNoDigits,
    normalized,
    voltaNumber: Number.isFinite(voltaNumber) ? voltaNumber : null,
    isCombined,
    isRepeatStart,
    isRepeatEnd,
    repeatCountStart,
    repeatCountEnd,
    isFirstEnding,
    isSecondEnding,
  };
}

function normalizeBarToken(token) {
  if (!token) return "";
  const info = parseBarToken(token);
  if (info.isRepeatStart || info.isRepeatEnd || info.isFirstEnding || info.isSecondEnding) {
    return "|";
  }
  return token;
}

function hasRepeatTokens(text) {
  return /(\|\:|\:\||::|\|\s*\d+|\[\s*\d+)/.test(String(text || ""));
}

function shouldForceRepeatExpansionForPlayback(text) {
  const src = String(text || "");
  // abc2svg/abcplay can behave unpredictably on some complex repeat barlines; expand for deterministic playback.
  return /(\|:::|:::\||\|::|::\||::)/.test(src);
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
  let repeatStart = null; // { idx, times }
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
    const info = parseBarToken(token);

    if (repeatStart != null && info.isFirstEnding) {
      firstEndStart = i;
      continue;
    }
    if (repeatStart != null && info.isSecondEnding) {
      secondEndStart = i;
      continue;
    }
    if (repeatStart != null && info.isRepeatEnd) {
      const repeatEnd = i;
      const times = Math.max(2, info.repeatCountEnd || (repeatStart && repeatStart.times) || 2);
      const repeatStartIdx = repeatStart ? repeatStart.idx : null;
      if (repeatStartIdx != null) {
        if (firstEndStart != null && secondEndStart != null && times === 2) {
          const partA = bars.slice(repeatStartIdx, firstEndStart);
          const partB = bars.slice(firstEndStart, secondEndStart);
          const partC = bars.slice(secondEndStart, repeatEnd);
          emitBars(partA);
          emitBars(partB);
          emitBars(partA);
          emitBars(partC);
        } else {
          const part = bars.slice(repeatStartIdx, repeatEnd);
          for (let rep = 0; rep < times; rep += 1) emitBars(part);
        }
      }

      repeatStart = null;
      firstEndStart = null;
      secondEndStart = null;
      if (info.isRepeatStart) {
        repeatStart = { idx: i, times: info.repeatCountStart || 2 };
        continue;
      }
      continue;
    }
    if (info.isRepeatStart) {
      repeatStart = { idx: i, times: info.repeatCountStart || 2 };
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

let pendingRenderTimer = null;
let pendingRenderRaf = null;
let renderRequestToken = 0;
let renderBusy = false;

function setRenderBusy(next) {
  renderBusy = Boolean(next);
  try {
    if ($renderPane) $renderPane.classList.toggle("is-rendering", renderBusy);
  } catch {}
}

function scheduleRenderNow({ delayMs = 0, clearOutput = false } = {}) {
  if (rawMode) return;
  renderRequestToken += 1;
  const token = renderRequestToken;
  if (pendingRenderTimer) {
    clearTimeout(pendingRenderTimer);
    pendingRenderTimer = null;
  }
  if (pendingRenderRaf) {
    cancelAnimationFrame(pendingRenderRaf);
    pendingRenderRaf = null;
  }

  if (clearOutput) {
    try {
      setStatus("Rendering…");
      setRenderBusy(true);
    } catch {}
  }

  const run = () => {
    if (token !== renderRequestToken) return;
    renderNow();
  };

  if (delayMs > 0) {
    pendingRenderTimer = setTimeout(() => {
      pendingRenderTimer = null;
      pendingRenderRaf = requestAnimationFrame(() => {
        pendingRenderRaf = null;
        run();
      });
    }, delayMs);
    return;
  }

  pendingRenderRaf = requestAnimationFrame(() => {
    pendingRenderRaf = null;
    run();
  });
}

function renderNow() {
  clearNoteSelection();
  clearErrors();
  setRenderBusy(true);
  const currentText = getEditorValue();
  if (!currentText.trim()) {
    setStatus("Ready");
    setRenderBusy(false);
    updateLibraryErrorIndexFromCurrentErrors();
    reconcileActiveErrorHighlightAfterRender({ renderSucceeded: true });
    return;
  }
  const renderPayload = getRenderPayload();
  if (!assertCleanAbcText(renderPayload.text, "renderNow")) {
    logErr("ABC text corruption detected (render).");
    setStatus("Error");
    setRenderBusy(false);
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
      setRenderBusy(true);
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
        const meterWarn = detectMeterMismatchInBarlines(renderText);
        if (meterWarn && meterWarn.detail) {
          addError(`Warning: Meter mismatch: ${meterWarn.detail}`, meterWarn.loc || null, { skipMeasureRange: true });
        }
        const repeatWarn = detectRepeatMarkerAfterShortBar(renderText);
        if (repeatWarn && repeatWarn.detail) {
          addError(`Warning: ${repeatWarn.detail}`, repeatWarn.loc || null, { skipMeasureRange: true });
        }

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
          if (!isPlaybackBusy() && transportJumpHighlightActive && Number.isFinite(anchor)) {
            try {
              highlightSvgPracticeBarAtEditorOffset(anchor);
            } catch {}
          }
        }
        if (sepFallbackUsed) {
          setBufferStatus("Note: %%sep ignored for rendering.");
        }
        setStatus("OK");
        setRenderBusy(false);
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
    setRenderBusy(false);
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
initPlaybackAutoScrollListeners();
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

const fileOpQueues = new Map();

function normalizeFileOpKey(filePath) {
  const raw = String(filePath || "");
  const normalized = normalizeLibraryPath(raw);
  return normalized || raw;
}

async function withFileLock(filePath, operation) {
  const key = normalizeFileOpKey(filePath);
  if (!key) return operation();
  const prev = fileOpQueues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(operation);
  const tail = next.finally(() => {
    if (fileOpQueues.get(key) === tail) fileOpQueues.delete(key);
  });
  fileOpQueues.set(key, tail);
  return tail;
}

async function withFileLocks(filePaths, operation) {
  const list = Array.from(new Set((filePaths || []).map((p) => normalizeFileOpKey(p)).filter(Boolean)));
  if (!list.length) return operation();
  list.sort((a, b) => a.localeCompare(b));
  let chained = operation;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    const prevFn = chained;
    chained = () => withFileLock(p, prevFn);
  }
  return chained();
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

function updateLibraryAfterSave(filePath, startOffset, oldEndOffset, newEndOffset, deltaLen, deltaLines, newLineCount, updatedTuneMeta) {
  if (!libraryIndex) return;
  const fileEntry = libraryIndex.files.find((f) => pathsEqual(f.path, filePath));
  if (!fileEntry) return;

  for (const tune of fileEntry.tunes) {
    if (tune.startOffset === startOffset && tune.endOffset === oldEndOffset) {
      tune.endOffset = newEndOffset;
      tune.endLine = tune.startLine + newLineCount - 1;
      if (updatedTuneMeta && typeof updatedTuneMeta === "object") {
        if (updatedTuneMeta.xNumber != null) tune.xNumber = updatedTuneMeta.xNumber;
        if (updatedTuneMeta.title != null) tune.title = updatedTuneMeta.title;
        if (updatedTuneMeta.composer != null) tune.composer = updatedTuneMeta.composer;
        if (updatedTuneMeta.key != null) tune.key = updatedTuneMeta.key;
        if (updatedTuneMeta.preview != null) tune.preview = updatedTuneMeta.preview;
      }
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

  libraryViewStore.invalidate();
  scheduleRenderLibraryTree();
  markActiveTuneButton(activeTuneId);
  updateLibraryStatus();
  scheduleSaveLibraryUiState();
}

async function saveActiveTuneToSource() {
  if (!activeTuneMeta || !activeTuneMeta.path) {
    return { ok: false, error: "No active tune to save." };
  }
  const filePath = activeTuneMeta.path;
  return withFileLock(filePath, async () => {
    let content = getFileContentFromCache(filePath);
    if (content == null) {
      const res = await readFile(filePath);
      if (!res.ok) return res;
      content = res.data;
      setFileContentInCache(filePath, content);
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
    const updatedIdentity = parseTuneIdentityFields(newText);
    const updated = content.slice(0, startOffset) + newText + content.slice(endOffset);
    const res = await writeFile(filePath, updated);
    if (!res.ok) return res;

    setFileContentInCache(filePath, updated);
    const deltaLen = newText.length - (endOffset - startOffset);
    const oldLineCount = countLines(oldText);
    const newLineCount = countLines(newText);
    const deltaLines = newLineCount - oldLineCount;
    const newEndOffset = startOffset + newText.length;

    updateLibraryAfterSave(filePath, startOffset, endOffset, newEndOffset, deltaLen, deltaLines, newLineCount, updatedIdentity);

    activeTuneMeta.endOffset = newEndOffset;
    activeTuneMeta.endLine = activeTuneMeta.startLine + newLineCount - 1;
    if (updatedIdentity && typeof updatedIdentity === "object") {
      if (updatedIdentity.xNumber != null) activeTuneMeta.xNumber = updatedIdentity.xNumber;
      if (updatedIdentity.title != null) activeTuneMeta.title = updatedIdentity.title;
      if (updatedIdentity.composer != null) activeTuneMeta.composer = updatedIdentity.composer;
      if (updatedIdentity.key != null) activeTuneMeta.key = updatedIdentity.key;
      setTuneMetaText(buildTuneMetaLabel(activeTuneMeta));
    }
    return { ok: true };
  });
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

async function buildDebugDumpSnapshot({ reason = "" } = {}) {
  let aboutInfo = null;
  if (window.api && typeof window.api.getAboutInfo === "function") {
    try { aboutInfo = await window.api.getAboutInfo(); } catch {}
  }

  const ctxPath = (activeTuneMeta && activeTuneMeta.path)
    ? activeTuneMeta.path
    : (currentDoc && currentDoc.path ? currentDoc.path : null);
  const ctxBasename = (activeTuneMeta && activeTuneMeta.basename)
    ? activeTuneMeta.basename
    : (ctxPath ? safeBasename(ctxPath) : null);
  const ctxX = (activeTuneMeta && activeTuneMeta.xNumber != null) ? activeTuneMeta.xNumber : null;
  const ctxTitle = (activeTuneMeta && activeTuneMeta.title) ? activeTuneMeta.title : null;
  const ctxId = (activeTuneMeta && activeTuneMeta.id) ? activeTuneMeta.id : null;
  const ctxLabel = (() => {
    const filePart = ctxBasename || (ctxPath ? safeBasename(ctxPath) : "");
    const xPart = ctxX != null ? `X:${ctxX}` : "";
    const titlePart = ctxTitle ? String(ctxTitle).trim() : "";
    const mid = [xPart, titlePart].filter(Boolean).join(" ");
    return [filePart, mid].filter(Boolean).join(" — ").trim() || null;
  })();

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
    reason: reason ? String(reason) : null,
    context: {
      label: ctxLabel,
      filePath: ctxPath,
      fileBasename: ctxBasename,
      tuneId: ctxId,
      xNumber: ctxX,
      title: ctxTitle,
    },
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
      preferredVoiceId: playbackState ? (playbackState.preferredVoiceId || null) : null,
      preferredVoiceIndex: playbackState && Number.isFinite(playbackState.preferredVoiceIndex) ? playbackState.preferredVoiceIndex : null,
      voiceTimelineKeys: (playbackState && playbackState.voiceTimeline) ? {
        byId: (playbackState.voiceTimeline.byId && typeof playbackState.voiceTimeline.byId === "object")
          ? Object.keys(playbackState.voiceTimeline.byId).slice(0, 50)
          : [],
        byIndex: (playbackState.voiceTimeline.byIndex && typeof playbackState.voiceTimeline.byIndex === "object")
          ? Object.keys(playbackState.voiceTimeline.byIndex).slice(0, 50)
          : [],
      } : null,
      practiceTempoMultiplier: Number.isFinite(Number(practiceTempoMultiplier)) ? Number(practiceTempoMultiplier) : null,
      playbackLoop: {
        enabled: Boolean(playbackLoopEnabled),
        fromMeasure: clampInt(playbackLoopFromMeasure, 0, 100000, 0),
        toMeasure: clampInt(playbackLoopToMeasure, 0, 100000, 0),
      },
      soundfontName: soundfontName || null,
      soundfontSource: soundfontSource || null,
      soundfontReadyName: soundfontReadyName || null,
      lastSoundfontApplied: lastSoundfontApplied || null,
      playbackIndexOffset,
      playbackRange: clonePlaybackRange(playbackRange),
      activePlaybackRange: activePlaybackRange ? clonePlaybackRange(activePlaybackRange) : null,
      activePlaybackEndAbcOffset,
      lastStartPlaybackIdx,
      resumeStartIdx,
      desiredPlayerSpeed: Number.isFinite(Number(desiredPlayerSpeed)) ? Number(desiredPlayerSpeed) : null,
      currentPlaybackPlan,
      pendingPlaybackPlan,
      lastPlaybackGuardMessage,
      lastPlaybackAbortMessage,
      payload: playbackPayload,
      debugState: playbackDebug && typeof playbackDebug.getState === "function" ? playbackDebug.getState() : null,
      timeline: playbackDebug && typeof playbackDebug.getTimeline === "function" ? playbackDebug.getTimeline() : null,
      trace: playbackDebug && typeof playbackDebug.getTrace === "function" ? playbackDebug.getTrace() : playbackNoteTrace.slice(),
      parseErrors: Array.isArray(playbackParseErrors) ? playbackParseErrors.slice(0, 200) : null,
      sanitizeWarnings: Array.isArray(playbackSanitizeWarnings) ? playbackSanitizeWarnings.slice(0, 200) : null,
      drumSignatureDiff: lastDrumSignatureDiff,
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
    let suggestedDir = computeSuggestedDebugDumpDir();
    if (suggestedDir) {
      const res = await mkdirp(suggestedDir);
      if (!res || !res.ok) {
        suggestedDir = activeTuneMeta && activeTuneMeta.path ? safeDirname(activeTuneMeta.path) : "";
      }
    }
    const filePath = filePathArg || (await showSaveDialog(suggested, suggestedDir));
    if (!filePath) return { ok: false, cancelled: true };
    return await writeDebugDumpSnapshotToPath(filePath, { silent: false, reason: "manual" });
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

function closeXIssuesModal() {
  if (!$xIssuesModal) return;
  $xIssuesModal.classList.remove("open");
  $xIssuesModal.setAttribute("aria-hidden", "true");
  pendingXIssuesFilePath = null;
  pendingXIssuesTuneId = null;
}

function formatXIssuesReport(fileEntry) {
  const label = fileEntry && (fileEntry.basename || safeBasename(fileEntry.path))
    ? (fileEntry.basename || safeBasename(fileEntry.path))
    : "";
  const issues = fileEntry && fileEntry.xIssues ? fileEntry.xIssues : null;
  if (!issues || issues.ok) {
    return `File: ${label}\n\nNo X issues detected.`;
  }

  const tunes = Array.isArray(fileEntry.tunes) ? fileEntry.tunes : [];
  const invalidLines = tunes
    .filter((t) => !(t && t.xNumber && String(t.xNumber).trim()))
    .map((t) => t.startLine)
    .filter((n) => Number.isFinite(n));

  const dupLines = new Map();
  if (issues.duplicates && typeof issues.duplicates === "object") {
    for (const tune of tunes) {
      const x = tune && tune.xNumber != null ? String(tune.xNumber) : "";
      if (!x) continue;
      if (!Object.prototype.hasOwnProperty.call(issues.duplicates, x)) continue;
      if (!dupLines.has(x)) dupLines.set(x, []);
      dupLines.get(x).push(tune.startLine);
    }
  }

  const lines = [];
  lines.push(`File: ${label}`);
  lines.push("");
  lines.push("X issues:");
  if (invalidLines.length) {
    const shown = invalidLines.slice(0, 30);
    const more = invalidLines.length - shown.length;
    lines.push(`- Invalid/empty X at tune start lines: ${shown.join(", ")}${more > 0 ? ` (+${more} more)` : ""}`);
  }
  if (dupLines.size) {
    const keys = Array.from(dupLines.keys()).sort((a, b) => a.localeCompare(b));
    const shownKeys = keys.slice(0, 20);
    for (const x of shownKeys) {
      const locs = (dupLines.get(x) || []).filter((n) => Number.isFinite(n));
      const shown = locs.slice(0, 20);
      const more = locs.length - shown.length;
      lines.push(`- Duplicate X:${x} at lines: ${shown.join(", ")}${more > 0 ? ` (+${more} more)` : ""}`);
    }
    if (keys.length > shownKeys.length) lines.push(`- Duplicate X: (+${keys.length - shownKeys.length} more values)`);
  }
  if (!invalidLines.length && !dupLines.size) {
    lines.push("- (No details available; re-parse the file to compute locations.)");
  }

  return lines.join("\n");
}

function computeFirstXIssueTuneId(fileEntry) {
  const tunes = Array.isArray(fileEntry && fileEntry.tunes) ? fileEntry.tunes : [];
  const invalid = tunes.find((t) => !(t && t.xNumber && String(t.xNumber).trim()));
  if (invalid && invalid.id) return invalid.id;
  const issues = fileEntry && fileEntry.xIssues ? fileEntry.xIssues : null;
  if (issues && issues.duplicates && typeof issues.duplicates === "object") {
    const dupX = Object.keys(issues.duplicates)[0] || "";
    if (dupX) {
      const dupTune = tunes.find((t) => String((t && t.xNumber) || "") === dupX);
      if (dupTune && dupTune.id) return dupTune.id;
    }
  }
  return null;
}

async function openXIssuesModalForFile(filePath) {
  if (!$xIssuesModal || !$xIssuesInfo) return;
  if (!filePath) return;
  const entry = libraryIndex && Array.isArray(libraryIndex.files)
    ? libraryIndex.files.find((f) => pathsEqual(f.path, filePath))
    : null;
  if (!entry) return;

  let fileEntry = entry;
  if ((!fileEntry.tunes || !fileEntry.tunes.length) && window.api && typeof window.api.parseLibraryFile === "function") {
    const updated = await refreshLibraryFile(filePath);
    if (updated) fileEntry = updated;
  }

  pendingXIssuesFilePath = filePath;
  pendingXIssuesTuneId = computeFirstXIssueTuneId(fileEntry);
  $xIssuesInfo.textContent = formatXIssuesReport(fileEntry);
  $xIssuesModal.classList.add("open");
  $xIssuesModal.setAttribute("aria-hidden", "false");
}

let libraryListYieldedByThisOpen = false;
let libraryTreeHintToastShown = false;
document.addEventListener("library-modal:closed", () => {
  if (!libraryListYieldedByThisOpen) return;
  document.body.classList.remove("library-list-open");
  libraryListYieldedByThisOpen = false;
});

document.addEventListener("set-list:add", (ev) => {
  try {
    const row = ev && ev.detail && ev.detail.row ? ev.detail.row : null;
    if (!row) return;
    const tuneId = row && row.tuneId ? String(row.tuneId) : "";
    addTuneToSetListByTuneId(tuneId, { fallbackTitle: row.title, fallbackComposer: row.composer }).then(() => {
      showToast("Added to Set List.", 2000);
      if ($setListModal && $setListModal.classList.contains("open")) renderSetList();
    }).catch((e) => {
      showToast(e && e.message ? e.message : String(e), 5000);
    });
  } catch {}
});

function openLibraryListFromCurrentLibraryIndex() {
  if (!libraryIndex || !libraryIndex.root || !Array.isArray(libraryIndex.files) || !libraryIndex.files.length) {
    setStatus("Load a library folder first.");
    return false;
  }
  if (!window.openLibraryModal) return false;

  const rows = libraryViewStore.getModalRows();
  if (!hasFullLibraryIndex()) {
    ensureFullLibraryIndex({ reason: "library list" }).catch(() => {});
  }

  if (!isLibraryVisible && !libraryTreeHintToastShown) {
    libraryTreeHintToastShown = true;
    showToast("Tip: Library Tree is hidden. Click Library or press Ctrl+L.", 4200);
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

function renderSetList() {
  if (!$setListEmpty || !$setListItems) return;
  const hasItems = Array.isArray(setListItems) && setListItems.length > 0;
  $setListEmpty.hidden = hasItems;
  $setListItems.hidden = !hasItems;

  $setListItems.textContent = "";
  if (hasItems) {
    for (let i = 0; i < setListItems.length; i++) {
      const item = setListItems[i] || {};
      const row = document.createElement("div");
      row.className = "set-list-row";
      row.draggable = true;
      row.dataset.index = String(i);

      const idx = document.createElement("div");
      idx.className = "set-list-idx";
      idx.textContent = String(i + 1);

      const title = document.createElement("div");
      title.className = "set-list-title";
      title.textContent = String(item.title || "Untitled");

      const meta = document.createElement("div");
      meta.className = "set-list-meta";
      meta.textContent = item.composer ? String(item.composer) : "";

      const actions = document.createElement("div");
      actions.className = "set-list-actions";
      const upDisabled = i === 0;
      const downDisabled = i === setListItems.length - 1;
      actions.innerHTML = `
        <button type="button" class="set-list-btn" data-action="up" data-index="${i}" aria-label="Move up" ${upDisabled ? "disabled" : ""}>↑</button>
        <button type="button" class="set-list-btn" data-action="down" data-index="${i}" aria-label="Move down" ${downDisabled ? "disabled" : ""}>↓</button>
        <button type="button" class="set-list-btn" data-action="remove" data-index="${i}" aria-label="Remove">✕</button>
      `;

      row.append(idx, title, meta, actions);
      $setListItems.append(row);
    }
  }

  if ($setListPageBreaks) $setListPageBreaks.value = setListPageBreaks;
  if ($setListCompact) $setListCompact.checked = !!setListCompact;

  const disableActions = !hasItems;
  if ($setListClear) $setListClear.disabled = disableActions;
  if ($setListSaveAbc) $setListSaveAbc.disabled = disableActions;
  if ($setListExportPdf) $setListExportPdf.disabled = disableActions;
  if ($setListPrint) $setListPrint.disabled = disableActions;
}

function openSetList() {
  if (!$setListModal) return;
  renderSetList();
  $setListModal.classList.add("open");
  $setListModal.setAttribute("aria-hidden", "false");
  if ($setListPageBreaks) $setListPageBreaks.focus();
}

function closeSetList() {
  if (!$setListModal) return;
  $setListModal.classList.remove("open");
  $setListModal.setAttribute("aria-hidden", "true");
}

function openSetListHeaderEditor() {
  if (!$setListHeaderModal || !$setListHeaderText) return;
  $setListHeaderText.value = String(setListHeaderText || "");
  $setListHeaderModal.classList.add("open");
  $setListHeaderModal.setAttribute("aria-hidden", "false");
  $setListHeaderText.focus();
}

function closeSetListHeaderEditor() {
  if (!$setListHeaderModal) return;
  $setListHeaderModal.classList.remove("open");
  $setListHeaderModal.setAttribute("aria-hidden", "true");
}

function moveSetListItem(fromIndex, toIndex) {
  if (!Array.isArray(setListItems)) setListItems = [];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return;
  if (from < 0 || from >= setListItems.length) return;
  if (to < 0 || to >= setListItems.length) return;
  if (from === to) return;
  const next = setListItems.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  setListItems = next;
  scheduleSaveSetList();
}

function removeSetListItem(index) {
  if (!Array.isArray(setListItems)) setListItems = [];
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0 || idx >= setListItems.length) return;
  const next = setListItems.slice();
  next.splice(idx, 1);
  setListItems = next;
  scheduleSaveSetList();
}

function insertSetListItemAt(item, index) {
  if (!item) return;
  if (!Array.isArray(setListItems)) setListItems = [];
  const idx = Number(index);
  const next = setListItems.slice();
  if (!Number.isFinite(idx) || idx < 0 || idx >= next.length) {
    next.push(item);
  } else {
    next.splice(idx, 0, item);
  }
  setListItems = next;
  scheduleSaveSetList();
}

function shouldInjectNewPageBeforeTune(tuneText, { mode, idx }) {
  if (idx <= 0) return false;
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

async function addTuneToSetListByTuneId(
  tuneId,
  { fallbackTitle = "", fallbackComposer = "", insertIndex = null } = {}
) {
  const id = String(tuneId || "").trim();
  if (!id) throw new Error("Missing tune id.");

  if (currentDoc && currentDoc.dirty && activeTuneId && id === activeTuneId) {
    const choice = await confirmUnsavedChanges("adding this tune to Set List");
    if (choice === "cancel") return;
    if (choice === "save") {
      const ok = await performSaveFlow();
      if (!ok) return;
    }
  }

  const res = findTuneById(id);
  if (!res) throw new Error("Tune not found in library.");

  const readRes = await readFile(res.file.path);
  if (!readRes || !readRes.ok) throw new Error(readRes && readRes.error ? readRes.error : "Unable to read file.");
  const content = String(readRes.data || "");
  const entryHeader = (activeFilePath && pathsEqual(activeFilePath, res.file.path))
    ? getHeaderEditorValue()
    : (res.file.headerText || "");

  const startOffset = Number(res.tune.startOffset);
  const endOffset = Number(res.tune.endOffset);
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset < 0 || endOffset <= startOffset || endOffset > content.length) {
    throw new Error("Refusing to add: tune offsets look stale. Refresh the library and try again.");
  }
  const slice = content.slice(startOffset, endOffset);
  const trimmed = slice.replace(/^\s+/, "");
  const xMatch = trimmed.match(/^X:\s*(\d+)/);
  if (!xMatch) {
    throw new Error("Refusing to add: tune offsets look stale. Refresh the library and try again.");
  }
  const expectedX = String(res.tune.xNumber || "");
  if (expectedX && xMatch[1] !== expectedX) {
    throw new Error(`Refusing to add: tune offsets look stale (expected X:${expectedX}). Refresh the library and try again.`);
  }

  const entryId = `${id}::${Date.now()}::${Math.random().toString(16).slice(2)}`;
  const newItem = {
    id: entryId,
    sourceTuneId: id,
    sourcePath: res.file.path,
    xNumber: res.tune.xNumber || "",
    title: res.tune.title || fallbackTitle || "",
    composer: res.tune.composer || fallbackComposer || "",
    headerText: entryHeader,
    text: slice,
    addedAtMs: Date.now(),
  };
  insertSetListItemAt(newItem, insertIndex);
}

function buildSetListExportAbc() {
  if (!Array.isArray(setListItems) || setListItems.length === 0) return "";
  let out = "";
  const fileHeader = getSetListFileHeaderText();
  if (fileHeader.trim()) out = `${fileHeader}\n`;

  for (let i = 0; i < setListItems.length; i++) {
    const item = setListItems[i] || {};
    const raw = String(item.text || "");
    if (!raw.trim()) continue;

    let tune = raw;
    const inject = shouldInjectNewPageBeforeTune(tune, { mode: setListPageBreaks, idx: i });
    if (inject) tune = `%%newpage\n${tune}`;

    tune = ensureXNumberInAbc(tune, i + 1);
    out = appendTuneToContent(out, tune);
  }
  return out;
}

async function exportSetListAsAbc() {
  if (!Array.isArray(setListItems) || setListItems.length === 0) return;
  const base = getSuggestedBaseName();
  const suggestedName = `${base ? `${base}-` : ""}set-list.abc`;
  const suggestedDir = getDefaultSaveDir();
  const filePath = await showSaveDialog(suggestedName, suggestedDir);
  if (!filePath) return;
  const content = buildSetListExportAbc();
  if (!content.trim()) {
    showToast("Nothing to export.", 2400);
    return;
  }
  const ok = await withFileLock(filePath, async () => {
    const res = await writeFile(filePath, content);
    if (res && res.ok) return true;
    await showSaveError((res && res.error) ? res.error : "Unable to export set list.");
    return false;
  });
  if (ok) showToast("Exported.", 2400);
}

if ($xIssuesClose) {
  $xIssuesClose.addEventListener("click", () => closeXIssuesModal());
}
if ($xIssuesCopy) {
  $xIssuesCopy.addEventListener("click", async () => {
    try {
      if (!$xIssuesInfo) return;
      const text = String($xIssuesInfo.textContent || "");
      if (text && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("Copied.");
      }
    } catch {}
  });
}
if ($xIssuesJump) {
  $xIssuesJump.addEventListener("click", async () => {
    const filePath = pendingXIssuesFilePath;
    const tuneId = pendingXIssuesTuneId;
    closeXIssuesModal();
    if (!filePath) return;
    try {
      const ok = await requestLoadLibraryFile(filePath);
      if (!ok) return;
      if (tuneId) {
        await selectTune(tuneId, { skipConfirm: true });
      }
    } catch {}
  });
}

if ($xIssuesAutoFix) {
  $xIssuesAutoFix.addEventListener("click", async () => {
    const filePath = pendingXIssuesFilePath;
    closeXIssuesModal();
    if (!filePath) return;
    try {
      await renumberXInActiveFile(filePath);
      const entry = libraryIndex && Array.isArray(libraryIndex.files)
        ? libraryIndex.files.find((f) => pathsEqual(f.path, filePath))
        : null;
      const hasIssues = Boolean(entry && entry.xIssues && entry.xIssues.ok === false);
      if (hasIssues) {
        await openXIssuesModalForFile(filePath);
      } else {
        showToast("Renumbered X.");
      }
    } catch {}
  });
}

if ($xIssuesModal) {
  $xIssuesModal.addEventListener("click", (e) => {
    if (e.target === $xIssuesModal) closeXIssuesModal();
  });
  $xIssuesModal.addEventListener("keydown", (e) => {
    if (!e) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeXIssuesModal();
  });
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
    let transformed = transformLengthScaling(abcText, mode);
    if (latestSettingsSnapshot && latestSettingsSnapshot.autoAlignBarsAfterTransforms) {
      transformed = alignBarsInText(transformed);
    }
    applyTransformedText(transformed);
    setStatus("OK");
    return;
  }
  const hasOnlyMeasuresPerLine = options.measuresPerLine
    && options.transposeSemitones == null
    && !options.voice
    && options.renumberX == null
    && !options.doubleLengths
    && !options.halfLengths;
  if (hasOnlyMeasuresPerLine) {
    let transformed = transformMeasuresPerLine(abcText, options.measuresPerLine);
    transformed = normalizeMeasuresLineBreaks(transformed);
    if (latestSettingsSnapshot && latestSettingsSnapshot.autoAlignBarsAfterTransforms) {
      transformed = alignBarsInText(transformed);
      transformed = normalizeMeasuresLineBreaks(transformed);
    }
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
    const preferNative = !latestSettingsSnapshot || latestSettingsSnapshot.useNativeTranspose !== false;
    if (preferNative) {
      try {
        const entry = getActiveFileEntry();
        const headerText = buildHeaderPrefix(entry ? entry.headerText : "", false, abcText).text;
        const transformed = transformTranspose(abcText, Number(options.transposeSemitones), { headerText });
        const aligned = alignBarsInText(transformed);
        applyTransformedText(aligned);
        setStatus("OK");
        return;
      } catch (e) {
        logErr(`Native transpose failed.\n\n${(e && e.stack) ? e.stack : String(e)}`);
      }
    }
  }
  // Remaining combinations previously supported by abc2abc are intentionally not implemented here.
  // Keep strict-write behavior: refuse rather than risk corrupting data.
  await showSaveError("This transform combination is not supported.");
  setStatus("Error");
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

  const ok = rawMode ? await performRawSaveFlow() : await performSaveFlow();
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

  if (isNewTuneDraft && activeFilePath) {
    const ok = await performAppendFlow();
    return Boolean(ok);
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
    const filePath = currentDoc.path;
    const content = serializeDocument(currentDoc);
    return withFileLock(filePath, async () => {
      const res = await writeFile(filePath, content);
      if (res.ok) {
        setFileContentInCache(filePath, content);
        currentDoc.dirty = false;
        setDirtyIndicator(false);
        setFileNameMeta(stripFileExtension(safeBasename(filePath)));
        updateFileHeaderPanel();
        return true;
      }
      await showSaveError(res.error || "Unable to save file.");
      return false;
    });
  }

  return performSaveAsFlow();
}

async function performSaveAsFlow() {
  if (!currentDoc) return false;

  const suggestedName = `${getSuggestedBaseName()}.abc`;
  const suggestedDir = getDefaultSaveDir();
  const filePath = await showSaveDialog(suggestedName, suggestedDir);
  if (!filePath) return false;

  const content = serializeDocument(currentDoc);
  return withFileLock(filePath, async () => {
    const res = await writeFile(filePath, content);
    if (res.ok) {
      currentDoc.path = filePath;
      currentDoc.dirty = false;
      activeFilePath = filePath;
      setFileContentInCache(filePath, content);

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
  });
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

async function refreshLibraryFile(filePath, options) {
  if (!window.api || typeof window.api.parseLibraryFile !== "function") return null;
  const res = await window.api.parseLibraryFile(filePath, options);
  if (!res || !res.files || !res.files.length) return null;
  const updatedFile = res.files[0];
  if (!libraryIndex) {
    libraryIndex = { root: res.root, files: [updatedFile] };
    libraryViewStore.invalidate();
  } else {
    const idx = libraryIndex.files.findIndex((f) => pathsEqual(f.path, updatedFile.path));
    if (idx >= 0) libraryIndex.files[idx] = updatedFile;
    else libraryIndex.files.push(updatedFile);
    libraryViewStore.invalidate();
  }
  renderLibraryTree();
  updateFileContext();
  updateFileHeaderPanel();
  return updatedFile;
}

async function renameLibraryFile(oldPath, newPath) {
  if (!window.api || typeof window.api.parseLibraryFile !== "function") return null;
  const res = await window.api.parseLibraryFile(newPath);
  if (!res || !res.files || !res.files.length) return null;
  const updatedFile = res.files[0];
  if (!libraryIndex) {
    libraryIndex = { root: res.root, files: [updatedFile] };
    libraryViewStore.invalidate();
  } else {
    libraryIndex.files = (libraryIndex.files || []).filter((f) => !pathsEqual(f.path, oldPath));
    libraryIndex.files.push(updatedFile);
    libraryViewStore.invalidate();
  }

  if (fileContentCache.has(oldPath)) {
    const cached = getFileContentFromCache(oldPath);
    if (cached != null) {
      setFileContentInCache(newPath, cached);
      fileContentCache.delete(oldPath);
    }
  }

  if (pathsEqual(activeFilePath, oldPath)) activeFilePath = newPath;

  if (activeTuneMeta && pathsEqual(activeTuneMeta.path, oldPath)) {
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
  updateFileHeaderPanel();
  return updatedFile;
}

async function saveFileHeaderText(filePath, headerText) {
  return withFileLock(filePath, async () => {
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
    setFileContentInCache(filePath, updated);
    const updatedFile = await refreshLibraryFile(filePath);
    if (activeTuneMeta && pathsEqual(activeTuneMeta.path, filePath)) {
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
  });
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
  let content = getFileContentFromCache(fileMeta.path);
  if (content == null) {
    const res = await readFile(fileMeta.path);
    if (!res.ok) throw new Error(res.error || "Unable to read file.");
    content = res.data;
    setFileContentInCache(fileMeta.path, content);
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
    const updated = await withFileLock(res.file.path, async () => {
      const readRes = await readFile(res.file.path);
      if (!readRes || !readRes.ok) throw new Error(readRes && readRes.error ? readRes.error : "Unable to read file.");
      const content = String(readRes.data || "");
      const startOffset = Number(res.tune.startOffset);
      const endOffset = Number(res.tune.endOffset);
      if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset < 0 || endOffset <= startOffset || endOffset > content.length) {
        throw new Error("Refusing to duplicate: tune offsets look stale. Refresh the library and try again.");
      }
      const slice = content.slice(startOffset, endOffset);
      const trimmed = slice.replace(/^\s+/, "");
      const xMatch = trimmed.match(/^X:\s*(\d+)/);
      if (!xMatch) {
        throw new Error("Refusing to duplicate: tune offsets look stale. Refresh the library and try again.");
      }
      const expectedX = String(res.tune.xNumber || "");
      if (expectedX && xMatch[1] !== expectedX) {
        throw new Error(`Refusing to duplicate: tune offsets look stale (expected X:${expectedX}). Refresh the library and try again.`);
      }

      const prepared = ensureCopyTitleInAbc(slice);
      const nextX = getNextXNumber(content);
      const withX = ensureXNumberInAbc(prepared, nextX);
      const updatedContent = appendTuneToContent(content, withX);
      const writeRes = await writeFile(res.file.path, updatedContent);
      if (!writeRes || !writeRes.ok) throw new Error(writeRes && writeRes.error ? writeRes.error : "Unable to duplicate tune.");
      setFileContentInCache(res.file.path, updatedContent);
      const updatedFile = await refreshLibraryFile(res.file.path);
      return { updatedContent, updatedFile };
    });
    const updatedContent = updated ? updated.updatedContent : null;
    const updatedFile = updated ? updated.updatedFile : null;
    activeFilePath = res.file.path;
    if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
      const tune = updatedFile.tunes[updatedFile.tunes.length - 1];
      activeTuneId = tune.id;
      markActiveTuneButton(activeTuneId);
      const tuneText = updatedContent ? updatedContent.slice(tune.startOffset, tune.endOffset) : "";
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

async function appendTuneTextToFileUnlocked(filePath, text) {
  const res = await readFile(filePath);
  if (!res.ok) throw new Error(res.error || "Unable to read file.");
  const nextX = getNextXNumber(res.data || "");
  const prepared = ensureXNumberInAbc(text, nextX);
  const updated = appendTuneToContent(res.data || "", prepared);
  const writeRes = await writeFile(filePath, updated);
  if (!writeRes.ok) throw new Error(writeRes.error || "Unable to append to file.");
  setFileContentInCache(filePath, updated);
  return updated;
}

async function appendTuneTextToFile(filePath, text) {
  return withFileLock(filePath, async () => appendTuneTextToFileUnlocked(filePath, text));
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
    const sourceCandidate = clipboardTune && clipboardTune.mode === "move" ? clipboardTune.sourcePath : "";
    await withFileLocks([targetPath, sourceCandidate].filter(Boolean), async () => {
      if (clipboardTune.mode !== "move") {
        await appendTuneTextToFileUnlocked(targetPath, clipboardTune.text);
        await refreshLibraryFile(targetPath);
        activeFilePath = targetPath;
        return;
      }

      const found = findTuneById(clipboardTune.tuneId);
      if (!found || !found.file || !found.file.path) {
        throw new Error("Unable to move: source tune not found. Refresh the library and try again.");
      }
      const sourcePath = found.file.path;
      if (!sourcePath) throw new Error("Unable to move: source path missing.");

      const sourceRes = await readFile(sourcePath);
      if (!sourceRes.ok) throw new Error(sourceRes.error || "Unable to read source file.");
      const sourceContent = String(sourceRes.data || "");

      const targetRes = await readFile(targetPath);
      if (!targetRes.ok) throw new Error(targetRes.error || "Unable to read target file.");
      const targetContent = String(targetRes.data || "");

      const sourceSlice = sourceContent.slice(found.tune.startOffset, found.tune.endOffset);
      const expectedSlice = String(clipboardTune.text || "");
      if (sourceSlice !== expectedSlice) {
        throw new Error("Refusing to move: tune offsets look stale. Reload/refresh the library and try again.");
      }
      const trimmedSourceSlice = sourceSlice.replace(/^\s+/, "");
      const xMatch = trimmedSourceSlice.match(/^X:\s*(\d+)/);
      if (!xMatch) {
        throw new Error("Refusing to move: tune offsets look stale. Reload/refresh the library and try again.");
      }
      const expectedX = String(found.tune.xNumber || "");
      if (expectedX && xMatch[1] !== expectedX) {
        throw new Error(`Refusing to move: tune offsets look stale (expected X:${expectedX}). Reload/refresh the library and try again.`);
      }

      const updatedSource = removeTuneFromContent(sourceContent, found.tune.startOffset, found.tune.endOffset);
      const nextX = getNextXNumber(targetContent);
      const prepared = ensureXNumberInAbc(expectedSlice, nextX);
      const updatedTarget = appendTuneToContent(targetContent, prepared);

      const autoRenumber = !!(latestSettingsSnapshot && latestSettingsSnapshot.libraryAutoRenumberAfterMove === true);
      let finalTarget = updatedTarget;
      let finalSource = updatedSource;
      if (autoRenumber) {
        const renumTarget = renumberXInTextKeepingFirst(finalTarget);
        if (renumTarget && renumTarget.ok && typeof renumTarget.abcText === "string") {
          finalTarget = renumTarget.abcText;
        }
        const renumSource = renumberXInTextKeepingFirst(finalSource);
        if (renumSource && renumSource.ok && typeof renumSource.abcText === "string") {
          finalSource = renumSource.abcText;
        }
      }

      const writeTargetRes = await writeFile(targetPath, finalTarget);
      if (!writeTargetRes.ok) throw new Error(writeTargetRes.error || "Unable to update target file.");

      const writeSourceRes = await writeFile(sourcePath, finalSource);
      if (!writeSourceRes.ok) {
        const rollback = await writeFile(targetPath, targetContent);
        if (rollback && rollback.ok) {
          throw new Error(writeSourceRes.error || "Unable to update source file.");
        }
        throw new Error((writeSourceRes && writeSourceRes.error)
          ? `${writeSourceRes.error} (rollback failed; the tune may now be duplicated)`
          : "Unable to update source file (rollback failed; the tune may now be duplicated)");
      }

      setFileContentInCache(targetPath, finalTarget);
      setFileContentInCache(sourcePath, finalSource);
      await refreshLibraryFile(targetPath);
      await refreshLibraryFile(sourcePath);
      activeFilePath = targetPath;

      if (activeTuneId === clipboardTune.tuneId) {
        activeTuneId = null;
        activeTuneMeta = null;
        setCurrentDocument(createBlankDocument());
      }

      clipboardTune = null;
      setBufferStatus("");
    });
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

  await withFileLock(fileMeta.path, async () => {
    const res = await readFile(fileMeta.path);
    if (!res.ok) {
      await showSaveError(res.error || "Unable to read file.");
      return;
    }

    const content = String(res.data || "");
    const startOffset = Number(selected.startOffset);
    const endOffset = Number(selected.endOffset);
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset < 0 || endOffset <= startOffset || endOffset > content.length) {
      await showSaveError("Refusing to delete: tune offsets look stale. Refresh the library and try again.");
      return;
    }
    const slice = content.slice(startOffset, endOffset);
    const trimmed = slice.replace(/^\s+/, "");
    const xMatch = trimmed.match(/^X:\s*(\d+)/);
    if (!xMatch) {
      await showSaveError("Refusing to delete: tune offsets look stale. Reload the tune and try again.");
      return;
    }
    const expectedX = String(selected.xNumber || "");
    if (expectedX && xMatch[1] !== expectedX) {
      await showSaveError(`Refusing to delete: tune offsets look stale (expected X:${expectedX}). Refresh the library and try again.`);
      return;
    }

    const updated = removeTuneFromContent(content, startOffset, endOffset);
    const writeRes = await writeFile(fileMeta.path, updated);
    if (!writeRes.ok) {
      await showSaveError(writeRes.error || "Unable to delete tune.");
      return;
    }

    setFileContentInCache(fileMeta.path, updated);
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
  });
}

async function performAppendFlow() {
  const filePath = activeFilePath;
  if (!filePath) {
    await showSaveError("Select a target file in the Library panel first.");
    return false;
  }

  const confirm = await confirmAppendToFile(filePath);
  if (confirm !== "append") return false;

  return withFileLock(filePath, async () => {
    const res = await readFile(filePath);
    if (!res.ok) {
      await showSaveError(res.error || "Unable to read file.");
      return false;
    }

    const before = String(res.data || "");
    const verifyRes = await readFile(filePath);
    if (!verifyRes || !verifyRes.ok) {
      await showSaveError((verifyRes && verifyRes.error) ? verifyRes.error : "Unable to verify file before appending.");
      return false;
    }
    const verifyText = String(verifyRes.data || "");
    if (verifyText !== before) {
      await showSaveError("Refusing to append: file changed on disk. Refresh/reopen the file and try again.");
      return false;
    }

    const nextX = getNextXNumber(before);
    const prepared = ensureXNumberInAbc(serializeDocument(currentDoc), nextX);
    const updated = appendTuneToContent(before, prepared);
    const writeRes = await writeFile(filePath, updated);
    if (!writeRes.ok) {
      await showSaveError(writeRes.error || "Unable to append to file.");
      return false;
    }

    setFileContentInCache(filePath, updated);

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
  });
}

async function fileNew() {
  const ok = await ensureSafeToAbandonCurrentDoc("creating a new file");
  if (!ok) return;
  setActiveTuneText(NEW_FILE_MINIMAL_ABC, null, { markDirty: true });
}

async function fileNewFromTemplate() {
  const ok = await ensureSafeToAbandonCurrentDoc("creating a new tune");
  if (!ok) return;

  const targetPath = (activeTuneMeta && activeTuneMeta.path)
    ? String(activeTuneMeta.path)
    : (activeFilePath ? String(activeFilePath) : "");
  if (!targetPath) {
    setActiveTuneText(TEMPLATE_ABC, null, { markDirty: true });
    showToast("Template opened.", 1800);
    return;
  }

  let nextX = "";
  try {
    const res = await getFileContentCached(targetPath);
    if (res && res.ok) nextX = getNextXNumber(res.data || "");
  } catch {}

  const withX = ensureXNumberInAbc(TEMPLATE_ABC, nextX || "");
  setNewTuneDraftInActiveFile(withX, {
    filePath: targetPath,
    basename: (activeTuneMeta && activeTuneMeta.basename) ? activeTuneMeta.basename : safeBasename(targetPath),
    xNumber: nextX,
  });
  showToast("New tune draft from template (Save will append to the active file).", 3200);
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

  if (!currentDoc) currentDoc = createBlankDocument();
  currentDoc.path = null;
  currentDoc.content = text || "";
  currentDoc.dirty = true;
  updateFileContext();
  setDirtyIndicator(true);
  updateFileHeaderPanel();
  scheduleRenderNow({ clearOutput: true });
}

async function fileNewTune() {
  const entry = getActiveFileEntry();
  if (!entry || !entry.path) {
    const ok = await ensureSafeToAbandonCurrentDoc("creating a new tune");
    if (!ok) return;
    const template = ensureXNumberInAbc(buildNewTuneDraftTemplate(""), 1);
    setActiveTuneText(template, null, { markDirty: true });
    showToast("New tune draft opened.", 1800);
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
    const fileEntry = libraryIndex.files.find((f) => pathsEqual(f.path, filePath));
    if (fileEntry && fileEntry.tunes && fileEntry.tunes.length) {
      await selectTune(fileEntry.tunes[0].id);
    } else {
      setActiveTuneText("", null);
    }
  }
}

async function importMusicXml() {
  if (!window.api || typeof window.api.importMusicXml !== "function") return;

  const targetPath = (activeTuneMeta && activeTuneMeta.path)
    ? String(activeTuneMeta.path)
    : (activeFilePath ? String(activeFilePath) : "");
  if (!targetPath) {
    showToast("Open/select a target .abc file first, then import MusicXML.", 3600);
    setStatus("Ready");
    return;
  }

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

  const fallbackTitle = deriveTitleFromPath(res.sourcePath);
  let prepared = ensureTitleInAbc(res.abcText || "", fallbackTitle);
  prepared = normalizeMeasuresLineBreaks(transformMeasuresPerLine(prepared, 4));
  const aligned = alignBarsInText(prepared);
  const finalText = aligned || prepared;

  if (targetPath) {
    const confirm = await confirmAppendToFile(targetPath);
    if (confirm !== "append") {
      setStatus("Ready");
      return;
    }

    const ok = await ensureSafeToAbandonCurrentDoc("importing a file");
    if (!ok) {
      setStatus("Ready");
      return;
    }

    try {
      await withFileLock(targetPath, async () => {
        const readRes = await readFile(targetPath);
        if (!readRes || !readRes.ok) throw new Error((readRes && readRes.error) ? readRes.error : "Unable to read target file.");
        const before = String(readRes.data || "");
        const nextX = getNextXNumber(before);
        const withX = ensureXNumberInAbc(finalText, nextX);
        const updated = appendTuneToContent(before, withX);
        const writeRes = await writeFile(targetPath, updated);
        if (!writeRes || !writeRes.ok) throw new Error((writeRes && writeRes.error) ? writeRes.error : "Unable to append to file.");
        setFileContentInCache(targetPath, updated);

        const updatedFile = await refreshLibraryFile(targetPath);
        if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
          const tune = updatedFile.tunes[updatedFile.tunes.length - 1];
          activeTuneId = tune.id;
          markActiveTuneButton(activeTuneId);
          const tuneText = updated.slice(tune.startOffset, tune.endOffset);
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
          // Fallback: open as an unsaved document if the file is not part of the library index.
          setActiveTuneText(withX, null, { markDirty: false });
          if (currentDoc) currentDoc.dirty = false;
        }
      });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      logErr(msg);
      setStatus("Error");
      await showSaveError(msg);
      return;
    }

    if (res.warnings) logErr(`Import warning: ${res.warnings}`);
    setStatus("OK");
    return;
  }

  const ok = await ensureSafeToAbandonCurrentDoc("importing a file");
  if (!ok) {
    setStatus("Ready");
    return;
  }

  if (!currentDoc) setCurrentDocument(createBlankDocument());
  setActiveTuneText(finalText, null, { markDirty: true });
  if (res.warnings) logErr(`Import warning: ${res.warnings}`);
  setStatus("OK");
}

async function fileSave() {
  if (!currentDoc) return;
  if (rawMode) {
    await performRawSaveFlow();
    return;
  }
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
    await flushLibraryPrefsSave();
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
    if (numMatch) {
      out.push(`${prefix}${numMatch[1]}${next}${numMatch[3]}`);
    } else {
      out.push(`${prefix}${next}${rest}`);
    }
  }

  if (base == null) {
    return { ok: false, error: "No X: headers found in file." };
  }

  return {
    ok: true,
    abcText: out.join("\n"),
    base,
    tuneCount: tuneIndex + 1,
  };
}

async function renumberXInActiveFile(explicitFilePath) {
  const filePath = explicitFilePath
    || ((activeTuneMeta && activeTuneMeta.path) ? activeTuneMeta.path : null)
    || (activeFilePath || (currentDoc && currentDoc.path) || null);
  if (!filePath) {
    showToast("No active file selected.", 2200);
    return;
  }

  const ok = await ensureSafeToAbandonCurrentDoc("renumbering X numbers");
  if (!ok) return;

  await withFileLock(filePath, async () => {
    const readRes = await readFile(filePath);
    if (!readRes || !readRes.ok) {
      await showOpenError((readRes && readRes.error) ? readRes.error : "Unable to read file.");
      return;
    }

    const renum = renumberXInTextKeepingFirst(readRes.data);
    if (!renum.ok) {
      await showSaveError(renum.error || "Unable to renumber X: headers.");
      return;
    }

    if (renum.abcText === readRes.data) {
      setStatus("OK");
      showToast("X numbers already sequential.", 2000);
      return;
    }

    const writeRes = await writeFile(filePath, renum.abcText);
    if (!writeRes || !writeRes.ok) {
      await showSaveError((writeRes && writeRes.error) ? writeRes.error : "Unable to write file.");
      return;
    }

    const prevFile = libraryIndex && libraryIndex.files
      ? libraryIndex.files.find((f) => pathsEqual(f.path, filePath))
      : null;
    const prevTuneIndex = prevFile && prevFile.tunes && activeTuneId
      ? prevFile.tunes.findIndex((t) => t.id === activeTuneId)
      : -1;

    setFileContentInCache(filePath, renum.abcText);
    const updatedFile = await refreshLibraryFile(filePath, { force: true });
    if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
      const idx = prevTuneIndex >= 0 ? prevTuneIndex : 0;
      const nextTune = updatedFile.tunes[Math.min(idx, updatedFile.tunes.length - 1)];
      if (nextTune && nextTune.id) {
        await selectTune(nextTune.id, { skipConfirm: true });
      }
    }

    setStatus(`Renumbered X (base ${renum.base}, ${renum.tuneCount} tunes).`);
  });
}

async function appQuit() {
  await requestQuitApplication();
}

function wireMenuActions() {
  if (!window.api || typeof window.api.onMenuAction !== "function") return;
  window.api.onMenuAction(async (action) => {
    try {
      const actionType = typeof action === "string" ? action : action && action.type;
      const busy = isPlaybackBusy();
      if (busy) {
        // During Play/Pause, ignore menu actions (except Play/Pause itself, Reset Layout, and Quit).
        const allowed = new Set(["playToggle", "resetLayout", "quit", "playGotoMeasure", "toggleFocusMode", "setSplitOrientation", "toggleSplitOrientation"]);
        if (!allowed.has(actionType)) return;
      }
      if (rawMode) {
        const blocked = new Set([
          "playStart",
          "playPrev",
          "playToggle",
          "playNext",
          "transformTransposeUp",
          "transformTransposeDown",
          "transformDouble",
          "transformHalf",
          "transformMeasures",
          "alignBars",
          "printPreview",
          "print",
          "printAll",
          "exportPdf",
          "exportPdfAll",
          "exportMusicXml",
          "importMusicXml",
        ]);
        if (blocked.has(actionType)) {
          showToast("Raw mode: switch to tune mode for tools/playback/print/export.", 2400);
          return;
        }

        const needsExit = new Set([
          "new",
          "newTune",
          "newFromTemplate",
          "open",
          "openFolder",
          "openRecentTune",
          "openRecentFile",
          "openRecentFolder",
          "close",
          "quit",
        ]);
        if (needsExit.has(actionType)) {
          const labelMap = {
            new: "creating a new file",
            newTune: "creating a new tune",
            newFromTemplate: "creating a new tune",
            open: "opening a file",
            openFolder: "opening a folder",
            openRecentTune: "opening a recent tune",
            openRecentFile: "opening a recent file",
            openRecentFolder: "opening a recent folder",
            close: "closing this file",
            quit: "quitting",
          };
          const ok = await leaveRawModeForAction(labelMap[actionType] || "continuing");
          if (!ok) return;
        }
      }
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
      else if (actionType === "setList") openSetList();
      else if (actionType === "toggleLibrary") toggleLibrary();
      else if (actionType === "toggleFocusMode") toggleFocusMode();
      else if (actionType === "toggleSplitOrientation") {
        toggleSplitOrientation({ userAction: true });
      }
      else if (actionType === "setSplitOrientation") {
        const value = action && action.value ? String(action.value) : "";
        setSplitOrientation(value, { persist: true, userAction: true });
      }
      else if (actionType === "renumberXInFile") await renumberXInActiveFile();
      else if (actionType === "navTunePrev") await navigateTuneByDelta(-1);
      else if (actionType === "navTuneNext") await navigateTuneByDelta(1);
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
      else if (actionType === "toggleComment") {
        const view = getFocusedEditorView();
        if (view) toggleLineComments(view);
      }
      else if (actionType === "clearLibraryFilter") clearLibraryFilter();
      else if (actionType === "playStart") await startPlaybackAtIndex(0);
      else if (actionType === "playToggle") { await togglePlayPauseEffective(); }
      else if (actionType === "playGotoMeasure") await goToMeasureFromMenu();
      else if (actionType === "resetLayout") resetLayout();
      else if (actionType === "helpGuide") await openExternal("https://abcplus.sourceforge.net/abcplus_en.pdf");
      else if (actionType === "helpUserGuide") await openExternal("https://github.com/topchyan/abcarus/blob/master/docs/USER_GUIDE.md");
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
		      else if (actionType === "dumpDebug") dumpDebugToFile().catch(() => {});
		      else if (actionType === "settings" && settingsController) settingsController.openSettings();
		      else if (actionType === "fonts" && settingsController) {
		        if (typeof settingsController.openTab === "function") settingsController.openTab("fonts");
		        else settingsController.openSettings();
		      }
		      else if (actionType === "exportSettings") {
		        if (!window.api || typeof window.api.exportSettings !== "function") {
		          showToast("Export not available.", 2400);
		          return;
		        }
	        const res = await window.api.exportSettings();
	        if (res && res.ok) {
	          const note = res.exportedHeader ? " (incl. user_settings.abc)" : "";
	          showToast(`Settings exported${note} and will be used next time.`, 4200);
	        } else if (res && res.error && res.error !== "Canceled") {
	          showToast(String(res.error), 3200);
	        }
	      }
	      else if (actionType === "importSettings") {
	        if (!window.api || typeof window.api.importSettings !== "function") {
	          showToast("Import not available.", 2400);
	          return;
	        }
	        const res = await window.api.importSettings();
	        if (res && res.ok) {
	          showToast(
	            res.importedHeader
	              ? "Settings imported (incl. user_settings.abc) and will be used next time."
	              : "Settings imported and will be used next time.",
	            4200
	          );
	          refreshHeaderLayers().catch(() => {});
	        } else if (res && res.error && res.error !== "Canceled") {
	          showToast(String(res.error), 3200);
	        }
	      }
	      else if (actionType === "openSettingsFolder") {
	        if (!window.api || typeof window.api.openSettingsFolder !== "function") {
	          showToast("Not available.", 2400);
	          return;
	        }
	        const res = await window.api.openSettingsFolder();
	        if (res && res.ok) showToast("Opened settings folder.", 2000);
	      }
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
	      latestSettingsSnapshot = settings;
	      setGlobalHeaderFromSettings(settings);
	      setAbc2svgFontsFromSettings(settings);
	      setSoundfontFromSettings(settings);
	      setDrumVelocityFromSettings(settings);
        setLayoutFromSettings(settings);
	      setFollowFromSettings(settings);
	      setLoopFromSettings(settings);
	      setPlaybackAutoScrollFromSettings(settings);
	      applyLibraryPrefsFromSettings(settings);
	      updateGlobalHeaderToggle();
      updateErrorsFeatureUI();
      refreshHeaderLayers().catch(() => {});
      showDisclaimerIfNeeded(settings);
      scheduleStartupLayoutReset();
    }
    suppressLibraryPrefsWrite = false;
  }).catch(() => { suppressLibraryPrefsWrite = false; });
}

if (window.api && typeof window.api.getFontDirs === "function") {
  window.api.getFontDirs().then((res) => {
    if (res && res.ok) {
      fontDirs = { bundledDir: String(res.bundledDir || ""), userDir: String(res.userDir || "") };
    }
  }).catch(() => {});
}
if (window.api && typeof window.api.onSettingsChanged === "function") {
  window.api.onSettingsChanged((settings) => {
    latestSettingsSnapshot = settings || null;
    const prevHeader = `${globalHeaderEnabled}|${globalHeaderText}|${abc2svgNotationFontFile}|${abc2svgTextFontFile}`;
    const prevSoundfont = soundfontName;
    setGlobalHeaderFromSettings(settings);
    setAbc2svgFontsFromSettings(settings);
	    setSoundfontFromSettings(settings);
	    setDrumVelocityFromSettings(settings);
      setLayoutFromSettings(settings);
	    setFollowFromSettings(settings);
	    setLoopFromSettings(settings);
	    setPlaybackAutoScrollFromSettings(settings);
	    applyLibraryPrefsFromSettings(settings);
	    updateGlobalHeaderToggle();
    updateErrorsFeatureUI();
    refreshHeaderLayers().catch(() => {});
    showDisclaimerIfNeeded(settings);
    if (settings && prevHeader !== `${globalHeaderEnabled}|${globalHeaderText}|${abc2svgNotationFontFile}|${abc2svgTextFontFile}`) {
      scheduleRenderNow();
    }
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
  $moveTuneModal.addEventListener("keydown", (e) => {
    if (!e) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMoveTuneModal();
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!$moveTuneApply || $moveTuneApply.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      $moveTuneApply.click();
    }
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
  $aboutModal.addEventListener("keydown", (e) => {
    if (!e) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeAbout();
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

if ($setListClose) {
  $setListClose.addEventListener("click", () => {
    closeSetList();
  });
}

if ($setListHeader) {
  $setListHeader.addEventListener("click", () => {
    openSetListHeaderEditor();
  });
}

if ($setListItems) {
  let setListDragFromIndex = null;

  $setListItems.addEventListener("dragstart", (e) => {
    const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
    if (!row) return;
    const idx = row.dataset ? Number(row.dataset.index) : NaN;
    if (!Number.isFinite(idx)) return;
    setListDragFromIndex = idx;
    row.classList.add("dragging");
    try {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
      }
    } catch {}
  });

  $setListItems.addEventListener("dragend", () => {
    setListDragFromIndex = null;
    const rows = $setListItems.querySelectorAll(".set-list-row.dragging");
    for (const r of rows) r.classList.remove("dragging");
    const over = $setListItems.querySelectorAll(".set-list-row.drag-over");
    for (const r of over) r.classList.remove("drag-over");
  });

  $setListItems.addEventListener("dragover", (e) => {
    if (!e) return;
    const row = e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
    e.preventDefault();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = "move"; } catch {}
    if (!row) return;
  });

  $setListItems.addEventListener("dragenter", (e) => {
    const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
    if (!row) return;
    row.classList.add("drag-over");
  });

  $setListItems.addEventListener("dragleave", (e) => {
    const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
    if (!row) return;
    row.classList.remove("drag-over");
  });

  $setListItems.addEventListener("drop", (e) => {
    if (!e) return;
    e.preventDefault();
    const row = e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
    const toIdx = row && row.dataset ? Number(row.dataset.index) : (Array.isArray(setListItems) ? setListItems.length : 0);
    let raw = "";
    try { raw = e.dataTransfer ? e.dataTransfer.getData("text/plain") : ""; } catch {}

    let fromIdx = setListDragFromIndex;
    if (!Number.isFinite(fromIdx)) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) fromIdx = parsed;
    }

    if (Number.isFinite(fromIdx)) {
      if (!Number.isFinite(toIdx)) return;
      moveSetListItem(fromIdx, toIdx);
      renderSetList();
      return;
    }

    const tuneId = String(raw || "").trim();
    if (!tuneId) return;
    addTuneToSetListByTuneId(tuneId, { insertIndex: toIdx }).then(() => {
      showToast("Added to Set List.", 2000);
      renderSetList();
    }).catch((err) => {
      showToast(err && err.message ? err.message : String(err), 5000);
    });
  });

  $setListItems.addEventListener("click", (e) => {
    const btn = e && e.target && e.target.closest ? e.target.closest(".set-list-btn") : null;
    if (!btn) return;
    if (btn.disabled) return;
    const action = btn.dataset ? btn.dataset.action : "";
    const index = btn.dataset ? btn.dataset.index : "";
    if (action === "remove") {
      removeSetListItem(index);
      renderSetList();
      return;
    }
    if (action === "up") {
      moveSetListItem(index, Number(index) - 1);
      renderSetList();
      return;
    }
    if (action === "down") {
      moveSetListItem(index, Number(index) + 1);
      renderSetList();
    }
  });
}

if ($setListModal) {
  $setListModal.addEventListener("click", (e) => {
    if (e.target === $setListModal) closeSetList();
  });
  $setListModal.addEventListener("keydown", (e) => {
    if (!e) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeSetList();
  });
}

if ($setListHeaderClose) {
  $setListHeaderClose.addEventListener("click", () => {
    closeSetListHeaderEditor();
  });
}

if ($setListHeaderModal) {
  $setListHeaderModal.addEventListener("click", (e) => {
    if (e.target === $setListHeaderModal) closeSetListHeaderEditor();
  });
  $setListHeaderModal.addEventListener("keydown", (e) => {
    if (!e) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeSetListHeaderEditor();
  });
}

if ($setListHeaderReset) {
  $setListHeaderReset.addEventListener("click", () => {
    if (!$setListHeaderText) return;
    $setListHeaderText.value = "%%stretchlast 1\n";
    $setListHeaderText.focus();
  });
}

if ($setListHeaderSave) {
  $setListHeaderSave.addEventListener("click", () => {
    if (!$setListHeaderText) return;
    setListHeaderText = String($setListHeaderText.value || "");
    scheduleSaveSetList();
    closeSetListHeaderEditor();
  });
}

if ($setListClear) {
  $setListClear.addEventListener("click", () => {
    if (Array.isArray(setListItems) && setListItems.length) {
      const ok = window.confirm("Clear Set List? This cannot be undone.");
      if (!ok) return;
    }
    setListItems = [];
    scheduleSaveSetList();
    renderSetList();
  });
}

if ($setListPageBreaks) {
  $setListPageBreaks.addEventListener("change", () => {
    setListPageBreaks = String($setListPageBreaks.value || "perTune");
    scheduleSaveSetList();
    renderSetList();
  });
}

if ($setListCompact) {
  $setListCompact.addEventListener("change", () => {
    setListCompact = !!$setListCompact.checked;
    scheduleSaveSetList();
    renderSetList();
  });
}

if ($setListSaveAbc) {
  $setListSaveAbc.addEventListener("click", () => {
    if (!Array.isArray(setListItems) || setListItems.length === 0) return;
    exportSetListAsAbc().catch(() => {});
  });
}

if ($setListExportPdf) {
  $setListExportPdf.addEventListener("click", () => {
    if (!Array.isArray(setListItems) || setListItems.length === 0) return;
    runPrintSetListAction("pdf").catch(() => {});
  });
}

if ($setListPrint) {
  $setListPrint.addEventListener("click", () => {
    if (!Array.isArray(setListItems) || setListItems.length === 0) return;
    runPrintSetListAction("print").catch(() => {});
  });
}

if ($disclaimerOk) {
  $disclaimerOk.addEventListener("click", () => {
    dismissDisclaimer();
  });
}

if ($disclaimerModal) {
  $disclaimerModal.addEventListener("keydown", (e) => {
    if (!e) return;
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      dismissDisclaimer();
    }
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
let desiredPlayerSpeed = 1;
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
let followHighlightColor = "#1e90ff";
let followMeasureColor = "";
let followHighlightBarOpacity = 0.12;
let followMeasureOpacity = 0.08;
let followPlayheadOpacity = 0.7;
let followPlayheadWidth = 2;
let followPlayheadPad = 8;
let followPlayheadBetweenNotesWeight = 1;
let followPlayheadShift = 0;
let followPlayheadFirstBias = 6;
let playbackAutoScrollMode = "keep";
let playbackAutoScrollHorizontal = true;
let playbackAutoScrollPauseMs = 1800;
let playbackAutoScrollManualUntil = 0;
let playbackAutoScrollIgnoreUntil = 0;
let playbackAutoScrollAnim = null; // {raf,startAt,duration,fromTop,fromLeft,toTop,toLeft}
let playbackAutoScrollProgrammatic = false;
let playbackAutoScrollLastAt = 0;
let playbackAutoScrollDebugLastAt = 0;
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
let playbackParseErrors = [];
let playbackSanitizeWarnings = [];
let lastPlaybackTuneInfo = null;
let lastPlaybackOnIstart = null;
let lastPlaybackHasParts = false;
let pendingPlaybackUiIstart = null;
let pendingPlaybackUiRaf = null;
let lastPlaybackNoteOnEls = [];
let lastPlaybackUiRenderIdx = null;
let lastPlaybackUiEditorIdx = null;
let lastPlaybackUiScrollAt = 0;
let lastDrumSignatureDiff = null;
let lastPlaybackChordOnBarError = false;
let lastMeterMismatchToastKey = null;
let lastPlaybackMeterMismatchWarning = null;
let lastRepeatShortBarToastKey = null;
let lastPlaybackRepeatShortBarWarning = null;
let lastMidiDrumCompatToastKey = null;
let lastPlaybackKeyOrderWarning = null;
let playbackStartToken = 0;
let lastPlaybackGuardMessage = "";
let lastPlaybackAbortMessage = "";
let playbackNeedsReprepare = false;

let focusModeEnabled = false;
let focusPrevRenderZoom = null;
let focusPrevLibraryVisible = null;

function setRenderZoomCss(zoom) {
  const v = Number(zoom);
  if (!Number.isFinite(v) || v <= 0) return;
  try { document.documentElement.style.setProperty("--render-zoom", String(v)); } catch {}
}

function readRenderZoomCss() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--render-zoom");
    const v = Number(String(raw || "").trim());
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  return getRenderZoomFactor();
}

function computeFocusFitZoom() {
  if (!$renderPane || !$out) return null;
  const svg = $out.querySelector("svg");
  if (!svg) return null;
  const currentZoom = getRenderZoomFactor();
  if (!Number.isFinite(currentZoom) || currentZoom <= 0) return null;
  const svgRect = svg.getBoundingClientRect();
  const paneWidth = $renderPane.clientWidth || 0;
  if (!(svgRect && svgRect.width > 10) || paneWidth < 50) return null;
  const intrinsicWidth = svgRect.width / currentZoom;
  if (!Number.isFinite(intrinsicWidth) || intrinsicWidth <= 10) return null;
  const target = Math.max(100, paneWidth - 24);
  const next = target / intrinsicWidth;
  return clampNumber(next, 0.5, 8, currentZoom);
}

function updateFocusModeUi() {
  document.body.classList.toggle("focus-mode", focusModeEnabled);
  if ($btnFocusMode) {
    $btnFocusMode.classList.toggle("toggle-active", focusModeEnabled);
    $btnFocusMode.setAttribute("aria-pressed", focusModeEnabled ? "true" : "false");
  }
  updatePracticeUi();
}

function setFocusModeEnabled(nextEnabled) {
  const next = Boolean(nextEnabled);
  if (focusModeEnabled === next) return;
  if (rawMode && next) {
    showToast("Exit Raw mode to use Focus.", 2200);
    return;
  }
  focusModeEnabled = next;
  if (focusModeEnabled) {
    focusPrevRenderZoom = readRenderZoomCss();
    focusPrevLibraryVisible = isLibraryVisible;
    if (isLibraryVisible) {
      setLibraryVisible(false, { persist: false });
      requestAnimationFrame(() => {
        try { resetRightPaneSplit(); } catch {}
      });
    }
    requestAnimationFrame(() => {
      const fit = computeFocusFitZoom();
      // Focus is a "stage" mode: it chooses the zoom independently to reduce unused margins
      // and keep the score readable during playback (restored on exit).
      if (fit != null) setRenderZoomCss(fit);
      if (window.__abcarusDebugFocus) {
        try {
          const cssZoom = getComputedStyle(document.documentElement).getPropertyValue("--render-zoom");
          console.log("[abcarus][focus] apply " + JSON.stringify({
            fit,
            cssZoom: String(cssZoom || "").trim(),
          }));
        } catch {}
      }
    });
  } else if (focusPrevRenderZoom != null) {
    setRenderZoomCss(focusPrevRenderZoom);
    focusPrevRenderZoom = null;
    if (focusPrevLibraryVisible) {
      setLibraryVisible(true, { persist: false });
      requestAnimationFrame(() => {
        try { resetRightPaneSplit(); } catch {}
      });
    }
    focusPrevLibraryVisible = null;
  }
  if (focusModeEnabled) {
    maybeResetFocusLoopForTune(activeTuneId, { updateUi: false });
  }
  updateFocusModeUi();
}

function toggleFocusMode() {
  setFocusModeEnabled(!focusModeEnabled);
}

function clearPlaybackNoteOnEls() {
  for (const el of lastPlaybackNoteOnEls) {
    try { el.classList.remove("note-on"); } catch {}
  }
  lastPlaybackNoteOnEls = [];
}

function resetPlaybackUiState() {
  clearPlaybackNoteOnEls();
  clearSvgPlayhead();
  clearSvgFollowBarHighlight();
  clearSvgFollowMeasureHighlight();
  clearSvgPracticeBarHighlight();
  setPracticeBarHighlight(null);
  lastPlaybackUiRenderIdx = null;
  lastPlaybackUiEditorIdx = null;
  pendingPlaybackUiIstart = null;
  if (pendingPlaybackUiRaf != null) {
    try { cancelAnimationFrame(pendingPlaybackUiRaf); } catch {}
    pendingPlaybackUiRaf = null;
  }
  playbackAutoScrollManualUntil = 0;
  cancelPlaybackAutoScroll();
}

function normalizeAutoScrollMode(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "keep";
  if (s.startsWith("off")) return "off";
  if (s.startsWith("page")) return "page";
  if (s.startsWith("center")) return "center";
  return "keep";
}

function debugAutoScroll(tag, detail) {
  if (!window.__abcarusDebugAutoscroll) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - playbackAutoScrollDebugLastAt < 600) return;
  playbackAutoScrollDebugLastAt = now;
  try {
    const debug = (detail && typeof detail === "object") ? { ...detail } : {};
    debug.zoom = Math.round(getRenderZoomFactor() * 100) / 100;
    try {
      debug.cssZoom = String(getComputedStyle(document.documentElement).getPropertyValue("--render-zoom") || "").trim();
    } catch {
      debug.cssZoom = "";
    }
    try {
      debug.outZoom = $out ? String(getComputedStyle($out).zoom || "").trim() : "";
    } catch {
      debug.outZoom = "";
    }
    if ($renderPane) {
      debug.pane = {
        top: Math.round($renderPane.scrollTop),
        left: Math.round($renderPane.scrollLeft),
        scrollH: Math.round($renderPane.scrollHeight),
        scrollW: Math.round($renderPane.scrollWidth),
        clientH: Math.round($renderPane.clientHeight),
        clientW: Math.round($renderPane.clientWidth),
      };
    }
    const msgParts = [`[abcarus][autoscroll] ${tag}`];
    if (debug.mode) msgParts.push(`mode=${debug.mode}`);
    if (Number.isFinite(debug.zoom)) msgParts.push(`z=${debug.zoom}`);
    if (debug.cssZoom) msgParts.push(`css=${debug.cssZoom}`);
    if (debug.outZoom) msgParts.push(`out=${debug.outZoom}`);
    if (Number.isFinite(debug.clampedTop) && Number.isFinite(debug.nextTop)) {
      msgParts.push(`top=${debug.clampedTop}/${Math.round(debug.nextTop)}`);
    }
    if (Number.isFinite(debug.cursorTop) && Number.isFinite(debug.cursorBottom) && Number.isFinite(debug.viewTop) && Number.isFinite(debug.viewBottom)) {
      msgParts.push(`cursorY=${debug.cursorTop}..${debug.cursorBottom}`);
      msgParts.push(`viewY=${debug.viewTop}..${debug.viewBottom}`);
    }
    if (debug.pane && Number.isFinite(debug.pane.scrollH) && Number.isFinite(debug.pane.clientH)) {
      msgParts.push(`scrollY=${debug.pane.top}/${Math.max(0, debug.pane.scrollH - debug.pane.clientH)}`);
    }
    console.log(msgParts.join(" "), debug);
  } catch {}
}

function initPlaybackAutoScrollListeners() {
  if (!$renderPane) return;
  const markManual = () => {
    const ms = clampNumber(playbackAutoScrollPauseMs, 0, 5000, 1800);
    playbackAutoScrollManualUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + ms;
  };
  $renderPane.addEventListener("wheel", () => markManual(), { passive: true });
  $renderPane.addEventListener("pointerdown", () => markManual(), { passive: true });
  $renderPane.addEventListener("scroll", () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now < playbackAutoScrollIgnoreUntil) return;
    if (playbackAutoScrollProgrammatic) return;
    if (playbackAutoScrollAnim && playbackAutoScrollAnim.raf != null) return;
    markManual();
  }, { passive: true });
}

function cancelPlaybackAutoScroll() {
  if (playbackAutoScrollAnim && playbackAutoScrollAnim.raf != null) {
    try { cancelAnimationFrame(playbackAutoScrollAnim.raf); } catch {}
  }
  playbackAutoScrollAnim = null;
  playbackAutoScrollProgrammatic = false;
}

function animateRenderPaneScrollTo(targetTop, targetLeft, durationMs) {
  if (!$renderPane) return;
  const maxTop = Math.max(0, $renderPane.scrollHeight - $renderPane.clientHeight);
  const maxLeft = Math.max(0, $renderPane.scrollWidth - $renderPane.clientWidth);
  const toTop = Math.max(0, Math.min(maxTop, Number(targetTop) || 0));
  const toLeft = Math.max(0, Math.min(maxLeft, Number(targetLeft) || 0));

  const fromTop = $renderPane.scrollTop;
  const fromLeft = $renderPane.scrollLeft;
  const dx = Math.abs(toLeft - fromLeft);
  const dy = Math.abs(toTop - fromTop);
  if (dx < 1 && dy < 1) return;

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const duration = clampNumber(durationMs, 0, 2000, 250);
  cancelPlaybackAutoScroll();
  playbackAutoScrollProgrammatic = true;
  playbackAutoScrollIgnoreUntil = now + Math.min(2500, Math.max(200, duration + 100));

  playbackAutoScrollAnim = {
    raf: null,
    startAt: now,
    duration,
    fromTop,
    fromLeft,
    toTop,
    toLeft,
  };

  const step = (tNow) => {
    if (!$renderPane || !playbackAutoScrollAnim) return;
    const a = playbackAutoScrollAnim;
    const t = a.duration > 0 ? Math.max(0, Math.min(1, (tNow - a.startAt) / a.duration)) : 1;
    const ease = 1 - Math.pow(1 - t, 3);
    const nextTop = a.fromTop + (a.toTop - a.fromTop) * ease;
    const nextLeft = a.fromLeft + (a.toLeft - a.fromLeft) * ease;
    $renderPane.scrollTop = nextTop;
    $renderPane.scrollLeft = nextLeft;
    if (t < 1) {
      a.raf = requestAnimationFrame(step);
    } else {
      playbackAutoScrollAnim = null;
      playbackAutoScrollProgrammatic = false;
    }
  };
  playbackAutoScrollAnim.raf = requestAnimationFrame(step);
}

function getRenderZoomFactor() {
  try {
    // Source of truth: the CSS custom property (set by Settings and Focus mode).
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--render-zoom");
    const v = Number(String(raw || "").trim());
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  try {
    // Fallback for environments where CSS custom properties may not be readable (should be rare).
    if ($out) {
      const raw = getComputedStyle($out).zoom;
      const v = Number(String(raw || "").trim());
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch {}
  const fromSettings = latestSettingsSnapshot && Number(latestSettingsSnapshot.renderZoom);
  if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings;
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--render-zoom");
    const v = Number(String(raw || "").trim());
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  return 1;
}

function maybeAutoScrollRenderToCursor(el) {
  if (!$renderPane) return;
  if (!el) {
    debugAutoScroll("skip:no-el");
    return;
  }
  if (!isPlaybackBusy()) {
    debugAutoScroll("skip:not-busy");
    return;
  }

  const mode = normalizeAutoScrollMode(playbackAutoScrollMode);
  if (mode === "off") {
    debugAutoScroll("skip:mode-off");
    return;
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now < playbackAutoScrollManualUntil) {
    debugAutoScroll("skip:manual-pause", {
      mode,
      remainingMs: Math.round(playbackAutoScrollManualUntil - now),
      programmatic: Boolean(playbackAutoScrollProgrammatic),
      animating: Boolean(playbackAutoScrollAnim && playbackAutoScrollAnim.raf != null),
    });
    return;
  }
  if (now - playbackAutoScrollLastAt < 80) {
    debugAutoScroll("skip:throttle", { mode });
    return;
  }
  playbackAutoScrollLastAt = now;

  const targetEl = lastSvgPlayheadEl || el;
  if (!targetEl) {
    debugAutoScroll("skip:no-target-el", { mode });
    return;
  }
  const containerRect = $renderPane.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const viewTop = $renderPane.scrollTop;
  const viewBottom = viewTop + $renderPane.clientHeight;
  const viewLeft = $renderPane.scrollLeft;
  const viewRight = viewLeft + $renderPane.clientWidth;

  const h = $renderPane.clientHeight || 1;
  const w = $renderPane.clientWidth || 1;
  const playheadH = targetRect.height;
  const topMargin = Math.max(40, h * 0.15);
  const bottomMargin = mode === "keep"
    ? Math.max(40, h * 0.15 + playheadH * 2.2)
    : Math.max(40, h * (mode === "page" ? 0.25 : 0.15), playheadH * 0.8);
  const leftMargin = Math.max(40, w * 0.12);
  const rightMargin = Math.max(40, w * 0.12);

  const allowH = Boolean(playbackAutoScrollHorizontal);

  // For "keep" / "center", let the browser compute correct scroll positions under zoom
  // (CSS zoom can desync getBoundingClientRect from scrollTop on some platforms).
  // We do a fast "auto" scrollIntoView to compute targets, then animate ourselves.
  if (mode === "keep" || mode === "center") {
    const padTop = mode === "keep" ? topMargin : 0;
    const padBottom = mode === "keep" ? bottomMargin : 0;
    const padLeft = allowH ? (mode === "keep" ? leftMargin : 0) : 0;
    const padRight = allowH ? (mode === "keep" ? rightMargin : 0) : 0;

    try {
      $renderPane.style.scrollPaddingTop = `${Math.round(padTop)}px`;
      $renderPane.style.scrollPaddingBottom = `${Math.round(padBottom)}px`;
      $renderPane.style.scrollPaddingLeft = `${Math.round(padLeft)}px`;
      $renderPane.style.scrollPaddingRight = `${Math.round(padRight)}px`;
    } catch {}

    const fromTop = viewTop;
    const fromLeft = viewLeft;
    let toTop = viewTop;
    let toLeft = viewLeft;
    try {
      playbackAutoScrollProgrammatic = true;
      playbackAutoScrollIgnoreUntil = now + 250;
      targetEl.scrollIntoView({
        block: mode === "center" ? "center" : "nearest",
        inline: allowH ? (mode === "center" ? "center" : "nearest") : "nearest",
        behavior: "auto",
      });
      toTop = $renderPane.scrollTop;
      toLeft = allowH ? $renderPane.scrollLeft : fromLeft;
    } catch {
      // ignore
    } finally {
      try {
        $renderPane.scrollTop = fromTop;
        $renderPane.scrollLeft = fromLeft;
      } catch {}
      playbackAutoScrollProgrammatic = false;
    }

    const relTop = targetRect.top - containerRect.top;
    const relBottom = relTop + targetRect.height;
    const relLeft = targetRect.left - containerRect.left;
    const relRight = relLeft + targetRect.width;

    const duration = mode === "center" ? 160 : 260;
    const maxTop = Math.max(0, $renderPane.scrollHeight - $renderPane.clientHeight);
    const maxLeft = Math.max(0, $renderPane.scrollWidth - $renderPane.clientWidth);
    const clampedTop = Math.max(0, Math.min(maxTop, Number(toTop) || 0));
    const clampedLeft = Math.max(0, Math.min(maxLeft, Number(toLeft) || 0));
    const dx = Math.abs(clampedLeft - viewLeft);
    const dy = Math.abs(clampedTop - viewTop);
    debugAutoScroll(dx < 1 && dy < 1 ? "noop" : "scroll", {
      mode,
      viewTop: Math.round(viewTop),
      viewBottom: Math.round(viewBottom),
      viewLeft: Math.round(viewLeft),
      viewRight: Math.round(viewRight),
      cursorTop: Math.round(viewTop + relTop),
      cursorBottom: Math.round(viewTop + relBottom),
      cursorLeft: Math.round(viewLeft + relLeft),
      cursorRight: Math.round(viewLeft + relRight),
      nextTop: Math.round(toTop),
      nextLeft: Math.round(toLeft),
      clampedTop: Math.round(clampedTop),
      clampedLeft: Math.round(clampedLeft),
      maxTop: Math.round(maxTop),
      maxLeft: Math.round(maxLeft),
      topMargin: Math.round(topMargin),
      bottomMargin: Math.round(bottomMargin),
      leftMargin: Math.round(leftMargin),
      rightMargin: Math.round(rightMargin),
    });
    if (dx < 1 && dy < 1) return;
    animateRenderPaneScrollTo(clampedTop, clampedLeft, duration);
    return;
  }

  // Work entirely in scroll container pixel space:
  // - rect deltas are viewport pixels
  // - scrollTop/Left deltas are also viewport pixels
  const relTop = targetRect.top - containerRect.top;
  const relBottom = relTop + targetRect.height;
  const relLeft = targetRect.left - containerRect.left;
  const relRight = relLeft + targetRect.width;

  let nextTop = viewTop;
  let nextLeft = viewLeft;

  if (mode === "center") {
    const desiredTop = h * 0.5 - targetRect.height * 0.5;
    nextTop = viewTop + (relTop - desiredTop);
  } else if (mode === "page") {
    const desiredTop = h * 0.1;
    if (relBottom > h - bottomMargin) {
      nextTop = viewTop + (relTop - desiredTop);
    } else if (relTop < topMargin) {
      nextTop = viewTop + (relTop - desiredTop);
    }
  } else {
    if (relTop < topMargin) {
      nextTop = viewTop + (relTop - topMargin);
    } else if (relBottom > h - bottomMargin) {
      nextTop = viewTop + (relBottom - (h - bottomMargin));
    }
  }

  if (allowH) {
    if (mode === "center") {
      const desiredLeft = w * 0.5 - targetRect.width * 0.5;
      nextLeft = viewLeft + (relLeft - desiredLeft);
    } else {
      if (relLeft < leftMargin) {
        nextLeft = viewLeft + (relLeft - leftMargin);
      } else if (relRight > w - rightMargin) {
        nextLeft = viewLeft + (relRight - (w - rightMargin));
      }
    }
  }

  const duration = mode === "page" ? 420 : (mode === "center" ? 160 : 260);
  const maxTop = Math.max(0, $renderPane.scrollHeight - $renderPane.clientHeight);
  const maxLeft = Math.max(0, $renderPane.scrollWidth - $renderPane.clientWidth);
  const clampedTop = Math.max(0, Math.min(maxTop, Number(nextTop) || 0));
  const clampedLeft = Math.max(0, Math.min(maxLeft, Number(nextLeft) || 0));
  const dx = Math.abs(clampedLeft - viewLeft);
  const dy = Math.abs(clampedTop - viewTop);
  debugAutoScroll(dx < 1 && dy < 1 ? "noop" : "scroll", {
    mode,
    viewTop: Math.round(viewTop),
    viewBottom: Math.round(viewBottom),
    viewLeft: Math.round(viewLeft),
    viewRight: Math.round(viewRight),
    cursorTop: Math.round(viewTop + relTop),
    cursorBottom: Math.round(viewTop + relBottom),
    cursorLeft: Math.round(viewLeft + relLeft),
    cursorRight: Math.round(viewLeft + relRight),
    topMargin: Math.round(topMargin),
    bottomMargin: Math.round(bottomMargin),
    leftMargin: Math.round(leftMargin),
    rightMargin: Math.round(rightMargin),
    nextTop: Math.round(nextTop),
    nextLeft: Math.round(nextLeft),
    clampedTop: Math.round(clampedTop),
    clampedLeft: Math.round(clampedLeft),
    maxTop: Math.round(maxTop),
    maxLeft: Math.round(maxLeft),
    relTop: Math.round(relTop),
    relBottom: Math.round(relBottom),
    relLeft: Math.round(relLeft),
    relRight: Math.round(relRight),
  });
  if (dx < 1 && dy < 1) return;
  animateRenderPaneScrollTo(clampedTop, clampedLeft, duration);
}

function playbackGuardError(message) {
  console.error(`[abcarus][playback-range] ${message}`);
}

function stopPlaybackFromGuard(message) {
  lastPlaybackGuardMessage = String(message || "");
  try { recordDebugLog("warn", [`Playback guard: ${lastPlaybackGuardMessage}`]); } catch {}
  playbackGuardError(message);
  try { scheduleAutoDump("playback-guard", lastPlaybackGuardMessage); } catch {}
  playbackStartToken += 1;
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
  activePlaybackEndSymbol = null;
  activeLoopRange = null;
  playbackStartArmed = false;
  currentPlaybackPlan = null;
  pendingPlaybackPlan = null;
  setStatus("OK");
  updatePlayButton();
  clearNoteSelection();
  resetPlaybackUiState();
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
  const injected = injectGchordOn(baseText, prefixPayload.offset || 0);
  const gchordText = injected && injected.changed ? injected.text : baseText;
  const drumPreview = injectDrumPlayback(gchordText);
  const preparedText = normalizeBlankLinesForPlayback(
    normalizeDollarLineBreaksForPlayback(drumPreview && drumPreview.changed ? drumPreview.text : gchordText)
  );
  const sanitized = sanitizeAbcForPlayback(preparedText);
  const expandRepeats = window.__abcarusPlaybackExpandRepeats === true;
  const repeatsFlag = expandRepeats ? "exp:on" : "exp:off";
  // Key includes the post-gchord text and the effective expansion mode to avoid reusing a mismatched playbackState.
  return `${sanitized.text}|||${prefixPayload.offset || 0}|||${repeatsFlag}`;
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
    $btnPlayPause.classList.toggle("is-playing", Boolean(isPlaying));
    if (isPlaying) setButtonText($btnPlayPause, "Pause");
    else if (isPaused) setButtonText($btnPlayPause, "Resume");
    else setButtonText($btnPlayPause, "Play");
  }
  updatePlaybackInteractionLock();
  updatePracticeUi();
}

function isPlaybackBusy() {
  return Boolean(isPlaying || isPaused || waitingForFirstNote);
}

function updatePlaybackInteractionLock() {
  const busy = isPlaybackBusy();
  const disable = (el, allowWhileBusy = false) => {
    if (!el) return;
    el.disabled = busy && !allowWhileBusy;
  };

  // Allowlist during playback: transport controls + view-only controls (zoom is via menu).
  disable($btnPlay, true);
  disable($btnPause, true);
  disable($btnPlayPause, true);
  disable($btnStop, true);
  disable($btnResetLayout, true);
  disable($btnFocusMode, true);

  // Block file/library/tool actions while playing/paused/loading to prevent state races.
  disable($btnToggleLibrary);
  disable($btnLibraryRefresh);
  disable($btnLibraryClearFilter);
  disable($groupBy);
  disable($sortBy);
  disable($librarySearch);
  disable($fileTuneSelect);

  disable($btnFileNew);
  disable($btnFileOpen);
  disable($btnFileSave);
  disable($btnFileClose);
  disable($btnToggleRaw);

  disable($btnToggleErrors);
  disable($btnToggleFollow);
  disable($btnToggleGlobals);
  disable($fileHeaderToggle);
  disable($fileHeaderSave);
  disable($fileHeaderReload);

  disable($practiceTempo, true);
  disable($practiceLoopEnabled);
  disable($practiceLoopFrom);
  disable($practiceLoopTo);

  disable($btnFonts);

  disable($xIssuesAutoFix);
  disable($xIssuesJump);
  disable($xIssuesCopy);
  disable($xIssuesClose, true);
}

function buildTransportPlaybackPlan() {
  const loopPlan = focusModeEnabled ? computeFocusLoopPlaybackRange() : null;
  return {
    mode: "transport",
    rangeStart: loopPlan ? loopPlan.startOffset : Math.max(0, Number(transportPlayheadOffset) || 0),
    rangeEnd: loopPlan ? loopPlan.endOffset : null,
    loopEnabled: Boolean(loopPlan && loopPlan.loop),
    tempoMultiplier: focusModeEnabled
      ? (Number.isFinite(Number(practiceTempoMultiplier)) ? Number(practiceTempoMultiplier) : 1)
      : 1,
  };
}

function syncPendingPlaybackPlan() {
  pendingPlaybackPlan = buildTransportPlaybackPlan();
}

function applyPlaybackPlanSpeed(plan) {
  const next = Number(plan && plan.tempoMultiplier);
  desiredPlayerSpeed = (Number.isFinite(next) && next > 0) ? next : 1;
  if (player && typeof player.set_speed === "function") {
    try { player.set_speed(desiredPlayerSpeed); } catch {}
  }
}

async function togglePlayPauseEffective() {
  if (isPlaying) {
    pausePlayback();
    return;
  }

  if (isPaused) {
    const plan = buildTransportPlaybackPlan();
    applyPlaybackPlanSpeed(plan);
    const resumeOffset = playbackRange ? Math.max(0, Number(playbackRange.startOffset) || 0) : 0;
    await startPlaybackFromRange({
      startOffset: resumeOffset,
      endOffset: plan.rangeEnd,
      origin: focusModeEnabled ? "focus" : "transport",
      loop: plan.loopEnabled,
    });
    return;
  }

  const plan = pendingPlaybackPlan || buildTransportPlaybackPlan();
  pendingPlaybackPlan = null;
  currentPlaybackPlan = plan;
  applyPlaybackPlanSpeed(plan);
  await startPlaybackFromRange({
    startOffset: plan.rangeStart,
    endOffset: plan.rangeEnd,
    origin: focusModeEnabled ? "focus" : "transport",
    loop: plan.loopEnabled,
  });
}

async function transportTogglePlayPause() {
  if (isPlaying) {
    pausePlayback();
    return;
  }
  if (isPaused) {
    const plan = buildTransportPlaybackPlan();
    const resumeOffset = playbackRange ? Math.max(0, Number(playbackRange.startOffset) || 0) : 0;
    await startPlaybackFromRange({
      startOffset: resumeOffset,
      endOffset: plan.rangeEnd,
      origin: focusModeEnabled ? "focus" : "transport",
      loop: plan.loopEnabled,
    });
    return;
  }
  const startOffset = Math.max(0, Number(transportPlayheadOffset) || 0);
  await startPlaybackFromRange({ startOffset, endOffset: null, origin: "transport", loop: false });
}

async function transportPlay() {
  if (isPlaying) return;
  if (isPaused) {
    await startPlaybackFromRange();
    return;
  }
  const startOffset = Math.max(0, Number(transportPlayheadOffset) || 0);
  await startPlaybackFromRange({ startOffset, endOffset: null, origin: "transport", loop: false });
}

async function transportPause() {
  if (isPlaying) {
    pausePlayback();
    return;
  }
  if (isPaused) {
    const plan = buildTransportPlaybackPlan();
    const resumeOffset = playbackRange ? Math.max(0, Number(playbackRange.startOffset) || 0) : 0;
    await startPlaybackFromRange({
      startOffset: resumeOffset,
      endOffset: plan.rangeEnd,
      origin: focusModeEnabled ? "focus" : "transport",
      loop: plan.loopEnabled,
    });
  }
}

function resetPlaybackState() {
  playbackStartToken += 1;
  stopPlaybackForRestart();
  suppressOnEnd = false;
  isPlaying = false;
  isPaused = false;
  waitingForFirstNote = false;
  isPreviewing = false;
  playbackNeedsReprepare = true;
  lastPlaybackIdx = null;
  lastRenderIdx = null;
  lastStartPlaybackIdx = 0;
  resumeStartIdx = null;
  playbackState = null;
  playbackIndexOffset = 0;
  activePlaybackRange = null;
  activePlaybackEndAbcOffset = null;
  activePlaybackEndSymbol = null;
  activeLoopRange = null;
  playbackStartArmed = false;
  currentPlaybackPlan = null;
  pendingPlaybackPlan = null;
  clearNoteSelection();
  resetPlaybackUiState();
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

function maybeScrollEditorToOffset(editorOffset) {
  if (!editorView) return;
  const max = editorView.state.doc.length;
  const idx = Math.max(0, Math.min(Number(editorOffset) || 0, max));
  const lineBlock = editorView.lineBlockAt(idx);
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
}

function schedulePlaybackUiUpdate(istart) {
  if (!Number.isFinite(istart)) return;
  pendingPlaybackUiIstart = istart;
  if (pendingPlaybackUiRaf != null) return;
  pendingPlaybackUiRaf = requestAnimationFrame(() => {
    pendingPlaybackUiRaf = null;
	    const i = pendingPlaybackUiIstart;
	    pendingPlaybackUiIstart = null;
	    if (!isPlaying || isPreviewing) return;
	    const effectiveFollow = Boolean(followPlayback || focusModeEnabled);
	    if (!effectiveFollow) return;
	    if (!$out) return;
	    if (!Number.isFinite(i)) return;

    let targetIstart = i;
    // When playback events come from a different voice (common in multi-voice scores),
    // Follow should still track the configured "primary" voice rather than freezing.
    if ((followVoiceId != null || followVoiceIndex != null) && playbackState && playbackState.voiceTimeline) {
      const wantId = followVoiceId != null ? String(followVoiceId) : null;
      const wantIndex = followVoiceIndex != null ? String(followVoiceIndex) : null;
      const byId = playbackState.voiceTimeline && playbackState.voiceTimeline.byId ? playbackState.voiceTimeline.byId : null;
      const byIndex = playbackState.voiceTimeline && playbackState.voiceTimeline.byIndex ? playbackState.voiceTimeline.byIndex : null;
      const tl = (wantId && byId && byId[wantId]) ? byId[wantId]
        : (wantIndex && byIndex && byIndex[wantIndex]) ? byIndex[wantIndex]
        : null;

      const sym = findSymbolAtOrBefore(i);
      const currentTime = sym && Number.isFinite(sym.time) ? sym.time : null;
      if (tl && currentTime != null) {
        const times = Array.isArray(tl.times) ? tl.times : null;
        const istarts = Array.isArray(tl.istarts) ? tl.istarts : null;
        if (times && istarts && times.length && times.length === istarts.length) {
          const pos = upperBoundTime(times, currentTime) - 1;
          const idx = Math.max(0, Math.min(istarts.length - 1, pos));
          const mapped = istarts[idx];
          if (Number.isFinite(mapped)) targetIstart = mapped;
        }
      }
    }

    const editorIdx = Math.max(0, targetIstart - playbackIndexOffset);
    const editorLen = editorView ? editorView.state.doc.length : 0;
    const fromInjected = editorLen && editorIdx >= editorLen;
    if (fromInjected) return;

    const renderOffset = (lastRenderPayload && Number.isFinite(lastRenderPayload.offset))
      ? lastRenderPayload.offset
      : 0;
    const renderIdx = editorIdx + renderOffset;

	    if (lastPlaybackUiEditorIdx === editorIdx && lastPlaybackUiRenderIdx === renderIdx) return;
	    lastPlaybackUiEditorIdx = editorIdx;
	    lastPlaybackUiRenderIdx = renderIdx;

	    // Follow mode: emphasize bar + playhead line over per-note blinking.
	    clearPlaybackNoteOnEls();

    // New approach: highlight the current *visual* staff segment (5 lines) instead of bar separators.
    // This avoids ambiguity when the left barline of the current measure is on the previous system line.
    clearSvgFollowBarHighlight();

    let els = $out.querySelectorAll("._" + renderIdx + "_");
    let noteEls = els && els.length
      ? Array.from(els).filter((el) => el.classList && el.classList.contains("note-hl"))
      : [];
    if (!noteEls.length && Number.isFinite(renderIdx)) {
      // Deterministic fallback: search backward for a nearby mapped note.
      // Some playback istart values do not land exactly on a `note-hl` anchor (multi-voice, ties, etc.).
      const maxBack = 240;
      for (let d = 1; d <= maxBack; d += 1) {
        const probe = renderIdx - d;
        if (probe < 0) break;
        els = $out.querySelectorAll("._" + probe + "_");
        noteEls = els && els.length
          ? Array.from(els).filter((el) => el.classList && el.classList.contains("note-hl"))
          : [];
        if (noteEls.length) break;
      }
    }
    const chosen = noteEls.length ? pickClosestNoteElement(noteEls) : null;
    if (chosen) {
      const nearestBar = findNearestBarElForNote(chosen);
      setSvgPlayheadFromElements(chosen, nearestBar);
      highlightSvgFollowMeasureForNote(chosen, nearestBar);
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
	      if (now - lastPlaybackUiScrollAt > 90) {
          if (!suppressFollowScrollUntilMs || now >= suppressFollowScrollUntilMs) {
	          maybeScrollRenderToNote(chosen);
	          lastPlaybackUiScrollAt = now;
          }
	      }
	      highlightSourceAt(editorIdx, true);
	      return;
	    }

    clearSvgPlayhead();
    clearSvgFollowMeasureHighlight();
    highlightSourceAt(editorIdx, true);
  });
}

function maybeScrollRenderToNote(el) {
  if (!$renderPane || !el) return;
  if (isPlaybackBusy()) {
    maybeAutoScrollRenderToCursor(el);
    return;
  }
  const containerRect = $renderPane.getBoundingClientRect();
  const targetRect = el.getBoundingClientRect();
  const viewTop = $renderPane.scrollTop;
  const viewBottom = viewTop + $renderPane.clientHeight;
  const viewLeft = $renderPane.scrollLeft;
  const viewRight = viewLeft + $renderPane.clientWidth;
  const relTop = targetRect.top - containerRect.top;
  const relBottom = relTop + targetRect.height;
  const relLeft = targetRect.left - containerRect.left;
  const relRight = relLeft + targetRect.width;
  const linePad = Math.max(80, targetRect.height * 8);
  const colPad = Math.max(80, targetRect.width * 8);
  let nextTop = viewTop;
  let nextLeft = viewLeft;
  if (relTop < linePad) {
    nextTop = viewTop + (relTop - linePad);
  } else if (relBottom > $renderPane.clientHeight - linePad) {
    nextTop = viewTop + (relBottom - ($renderPane.clientHeight - linePad));
  }
  if (relLeft < colPad) {
    nextLeft = viewLeft + (relLeft - colPad);
  } else if (relRight > $renderPane.clientWidth - colPad) {
    nextLeft = viewLeft + (relRight - ($renderPane.clientWidth - colPad));
  }
  const maxTop = Math.max(0, $renderPane.scrollHeight - $renderPane.clientHeight);
  const maxLeft = Math.max(0, $renderPane.scrollWidth - $renderPane.clientWidth);
  $renderPane.scrollTop = Math.max(0, Math.min(maxTop, nextTop));
  $renderPane.scrollLeft = Math.max(0, Math.min(maxLeft, nextLeft));
}

async function ensureSoundfontLoaded() {
  // already loaded
  const desired = soundfontName || "TimGM6mb.sf2";
  if (
    soundfontReadyName === desired
    && (soundfontSource !== "abc2svg.sf2" || (window.abc2svg && window.abc2svg.sf2))
  ) return;
  if (soundfontLoadPromise && soundfontLoadTarget === desired) return soundfontLoadPromise;

  if (!window.abc2svg) window.abc2svg = {};

  const withTimeout = (promise, ms, label) => {
    const timeoutMs = Number(ms) > 0 ? Number(ms) : 0;
    if (!timeoutMs) return promise;
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error(`${label || "Operation"} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      Promise.resolve(promise).then((value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  };

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
    let b64 = "";
    try {
      // Reading and base64-encoding SF2 can be slow on some platforms; avoid hanging forever.
      b64 = await withTimeout(window.api.readFileBase64(sf2Url), 15000, "Soundfont load");
    } catch (e) {
      // Fallback: let the player load SF2 from a local file URL instead of embedding base64.
      window.abc2svg.sf2 = null;
      soundfontSource = sf2Url;
      soundfontReadyName = name;
      return;
    }
    if (!b64 || !b64.length) throw new Error("SF2 base64 is empty");
    window.abc2svg.sf2 = b64; // raw base64
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
	      const loopRange = shouldLoop ? (activeLoopRange || activePlaybackRange) : null;
      isPlaying = false;
      isPaused = false;
      waitingForFirstNote = false;
      setStatus("OK");
      updatePlayButton();
      clearNoteSelection();
      clearPlaybackNoteOnEls();
		      if (!shouldLoop) {
		        resumeStartIdx = null;
		        activePlaybackRange = null;
		        activePlaybackEndAbcOffset = null;
		        activePlaybackEndSymbol = null;
		        activeLoopRange = null;
		        playbackStartArmed = false;
		        currentPlaybackPlan = null;
		        // Transport: end-of-tune behaves like Stop (playhead=0).
		      }
      if (shouldLoop && followPlayback && lastRenderIdx != null && editorView) {
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
	          if (!loopRange || !activePlaybackRange || !activePlaybackRange.loop) return;
	          if (pendingPlaybackPlan) {
	            const plan = pendingPlaybackPlan;
	            pendingPlaybackPlan = null;
	            currentPlaybackPlan = plan;
	            applyPlaybackPlanSpeed(plan);
	            startPlaybackFromRange({
	              startOffset: plan.rangeStart,
	              endOffset: plan.rangeEnd,
	              origin: focusModeEnabled ? "focus" : "transport",
	              loop: plan.loopEnabled,
	            }).catch(() => {});
	            updatePracticeUi();
	            return;
	          }
	          startPlaybackFromRange(loopRange).catch(() => {});
	        });
	      }
    },
    onnote: (i, on) => {
      lastPlaybackIdx = i;
      if (on && waitingForFirstNote) {
        waitingForFirstNote = false;
        setStatus("Playing…");
        setSoundfontCaption();
      }
      if (isPreviewing) return;
      if (on) {
        if (Number.isFinite(lastPlaybackOnIstart) && Number.isFinite(i) && i < lastPlaybackOnIstart && window.__abcarusDebugPlayback) {
          console.log("[abcarus] playback jump (repeat?)", { from: lastPlaybackOnIstart, to: i });
        }
        if (window.__abcarusDebugParts === true && Number.isFinite(i)) {
          try {
            const sym = findSymbolAtOrBefore(i);
            const letter = (sym && sym.part && sym.part.text) ? (String(sym.part.text || "")[0] || "?") : null;
            if (letter) console.log("[abcarus] part start", { part: letter, istart: i });
            if (Number.isFinite(lastPlaybackOnIstart) && i < lastPlaybackOnIstart) {
              let s = sym;
              let guard = 0;
              let inferred = null;
              while (s && guard < 200000) {
                if (s.part && s.part.text) { inferred = String(s.part.text || "")[0] || "?"; break; }
                s = s.ts_prev;
                guard += 1;
              }
              console.log("[abcarus] part jump", { from: lastPlaybackOnIstart, to: i, inferredPart: inferred });
            }
          } catch {}
        }
        lastPlaybackOnIstart = i;
      }
	      // End-of-range handling is done by abc2svg's snd engine via `s_end` (see `activePlaybackEndSymbol`).
      const editorIdx = Math.max(0, i - playbackIndexOffset);
      const editorLen = editorView ? editorView.state.doc.length : 0;
      const fromInjected = editorLen && editorIdx >= editorLen;
      if (on && !fromInjected) {
        // Playback per-note trace/diagnostics is opt-in to keep hot paths lean.
        // Enable via DevTools: `window.__abcarusPlaybackTrace = true` (no reload required).
        const traceEnabled = window.__abcarusPlaybackTrace === true;
        // Loop invariance guard: only enforce when PlaybackRange is expected to match the active loop.
        // In Focus, playback can resume mid-loop, so origins may differ and the guard should not fire.
        if (
          activePlaybackRange
          && activePlaybackRange.loop
          && activePlaybackRange.origin === playbackRange.origin
          && playbackRange.startOffset !== activePlaybackRange.startOffset
        ) {
          // Possibly correctness-critical: this guards against state races that can break subsequent playback.
          stopPlaybackFromGuard("Loop invariance violated: PlaybackRange.startOffset mutated.");
          return;
        }
	        // No extra end-of-range guard here: we rely on `s_end` to stop deterministically (and to allow looping).
        if (traceEnabled) {
          const timestamp = typeof performance !== "undefined" ? performance.now() : Date.now();
          const seq = (playbackTraceSeq += 1);

          // Trace-only diagnostics: keep opt-in unless proven correctness-critical.
          if (lastTraceRunId !== playbackRunId) {
            stopPlaybackFromGuard("Trace run id mismatch.");
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
      }
      // Important: never let injected voices (e.g. DRUM appended to payload) steal the pending UI update,
      // otherwise follow-highlight becomes "blinking"/pale because the RAF processes only the injected istart and returns.
      if (on && !fromInjected) schedulePlaybackUiUpdate(i);
    },
    errmsg: (m, line, col) => {
      const loc = Number.isFinite(line) && Number.isFinite(col)
        ? { line: line + 1, col: col + 1 }
        : null;
      logErr(m, loc);
    },
    err: (m) => logErr(m),
  });

  // Expose for debugging in the console:
  window.p = player;

	  // Guard against NaN speed from localStorage (and allow Focus to override speed deterministically):
  if (typeof player.set_speed === "function") {
    const next = Number(desiredPlayerSpeed);
    player.set_speed(Number.isFinite(next) && next > 0 ? next : 1);
  }

  // Key: tell snd-1.js to use SF2 from window.abc2svg.sf2
  if (typeof player.set_sfu === "function") player.set_sfu(soundfontSource || "abc2svg.sf2");
  try { sessionStorage.setItem("audio", "sf2"); } catch {}

  return player;
}

function buildPlaybackState(firstSymbol) {
  const symbols = [];
  const measures = [];
  const barIstarts = [];
  const voiceEventsById = new Map(); // voiceId -> [{time, istart}]
  const voiceEventsByIndex = new Map(); // voiceIndex -> [{time, istart}]
  const pushUnique = (arr, symbol) => {
    if (!symbol || !Number.isFinite(symbol.istart)) return;
    if (arr.length && arr[arr.length - 1].istart === symbol.istart) return;
    arr.push({ istart: symbol.istart, symbol });
  };
  const isPlayableSymbol = (symbol) => !!(symbol && Number.isFinite(symbol.dur) && symbol.dur > 0);
  const isBarLikeSymbol = (symbol) => !!(symbol && (symbol.bar_type || symbol.type === 14));

  let s = firstSymbol;
  let guard = 0;
  let preferredVoiceId = null;
  let preferredVoiceIndex = null;
  let lockedPrimaryVoice = false;
  const editorLen = editorView ? editorView.state.doc.length : 0;
  const editorMaxIstart = (Number.isFinite(playbackIndexOffset) ? playbackIndexOffset : 0) + (Number.isFinite(editorLen) ? editorLen : 0);
  const isInjectedSymbol = (symbol) => {
    if (!symbol || !Number.isFinite(symbol.istart)) return false;
    if (!editorLen) return false;
    return symbol.istart >= editorMaxIstart;
  };
  const considerVoice = (symbol) => {
    if (!symbol || !symbol.p_v) return;
    const id = symbol.p_v.id ? String(symbol.p_v.id) : null;
    if (id && id.toUpperCase() === "DRUM") return;
    const v = Number.isFinite(symbol.p_v.v) ? symbol.p_v.v : null;
    // Convention: if V:1 exists, Follow should use it as the primary voice.
    // Some abc2svg timelines assign voice indices that do not correspond to V: numbering.
    if (!lockedPrimaryVoice && id === "1") {
      preferredVoiceId = id;
      preferredVoiceIndex = v;
      lockedPrimaryVoice = true;
      return;
    }
    if (lockedPrimaryVoice) return;
    if (preferredVoiceIndex == null) {
      preferredVoiceIndex = v;
      preferredVoiceId = id;
      return;
    }
    if (v != null && preferredVoiceIndex != null && v < preferredVoiceIndex) {
      preferredVoiceIndex = v;
      preferredVoiceId = id;
      return;
    }
    if (preferredVoiceIndex == null && v != null) {
      preferredVoiceIndex = v;
      preferredVoiceId = id;
    }
  };

  const pushVoiceEvent = (symbol) => {
    if (!symbol || !symbol.p_v) return;
    if (!isPlayableSymbol(symbol)) return;
    if (!Number.isFinite(symbol.time) || !Number.isFinite(symbol.istart)) return;
    const pv = symbol.p_v;
    const id = pv.id != null ? String(pv.id) : null;
    const v = Number.isFinite(pv.v) ? String(pv.v) : null;
    const evt = { time: symbol.time, istart: symbol.istart };
    const push = (map, key) => {
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(evt);
    };
    // Keep both maps available; Follow will prefer id but can fall back to index.
    // IMPORTANT: keep these separate to avoid key collisions (e.g. voiceId "1" vs voiceIndex "1").
    if (id && id.toUpperCase() !== "DRUM") push(voiceEventsById, id);
    if (v != null) push(voiceEventsByIndex, v);
  };

  if (s && !isInjectedSymbol(s)) pushUnique(symbols, s);
  if (s && !isInjectedSymbol(s)) pushUnique(measures, s);

  while (s && guard < 200000) {
    if (!isInjectedSymbol(s)) {
      pushUnique(symbols, s);
      if (isBarLikeSymbol(s) && s.ts_next) {
        // In some abc2svg timelines (multi-voice + injected DRUM), a barline's ts_next may point into
        // the injected tail. For bar-snapping/highlighting we want the next *editor-visible* symbol.
        let next = s.ts_next;
        let hop = 0;
        while (next && isInjectedSymbol(next) && hop < 64) {
          next = next.ts_next;
          hop += 1;
        }
        if (next && !isInjectedSymbol(next)) {
          pushUnique(measures, next);
        }
        barIstarts.push(s.istart);
      }
      if (isPlayableSymbol(s)) {
        considerVoice(s);
        pushVoiceEvent(s);
      }
    }
    s = s.ts_next;
    guard += 1;
  }

  // Sort by istart (text position) so binary searches behave deterministically even with multi-voice timelines.
  // Note: injected/appended voices (e.g. DRUM) are filtered out above, so these maps reflect editor-visible ABC.
  symbols.sort((a, b) => a.istart - b.istart);
  measures.sort((a, b) => a.istart - b.istart);

  const uniqSorted = (arr) => {
    const out = [];
    let last = null;
    for (const v of arr.slice().sort((a, b) => a - b)) {
      if (!Number.isFinite(v)) continue;
      if (last == null || v !== last) out.push(v);
      last = v;
    }
    return out;
  };

  // IMPORTANT:
  // Keep `*_Istarts` aligned 1:1 with their corresponding `symbols/measures` arrays.
  // Some timelines contain multiple symbols with the same `istart` (multi-voice / decorations / non-playable markers).
  // If we de-duplicate istarts here, binary-search indices no longer match array indices and Follow/voice selection breaks.
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

  const buildTimelineObject = (eventsMap) => {
    const out = {};
    for (const [key, list] of eventsMap.entries()) {
      if (!key || !Array.isArray(list) || !list.length) continue;
      const sorted = list.slice().sort((a, b) => (a.time - b.time) || (a.istart - b.istart));
      const times = [];
      const istarts = [];
      let lastTime = null;
      let lastIstart = null;
      for (const e of sorted) {
        if (!e || !Number.isFinite(e.time) || !Number.isFinite(e.istart)) continue;
        // Keep duplicates (chords), but drop exact duplicates to reduce noise.
        if (lastTime === e.time && lastIstart === e.istart) continue;
        times.push(e.time);
        istarts.push(e.istart);
        lastTime = e.time;
        lastIstart = e.istart;
      }
      if (times.length) out[key] = { times, istarts };
    }
    return out;
  };

  const voiceTimeline = {
    byId: buildTimelineObject(voiceEventsById),
    byIndex: buildTimelineObject(voiceEventsByIndex),
  };

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
    preferredVoiceId,
    preferredVoiceIndex,
    symbols,
    measures,
    symbolIstarts,
    measureIstarts,
    barIstarts: uniqSorted(barIstarts),
    timeline,
    voiceTimeline,
  };
}

function setFollowVoiceFromPlayback() {
  followVoiceId = null;
  followVoiceIndex = null;
  if (!playbackState) return;
  // Prefer a stable "primary" voice (first staff) to avoid highlight jumping on multi-staff scores.
  if (playbackState.preferredVoiceId) followVoiceId = playbackState.preferredVoiceId;
  if (Number.isFinite(playbackState.preferredVoiceIndex)) followVoiceIndex = playbackState.preferredVoiceIndex;
  if (followVoiceId || followVoiceIndex != null) return;
  if (!playbackState.startSymbol) return;
  const voice = playbackState.startSymbol.p_v;
  if (!voice) return;
  if (voice.id) followVoiceId = voice.id;
  if (Number.isFinite(voice.v)) followVoiceIndex = voice.v;
}

function lowerBoundIstart(list, value) {
  if (!Array.isArray(list) || !list.length) return 0;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundIstart(list, value) {
  if (!Array.isArray(list) || !list.length) return 0;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundTime(list, value) {
  if (!Array.isArray(list) || !list.length) return 0;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function findSymbolAtOrBefore(idx) {
  if (!playbackState || !playbackState.symbols.length) return null;
  const list = playbackState.symbolIstarts || [];
  if (!list.length) return null;
  const pos = upperBoundIstart(list, idx) - 1;
  const best = Math.max(0, Math.min(playbackState.symbols.length - 1, pos));
  const item = playbackState.symbols[best];
  return item ? item.symbol : null;
}

function findSymbolAtOrAfter(idx) {
  if (!playbackState || !playbackState.symbols.length) return null;
  const list = playbackState.symbolIstarts || [];
  if (!list.length) return null;
  const pos = lowerBoundIstart(list, idx);
  const best = Math.max(0, Math.min(playbackState.symbols.length - 1, pos));
  const item = playbackState.symbols[best];
  return item ? item.symbol : null;
}

function findMeasureIndex(idx) {
  if (!playbackState || !playbackState.measures.length) return 0;
  const list = playbackState.measureIstarts || [];
  if (!list.length) return 0;
  const pos = upperBoundIstart(list, idx) - 1;
  return Math.max(0, Math.min(playbackState.measures.length - 1, pos));
}

function stopPlaybackForRestart() {
  if (player && typeof player.stop === "function") {
    suppressOnEnd = true;
    try { player.stop(); } catch {}
  }
  clearNoteSelection();
  resetPlaybackUiState();
}

function stopPlaybackTransport() {
  playbackStartToken += 1;
  if (player && (isPlaying || isPaused || waitingForFirstNote) && typeof player.stop === "function") {
    suppressOnEnd = true;
    try { player.stop(); } catch {}
  }
  // abc2svg playback mutates internal tune/parts structures; force a clean re-prepare after Stop.
  playbackNeedsReprepare = true;
  isPlaying = false;
  isPaused = false;
  waitingForFirstNote = false;
  transportPlayheadOffset = 0;
  transportJumpHighlightActive = false;
  suppressTransportJumpClearOnce = false;
  setPracticeBarHighlight(null);
  clearSvgPracticeBarHighlight();
  resumeStartIdx = null;
  activePlaybackRange = null;
  activePlaybackEndAbcOffset = null;
  activePlaybackEndSymbol = null;
  playbackStartArmed = false;
  currentPlaybackPlan = null;
  setStatus("OK");
  updatePlayButton();
  clearNoteSelection();
  resetPlaybackUiState();
  setSoundfontCaption();

  // Transport: explicit Stop resets internal playhead to 0.
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

function sanitizeFontAssetName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  // Backward-compat: accept plain filenames and treat them as bundled.
  if (/^[A-Za-z0-9._-]+\.(otf|ttf|woff2?)$/i.test(raw)) return `bundled:${raw}`;
  const m = raw.match(/^(bundled|user):(.*)$/);
  if (!m) return "";
  const origin = m[1];
  const fileName = String(m[2] || "").trim();
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return "";
  if (!/^[A-Za-z0-9._-]+\.(otf|ttf|woff2?)$/i.test(fileName)) return "";
  return `${origin}:${fileName}`;
}

function setAbc2svgFontsFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  abc2svgNotationFontFile = sanitizeFontAssetName(settings.abc2svgNotationFontFile);
  abc2svgTextFontFile = sanitizeFontAssetName(settings.abc2svgTextFontFile);
}

function filePathToFileUrl(filePath) {
  const raw = String(filePath || "");
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  // Best-effort: keep it simple; spaces are the common case.
  return prefix + encodeURI(normalized);
}

function buildAbc2svgFontHeaderLayer() {
  const lines = [];
  const comment = "% ABCarus: font overrides (auto)";

  if (abc2svgNotationFontFile) {
    const m = abc2svgNotationFontFile.match(/^(bundled|user):(.*)$/);
    if (m) {
      const origin = m[1];
      const fileName = m[2];
      const url = origin === "bundled"
        ? `../../assets/fonts/notation/${fileName}`
        : (fontDirs && fontDirs.userDir
          ? filePathToFileUrl(window.api && window.api.pathJoin ? window.api.pathJoin(fontDirs.userDir, fileName) : `${fontDirs.userDir}/${fileName}`)
          : "");
      if (url) lines.push(`%%musicfont url("${url}") *`);
    }
  }

  if (abc2svgTextFontFile) {
    const m = abc2svgTextFontFile.match(/^(bundled|user):(.*)$/);
    let url = "";
    if (m) {
      const origin = m[1];
      const fileName = m[2];
      url = origin === "bundled"
        ? `../../assets/fonts/notation/${fileName}`
        : (fontDirs && fontDirs.userDir
          ? filePathToFileUrl(window.api && window.api.pathJoin ? window.api.pathJoin(fontDirs.userDir, fileName) : `${fontDirs.userDir}/${fileName}`)
          : "");
    }
    if (url) {
      const directives = [
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
      ];
      for (const d of directives) {
        lines.push(`%%${d} url("${url}") *`);
      }
    }
  }

  if (!lines.length) return "";
  return `${comment}\n${lines.join("\n")}`;
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
  if (!followPlayback) {
    clearSvgPlayhead();
    clearSvgFollowBarHighlight();
    clearSvgFollowMeasureHighlight();
  }
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return fallback;
}

function clampNumber(value, min, max, fallback) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function applyFollowHighlightCssVars() {
  const root = document.documentElement;
  if (!root || !root.style) return;
  root.style.setProperty("--abcarus-follow-color", followHighlightColor);
  root.style.setProperty("--abcarus-follow-bar-opacity", String(followHighlightBarOpacity));
  root.style.setProperty("--abcarus-follow-measure-opacity", String(followMeasureOpacity));
  root.style.setProperty("--abcarus-follow-playhead-opacity", String(followPlayheadOpacity));
  if (followMeasureColor) {
    root.style.setProperty("--abcarus-follow-measure-color", followMeasureColor);
  } else {
    root.style.removeProperty("--abcarus-follow-measure-color");
  }
}

function setFollowHighlightFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  followHighlightColor = normalizeHexColor(settings.followHighlightColor, followHighlightColor);
  const measureColorRaw = String(settings.followMeasureColor || "").trim();
  if (!measureColorRaw) {
    followMeasureColor = "";
  } else {
    followMeasureColor = normalizeHexColor(measureColorRaw, followMeasureColor || followHighlightColor);
  }
  followHighlightBarOpacity = clampNumber(settings.followHighlightBarOpacity, 0, 1, followHighlightBarOpacity);
  followMeasureOpacity = clampNumber(settings.followMeasureOpacity, 0, 1, followMeasureOpacity);
  followPlayheadOpacity = clampNumber(settings.followPlayheadOpacity, 0, 1, followPlayheadOpacity);
  followPlayheadWidth = clampNumber(settings.followPlayheadWidth, 1, 6, followPlayheadWidth);
  followPlayheadPad = clampNumber(settings.followPlayheadPad, 0, 24, followPlayheadPad);
  followPlayheadBetweenNotesWeight = clampNumber(settings.followPlayheadBetweenNotesWeight, 0, 1, followPlayheadBetweenNotesWeight);
  followPlayheadShift = clampNumber(settings.followPlayheadShift, -20, 20, followPlayheadShift);
  followPlayheadFirstBias = clampNumber(settings.followPlayheadFirstBias, 0, 20, followPlayheadFirstBias);
  applyFollowHighlightCssVars();
}

function clampInt(value, min, max, fallback) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  const n = Math.floor(v);
  return Math.max(min, Math.min(max, n));
}

function pickStartFromListAtOrAfter(list, minRenderIdx) {
  if (!Array.isArray(list) || !list.length) return null;
  const min = Number(minRenderIdx);
  if (!Number.isFinite(min)) return list[0];
  for (const v of list) {
    if (Number.isFinite(v) && v >= min) return v;
  }
  return list[list.length - 1];
}

function findBoundaryAfter(sorted, target) {
  if (!Array.isArray(sorted) || !sorted.length) return null;
  const t = Number(target);
  if (!Number.isFinite(t)) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid];
    if (v > t) {
      best = v;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

function resolveMeasureStartRenderIdx(measureIndex, n, { minBound, minStartRenderIdx } = {}) {
  if (!measureIndex) return null;
  const num = clampInt(n, 0, 100000, 0);
  if (num <= 0) return null;
  const anchor = Number.isFinite(Number(measureIndex.anchor)) ? Number(measureIndex.anchor) : 0;
  const istarts = Array.isArray(measureIndex.istarts) ? measureIndex.istarts : null;
  const bound = Number.isFinite(Number(minBound)) ? Number(minBound) : null;

  // Preferred: abc2svg bar_num mapping (can contain multiple occurrences due to repeats/voltas).
  const list = (measureIndex.byNumber && typeof measureIndex.byNumber.get === "function")
    ? measureIndex.byNumber.get(num)
    : null;
  if (Array.isArray(list) && list.length) {
    const boundPick = (bound != null) ? pickStartFromListAtOrAfter(list, bound) : list[0];
    const minPick = Number.isFinite(Number(minStartRenderIdx)) ? pickStartFromListAtOrAfter(list, Number(minStartRenderIdx)) : boundPick;
    return Number.isFinite(Number(minPick)) ? Number(minPick) : Number(boundPick);
  }

  // Fallback: list-of-measures index (used by older/edge cases).
  if (istarts && istarts.length) {
    const slot = (num - 1) + anchor;
    const v = istarts[Math.max(0, Math.min(istarts.length - 1, slot))];
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function computeFocusLoopPlaybackRange() {
  if (!focusModeEnabled) return null;
  if (!playbackLoopEnabled) return null;
  if (!editorView) return null;
  if (rawMode) return null;

  const measureIndex = getRenderMeasureIndex();
  if (!measureIndex || !Array.isArray(measureIndex.istarts) || !measureIndex.istarts.length) return null;

  const renderOffset = Number(measureIndex.offset) || 0;
  const anchor = Number.isFinite(Number(measureIndex.anchor)) ? Number(measureIndex.anchor) : 0;
  const minBound = measureIndex.istarts[Math.max(0, Math.min(measureIndex.istarts.length - 1, anchor))];

  const fromMeasure = clampInt(playbackLoopFromMeasure, 0, 100000, 0);
  const toMeasure = clampInt(playbackLoopToMeasure, 0, 100000, 0);

  const fromNum = fromMeasure > 0 ? fromMeasure : 1;
  const startRender = resolveMeasureStartRenderIdx(measureIndex, fromNum, { minBound });
  if (!Number.isFinite(startRender)) return null;

  let endRender = null;
  if (toMeasure > 0) {
    const endStart = resolveMeasureStartRenderIdx(measureIndex, toMeasure, { minBound, minStartRenderIdx: startRender });
    if (Number.isFinite(endStart)) {
      // End offset is the *next* bar start after the chosen end measure start.
      endRender = findBoundaryAfter(measureIndex.istarts, endStart);
    }
  }

  const max = editorView.state.doc.length;
  const startOffset = Math.max(0, Math.min(max, Math.floor(startRender - renderOffset)));
  const endOffset = (endRender == null || !Number.isFinite(endRender))
    ? null
    : Math.max(0, Math.min(max, Math.floor(Number(endRender) - renderOffset)));

  if (endOffset != null && endOffset <= startOffset) {
    // Invalid range; fallback to looping whole tune from the computed start.
    return { startOffset, endOffset: null, origin: "focus", loop: true };
  }
  return { startOffset, endOffset, origin: "focus", loop: true };
}

function updatePracticeUi() {
  if ($practiceTempoWrap) $practiceTempoWrap.hidden = !focusModeEnabled;
  if ($practiceTempo && focusModeEnabled && document.activeElement !== $practiceTempo) {
    const value = String(practiceTempoMultiplier);
    if ($practiceTempo.value !== value) $practiceTempo.value = value;
  }

  if ($practiceLoopWrap) $practiceLoopWrap.hidden = !focusModeEnabled;
  if ($practiceLoopEnabled && document.activeElement !== $practiceLoopEnabled) {
    $practiceLoopEnabled.checked = Boolean(playbackLoopEnabled);
  }
  if ($practiceLoopFrom && document.activeElement !== $practiceLoopFrom) {
    $practiceLoopFrom.value = String(clampInt(playbackLoopFromMeasure, 0, 100000, 0) || 0);
  }
  if ($practiceLoopTo && document.activeElement !== $practiceLoopTo) {
    $practiceLoopTo.value = String(clampInt(playbackLoopToMeasure, 0, 100000, 0) || 0);
  }

  // Keep the pending plan in sync when Focus is on and playback is idle.
  if (focusModeEnabled && !isPlaybackBusy()) {
    syncPendingPlaybackPlan();
  }
}

function normalizeLoopBounds(fromMeasure, toMeasure, { changedField } = {}) {
  const from = clampInt(fromMeasure, 0, 100000, 0);
  const to = clampInt(toMeasure, 0, 100000, 0);
  if (from > 0 && to > 0 && from > to) {
    if (changedField === "to") return { from: to, to };
    return { from, to: from };
  }
  return { from, to };
}

function maybeResetFocusLoopForTune(tuneId, { updateUi = true } = {}) {
  if (!focusModeEnabled) return;
  const id = tuneId != null ? String(tuneId) : "";
  if (!id) return;
  const savedId = playbackLoopTuneId != null ? String(playbackLoopTuneId) : "";
  if (savedId && savedId === id) return;

  const normalized = normalizeLoopBounds(FOCUS_LOOP_DEFAULT_FROM, FOCUS_LOOP_DEFAULT_TO);
  playbackLoopFromMeasure = normalized.from;
  playbackLoopToMeasure = normalized.to;
  syncPendingPlaybackPlan();
  if (updateUi) updatePracticeUi();
}

function setLoopFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  playbackLoopEnabled = Boolean(settings.playbackLoopEnabled);
  playbackLoopFromMeasure = clampInt(settings.playbackLoopFromMeasure, 0, 100000, 0);
  playbackLoopToMeasure = clampInt(settings.playbackLoopToMeasure, 0, 100000, 0);
  playbackLoopTuneId = (typeof settings.playbackLoopTuneId === "string") ? settings.playbackLoopTuneId : null;
  updatePracticeUi();
}

function setFollowFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  setFollowHighlightFromSettings(settings);
  if (settings.followPlayback === undefined) return;
  followPlayback = settings.followPlayback !== false;
  updateFollowToggle();
}

function setLayoutFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  const orientation = (settings.layoutSplitOrientation === "horizontal") ? "horizontal" : "vertical";
  rightSplitRatioVertical = clampRatio(settings.layoutSplitRatioVertical, rightSplitRatioVertical);
  rightSplitRatioHorizontal = clampRatio(settings.layoutSplitRatioHorizontal, rightSplitRatioHorizontal);
  applyRightSplitOrientation(orientation);
  applyRightSplitSizesFromRatio();
  if (orientation === "horizontal" && !splitZoomActive) {
    splitPrevRenderZoom = readRenderZoomCss();
    splitZoomActive = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!splitZoomActive || rightSplitOrientation !== "horizontal") return;
        const fit = computeFocusFitZoom();
        if (fit != null) setRenderZoomCss(fit);
      });
    });
  }
}

function setSplitOrientation(nextOrientation, { persist = true, userAction = false } = {}) {
  const next = (nextOrientation === "horizontal") ? "horizontal" : "vertical";
  if (userAction && !isNormalModeForSplitToggle()) {
    showToast("Exit Focus/Raw mode to change split orientation.", 2400);
    return false;
  }
  if (rightSplitOrientation === next) return true;
  if (next === "horizontal") {
    splitPrevRenderZoom = readRenderZoomCss();
    splitZoomActive = true;
  }
  applyRightSplitOrientation(next);
  applyRightSplitSizesFromRatio();
  // Avoid follow-scroll fighting layout reflow right after a toggle.
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  suppressFollowScrollUntilMs = now + 250;
  if (next === "horizontal") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!splitZoomActive || rightSplitOrientation !== "horizontal") return;
        const fit = computeFocusFitZoom();
        if (fit != null) setRenderZoomCss(fit);
      });
    });
  } else if (splitPrevRenderZoom != null) {
    splitZoomActive = false;
    setRenderZoomCss(splitPrevRenderZoom);
    splitPrevRenderZoom = null;
  }
  if (persist) scheduleSaveLayoutPrefs({ layoutSplitOrientation: next });
  showToast(next === "horizontal" ? "Split: Horizontal" : "Split: Vertical", 1500);
  return true;
}

function toggleSplitOrientation({ userAction = false } = {}) {
  const next = rightSplitOrientation === "horizontal" ? "vertical" : "horizontal";
  return setSplitOrientation(next, { persist: true, userAction });
}

function setPlaybackAutoScrollFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  playbackAutoScrollMode = normalizeAutoScrollMode(settings.playbackAutoScrollMode);
  playbackAutoScrollHorizontal = settings.playbackAutoScrollHorizontal !== false;
  playbackAutoScrollPauseMs = clampNumber(settings.playbackAutoScrollPauseMs, 0, 5000, playbackAutoScrollPauseMs);
  if (normalizeAutoScrollMode(playbackAutoScrollMode) === "off") {
    cancelPlaybackAutoScroll();
  }
}

function setSoundfontFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  const next = String(settings.soundfontName || "");
  soundfontName = next || "TimGM6mb.sf2";
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
  if (next !== prev) scheduleRenderNow();
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
    const fontLayerRaw = buildAbc2svgFontHeaderLayer();
    if (fontLayerRaw) layers.push(fontLayerRaw);
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
  const src = String(line || "");
  const start = Number(idx) || 0;
  if (start < 0 || start >= src.length) return null;
  const ch = src[start];
  if (!ch) return null;
  // Barline tokens in ABC are composed of |, :, [, ], and the special dotted barline .|
  // Important: '[' is also used for chord notes (e.g. [CEG]), so only treat it as a barline
  // when it's clearly a barline/volta marker (e.g. [|, [], [1, [2).
  if (ch === ".") {
    if (start + 1 >= src.length || src[start + 1] !== "|") return null;
  } else if (ch === "[") {
    const next = start + 1 < src.length ? src[start + 1] : "";
    if (!(next === "|" || next === "]" || /[0-9]/.test(next))) return null;
  } else if (ch === ":") {
    const next = start + 1 < src.length ? src[start + 1] : "";
    // Prevent false positives on inline fields like "V:1" inside "[V:1 ...]".
    if (/[0-9]/.test(next)) return null;
  } else if (ch !== "|" && ch !== ":") {
    return null;
  }
  let end = start;
  while (end < src.length) {
    const c = src[end];
    if (c === ".") {
      if (end + 1 < src.length && src[end + 1] === "|") {
        end += 1;
        continue;
      }
      break;
    }
    if (!/[|[\]:]/.test(c)) break;
    end += 1;
  }
  while (end < src.length && /[0-9]/.test(src[end])) end += 1;
  if (end <= start) return null;
  return { token: src.slice(start, end), len: end - start };
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
  function applyMidiDirective(directiveLine) {
    const line = String(directiveLine || "").trim();
    if (!line) return;
    if (/^%%MIDI\s+drumon\b/i.test(line)) {
      drumOn = true;
      return;
    }
    if (/^%%MIDI\s+drumoff\b/i.test(line)) {
      drumOn = false;
      return;
    }
    const drumBarsMatch = line.match(/^%%MIDI\s+drumbars\s+(\d+)/i);
    if (drumBarsMatch) {
      const nextBars = Number(drumBarsMatch[1]);
      if (Number.isFinite(nextBars) && nextBars > 0) drumBars = nextBars;
      return;
    }
    const drumMatch = line.match(/^%%MIDI\s+drum\s+(.+)$/i);
    if (drumMatch) {
      const rest = drumMatch[1].trim();
      // Compatibility feature (ABCarus): allow continuation for long directives via `+:`.
      // Example:
      //   %%MIDI drum d3 d d z d
      //   %%MIDI drum +: 36 37 37 37
      //   %%MIDI drum +: 100 120 120 120
      // abc2svg does not define this behavior, but users often write long drum directives this way.
      if (/^\+:/i.test(rest)) {
        if (!currentPattern || !currentPattern.hitCount) return;
        const nums = rest.replace(/^\+:\s*/i, "").split(/\s+/).map((n) => Number(n)).filter((n) => Number.isFinite(n));
        if (!nums.length) return;
        const needed = Number(currentPattern.hitCount) || 0;
        let i = 0;
        while (i < nums.length && currentPattern.pitches.length < needed) currentPattern.pitches.push(nums[i++]);
        while (i < nums.length && currentPattern.velocities.length < needed) currentPattern.velocities.push(nums[i++]);
        return;
      }

      const tokens = rest.split(/\s+/).filter(Boolean);
      // Pattern is the concatenation of non-numeric tokens at the start.
      // This makes `%%MIDI drum d3 d d z d` work as if it was `d3ddzd`.
      const isInt = (t) => /^-?\d+$/.test(String(t || "").trim());
      let firstNum = -1;
      for (let i = 0; i < tokens.length; i += 1) {
        if (isInt(tokens[i])) { firstNum = i; break; }
      }
      const patternTokens = (firstNum === -1 ? tokens : tokens.slice(0, firstNum)).filter((t) => t !== "+:");
      const patternText = patternTokens.join("");
      const pattern = parseDrumPattern(patternText);
      if (!pattern) return;

      const nums = (firstNum === -1 ? [] : tokens.slice(firstNum))
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n));
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
  }
  const applyInlineField = (field, value) => {
    const f = String(field || "").trim().toUpperCase();
    const v = String(value || "").trim();
    if (!f) return;
    if (f === "V") {
      const voice = v.split(/\s+/)[0];
      if (voice) {
        currentVoice = voice;
        if (!firstVoice) firstVoice = voice;
        if (inBody && !primaryVoice) primaryVoice = voice;
      }
      return;
    }
    if (f === "K") {
      inBody = true;
      if (!primaryVoice && firstVoice) primaryVoice = firstVoice;
      return;
    }
    if (f === "M") {
      const parsed = parseFraction(v);
      if (parsed) meter = parsed;
      return;
    }
    if (f === "L") {
      const parsed = parseFraction(v);
      if (parsed) unit = parsed;
      return;
    }
    if (f === "I") {
      // Support inline MIDI directives like [I:MIDI drum ...]
      const cleaned = v.replace(/^\s*MIDI\s+/i, "");
      if (cleaned !== v) applyMidiDirective(`%%MIDI ${cleaned}`);
    }
  };
  const applyInlineFieldsFromLine = (line) => {
    const s = String(line || "");
    const re = /\[\s*([A-Za-z]+)\s*:\s*([^\]]*)\]/g;
    let match = null;
    while ((match = re.exec(s)) !== null) {
      applyInlineField(match[1], match[2]);
    }
  };
  const parseFieldValue = (line, field) => {
    const re = new RegExp(`\\b${field}:\\s*([^\\]\\s]+)`);
    const match = line.match(re);
    return match ? match[1] : null;
  };
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // Compatibility feature (ABCarus): allow `+:` continuation lines for long directives.
    // If users choose to omit repeating the directive prefix (e.g. `+: 36 37 ...` after `%%MIDI drum ...`),
    // treat it as continuing the last `%%MIDI drum` line for drum extraction.
    if (/^\+:/i.test(trimmed)) {
      applyMidiDirective(`%%MIDI drum ${trimmed}`);
      continue;
    }
    // Inline field directives like "[P:...]" or "[M:...]" are not musical bars, but some of them
    // affect playback state (meter/unit/voice/body start), so we handle those and skip scanning.
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      // Handle multi-inline-field lines like: [M:7/8][Q:1/4=220]
      const remainder = trimmed.replace(/\[\s*[A-Za-z]+\s*:\s*[^\]]*\]/g, "").trim();
      if (remainder === "") {
        applyInlineFieldsFromLine(trimmed);
        continue;
      }
    }
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
    if (/^%%MIDI\b/i.test(trimmed)) {
      applyMidiDirective(trimmed);
      continue;
    }
    if (/^I:\s*MIDI\b/i.test(trimmed)) {
      applyMidiDirective(trimmed.replace(/^I:\s*/i, "%%"));
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
      if (!inQuote && ch === "[") {
        const slice = line.slice(i);
        if (/^\[\s*[A-Za-z]+:/.test(slice)) {
          const close = line.indexOf("]", i + 1);
          if (close >= 0) {
            const inner = line.slice(i + 1, close);
            const match = inner.match(/^\s*([A-Za-z]+)\s*:\s*(.*)\s*$/);
            if (match) applyInlineField(match[1], match[2]);
            i = close + 1;
            continue;
          }
        }
      }
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
  const firstBarLineIndex = out.length;

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
  } else if (sep && out.length > firstBarLineIndex) {
    // If we flushed exactly on the last bar boundary, the final separator was never emitted.
    // Append it to the last bar line for a stable barline signature.
    const lastIdx = out.length - 1;
    const lastLine = out[lastIdx] || "";
    if (lastLine && !/[|:\]]\s*$/.test(lastLine)) {
      out[lastIdx] = `${lastLine}${sep}`;
    }
  }
  return out.join("\n");
}

function injectDrumPlayback(text) {
  if (text === lastDrumInjectInput && lastDrumInjectResult) {
    return lastDrumInjectResult;
  }
  lastDrumPlaybackActive = false;
  lastDrumSignatureDiff = null;
  if (window.__abcarusDisableDrumInjection === true) {
    const res = { text, changed: false, insertAtLine: null, lineCount: 0 };
    lastDrumInjectInput = text;
    lastDrumInjectResult = res;
    return res;
  }
  if (/^\s*V:\s*DRUM\b/im.test(text || "")) {
    const res = { text, changed: false, insertAtLine: null, lineCount: 0 };
    lastDrumInjectInput = text;
    lastDrumInjectResult = res;
    return res;
  }
  const info = extractDrumPlaybackBars(text);
  const expectedSig = computeExpectedBarSignatureFromInfo(info);
  const drumVoice = buildDrumVoiceText(info);
  if (!drumVoice) {
    const res = { text, changed: false, insertAtLine: null, lineCount: 0 };
    lastDrumInjectInput = text;
    lastDrumInjectResult = res;
    return res;
  }
  const actualSig = extractBarSignatureFromText(drumVoice);
  const sigDiff = diffSignatures(expectedSig, actualSig);
  if (!sigDiff.ok) {
    // Safety guard: if our generated drums don't match the barline skeleton, do not inject drums.
    lastDrumPlaybackActive = false;
    lastDrumSignatureDiff = sigDiff;
    const res = { text, changed: false, insertAtLine: null, lineCount: 0, signatureDiff: sigDiff };
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

function normalizeDollarLineBreaksForPlayback(text) {
  const src = String(text || "");
  if (!src.includes("$")) return src;
  // Playback-only cleanup:
  // - Drop "$ %..." tails (common bar/line markers used for layout, irrelevant for playback/drums).
  // - Replace other '$' occurrences with whitespace (some playback parsers treat '$' as a literal token and break repeats).
  const lines = src.split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    // Don't modify linebreak directives themselves; some files use `I:linebreak $`.
    if (!inTextBlock && (/^\s*I:\s*linebreak\b/i.test(rawLine) || /^\s*%%\s*linebreak\b/i.test(rawLine))) {
      out.push(rawLine);
      continue;
    }
    if (inTextBlock || !rawLine.includes("$")) {
      out.push(rawLine);
      continue;
    }
    let lineOut = "";
    let inQuote = false;
    for (let i = 0; i < rawLine.length; i += 1) {
      const ch = rawLine[i];
      if (ch === "\"") {
        inQuote = !inQuote;
        lineOut += ch;
        continue;
      }
      if (!inQuote && ch === "$") {
        lineOut += " ";
        continue;
      }
      lineOut += ch;
    }
    out.push(lineOut);
  }
  return out.join("\n");
}

function normalizeBlankLinesForPlayback(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  if (lines.length <= 2) return String(text || "");
  const out = [];
  let inTextBlock = false;
  let inBody = false;
  const isInlineFieldLine = (line) => isInlineFieldOnlyLine(line);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (!inBody && (/^\s*K:/.test(line) || /^\s*\[\s*K:/.test(trimmed))) inBody = true;
    if (!inBody || inTextBlock) {
      out.push(line);
      continue;
    }
    if (trimmed !== "") {
      out.push(line);
      continue;
    }
    // Inside the tune body, some playback parsers treat blank lines as tune separators.
    // Be conservative: if a blank line is immediately followed by an inline field directive
    // (e.g. [P:...], [M:...], [K:...]), replace it with a comment line for playback only.
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    if (j < lines.length && isInlineFieldLine(lines[j])) {
      out.push("%");
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function sanitizeAbcForPlayback(text) {
  const src = String(text || "");
  const lines = src.split(/\r\n|\n|\r/);
  const out = [];
  const warnings = [];
  let inTextBlock = false;
  let inBody = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (!inBody && (/^\s*K:/.test(rawLine) || /^\s*\[\s*K:/.test(trimmed))) inBody = true;

    if (inTextBlock || !inBody) {
      // Still remove line-continuation backslashes outside text blocks even before body;
      // they are never meaningful for playback parsing.
      const cleaned = rawLine.replace(/[ \t]*\\\s*$/, (m) => {
        warnings.push({ kind: "line-continuation", line: lineIndex + 1 });
        return " ".repeat(String(m || "").length);
      });
      out.push(cleaned);
      continue;
    }

    // Split comments (keep them intact; only sanitize music part).
    let musicPart = rawLine;
    let commentPart = "";
    if (!trimmed.startsWith("%%")) {
      const commentIdx = rawLine.indexOf("%");
      if (commentIdx >= 0) {
        musicPart = rawLine.slice(0, commentIdx);
        commentPart = rawLine.slice(commentIdx);
      }
    }

    // 1) Remove trailing line-continuation backslash: `...\` -> `...`
    musicPart = musicPart.replace(/[ \t]*\\\s*$/, (m) => {
      warnings.push({ kind: "line-continuation", line: lineIndex + 1 });
      return " ".repeat(String(m || "").length);
    });

    // 2) Make multi-repeat tokens more stable: `|:::` -> `|::`, `:::` -> `::`, `:::|` -> `::|`
    // Keep `::` unchanged (common boundary repeat); only collapse 3+ down to the double-repeat form.
    const beforeRepeats = musicPart;
    musicPart = musicPart
      .replace(/\|:{3,}/g, (m) => `|::${" ".repeat(Math.max(0, String(m || "").length - 3))}`)
      .replace(/:{3,}\|/g, (m) => `::|${" ".repeat(Math.max(0, String(m || "").length - 3))}`)
      .replace(/:{3,}/g, (m) => `::${" ".repeat(Math.max(0, String(m || "").length - 2))}`);
    if (musicPart !== beforeRepeats) warnings.push({ kind: "multi-repeat-simplified", line: lineIndex + 1 });

    // 3) Replace spacer rests `y` with normal rests `z` (playback-only stability).
    // Target `y` tokens with optional durations like `y4`, `y2/`, `y/2`.
    const beforeY = musicPart;
    musicPart = musicPart.replace(/(^|[^A-Za-z0-9_])y(?=([0-9]|\/|$))/g, "$1z");
    if (musicPart !== beforeY) warnings.push({ kind: "spacer-rest-y", line: lineIndex + 1 });

    out.push(`${musicPart}${commentPart}`);
  }

  return { text: out.join("\n"), warnings };
}

function isInlineFieldOnlyLine(rawLine) {
  const trimmed = String(rawLine || "").trim();
  if (!trimmed.startsWith("[")) return false;
  let rest = trimmed;
  // Consume one or more leading inline fields: `[P:...] [M:...] ...`
  while (true) {
    const m = rest.match(/^\[\s*[A-Za-z]+\s*:\s*[^\]]*\]\s*/);
    if (!m) break;
    rest = rest.slice(m[0].length);
  }
  const tail = rest.trim();
  if (!tail) return true;
  // Treat "only comment after inline field" as header-like (no music content).
  if (tail.startsWith("%")) return true;
  return false;
}

function detectKeyFieldNotLastBeforeBody(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const isTuneStart = (line) => /^\s*X:/.test(line);
  const isFieldLine = (line) => /^\s*[A-Za-z]:/.test(line);
  const isContinuationLine = (line) => /^\s*\+:\s*/.test(line);
  const isKeyLine = (line) => /^\s*K:/.test(line);
  const isCommentLine = (line) => /^\s*%/.test(line);
  const isDirectiveLine = (line) => /^\s*%%/.test(line);
  const beginsBlock = (trimmed) => {
    if (!/^%%\s*begin/i.test(trimmed)) return null;
    if (/^%%\s*begintext\b/i.test(trimmed)) return "text";
    if (/^%%\s*beginsvg\b/i.test(trimmed)) return "svg";
    if (/^%%\s*beginps\b/i.test(trimmed)) return "ps";
    return "other";
  };
  const endsBlock = (trimmed, block) => {
    if (!block) return false;
    if (block === "text") return /^%%\s*endtext\b/i.test(trimmed);
    if (block === "svg") return /^%%\s*endsvg\b/i.test(trimmed);
    if (block === "ps") return /^%%\s*endps\b/i.test(trimmed);
    if (block === "other") return /^%%\s*end/i.test(trimmed);
    return false;
  };

  const scanTune = (start, end) => {
    let kIdx = -1;
    for (let i = start; i < end; i += 1) {
      if (isKeyLine(lines[i])) { kIdx = i; break; }
    }
    if (kIdx < 0) return null;

    let block = null;
    let bodyStart = end;
    for (let j = kIdx + 1; j < end; j += 1) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (block) {
        if (endsBlock(trimmed, block)) block = null;
        continue;
      }
      const begin = beginsBlock(trimmed);
      if (begin) {
        block = begin;
        continue;
      }
      if (!trimmed) continue;
      if (isCommentLine(raw)) continue;
      // Inline field-only lines like `[P:A]` or `[M:...]` are tune-body directives (even if they contain no notes).
      // Treat them as the body start so we don't reorder K: past them (it can break P: parts playback).
      if (isInlineFieldOnlyLine(raw)) { bodyStart = j; break; }
      if (isDirectiveLine(raw) || isFieldLine(raw) || isContinuationLine(raw)) continue;
      bodyStart = j;
      break;
    }

    let firstOffender = null;
    for (let j = kIdx + 1; j < bodyStart; j += 1) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (isCommentLine(raw)) continue;
      if (isDirectiveLine(raw) || isFieldLine(raw) || isContinuationLine(raw)) {
        firstOffender = { line: j + 1, text: raw };
        break;
      }
    }
    if (!firstOffender) return null;

    const tuneLabel = (() => {
      for (let i = start; i < end; i += 1) {
        const m = String(lines[i] || "").match(/^\s*X:\s*(\d+)/);
        if (m) return `X:${m[1]}`;
      }
      return null;
    })();

    return {
      kind: "abc2svg-k-field-not-last",
      loc: { line: firstOffender.line, col: 1 },
      detail: `${tuneLabel ? `${tuneLabel}: ` : ""}K: is not the last header field before the music. abc2svg playback may fail when directives/fields appear after K:.`,
    };
  };

  let start = 0;
  let sawTuneStart = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (isTuneStart(lines[i])) {
      if (sawTuneStart) {
        const warn = scanTune(start, i);
        if (warn) return warn;
        start = i;
      } else {
        sawTuneStart = true;
        start = i;
      }
    }
  }
  const warn = scanTune(sawTuneStart ? start : 0, lines.length);
  return warn || null;
}

function normalizeKeyFieldToBeLastBeforeBodyForPlayback(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const isTuneStart = (line) => /^\s*X:/.test(line);
  const isFieldLine = (line) => /^\s*[A-Za-z]:/.test(line);
  const isContinuationLine = (line) => /^\s*\+:\s*/.test(line);
  const isKeyLine = (line) => /^\s*K:/.test(line);
  const isVoiceLine = (line) => /^\s*V:/.test(line);
  const isCommentLine = (line) => /^\s*%/.test(line);
  const isDirectiveLine = (line) => /^\s*%%/.test(line);
  const beginsBlock = (trimmed) => {
    if (!/^%%\s*begin/i.test(trimmed)) return null;
    if (/^%%\s*begintext\b/i.test(trimmed)) return "text";
    if (/^%%\s*beginsvg\b/i.test(trimmed)) return "svg";
    if (/^%%\s*beginps\b/i.test(trimmed)) return "ps";
    return "other";
  };
  const endsBlock = (trimmed, block) => {
    if (!block) return false;
    if (block === "text") return /^%%\s*endtext\b/i.test(trimmed);
    if (block === "svg") return /^%%\s*endsvg\b/i.test(trimmed);
    if (block === "ps") return /^%%\s*endps\b/i.test(trimmed);
    if (block === "other") return /^%%\s*end/i.test(trimmed);
    return false;
  };

  const normalizeTune = (start, end) => {
    let kIdx = -1;
    for (let i = start; i < end; i += 1) {
      if (isKeyLine(lines[i])) { kIdx = i; break; }
    }
    if (kIdx < 0) return false;

    let block = null;
    let bodyStart = end;
    for (let j = kIdx + 1; j < end; j += 1) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (block) {
        if (endsBlock(trimmed, block)) block = null;
        continue;
      }
      const begin = beginsBlock(trimmed);
      if (begin) {
        block = begin;
        continue;
      }
      if (!trimmed) continue;
      if (isCommentLine(raw)) continue;
      // Inline field-only lines like `[P:A]` or `[M:...]` are tune-body directives (even if they contain no notes).
      // Treat them as the body start so we don't reorder K: past them (it can break P: parts playback).
      if (isInlineFieldOnlyLine(raw)) { bodyStart = j; break; }
      if (isDirectiveLine(raw) || isFieldLine(raw) || isContinuationLine(raw)) continue;
      bodyStart = j;
      break;
    }
    if (bodyStart <= kIdx + 1) return false;

    let hasPostKeyHeader = false;
    for (let j = kIdx + 1; j < bodyStart; j += 1) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (isCommentLine(raw)) continue;
      if (isDirectiveLine(raw) || isFieldLine(raw) || isContinuationLine(raw)) {
        hasPostKeyHeader = true;
        break;
      }
    }
    if (!hasPostKeyHeader) return false;

    const insertAt = bodyStart - 1;
    if (insertAt <= kIdx) return false;

    // Offset-stable normalization:
    // Instead of moving lines (which shifts character offsets and breaks Follow/SVG mapping),
    // relocate the *content* of K: to the last header line slot while preserving line lengths.
    //
    // We intentionally sacrifice the original content of the destination line (typically %%score / directives),
    // but keep all other post-K header lines (notably V:) intact.
    //
    // If the last header line is a voice header, we refuse to do the swap (losing V: would break playback).
    // In that rare case, we keep the original order and let other compat paths handle playback.
    const dstRaw = lines[insertAt] || "";
    if (isVoiceLine(dstRaw)) return false;

    const kLine = lines[kIdx] || "";
    const dstLen = String(dstRaw).length;
    const kTrimmed = kLine.replace(/[\r\n]+$/, "");
    const kPadded = (kTrimmed.length >= dstLen)
      ? kTrimmed.slice(0, dstLen)
      : (kTrimmed + " ".repeat(dstLen - kTrimmed.length));

    const srcLen = String(kLine).length;
    const placeholder = srcLen <= 0 ? "%" : (`%${" ".repeat(Math.max(0, srcLen - 1))}`);

    lines[kIdx] = placeholder;
    lines[insertAt] = kPadded;
    return true;
  };

  let changed = false;
  let start = 0;
  let sawTuneStart = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (isTuneStart(lines[i])) {
      if (sawTuneStart) {
        if (normalizeTune(start, i)) changed = true;
        start = i;
      } else {
        sawTuneStart = true;
        start = i;
      }
    }
  }
  if (normalizeTune(sawTuneStart ? start : 0, lines.length)) changed = true;
  return { text: lines.join("\n"), changed };
}

function stripLyricsForPlayback(text) {
  // Important: keep the output string length identical to the input.
  // Follow/highlighting depends on stable character offsets between playback text and rendered SVG.
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (inTextBlock) {
      out.push(line);
      continue;
    }
    if (/^\s*w:/.test(line) || /^\s*W:/.test(line)) {
      const len = String(line || "").length;
      if (len <= 0) out.push("%");
      else out.push(`%${" ".repeat(Math.max(0, len - 1))}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function normalizeBarsForPlayback(text) {
  // abc2svg is strict about barline consistency across voices. Some sources mix `||` and `|` at the same moment,
  // which other players may ignore. For playback-only stability, normalize multi-bars to a single bar.
  // Keep string length stable for Follow mapping: replace `||` with `| ` (bar + space).
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (inTextBlock) {
      out.push(rawLine);
      continue;
    }
    // Leave directives untouched.
    if (/^\s*%%/.test(rawLine) || /^\s*[A-Za-z]:/.test(rawLine) || isInlineFieldOnlyLine(rawLine)) {
      out.push(rawLine);
      continue;
    }
    out.push(rawLine.replace(/\|\|/g, "| "));
  }
  return out.join("\n");
}

function stripChordSymbolsForPlayback(text) {
  const src = String(text || "");
  if (!src.includes("\"")) return src;
  const lines = src.split(/\r\n|\n|\r/);
  const out = [];
  let inTextBlock = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) inTextBlock = true;
    if (/^%%\s*endtext\b/i.test(trimmed)) inTextBlock = false;
    if (inTextBlock) {
      out.push(rawLine);
      continue;
    }
    // Remove chord symbols / annotations in quotes. Playback stability > chord display here.
    // Keep the rest of the line intact and preserve line length for Follow mapping.
    out.push(rawLine.replace(/\"[^\"]*\"/g, (m) => " ".repeat(String(m || "").length)));
  }
  return out.join("\n");
}

function extractBarSignatureFromText(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  const sig = [];
  let inTextBlock = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^%%\s*begintext\b/i.test(trimmed)) { inTextBlock = true; continue; }
    if (/^%%\s*endtext\b/i.test(trimmed)) { inTextBlock = false; continue; }
    if (inTextBlock) continue;
    if (!trimmed) continue;
    // Skip directives/fields that may contain ':' but are not musical bars.
    if (/^\s*%%/.test(rawLine)) continue;
    if (/^\s*[A-Za-z]:/.test(rawLine)) continue;
    if (isInlineFieldOnlyLine(rawLine)) continue;
    if (/^%/.test(trimmed) && !/^%%/.test(trimmed)) continue;
    let line = rawLine;
    const idx = line.indexOf("%");
    if (idx >= 0 && !/^\s*%%/.test(trimmed)) line = line.slice(0, idx);
    let inQuote = false;
    for (let i = 0; i < line.length; ) {
      const ch = line[i];
      if (!inQuote && ch === "[") {
        const slice = line.slice(i);
        if (/^\[\s*[A-Za-z]+:/.test(slice)) {
          const close = line.indexOf("]", i + 1);
          if (close >= 0) { i = close + 1; continue; }
        }
      }
      if (ch === "\"") { inQuote = !inQuote; i += 1; continue; }
      if (!inQuote) {
        const token = matchBarToken(line, i);
        if (token) {
          sig.push(token.token);
          i += token.len;
          continue;
        }
      }
      i += 1;
    }
  }
  return sig;
}

function computeExpectedBarSignatureFromInfo(info) {
  const sig = [];
  if (!info || !Array.isArray(info.bars)) return sig;
  let sep = info.leadingToken || "";
  for (const bar of info.bars) {
    if (bar && bar.startToken) sep = bar.startToken;
    if (sep) sig.push(sep);
    sep = (bar && bar.endToken) ? bar.endToken : "|";
  }
  if (sep) sig.push(sep);
  return sig;
}

function diffSignatures(expected, actual) {
  const a = Array.isArray(expected) ? expected : [];
  const b = Array.isArray(actual) ? actual : [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 6);
      const to = Math.min(len, i + 7);
      return {
        ok: false,
        index: i,
        expectedToken: a[i] ?? null,
        actualToken: b[i] ?? null,
        expectedLen: a.length,
        actualLen: b.length,
        expectedSlice: a.slice(from, to),
        actualSlice: b.slice(from, to),
      };
    }
  }
  return { ok: true, expectedLen: a.length, actualLen: b.length };
}

function getPlaybackPayload() {
  const tuneText = getEditorValue();
  const entry = getActiveFileEntry();
  const prefixPayload = buildHeaderPrefix(entry ? getHeaderEditorValue() : "", false, tuneText);
  const baseText = prefixPayload.text ? `${prefixPayload.text}${tuneText}` : tuneText;
  const gchordPreview = injectGchordOn(baseText, prefixPayload.offset || 0);
  const gchordPreviewText = (gchordPreview && gchordPreview.changed) ? gchordPreview.text : baseText;
  const nativeDrums = shouldUseNativeMidiDrums();
  const drumPreview = nativeDrums ? { text: gchordPreviewText, changed: false } : injectDrumPlayback(gchordPreviewText);
  const previewText = normalizeBlankLinesForPlayback(
    normalizeDollarLineBreaksForPlayback(drumPreview && drumPreview.changed ? drumPreview.text : gchordPreviewText)
  );
  const expandRepeats = window.__abcarusPlaybackExpandRepeats === true;
  const repeatsFlag = expandRepeats ? "exp:on" : "exp:off";
  const drumsFlag = nativeDrums ? "drums:native" : "drums:inject";
  const sourceKey = `${previewText}|||${prefixPayload.offset || 0}|||${repeatsFlag}|||${drumsFlag}`;
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
  payload = { text: normalizeDollarLineBreaksForPlayback(payload.text), offset: payload.offset };
  payload = { text: normalizeBlankLinesForPlayback(payload.text), offset: payload.offset };
  const sanitized = sanitizeAbcForPlayback(payload.text);
  playbackSanitizeWarnings = Array.isArray(sanitized.warnings) ? sanitized.warnings.slice(0, 200) : [];
  payload = { text: sanitized.text, offset: payload.offset };

  lastPlaybackKeyOrderWarning = null;
  const keyOrderWarn = detectKeyFieldNotLastBeforeBody(payload.text);
  if (keyOrderWarn) {
    lastPlaybackKeyOrderWarning = keyOrderWarn;
    playbackSanitizeWarnings.push(keyOrderWarn);
  }
  const keyOrderNormalized = normalizeKeyFieldToBeLastBeforeBodyForPlayback(payload.text);
  if (keyOrderNormalized && keyOrderNormalized.changed) {
    payload = { text: keyOrderNormalized.text, offset: payload.offset };
    playbackSanitizeWarnings.push({ kind: "playback-k-field-reordered" });
  }

  lastPlaybackMeterMismatchWarning = null;
  lastPlaybackRepeatShortBarWarning = null;
  const meterWarn = detectMeterMismatchInBarlines(payload.text);
  if (meterWarn) {
    lastPlaybackMeterMismatchWarning = meterWarn;
    playbackSanitizeWarnings.push(meterWarn);
    if (lastMeterMismatchToastKey !== sourceKey) {
      showToast(`Meter mismatch: ${meterWarn.detail}`, 5200);
      lastMeterMismatchToastKey = sourceKey;
    }
  }
  const repeatShortBarWarn = detectRepeatMarkerAfterShortBar(payload.text);
  if (repeatShortBarWarn) {
    lastPlaybackRepeatShortBarWarning = repeatShortBarWarn;
    playbackSanitizeWarnings.push(repeatShortBarWarn);
    if (lastRepeatShortBarToastKey !== sourceKey) {
      showToast(`Repeat may be wrong: ${repeatShortBarWarn.detail}`, 5600);
      lastRepeatShortBarToastKey = sourceKey;
    }
  }

  const drumInjected = nativeDrums ? { text: payload.text, changed: false, insertAtLine: null, lineCount: 0 } : injectDrumPlayback(payload.text);
  if (drumInjected && drumInjected.signatureDiff) {
    lastDrumSignatureDiff = drumInjected.signatureDiff;
    playbackSanitizeWarnings.push({ kind: "drum-signature-mismatch", detail: drumInjected.signatureDiff });
  } else {
    lastDrumSignatureDiff = null;
  }
  if (drumInjected && drumInjected.changed) payload = { text: drumInjected.text, offset: payload.offset };
  lastPlaybackMeta = drumInjected.changed
    ? { drumInsertAtLine: drumInjected.insertAtLine, drumLineCount: drumInjected.lineCount }
    : { drumInsertAtLine: null, drumLineCount: 0 };
  if (expandRepeats) {
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
  playbackNeedsReprepare = false;

  try { sessionStorage.setItem("audio", "sf2"); } catch {}

  const AbcCtor = getAbcCtor();
  playbackParseErrors = [];
  playbackSanitizeWarnings = [];
  lastPlaybackChordOnBarError = false;
  let playbackParseErrorToastShown = false;
  lastPlaybackTuneInfo = null;
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
    const entry = {
      message: String(message || ""),
      loc,
      inDrumBlock: Boolean(inDrumBlock),
    };
    playbackParseErrors.push(entry);
    if (playbackParseErrors.length > 200) playbackParseErrors = playbackParseErrors.slice(-200);
    if (!playbackParseErrorToastShown) {
      playbackParseErrorToastShown = true;
      showToast("Playback parse error (see debug dump).", 3200);
      scheduleAutoDump("playback-parse-error", entry && entry.message ? entry.message : String(message || ""));
    }
    if (/Not enough measure bars for lyric line/i.test(entry.message)) {
      // We'll attempt a playback-only fallback that ignores lyrics, so don't spam errors.
      return;
    }
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
  const nativeMidiDrums = shouldUseNativeMidiDrums();
  lastPlaybackHasParts = /\nP\s*:/.test(`\n${playbackPayload.text || ""}`) || /\[\s*P\s*:/i.test(playbackPayload.text || "");
  if (Array.isArray(playbackSanitizeWarnings) && playbackSanitizeWarnings.length) {
    showToast("Playback may vary (ABC sanitized for stability).", 3600);
  }
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
  if (lastPlaybackMeterMismatchWarning && lastPlaybackMeterMismatchWarning.detail) {
    addError(
      `Warning: Meter mismatch: ${lastPlaybackMeterMismatchWarning.detail}`,
      lastPlaybackMeterMismatchWarning.loc || null,
      { skipMeasureRange: true }
    );
  }
  if (lastPlaybackRepeatShortBarWarning && lastPlaybackRepeatShortBarWarning.detail) {
    addError(
      `Warning: ${lastPlaybackRepeatShortBarWarning.detail}`,
      lastPlaybackRepeatShortBarWarning.loc || null,
      { skipMeasureRange: true }
    );
  }
  if (lastPlaybackKeyOrderWarning && lastPlaybackKeyOrderWarning.detail) {
    addError(
      `Warning: ${lastPlaybackKeyOrderWarning.detail}`,
      lastPlaybackKeyOrderWarning.loc || null,
      { skipMeasureRange: true }
    );
  }
  let playbackText = normalizeHeaderNoneSpacing(playbackPayload.text);
  if (/[\\^_]3\/4/.test(playbackText)) {
    playbackSanitizeWarnings.push({ kind: "playback-acc-3_4-normalized" });
    playbackText = normalizeAccThreeQuarterToneForAbc2svg(playbackText);
    showToast("Playback: 3/4-tone accidentals normalized (compat mode).", 3600);
  }
  if (nativeMidiDrums) {
    const relocated = relocateMidiDrumDirectivesIntoBody(playbackText);
    if (relocated && relocated.moved > 0) {
      playbackText = relocated.text;
      playbackSanitizeWarnings.push({ kind: "playback-midi-drums-moved-after-k", moved: relocated.moved });
      if (window.__abcarusDebugPlayback) {
        showToast("Playback: moved %%MIDI drum* after K: (experimental).", 3200);
      }
    }
  }
  abc.tosvg("play", playbackText);

  // abc2svg requires %%MIDI drum/drumon/drumbars to be inside a voice; many real-world files place them in headers.
  // Neutralize (comment out) these directives for tolerant playback while preserving istart mapping.
  if (Array.isArray(playbackParseErrors) && playbackParseErrors.some((e) => /%%MIDI\s+drum\s+must be in a voice|%%MIDI\s+drumon\s+must be in a voice|%%MIDI\s+drumbars\s+must be in a voice/i.test(e.message || ""))) {
    playbackSanitizeWarnings.push({ kind: "playback-midi-drums-neutralized" });
    const abc2 = new AbcCtor(user);
    playbackParseErrors = [];
    if (nativeMidiDrums) {
      // Experimental native path failed; fall back to our V:DRUM injection so drums still play after neutralization.
      const injected = injectDrumPlayback(playbackText);
      if (injected && injected.changed) {
        playbackText = injected.text;
        playbackSanitizeWarnings.push({ kind: "playback-native-midi-drums-fallback-to-inject" });
        lastPlaybackMeta = { drumInsertAtLine: injected.insertAtLine, drumLineCount: injected.lineCount };
      }
    }
    playbackText = neutralizeMidiDrumDirectivesForPlayback(playbackText);
    abc2.tosvg("play", playbackText);
    abc.tunes = abc2.tunes;
    // Keep this low-noise: it's informational and can be common in real-world files.
    // Record it for dumps; only show it in UI when debugging playback.
    if (window.__abcarusDebugPlayback || window.__abcarusDebugDrums) {
      addError(
        "Warning: Playback ignored global %%MIDI drum* directives (must be inside a voice).",
        null,
        { skipMeasureRange: true }
      );
    }
    const toastKey = getPlaybackSourceKey();
    if (window.__abcarusDebugPlayback && toastKey && toastKey !== lastMidiDrumCompatToastKey) {
      lastMidiDrumCompatToastKey = toastKey;
      showToast("Playback: global %%MIDI drum* ignored (compat).", 2600);
    }
  }

  // Tolerant playback mode: many real-world ABC files contain lyric/barline mismatches that stricter engines reject.
  // We keep the file unchanged; this only affects playback.
  if (Array.isArray(playbackParseErrors) && playbackParseErrors.some((e) => /lyric line/i.test(e.message || ""))) {
    playbackSanitizeWarnings.push({ kind: "playback-lyrics-dropped" });
    const abc2 = new AbcCtor(user);
    const stripped = stripLyricsForPlayback(playbackText);
    abc2.tosvg("play", stripped);
    abc.tunes = abc2.tunes;
    showToast("Playback: lyrics ignored (compat mode).", 3600);
  }
  if (Array.isArray(playbackParseErrors) && playbackParseErrors.some((e) => /Different bars/i.test(e.message || ""))) {
    playbackSanitizeWarnings.push({ kind: "playback-bars-normalized" });
    const abc3 = new AbcCtor(user);
    const normalized = normalizeBarsForPlayback(playbackText);
    abc3.tosvg("play", normalized);
    abc.tunes = abc3.tunes;
    showToast("Playback: barlines normalized (compat mode).", 3600);
  }

  // abc2svg playback is stricter than many MIDI engines (e.g. abcmidi) and rejects chord symbols placed on barlines.
  // We don't auto-strip by default (it changes accompaniment); instead we warn and provide an opt-in toggle.
  if (Array.isArray(playbackParseErrors) && playbackParseErrors.some((e) => /chord symbols on measure bars/i.test(e.message || ""))) {
    lastPlaybackChordOnBarError = true;
    playbackSanitizeWarnings.push({ kind: "abc2svg-chord-on-measure-bar" });
    if (window.__abcarusPlaybackStripChordSymbols === true) {
      playbackParseErrors = [];
      playbackSanitizeWarnings.push({ kind: "playback-chords-stripped" });
      const abc2 = new AbcCtor(user);
      const stripped = stripChordSymbolsForPlayback(playbackText);
      abc2.tosvg("play", stripped);
      // Replace parsed result.
      abc.tunes = abc2.tunes;
      showToast("Playback: chord symbols ignored (compat mode).", 3600);
    } else {
      showToast("Playback may vary (chord symbols on barlines).", 3600);
    }
  }

  const tunes = abc.tunes || [];
  if (!tunes.length) throw new Error("No tunes parsed; cannot play.");

  try {
    lastPlaybackTuneInfo = {
      count: tunes.length,
      titles: tunes.map((t) => {
        const info = t && t[0] ? t[0].info : null;
        const title = info && info.T ? info.T : null;
        const x = info && info.X ? info.X : null;
        return { x, title };
      }).slice(0, 20),
    };
  } catch {
    lastPlaybackTuneInfo = { count: tunes.length };
  }

  // Compatibility: some upstream abc2svg builds expect abc2svg.drum() to exist when drum features are enabled.
  // Our playback pipeline can inject/expand drums independently, so missing abc2svg.drum should not hard-fail playback.
  try {
    if (window.abc2svg && typeof window.abc2svg.drum !== "function") {
      window.abc2svg.drum = () => {};
      playbackSanitizeWarnings.push({ kind: "playback-abc2svg-drum-missing-stubbed" });
    }
  } catch {}

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
      tunes: lastPlaybackTuneInfo,
      symbolsHead: playbackState
        ? playbackState.symbols.slice(0, 30).map((item) => {
          const sym = item && item.symbol ? item.symbol : null;
          const pv = sym && sym.p_v ? sym.p_v : null;
          return {
            istart: sym && Number.isFinite(sym.istart) ? sym.istart : null,
            time: sym && Number.isFinite(sym.time) ? sym.time : null,
            dur: sym && Number.isFinite(sym.dur) ? sym.dur : null,
            type: sym && Number.isFinite(sym.type) ? sym.type : null,
            voiceId: pv && pv.id != null ? String(pv.id) : null,
            voiceIndex: pv && Number.isFinite(pv.v) ? pv.v : null,
          };
        })
        : [],
    }),
    getDiagnostics: () => ({
      parseErrors: Array.isArray(playbackParseErrors) ? playbackParseErrors.slice() : [],
      sanitizeWarnings: Array.isArray(playbackSanitizeWarnings) ? playbackSanitizeWarnings.slice() : [],
      drumSignatureDiff: lastDrumSignatureDiff,
      chordOnBarError: Boolean(lastPlaybackChordOnBarError),
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

  // Guard: an end boundary that points at/before the first playable symbol can cause immediate termination (no sound).
  let endSym = activePlaybackEndSymbol || null;
  if (endSym && Number.isFinite(endSym.istart) && Number.isFinite(start.istart) && endSym.istart <= start.istart) {
    endSym = null;
  }

  lastStartPlaybackIdx = Number.isFinite(start.istart) ? start.istart : 0;
  lastPlaybackIdx = null;
  lastRenderIdx = null;
  resumeStartIdx = null;
  suppressOnEnd = true;

  if (window.__abcarusDebugParts === true) {
    try {
      const getPartLetterAtSymbol = (sym) => {
        let s = sym;
        let guard = 0;
        while (s && guard < 200000) {
          if (s.part && s.part.text) return String(s.part.text || "")[0] || "?";
          s = s.ts_prev;
          guard += 1;
        }
        return "?";
      };
      const computePartIndexLikeSnd = (sym) => {
        let s = sym;
        let guard = 0;
        while (s && guard < 200000) {
          if (s.parts) return { i_p: -1, hit: "parts", at: Number.isFinite(s.istart) ? s.istart : null };
          const s_p = s.part1;
          const p_s = s_p && Array.isArray(s_p.p_s) ? s_p.p_s : null;
          if (p_s) {
            for (let i = 0; i < p_s.length; i += 1) {
              if (p_s[i] === s) return { i_p: i, hit: "p_s", at: Number.isFinite(s.istart) ? s.istart : null };
            }
          }
          s = s.ts_prev;
          guard += 1;
        }
        return { i_p: undefined, hit: null, at: null };
      };
      const idxInfo = computePartIndexLikeSnd(start);
      let partsSeq = null;
      try {
        let s = start;
        let guard = 0;
        while (s && guard < 200000) {
          if (typeof s.parts === "string" && s.parts) { partsSeq = s.parts; break; }
          s = s.ts_prev;
          guard += 1;
        }
      } catch {}
      console.log("[abcarus] playback start (parts)", {
        startIstart: start.istart,
        startEditorOffset: Number.isFinite(start.istart) ? (start.istart - (playbackIndexOffset || 0)) : null,
        partAtStart: getPartLetterAtSymbol(start),
        i_p: idxInfo.i_p,
        i_p_hit: idxInfo.hit,
        i_p_at: idxInfo.at,
        partsSeq,
      });
    } catch {}
  }

  player.play(start, endSym, 0);
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

function findBoundaryAtOrAfter(sorted, target) {
  if (!Array.isArray(sorted) || !sorted.length) return null;
  const t = Number(target);
  if (!Number.isFinite(t)) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid];
    if (v >= t) {
      best = v;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

function findBoundaryAtOrBefore(sorted, target) {
  if (!Array.isArray(sorted) || !sorted.length) return null;
  const t = Number(target);
  if (!Number.isFinite(t)) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid];
    if (v <= t) {
      best = v;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function findBarStartContaining(sortedMeasureIstarts, target) {
  if (!Array.isArray(sortedMeasureIstarts) || !sortedMeasureIstarts.length) return null;
  const t = Number(target);
  if (!Number.isFinite(t)) return null;
  let lo = 0;
  let hi = sortedMeasureIstarts.length - 1;
  let best = sortedMeasureIstarts[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sortedMeasureIstarts[mid];
    if (v <= t) {
      best = v;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

async function startPlaybackFromRange(rangeOverride) {
  if (!editorView) return;
  const startToken = (playbackStartToken += 1);
  const abortStart = (message) => {
    if (startToken !== playbackStartToken) return;
    lastPlaybackAbortMessage = String(message || "");
    try { recordDebugLog("warn", [`Playback abort: ${lastPlaybackAbortMessage}`]); } catch {}
    try { scheduleAutoDump("playback-abort", lastPlaybackAbortMessage); } catch {}
    waitingForFirstNote = false;
    isPlaying = false;
    isPaused = false;
    setStatus("OK");
    updatePlayButton();
    clearNoteSelection();
    resetPlaybackUiState();
    setSoundfontCaption();
    if (message) showToast(message, 2600);
  };
  let range = clonePlaybackRange(rangeOverride || playbackRange);
  const max = editorView.state.doc.length;
  if (!Number.isFinite(range.startOffset) || range.startOffset < 0 || range.startOffset > max) {
    abortStart("Playback range start is invalid.");
    return;
  }

  // Guard: only one active PlaybackRange at a time.
  if (activePlaybackRange && isPlaying) {
    stopPlaybackFromGuard("Second PlaybackRange attempted to become active while playing.");
    return;
  }

  clearNoteSelection();
  const sourceKey = getPlaybackSourceKey();
  const canReuse = (
    !playbackNeedsReprepare
    && !lastPlaybackHasParts
    && playbackState
    && lastPreparedPlaybackKey
    && lastPreparedPlaybackKey === sourceKey
    && player
  );
  waitingForFirstNote = true;
	  try {
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
	  } catch (e) {
	    try { scheduleAutoDump("playback-start-failed", (e && e.message) ? e.message : String(e)); } catch {}
	    stopPlaybackFromGuard(`Playback start failed: ${(e && e.message) ? e.message : String(e)}`);
	    showToast("Playback failed to start. Try again.", 3200);
	    return;
	  }
  if (startToken !== playbackStartToken) return;

  updatePracticeUi();

  const startAbcOffset = toDerivedOffset(range.startOffset);
  if (!Number.isFinite(startAbcOffset)) {
    abortStart("Playback range start is invalid.");
    return;
  }
  const startSym = findSymbolAtOrAfter(startAbcOffset);
  if (!startSym || !Number.isFinite(startSym.istart)) {
    abortStart("Playback start is not mappable.");
    return;
  }

  // Guard: ensure we map startOffset deterministically (no fallback mapping).
  if (startSym.istart < startAbcOffset) {
    stopPlaybackFromGuard("PlaybackRange.startOffset mapped to a symbol before startOffset.");
    return;
  }

		  // Switch semantics guard (Option B): playbackRange changes while playing are deferred; we also freeze loop start.
		  activePlaybackRange = range;
		  activePlaybackEndAbcOffset = resolvePlaybackEndAbcOffset(range, startSym.istart);
		  activePlaybackEndSymbol = (activePlaybackEndAbcOffset != null && Number.isFinite(activePlaybackEndAbcOffset))
		    ? findSymbolAtOrAfter(Number(activePlaybackEndAbcOffset))
		    : null;
		  if (activePlaybackEndSymbol && Number.isFinite(activePlaybackEndSymbol.istart) && activePlaybackEndSymbol.istart <= startSym.istart) {
		    activePlaybackEndSymbol = null;
		    activePlaybackEndAbcOffset = null;
		  }
	  if (range && range.loop) {
	    const loopBounds = computeFocusLoopPlaybackRange();
	    activeLoopRange = loopBounds || {
	      startOffset: Number(range.startOffset) || 0,
	      endOffset: (range.endOffset == null) ? null : Number(range.endOffset),
	      origin: String(range.origin || "focus"),
	      loop: true,
	    };
	  } else {
	    activeLoopRange = null;
	  }

  playbackRunId += 1;
  lastTraceRunId = playbackRunId;
  lastTracePlaybackIdx = null;
  lastTraceTimestamp = null;
  playbackTraceSeq = 0;

  playbackStartArmed = true;
  try {
    startPlaybackFromPrepared(startSym.istart);
  } catch (e) {
    stopPlaybackFromGuard(`Playback start failed: ${(e && e.message) ? e.message : String(e)}`);
    showToast("Playback failed to start. Try again.", 3200);
    return;
  }
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
  const canReuse = (
    !playbackNeedsReprepare
    && !lastPlaybackHasParts
    && playbackState
    && lastPreparedPlaybackKey
    && lastPreparedPlaybackKey === sourceKey
    && player
  );
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
      if (rawMode) {
        showToast("Raw mode: switch to tune mode to play.", 2200);
        return;
      }
      await togglePlayPauseEffective();
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($practiceTempo) {
  $practiceTempo.addEventListener("change", () => {
    const next = Number($practiceTempo.value);
    if (!Number.isFinite(next)) return;
    practiceTempoMultiplier = next;
    syncPendingPlaybackPlan();
    if (focusModeEnabled && isPlaybackBusy() && player && typeof player.set_speed === "function") {
      desiredPlayerSpeed = next;
      try { player.set_speed(desiredPlayerSpeed); } catch {}
    }
    updatePracticeUi();
  });
  const initial = Number($practiceTempo.value);
  if (Number.isFinite(initial)) practiceTempoMultiplier = initial;
}

const clampLoopField = (raw) => clampInt(raw, 0, 100000, 0);

async function persistLoopSettingsPatch(patch) {
  if (!window.api || typeof window.api.updateSettings !== "function") return;
  try { await window.api.updateSettings(patch); } catch {}
}

if ($practiceLoopEnabled) {
  $practiceLoopEnabled.addEventListener("change", () => {
    const next = Boolean($practiceLoopEnabled.checked);
    playbackLoopEnabled = next;
    syncPendingPlaybackPlan();
    updatePracticeUi();
    persistLoopSettingsPatch({ playbackLoopEnabled: next }).catch(() => {});
  });
}

if ($practiceLoopFrom) {
  $practiceLoopFrom.addEventListener("input", () => {
    const next = clampLoopField($practiceLoopFrom.value);
    const normalized = normalizeLoopBounds(next, playbackLoopToMeasure, { changedField: "from" });
    playbackLoopFromMeasure = normalized.from;
    playbackLoopToMeasure = normalized.to;
    syncPendingPlaybackPlan();
    updatePracticeUi();
  });
  $practiceLoopFrom.addEventListener("change", () => {
    const next = clampLoopField($practiceLoopFrom.value);
    const normalized = normalizeLoopBounds(next, playbackLoopToMeasure, { changedField: "from" });
    playbackLoopFromMeasure = normalized.from;
    playbackLoopToMeasure = normalized.to;
    syncPendingPlaybackPlan();
    updatePracticeUi();
    const patch = {
      playbackLoopFromMeasure: playbackLoopFromMeasure,
      playbackLoopToMeasure: playbackLoopToMeasure,
    };
    if (activeTuneId) {
      playbackLoopTuneId = String(activeTuneId);
      patch.playbackLoopTuneId = playbackLoopTuneId;
    }
    persistLoopSettingsPatch(patch).catch(() => {});
  });
}

if ($practiceLoopTo) {
  $practiceLoopTo.addEventListener("input", () => {
    const next = clampLoopField($practiceLoopTo.value);
    const normalized = normalizeLoopBounds(playbackLoopFromMeasure, next, { changedField: "to" });
    playbackLoopFromMeasure = normalized.from;
    playbackLoopToMeasure = normalized.to;
    syncPendingPlaybackPlan();
    updatePracticeUi();
  });
  $practiceLoopTo.addEventListener("change", () => {
    const next = clampLoopField($practiceLoopTo.value);
    const normalized = normalizeLoopBounds(playbackLoopFromMeasure, next, { changedField: "to" });
    playbackLoopFromMeasure = normalized.from;
    playbackLoopToMeasure = normalized.to;
    syncPendingPlaybackPlan();
    updatePracticeUi();
    const patch = {
      playbackLoopFromMeasure: playbackLoopFromMeasure,
      playbackLoopToMeasure: playbackLoopToMeasure,
    };
    if (activeTuneId) {
      playbackLoopTuneId = String(activeTuneId);
      patch.playbackLoopTuneId = playbackLoopTuneId;
    }
    persistLoopSettingsPatch(patch).catch(() => {});
  });
}

if ($btnFocusMode) {
  $btnFocusMode.addEventListener("click", () => {
    toggleFocusMode();
  });
}

if ($btnToggleSplit) {
  $btnToggleSplit.addEventListener("click", () => {
    toggleSplitOrientation({ userAction: true });
  });
}

if ($btnPlay) {
  $btnPlay.addEventListener("click", async () => {
    try {
      if (rawMode) {
        showToast("Raw mode: switch to tune mode to play.", 2200);
        return;
      }
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
      if (rawMode) {
        showToast("Raw mode: switch to tune mode to play.", 2200);
        return;
      }
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

if ($btnFonts) {
  $btnFonts.addEventListener("click", () => {
    if (!settingsController) return;
    if (typeof settingsController.openTab === "function") {
      settingsController.openTab("fonts");
      return;
    }
    settingsController.openSettings();
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
    startScanForErrorsFromToolbarEnable();
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

async function maybeRunDevAutoscrollDemo() {
  if (!window.api || typeof window.api.getDevConfig !== "function") return;
  const cfg = window.api.getDevConfig() || {};
  const filePath = String(cfg.ABCARUS_DEV_FILE || "").trim();
  if (!filePath) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tuneX = Number(String(cfg.ABCARUS_DEV_TUNE_X || "").trim());
  const wantFocus = String(cfg.ABCARUS_DEV_FOCUS || "").trim() === "1";
  const wantPlay = String(cfg.ABCARUS_DEV_AUTOPLAY || "").trim() === "1";
  const wantDebug = String(cfg.ABCARUS_DEV_AUTOSCROLL_DEBUG || "").trim() === "1";
  const wantFocusDebug = String(cfg.ABCARUS_DEV_FOCUS_DEBUG || "").trim() === "1";
  const quitAfter = String(cfg.ABCARUS_DEV_QUIT || "").trim() === "1";
  const modeSpec = String(cfg.ABCARUS_DEV_AUTOSCROLL_MODE || "").trim();
  const forcedZoom = Number(String(cfg.ABCARUS_DEV_RENDER_ZOOM || "").trim());
  const mutateSettings = String(cfg.ABCARUS_DEV_MUTATE_SETTINGS || "").trim() === "1";

  if (wantDebug) window.__abcarusDebugAutoscroll = true;
  if (wantFocusDebug) window.__abcarusDebugFocus = true;

  let restoreSettingsPatch = null;

  const res = await readFile(filePath);
  if (!res || !res.ok) {
    console.error("[abcarus][dev] Unable to read dev file:", res && res.error ? res.error : filePath);
    return;
  }
  const full = String(res.data || "");

  const extractTune = (text, xNumber) => {
    if (!Number.isFinite(xNumber)) return text;
    const re = /^\s*X:\s*(\d+)\s*$/gm;
    let match = null;
    const starts = [];
    while ((match = re.exec(text))) {
      starts.push({ idx: match.index, x: Number(match[1]) });
    }
    const start = starts.find((s) => s.x === xNumber);
    if (!start) return text;
    const next = starts.find((s) => s.idx > start.idx);
    const end = next ? next.idx : text.length;
    return String(text.slice(start.idx, end)).trimEnd() + "\n";
  };

  const tuneText = extractTune(full, tuneX);
  suppressDirty = true;
  try {
    setEditorValue(tuneText);
  } finally {
    suppressDirty = false;
  }
  scheduleRenderNow();

  const waitForSvg = async (timeoutMs = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const svg = $out ? $out.querySelector("svg") : null;
      if (svg) return true;
      await sleep(100);
    }
    return false;
  };
  if (!(await waitForSvg())) {
    console.error("[abcarus][dev] SVG render did not appear in time.");
    return;
  }

  if (Number.isFinite(forcedZoom) && forcedZoom > 0) {
    if (!wantFocus && mutateSettings && window.api && typeof window.api.getSettings === "function" && typeof window.api.updateSettings === "function") {
      try {
        const prev = await window.api.getSettings();
        const prevZoom = prev && Number(prev.renderZoom);
        if (Number.isFinite(prevZoom) && prevZoom > 0 && prevZoom !== forcedZoom) {
          restoreSettingsPatch = { renderZoom: prevZoom };
        }
        await window.api.updateSettings({ renderZoom: forcedZoom });
      } catch {}
    }
    setRenderZoomCss(forcedZoom);
    try {
      const cssZoom = getComputedStyle(document.documentElement).getPropertyValue("--render-zoom");
      const outZoom = $out ? getComputedStyle($out).zoom : "";
      console.log(
        "[abcarus][dev] render zoom =",
        forcedZoom,
        "cssVar=",
        String(cssZoom || "").trim(),
        "outZoom=",
        String(outZoom || "").trim(),
        "getRenderZoomFactor=",
        getRenderZoomFactor()
      );
    } catch {
      console.log("[abcarus][dev] render zoom =", forcedZoom);
    }
    await sleep(250);
  }

  if (wantFocus) {
    setFocusModeEnabled(true);
    await sleep(250);
  }

  const setMode = (m) => {
    if (!m) return;
    playbackAutoScrollMode = m;
    console.log("[abcarus][dev] autoscroll mode =", playbackAutoScrollMode);
  };

  const runOnce = async (m) => {
    setMode(m);
    await sleep(120);
    if (!wantPlay) return;
    await togglePlayPauseEffective();
    await sleep(25000);
    stopPlaybackTransport();
    await sleep(900);
  };

  try {
    if (modeSpec.toLowerCase() === "cycle") {
      for (const m of ["Keep Visible", "Page Turn", "Centered"]) {
        await runOnce(m);
      }
    } else if (modeSpec) {
      await runOnce(modeSpec);
    } else {
      await runOnce(null);
    }
  } catch (e) {
    console.error("[abcarus][dev] Demo failed:", (e && e.stack) ? e.stack : String(e));
  } finally {
    if (restoreSettingsPatch && window.api && typeof window.api.updateSettings === "function") {
      try { await window.api.updateSettings(restoreSettingsPatch); } catch {}
    }
    if (quitAfter && window.api && typeof window.api.quitApplication === "function") {
      try { await window.api.quitApplication(); } catch {}
    }
  }
}

maybeRunDevAutoscrollDemo().catch(() => {});
