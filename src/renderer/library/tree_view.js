const LIBRARY_TUNE_DRAG_MIME = "application/x-abcarus-tune-id";
const LIBRARY_CATEGORY_DRAG_MIME = "application/x-abcarus-library-category";

function libraryPathBasename(filePath) {
  return String(filePath || "").split(/[\\/]/).pop() || "";
}

function appendTooltipField(lines, label, value) {
  const text = String(value == null ? "" : value).trim();
  if (text) lines.push(`${label}: ${text}`);
}

function formatLibraryDate(timestamp) {
  const date = new Date(Number(timestamp));
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString();
}

function buildFileTooltip(entry, getEntryTuneCount) {
  const lines = [entry.label || "File"];
  appendTooltipField(lines, "Path", entry.id);
  appendTooltipField(lines, "Tunes", getEntryTuneCount(entry));
  appendTooltipField(lines, "Updated", formatLibraryDate(entry.updatedAtMs));
  if (entry.xIssues && entry.xIssues.ok === false) {
    const issues = [];
    if (entry.xIssues.invalid) issues.push(`invalid X: ${entry.xIssues.invalid}`);
    if (entry.xIssues.missing) issues.push(`missing X: ${entry.xIssues.missing}`);
    if (entry.xIssues.duplicates) issues.push("duplicate X");
    appendTooltipField(lines, "Index issue", issues.join(", "));
  }
  return lines.join("\n");
}

function buildGroupTooltip(entry, getEntryTuneCount) {
  const lines = [entry.label || "Group"];
  appendTooltipField(lines, "Tunes", getEntryTuneCount(entry));
  const files = new Map();
  for (const tune of entry.tunes || []) {
    const path = String(tune && (tune.filePath || tune.path) || "").trim();
    if (!path) continue;
    const label = libraryPathBasename(path) || path;
    const existing = files.get(path);
    files.set(path, { label, count: existing ? existing.count + 1 : 1 });
  }
  if (files.size) {
    lines.push("Files:");
    for (const { label, count } of files.values()) {
      lines.push(`  ${label}${count > 1 ? ` (${count})` : ""}`);
    }
  }
  return lines.join("\n");
}

function buildTuneTooltip(tune, tuneLabel, fallbackFilePath = "") {
  const lines = [tuneLabel || "Tune"];
  appendTooltipField(lines, "File", libraryPathBasename(tune && (tune.filePath || tune.path) || fallbackFilePath));
  appendTooltipField(lines, "X", tune && tune.xNumber);
  appendTooltipField(lines, "Title", tune && (tune.title || tune.preview));
  appendTooltipField(lines, "Composer", tune && (tune.composer || (Array.isArray(tune.composers) ? tune.composers.join(", ") : "")));
  appendTooltipField(lines, "Key", tune && tune.key);
  appendTooltipField(lines, "Meter", tune && tune.meter);
  appendTooltipField(lines, "Unit", tune && tune.unitLength);
  appendTooltipField(lines, "Tempo", tune && tune.tempo);
  appendTooltipField(lines, "Rhythm", tune && tune.rhythm);
  appendTooltipField(lines, "Source", tune && tune.source);
  appendTooltipField(lines, "Origin", tune && tune.origin);
  appendTooltipField(lines, "Group", tune && (Array.isArray(tune.groups) ? tune.groups.join(", ") : tune.group));
  return lines.join("\n");
}

function createLibraryTooltip(documentRef) {
  if (!documentRef || !documentRef.body) return null;
  const tooltip = documentRef.createElement("div");
  tooltip.className = "library-rich-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  documentRef.body.appendChild(tooltip);
  return tooltip;
}

function setLibraryTooltipContent(tooltip, text) {
  if (!tooltip) return;
  tooltip.textContent = "";
  const lines = String(text || "").split("\n").slice(1);
  let inFileList = false;
  for (const line of lines) {
    const row = tooltip.ownerDocument.createElement("div");
    const trimmed = line.trim();
    if (trimmed === "Files:") inFileList = true;
    if (trimmed.startsWith("File: ")) {
      const label = tooltip.ownerDocument.createElement("strong");
      label.textContent = "File: ";
      row.append(label, trimmed.slice("File: ".length));
    } else if (inFileList && trimmed) {
      const label = tooltip.ownerDocument.createElement("strong");
      label.textContent = trimmed;
      row.append(label);
    } else {
      row.textContent = line;
    }
    tooltip.appendChild(row);
  }
}

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
  isRichTooltipEnabled = () => true,
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
  reorderTune = async () => ({ ok: false }),
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
  const richTooltip = createLibraryTooltip(documentRef);

  function showRichTooltip(target, text) {
    if (!isRichTooltipEnabled() || !richTooltip || !target || !text) return;
    setLibraryTooltipContent(richTooltip, text);
    richTooltip.hidden = false;
    const rect = typeof target.getBoundingClientRect === "function"
      ? target.getBoundingClientRect()
      : null;
    if (!rect) return;
    const gap = 6;
    const width = richTooltip.offsetWidth || 280;
    const height = richTooltip.offsetHeight || 40;
    const viewportWidth = documentRef.documentElement ? documentRef.documentElement.clientWidth : width;
    const viewportHeight = documentRef.documentElement ? documentRef.documentElement.clientHeight : height;
    const left = Math.max(gap, Math.min(rect.left, viewportWidth - width - gap));
    const top = rect.bottom + height + gap <= viewportHeight
      ? rect.bottom + gap
      : Math.max(gap, rect.top - height - gap);
    richTooltip.style.left = `${left}px`;
    richTooltip.style.top = `${top}px`;
  }

  function hideRichTooltip() {
    if (richTooltip) richTooltip.hidden = true;
  }

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
      }
      const entryTooltip = entry.isFile
        ? buildFileTooltip(entry, getEntryTuneCount)
        : buildGroupTooltip(entry, getEntryTuneCount);
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
        const count = documentRef.createElement("span");
        count.className = "tree-count";
        count.textContent = String(getEntryTuneCount(entry) || 0);
        fileLabel.append(labelText, count);
        fileLabel.addEventListener("click", (ev) => {
          if (entry.isFile && ev && ev.detail && ev.detail > 1) return;
          showHoverStatus(entryTooltip);
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
        fileLabel.setAttribute("aria-label", entryTooltip);
        fileLabel.addEventListener("mouseenter", () => {
          showHoverStatus(entryTooltip);
          showRichTooltip(fileLabel, entryTooltip);
        });
        fileLabel.addEventListener("mouseleave", () => {
          restoreHoverStatus();
          hideRichTooltip();
        });
        fileLabel.addEventListener("focus", () => {
          showHoverStatus(entryTooltip);
          showRichTooltip(fileLabel, entryTooltip);
        });
        fileLabel.addEventListener("blur", () => {
          restoreHoverStatus();
          hideRichTooltip();
        });
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
        button.draggable = !isRawMode() && !isPayloadMode();
        button.disabled = isPayloadMode();
        const labelNumber = tune.xNumber || String(tune.indexInFile);
        const title = tune.title || tune.preview || "";
        const composer = tune.composer ? ` - ${tune.composer}` : "";
        const key = tune.key ? ` - ${tune.key}` : "";
        const tuneLabel = `${labelNumber}: ${title}${composer}${key}`.trim();
        button.textContent = tuneLabel;
        const tuneTooltip = buildTuneTooltip(tune, tuneLabel, entry.isFile ? entry.id : "");
        button.setAttribute("aria-label", tuneTooltip);
        button.dataset.tuneId = tune.id;
        if (tune.tuneUid) button.dataset.tuneUid = tune.tuneUid;
        const activeTuneUid = getActiveTuneUid();
        const activeTuneId = getActiveTuneId();
        const isActiveByUid = Boolean(activeTuneUid && tune.tuneUid && tune.tuneUid === activeTuneUid);
        const isActiveById = Boolean(activeTuneId && tune.id && tune.id === activeTuneId);
        if (isActiveByUid || isActiveById) button.classList.add("active");
        button.addEventListener("mouseenter", () => {
          showHoverStatus(tuneTooltip);
          showRichTooltip(button, tuneTooltip);
        });
        button.addEventListener("mouseleave", () => {
          restoreHoverStatus();
          hideRichTooltip();
        });
        button.addEventListener("focus", () => {
          showHoverStatus(tuneTooltip);
          showRichTooltip(button, tuneTooltip);
        });
        button.addEventListener("blur", () => {
          restoreHoverStatus();
          hideRichTooltip();
        });
        button.addEventListener("dragstart", (ev) => {
          dragTuneId = tune.id;
          ev.dataTransfer.setData(LIBRARY_TUNE_DRAG_MIME, tune.id);
          ev.dataTransfer.setData("text/plain", tune.id);
          ev.dataTransfer.effectAllowed = "copyMove";
        });
        button.addEventListener("dragend", () => {
          dragTuneId = "";
          button.classList.remove("drop-target", "drop-before", "drop-after");
        });
        button.addEventListener("dragover", (ev) => {
          if (!isTuneDrag(ev)) return;
          const sourceTuneId = getDragTuneId(ev);
          if (!sourceTuneId || sourceTuneId === tune.id) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
          const rect = typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : null;
          const placement = rect && Number.isFinite(Number(ev.clientY)) && ev.clientY >= rect.top + (rect.height / 2)
            ? "after"
            : "before";
          button.classList.add("drop-target");
          button.classList.toggle("drop-before", placement === "before");
          button.classList.toggle("drop-after", placement === "after");
        });
        button.addEventListener("dragleave", () => {
          button.classList.remove("drop-target", "drop-before", "drop-after");
        });
        button.addEventListener("drop", async (ev) => {
          const sourceTuneId = getDragTuneId(ev);
          if (!sourceTuneId || sourceTuneId === tune.id) return;
          ev.preventDefault();
          ev.stopPropagation();
          const placement = button.classList.contains("drop-after") ? "after" : "before";
          button.classList.remove("drop-target", "drop-before", "drop-after");
          dragTuneId = "";
          await reorderTune(sourceTuneId, { targetTuneId: tune.id, placement });
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
          pinHoverStatus(tuneTooltip);
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
  buildFileTooltip,
  buildGroupTooltip,
  buildTuneTooltip,
  createLibraryTreeView,
};
