export function createSaveFlowController({
  api = null,
  SAVE_INTENT = {},
  state = {},
  actions = {},
} = {}) {
  const {
    getActiveFilePath = () => "",
    getActiveTuneId = () => "",
    getActiveTuneMeta = () => null,
    getActiveTuneUid = () => "",
    getCurrentDocument = () => null,
    getCurrentDocumentPath = () => "",
    getFocusModeEnabled = () => false,
    getHeaderDirty = () => false,
    getHeaderEditorValue = () => "",
    getIsNewTuneDraft = () => false,
    getLibraryIndex = () => null,
    getRawMode = () => false,
    getChordProFullText = () => "",
    isChordProEnabled = () => false,
    isChordProFullView = () => false,
    isPayloadMode = () => false,
    resolveSaveIntent = () => ({ intent: SAVE_INTENT.NONE }),
  } = state;

  const {
    addRecentFolder = () => {},
    createNewFileAtPath = async () => false,
    getDefaultSaveDir = () => "",
    getEditorValue = () => "",
    getSuggestedBaseName = () => "untitled",
    fileExists = async () => false,
    confirmOverwrite = async () => "cancel",
    isHeaderEditorFilePath = () => false,
    loadLibraryFileIntoEditor = async () => null,
    loadLibraryFromFolder = async () => null,
    markCurrentDocumentClean = () => null,
    markDiskConflictPath = () => {},
    markHeaderClean = () => {},
    normalizeLibraryPath = (p) => String(p || ""),
    patchCurrentDocument = () => {},
    pathsEqual = (a, b) => String(a || "") === String(b || ""),
    performAppendFlow = async () => false,
    performRawSaveFlow = async () => false,
    reconcileActiveTuneAfterSave = () => {},
    recordRecentAction = () => {},
    refreshLibraryFile = async () => null,
    resetHeaderEditorFilePath = () => {},
    resetTransposePreviewState = () => {},
    safeBasename = (p) => String(p || "").split("/").pop() || "",
    safeDirname = () => "",
    scheduleRenderLibraryTree = () => {},
    selectTune = async () => {},
    serializeDocument = (doc) => (doc ? String(doc.content || "") : ""),
    splitFileIntoHeaderAndBody = (text) => ({ headerText: "", bodyText: String(text || "") }),
    setActiveFilePath = () => {},
    setActiveTuneMeta = () => {},
    setDirtyIndicator = () => {},
    readFile = async () => ({ ok: false }),
    writeFile = async () => ({ ok: false }),
    setFileNameMeta = () => {},
    setStatus = () => {},
    showSaveDialog = async () => "",
    showSaveError = async () => {},
    showToastWithAction = () => {},
    stripFileExtension = (name) => String(name || "").replace(/\.[^.]*$/, ""),
    tryResolveActiveTuneUid = () => false,
    updateFileHeaderPanel = () => {},
    updateHeaderStateUI = () => {},
    updateLibraryStatus = () => {},
    updateWindowTitle = () => {},
    ensureXNumberInAbc = (text) => String(text || ""),
    withFileLock = async (_path, fn) => fn(),
  } = actions;

  function rememberSavedFolder(filePath) {
    const folder = safeDirname(String(filePath || ""));
    if (folder) addRecentFolder({ path: folder, label: folder });
  }

  function isPermissionDeniedSaveError(error) {
    const msg = String(error || "");
    return /\b(EACCES|EPERM)\b/i.test(msg) || /permission denied/i.test(msg);
  }

  async function saveEmergencyCopy(filePath, text) {
    if (!api || typeof api.getRecoveryDir !== "function" || typeof api.pathJoin !== "function") return "";
    try {
      const dir = String(await api.getRecoveryDir() || "");
      if (!dir || typeof api.mkdirp !== "function") return "";
      const rawBase = safeBasename(filePath) || "untitled.abc";
      const safeBase = rawBase.replace(/[^a-z0-9._-]+/gi, "_");
      const extensionMatch = safeBase.match(/(\.[^.]+)$/);
      const extension = extensionMatch ? extensionMatch[1] : ".abc";
      const stem = (extensionMatch ? safeBase.slice(0, -extension.length) : safeBase) || "untitled";
      const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
      const target = api.pathJoin(dir, `${stem}.recovery-${stamp}${extension}`);
      const made = await api.mkdirp(dir);
      if (!made || made.ok === false) return "";
      const result = await writeFile(target, text);
      return result && result.ok ? target : "";
    } catch {
      return "";
    }
  }

  async function handlePermissionDeniedSave(filePath, message) {
    const p = String(filePath || "");
    if (!p) return false;
    const msg = String(message || "");
    if (!isPermissionDeniedSaveError(msg)) return false;
    if (!api || typeof api.confirmSaveAsForPermissionDenied !== "function") return false;
    const choice = await api.confirmSaveAsForPermissionDenied(p, msg);
    if (choice !== "save_as") return false;
    return performSaveAsFlow();
  }

  async function performSimpleTuneSave(filePath, { includeHeader = false } = {}) {
    const p = String(filePath || "");
    if (!p) {
      await showSaveError("Unable to save: tune path is missing.");
      return false;
    }
    return withFileLock(p, async () => {
      const activeTuneMeta = getActiveTuneMeta();
      if (!activeTuneMeta || !pathsEqual(activeTuneMeta.path, p)) {
        await showSaveError("Unable to save: active tune context is missing or stale.");
        return false;
      }

      let loadedParts = activeTuneMeta.documentParts;
      const requiredPartKeys = ["header", "before", "active", "after"];
      const missingPartKeys = requiredPartKeys.filter((key) => (
        !loadedParts
        || typeof loadedParts !== "object"
        || !Object.prototype.hasOwnProperty.call(loadedParts, key)
      ));
      const hasCompleteParts = loadedParts
        && typeof loadedParts === "object"
        && missingPartKeys.length === 0;
      if (!hasCompleteParts) {
        const disk = await readFile(p);
        const start = Number(activeTuneMeta.startOffset);
        const end = Number(activeTuneMeta.endOffset);
        const diskText = disk && disk.ok ? String(disk.data || "") : "";
        const fileParts = splitFileIntoHeaderAndBody(diskText);
        const headerText = String(fileParts && fileParts.headerText || "");
        const activeText = Number.isFinite(start) && Number.isFinite(end) && end > start
          ? diskText.slice(start, end)
          : "";
        const reconstructionReason = !disk || !disk.ok
          ? "file could not be read from disk"
          : !Number.isFinite(start) || !Number.isFinite(end) || end <= start
            ? "active tune offsets are invalid"
            : start < headerText.length || end > diskText.length
              ? "active tune offsets are outside the current file"
              : !/^\s*X:/.test(activeText)
                ? "the saved start offset no longer points to an X: tune"
                : "unknown reconstruction failure";
        recordRecentAction("save.parts.reconstruct.failed", {
          path: p,
          x: activeTuneMeta.xNumber != null ? String(activeTuneMeta.xNumber) : "",
          missingParts: missingPartKeys,
          startOffset: Number.isFinite(start) ? start : null,
          endOffset: Number.isFinite(end) ? end : null,
          reason: reconstructionReason,
        });
        if (!disk || !disk.ok || !/^\s*X:/.test(activeText) || start < headerText.length || end > diskText.length) {
          const missingLabel = missingPartKeys.length ? missingPartKeys.join(", ") : "unknown";
          await showSaveError(`Unable to save safely: missing tune parts [${missingLabel}]; ${reconstructionReason}. Re-open the tune and try again.`);
          return false;
        }
        recordRecentAction("save.parts.reconstruct.ok", {
          path: p,
          x: activeTuneMeta.xNumber != null ? String(activeTuneMeta.xNumber) : "",
          missingParts: missingPartKeys,
          startOffset: start,
          endOffset: end,
        });
        loadedParts = {
          header: headerText,
          before: diskText.slice(headerText.length, start),
          active: activeText,
          after: diskText.slice(end),
        };
      }

      const targetX = activeTuneMeta.xNumber != null ? String(activeTuneMeta.xNumber).trim() : "";
      const editorText = targetX
        ? ensureXNumberInAbc(getEditorValue(), targetX)
        : String(getEditorValue() || "");
      if (!editorText.trim()) {
        await showSaveError("Unable to save: active tune text is empty.");
        return false;
      }

      const headerText = includeHeader
        ? String(getHeaderEditorValue() || "")
        : String(loadedParts.header || "");
      const normalizedHeader = headerText && !/[\r\n]$/.test(headerText) ? `${headerText}\n` : headerText;
      const nextParts = {
        header: normalizedHeader,
        before: String(loadedParts.before || ""),
        active: editorText,
        after: String(loadedParts.after || ""),
      };
      const nextText = `${nextParts.header}${nextParts.before}${nextParts.active}${nextParts.after}`;

      const saveRes = await writeFile(p, nextText, {});
      if (!saveRes || !saveRes.ok) {
        if (saveRes && saveRes.conflict) markDiskConflictPath(p, true);
        const recoveryPath = await saveEmergencyCopy(p, nextText);
        const detail = (saveRes && saveRes.error) ? saveRes.error : "Unable to save file.";
        await showSaveError(recoveryPath
          ? `${detail}\nEmergency copy saved to:\n${recoveryPath}\nYour changes remain unsaved.`
          : detail);
        return false;
      }

      setActiveTuneMeta({ ...activeTuneMeta, documentParts: nextParts });
      patchCurrentDocument({ path: p, content: getEditorValue(), dirty: false }, { create: false });
      if (includeHeader) {
        markHeaderClean();
        updateHeaderStateUI();
      }
      markDiskConflictPath(p, false);
      resetTransposePreviewState();
      setDirtyIndicator(false);
      setActiveFilePath(p);
      const updatedFile = await refreshLibraryFile(p, { force: true });
      await reconcileActiveTuneAfterSave(p, updatedFile);
      updateLibraryStatus();
      scheduleRenderLibraryTree();
      updateFileHeaderPanel();
      recordRecentAction("save.simple_tune.ok", { path: p });
      return true;
    });
  }

  async function performSaveFlow() {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) return false;
    const session = resolveSaveIntent();
    const activeFilePath = getActiveFilePath();
    const activeTuneMeta = getActiveTuneMeta();
    recordRecentAction("save.start", {
      currentDocPath: currentDocument.path ? String(currentDocument.path) : null,
      currentDocDirty: Boolean(currentDocument.dirty),
      headerDirty: getHeaderDirty(),
      isNewTuneDraft: Boolean(getIsNewTuneDraft()),
      activeTunePath: activeTuneMeta && activeTuneMeta.path ? String(activeTuneMeta.path) : null,
      payloadMode: Boolean(isPayloadMode()),
      rawMode: Boolean(getRawMode()),
      focusMode: Boolean(getFocusModeEnabled()),
      saveIntent: session.intent,
      saveTargetPath: session.targetPath || null,
      saveSource: session.source || null,
    });

    const headerTargetPath = String(
      session.targetPath
      || activeFilePath
      || (activeTuneMeta && activeTuneMeta.path)
      || ""
    );
    const combineHeaderWithTuneSave = Boolean(
      getHeaderDirty()
      && headerTargetPath
      && session.intent === SAVE_INTENT.REPLACE_TUNE
      && activeTuneMeta
      && activeTuneMeta.path
      && pathsEqual(activeTuneMeta.path, headerTargetPath)
    );
    if (getHeaderDirty() && headerTargetPath && !combineHeaderWithTuneSave) {
      try {
        const headerRes = await saveFileHeaderText(headerTargetPath, getHeaderEditorValue());
        if (headerRes && headerRes.ok) {
          markHeaderClean();
          updateHeaderStateUI();
          setStatus(headerRes.action === "save_copy_as" ? "Saved copy and switched." : "Header saved.");
        } else if (headerRes && headerRes.action === "discard_reload") {
          resetHeaderEditorFilePath();
          markHeaderClean();
          updateHeaderStateUI();
          updateFileHeaderPanel();
          setStatus("Reloaded from disk.");
          return false;
        } else {
          setStatus("Save canceled.");
          updateHeaderStateUI();
          return false;
        }
      } catch (e) {
        await showSaveError(e && e.message ? e.message : String(e));
        updateHeaderStateUI();
        return false;
      }
    }

    if (isChordProEnabled()) {
      const filePath = activeFilePath || getCurrentDocumentPath() || "";
      return filePath ? performChordProDirectSave(filePath) : performSaveAsFlow();
    }

    if (session.intent === SAVE_INTENT.APPEND_TO_FILE && session.targetPath) {
      setActiveFilePath(String(session.targetPath));
      const ok = await performAppendFlow();
      return Boolean(ok);
    }

    if (session.intent === SAVE_INTENT.REPLACE_TUNE && activeTuneMeta && activeTuneMeta.path) {
      const ok = await performSimpleTuneSave(activeTuneMeta.path, {
        includeHeader: Boolean(combineHeaderWithTuneSave && getHeaderDirty()),
      });
      return Boolean(ok);
    }

    if (session.intent === SAVE_INTENT.FULL_FILE && getCurrentDocumentPath()) {
      const filePath = getCurrentDocumentPath();
      await showSaveError("Unable to save safely: file context is missing. Re-open the file and try again.");
      return false;
    }

    if (session.intent === SAVE_INTENT.REPLACE_TUNE && (!activeTuneMeta || !activeTuneMeta.path)) {
      await showSaveError("Unable to save: tune context is missing. Re-open the tune and try again.");
      return false;
    }
    if (session.intent === SAVE_INTENT.APPEND_TO_FILE && !session.targetPath) {
      await showSaveError("Unable to save: append target is missing. Select/open the target file and try again.");
      return false;
    }

    return performSaveAsFlow();
  }

  async function performChordProDirectSave(filePath) {
    const p = String(filePath || "");
    if (!p) return false;
    const disk = await readFile(p);
    if (!disk || !disk.ok) {
      await showSaveError((disk && disk.error) ? disk.error : "Unable to read ChordPro file.");
      return false;
    }
    const diskText = String(disk.data || "");
    const nextText = String((isChordProFullView() ? getEditorValue() : getChordProFullText()) || "");
    const result = await withFileLock(p, () => writeFile(p, nextText, {}));
    if (!result || !result.ok) {
      await showSaveError((result && result.error) ? result.error : "Unable to save ChordPro file.");
      return false;
    }
    markCurrentDocumentClean();
    setDirtyIndicator(false);
    updateWindowTitle();
    try { await refreshLibraryFile(p, { force: true }); } catch {}
    return true;
  }

  async function performSaveAsFlow() {
    const currentDocument = getCurrentDocument();
    if (!currentDocument) return false;

    if (isChordProEnabled()) {
      const currentPath = getActiveFilePath() || getCurrentDocumentPath() || "";
      const base = currentPath ? safeBasename(currentPath) : "";
      const extMatch = base.match(/(\.[^.]+)$/);
      const suffix = extMatch ? extMatch[1] : ".cho";
      const suggestedName = `${stripFileExtension(base || "untitled")}${suffix}`;
      const suggestedDir = getDefaultSaveDir();
      const filePath = await showSaveDialog(suggestedName, suggestedDir);
      if (!filePath) return false;
      if (currentPath && pathsEqual(normalizeLibraryPath(filePath), normalizeLibraryPath(currentPath))) {
        await showSaveError("Save As destination must be different from the source file.");
        return false;
      }
      if (await fileExists(filePath) && (await confirmOverwrite(filePath)) !== "replace") return false;
      const content = String((isChordProFullView() ? getEditorValue() : getChordProFullText()) || "");
      const saved = await createNewFileAtPath(filePath, content, { confirmOverwrite: false });
      if (!saved) return false;
      patchCurrentDocument({ path: filePath, dirty: false }, { create: false });
      rememberSavedFolder(filePath);
      resetTransposePreviewState();
      setActiveFilePath(filePath);
      setFileNameMeta(stripFileExtension(safeBasename(filePath)));
      updateWindowTitle();
      return true;
    }

    const directSourcePath = getActiveFilePath() || getCurrentDocumentPath() || "";
    const directTuneMeta = getActiveTuneMeta();
    if (
      directTuneMeta
      && directTuneMeta.path
      && pathsEqual(directTuneMeta.path, directSourcePath)
      && directTuneMeta.documentParts
    ) {
      if (getCurrentDocument().dirty || getHeaderDirty()) {
        const prepared = await performSimpleTuneSave(directTuneMeta.path, {
          includeHeader: Boolean(getHeaderDirty()),
        });
        if (!prepared) return false;
      }

      const sourceRead = await readFile(directSourcePath);
      if (!sourceRead || !sourceRead.ok) {
        await showSaveError((sourceRead && sourceRead.error) ? sourceRead.error : "Unable to read source file for Save As.");
        return false;
      }
      const suggestedName = `${getSuggestedBaseName()}.abc`;
      const filePath = await showSaveDialog(suggestedName, getDefaultSaveDir());
      if (!filePath) return false;
      if (pathsEqual(normalizeLibraryPath(filePath), normalizeLibraryPath(directSourcePath))) {
        await showSaveError("Save As destination must be different from the source file.");
        return false;
      }

      const destinationExists = await fileExists(filePath);
      if (destinationExists) {
        if ((await confirmOverwrite(filePath)) !== "replace") return false;
      }
      const out = await writeFile(filePath, String(sourceRead.data || ""), {});
      if (!out || !out.ok) {
        await showSaveError((out && out.error) ? out.error : "Unable to save file.");
        return false;
      }
      patchCurrentDocument({ path: filePath, dirty: false }, { create: false });
      setDirtyIndicator(false);
      resetTransposePreviewState();
      setActiveFilePath(filePath);
      setFileNameMeta(stripFileExtension(safeBasename(filePath)));
      try { await refreshLibraryFile(filePath, { force: true }); } catch {}
      const switched = await loadLibraryFileIntoEditor(filePath, { skipConfirm: true });
      if (switched && switched.ok) {
        patchCurrentDocument({ path: filePath, dirty: false }, { create: false });
        setDirtyIndicator(false);
      }
      rememberSavedFolder(filePath);
      updateFileHeaderPanel();
      updateWindowTitle();
      return true;
    }

    const suggestedName = `${getSuggestedBaseName()}.abc`;
    const suggestedDir = getDefaultSaveDir();
    const filePath = await showSaveDialog(suggestedName, suggestedDir);
    if (!filePath) return false;
    const sourcePath = getActiveFilePath() || getCurrentDocumentPath() || "";
    if (sourcePath && pathsEqual(normalizeLibraryPath(filePath), normalizeLibraryPath(sourcePath))) {
      await showSaveError("Save As destination must be different from the source file.");
      return false;
    }
    if (await fileExists(filePath) && (await confirmOverwrite(filePath)) !== "replace") return false;

    const content = serializeDocument(currentDocument);
    const saved = await createNewFileAtPath(filePath, content, { confirmOverwrite: false });
    if (!saved) return false;
    rememberSavedFolder(filePath);
    try { await refreshLibraryFile(filePath, { force: true }); } catch {}
    patchCurrentDocument({ path: filePath, dirty: false }, { create: false });
    setDirtyIndicator(false);
    setActiveFilePath(filePath);
    setFileNameMeta(stripFileExtension(safeBasename(filePath)));
    updateFileHeaderPanel();
    updateWindowTitle();
    const switched = await loadLibraryFileIntoEditor(filePath, { skipConfirm: true });
    if (switched && switched.ok) {
      patchCurrentDocument({ path: filePath, dirty: false }, { create: false });
      setDirtyIndicator(false);
    }
    return true;
  }

  async function saveFileHeaderText(filePath, headerText) {
    const p = String(filePath || "");
    if (!p) throw new Error("Missing file path.");
    return withFileLock(p, async () => {
      const disk = await readFile(p);
      if (!disk || !disk.ok) throw new Error(disk && disk.error ? disk.error : "Unable to read header file.");
      const diskText = String(disk.data || "");
      const match = diskText.match(/^[\t ]*X:/m);
      const headerEnd = match && Number.isFinite(match.index) ? match.index : diskText.length;
      const rawHeader = String(headerText || "");
      const nextHeader = rawHeader && !/[\r\n]$/.test(rawHeader) ? `${rawHeader}\n` : rawHeader;
      const nextText = nextHeader + diskText.slice(headerEnd);
      const saveRes = await writeFile(p, nextText, {});
      if (!saveRes || !saveRes.ok) {
        if (saveRes && saveRes.conflict) markDiskConflictPath(p, true);
        throw new Error((saveRes && saveRes.error) ? saveRes.error : "Unable to save header.");
      }
      markDiskConflictPath(p, false);
      const updatedFile = await refreshLibraryFile(p, { force: true });
      try {
        if (updatedFile && updatedFile.path && pathsEqual(updatedFile.path, p) && isHeaderEditorFilePath(p)) {
          markHeaderClean();
          updateHeaderStateUI();
        }
      } catch {}
      const activeTuneMeta = getActiveTuneMeta();
      if (activeTuneMeta && pathsEqual(activeTuneMeta.path, p)) {
        const tuneIdToRestore = getRawMode() ? getActiveTuneId() : (getActiveTuneUid() || getActiveTuneId());
        if (tuneIdToRestore) await selectTune(tuneIdToRestore, { skipConfirm: true, suppressRecent: true });
        const label = updatedFile ? updatedFile.basename : safeBasename(p);
        setFileNameMeta(stripFileExtension(label || ""));
      }
      return { ok: true, action: "saved" };
    });
  }

  return {
    performRawSaveFlow,
    performSaveAsFlow,
    performSaveFlow,
    performSimpleTuneSave,
    saveFileHeaderText,
  };
}
