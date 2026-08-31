import { createTemplatesController } from "./templates_controller.js";

function createTemplatesFeature({
  elements = {},
  api,
  readFile,
  renderAbcToSvgMarkup,
  safeBasename,
  enableDraggableModal,
  getActiveFileEntry = () => null,
  isPayloadMode = () => false,
  ensureXNumberInAbc = (text) => text,
  ensureSafeToAbandonCurrentDoc = async () => true,
  insertTextAtEditorSelection = () => false,
  setEditorText = () => {},
  appendTuneTextToFile = async () => false,
  showContextMenuAt = () => {},
  showSaveError = async () => {},
  setStatus = () => {},
  showToast = () => {},
  logError = () => {},
} = {}) {
  const controller = createTemplatesController({
    modal: elements.modal,
    list: elements.list,
    search: elements.search,
    folderLabel: elements.folderLabel,
    previewTitle: elements.previewTitle,
    previewScore: elements.previewScore,
    previewText: elements.previewText,
    closeButton: elements.closeButton,
    cancelButton: elements.cancelButton,
    manageButton: elements.manageButton,
    reloadButton: elements.reloadButton,
    insertButton: elements.insertButton,
    replaceButton: elements.replaceButton,
    appendButton: elements.appendButton,
    editButton: elements.editButton,
    api,
    readFile,
    renderAbcToSvgMarkup,
    safeBasename,
    enableDraggableModal,
    logError,
    showToast,
    onInsert: () => insertSelectedTemplate("insert"),
    onReplace: () => insertSelectedTemplate("replace"),
    onAppend: () => insertSelectedTemplate("append"),
    onPreviewContextMenu: (event, { fullText, selectionText } = {}) => {
      showContextMenuAt(event.clientX, event.clientY, {
        type: "templatesPreview",
        fullText,
        selectionText,
      });
    },
  });

  function buildPreviewContextMenuItems(target) {
    const hasText = Boolean(target && typeof target.fullText === "string" && target.fullText.length);
    const hasSelection = Boolean(target && typeof target.selectionText === "string" && target.selectionText.length);
    return [
      { label: "Copy", action: "templatesCopy", disabled: !hasText },
      { label: "Select All", action: "templatesSelectAll", disabled: !hasText },
      { separator: true },
      { label: hasSelection ? "Selection will be copied" : "No selection (copies all)", action: "noop", disabled: true },
    ];
  }

  async function handleContextMenuAction(action, target) {
    if (!target || target.type !== "templatesPreview") return false;

    if (action === "templatesCopy") {
      const text = (target.selectionText && String(target.selectionText))
        ? String(target.selectionText)
        : String(target.fullText || "");
      try {
        const clipboard = globalThis.navigator && globalThis.navigator.clipboard;
        if (text && clipboard && typeof clipboard.writeText === "function") {
          await clipboard.writeText(text);
        }
        setStatus(text ? "Copied." : "Nothing to copy.");
      } catch (e) {
        logError(e && e.message ? e.message : String(e));
        setStatus("Copy failed.");
      }
      return true;
    }

    if (action === "templatesSelectAll") {
      try {
        const previewText = elements.previewText;
        const doc = previewText && previewText.ownerDocument ? previewText.ownerDocument : globalThis.document;
        const win = doc && doc.defaultView ? doc.defaultView : globalThis.window;
        if (previewText && doc && win) {
          const sel = win.getSelection ? win.getSelection() : null;
          const range = doc.createRange();
          range.selectNodeContents(previewText);
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      } catch {}
      return true;
    }

    return false;
  }

  async function getSelectedTemplateText() {
    const item = controller.getSelectedItem();
    if (!item) return "";
    let slice = await controller.getSelectedText();
    if (!slice.trim()) {
      await showSaveError("Template is empty.");
      return "";
    }
    return slice;
  }

  function hasTuneHeader(text) {
    return /^[\t ]*X:/m.test(String(text || ""));
  }

  function prepareTuneTemplate(text) {
    return hasTuneHeader(text) ? String(text || "") : ensureXNumberInAbc(text, "");
  }

  async function insertSelectedTemplate(modeOverride = "") {
    const entry = getActiveFileEntry();
    if (!entry || !entry.path) {
      showToast("Open/select a file first.", 2600);
      return false;
    }

    let slice = await getSelectedTemplateText();
    if (!slice) return false;

    const mode = String(modeOverride || "insert");
    if (mode === "insert") {
      if (hasTuneHeader(slice)) {
        const appended = await appendTuneTextToFile(entry.path, slice, { toastOk: "Template appended." });
        if (appended) controller.close();
        return Boolean(appended);
      }
      if (isPayloadMode()) {
        showToast("Exit Payload Mode to insert a template.", 2400);
        return false;
      }
      const ok = await ensureSafeToAbandonCurrentDoc("inserting a template");
      if (!ok) return false;
      if (!/[\r\n]$/.test(slice)) slice = `${slice}\n`;
      const inserted = insertTextAtEditorSelection(slice);
      if (!inserted) return false;
      showToast("Template inserted.", 1800);
      controller.close();
      return true;
    }

    if (mode === "replace") {
      if (isPayloadMode()) {
        showToast("Exit Payload Mode to replace a tune.", 2400);
        return false;
      }
      setEditorText(prepareTuneTemplate(slice).trimEnd());
      showToast("Template replaced current tune.", 2200);
      controller.close();
      return true;
    }

    slice = prepareTuneTemplate(slice);
    const appended = await appendTuneTextToFile(entry.path, slice, { toastOk: "Template appended." });
    if (appended) controller.close();
    return Boolean(appended);
  }

  return {
    buildPreviewContextMenuItems,
    close: () => controller.close(),
    handleContextMenuAction,
    insertSelectedTemplate,
    isOpen: () => controller.isOpen(),
    open: () => controller.open(),
  };
}

export {
  createTemplatesFeature,
};
