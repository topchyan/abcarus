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

function prepareTurkishNotationFor12Edo(text) {
  const originalTemperamentLines = [];
  const preparedText = String(text || "").replace(
    /^(\s*%%\s*MIDI\s+temperamentequal\s+)53(\s*)$/gmi,
    (line, prefix, suffix) => {
      originalTemperamentLines.push(line);
      return `${prefix}12${suffix}`;
    },
  );
  return {
    text: preparedText,
    restoreTemperament(transformed) {
      let index = 0;
      return String(transformed || "").replace(
        /^(\s*%%\s*MIDI\s+temperamentequal\s+)12(\s*)$/gmi,
        (line) => originalTemperamentLines[index++] || line,
      );
    },
  };
}

function rewriteTurkishKeySignature(text, direction) {
  const toConcert = direction === "toConcert";
  const from = toConcert ? "_2B" : "^2f";
  const to = toConcert ? "^2f" : "_2B";
  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(\\s*K:[^\\n]*?)${escapedFrom}\\b`, "gmi");
  return String(text || "").replace(pattern, (_line, prefix) => `${prefix}${to}`);
}

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

    const turkish = options.turkishNotation;
    const turkishDirection = turkish && typeof turkish === "object"
      ? String(turkish.direction || "")
      : "";
    if (turkishDirection === "toConcert" || turkishDirection === "toBolahenk") {
      const toConcert = turkishDirection === "toConcert";
      const pitchSteps = toConcert ? -5 : 5;
      let transformed = transformAbcUnitScaling(abcText, toConcert ? 2 : 0.5);
      const twelveEdoText = prepareTurkishNotationFor12Edo(transformed);
      transformed = twelveEdoText.text;
      const headerText = prepareTurkishNotationFor12Edo(getHeaderText()).text;
      const support = getNativeTransposeSupport(transformed, { headerText });
      if (!support.ok) {
        await showTransformError(support.reason || "Turkish notation macro cannot transpose this tune.");
        setStatus("Error");
        return;
      }
      try {
        transformed = transformTranspose(transformed, pitchSteps, { headerText, prefer: "sharp" });
        transformed = rewriteTurkishKeySignature(transformed, turkishDirection);
        transformed = twelveEdoText.restoreTemperament(transformed);
        const lines = transformed.split(/\r\n|\n|\r/);
        let foundVoice = false;
        transformed = lines.map((line) => {
          if (!/^\s*V\s*:/i.test(line)) return line;
          foundVoice = true;
          if (toConcert) return line.replace(/\s+transpose\s*=\s*-17\b/gi, "").replace(/[ \t]+$/, "");
          if (/\btranspose\s*=/i.test(line)) return line;
          return `${line} transpose=-17`;
        }).join("\n");
        if (!toConcert && !foundVoice) {
          const keyIndex = lines.findIndex((line) => /^\s*K\s*:/i.test(line));
          const voiceLine = "V:1 transpose=-17";
          const outputLines = transformed.split(/\r\n|\n|\r/);
          outputLines.splice(keyIndex >= 0 ? keyIndex + 1 : 0, 0, voiceLine);
          transformed = outputLines.join("\n");
        }
        applyTransformedText(transformed);
        setStatus("OK");
        return;
      } catch (e) {
        logError(`Turkish notation macro failed.\n\n${(e && e.stack) ? e.stack : String(e)}`);
        await showTransformError("Turkish notation macro failed.");
        setStatus("Error");
        return;
      }
    }

    const settings = getSettings() || {};
    const autoAlign = Boolean(settings && settings.autoAlignBarsAfterTransforms);
    const hasOnlyLengthTransform = (options.doubleLengths || options.halfLengths)
      && options.transposeSemitones == null
      && !options.measuresPerLine
      && !options.linebreakMarker
      && !options.voice
      && options.renumberX == null;
    if (hasOnlyLengthTransform) {
      const mode = options.doubleLengths ? "double" : "half";
      let transformed = transformLengthScaling(abcText, mode);
      if (autoAlign) transformed = alignBarsInText(transformed);
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
      let transformed = transformMeasuresByLinebreakMarker(abcText);
      transformed = normalizeMeasuresLineBreaks(transformed);
      if (autoAlign) {
        transformed = alignBarsInText(transformed);
        transformed = normalizeMeasuresLineBreaks(transformed);
      }
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
          const aligned = autoAlign ? alignBarsInText(transformed) : transformed;
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
