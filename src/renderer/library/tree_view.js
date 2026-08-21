const LIBRARY_TUNE_DRAG_MIME = "application/x-abcarus-tune-id";
const LIBRARY_CATEGORY_DRAG_MIME = "application/x-abcarus-library-category";

function createLibraryTreeView({
  documentRef = typeof document !== "undefined" ? document : null,
  windowRef = typeof window !== "undefined" ? window : null,
  treeElement = null,
  collapsedFiles = new Set(),
  collapsedGroups = new Set(),
  getVisibleLibraryFiles = () => [],
  getLibraryTextFilter = () => "",
  applyLibraryTextFilter = (files) => files,
  sortLibraryFiles = (files) => files,
  buildGroupEntries = () => [],
  sortGroupEntries = (entries) => entries,
  sortTunes = (tunes) => tunes,
  getEntryTuneCount = () => 0,
  getRenamingFilePath = () => "",
  setRenamingFilePath = () => {},
  getActiveFilePath = () => "",
  setActiveFilePath = () => {},
  getActiveEditorFilePath = () => "",
  getActiveTuneId = () => "",
  getActiveTuneUid = () => "",
  isPayloadMode = () => false,
  isRawMode = () => false,
  pathsEqual = (a, b) => String(a || "") === String(b || ""),
  commitRenameFile = async () => {},
  requestLoadLibraryFile = async () => {},
  moveTuneToFile = async () => {},
  mergeCatalogCategory = () => false,
  showContextMenuAt = () => {},
  scheduleSaveLibraryUiState = () => {},
  updateFileHeaderPanel = () => {},
  showHoverStatus = () => {},
  restoreHoverStatus = () => {},
  pinHoverStatus = () => {},
  openTuneFromLibrarySelection = async () => ({ ok: false }),
  showToast = () => {},
} = {}) {
  let renderScheduled = false;
  let pendingRenderFiles = null;
  let dragTuneId = "";
  let dragCategory = null;

  function schedule(files = null) {
    pendingRenderFiles = files;
    if (renderScheduled) return;
    renderScheduled = true;
    const raf = windowRef && typeof windowRef.requestAnimationFrame === "function"
      ? windowRef.requestAnimationFrame.bind(windowRef)
      : (fn) => setTimeout(fn, 0);
    raf(() => {
      renderScheduled = false;
      const nextFiles = pendingRenderFiles;
      pendingRenderFiles = null;
      render(nextFiles);
    });
  }

  function getDragTuneId(ev) {
    const dt = ev && ev.dataTransfer ? ev.dataTransfer : null;
    if (dt) {
      try {
        const customId = dt.getData(LIBRARY_TUNE_DRAG_MIME);
        if (customId) return customId;
      } catch {}
      try {
        const plainId = dt.getData("text/plain");
        if (plainId) return plainId;
      } catch {}
    }
    return dragTuneId || "";
  }

  function isTuneDrag(ev) {
    if (dragTuneId) return true;
    const types = ev && ev.dataTransfer ? ev.dataTransfer.types : null;
    if (!types) return false;
    try {
      return Array.from(types).includes(LIBRARY_TUNE_DRAG_MIME);
    } catch {
      return false;
    }
  }

  function getDragCategory(ev) {
    const dt = ev && ev.dataTransfer ? ev.dataTransfer : null;
    if (dt) {
      try {
        const encoded = dt.getData(LIBRARY_CATEGORY_DRAG_MIME);
        if (encoded) return JSON.parse(encoded);
      } catch {}
    }
    return dragCategory;
  }

  function isCategoryDrag(ev) {
    if (dragCategory) return true;
    const types = ev && ev.dataTransfer ? ev.dataTransfer.types : null;
    try { return Boolean(types && Array.from(types).includes(LIBRARY_CATEGORY_DRAG_MIME)); } catch { return false; }
  }

  function render(files = null) {
    if (!treeElement || !documentRef) return;
    treeElement.style.display = "";
    treeElement.textContent = "";
    const fragment = documentRef.createDocumentFragment();
    const sourceFiles = files || getVisibleLibraryFiles();
    const libraryTextFilter = getLibraryTextFilter();
    const filteredFiles = libraryTextFilter
      ? applyLibraryTextFilter(sourceFiles, libraryTextFilter)
      : sourceFiles;
    const renamingFilePath = getRenamingFilePath();
    const hasRenameTarget = renamingFilePath
      && filteredFiles
        .some((file) => pathsEqual(file.path, renamingFilePath));
    if (renamingFilePath && !hasRenameTarget) setRenamingFilePath(null);
    const sortedFiles = sortLibraryFiles(filteredFiles);
    const entries = sortGroupEntries(buildGroupEntries(sortedFiles));
    for (const entry of entries) {
      const fileNode = documentRef.createElement("div");
      fileNode.className = "tree-file";
      if (entry.isFile && pathsEqual(getActiveFilePath(), entry.id)) fileNode.classList.add("active");
      if (entry.isFile && entry.xIssues && entry.xIssues.ok === false) {
        fileNode.classList.add("x-issues");
        const parts = [];
        if (entry.xIssues.invalid) parts.push(`invalid X: ${entry.xIssues.invalid}`);
        if (entry.xIssues.missing) parts.push(`missing X: ${entry.xIssues.missing}`);
        if (entry.xIssues.duplicates) parts.push("duplicate X");
        if (parts.length) fileNode.title = `Index issue (${parts.join(", ")})`;
      }
      const isCollapsed = entry.isFile
        ? collapsedFiles.has(entry.id)
        : collapsedGroups.has(entry.id);
      if (isCollapsed) fileNode.classList.add("collapsed");

      if (entry.isFile && entry.id === getRenamingFilePath()) {
        const input = documentRef.createElement("input");
        input.type = "text";
        input.className = "tree-label tree-rename";
        input.disabled = isPayloadMode();
        input.value = entry.label || "";
        input.dataset.filePath = entry.id;
        input.addEventListener("keydown", async (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            await commitRenameFile(entry.id, input.value);
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            setRenamingFilePath(null);
            render(sourceFiles);
          }
        });
        input.addEventListener("blur", async () => {
          await commitRenameFile(entry.id, input.value);
        });
        fileNode.appendChild(input);
      } else {
        const fileLabel = documentRef.createElement("button");
        fileLabel.type = "button";
        fileLabel.className = "tree-label tree-file-label";
        fileLabel.disabled = isPayloadMode();
        fileLabel.draggable = Boolean(!entry.isFile && entry.categoryType);
        fileLabel.dataset.filePath = entry.id;
        const labelText = documentRef.createElement("span");
        labelText.className = "tree-label-text";
        labelText.textContent = entry.label;
        labelText.title = entry.label;
        const count = documentRef.createElement("span");
        count.className = "tree-count";
        count.textContent = String(getEntryTuneCount(entry) || 0);
        fileLabel.append(labelText, count);
        fileLabel.addEventListener("click", (ev) => {
          if (entry.isFile && ev && ev.detail && ev.detail > 1) return;
          showHoverStatus(entry.label);
          if (entry.isFile) {
            const editorFilePath = getActiveEditorFilePath();
            if (!editorFilePath) setActiveFilePath(entry.id);
            if (collapsedFiles.has(entry.id)) collapsedFiles.delete(entry.id);
            else collapsedFiles.add(entry.id);
          } else {
            if (collapsedGroups.has(entry.id)) collapsedGroups.delete(entry.id);
            else collapsedGroups.add(entry.id);
          }
          schedule(sourceFiles);
          scheduleSaveLibraryUiState();
        });
        fileLabel.addEventListener("dblclick", (ev) => {
          if (!entry.isFile) return;
          ev.preventDefault();
          ev.stopPropagation();
          requestLoadLibraryFile(entry.id).catch(() => {});
        });
        fileLabel.addEventListener("mouseenter", () => showHoverStatus(entry.label));
        fileLabel.addEventListener("mouseleave", () => restoreHoverStatus());
        fileLabel.addEventListener("focus", () => showHoverStatus(entry.label));
        fileLabel.addEventListener("blur", () => restoreHoverStatus());
        fileLabel.addEventListener("contextmenu", (ev) => {
          if (!entry.isFile && !entry.categoryType) return;
          ev.preventDefault();
          showContextMenuAt(ev.clientX, ev.clientY, entry.isFile
            ? { type: "file", filePath: entry.id }
            : { type: "category", categoryType: entry.categoryType, facet: entry.facet, field: entry.field, value: entry.value, count: getEntryTuneCount(entry) });
        });
        fileLabel.addEventListener("dragstart", (ev) => {
          if (entry.isFile || !entry.categoryType || !ev.dataTransfer) return;
          dragCategory = {
            categoryType: entry.categoryType,
            facet: entry.facet,
            field: entry.field,
            value: entry.value,
            count: getEntryTuneCount(entry),
          };
          ev.dataTransfer.setData(LIBRARY_CATEGORY_DRAG_MIME, JSON.stringify(dragCategory));
          ev.dataTransfer.effectAllowed = "move";
        });
        fileLabel.addEventListener("dragend", () => { dragCategory = null; });
        fileLabel.addEventListener("dragover", (ev) => {
          const categorySource = !entry.isFile && entry.categoryType && isCategoryDrag(ev) ? getDragCategory(ev) : null;
          const acceptsCategory = Boolean(categorySource && categorySource.categoryType === entry.categoryType && categorySource.value !== entry.value);
          const acceptsTune = Boolean(entry.isFile && isTuneDrag(ev));
          if (!acceptsCategory && !acceptsTune) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
          fileLabel.classList.add("drop-target");
        });
        fileLabel.addEventListener("dragleave", () => {
          fileLabel.classList.remove("drop-target");
        });
        fileLabel.addEventListener("drop", async (ev) => {
          if (!entry.isFile && entry.categoryType) {
            const source = getDragCategory(ev);
            if (!source || source.categoryType !== entry.categoryType || source.value === entry.value) return;
            ev.preventDefault();
            ev.stopPropagation();
            fileLabel.classList.remove("drop-target");
            dragCategory = null;
            mergeCatalogCategory(source, {
              categoryType: entry.categoryType,
              facet: entry.facet,
              field: entry.field,
              value: entry.value,
              count: getEntryTuneCount(entry),
            });
            return;
          }
          if (!entry.isFile) return;
          ev.preventDefault();
          ev.stopPropagation();
          fileLabel.classList.remove("drop-target");
          const tuneId = getDragTuneId(ev);
          dragTuneId = "";
          if (!tuneId) return;
          await moveTuneToFile(tuneId, entry.id);
        });
        fileNode.appendChild(fileLabel);
      }

      const children = documentRef.createElement("div");
      children.className = "tree-children";

      const sortedEntryTunes = sortTunes(entry.tunes);
      for (const tune of sortedEntryTunes) {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "tree-label tune-label";
        button.draggable = true;
        button.disabled = isPayloadMode();
        const labelNumber = tune.xNumber || String(tune.indexInFile);
        const title = tune.title || tune.preview || "";
        const composer = tune.composer ? ` - ${tune.composer}` : "";
        const key = tune.key ? ` - ${tune.key}` : "";
        const tuneLabel = `${labelNumber}: ${title}${composer}${key}`.trim();
        button.textContent = tuneLabel;
        button.title = tuneLabel;
        button.dataset.tuneId = tune.id;
        if (tune.tuneUid) button.dataset.tuneUid = tune.tuneUid;
        const activeTuneUid = getActiveTuneUid();
        const activeTuneId = getActiveTuneId();
        const isActiveByUid = Boolean(activeTuneUid && tune.tuneUid && tune.tuneUid === activeTuneUid);
        const isActiveById = Boolean(activeTuneId && tune.id && tune.id === activeTuneId);
        if (isActiveByUid || isActiveById) button.classList.add("active");
        button.addEventListener("mouseenter", () => showHoverStatus(tuneLabel));
        button.addEventListener("mouseleave", () => restoreHoverStatus());
        button.addEventListener("focus", () => showHoverStatus(tuneLabel));
        button.addEventListener("blur", () => restoreHoverStatus());
        button.addEventListener("dragstart", (ev) => {
          dragTuneId = tune.id;
          ev.dataTransfer.setData(LIBRARY_TUNE_DRAG_MIME, tune.id);
          ev.dataTransfer.setData("text/plain", tune.id);
          ev.dataTransfer.effectAllowed = "copyMove";
        });
        button.addEventListener("dragend", () => {
          dragTuneId = "";
        });
        button.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          const targetPath = entry.isFile
            ? entry.id
            : String(tune.id || "").split("::")[0];
          if (targetPath) {
            setActiveFilePath(targetPath);
            schedule(sourceFiles);
          }
          showContextMenuAt(ev.clientX, ev.clientY, { type: "tune", tuneId: tune.id });
        });
        button.addEventListener("click", () => {
          pinHoverStatus(tuneLabel);
          if (isRawMode()) {
            showToast("Raw mode: save or exit before selecting another tune.", 2400);
            return;
          }
          const targetPath = entry.isFile
            ? entry.id
            : String(tune.id || "").split("::")[0];
          if (targetPath) {
            setActiveFilePath(targetPath);
            schedule(sourceFiles);
          }
          openTuneFromLibrarySelection({
            filePath: targetPath,
            tuneUid: tune.tuneUid || null,
            tuneId: tune.id,
            xNumber: tune.xNumber,
          }).then((res) => {
            if (!res || !res.ok) {
              const msg = res && res.error ? res.error : "Unable to open tune.";
              showToast(msg, 3000);
            }
          }).catch(() => {
            showToast("Unable to open tune.", 3000);
          });
        });
        children.appendChild(button);
      }

      fileNode.appendChild(children);
      fragment.appendChild(fileNode);
    }
    treeElement.appendChild(fragment);
    updateFileHeaderPanel();
  }

  function markActiveTuneButton() {
    if (!treeElement) return;
    const buttons = treeElement.querySelectorAll(".tree-label");
    const activeTuneUid = getActiveTuneUid();
    const activeTuneId = getActiveTuneId();
    for (const btn of buttons) {
      if (btn.dataset && btn.dataset.tuneId) {
        const isActiveByUid = Boolean(activeTuneUid && btn.dataset.tuneUid && btn.dataset.tuneUid === activeTuneUid);
        const isActiveById = Boolean(activeTuneId && btn.dataset.tuneId && btn.dataset.tuneId === activeTuneId);
        btn.classList.toggle("active", isActiveByUid || isActiveById);
      }
    }
  }

  return {
    markActiveTuneButton,
    render,
    schedule,
  };
}

export {
  createLibraryTreeView,
};
