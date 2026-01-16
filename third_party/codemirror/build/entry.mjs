// CodeMirror 6 vendored bundle entry for ABCarus.
//
// This file defines the explicit export surface of `third_party/codemirror/cm.js`.
// Keep exports deliberate and minimal: only what ABCarus uses (or plans to use).

import { EditorState, EditorSelection, StateEffect, StateField, Facet, Compartment, RangeSetBuilder } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  ViewPlugin,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  hoverTooltip,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  foldService,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { openSearchPanel, gotoLine, searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  completeFromList,
  closeBrackets,
  closeBracketsKeymap,
  CompletionContext,
} from "@codemirror/autocomplete";
import { linter, setDiagnostics, lintKeymap } from "@codemirror/lint";

export {
  Compartment,
  CompletionContext,
  Decoration,
  EditorSelection,
  EditorState,
  EditorView,
  Facet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  ViewPlugin,
  autocompletion,
  bracketMatching,
  closeBrackets,
  closeBracketsKeymap,
  completeFromList,
  foldGutter,
  foldKeymap,
  foldService,
  gotoLine,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  indentOnInput,
  indentUnit,
  keymap,
  lineNumbers,
  lintKeymap,
  linter,
  openSearchPanel,
  rectangularSelection,
  searchKeymap,
  setDiagnostics,
};

// Match the old vendored `basicSetup` behavior and avoid selection-match highlighting.
// (Upstream `codemirror/basicSetup` includes highlightSelectionMatches, which we don't want in ABCarus.)
export const basicSetup = (() => [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
])();

// Note: Some identifiers (e.g. `Extension`, `DecorationSet`, `Diagnostic`) are TypeScript-only types and do not exist at runtime.
// If we need additional runtime exports, add them explicitly here.
