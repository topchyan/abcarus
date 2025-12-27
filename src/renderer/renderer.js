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

const $editorHost = document.getElementById("abc-editor");
const $out = document.getElementById("out");
const $status = document.getElementById("status");
const $cursorStatus = document.getElementById("cursorStatus");
const $bufferStatus = document.getElementById("bufferStatus");
const $main = document.querySelector("main");
const $divider = document.getElementById("paneDivider");
const $renderPane = document.querySelector(".render-pane");
const $sidebar = document.querySelector(".sidebar");
const $scanStatus = document.getElementById("scanStatus");
const $libraryTree = document.getElementById("libraryTree");
const $tuneMeta = document.getElementById("tuneMeta");
const $dirtyIndicator = document.getElementById("dirtyIndicator");
const $fileContext = document.getElementById("fileContext");
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
const $btnPlayPause = document.getElementById("btnPlayPause");
const $btnRestart = document.getElementById("btnRestart");
const $btnPrevMeasure = document.getElementById("btnPrevMeasure");
const $btnNextMeasure = document.getElementById("btnNextMeasure");
const $btnResetLayout = document.getElementById("btnResetLayout");
const $btnToggleFollow = document.getElementById("btnToggleFollow");
const $btnToggleGlobals = document.getElementById("btnToggleGlobals");
const $rightSplit = document.querySelector(".right-split");
const $splitDivider = document.getElementById("splitDivider");
const $errorPane = document.getElementById("errorPane");
const $errorList = document.getElementById("errorList");
const $sidebarSplit = document.getElementById("sidebarSplit");
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

const MIN_PANE_WIDTH = 220;
const MIN_RIGHT_PANE_WIDTH = 220;
const MIN_ERROR_PANE_HEIGHT = 120;
const USE_ERROR_OVERLAY = true;
let settingsController = null;

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
let soundfontReadyName = null;
let soundfontLoadPromise = null;
let soundfontLoadTarget = null;
let soundfontStatusTimer = null;
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
let renamingFilePath = null;
let renameInFlight = false;

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
  if ($scanStatus) $scanStatus.textContent = text;
}

function setTuneMetaText(text) {
  if ($tuneMeta) $tuneMeta.textContent = text;
}

function setDirtyIndicator(isDirty) {
  if (!$dirtyIndicator) return;
  if (isDirty) {
    $dirtyIndicator.textContent = "Unsaved";
    $dirtyIndicator.classList.add("active");
  } else {
    $dirtyIndicator.textContent = "";
    $dirtyIndicator.classList.remove("active");
  }
  updateLibraryDirtyState(isDirty);
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
  const tunes = fileEntry.tunes.slice().sort((a, b) => (Number(a.xNumber) || 0) - (Number(b.xNumber) || 0));
  for (const tune of tunes) {
    const option = document.createElement("option");
    option.value = tune.id;
    const title = tune.title || tune.preview || "";
    const label = tune.xNumber ? `X:${tune.xNumber} ${title}`.trim() : title || tune.id;
    option.textContent = label;
    $fileTuneSelect.appendChild(option);
  }
  $fileTuneSelect.disabled = false;
  if (activeTuneId) $fileTuneSelect.value = activeTuneId;
}

function updateFileContext() {
  if (!$fileContext) return;
  const entry = getActiveFileEntry();
  if (!entry) {
    $fileContext.classList.remove("active");
    if ($fileTuneSelect) $fileTuneSelect.textContent = "";
    return;
  }
  $fileContext.classList.add("active");
  buildTuneSelectOptions(entry);
}

function setHeaderEditorValue(text) {
  if (!headerEditorView) return;
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
  list.sort((a, b) => compareSortText(getFileLabel(a), getFileLabel(b)) * dir);
  for (const file of list) {
    if (file.tunes && file.tunes.length) {
      file.tunes.sort((a, b) => compareSortText(getTuneLabel(a), getTuneLabel(b)) * dir);
    }
  }
  return list;
}

function sortGroupEntries(entries) {
  const list = entries ? entries.slice() : [];
  const dir = sortMode.endsWith("desc") ? -1 : 1;
  if (sortMode.startsWith("update_")) {
    list.sort((a, b) => ((a.updatedAtMs || 0) - (b.updatedAtMs || 0)) * dir);
  } else {
    list.sort((a, b) => compareSortText(a.label, b.label) * dir);
  }
  return list;
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
    if ($fileHeaderToggle) $fileHeaderToggle.classList.remove("has-header");
    setHeaderEditorValue("");
    return;
  }
  $fileHeaderPanel.classList.add("active");
  setHeaderEditorValue(entry.headerText || "");
  if ($fileHeaderToggle) {
    const hasHeader = Boolean(String(entry.headerText || "").trim());
    $fileHeaderToggle.classList.toggle("has-header", hasHeader);
  }
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

function openReplacePanel(view) {
  openSearchPanel(view);
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

function insertIndent(view) {
  const unit = view.state.facet(indentUnit);
  const changes = [];
  const ranges = [];
  for (const range of view.state.selection.ranges) {
    changes.push({ from: range.from, to: range.to, insert: unit });
    const pos = range.from + unit.length;
    ranges.push(EditorSelection.cursor(pos));
  }
  view.dispatch({ changes, selection: EditorSelection.create(ranges) });
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
    { key: "Ctrl-f", run: openSearchPanel },
    { key: "Mod-f", run: openSearchPanel },
    { key: "Ctrl-h", run: openReplacePanel },
    { key: "Mod-h", run: openReplacePanel },
    { key: "Ctrl-g", run: gotoLine },
    { key: "Mod-g", run: gotoLine },
    { key: "Ctrl-F7", run: (view) => moveLineSelection(view, 1) },
    { key: "Mod-F7", run: (view) => moveLineSelection(view, 1) },
    { key: "Ctrl-F5", run: (view) => moveLineSelection(view, -1) },
    { key: "Mod-F5", run: (view) => moveLineSelection(view, -1) },
    { key: "Tab", run: insertIndent },
    { key: "F2", run: () => { toggleLibrary(); return true; } },
    { key: "F6", run: () => { if ($btnPlayPause) $btnPlayPause.click(); return true; } },
    { key: "F5", run: () => { startPlaybackAtMeasureOffset(-1); return true; } },
    { key: "F7", run: () => { startPlaybackAtMeasureOffset(1); return true; } },
    { key: "F4", run: () => { startPlaybackAtIndex(0); return true; } },
    { key: "F8", run: () => { resetLayout(); return true; } },
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
  editorView.dom.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    showContextMenuAt(ev.clientX, ev.clientY, { type: "editor" });
  });
  setCursorStatus(1, 1, 1, state.doc.lines, state.doc.length);
}

function initHeaderEditor() {
  if (headerEditorView || !$fileHeaderEditor) return;
  const state = EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      abcHighlight,
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
    ],
  });
  headerEditorView = new EditorView({
    state,
    parent: $fileHeaderEditor,
  });
}

function setActiveTuneText(text, metadata) {
  resetPlaybackState();
  suppressDirty = true;
  setEditorValue(text);
  suppressDirty = false;
  if (metadata) {
    activeTuneMeta = { ...metadata };
    activeFilePath = metadata.path || null;
    refreshHeaderLayers().catch(() => {});
    const metaText = `${metadata.basename}  X:${metadata.xNumber}  lines ${metadata.startLine}-${metadata.endLine}`;
    setTuneMetaText(metaText);
    if (currentDoc) {
      currentDoc.path = metadata.path || null;
      currentDoc.content = text;
      currentDoc.dirty = false;
    } else {
      currentDoc = { path: metadata.path || null, dirty: false, content: text };
    }
    if (window.api && typeof window.api.addRecentTune === "function") {
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
    if (window.api && typeof window.api.addRecentFile === "function") {
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
    refreshHeaderLayers().catch(() => {});
    setTuneMetaText("Untitled (default.abc)");
    if (currentDoc) {
      currentDoc.path = null;
      currentDoc.content = text || "";
      currentDoc.dirty = false;
    }
    updateFileContext();
    setDirtyIndicator(false);
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
      fileLabel.addEventListener("click", () => {
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
  if (!$libraryTree) return;
  const buttons = $libraryTree.querySelectorAll(".tree-label");
  for (const btn of buttons) {
    if (btn.dataset && btn.dataset.tuneId) {
      btn.classList.toggle("active", btn.dataset.tuneId === tuneId);
    }
  }
}

async function selectTune(tuneId) {
  if (!libraryIndex || !tuneId) return;
  const ok = await ensureSafeToAbandonCurrentDoc("switching tunes");
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
  activeTuneId = tuneId;
  markActiveTuneButton(tuneId);

  let content = fileContentCache.get(fileMeta.path);
  if (content == null) {
    const res = await readFile(fileMeta.path);
    if (!res.ok) {
      logErr(res.error || "Unable to read file.");
      return;
    }
    content = res.data;
    fileContentCache.set(fileMeta.path, content);
  }

  const tuneText = content.slice(selected.startOffset, selected.endOffset);
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
  });
  setDirtyIndicator(false);
}

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
  const dir = safeDirname(entry.path);
  await loadLibraryFromFolder(dir);
  if (libraryIndex && libraryIndex.files) {
    const fileEntry = libraryIndex.files.find((f) => f.path === entry.path);
    if (fileEntry && fileEntry.tunes && fileEntry.tunes.length) {
      await selectTune(fileEntry.tunes[0].id);
    }
  }
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
  const folder = await window.api.showOpenFolderDialog();
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
  activeTuneId = null;
  setTuneMetaText("No tune selected.");
  setEditorValue("");

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

if ($btnToggleLibrary) {
  $btnToggleLibrary.addEventListener("click", () => {
    toggleLibrary();
  });
}

if ($groupBy) {
  $groupBy.addEventListener("change", () => {
    groupMode = $groupBy.value || "file";
    collapsedGroups.clear();
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
    renderLibraryTree();
  });
}

if ($librarySearch) {
  $librarySearch.addEventListener("input", () => {
    libraryTextFilter = String($librarySearch.value || "").trim();
    renderLibraryTree();
    updateLibraryStatus();
  });
  $librarySearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      libraryTextFilter = "";
      $librarySearch.value = "";
      renderLibraryTree();
      updateLibraryStatus();
      e.preventDefault();
    }
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

if ($fileTuneSelect) {
  $fileTuneSelect.addEventListener("change", () => {
    const tuneId = $fileTuneSelect.value;
    if (tuneId) selectTune(tuneId);
  });
}

if (window.api && typeof window.api.onLibraryProgress === "function") {
  window.api.onLibraryProgress((payload) => {
    if (!payload) return;
    if (payload.phase === "discover") {
      setScanStatus(`Scanning… ${payload.filesFound || 0} files`);
    } else if (payload.phase === "parse") {
      const total = payload.total || 0;
      const index = payload.index || 0;
      setScanStatus(`Indexing… ${index}/${total}`);
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

function setStatus(s) { $status.textContent = s; }

function setBufferStatus(text) {
  if (!$bufferStatus) return;
  $bufferStatus.textContent = text || "";
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
let lastNoteSelection = [];

function showErrorsVisible(visible) {
  if (!$sidebar || !$sidebarBody) return;
  $sidebar.classList.toggle("has-errors", visible);
  $sidebarBody.classList.toggle("errors-visible", visible);
}

function clearErrors() {
  errorEntries.length = 0;
  if ($errorList) $errorList.textContent = "";
  showErrorsVisible(false);
  measureErrorRenderRanges = [];
  setMeasureErrorRanges([]);
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

function addError(message, locOverride) {
  const renderLoc = locOverride || parseErrorLocation(message);
  const entry = {
    message: String(message),
    loc: renderLoc ? { line: renderLoc.line, col: renderLoc.col } : null,
    renderLoc: renderLoc ? { line: renderLoc.line, col: renderLoc.col } : null,
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
  if (entry.renderLoc && /Bad measure duration/i.test(entry.message) && isMeasureCheckEnabled()) {
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

  errorEntries.push(entry);
  if ($errorList) {
    const item = document.createElement("div");
    item.className = "error-item";
    item.dataset.index = String(errorEntries.length - 1);
    if (entry.loc) {
      const loc = document.createElement("div");
      loc.className = "error-loc";
      loc.textContent = `Line ${entry.loc.line}, Col ${entry.loc.col}`;
      item.appendChild(loc);
    }
    const msg = document.createElement("div");
    msg.className = "error-msg";
    msg.textContent = entry.message;
    item.appendChild(msg);
    $errorList.appendChild(item);
  }
  showErrorsVisible(true);
}

function logErr(m, loc) {
  addError(m, loc);
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

async function runPrintAction(type) {
  if (!window.api) return;
  const svgMarkup = getCurrentNotationMarkup();
  if (!svgMarkup) {
    setStatus("No notation to print.");
    return;
  }
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
  setTuneMetaText("Untitled (default.abc)");
  clearErrors();
  setStatus("Ready");
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

function renderNow() {
  clearNoteSelection();
  clearErrors();
  $out.innerHTML = "";
  const currentText = getEditorValue();
  if (!currentText.trim()) {
    setStatus("Ready");
    return;
  }
  const renderPayload = getRenderPayload();
  const renderText = normalizeHeaderNoneSpacing(renderPayload.text);
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
    setStatus("OK");

  } catch (e) {
    logErr((e && e.stack) ? e.stack : String(e));
    setStatus("Error");
  }
}

initEditor();
initHeaderEditor();
setHeaderCollapsed(headerCollapsed);
setCurrentDocument(createBlankDocument());
initPaneResizer();
initRightPaneResizer();
initSidebarResizer();
setLibraryVisible(true);

// Preload soundfont in background to avoid first-play delay.
(async () => {
  try {
    setStatus("Loading soundfont…");
    await ensureSoundfontLoaded();
    setStatus("OK");
  } catch (e) {
    logErr((e && e.stack) ? e.stack : String(e));
    setStatus("Error");
  }
})();

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

function formatAboutInfo(info) {
  if (!info) return "No system info available.";
  return [
    `Version: ${info.appVersion || ""}`.trim(),
    `Commit: ${info.commit || ""}`.trim(),
    `Date: ${info.buildDate || ""}`.trim(),
    `Electron: ${info.electron || ""}`.trim(),
    `ElectronBuildId: ${info.electronBuildId || ""}`.trim(),
    `Chromium: ${info.chrome || ""}`.trim(),
    `Node.js: ${info.node || ""}`.trim(),
    `V8: ${info.v8 || ""}`.trim(),
    `OS: ${[info.platform, info.arch, info.osRelease].filter(Boolean).join(" ")}`.trim(),
  ].join("\n");
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
  const res = await window.api.runAbc2abc(abcText, options);
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
  applyTransformedText(res.abcText || "");
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

async function ensureSafeToAbandonCurrentDoc(actionLabel) {
  if (!currentDoc) return true;
  if (!currentDoc.dirty) return true;

  const choice = await confirmUnsavedChanges(actionLabel);
  if (choice === "cancel") return false;
  if (choice === "dont_save") return true;

  const ok = await performSaveFlow();
  return ok;
}

async function performSaveFlow() {
  if (!currentDoc) return false;

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

  return performAppendFlow();
}

async function performSaveAsFlow() {
  if (!currentDoc) return false;

  const suggestedName = `${getSuggestedBaseName()}.abc`;
  const suggestedDir = getDefaultSaveDir();
  const filePath = await showSaveDialog(suggestedName, suggestedDir);
  if (!filePath) return false;

  if (await fileExists(filePath)) {
    const ow = await confirmOverwrite(filePath);
    if (ow !== "replace") return false;
  }

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
      setTuneMetaText(safeBasename(filePath));
    }
    updateFileHeaderPanel();
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
    const metaText = `${updatedFile.basename}  X:${activeTuneMeta.xNumber || ""}  lines ${activeTuneMeta.startLine}-${activeTuneMeta.endLine}`;
    setTuneMetaText(metaText);
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
    const metaText = `${label}  X:${activeTuneMeta.xNumber || ""}  lines ${activeTuneMeta.startLine}-${activeTuneMeta.endLine}`;
    setTuneMetaText(metaText);
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
  setDirtyIndicator(false);
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

async function fileClose() {
  if (!currentDoc) return;
  const ok = await ensureSafeToAbandonCurrentDoc("closing this file");
  if (!ok) return;
  clearCurrentDocument();
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
  if (currentDoc && currentDoc.dirty) {
    const choice = await confirmUnsavedChanges("quitting");
    if (choice === "cancel") return;
    if (choice === "dont_save") {
      if (window.api && typeof window.api.quitApplication === "function") {
        await window.api.quitApplication();
      }
      return;
    }
    const ok = await performSaveFlow();
    if (!ok) return;
  }

  if (window.api && typeof window.api.quitApplication === "function") {
    await window.api.quitApplication();
  }
}

function wireMenuActions() {
  if (!window.api || typeof window.api.onMenuAction !== "function") return;
  window.api.onMenuAction(async (action) => {
    try {
      const actionType = typeof action === "string" ? action : action && action.type;
      if (actionType === "new") await fileNew();
      else if (actionType === "newFromTemplate") await fileNewFromTemplate();
      else if (actionType === "open") await fileOpen();
      else if (actionType === "openFolder") await scanAndLoadLibrary();
      else if (actionType === "importMusicXml") await importMusicXml();
      else if (actionType === "save") await fileSave();
      else if (actionType === "saveAs") await fileSaveAs();
      else if (actionType === "printPreview") await runPrintAction("preview");
      else if (actionType === "print") await runPrintAction("print");
      else if (actionType === "exportMusicXml") await exportMusicXml();
      else if (actionType === "exportPdf") await runPrintAction("pdf");
      else if (actionType === "close") await fileClose();
      else if (actionType === "quit") await appQuit();
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
      else if (actionType === "find" && editorView) openSearchPanel(editorView);
      else if (actionType === "replace" && editorView) openReplacePanel(editorView);
      else if (actionType === "gotoLine" && editorView) gotoLine(editorView);
      else if (actionType === "findLibrary") promptFindInLibrary();
      else if (actionType === "clearLibraryFilter") clearLibraryFilter();
      else if (actionType === "playStart") await startPlaybackAtIndex(0);
      else if (actionType === "playPrev") await startPlaybackAtMeasureOffset(-1);
      else if (actionType === "playToggle") { if ($btnPlayPause) $btnPlayPause.click(); }
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
      else if (actionType === "zoomIn" && settingsController) settingsController.zoomIn();
      else if (actionType === "zoomOut" && settingsController) settingsController.zoomOut();
      else if (actionType === "zoomReset" && settingsController) settingsController.zoomReset();
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
    appQuit();
  });
}

settingsController = initSettings(window.api);
if (window.api && typeof window.api.getSettings === "function") {
  window.api.getSettings().then((settings) => {
    if (settings) {
      setGlobalHeaderFromSettings(settings);
      setSoundfontFromSettings(settings);
      setFollowFromSettings(settings);
      updateGlobalHeaderToggle();
      refreshHeaderLayers().catch(() => {});
    }
  }).catch(() => {});
}
if (window.api && typeof window.api.onSettingsChanged === "function") {
  window.api.onSettingsChanged((settings) => {
    const prevHeader = `${globalHeaderEnabled}|${globalHeaderText}`;
    const prevSoundfont = soundfontName;
    setGlobalHeaderFromSettings(settings);
    setSoundfontFromSettings(settings);
    setFollowFromSettings(settings);
    updateGlobalHeaderToggle();
    refreshHeaderLayers().catch(() => {});
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

initContextMenu();

requestAnimationFrame(() => {
  resetLayout();
});

loadLastRecentEntry();

if ($errorList) {
  $errorList.addEventListener("click", (e) => {
    const item = e.target && e.target.closest ? e.target.closest(".error-item") : null;
    if (!item) return;
    const index = Number(item.dataset.index);
    const entry = Number.isFinite(index) ? errorEntries[index] : null;
    if (entry && entry.loc) {
      setEditorSelectionAtLineCol(entry.loc.line, entry.loc.col);
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
      setEditorSelectionRange(editorStart, editorEnd);
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

if ($fileHeaderSave) {
  $fileHeaderSave.addEventListener("click", async () => {
    const entry = getActiveFileEntry();
    if (!entry || !entry.path) {
      setStatus("No active file to update.");
      return;
    }
    try {
      await saveFileHeaderText(entry.path, getHeaderEditorValue());
      setStatus("Header saved.");
    } catch (e) {
      await showSaveError(e && e.message ? e.message : String(e));
    }
  });
}

if ($fileHeaderReload) {
  $fileHeaderReload.addEventListener("click", () => {
    updateFileHeaderPanel();
  });
}

if ($fileHeaderToggle) {
  $fileHeaderToggle.addEventListener("click", () => {
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
let drumWarningShown = false;
let followPlayback = true;

function updatePlayButton() {
  if (!$btnPlayPause) return;
  $btnPlayPause.textContent = isPlaying ? "⏸" : "▶";
}

function resetPlaybackState() {
  stopPlaybackForRestart();
  suppressOnEnd = false;
  isPlaying = false;
  isPaused = false;
  lastPlaybackIdx = null;
  lastRenderIdx = null;
  lastStartPlaybackIdx = 0;
  resumeStartIdx = null;
  playbackState = null;
  playbackIndexOffset = 0;
  clearNoteSelection();
  updatePlayButton();
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
  const viewTop = $renderPane.scrollTop;
  const viewBottom = viewTop + $renderPane.clientHeight;
  const linePad = Math.max(80, targetRect.height * 8);
  if (offsetTop < viewTop + linePad) {
    $renderPane.scrollTop = Math.max(0, offsetTop - linePad);
  } else if (offsetTop > viewBottom - linePad) {
    $renderPane.scrollTop = Math.max(0, offsetTop - $renderPane.clientHeight + linePad);
  }
}

async function ensureSoundfontLoaded() {
  // уже загружен
  const desired = soundfontName || "TimGM6mb.sf2";
  if (window.abc2svg && window.abc2svg.sf2 && soundfontReadyName === desired) return;
  if (soundfontLoadPromise && soundfontLoadTarget === desired) return soundfontLoadPromise;

  if (!window.api || typeof window.api.readFileBase64 !== "function") {
    throw new Error("preload API missing: window.api.readFileBase64");
  }

  if (!window.abc2svg) window.abc2svg = {};

  const loadSoundfont = async (name) => {
    const sf2Url = new URL(`../../third_party/sf2/${name}`, window.location.href).href;
    const b64 = await window.api.readFileBase64(sf2Url);
    if (!b64 || !b64.length) throw new Error("SF2 base64 is empty");
    window.abc2svg.sf2 = b64; // чистый base64 (как ты и хотел)
    soundfontReadyName = name;
  };

  soundfontLoadTarget = desired;
  setSoundfontStatus(`Loading soundfont: ${desired}`);
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
    }
  })();
  return soundfontLoadPromise;
}

function ensurePlayer() {
  if (player) return player;

  if (typeof window.AbcPlay !== "function") {
    throw new Error("AbcPlay not found (snd-1.js not loaded?)");
  }

  player = AbcPlay({
    onend: () => {
      if (suppressOnEnd) return;
      isPlaying = false;
      isPaused = false;
      setStatus("OK");
      updatePlayButton();
      if (followPlayback && lastRenderIdx != null && editorView) {
        editorView.dispatch({ selection: { anchor: lastRenderIdx, head: lastRenderIdx } });
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
      if (!followPlayback || fromInjected) return;
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
  if (typeof player.set_sfu === "function") player.set_sfu("abc2svg.sf2");

  return player;
}

function buildPlaybackState(firstSymbol) {
  const symbols = [];
  const measures = [];
  const pushUnique = (arr, symbol) => {
    if (!symbol || !Number.isFinite(symbol.istart)) return;
    if (arr.length && arr[arr.length - 1].istart === symbol.istart) return;
    arr.push({ istart: symbol.istart, symbol });
  };

  let s = firstSymbol;
  let guard = 0;

  if (s) pushUnique(symbols, s);
  if (s) pushUnique(measures, s);

  while (s && guard < 200000) {
    pushUnique(symbols, s);
    if (s.bar_type && s.ts_next) pushUnique(measures, s.ts_next);
    s = s.ts_next;
    guard += 1;
  }

  return { startSymbol: firstSymbol, symbols, measures };
}

function findSymbolAtOrBefore(idx) {
  if (!playbackState || !playbackState.symbols.length) return null;
  let chosen = playbackState.symbols[0].symbol;
  for (const item of playbackState.symbols) {
    if (item.istart <= idx) chosen = item.symbol;
    else break;
  }
  return chosen;
}

function findMeasureIndex(idx) {
  if (!playbackState || !playbackState.measures.length) return 0;
  let current = 0;
  for (let i = 0; i < playbackState.measures.length; i += 1) {
    if (playbackState.measures[i].istart <= idx) current = i;
    else break;
  }
  return current;
}

function stopPlaybackForRestart() {
  if (player && typeof player.stop === "function") {
    suppressOnEnd = true;
    player.stop();
  }
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
  $btnToggleGlobals.textContent = globalHeaderEnabled ? "Globals" : "Globals Off";
}

function updateFollowToggle() {
  if (!$btnToggleFollow) return;
  $btnToggleFollow.classList.toggle("toggle-active", followPlayback);
  $btnToggleFollow.textContent = followPlayback ? "Follow" : "Follow Off";
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
}

function resetSoundfontCache() {
  if (window.abc2svg) window.abc2svg.sf2 = null;
  if (window.abcsf2 && Array.isArray(window.abcsf2)) window.abcsf2.length = 0;
  soundfontReadyName = null;
  soundfontLoadPromise = null;
  soundfontLoadTarget = null;
}

function normalizeHeaderLayer(text) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  return raw.replace(/[\r\n]+$/, "");
}

async function loadHeaderLayer(path) {
  if (!path || !window.api || typeof window.api.readFile !== "function") return "";
  try {
    const data = await window.api.readFile(path);
    return normalizeHeaderLayer(data);
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

function buildHeaderPrefix(entryHeader, includeCheckbars) {
  const parts = [];
  if (globalHeaderEnabled) {
    const globalHeaderRaw = normalizeHeaderLayer(globalHeaderGlobalText);
    if (globalHeaderRaw) parts.push(globalHeaderRaw);
    const localHeaderRaw = normalizeHeaderLayer(globalHeaderLocalText);
    if (localHeaderRaw) parts.push(localHeaderRaw);
    const userHeaderRaw = normalizeHeaderLayer(globalHeaderUserText);
    if (userHeaderRaw) parts.push(userHeaderRaw);
    const legacyHeaderRaw = normalizeHeaderLayer(globalHeaderText);
    if (legacyHeaderRaw) parts.push(legacyHeaderRaw);
  }
  const fileHeaderRaw = String(entryHeader || "");
  if (fileHeaderRaw.trim()) parts.push(fileHeaderRaw.replace(/[\r\n]+$/, ""));
  let header = parts.join("\n");
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
  const tokens3 = [":|:", "||:", ":||"];
  for (const token of tokens3) {
    if (chunk.startsWith(token)) return { token, len: token.length };
  }
  const tokens2 = ["::", "|:", ":|", "|]", "[|", "||"];
  for (const token of tokens2) {
    if (chunk.startsWith(token)) return { token, len: token.length };
  }
  if (chunk.startsWith("|")) return { token: "|", len: 1 };
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
  lastDrumPlaybackActive = false;
  const info = extractDrumPlaybackBars(text);
  const drumVoice = buildDrumVoiceText(info);
  if (!drumVoice) return { text, changed: false };
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
  return { text: `${merged}${suffix}`, changed: true };
}

function getPlaybackPayload() {
  const tuneText = getEditorValue();
  const entry = getActiveFileEntry();
  const prefixPayload = buildHeaderPrefix(entry ? entry.headerText : "", false);
  let payload = prefixPayload.text
    ? { text: `${prefixPayload.text}${tuneText}`, offset: prefixPayload.offset }
    : { text: tuneText, offset: 0 };
  const injected = injectDrumPlayback(payload.text);
  if (injected.changed) payload = { text: injected.text, offset: payload.offset };
  return payload;
}

function getRenderPayload() {
  const tuneText = getEditorValue();
  const entry = getActiveFileEntry();
  const prefixPayload = buildHeaderPrefix(entry ? entry.headerText : "", true);
  if (!prefixPayload.text) return { text: tuneText, offset: 0 };
  return { text: `${prefixPayload.text}${tuneText}`, offset: prefixPayload.offset };
}

async function preparePlayback() {
  clearErrors();
  await ensureSoundfontLoaded();
  const p = ensurePlayer();
  if (typeof p.set_sfu === "function") p.set_sfu("abc2svg.sf2");
  if (player && typeof player.stop === "function") {
    suppressOnEnd = true;
    player.stop();
  }
  if (typeof p.clear === "function") p.clear();

  try { sessionStorage.setItem("audio", "sf2"); } catch {}

  const AbcCtor = getAbcCtor();
  const user = {
    img_out: () => {},
    err: (m) => logErr(m),
    errmsg: (m) => logErr(m),
    abcplay: p,
  };
  const abc = new AbcCtor(user);
  const playbackPayload = getPlaybackPayload();
  if (lastDrumPlaybackActive && !drumWarningShown) {
    setSoundfontStatus("Drums require a SF2 with percussion (e.g. Roland).", 6000);
    drumWarningShown = true;
  }
  if (window.__abcarusDebugDrums) {
    const lines = String(playbackPayload.text || "").split(/\r\n|\n|\r/);
    const drumLines = lines.filter((line) => /DRUM|drum|drummap|MIDI channel/i.test(line));
    const tail = lines.slice(-60);
    console.log("[abcarus] playback payload (drum lines):\n" + drumLines.join("\n"));
    console.log("[abcarus] playback payload (tail):\n" + tail.join("\n"));
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
  return p;
}

function startPlaybackFromPrepared(startIdx) {
  const startSymbol = findSymbolAtOrBefore(startIdx)
    || (playbackState ? playbackState.startSymbol : null);
  if (!startSymbol) throw new Error("Playback start not found.");

  lastStartPlaybackIdx = Number.isFinite(startSymbol.istart) ? startSymbol.istart : 0;
  lastPlaybackIdx = null;
  lastRenderIdx = null;
  resumeStartIdx = null;
  suppressOnEnd = true;

  player.play(startSymbol, null, 0);
  isPlaying = true;
  isPaused = false;
  setStatus("Playing…");
  updatePlayButton();
  setTimeout(() => {
    suppressOnEnd = false;
  }, 0);
}

async function startPlaybackAtIndex(startIdx, isPlaybackIdx = false) {
  clearNoteSelection();
  stopPlaybackForRestart();
  await preparePlayback();
  const idx = Number.isFinite(startIdx)
    ? startIdx
    : (playbackState && playbackState.startSymbol ? playbackState.startSymbol.istart : 0);
  const playbackIdx = isPlaybackIdx ? idx : (idx + playbackIndexOffset);
  startPlaybackFromPrepared(playbackIdx);
}

function pausePlayback() {
  if (!player || !isPlaying) return;
  resumeStartIdx = Number.isFinite(lastPlaybackIdx) ? lastPlaybackIdx : lastStartPlaybackIdx;
  stopPlaybackForRestart();
  isPlaying = false;
  isPaused = true;
  setStatus("Paused");
  updatePlayButton();
  if (followPlayback && lastRenderIdx != null && editorView) {
    const max = editorView.state.doc.length;
    const idx = Math.max(0, Math.min(lastRenderIdx, max));
    editorView.dispatch({ selection: { anchor: idx, head: idx } });
  }
}

async function startPlaybackAtMeasureOffset(delta) {
  clearNoteSelection();
  stopPlaybackForRestart();
  await preparePlayback();
  if (!playbackState || !playbackState.measures.length) {
    startPlaybackFromPrepared(0);
    return;
  }
  const baseIdx = Number.isFinite(lastPlaybackIdx) ? lastPlaybackIdx : lastStartPlaybackIdx;
  const current = findMeasureIndex(baseIdx);
  const targetIndex = Math.max(0, Math.min(playbackState.measures.length - 1, current + delta));
  const target = playbackState.measures[targetIndex];
  const targetIdx = target && Number.isFinite(target.istart) ? target.istart : 0;
  startPlaybackFromPrepared(targetIdx);
}

if ($btnPlayPause) {
  $btnPlayPause.addEventListener("click", async () => {
    try {
      if (isPlaying) {
        pausePlayback();
        return;
      }
      if (isPaused) {
        const idx = Number.isFinite(resumeStartIdx) ? resumeStartIdx : lastStartPlaybackIdx;
        await startPlaybackAtIndex(idx, true);
        return;
      }
      await startPlaybackAtIndex(null);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
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
      await startPlaybackAtMeasureOffset(-1);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
    }
  });
}

if ($btnNextMeasure) {
  $btnNextMeasure.addEventListener("click", async () => {
    try {
      await startPlaybackAtMeasureOffset(1);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      setStatus("Error");
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

if ($btnToggleGlobals) {
  $btnToggleGlobals.addEventListener("click", async () => {
    if (!window.api || typeof window.api.updateSettings !== "function") return;
    await window.api.updateSettings({ globalHeaderEnabled: !globalHeaderEnabled });
  });
}

updatePlayButton();
updateFollowToggle();
