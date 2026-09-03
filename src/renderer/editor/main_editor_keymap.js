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

function runMeasureTab(view, showToast = () => {}) {
  if (!view || !view.state || view.state.readOnly) return false;
  const selection = view.state.selection;
  const ranges = selection && Array.isArray(selection.ranges) ? selection.ranges : [];
  const main = selection && selection.main;
  if (ranges.length !== 1 || !main || main.from !== main.to) return indentSelectionMore(view);

  const plan = planMeasureTabAction(view.state.doc.toString(), main.head);
  if (!plan) return indentSelectionMore(view);
  if (plan.action === "insert") {
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
