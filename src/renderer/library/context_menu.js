function createLibraryContextMenu({
  documentRef = typeof document !== "undefined" ? document : null,
  windowRef = typeof window !== "undefined" ? window : null,
  navigatorRef = typeof navigator !== "undefined" ? navigator : null,
  getLibraryIndex = () => null,
  getLibraryTextFilter = () => "",
  setLibraryTextFilter = () => {},
  getActiveTuneId = () => "",
  getActiveTuneUid = () => "",
  getActiveTuneMeta = () => null,
  getCurrentDocDirty = () => false,
  getHeaderDirty = () => false,
  getIsNewTuneDraft = () => false,
  getRawMode = () => false,
  getClipboardTune = () => null,
  getEditorView = () => null,
  getWindowApi = () => null,
  pathsEqual = (a, b) => String(a || "") === String(b || ""),
  safeBasename = (path) => String(path || "").split("/").pop() || "",
  findTuneById = () => null,
  hasUnsavedChangesForFile = () => false,
  hasDiskConflictPath = () => false,
  confirmReloadFromDisk = async () => false,
  discardAndReloadFileFromDisk = async () => ({ ok: false }),
  requestLoadLibraryFile = async () => {},
  deleteTuneById = async () => {},
  copyTuneById = async () => {},
  duplicateTuneById = async () => {},
  pasteClipboardToFile = async () => {},
  promptFindInLibrary = () => {},
  renderLibraryTree = () => {},
  updateLibraryStatus = () => {},
  refreshLibraryIndex = async () => {},
  beginRenameFile = () => {},
  renameCatalogCategory = () => false,
  openXIssues = async () => {},
  renumberXInActiveFile = async () => {},
  openMoveTuneModal = () => {},
  addTuneToSetList = async () => {},
  appendTuneToActiveFile = async () => {},
  buildTemplatesPreviewContextMenuItems = () => [],
  handleTemplatesContextMenuAction = async () => false,
  showToast = () => {},
  showSaveError = async () => {},
} = {}) {
  let contextMenu = null;
  let contextMenuTarget = null;

  function init() {
    if (contextMenu || !documentRef || !documentRef.body) return;
    contextMenu = documentRef.createElement("div");
    contextMenu.className = "context-menu";
    contextMenu.setAttribute("role", "menu");
    documentRef.body.appendChild(contextMenu);

    contextMenu.addEventListener("click", async (e) => {
      const target = e.target && e.target.closest ? e.target.closest(".context-menu-item") : null;
      if (!target || !target.dataset) return;
      if (target.classList && target.classList.contains("disabled")) return;
      const action = target.dataset.action;
      const menuTarget = contextMenuTarget;
      await handleAction(action, menuTarget);
    });

    documentRef.addEventListener("click", (e) => {
      if (contextMenu && !contextMenu.contains(e.target)) hide();
    });
    if (windowRef) windowRef.addEventListener("blur", () => hide());
  }

  async function handleAction(action, menuTarget) {
    if (action === "noop") return;
    if (action === "loadFile" && menuTarget && menuTarget.type === "file") {
      hide();
      await requestLoadLibraryFile(menuTarget.filePath);
      return;
    }
    if (action === "copyFilePath" && menuTarget && menuTarget.type === "file") {
      hide();
      try {
        const text = String(menuTarget.filePath || "");
        if (text && navigatorRef && navigatorRef.clipboard && navigatorRef.clipboard.writeText) {
          await navigatorRef.clipboard.writeText(text);
          showToast("Copied.");
        }
      } catch {}
      return;
    }
    if (action === "reloadFileFromDisk" && menuTarget && menuTarget.type === "file") {
      hide();
      const p = String(menuTarget.filePath || "");
      if (!p) return;
      const confirm = await confirmReloadFromDisk(p);
      if (!confirm) return;
      const restore = getRawMode()
        ? getActiveTuneId()
        : (getActiveTuneUid() || getActiveTuneId());
      const res = await discardAndReloadFileFromDisk(p, { restoreTuneId: getRawMode() ? null : restore });
      if (!res || !res.ok) {
        await showSaveError((res && res.error) ? res.error : "Unable to reload from disk.");
        return;
      }
      showToast("Reloaded from disk.", 2000);
      return;
    }
    if (action === "deleteTune" && menuTarget && menuTarget.type === "tune") {
      await deleteTuneById(menuTarget.tuneId);
      hide();
      return;
    }
    if (action === "copyTune" && menuTarget && menuTarget.type === "tune") {
      await copyTuneById(menuTarget.tuneId, "copy");
      hide();
      return;
    }
    if (action === "duplicateTune" && menuTarget && menuTarget.type === "tune") {
      await duplicateTuneById(menuTarget.tuneId);
      hide();
      return;
    }
    if (action === "cutTune" && menuTarget && menuTarget.type === "tune") {
      await copyTuneById(menuTarget.tuneId, "move");
      hide();
      return;
    }
    if (action === "addToSetList" && menuTarget) {
      const tuneId = menuTarget.type === "tune"
        ? menuTarget.tuneId
        : (menuTarget.type === "editor" ? getActiveTuneId() : null);
      hide();
      try {
        await addTuneToSetList(tuneId);
      } catch (e) {
        showToast(e && e.message ? e.message : String(e), 5000);
      }
      return;
    }
    if (action === "appendTuneToActiveFile" && menuTarget && menuTarget.type === "tune") {
      hide();
      await appendTuneToActiveFile(menuTarget.tuneId);
      return;
    }
    if (action === "pasteTune" && menuTarget && menuTarget.type === "file") {
      await pasteClipboardToFile(menuTarget.filePath);
      hide();
      return;
    }
    if (action === "findLibrary") {
      promptFindInLibrary();
      hide();
      return;
    }
    if (action === "clearSearch") {
      setLibraryTextFilter("");
      renderLibraryTree();
      updateLibraryStatus();
      hide();
      return;
    }
    if (action === "refreshLibrary") {
      await refreshLibraryIndex();
      hide();
      return;
    }
    if (action === "renameFile" && menuTarget && menuTarget.type === "file") {
      beginRenameFile(menuTarget.filePath);
      hide();
      return;
    }
    if (action === "renameCatalogCategory" && menuTarget && menuTarget.type === "category") {
      hide();
      renameCatalogCategory(menuTarget);
      return;
    }
    if (action === "xIssues" && menuTarget && menuTarget.type === "file") {
      hide();
      await openXIssues(menuTarget.filePath);
      return;
    }
    if (action === "renumberXInFile" && menuTarget) {
      const filePath = menuTarget.type === "file"
        ? menuTarget.filePath
        : (menuTarget.type === "tune" && menuTarget.tuneId ? String(menuTarget.tuneId).split("::")[0] : null);
      if (filePath) await renumberXInActiveFile(filePath);
      hide();
      return;
    }
    if (action === "moveTune" && menuTarget && menuTarget.type === "tune") {
      openMoveTuneModal(menuTarget.tuneId);
      hide();
      return;
    }
    if (action === "editorCut" && menuTarget && menuTarget.type === "editor") {
      const editorView = getEditorView();
      if (editorView) editorView.focus();
      if (documentRef && typeof documentRef.execCommand === "function") documentRef.execCommand("cut");
      hide();
      return;
    }
    if (action === "editorCopy" && menuTarget && menuTarget.type === "editor") {
      const editorView = getEditorView();
      if (editorView) editorView.focus();
      if (documentRef && typeof documentRef.execCommand === "function") documentRef.execCommand("copy");
      hide();
      return;
    }
    if (action === "editorPaste" && menuTarget && menuTarget.type === "editor") {
      const editorView = getEditorView();
      if (editorView) editorView.focus();
      if (documentRef && typeof documentRef.execCommand === "function") documentRef.execCommand("paste");
      hide();
      return;
    }
    if (await handleTemplatesContextMenuAction(action, menuTarget)) {
      hide();
    }
  }

  function buildItems(items) {
    if (!contextMenu || !documentRef) return;
    contextMenu.textContent = "";
    for (const item of items) {
      if (item && item.separator) {
        const sep = documentRef.createElement("div");
        sep.className = "context-menu-sep";
        sep.setAttribute("role", "separator");
        contextMenu.appendChild(sep);
        continue;
      }
      const row = documentRef.createElement("div");
      row.className = "context-menu-item";
      row.textContent = item.label;
      row.dataset.action = item.action;
      if (item.danger) row.classList.add("danger");
      if (item.disabled) row.classList.add("disabled");
      row.setAttribute("role", "menuitem");
      contextMenu.appendChild(row);
    }
  }

  function show(x, y, target) {
    if (!contextMenu) init();
    if (!contextMenu || !windowRef) return;
    contextMenuTarget = target;
    if (target.type === "tune") {
      const activeTuneMeta = getActiveTuneMeta();
      const targetPath = (activeTuneMeta && activeTuneMeta.path) ? String(activeTuneMeta.path) : "";
      const sourceRes = target && target.tuneId ? findTuneById(target.tuneId) : null;
      const sourcePath = sourceRes && sourceRes.file && sourceRes.file.path ? String(sourceRes.file.path) : "";
      const globalDirty = Boolean(getCurrentDocDirty()) || Boolean(getHeaderDirty()) || Boolean(getIsNewTuneDraft());
      const sourceDirty = Boolean(sourcePath) && (globalDirty || hasUnsavedChangesForFile(sourcePath));
      const canAppend = Boolean(
        targetPath
        && sourcePath
        && !pathsEqual(targetPath, sourcePath)
        && !getRawMode()
        && !getCurrentDocDirty()
        && !getHeaderDirty()
        && !sourceDirty
      );
      const items = [{ label: "Add to Set List", action: "addToSetList" }];
      if (canAppend) items.push({ separator: true }, { label: "Append to Active File…", action: "appendTuneToActiveFile" });
      if (sourceDirty) {
        items.push({ separator: true }, { label: "Save/Discard changes to enable file actions", action: "noop", disabled: true });
      } else {
        items.push(
          { separator: true },
          { label: "Copy Tune", action: "copyTune" },
          { label: "Cut Tune", action: "cutTune" },
          { label: "Duplicate Tune", action: "duplicateTune" },
          { separator: true },
          { label: "Move to…", action: "moveTune" },
          { separator: true },
          { label: "Renumber X (File)…", action: "renumberXInFile" },
          { separator: true },
          { label: "Delete Tune…", action: "deleteTune", danger: true },
        );
      }
      buildItems(items);
    } else if (target.type === "file") {
      const libraryIndex = getLibraryIndex();
      const fileEntry = libraryIndex && Array.isArray(libraryIndex.files) && target.filePath
        ? libraryIndex.files.find((f) => pathsEqual(f.path, target.filePath))
        : null;
      const hasXIssues = Boolean(fileEntry && fileEntry.xIssues && fileEntry.xIssues.ok === false);
      const globalDirty = Boolean(getCurrentDocDirty()) || Boolean(getHeaderDirty()) || Boolean(getIsNewTuneDraft());
      const fileDirty = Boolean(target.filePath) && (globalDirty || hasUnsavedChangesForFile(target.filePath));
      const items = [
        { label: "Load", action: "loadFile", disabled: !target.filePath },
        { label: "Copy Path", action: "copyFilePath", disabled: !target.filePath },
        { separator: true },
        { label: "Refresh Library", action: "refreshLibrary" },
      ];
      if (hasXIssues) items.push({ label: "X issues…", action: "xIssues" });
      if (target.filePath && hasDiskConflictPath(target.filePath)) {
        items.push({ label: "Reload from disk…", action: "reloadFileFromDisk" });
      }
      if (fileDirty) {
        items.push({ separator: true }, { label: "Save/Discard changes to enable file actions", action: "noop", disabled: true });
      } else {
        items.push(
          { separator: true },
          { label: "Paste Tune", action: "pasteTune", disabled: !getClipboardTune() },
          { label: "Rename File…", action: "renameFile" },
          { label: "Renumber X…", action: "renumberXInFile", disabled: !target.filePath },
        );
      }
      buildItems(items);
    } else if (target.type === "category") {
      buildItems([
        { label: "Rename / Merge Category...", action: "renameCatalogCategory" },
      ]);
    } else if (target.type === "library") {
      buildItems([
        { label: "Refresh Library", action: "refreshLibrary" },
        { label: "Clear Search", action: "clearSearch", disabled: !getLibraryTextFilter() },
      ]);
    } else if (target.type === "editor") {
      const canAdd = Boolean(getActiveTuneId()) && !getRawMode();
      buildItems([
        { label: "Add Active Tune to Set List", action: "addToSetList", disabled: !canAdd },
        { label: "Cut", action: "editorCut" },
        { label: "Copy", action: "editorCopy" },
        { label: "Paste", action: "editorPaste" },
      ]);
    } else if (target.type === "templatesPreview") {
      buildItems(buildTemplatesPreviewContextMenuItems(target));
    }
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add("open");
    const rect = contextMenu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (rect.right > windowRef.innerWidth) left = Math.max(8, x - rect.width);
    if (rect.bottom > windowRef.innerHeight) top = Math.max(8, y - rect.height);
    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
  }

  function hide() {
    if (!contextMenu) return;
    contextMenu.classList.remove("open");
    contextMenuTarget = null;
  }

  return {
    hide,
    init,
    show,
  };
}

export {
  createLibraryContextMenu,
};
