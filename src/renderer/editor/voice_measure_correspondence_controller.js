import { ViewPlugin } from "../../../third_party/codemirror/cm.js";
import {
  getCorrespondingMeasureRanges,
  getReferenceMeasureRangeAt,
} from "../abc/voice_measure_correspondence_model.js";
import { buildVoiceMeasurePeerDecorations } from "./range_decorations.js";

function createVoiceMeasureCorrespondenceController() {
  let cachedText = null;
  let cachedOffset = null;
  let cachedRanges = [];

  function getRanges(state) {
    const text = state.doc.toString();
    const offset = state.selection.main.head;
    if (text === cachedText && offset === cachedOffset) return cachedRanges;
    cachedText = text;
    cachedOffset = offset;
    cachedRanges = getCorrespondingMeasureRanges(text, offset).ranges;
    return cachedRanges;
  }

  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildVoiceMeasurePeerDecorations(view.state, getRanges(view.state));
    }

    update(update) {
      if (!update.docChanged && !update.selectionSet) return;
      this.decorations = buildVoiceMeasurePeerDecorations(update.state, getRanges(update.state));
    }
  }, {
    decorations: (value) => value.decorations,
  });

  function resolveReferenceMeasureRange(text, offset) {
    return getReferenceMeasureRangeAt(text, offset).range;
  }

  return { plugin, resolveReferenceMeasureRange };
}

export { createVoiceMeasureCorrespondenceController };
