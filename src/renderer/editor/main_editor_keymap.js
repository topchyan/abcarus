import {
  acceptCompletion,
  gotoLine,
  keymap,
} from "../../../third_party/codemirror/cm.js";
import {
  indentSelectionLess,
  indentSelectionMore,
  moveLineSelection,
  openFindPanel,
  openReplacePanel,
} from "./editor_commands.js";
import { planMeasureTabAction } from "../abc/measure_input_assistance.js";
import { alignBarsInText } from "../abc/align_bars.js";

function getLineStarts(text) {
  const starts = [0];
  const pattern = /\r\n|\r|\n/g;
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    starts.push(match.index + match[0].length);
  }
  return starts;
}

function findLineAtOffset(text, offset) {
  const src = String(text || "");
  const starts = getLineStarts(src);
  const pos = Math.max(0, Math.min(Number(offset) || 0, src.length));
  let line = 0;
  for (let i = 1; i < starts.length; i += 1) {
    if (starts[i] > pos) break;
    line = i;
  }
  return { line, column: pos - starts[line], starts };
}

function mapOffsetAfterAlignment(source, aligned, offset) {
  const sourceInfo = findLineAtOffset(source, offset);
  const sourceLines = String(source || "").split(/\r\n|\r|\n/);
  const alignedLines = String(aligned || "").split("\n");
  if (sourceInfo.line >= alignedLines.length) return Math.min(offset, String(aligned || "").length);

  const sourceLine = sourceLines[sourceInfo.line] || "";
  const alignedLine = alignedLines[sourceInfo.line] || "";
  const prefix = sourceLine.slice(0, Math.min(sourceInfo.column, sourceLine.length));
  const nonWhitespace = Array.from(prefix).filter((char) => !/\s/.test(char)).length;

  let column = 0;
  let seen = 0;
  while (column < alignedLine.length && seen < nonWhitespace) {
    if (!/\s/.test(alignedLine[column])) seen += 1;
    column += 1;
  }
  while (column < alignedLine.length && /\s/.test(alignedLine[column])) column += 1;

  const alignedStarts = getLineStarts(aligned);
  return Math.min(alignedStarts[sourceInfo.line] + column, String(aligned || "").length);
}

function preserveLineEndings(source, formatted) {
  const src = String(source || "");
  const lineEnding = src.includes("\r\n") ? "\r\n" : (src.includes("\r") ? "\r" : "\n");
  if (lineEnding === "\n") return formatted;
  return String(formatted || "").replace(/\n/g, lineEnding);
}

function trimLineEndings(text) {
  return String(text || "")
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n");
}

function runMeasureTab(view, showToast = () => {}) {
  if (!view || !view.state || view.state.readOnly) return false;
  const selection = view.state.selection;
  const ranges = selection && Array.isArray(selection.ranges) ? selection.ranges : [];
  const main = selection && selection.main;
  if (ranges.length !== 1 || !main || main.from !== main.to) return indentSelectionMore(view);

  const plan = planMeasureTabAction(view.state.doc.toString(), main.head);
  if (!plan) return indentSelectionMore(view);
  if (plan.action === "insert") {
    const source = view.state.doc.toString();
    const inserted = `${source.slice(0, plan.from)}${plan.insert}${source.slice(plan.from)}`;
    const aligned = preserveLineEndings(inserted, alignBarsInText(inserted));
    if (trimLineEndings(aligned) !== trimLineEndings(inserted)) {
      view.dispatch({
        changes: { from: 0, to: source.length, insert: aligned },
        selection: { anchor: mapOffsetAfterAlignment(inserted, aligned, plan.from + plan.insert.length) },
        userEvent: "input",
      });
      return true;
    }
    view.dispatch({
      changes: { from: plan.from, insert: plan.insert },
      selection: { anchor: plan.from + plan.insert.length },
      userEvent: "input",
    });
    return true;
  }
  if (plan.action === "advance") {
    view.dispatch({ selection: { anchor: plan.to }, scrollIntoView: true });
    return true;
  }

  const message = plan.action === "not_at_end"
    ? "Move the cursor to the end of the measure before inserting a barline."
    : `${plan.text || "Measure cannot be completed"}. Barline not inserted.`;
  showToast(message, 2200);
  return true;
}

export function createMainEditorKeymap({
  documentRef = document,
  windowRef = window,
  isRawMode = () => false,
  showToast = () => {},
  fileSave = () => {},
  toggleMidiInput = () => {},
  toggleMidiMute = () => {},
  goToMeasure = async () => {},
  openAbcHelper = () => true,
  toggleLineComments = () => false,
  togglePlayPause = async () => {},
  startPlayback = () => {},
  resetLayout = () => {},
  refreshErrors = () => {},
  getFocusedEditorView = () => null,
} = {}) {
  const completionTooltipOpen = (view) => (
    Boolean(view && view.hasFocus)
    && Boolean(documentRef.querySelector(".cm-tooltip-autocomplete"))
  );

  const extension = keymap.of([
    { key: "Ctrl-s", run: () => { fileSave(); return true; } },
    { key: "Mod-s", run: () => { fileSave(); return true; } },
    { key: "Ctrl-f", run: openFindPanel },
    { key: "Mod-f", run: openFindPanel },
    { key: "Ctrl-h", run: openReplacePanel },
    { key: "Mod-h", run: openReplacePanel },
    { key: "Ctrl-Alt-i", run: () => { toggleMidiInput(); return true; } },
    { key: "Mod-Alt-i", run: () => { toggleMidiInput(); return true; } },
    { key: "Ctrl-Alt-m", run: () => { toggleMidiMute(); return true; } },
    { key: "Mod-Alt-m", run: () => { toggleMidiMute(); return true; } },
    { key: "Ctrl-Alt-g", run: gotoLine },
    { key: "Mod-Alt-g", run: gotoLine },
    { key: "Ctrl-g", run: () => { goToMeasure().catch(() => {}); return true; } },
    { key: "Mod-g", run: () => { goToMeasure().catch(() => {}); return true; } },
    { key: "Ctrl-F7", run: (view) => moveLineSelection(view, 1) },
    { key: "Mod-F7", run: (view) => moveLineSelection(view, 1) },
    { key: "Ctrl-F5", run: (view) => moveLineSelection(view, -1) },
    { key: "Mod-F5", run: (view) => moveLineSelection(view, -1) },
    { key: "Ctrl-F2", run: openAbcHelper },
    { key: "Enter", run: (view) => (completionTooltipOpen(view) ? acceptCompletion(view) : false) },
    { key: "Tab", run: (view) => (completionTooltipOpen(view) ? acceptCompletion(view) : runMeasureTab(view, showToast)) },
    { key: "Shift-Tab", run: (view) => (completionTooltipOpen(view) ? false : indentSelectionLess(view)) },
    { key: "Mod-/", run: toggleLineComments },
    {
      key: "F5",
      run: () => {
        if (isRawMode()) showToast("Raw mode: switch to tune mode to play.", 2200);
        else togglePlayPause().catch(() => {});
        return true;
      },
    },
    {
      key: "F4",
      run: () => {
        if (isRawMode()) showToast("Raw mode: switch to tune mode to play.", 2200);
        else startPlayback(0);
        return true;
      },
    },
    { key: "F8", run: () => { resetLayout(); return true; } },
    { key: "F9", run: () => { refreshErrors(); return true; } },
  ]);

  function installCompletionAcceptance() {
    if (windowRef.__abcarusCompletionKeyHandlerInstalled) return;
    windowRef.__abcarusCompletionKeyHandlerInstalled = true;
    documentRef.addEventListener("keydown", (event) => {
      try {
        if (!event || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const key = String(event.key || "");
        if (key !== "Enter" && key !== "Tab") return;
        if (!documentRef.querySelector(".cm-tooltip-autocomplete")) return;
        const view = getFocusedEditorView();
        if (!view || !acceptCompletion(view)) return;
        event.preventDefault();
        event.stopPropagation();
      } catch {}
    }, true);
  }

  return {
    extension,
    installCompletionAcceptance,
  };
}

export { runMeasureTab };
