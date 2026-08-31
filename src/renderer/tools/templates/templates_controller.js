import {
  buildTemplatesFlatList,
  getTemplateSlice,
} from "./templates_model.js";
import { createTemplatesView } from "./templates_view.js";

function createTemplatesController({
  modal,
  search,
  list,
  folderLabel,
  previewTitle,
  previewScore,
  previewText,
  closeButton,
  cancelButton,
  manageButton,
  reloadButton,
  insertButton,
  replaceButton,
  appendButton,
  editButton,
  api,
  readFile,
  renderAbcToSvgMarkup,
  safeBasename,
  enableDraggableModal,
  onInsert,
  onReplace,
  onAppend,
  onPreviewContextMenu,
  logError,
  showToast,
} = {}) {
  let index = null;
  let items = [];
  let selectedKey = "";
  let previewRenderSeq = 0;

  const view = createTemplatesView({
    list,
    search,
    previewTitle,
    previewText,
    insertButton,
    replaceButton,
    appendButton,
    editButton,
    onSelect: (key) => {
      selectByKey(key).catch(() => {});
    },
    onDefaultAction: () => {
      runInsertAction("insert").catch((err) => reportError(err));
    },
  });

  function reportError(err) {
    try {
      if (typeof logError === "function") logError(err && err.message ? err.message : String(err));
    } catch {}
  }

  function getSelectionTextWithinElement(el) {
    const root = el && el.nodeType ? el : null;
    if (!root) return "";
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount < 1) return "";
    try {
      const range = sel.getRangeAt(0);
      const container = range && range.commonAncestorContainer ? range.commonAncestorContainer : null;
      if (!container) return "";
      if (root !== container && !root.contains(container)) return "";
      const text = sel.toString ? sel.toString() : "";
      return String(text || "");
    } catch {
      return "";
    }
  }

  function isOpen() {
    return Boolean(modal && modal.classList.contains("open"));
  }

  function close() {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    selectedKey = "";
    previewRenderSeq += 1;
    view.resetSelection();
  }

  async function renderNotationPreview(text, key) {
    if (!previewScore) return;
    const seq = (previewRenderSeq += 1);
    const source = String(text || "").trim();
    previewScore.textContent = "";
    if (!source || typeof renderAbcToSvgMarkup !== "function") return;

    previewScore.textContent = "Rendering notation preview...";
    let previewAbc = source;
    if (!/^[\t ]*X:/m.test(previewAbc)) {
      previewAbc = /^[\t ]*K:/m.test(previewAbc)
        ? `X:1\n${previewAbc}`
        : `X:1\nM:4/4\nL:1/8\nK:C\n${previewAbc}`;
    }
    previewAbc = `%%pagewidth 18cm\n%%scale 1.6\n%%leftmargin 0.4cm\n%%rightmargin 0.4cm\n%%topspace 0\n${previewAbc}\n`;

    try {
      const result = await renderAbcToSvgMarkup(previewAbc, {
        suppressGlobalErrors: true,
        stopOnFirstError: true,
      });
      if (seq !== previewRenderSeq || key !== selectedKey) return;
      if (!result || !result.ok || !result.svg) {
        previewScore.textContent = "Notation preview unavailable.";
        return;
      }
      previewScore.innerHTML = result.svg;
    } catch {
      if (seq !== previewRenderSeq || key !== selectedKey) return;
      previewScore.textContent = "Notation preview unavailable.";
    }
  }

  function renderList() {
    view.renderList(items, selectedKey);
  }

  function getSelectedItem() {
    const key = String(selectedKey || "");
    return items.find((item) => item && item.key === key) || null;
  }

  async function getTemplateText(filePath) {
    if (typeof readFile !== "function") return "";
    const res = await readFile(String(filePath || ""));
    return res && res.ok ? String(res.data || "") : "";
  }

  async function getSelectedText() {
    const item = getSelectedItem();
    if (!item) return "";
    const full = await getTemplateText(item.filePath);
    return getTemplateSlice(full, item);
  }

  async function selectByKey(key) {
    const wanted = String(key || "");
    const item = items.find((template) => template && template.key === wanted) || null;
    selectedKey = item ? item.key : "";
    view.syncSelectionControls(item);
    renderList();
    if (!item) {
      view.renderPreview(null, "");
      previewRenderSeq += 1;
      if (previewScore) previewScore.textContent = "";
      return;
    }
    const full = await getTemplateText(item.filePath);
    const slice = getTemplateSlice(full, item);
    view.renderPreview(item, slice);
    renderNotationPreview(slice, item.key).catch(() => {});
  }

  async function load() {
    index = null;
    items = [];
    selectedKey = "";

    if (!folderLabel) return;
    if (!api || typeof api.getTemplatesInfo !== "function" || typeof api.scanTemplates !== "function") {
      folderLabel.textContent = "Templates unavailable";
      folderLabel.title = "Missing templates APIs.";
      return;
    }

    const info = await api.getTemplatesInfo();
    const folder = info && info.ok ? String(info.folder || "") : "";
    folderLabel.textContent = folder
      ? (typeof safeBasename === "function" ? safeBasename(folder) : folder)
      : "(none)";
    folderLabel.title = folder || "";

    const scan = await api.scanTemplates();
    if (!scan || !scan.ok) {
      index = null;
      items = [];
      renderList();
      return;
    }
    index = { root: scan.root || "", files: scan.files || [] };
    items = buildTemplatesFlatList(index.files, { safeBasename });
    renderList();
  }

  async function open() {
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (search) search.value = "";
    view.resetSelection();
    await load();
    try { if (search) search.focus(); } catch {}
  }

  async function openTemplatesFolderPicker() {
    try {
      if (api && typeof api.pickTemplatesFolder === "function") {
        const res = await api.pickTemplatesFolder();
        if (res && res.ok && !res.canceled) await load();
      }
    } catch (err) {
      reportError(err);
    }
  }

  async function openSelectedTemplateFile() {
    try {
      const item = getSelectedItem();
      if (!item || !item.filePath) return;
      if (api && typeof api.openTemplatesFile === "function") {
        const res = await api.openTemplatesFile(String(item.filePath));
        if (!res || !res.ok) {
          const msg = res && res.error ? String(res.error) : "Unable to open template file.";
          try {
            if (typeof showToast === "function") showToast(msg, 3200);
          } catch {}
        }
      }
    } catch (err) {
      reportError(err);
    }
  }

  async function runInsertAction(mode = "insert") {
    const callback = mode === "replace" ? onReplace : (mode === "append" ? onAppend : onInsert);
    if (typeof callback !== "function") return false;
    return await callback({ mode, item: getSelectedItem() });
  }

  if (closeButton) closeButton.addEventListener("click", () => close());
  if (cancelButton) cancelButton.addEventListener("click", () => close());
  if (search) search.addEventListener("input", () => renderList());
  if (manageButton) manageButton.addEventListener("click", () => {
    openTemplatesFolderPicker().catch((err) => reportError(err));
  });
  if (reloadButton) reloadButton.addEventListener("click", () => {
    load().catch((err) => reportError(err));
  });
  if (editButton) editButton.addEventListener("click", () => {
    openSelectedTemplateFile().catch((err) => reportError(err));
  });
  if (insertButton) insertButton.addEventListener("click", () => {
    runInsertAction("insert").catch((err) => reportError(err));
  });
  if (replaceButton) replaceButton.addEventListener("click", () => {
    runInsertAction("replace").catch((err) => reportError(err));
  });
  if (appendButton) appendButton.addEventListener("click", () => {
    runInsertAction("append").catch((err) => reportError(err));
  });
  if (modal) {
    modal.addEventListener("keydown", (event) => {
      if (!event) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!insertButton || insertButton.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        runInsertAction("insert").catch((err) => reportError(err));
      }
    });
    if (typeof enableDraggableModal === "function") enableDraggableModal(modal);
  }
  if (previewText) {
    previewText.addEventListener("contextmenu", (event) => {
      try {
        event.preventDefault();
        event.stopPropagation();
        if (typeof onPreviewContextMenu !== "function") return;
        const fullText = String(previewText.textContent || "");
        const selectionText = getSelectionTextWithinElement(previewText);
        onPreviewContextMenu(event, { fullText, selectionText });
      } catch {}
    });
  }

  return {
    close,
    getSelectedItem,
    getSelectedText,
    isOpen,
    load,
    open,
    renderList,
    selectByKey,
  };
}

export {
  createTemplatesController,
};
