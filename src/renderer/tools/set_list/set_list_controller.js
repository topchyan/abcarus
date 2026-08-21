function createSetListController({
  modal,
  closeButton,
  titleInput,
  newButton,
  openButton,
  saveButton,
  saveAsButton,
  addCurrentButton,
  empty,
  itemsList,
  headerButton,
  clearButton,
  saveAbcButton,
  exportPdfButton,
  printButton,
  pageBreaksSelect,
  compactCheckbox,
  headerModal,
  headerCloseButton,
  headerText,
  headerResetButton,
  headerSaveButton,
  targetModal,
  targetCloseButton,
  targetSelect,
  targetNewButton,
  targetCancelButton,
  targetAddButton,
  defaultHeaderText = "",
  getState,
  getHeaderText,
  onMoveItem,
  onRemoveItem,
  onAddTune,
  onClear,
  onPageBreaksChange,
  onCompactChange,
  onHeaderTextChange,
  onTitleChange,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onAddCurrent,
  onSaveAbc,
  onExportPdf,
  onPrint,
  confirm,
  showToast,
  enableDraggable,
} = {}) {
  let dragFromIndex = null;
  let targetChoiceResolve = null;

  function closeDocumentMenus(except = null) {
    if (!modal || typeof modal.querySelectorAll !== "function") return false;
    let closed = false;
    for (const menu of modal.querySelectorAll(".set-list-menu[open]")) {
      if (menu === except) continue;
      menu.removeAttribute("open");
      closed = true;
    }
    return closed;
  }

  function readState() {
    const state = typeof getState === "function" ? getState() : {};
    return {
      items: Array.isArray(state.items) ? state.items : [],
      pageBreaks: state.pageBreaks || "perTune",
      compact: Boolean(state.compact),
      title: String(state.title || "Untitled Set List"),
      dirty: Boolean(state.dirty),
      notice: String(state.notice || ""),
      canAddCurrentTune: Boolean(state.canAddCurrentTune),
    };
  }

  function render() {
    if (!empty || !itemsList) return;
    const state = readState();
    const items = state.items;
    const hasItems = items.length > 0;
    empty.hidden = hasItems;
    itemsList.hidden = !hasItems;

    itemsList.textContent = "";
    if (hasItems) {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] || {};
        const row = document.createElement("div");
        row.className = "set-list-row";
        row.draggable = true;
        row.dataset.index = String(i);

        const idx = document.createElement("div");
        idx.className = "set-list-idx";
        idx.textContent = String(i + 1);

        const title = document.createElement("div");
        title.className = "set-list-title";
        title.textContent = String(item.title || "Untitled");

        const meta = document.createElement("div");
        meta.className = "set-list-meta";
        meta.textContent = item.composer ? String(item.composer) : "";

        const actions = document.createElement("div");
        actions.className = "set-list-actions";
        const upDisabled = i === 0;
        const downDisabled = i === items.length - 1;
        actions.innerHTML = `
          <button type="button" class="set-list-btn" data-action="up" data-index="${i}" aria-label="Move up" ${upDisabled ? "disabled" : ""}>&uarr;</button>
          <button type="button" class="set-list-btn" data-action="down" data-index="${i}" aria-label="Move down" ${downDisabled ? "disabled" : ""}>&darr;</button>
          <button type="button" class="set-list-btn" data-action="remove" data-index="${i}" aria-label="Remove">&times;</button>
        `;

        row.append(idx, title, meta, actions);
        itemsList.append(row);
      }
    }

    if (pageBreaksSelect) pageBreaksSelect.value = state.pageBreaks;
    if (compactCheckbox) compactCheckbox.checked = state.compact;
    if (titleInput && document.activeElement !== titleInput) {
      titleInput.value = `${state.title}${state.dirty ? " *" : ""}`;
      titleInput.title = state.notice;
    }
    if (saveButton) saveButton.disabled = !state.dirty;
    if (addCurrentButton) addCurrentButton.disabled = !state.canAddCurrentTune;

    const disableActions = !hasItems;
    if (clearButton) clearButton.disabled = disableActions;
    if (saveAbcButton) saveAbcButton.disabled = disableActions;
    if (exportPdfButton) exportPdfButton.disabled = disableActions;
    if (printButton) printButton.disabled = disableActions;
  }

  function open() {
    if (!modal) return;
    render();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (pageBreaksSelect) pageBreaksSelect.focus();
  }

  function close() {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function openHeaderEditor() {
    if (!headerModal || !headerText) return;
    headerText.value = typeof getHeaderText === "function" ? String(getHeaderText() || "") : "";
    headerModal.classList.add("open");
    headerModal.setAttribute("aria-hidden", "false");
    headerText.focus();
  }

  function closeHeaderEditor() {
    if (!headerModal) return;
    headerModal.classList.remove("open");
    headerModal.setAttribute("aria-hidden", "true");
  }

  if (closeButton) closeButton.addEventListener("click", close);
  if (headerButton) headerButton.addEventListener("click", openHeaderEditor);
  if (newButton) newButton.addEventListener("click", () => { if (typeof onNew === "function") onNew(); });
  if (openButton) openButton.addEventListener("click", () => { if (typeof onOpen === "function") onOpen(); });
  if (saveButton) saveButton.addEventListener("click", () => { if (typeof onSave === "function") onSave(); });
  if (saveAsButton) saveAsButton.addEventListener("click", () => { if (typeof onSaveAs === "function") onSaveAs(); });
  if (addCurrentButton) addCurrentButton.addEventListener("click", () => {
    if (typeof onAddCurrent === "function") onAddCurrent();
  });
  if (titleInput) {
    titleInput.addEventListener("focus", () => {
      titleInput.value = titleInput.value.replace(/\s+\*$/, "");
      titleInput.select();
    });
    titleInput.addEventListener("change", () => {
      const nextTitle = titleInput.value.replace(/\s+\*$/, "");
      if (nextTitle !== readState().title && typeof onTitleChange === "function") onTitleChange(nextTitle);
      render();
    });
  }

  function closeTargetChoice(value = null) {
    if (targetModal) {
      targetModal.classList.remove("open");
      targetModal.setAttribute("aria-hidden", "true");
    }
    const resolve = targetChoiceResolve;
    targetChoiceResolve = null;
    if (resolve) resolve(value);
  }

  function chooseTarget(targets = []) {
    if (!targetModal || !targetSelect) return Promise.resolve(null);
    if (targetChoiceResolve) closeTargetChoice(null);
    targetSelect.textContent = "";
    for (const target of targets) {
      const option = document.createElement("option");
      option.value = String(target && target.value || "");
      option.textContent = String(target && target.label || target && target.value || "Set List");
      targetSelect.appendChild(option);
    }
    targetModal.classList.add("open");
    targetModal.setAttribute("aria-hidden", "false");
    targetSelect.focus();
    return new Promise((resolve) => { targetChoiceResolve = resolve; });
  }

  if (targetCloseButton) targetCloseButton.addEventListener("click", () => closeTargetChoice(null));
  if (targetCancelButton) targetCancelButton.addEventListener("click", () => closeTargetChoice(null));
  if (targetAddButton) targetAddButton.addEventListener("click", () => closeTargetChoice(targetSelect ? targetSelect.value : null));
  if (targetNewButton) targetNewButton.addEventListener("click", () => closeTargetChoice("__new__"));
  if (targetModal) {
    targetModal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTargetChoice(null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        closeTargetChoice(targetSelect ? targetSelect.value : null);
      }
    });
    if (typeof enableDraggable === "function") enableDraggable(targetModal);
  }

  if (itemsList) {
    itemsList.addEventListener("dragstart", (e) => {
      const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
      if (!row) return;
      const idx = row.dataset ? Number(row.dataset.index) : NaN;
      if (!Number.isFinite(idx)) return;
      dragFromIndex = idx;
      row.classList.add("dragging");
      try {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(idx));
        }
      } catch {}
    });

    itemsList.addEventListener("dragend", () => {
      dragFromIndex = null;
      const rows = itemsList.querySelectorAll(".set-list-row.dragging");
      for (const row of rows) row.classList.remove("dragging");
      const over = itemsList.querySelectorAll(".set-list-row.drag-over");
      for (const row of over) row.classList.remove("drag-over");
    });

    itemsList.addEventListener("dragover", (e) => {
      if (!e) return;
      const row = e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
      e.preventDefault();
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = "move"; } catch {}
      if (!row) return;
    });

    itemsList.addEventListener("dragenter", (e) => {
      const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
      if (!row) return;
      row.classList.add("drag-over");
    });

    itemsList.addEventListener("dragleave", (e) => {
      const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
      if (!row) return;
      row.classList.remove("drag-over");
    });

    itemsList.addEventListener("drop", (e) => {
      if (!e) return;
      e.preventDefault();
      const row = e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
      const state = readState();
      const toIdx = row && row.dataset ? Number(row.dataset.index) : state.items.length;
      let raw = "";
      try { raw = e.dataTransfer ? e.dataTransfer.getData("text/plain") : ""; } catch {}

      let fromIdx = dragFromIndex;
      if (!Number.isFinite(fromIdx)) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) fromIdx = parsed;
      }

      if (Number.isFinite(fromIdx)) {
        if (!Number.isFinite(toIdx)) return;
        if (typeof onMoveItem === "function") onMoveItem(fromIdx, toIdx);
        render();
        return;
      }

      const tuneId = String(raw || "").trim();
      if (!tuneId || typeof onAddTune !== "function") return;
      onAddTune(tuneId, { insertIndex: toIdx }).then(() => {
        if (typeof showToast === "function") showToast("Added to Set List.", 2000);
        render();
      }).catch((err) => {
        if (typeof showToast === "function") showToast(err && err.message ? err.message : String(err), 5000);
      });
    });

    itemsList.addEventListener("click", (e) => {
      const btn = e && e.target && e.target.closest ? e.target.closest(".set-list-btn") : null;
      if (!btn || btn.disabled) return;
      const action = btn.dataset ? btn.dataset.action : "";
      const index = btn.dataset ? btn.dataset.index : "";
      if (action === "remove") {
        if (typeof onRemoveItem === "function") onRemoveItem(index);
        render();
        return;
      }
      if (action === "up") {
        if (typeof onMoveItem === "function") onMoveItem(index, Number(index) - 1);
        render();
        return;
      }
      if (action === "down") {
        if (typeof onMoveItem === "function") onMoveItem(index, Number(index) + 1);
        render();
      }
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      const target = e && e.target;
      const menu = target && target.closest ? target.closest(".set-list-menu") : null;
      const summary = target && target.closest ? target.closest(".set-list-menu > summary") : null;
      if (summary && menu) {
        closeDocumentMenus(menu);
        return;
      }
      if (!menu || (target && target.closest && target.closest("button[role='menuitem']"))) {
        closeDocumentMenus();
      }
    });
    modal.addEventListener("keydown", (e) => {
      if (!e || e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (closeDocumentMenus()) return;
      close();
    });
    if (typeof enableDraggable === "function") enableDraggable(modal);
  }

  if (headerCloseButton) headerCloseButton.addEventListener("click", closeHeaderEditor);

  if (headerModal) {
    headerModal.addEventListener("keydown", (e) => {
      if (!e || e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeHeaderEditor();
    });
    if (typeof enableDraggable === "function") enableDraggable(headerModal);
  }

  if (headerResetButton) {
    headerResetButton.addEventListener("click", () => {
      if (!headerText) return;
      headerText.value = String(defaultHeaderText || "");
      headerText.focus();
    });
  }

  if (headerSaveButton) {
    headerSaveButton.addEventListener("click", () => {
      if (!headerText) return;
      if (typeof onHeaderTextChange === "function") onHeaderTextChange(String(headerText.value || ""));
      closeHeaderEditor();
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      const state = readState();
      if (state.items.length) {
        const ok = typeof confirm === "function"
          ? confirm("Clear Set List? This cannot be undone.")
          : true;
        if (!ok) return;
      }
      if (typeof onClear === "function") onClear();
      render();
    });
  }

  if (pageBreaksSelect) {
    pageBreaksSelect.addEventListener("change", () => {
      if (typeof onPageBreaksChange === "function") onPageBreaksChange(String(pageBreaksSelect.value || "perTune"));
      render();
    });
  }

  if (compactCheckbox) {
    compactCheckbox.addEventListener("change", () => {
      if (typeof onCompactChange === "function") onCompactChange(Boolean(compactCheckbox.checked));
      render();
    });
  }

  if (saveAbcButton) {
    saveAbcButton.addEventListener("click", () => {
      const state = readState();
      if (!state.items.length || typeof onSaveAbc !== "function") return;
      onSaveAbc();
    });
  }

  if (exportPdfButton) {
    exportPdfButton.addEventListener("click", () => {
      const state = readState();
      if (!state.items.length || typeof onExportPdf !== "function") return;
      onExportPdf();
    });
  }

  if (printButton) {
    printButton.addEventListener("click", () => {
      const state = readState();
      if (!state.items.length || typeof onPrint !== "function") return;
      onPrint();
    });
  }

  return {
    close,
    closeHeaderEditor,
    chooseTarget,
    open,
    openHeaderEditor,
    render,
  };
}

export {
  createSetListController,
};
