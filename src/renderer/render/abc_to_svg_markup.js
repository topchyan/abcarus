import { callAbc2svgSafely } from "../security/abc_security.js";

function createAbcToSvgMarkupRenderer({
  windowRef = typeof window !== "undefined" ? window : null,
  ensureAbc2svgLoader = () => {},
  ensureAbc2svgModulesReady = async () => true,
  getAbcCtor = () => null,
  normalizeHeaderText = (text) => String(text || ""),
  stripSepForRender = (text) => ({ text: String(text || ""), replaced: false }),
  detectKeyFieldNotLastBeforeBody = () => null,
  isErrorsEnabled = () => false,
  isTuneErrorScanInFlight = () => false,
  shouldSuppressUserVisibleAbcError = () => false,
  logError = () => {},
} = {}) {
  async function renderAbcToSvgMarkup(abcText, options = {}) {
    const errors = [];
    const context = options && options.errorContext ? options.errorContext : null;
    const stopOnFirstError = Boolean(options && options.stopOnFirstError);
    const noSvg = Boolean(options && options.noSvg);
    const pageFormat = Boolean(options && options.pageFormat);
    try {
      ensureAbc2svgLoader();
      const normalized = normalizeHeaderText(abcText);
      const baseText = normalized;

      const sepStripInitial = stripSepForRender(baseText);
      let renderText = sepStripInitial.replaced ? sepStripInitial.text : baseText;
      let sepFallbackUsed = sepStripInitial.replaced;
      let attempts = 0;
      while (attempts < 2) {
        attempts += 1;
        try {
          const ready = await ensureAbc2svgModulesReady(renderText);
          if (!ready) return { ok: false, error: "ABC modules failed to load." };
          const svgParts = [];
          if (isErrorsEnabled() && isTuneErrorScanInFlight()) {
            const keyWarn = detectKeyFieldNotLastBeforeBody(renderText);
            if (keyWarn && keyWarn.detail) {
              const msg = `Warning: ${keyWarn.detail}`;
              errors.push({ message: msg, loc: keyWarn.loc || null });
              if (!options || !options.suppressGlobalErrors) {
                logError(msg, keyWarn.loc || null, { ...(context || {}), skipMeasureRange: true });
              }
            }
          }
          const user = {
            page_format: pageFormat,
            img_out: (s) => {
              if (!noSvg) svgParts.push(s);
            },
            err: (msg) => {
              if (shouldSuppressUserVisibleAbcError(msg)) return;
              const entry = { message: String(msg) };
              errors.push(entry);
              if (!options || !options.suppressGlobalErrors) logError(msg, null, context);
              if (stopOnFirstError) throw new Error(entry.message);
            },
            errmsg: (msg, line, col) => {
              if (shouldSuppressUserVisibleAbcError(msg)) return;
              const loc = Number.isFinite(line) && Number.isFinite(col)
                ? { line: line + 1, col: col + 1 }
                : null;
              const entry = { message: String(msg), loc };
              errors.push(entry);
              if (!options || !options.suppressGlobalErrors) logError(msg, loc, context);
              if (stopOnFirstError) throw new Error(entry.message);
            },
          };
          const AbcCtor = getAbcCtor();
          if (!AbcCtor) return { ok: false, error: "abc2svg constructor not found." };
          const abc = new AbcCtor(user);
          callAbc2svgSafely(abc, "out", renderText);
          if (windowRef && windowRef.abc2svg && typeof windowRef.abc2svg.abc_end === "function") {
            windowRef.abc2svg.abc_end();
          }
          const svg = svgParts.join("");
          if (noSvg) return { ok: true, svg: "", errors };
          if (!svg.trim()) return { ok: false, error: "No SVG output produced.", svg, errors };
          return { ok: true, svg, errors, sepFallbackUsed };
        } catch (e) {
          if (!sepFallbackUsed) {
            const sepStrip = stripSepForRender(baseText);
            if (sepStrip.replaced) {
              renderText = sepStrip.text;
              sepFallbackUsed = true;
              continue;
            }
          }
          throw e;
        }
      }
      return { ok: false, error: "No SVG output produced.", errors, sepFallbackUsed };
    } catch (e) {
      const message = (e && e.message) ? e.message : String(e);
      if (stopOnFirstError) return { ok: false, error: message, errors };
      return { ok: false, error: message };
    }
  }

  return {
    renderAbcToSvgMarkup,
  };
}

export {
  createAbcToSvgMarkupRenderer,
};
