import { composeHeaderPrefixPayload } from "../abc/header_prefix_model.js";

function createPrintCurrentFeature({
  api,
  getEditorText = () => "",
  getActiveFileEntry = () => null,
  getHeaderText = () => "",
  buildHeaderPrefix = (_header, _includeCheckbars, tuneText) => ({ text: "", offset: 0, tuneText }),
  renderAbcToSvgMarkup = async () => ({ ok: false, error: "Unable to render." }),
  buildSourceLinkMarkup = async () => "",
  applyPrintDebugMarkup = (markup) => markup,
  getSuggestedName = () => "untitled",
  setStatus = () => {},
  showToast = () => {},
  logError = () => {},
} = {}) {
  async function renderSvgMarkupForPrint() {
    const tuneText = getEditorText();
    if (!String(tuneText || "").trim()) return { ok: false, error: "No notation to print." };
    const entry = getActiveFileEntry();
    const headerText = entry ? getHeaderText() : "";
    const prefixPayload = buildHeaderPrefix(headerText, true, tuneText);
    const text = composeHeaderPrefixPayload(prefixPayload, tuneText);
    const res = await renderAbcToSvgMarkup(text, { pageFormat: true });
    if (res && res.ok && res.svg) {
      const sourceMarkup = await buildSourceLinkMarkup(tuneText);
      if (sourceMarkup) res.svg = `${res.svg.trim()}\n${sourceMarkup}`;
    }
    return res;
  }

  async function outputPrintMarkup(type, svgMarkup, suggestedName) {
    if (!api) return null;
    if (type === "preview" && typeof api.printPreview === "function") {
      return api.printPreview(svgMarkup, suggestedName);
    }
    if (type === "print" && typeof api.printDialog === "function") {
      return api.printDialog(svgMarkup, suggestedName);
    }
    if (type === "pdf" && typeof api.exportPdf === "function") {
      return api.exportPdf(svgMarkup, suggestedName);
    }
    return null;
  }

  async function runAction(type) {
    if (!api) return;
    setStatus("Rendering...");
    const renderRes = await renderSvgMarkupForPrint();
    if (!renderRes.ok) {
      setStatus("Error");
      logError(renderRes.error || "Unable to render.");
      return;
    }
    const svgMarkup = applyPrintDebugMarkup(renderRes.svg);
    const res = await outputPrintMarkup(type, svgMarkup, getSuggestedName());
    if (res && res.ok) {
      setStatus("OK");
      if (type === "pdf" && res.path) showToast(`Exported PDF: ${res.path}`);
    } else if (res && res.error) {
      setStatus("Error");
      logError(res.error);
    }
  }

  return {
    renderSvgMarkupForPrint,
    runAction,
  };
}

export {
  createPrintCurrentFeature,
};
