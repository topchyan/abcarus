const SET_LIST_ITEM_DRAG_MIME = "application/x-abcarus-set-list-item";
const LIBRARY_TUNE_DRAG_MIME = "application/x-abcarus-tune-id";

function getDropInsertionIndex(row, clientY, itemCount) {
  const count = Math.max(0, Number(itemCount) || 0);
  if (!row || !row.dataset) return { index: count, edge: "end" };
  const rowIndex = Number(row.dataset.index);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= count) {
    return { index: count, edge: "end" };
  }
  const rect = row.getBoundingClientRect();
  const after = Number(clientY) >= rect.top + (rect.height / 2);
  return { index: rowIndex + (after ? 1 : 0), edge: after ? "after" : "before" };
}

function getMoveTargetIndex(fromIndex, insertionIndex, itemCount) {
  const from = Number(fromIndex);
  const count = Number(itemCount);
  let insertion = Number(insertionIndex);
  if (!Number.isInteger(from) || !Number.isInteger(count) || count < 1 || from < 0 || from >= count) return null;
  if (!Number.isInteger(insertion)) insertion = count;
  insertion = Math.max(0, Math.min(count, insertion));
  if (from < insertion) insertion -= 1;
  return Math.max(0, Math.min(count - 1, insertion));
}

function getSetListDragKind(event, internalIndex = null) {
  const types = event && event.dataTransfer ? event.dataTransfer.types : null;
  let values = [];
  try { values = types ? Array.from(types) : []; } catch {}
  if (values.includes(LIBRARY_TUNE_DRAG_MIME)) return "library-tune";
  if (values.includes(SET_LIST_ITEM_DRAG_MIME)) return "set-list-item";
  return Number.isInteger(internalIndex) ? "set-list-item" : "";
}

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
  snapshotModal,
  snapshotCloseButton,
  snapshotTitle,
  snapshotPreview,
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
  onDuplicateItem,
  onPreviewSnapshot,
  onUpdateSnapshot,
  onAddTune,
  onActivateItem,
  onVisibilityChange,
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
      activeItemId: String(state.activeItemId || ""),
      resolutions: state.resolutions && typeof state.resolutions === "object" ? state.resolutions : {},
    };
  }

  function render() {
    if (!empty || !itemsList) return;
    const state = readState();
    const items = state.items;
    const hasItems = items.length > 0;
    empty.hidden = hasItems;
    itemsList.hidden = false;

    itemsList.textContent = "";
    if (hasItems) {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] || {};
        const row = document.createElement("div");
        row.className = "set-list-row";
        row.draggable = true;
        row.tabIndex = 0;
        row.dataset.index = String(i);
        const resolution = String(state.resolutions[item.id] || "");
        if (resolution) row.dataset.resolution = resolution;
        if (String(item.id || "") === state.activeItemId) row.classList.add("is-active");

        const idx = document.createElement("div");
        idx.className = "set-list-idx";
        idx.textContent = String(i + 1);

        const title = document.createElement("div");
        title.className = "set-list-title";
        title.textContent = String(item.title || "Untitled");

        const meta = document.createElement("div");
        meta.className = "set-list-meta";
        meta.textContent = item.composer ? String(item.composer) : "";

        row.append(idx, title, meta);
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
    if (typeof onVisibilityChange === "function") onVisibilityChange(true);
  }

  function close() {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (typeof onVisibilityChange === "function") onVisibilityChange(false);
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

  function openSnapshotPreview({ title = "Snapshot Preview", svg = "", error = "" } = {}) {
    if (!snapshotModal || !snapshotPreview) return;
    if (snapshotTitle) snapshotTitle.textContent = String(title || "Snapshot Preview");
    snapshotPreview.innerHTML = error
      ? `<div class="set-list-empty"></div>`
      : String(svg || "");
    if (error && snapshotPreview.firstElementChild) snapshotPreview.firstElementChild.textContent = String(error);
    snapshotModal.classList.add("open");
    snapshotModal.setAttribute("aria-hidden", "false");
  }

  function closeSnapshotPreview() {
    if (!snapshotModal) return;
    snapshotModal.classList.remove("open");
    snapshotModal.setAttribute("aria-hidden", "true");
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
    let contextMenu = null;
    const dropZone = itemsList.parentElement || itemsList;
    const clearDropIndicator = () => {
      itemsList.classList.remove("drop-at-end");
      for (const row of itemsList.querySelectorAll(".set-list-row.drop-before, .set-list-row.drop-after")) {
        row.classList.remove("drop-before", "drop-after");
      }
    };
    const isSupportedDrag = (event) => Boolean(getSetListDragKind(event, dragFromIndex));
    const findDropRow = (event) => {
      const direct = event && event.target && event.target.closest
        ? event.target.closest(".set-list-row")
        : null;
      if (direct && itemsList.contains(direct)) return direct;
      const clientY = Number(event && event.clientY);
      if (!Number.isFinite(clientY)) return null;
      return Array.from(itemsList.querySelectorAll(".set-list-row")).find((row) => {
        const rect = row.getBoundingClientRect();
        return clientY < rect.top + (rect.height / 2);
      }) || null;
    };
    const closeItemContextMenu = () => {
      if (contextMenu) contextMenu.remove();
      contextMenu = null;
    };
    const runItemAction = (action, index) => {
      if (action === "open" && typeof onActivateItem === "function") return onActivateItem(index);
      if (action === "preview" && typeof onPreviewSnapshot === "function") return onPreviewSnapshot(index);
      if (action === "update" && typeof onUpdateSnapshot === "function") return onUpdateSnapshot(index);
      if (action === "duplicate" && typeof onDuplicateItem === "function") return onDuplicateItem(index);
      if (action === "remove" && typeof onRemoveItem === "function") return onRemoveItem(index);
      if (action === "up" && typeof onMoveItem === "function") return onMoveItem(index, index - 1);
      if (action === "down" && typeof onMoveItem === "function") return onMoveItem(index, index + 1);
      return null;
    };

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
          e.dataTransfer.setData(SET_LIST_ITEM_DRAG_MIME, String(idx));
          e.dataTransfer.setData("text/plain", `set-list-item:${idx}`);
        }
      } catch {}
    });

    itemsList.addEventListener("dragend", () => {
      dragFromIndex = null;
      const rows = itemsList.querySelectorAll(".set-list-row.dragging");
      for (const row of rows) row.classList.remove("dragging");
      clearDropIndicator();
    });

    dropZone.addEventListener("dragover", (e) => {
      if (!e || !isSupportedDrag(e)) return;
      const row = findDropRow(e);
      e.preventDefault();
      const dragKind = getSetListDragKind(e, dragFromIndex);
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = dragKind === "library-tune" ? "copy" : "move"; } catch {}
      clearDropIndicator();
      const placement = getDropInsertionIndex(row, e.clientY, readState().items.length);
      if (!row || placement.edge === "end") itemsList.classList.add("drop-at-end");
      else row.classList.add(placement.edge === "after" ? "drop-after" : "drop-before");
    });

    dropZone.addEventListener("dragleave", (e) => {
      if (!e || (e.relatedTarget && dropZone.contains(e.relatedTarget))) return;
      clearDropIndicator();
    });

    dropZone.addEventListener("drop", (e) => {
      if (!e || !isSupportedDrag(e)) return;
      e.preventDefault();
      const row = findDropRow(e);
      const state = readState();
      const placement = getDropInsertionIndex(row, e.clientY, state.items.length);
      const dragKind = getSetListDragKind(e, dragFromIndex);
      clearDropIndicator();

      if (dragKind === "set-list-item") {
        let fromIdx = dragFromIndex;
        if (!Number.isFinite(fromIdx)) {
          let encodedIndex = "";
          try { encodedIndex = e.dataTransfer ? e.dataTransfer.getData(SET_LIST_ITEM_DRAG_MIME) : ""; } catch {}
          const parsed = Number(encodedIndex);
          if (Number.isFinite(parsed)) fromIdx = parsed;
        }
        dragFromIndex = null;
        const toIdx = getMoveTargetIndex(fromIdx, placement.index, state.items.length);
        if (!Number.isFinite(toIdx)) return;
        if (typeof onMoveItem === "function") onMoveItem(fromIdx, toIdx);
        render();
        return;
      }

      dragFromIndex = null;
      let tuneId = "";
      try { tuneId = e.dataTransfer ? e.dataTransfer.getData(LIBRARY_TUNE_DRAG_MIME) : ""; } catch {}
      if (!tuneId || typeof onAddTune !== "function") return;
      onAddTune(tuneId, { insertIndex: placement.index }).then(() => {
        if (typeof showToast === "function") showToast("Added to Set List.", 2000);
        render();
      }).catch((err) => {
        if (typeof showToast === "function") showToast(err && err.message ? err.message : String(err), 5000);
      });
    });

    itemsList.addEventListener("click", (e) => {
      const btn = e && e.target && e.target.closest ? e.target.closest(".set-list-btn") : null;
      if (!btn) {
        const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
        const index = row && row.dataset ? Number(row.dataset.index) : NaN;
        if (Number.isInteger(index) && typeof onActivateItem === "function") {
          onActivateItem(index).then(render).catch((err) => {
            if (typeof showToast === "function") showToast(err && err.message ? err.message : String(err), 5000);
          });
        }
        return;
      }
      if (btn.disabled) return;
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

    itemsList.addEventListener("keydown", (e) => {
      const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
      const index = row && row.dataset ? Number(row.dataset.index) : NaN;
      if (!Number.isInteger(index)) return;
      let action = "";
      if (e.key === "Enter") action = "open";
      else if (e.key === "Delete" || e.key === "Backspace") action = "remove";
      else if (e.altKey && e.key === "ArrowUp") action = "up";
      else if (e.altKey && e.key === "ArrowDown") action = "down";
      if (!action) return;
      e.preventDefault();
      Promise.resolve(runItemAction(action, index)).then(render).catch(() => {});
    });

    itemsList.addEventListener("contextmenu", (e) => {
      const row = e && e.target && e.target.closest ? e.target.closest(".set-list-row") : null;
      const index = row && row.dataset ? Number(row.dataset.index) : NaN;
      if (!Number.isInteger(index) || !modal) return;
      e.preventDefault();
      closeItemContextMenu();
      contextMenu = document.createElement("div");
      contextMenu.className = "set-list-item-menu";
      const actions = [
        ["open", "Open Source Tune"],
        ["preview", "Preview Snapshot"],
        ["update", "Update Snapshot from Source"],
        ["duplicate", "Duplicate Occurrence"],
        ["up", "Move Up"],
        ["down", "Move Down"],
        ["remove", "Remove from Set List"],
      ];
      for (const [action, label] of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = (action === "up" && index === 0)
          || (action === "down" && index === readState().items.length - 1);
        button.addEventListener("click", () => {
          closeItemContextMenu();
          Promise.resolve(runItemAction(action, index)).then(render).catch(() => {});
        });
        contextMenu.appendChild(button);
      }
      modal.appendChild(contextMenu);
      const panelRect = modal.getBoundingClientRect();
      contextMenu.style.left = `${Math.max(4, Math.min(e.clientX - panelRect.left, panelRect.width - 190))}px`;
      contextMenu.style.top = `${Math.max(4, Math.min(e.clientY - panelRect.top, panelRect.height - 180))}px`;
    });

    document.addEventListener("pointerdown", (e) => {
      if (contextMenu && !contextMenu.contains(e.target)) closeItemContextMenu();
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
  }

  if (headerCloseButton) headerCloseButton.addEventListener("click", closeHeaderEditor);
  if (snapshotCloseButton) snapshotCloseButton.addEventListener("click", closeSnapshotPreview);

  if (snapshotModal) {
    snapshotModal.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSnapshotPreview();
    });
  }

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
    openSnapshotPreview,
    render,
  };
}

export {
  createSetListController,
  getDropInsertionIndex,
  getMoveTargetIndex,
  getSetListDragKind,
};
