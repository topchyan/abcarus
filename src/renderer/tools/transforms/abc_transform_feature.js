import {
  getNativeTransposeSupport,
  transformTranspose,
} from "../../transpose.mjs";
import {
  normalizeMeasuresLineBreaks,
  transformMeasuresByLinebreakMarker,
  transformMeasuresPerLine,
} from "../../measures.mjs";
import {
  transformLengthScaling,
  transformAbcUnitScaling,
} from "../../abc/text_transforms.js";
import { analyzeLyricFitInText } from "../../abc/lyric_fit.js";
import { transformTurkishNotation53 } from "./turkish_notation_transform.mjs";

function createAbcTransformFeature({
  windowRef = typeof window !== "undefined" ? window : null,
  devConfig = {},
  getEditorText = () => "",
  getHeaderText = () => "",
  getSettings = () => null,
  setEditorTextForSmoke = () => {},
  applyTransformedText = () => {},
  showTransformError = async () => {},
  showLyricFitReport = async () => {},
  setStatus = () => {},
  logError = () => {},
  alignBarsInText = (text) => text,
} = {}) {
  let transposePreviewBaseText = null;
  let transposePreviewHeaderText = null;
  let transposePreviewDelta = 0;

  function resetTransposePreview() {
    transposePreviewBaseText = null;
    transposePreviewHeaderText = null;
    transposePreviewDelta = 0;
  }

  function getTransposePreview(options = {}) {
    const currentText = String(options.currentText != null ? options.currentText : getEditorText());
    const currentHeaderText = String(options.currentHeaderText != null ? options.currentHeaderText : getHeaderText());
    if (transposePreviewBaseText == null) {
      transposePreviewBaseText = currentText;
      transposePreviewHeaderText = currentHeaderText;
      transposePreviewDelta = 0;
    }
    return {
      baseText: String(transposePreviewBaseText || ""),
      headerText: String(transposePreviewHeaderText || ""),
      delta: Number(transposePreviewDelta) || 0,
    };
  }

  function setTransposePreview(baseText, headerText, delta) {
    transposePreviewBaseText = String(baseText || "");
    transposePreviewHeaderText = String(headerText || "");
    transposePreviewDelta = Number(delta) || 0;
  }

  async function apply(options = {}) {
    const abcText = getEditorText();
    if (!abcText.trim()) {
      setStatus("No notation to transform.");
      return;
    }
    if (options.doubleLengths && options.halfLengths) {
      await showTransformError("Choose either double or half note lengths, not both.");
      return;
    }
    const mertebe = String(options.mertebe || "");
    if (mertebe && mertebe !== "augment" && mertebe !== "diminish") {
      await showTransformError("Unknown rhythmic notation transform.");
      setStatus("Error");
      return;
    }

    const settings = getSettings() || {};
    const alignAfterTransform = (text) => alignBarsInText(text);

    const turkish = options.turkishNotation;
    const turkishDirection = turkish && typeof turkish === "object"
      ? String(turkish.direction || "")
      : "";
    if (turkishDirection === "toConcert" || turkishDirection === "toBolahenk") {
      resetTransposePreview();
      const enabled = Boolean(
        settings.supportMicrotonalNotation
        || settings.makamToolsEnabled
        || settings.studyToolsEnabled
      );
      if (!enabled) {
        await showTransformError("Enable Support microtonal notation in Settings to use this experimental converter.");
        setStatus("Error");
        return;
      }
      try {
        const transformed = transformTurkishNotation53(abcText, turkishDirection, {
          headerText: getHeaderText(),
        });
        applyTransformedText(alignAfterTransform(transformed));
        setStatus("Converted (experimental)");
        return;
      } catch (e) {
        logError(`Bolahenk/concert conversion failed.\n\n${(e && e.stack) ? e.stack : String(e)}`);
        await showTransformError((e && e.message) ? e.message : "Bolahenk/concert conversion failed.");
        setStatus("Error");
        return;
      }
    }

    if (mertebe) {
      resetTransposePreview();
      const combined = options.doubleLengths
        || options.halfLengths
        || options.transposeSemitones != null
        || options.measuresPerLine
        || options.linebreakMarker
        || options.voice
        || options.renumberX != null;
      if (combined) {
        await showTransformError("Apply rhythmic notation changes separately from other transforms.");
        setStatus("Error");
        return;
      }
      const transformed = transformAbcUnitScaling(abcText, mertebe === "augment" ? 2 : 0.5);
      applyTransformedText(alignAfterTransform(transformed));
      setStatus(mertebe === "augment" ? "Rhythmic values augmented" : "Rhythmic values diminished");
      return;
    }
    const hasOnlyLengthTransform = (options.doubleLengths || options.halfLengths)
      && options.transposeSemitones == null
      && !options.measuresPerLine
      && !options.linebreakMarker
      && !options.voice
      && options.renumberX == null;
    if (hasOnlyLengthTransform) {
      resetTransposePreview();
      const mode = options.doubleLengths ? "double" : "half";
      const transformed = alignAfterTransform(transformLengthScaling(abcText, mode));
      applyTransformedText(transformed);
      setStatus("OK");
      return;
    }

    const hasOnlyMeasuresPerLine = options.measuresPerLine
      && options.transposeSemitones == null
      && !options.linebreakMarker
      && !options.voice
      && options.renumberX == null
      && !options.doubleLengths
      && !options.halfLengths;
    if (hasOnlyMeasuresPerLine) {
      resetTransposePreview();
      let transformed = transformMeasuresPerLine(abcText, options.measuresPerLine);
      transformed = normalizeMeasuresLineBreaks(transformed);
      transformed = alignBarsInText(transformed);
      transformed = normalizeMeasuresLineBreaks(transformed);
      applyTransformedText(transformed);
      setStatus("OK");
      return;
    }

    const hasOnlyLinebreakMarker = options.linebreakMarker
      && options.transposeSemitones == null
      && !options.measuresPerLine
      && !options.voice
      && options.renumberX == null
      && !options.doubleLengths
      && !options.halfLengths;
    if (hasOnlyLinebreakMarker) {
      resetTransposePreview();
      let transformed = transformMeasuresByLinebreakMarker(abcText);
      transformed = normalizeMeasuresLineBreaks(transformed);
      transformed = alignAfterTransform(transformed);
      transformed = normalizeMeasuresLineBreaks(transformed);
      applyTransformedText(transformed);
      setStatus("OK");
      return;
    }

    const hasOnlyTranspose = options.transposeSemitones != null
      && !options.measuresPerLine
      && !options.linebreakMarker
      && !options.voice
      && options.renumberX == null
      && !options.doubleLengths
      && !options.halfLengths;
    if (hasOnlyTranspose) {
      const preferNative = !settings || settings.useNativeTranspose !== false;
      if (preferNative) {
        const preview = getTransposePreview({
          currentText: abcText,
          currentHeaderText: getHeaderText(),
        });
        const nextDelta = preview.delta + Number(options.transposeSemitones || 0);
        const headerText = preview.headerText;
        const support = getNativeTransposeSupport(preview.baseText, { headerText });
        if (!support.ok) {
          await showTransformError(support.reason || "Default transpose is not supported for this tune.");
          setStatus("Error");
          return;
        }
        try {
          const transformed = nextDelta === 0
            ? preview.baseText
            : transformTranspose(preview.baseText, nextDelta, { headerText });
          const aligned = alignAfterTransform(transformed);
          setTransposePreview(preview.baseText, headerText, nextDelta);
          applyTransformedText(aligned, { resetTransposePreview: false });
          setStatus("OK");
          return;
        } catch (e) {
          logError(`Native transpose failed.\n\n${(e && e.stack) ? e.stack : String(e)}`);
        }
      }
    }

    await showTransformError("This transform combination is not supported.");
    setStatus("Error");
  }

  function alignBars() {
    const text = getEditorText();
    if (!text.trim()) {
      setStatus("No notation to align.");
      return;
    }
    const aligned = alignBarsInText(text);
    if (aligned === text) {
      setStatus("Already aligned.");
      return;
    }
    resetTransposePreview();
    applyTransformedText(aligned);
    setStatus("OK");
  }

  async function checkLyricFit() {
    const text = getEditorText();
    if (!text.trim()) {
      setStatus("No notation to check.");
      return;
    }
    const report = analyzeLyricFitInText(text);
    if (!report.checkedBars) {
      await showLyricFitReport("No explicit music/lyrics bar pairs were found.");
      return;
    }
    if (!report.mismatches.length) {
      await showLyricFitReport(`Lyric fit looks consistent in ${report.checkedBars} checked bar(s).`);
      return;
    }
    const shown = report.mismatches.slice(0, 16);
    const detail = shown.map((item) => (
      `Line ${item.line}, bar ${item.bar}: ${item.notes} note anchor(s), `
      + `${item.lyrics} lyric advance(s); ${item.suggestion}.`
    )).join("\n");
    const remaining = report.mismatches.length - shown.length;
    await showLyricFitReport(
      `${report.mismatches.length} possible lyric-fit mismatch(es):\n\n${detail}`
      + (remaining > 0 ? `\n\n…and ${remaining} more.` : "")
      + "\n\nThis is a conservative check. Review ties, melismas, and unsung notes before editing.",
    );
  }

  function installDevSmoke() {
    if (!devConfig || devConfig.ABCARUS_DEV_TRANSFORM_SMOKE !== "1") return false;
    const win = windowRef;
    if (!win) return false;
    win.__abcarusDevTransformSmoke = {
      apply: (options) => apply(options || {}),
      getText: () => getEditorText(),
      setText: (text) => setEditorTextForSmoke(String(text || "")),
    };
    return true;
  }

  function installTurkishNotationMacro() {
    const win = windowRef;
    if (!win) return false;
    win.__abcarusTurkishNotation = {
      convert: () => apply({ turkishNotation: { direction: "toConcert" } }),
      restore: () => apply({ turkishNotation: { direction: "toBolahenk" } }),
      toConcert: () => apply({ turkishNotation: { direction: "toConcert" } }),
      toBolahenk: () => apply({ turkishNotation: { direction: "toBolahenk" } }),
    };
    return true;
  }

  return {
    alignBars,
    checkLyricFit,
    apply,
    installDevSmoke,
    installTurkishNotationMacro,
    resetTransposePreview,
  };
}

export {
  createAbcTransformFeature,
};
