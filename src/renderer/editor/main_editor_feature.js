import {
  EditorState,
  EditorView,
  basicSetup,
  foldService,
  indentUnit,
  rectangularSelection,
} from "../../../third_party/codemirror/cm.js";
import { foldBeginTextBlocks } from "./editor_commands.js";
import { createMainEditorKeymap } from "./main_editor_keymap.js";
import { createMainEditorUpdateRuntime } from "./main_editor_update_runtime.js";
import { computeMeasureInputAssistance } from "../abc/measure_input_assistance.js";
import { getMeasureInputStatusDisplay } from "./measure_input_status_model.js";

export function createRectSelectionExtension() {
  return rectangularSelection({
    // Linux window managers often reserve Alt+drag for moving windows.
    eventFilter: (event) => Boolean(
      event
      && event.button === 0
      && (
        event.altKey
        || (event.ctrlKey && event.shiftKey)
      )
    ),
  });
}

export function createMainEditorFeature({
  host,
  cursorStatusElement = null,
  measureStatusElement = null,
  initialDoc = "",
  extensionRuntime,
  keymapOptions = {},
  updateOptions = {},
  isPayloadMode = () => false,
  shouldSuppressErrorHighlightClear = () => false,
  getActiveErrorHighlight = () => null,
  clearActiveErrorHighlight = () => {},
  showContextMenuAt = () => {},
  updateAbUi = () => {},
} = {}) {
  let view = null;
  let lastCursorStatus = null;
  const keymapRuntime = createMainEditorKeymap(keymapOptions);

  function setCursorStatus(line, col, offset, totalLines, totalChars) {
    if (!cursorStatusElement) return;
    lastCursorStatus = { line, col, offset, totalLines, totalChars };
    const text = `Ln ${line}/${totalLines}, Col ${col}  •  Ch ${offset}/${totalChars}`;
    cursorStatusElement.textContent = text;
    cursorStatusElement.title = text;
  }

  function refreshCursorStatus() {
    if (!lastCursorStatus) return;
    const { line, col, offset, totalLines, totalChars } = lastCursorStatus;
    setCursorStatus(line, col, offset, totalLines, totalChars);
  }

  function setMeasureInputStatus(text, offset) {
    if (!measureStatusElement) return;
    const result = typeof text === "string"
      ? computeMeasureInputAssistance(text, offset)
      : null;
    const display = getMeasureInputStatusDisplay(result);
    measureStatusElement.textContent = display.text;
    measureStatusElement.hidden = false;
    measureStatusElement.dataset.state = display.state;
    measureStatusElement.title = display.title;
    measureStatusElement.setAttribute("aria-label", display.ariaLabel);
  }

  const updateRuntime = createMainEditorUpdateRuntime({
    ...updateOptions,
    setCursorStatus,
    setMeasureInputStatus,
  });

  function installDomHooks() {
    view.dom.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || shouldSuppressErrorHighlightClear()) return;
      const activeHighlight = getActiveErrorHighlight();
      if (!activeHighlight) return;
      if (!Number.isFinite(activeHighlight.from) || !Number.isFinite(activeHighlight.to)) return;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return;
      if (pos < activeHighlight.from || pos > activeHighlight.to) {
        clearActiveErrorHighlight("abandon");
      }
    }, true);

    view.dom.addEventListener("copy", (event) => {
      try {
        if (!isPayloadMode()) return;
        const selection = view.state.selection;
        if (!selection || selection.empty) return;
        const parts = [];
        for (const range of selection.ranges || []) {
          if (!range || range.from === range.to) continue;
          parts.push(view.state.doc.sliceString(range.from, range.to));
        }
        if (!parts.length) return;
        if (event.clipboardData && typeof event.clipboardData.setData === "function") {
          event.clipboardData.setData("text/plain", parts.join("\n"));
          event.preventDefault();
        }
      } catch {}
    });

    view.dom.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showContextMenuAt(event.clientX, event.clientY, { type: "editor" });
    });
  }

  function init() {
    if (view || !host) return view;
    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        createRectSelectionExtension(),
        ...extensionRuntime.getInitialExtensions(),
        updateRuntime.extension,
        keymapRuntime.extension,
        foldService.of(foldBeginTextBlocks),
        EditorState.tabSize.of(2),
        indentUnit.of("  "),
      ],
    });
    view = new EditorView({ state, parent: host });
    updateAbUi();
    keymapRuntime.installCompletionAcceptance();
    installDomHooks();
    setCursorStatus(1, 1, 1, state.doc.lines, state.doc.length);
    setMeasureInputStatus(state.doc.toString(), 0);
    return view;
  }

  return {
    clearPendingRender: updateRuntime.clearPendingRender,
    getView: () => view,
    init,
    refreshCursorStatus,
    setPendingPlaybackRangeOrigin: updateRuntime.setPendingPlaybackRangeOrigin,
    setSuppressPlaybackRangeSelectionSync: updateRuntime.setSuppressPlaybackRangeSelectionSync,
  };
}
