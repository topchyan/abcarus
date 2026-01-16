// CodeMirror 6 vendored bundle entry for ABCarus.
//
// This file defines the explicit export surface of `third_party/codemirror/cm.js`.
// Keep exports deliberate and minimal: only what ABCarus uses (or plans to use).

export { EditorState, EditorSelection, StateEffect, StateField, Facet, Compartment } from "@codemirror/state";
export { EditorView, Decoration, ViewPlugin, keymap, lineNumbers, hoverTooltip } from "@codemirror/view";
export { RangeSetBuilder } from "@codemirror/state";

export { basicSetup } from "codemirror";

export {
  foldService,
  foldGutter,
  indentUnit,
  bracketMatching,
} from "@codemirror/language";

export { openSearchPanel, gotoLine, searchKeymap } from "@codemirror/search";

export {
  autocompletion,
  completeFromList,
  closeBrackets,
  closeBracketsKeymap,
  CompletionContext,
} from "@codemirror/autocomplete";

export { linter, setDiagnostics, lintKeymap } from "@codemirror/lint";

// Note: Some identifiers (e.g. `Extension`, `DecorationSet`, `Diagnostic`) are TypeScript-only types and do not exist at runtime.
// If we need additional runtime exports, add them explicitly here.
