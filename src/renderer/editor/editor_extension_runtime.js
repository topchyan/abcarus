import {
  Compartment,
  autocompletion,
} from "../../../third_party/codemirror/cm.js";
import { buildAbcCompletionSource } from "./abc_completion.js";
import { abcHighlight } from "./abc_decorations.js";
import { buildAbcHoverTooltip } from "./abc_hover.js";

export function createEditorExtensionRuntime({
  getEditorView = () => null,
  getDiagnosticExtensions = () => [],
  getInitialDiagnosticExtensions = getDiagnosticExtensions,
} = {}) {
  const highlightCompartment = new Compartment();
  const diagnosticsCompartment = new Compartment();
  const completionCompartment = new Compartment();
  const hoverCompartment = new Compartment();
  const tuningModeCompartment = new Compartment();
  const payloadReadOnlyCompartment = new Compartment();
  const setListReadOnlyCompartment = new Compartment();

  const completionExtensions = () => [
    autocompletion({
      override: [buildAbcCompletionSource()],
      activateOnTyping: false,
    }),
  ];

  function getInitialExtensions() {
    return [
      highlightCompartment.of([abcHighlight]),
      diagnosticsCompartment.of(getInitialDiagnosticExtensions()),
      completionCompartment.of(completionExtensions()),
      hoverCompartment.of([]),
      tuningModeCompartment.of([]),
      payloadReadOnlyCompartment.of([]),
      setListReadOnlyCompartment.of([]),
    ];
  }

  function reconfigure({
    highlightEnabled = true,
    diagnosticsEnabled = true,
    completionEnabled = true,
    hoverEnabled = false,
    tuningModeExtensions = [],
  } = {}) {
    const editorView = getEditorView();
    if (!editorView) return false;
    editorView.dispatch({
      effects: [
        highlightCompartment.reconfigure(highlightEnabled ? [abcHighlight] : []),
        diagnosticsCompartment.reconfigure(diagnosticsEnabled ? getDiagnosticExtensions() : []),
        completionCompartment.reconfigure(completionEnabled ? completionExtensions() : []),
        hoverCompartment.reconfigure(hoverEnabled ? [buildAbcHoverTooltip()] : []),
        tuningModeCompartment.reconfigure(
          Array.isArray(tuningModeExtensions) ? tuningModeExtensions : [],
        ),
      ],
      scrollIntoView: false,
    });
    return true;
  }

  return {
    getInitialExtensions,
    payloadReadOnlyCompartment,
    setListReadOnlyCompartment,
    reconfigure,
  };
}
