import {
  normalizeSourceUrl,
} from "../../source_link.js";
import {
  buildPrintSourceLinkMarkup as buildPrintSourceLinkMarkupCore,
} from "../../print/source_link_markup.js";
import { createQrDataUrl } from "../../print/qr_code.js";
import { createSourceLinkController } from "./source_link_controller.js";
import { createYouTubeMetadataAction } from "./youtube_metadata_action.js";

function createSourceLinkFeature({
  panel = null,
  documentRef = null,
  api,
  parseAbcHeaderFields,
  getEditorText = () => "",
  hasEditor = () => false,
  isDisabled = () => false,
  shouldIncludePrintQr = () => false,
  showToast = () => {},
  fileState = {},
  fileActions = {},
} = {}) {
  const doc = documentRef || (typeof document !== "undefined" ? document : null);
  const resolvedPanel = panel || (doc && typeof doc.getElementById === "function" ? doc.getElementById("sourceLinkPanel") : null);

  async function openExternalUrl(url) {
    const target = normalizeSourceUrl(url);
    if (!target || !api || typeof api.openExternal !== "function") return;
    try {
      const res = await api.openExternal(target);
      if (!res || res.ok === false) {
        showToast((res && res.error) ? String(res.error) : "Unable to open link.", 2600);
      }
    } catch (e) {
      showToast(e && e.message ? e.message : "Unable to open link.", 2600);
    }
  }

  async function previewYouTubeSource(url) {
    if (!api || typeof api.previewYouTubeSource !== "function") {
      await openExternalUrl(url);
      return { ok: true };
    }
    return await api.previewYouTubeSource(url);
  }

  const controller = createSourceLinkController({
    panel: resolvedPanel,
    parseAbcHeaderFields,
    openExternalUrl,
    previewYouTubeSource,
    showToast,
    getEditorText,
    hasEditor,
    isDisabled,
  });
  const youtubeMetadataAction = createYouTubeMetadataAction({ api, state: fileState, actions: fileActions });

  async function buildPrintMarkup(abcText) {
    return buildPrintSourceLinkMarkupCore(abcText, {
      includeQr: Boolean(shouldIncludePrintQr()),
      createQrDataUrl,
    });
  }

  return {
    buildPrintMarkup,
    createQrDataUrl,
    clear: () => controller.clear(),
    scheduleUpdate: (delayMs = 250) => controller.scheduleUpdate(delayMs),
    update: () => controller.update(),
    updateYouTubeMetadata: () => youtubeMetadataAction.updateActiveFile(),
  };
}

export {
  createSourceLinkFeature,
};
