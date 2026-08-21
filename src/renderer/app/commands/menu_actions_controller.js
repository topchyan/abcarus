const BUSY_ALLOWED_ACTIONS = new Set([
  "playToggle",
  "stopPlayback",
  "resetLayout",
  "quit",
  "openPayloadMode",
  "playGotoMeasure",
  "toggleFocusMode",
  "setSplitOrientation",
  "toggleSplitOrientation",
  "toggleDebugMessages",
  "toggleAutoDump",
  "toggleNoteTypingPreview",
  "openIntonationExplorer",
  "toggleSetList",
]);

const PAYLOAD_ALLOWED_ACTIONS = new Set([
  "openPayloadMode",
  "playStart",
  "playPrev",
  "playToggle",
  "playNext",
  "stopPlayback",
  "playGotoMeasure",
  "zoomIn",
  "zoomOut",
  "zoomReset",
  "resetLayout",
  "setSplitOrientation",
  "toggleSplitOrientation",
  "toggleDebugMessages",
  "toggleAutoDump",
  "toggleNoteTypingPreview",
  "openKeyboardHelp",
  "openSettings",
  "openSettingsFolder",
  "toggleSetList",
]);

const RAW_BLOCKED_ACTIONS = new Set([
  "playStart",
  "playPrev",
  "playToggle",
  "playNext",
  "transformTransposeUp",
  "transformTransposeDown",
  "transformDouble",
  "transformHalf",
  "transformTurkishToConcert",
  "transformTurkishToBolahenk",
  "transformMeasures",
  "alignBars",
  "printPreview",
  "print",
  "printAll",
  "exportPdf",
  "exportPdfAll",
  "exportMusicXml",
  "exportMusicXmlAll",
  "exportMidi",
  "exportMp3",
  "importMusicXml",
  "importMidi",
  "templatesModal",
  "abcHelpers",
  "libraryMetadata",
  "revertToDisk",
]);

const RAW_NEEDS_EXIT_LABELS = {
  new: "creating a new file",
  newTune: "creating a new tune",
  newFromTemplate: "creating a new tune",
  open: "opening a file",
  openFolder: "opening a folder",
  openRecentTune: "opening a recent tune",
  openRecentFile: "opening a recent file",
  openRecentFolder: "opening a recent folder",
  templatesModal: "opening templates",
  revertToDisk: "reverting to disk",
  close: "closing this file",
  quit: "quitting",
};

function createMenuActionsController({
  api = null,
  windowRef = typeof window !== "undefined" ? window : null,
  state = {},
  actions = {},
} = {}) {
  function getActionType(action) {
    return typeof action === "string" ? action : action && action.type;
  }

  async function guardAction(action, actionType) {
    if (typeof state.isPlaybackBusy === "function" && state.isPlaybackBusy()) {
      if (!BUSY_ALLOWED_ACTIONS.has(actionType)) return false;
    }

    if (typeof state.isPayloadMode === "function" && state.isPayloadMode()) {
      if (!PAYLOAD_ALLOWED_ACTIONS.has(actionType)) {
        if (typeof actions.showToast === "function") {
          actions.showToast("Payload Mode: exit to use file/library actions.", 2600);
        }
        return false;
      }
    }

    if (typeof state.isRawModeActive === "function" && state.isRawModeActive()) {
      if (RAW_BLOCKED_ACTIONS.has(actionType)) {
        if (typeof actions.showToast === "function") {
          actions.showToast("Raw mode: switch to tune mode for tools/playback/print/export.", 2400);
        }
        return false;
      }

      if (Object.prototype.hasOwnProperty.call(RAW_NEEDS_EXIT_LABELS, actionType)) {
        if (typeof actions.leaveRawModeForAction !== "function") return false;
        const ok = await actions.leaveRawModeForAction(RAW_NEEDS_EXIT_LABELS[actionType] || "continuing");
        if (!ok) return false;
      }
    }

    return true;
  }

  async function handleRevertToDisk() {
    const entry = typeof actions.getActiveFileEntry === "function" ? actions.getActiveFileEntry() : null;
    const filePath = entry && entry.path ? String(entry.path) : "";
    if (!filePath) {
      if (typeof actions.showToast === "function") actions.showToast("Open a file first.", 2200);
      return;
    }
    if (typeof state.isPlaybackActive === "function" && state.isPlaybackActive()) {
      if (typeof actions.showToast === "function") actions.showToast("Stop playback to revert.", 2200);
      return;
    }
    const confirm = typeof actions.confirmReloadFromDisk === "function"
      ? await actions.confirmReloadFromDisk(filePath)
      : false;
    if (!confirm) return;
    const restoreTuneId = (typeof state.isRawModeActive === "function" && state.isRawModeActive())
      ? null
      : (typeof state.getActiveTuneId === "function" ? state.getActiveTuneId() || null : null);
    const res = typeof actions.discardAndReloadFileFromDisk === "function"
      ? await actions.discardAndReloadFileFromDisk(filePath, { restoreTuneId })
      : null;
    if (!res || !res.ok) {
      if (typeof actions.showSaveError === "function") {
        await actions.showSaveError(res && res.error ? res.error : "Unable to revert to disk.");
      }
      return;
    }
    if (typeof actions.setStatus === "function") actions.setStatus("Reverted to disk.");
    if (typeof actions.showToast === "function") actions.showToast("Reverted to disk.", 1600);
  }

  async function togglePayloadMode() {
    const enabled = typeof state.isPayloadModeSettingEnabled === "function"
      ? state.isPayloadModeSettingEnabled()
      : false;
    if (!enabled) {
      if (typeof actions.showToast === "function") {
        actions.showToast("Payload Mode is disabled. Enable in Settings → Options → Tools → Diagnostics.", 4200);
      }
      return;
    }
    if (typeof actions.wirePayloadMode === "function") actions.wirePayloadMode();
    if (typeof state.isPayloadMode === "function" && state.isPayloadMode()) {
      if (typeof actions.exitPayloadMode === "function") await actions.exitPayloadMode();
    } else if (typeof actions.enterPayloadMode === "function") {
      await actions.enterPayloadMode();
    }
  }

  async function dispatch(action) {
    const actionType = getActionType(action);
    if (!actionType) return;
    const ok = await guardAction(action, actionType);
    if (!ok) return;

    if (actionType === "new") await actions.fileNew();
    else if (actionType === "newTune") await actions.fileNewTune();
    else if (actionType === "newFromTemplate") await actions.fileNewFromTemplate();
    else if (actionType === "templatesModal") {
      if (typeof state.isPayloadMode === "function" && state.isPayloadMode()) {
        actions.showToast("Exit Payload Mode to use templates.", 2400);
        return;
      }
      await actions.openTemplatesModal();
    }
    else if (actionType === "open") await actions.fileOpen();
    else if (actionType === "openFolder") await actions.scanAndLoadLibrary();
    else if (actionType === "importMusicXml") await actions.importMusicXml();
    else if (actionType === "importMidi") await actions.importMidi();
    else if (actionType === "save") await actions.fileSave();
    else if (actionType === "saveAs") await actions.fileSaveAs();
    else if (actionType === "revertToDisk") await handleRevertToDisk();
    else if (actionType === "openPayloadMode") await togglePayloadMode();
    else if (actionType === "toggleDebugMessages") {
      const enabled = Boolean(action && action.value);
      if (windowRef) {
        windowRef.__abcarusDebugMessages = enabled;
        windowRef.__abcarusDebugPlayback = enabled;
        windowRef.__abcarusDebugDrums = enabled;
      }
    }
    else if (actionType === "toggleAutoDump") {
      if (windowRef) windowRef.__abcarusAutoDumpOnError = Boolean(action && action.value);
    }
    else if (actionType === "printPreview") await actions.runPrintAction("preview");
    else if (actionType === "print") await actions.runPrintAction("print");
    else if (actionType === "printAll") await actions.runPrintAllAction("print");
    else if (actionType === "exportMusicXml") await actions.exportMusicXml();
    else if (actionType === "exportMusicXmlAll") await actions.exportMusicXmlAll();
    else if (actionType === "exportMidi") await actions.exportMidi();
    else if (actionType === "exportMp3") await actions.exportMp3();
    else if (actionType === "exportPdf") await actions.runPrintAction("pdf");
    else if (actionType === "exportPdfAll") await actions.runPrintAllAction("pdf");
    else if (actionType === "close") await actions.requestCloseDocument();
    else if (actionType === "quit") await actions.requestQuitApplication();
    else if (actionType === "libraryList") actions.openLibraryCatalog();
    else if (actionType === "libraryMetadata") actions.openLibraryMetadata();
    else if (actionType === "setList") actions.openSetList();
    else if (actionType === "toggleSetList") actions.toggleSetList();
    else if (actionType === "printSetList") await actions.printSetList();
    else if (actionType === "toggleLibrary") actions.toggleLibrary();
    else if (actionType === "toggleFocusMode") actions.toggleFocusMode();
    else if (actionType === "toggleSplitOrientation") actions.toggleSplitOrientation({ userAction: true });
    else if (actionType === "setSplitOrientation") {
      const value = action && action.value ? String(action.value) : "";
      actions.setSplitOrientation(value, { persist: true, userAction: true });
    }
    else if (actionType === "renumberXInFile") await actions.renumberXInActiveFile();
    else if (actionType === "updateYouTubeMetadata") {
      if (typeof actions.updateYouTubeMetadata !== "function") {
        throw new Error("YouTube metadata command is unavailable.");
      }
      await actions.updateYouTubeMetadata();
    }
    else if (actionType === "navTunePrev") await actions.navigateTuneByDelta(-1);
    else if (actionType === "navTuneNext") await actions.navigateTuneByDelta(1);
    else if (actionType === "openRecentTune" && action && action.entry) await actions.openRecentTune(action.entry);
    else if (actionType === "openRecentFile" && action && action.entry) await actions.openRecentFile(action.entry);
    else if (actionType === "openRecentFolder" && action && action.entry) await actions.openRecentFolder(action.entry);
    else if (actionType === "abcHelpers") actions.openAbcHelpers();
    else if (actionType === "find") actions.openFind();
    else if (actionType === "replace") actions.openReplace();
    else if (actionType === "gotoLine") actions.gotoLine();
    else if (actionType === "toggleComment") actions.toggleComment();
    else if (actionType === "clearLibraryFilter") actions.clearLibraryFilter();
    else if (actionType === "playStart") await actions.transportStartOver();
    else if (actionType === "playToggle") await actions.togglePlayPauseEffective();
    else if (actionType === "playGotoMeasure") await actions.goToMeasureFromMenu();
    else if (actionType === "toggleNoteTypingPreview") {
      const next = Boolean(action && action.value);
      actions.setNoteTypingPreview(next);
    }
    else if (actionType === "resetLayout") actions.resetLayout();
    else if (actionType === "helpGuide") await actions.openExternal("https://abcplus.sourceforge.net/abcplus_en.pdf");
    else if (actionType === "helpUserGuide") {
      await actions.openExternal("https://github.com/topchyan/abcarus/blob/master/docs/USER_GUIDE.md");
    }
    else if (actionType === "helpLink" && action && action.url) await actions.openExternal(action.url);
    else if (actionType === "about") await actions.openAbout();
    else if (actionType === "transformTransposeUp") await actions.applyAbc2abcTransform({ transposeSemitones: 1 });
    else if (actionType === "transformTransposeDown") await actions.applyAbc2abcTransform({ transposeSemitones: -1 });
    else if (actionType === "transformDouble") await actions.applyAbc2abcTransform({ doubleLengths: true });
    else if (actionType === "transformHalf") await actions.applyAbc2abcTransform({ halfLengths: true });
    else if (actionType === "transformTurkishToConcert") {
      await actions.applyAbc2abcTransform({ turkishNotation: { direction: "toConcert" } });
    }
    else if (actionType === "transformTurkishToBolahenk") {
      await actions.applyAbc2abcTransform({ turkishNotation: { direction: "toBolahenk" } });
    }
    else if (actionType === "transformMeasures" && action && Number.isFinite(action.value)) {
      await actions.applyAbc2abcTransform({ measuresPerLine: action.value });
    }
    else if (actionType === "transformLinebreakMarkers") await actions.applyAbc2abcTransform({ linebreakMarker: true });
    else if (actionType === "alignBars") actions.alignBarsInEditor();
    else if (actionType === "openIntonationExplorer") actions.openIntonationExplorer();
    else if (actionType === "dumpDebug") actions.dumpDebug();
    else if (actionType === "settings") actions.openSettings();
    else if (actionType === "fonts") actions.openFontsSettings();
    else if (actionType === "exportSettings") await actions.exportSettings();
    else if (actionType === "importSettings") await actions.importSettings();
    else if (actionType === "openSettingsFolder") await actions.openSettingsFolder();
    else if (actionType === "zoomIn") actions.zoomIn();
    else if (actionType === "zoomOut") actions.zoomOut();
    else if (actionType === "zoomReset") actions.zoomReset();
    else if (actionType === "toggleFileHeader") actions.toggleFileHeader();
  }

  function wire() {
    if (!api || typeof api.onMenuAction !== "function") return;
    api.onMenuAction(async (action) => {
      try {
        await dispatch(action);
      } catch (e) {
        if (typeof actions.logError === "function") actions.logError((e && e.stack) ? e.stack : String(e));
        if (typeof actions.setStatus === "function") actions.setStatus("Error");
      }
    });
  }

  return {
    dispatch,
    wire,
  };
}

export {
  createMenuActionsController,
};
