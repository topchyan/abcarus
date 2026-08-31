import { createMenuActionsController } from "./menu_actions_controller.js";

function createAppCommandsDomain({
  api = null,
  windowRef = typeof window !== "undefined" ? window : null,
  documentRef = typeof document !== "undefined" ? document : null,
  elements = {},
  controllers = {},
  state = {},
  actions = {},
} = {}) {
  const call = (fn, ...args) => (typeof fn === "function" ? fn(...args) : undefined);
  const callAsync = async (fn, ...args) => (typeof fn === "function" ? await fn(...args) : undefined);

  function logError(error) {
    call(actions.logError, error && error.stack ? error.stack : String(error));
  }

  function setErrorStatus() {
    call(actions.setStatus, "Error");
  }

  async function guardedRun(fn, { setStatusOnError = false } = {}) {
    try {
      await callAsync(fn);
    } catch (error) {
      logError(error);
      if (setStatusOnError) setErrorStatus();
    }
  }

  async function ensureRawCanLeave(label) {
    if (!call(state.isRawModeActive)) return true;
    return Boolean(await callAsync(actions.leaveRawModeForAction, label));
  }

  function getSettingsDomain() {
    if (typeof controllers.getSettingsDomain === "function") return controllers.getSettingsDomain();
    return controllers.settings || null;
  }

  function getErrorsDomain() {
    return controllers.errors || null;
  }

  function getMeasureNavigation() {
    return controllers.measureNavigation || null;
  }

  function openAbcHelpersCommand() {
    const editorView = call(state.getEditorView);
    if (!editorView) return;
    if (call(state.isPayloadMode)) {
      call(actions.showToast, "Exit Payload Mode to use ABC Helpers.", 2400);
      return;
    }
    editorView.focus();
    try {
      const ev = new KeyboardEvent("keydown", {
        key: "F2",
        code: "F2",
        ctrlKey: true,
        bubbles: true,
      });
      editorView.dom.dispatchEvent(ev);
    } catch {}
  }

  function toggleFocusedEditorComment() {
    const view = call(actions.getFocusedEditorView);
    if (view) call(actions.toggleLineComments, view);
  }

  function setNoteTypingPreviewCommand(enabled) {
    const next = Boolean(enabled);
    call(actions.setNoteTypingPreview, next);
    try { call(actions.showToast, next ? "Typing note preview enabled." : "Typing note preview disabled.", 1800); } catch {}
  }

  async function setSelectionLoopCommand(enabled) {
    const next = Boolean(enabled);
    if (api && typeof api.updateSettings === "function") {
      await api.updateSettings({ playbackSelectionLoopEnabled: next });
    }
    try { call(actions.showToast, next ? "Selection loop enabled." : "Selection loop disabled.", 1800); } catch {}
  }

  const menuActionsController = createMenuActionsController({
    api,
    windowRef,
    state: {
      getActiveTuneId: state.getActiveTuneId,
      isPayloadMode: state.isPayloadMode,
      isPayloadModeSettingEnabled: state.isPayloadModeSettingEnabled,
      isPlaybackActive: state.isPlaybackActive,
      isPlaybackBusy: state.isPlaybackBusy,
      isRawModeActive: state.isRawModeActive,
    },
    actions: {
      alignBarsInEditor: actions.alignBarsInEditor,
      checkLyricFitInEditor: actions.checkLyricFitInEditor,
      applyAbc2abcTransform: actions.applyAbc2abcTransform,
      clearLibraryFilter: actions.clearLibraryFilter,
      confirmReloadFromDisk: actions.confirmReloadFromDisk,
      discardAndReloadFileFromDisk: actions.discardAndReloadFileFromDisk,
      dumpDebug: actions.dumpDebug,
      enterPayloadMode: actions.enterPayloadMode,
      exitPayloadMode: actions.exitPayloadMode,
      exportMidi: actions.exportMidi,
      exportMp3: actions.exportMp3,
      exportMusicXml: actions.exportMusicXml,
      exportMusicXmlAll: actions.exportMusicXmlAll,
      exportSettings: () => {
        const settings = getSettingsDomain();
        return settings && typeof settings.exportSettings === "function"
          ? settings.exportSettings()
          : undefined;
      },
      fileNew: actions.fileNew,
      fileNewFromTemplate: actions.fileNewFromTemplate,
      fileNewTune: actions.fileNewTune,
      fileOpen: actions.fileOpen,
      fileSave: actions.fileSave,
      fileSaveAs: actions.fileSaveAs,
      getActiveFileEntry: actions.getActiveFileEntry,
      goToMeasureFromMenu: () => {
        const controller = getMeasureNavigation();
        return controller && typeof controller.goToMeasureCommand === "function"
          ? controller.goToMeasureCommand()
          : undefined;
      },
      gotoLine: actions.gotoLine,
      importMidi: actions.importMidi,
      importMusicXml: actions.importMusicXml,
      importSettings: () => {
        const settings = getSettingsDomain();
        return settings && typeof settings.importSettings === "function"
          ? settings.importSettings()
          : undefined;
      },
      leaveRawModeForAction: actions.leaveRawModeForAction,
      logError: actions.logError,
      navigateTuneByDelta: actions.navigateTuneByDelta,
      openAbout: actions.openAbout,
      openAbcHelpers: openAbcHelpersCommand,
      openExternal: actions.openExternal,
      openFind: actions.openFind,
      openFontsSettings: () => {
        const settings = getSettingsDomain();
        if (settings && typeof settings.openFontsSettings === "function") settings.openFontsSettings();
      },
      openIntonationExplorer: actions.toggleIntonationExplorer,
      openLibraryCatalog: actions.openLibraryCatalog,
      openLibraryMetadata: actions.openLibraryMetadata,
      openRecentFile: actions.openRecentFile,
      openRecentFolder: actions.openRecentFolder,
      openRecentTune: actions.openRecentTune,
      openReplace: actions.openReplace,
      openSetList: actions.openSetList,
      toggleSetList: actions.toggleSetList,
      printSetList: actions.printSetList,
      openSettings: () => {
        const settings = getSettingsDomain();
        if (settings && typeof settings.openSettings === "function") settings.openSettings();
      },
      openSettingsFolder: () => {
        const settings = getSettingsDomain();
        return settings && typeof settings.openSettingsFolder === "function"
          ? settings.openSettingsFolder()
          : undefined;
      },
      openTemplatesModal: actions.openTemplatesModal,
      renumberXInActiveFile: actions.renumberXInActiveFile,
      updateYouTubeMetadata: actions.updateYouTubeMetadata,
      requestCloseDocument: actions.requestCloseDocument,
      requestQuitApplication: actions.requestQuitApplication,
      resetLayout: actions.resetLayout,
      runPrintAction: actions.runPrintAction,
      runPrintAllAction: actions.runPrintAllAction,
      scanAndLoadLibrary: actions.scanAndLoadLibrary,
      shareLibraryWithMobile: actions.shareLibraryWithMobile,
      setNoteTypingPreview: setNoteTypingPreviewCommand,
      setSelectionLoop: setSelectionLoopCommand,
      setSplitOrientation: actions.setSplitOrientation,
      setStatus: actions.setStatus,
      showSaveError: actions.showSaveError,
      showToast: actions.showToast,
      toggleComment: toggleFocusedEditorComment,
      toggleFileHeader: actions.toggleFileHeader,
      toggleFocusMode: actions.toggleFocusMode,
      toggleLibrary: actions.toggleLibrary,
      togglePlayPauseEffective: actions.togglePlayPauseEffective,
      stopPlayback: actions.stopPlaybackTransport,
      toggleSplitOrientation: actions.toggleSplitOrientation,
      transportStartOver: actions.transportStartOver,
      wirePayloadMode: actions.wirePayloadMode,
      zoomIn: () => {
        const settings = getSettingsDomain();
        if (settings && typeof settings.zoomInFromMenu === "function") settings.zoomInFromMenu();
      },
      zoomOut: () => {
        const settings = getSettingsDomain();
        if (settings && typeof settings.zoomOutFromMenu === "function") settings.zoomOutFromMenu();
      },
      zoomReset: () => {
        const settings = getSettingsDomain();
        if (settings && typeof settings.zoomResetFromMenu === "function") settings.zoomResetFromMenu();
      },
    },
  });

  function wireMenu() {
    menuActionsController.wire();
    if (api && typeof api.onAppRequestQuit === "function") {
      api.onAppRequestQuit(() => {
        callAsync(actions.requestQuitApplication).catch(logError);
      });
    }
  }

  function wireEscStopShortcut() {
    if (!documentRef || typeof documentRef.addEventListener !== "function") return;
    documentRef.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      const el = event.target;
      const tag = el && el.tagName ? String(el.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || (el && el.isContentEditable)) return;
      event.preventDefault();
      call(actions.stopPlaybackTransport);
    });
  }

  function wireTopToolbar() {
    const {
      toggleLibraryButton,
      toggleSetListButton,
      libraryToolbarMenu,
      libraryCatalogButton,
      openFolderAsLibraryButton,
      libraryRefreshButton,
      scanErrorTunesButton,
      fileNewButton,
      newTuneButton,
      templatesButton,
      chordproPdfButton,
      fileOpenButton,
      fileSaveButton,
      fileCloseButton,
      toggleRawButton,
    } = elements;

    if (toggleLibraryButton) {
      toggleLibraryButton.addEventListener("click", () => {
        call(actions.toggleLibrary);
      });
    }
    if (toggleSetListButton) {
      toggleSetListButton.addEventListener("click", () => {
        call(actions.toggleSetList);
      });
    }

    const closeLibraryToolbarMenu = () => {
      if (libraryToolbarMenu) libraryToolbarMenu.open = false;
    };
    if (libraryCatalogButton) {
      libraryCatalogButton.addEventListener("click", () => {
        closeLibraryToolbarMenu();
        call(actions.openLibraryCatalog);
      });
    }
    if (openFolderAsLibraryButton) {
      openFolderAsLibraryButton.addEventListener("click", () => {
        closeLibraryToolbarMenu();
        guardedRun(actions.scanAndLoadLibrary);
      });
    }
    if (libraryToolbarMenu && documentRef) {
      documentRef.addEventListener("pointerdown", (event) => {
        if (!libraryToolbarMenu.open || libraryToolbarMenu.contains(event.target)) return;
        closeLibraryToolbarMenu();
      });
      documentRef.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !libraryToolbarMenu.open) return;
        closeLibraryToolbarMenu();
      });
    }

    if (libraryRefreshButton) {
      libraryRefreshButton.addEventListener("click", () => {
        guardedRun(actions.refreshLibraryIndex);
      });
    }

    if (scanErrorTunesButton) {
      scanErrorTunesButton.addEventListener("click", () => {
        const errors = getErrorsDomain();
        if (errors && typeof errors.handleScanButtonClick === "function") errors.handleScanButtonClick();
      });
    }

    if (fileNewButton) {
      fileNewButton.addEventListener("click", () => guardedRun(async () => {
        if (call(state.isPayloadMode)) { call(actions.showToast, "Exit Payload Mode to create a new file.", 2400); return; }
        if (!(await ensureRawCanLeave("creating a new file"))) return;
        await callAsync(actions.fileNew);
      }));
    }

    if (newTuneButton) {
      newTuneButton.addEventListener("click", () => guardedRun(async () => {
        if (call(state.isPayloadMode)) { call(actions.showToast, "Exit Payload Mode to create/append tunes.", 2400); return; }
        if (!(await ensureRawCanLeave("creating a new tune"))) return;
        await callAsync(actions.fileNewTune);
      }));
    }

    if (templatesButton) {
      templatesButton.addEventListener("click", () => guardedRun(async () => {
        if (call(state.isPayloadMode)) { call(actions.showToast, "Exit Payload Mode to use templates.", 2400); return; }
        if (!(await ensureRawCanLeave("opening templates"))) return;
        await callAsync(actions.openTemplatesModal);
      }));
    }

    if (chordproPdfButton) {
      chordproPdfButton.addEventListener("click", () => {
        callAsync(actions.exportChordProPdf).catch((error) => logError(error && error.message ? error.message : error));
      });
    }

    if (fileOpenButton) {
      fileOpenButton.addEventListener("click", () => guardedRun(async () => {
        if (call(state.isPayloadMode)) { call(actions.showToast, "Exit Payload Mode to open files.", 2400); return; }
        if (!(await ensureRawCanLeave("opening a file"))) return;
        await callAsync(actions.fileOpen);
      }));
    }

    if (fileSaveButton) {
      fileSaveButton.addEventListener("click", () => guardedRun(async () => {
        if (call(state.isPayloadMode)) { call(actions.showToast, "Payload Mode is diagnostics-only (no saves).", 2600); return; }
        await callAsync(actions.fileSave);
      }));
    }

    if (fileCloseButton) {
      fileCloseButton.addEventListener("click", () => guardedRun(async () => {
        if (call(state.isPayloadMode)) { call(actions.showToast, "Exit Payload Mode to close files.", 2400); return; }
        await callAsync(actions.fileClose);
      }));
    }

    if (toggleRawButton) {
      toggleRawButton.addEventListener("click", () => guardedRun(async () => {
        if (call(state.isPayloadMode)) { call(actions.showToast, "Exit Payload Mode to switch Raw mode.", 2400); return; }
        if (call(state.isChordProEnabled)) {
          call(actions.setChordProFullView, !call(state.isChordProFullView));
          return;
        }
        if (call(state.isRawModeActive)) await callAsync(actions.exitRawMode);
        else await callAsync(actions.enterRawMode);
      }, { setStatusOnError: true }));
    }
  }

  function wirePlaybackToolbar() {
    const {
      playPauseButton,
      playButton,
      pauseButton,
      stopButton,
      restartButton,
      prevMeasureButton,
      nextMeasureButton,
      settingsButton,
      resetLayoutButton,
      toggleSplitButton,
      toggleFollowButton,
      toggleErrorsButton,
      toggleGlobalsButton,
    } = elements;

    const guardRawPlayback = () => {
      if (!call(state.isRawModeActive)) return false;
      call(actions.showToast, "Raw mode: switch to tune mode to play.", 2200);
      return true;
    };

    if (playPauseButton) {
      playPauseButton.addEventListener("click", () => guardedRun(async () => {
        if (guardRawPlayback()) return;
        await callAsync(actions.togglePlayPauseEffective);
      }, { setStatusOnError: true }));
    }

    if (toggleSplitButton) {
      toggleSplitButton.addEventListener("click", () => {
        call(actions.toggleSplitOrientation, { userAction: true });
      });
    }

    if (playButton) {
      playButton.addEventListener("click", () => guardedRun(async () => {
        if (guardRawPlayback()) return;
        await callAsync(actions.transportPlay);
      }, { setStatusOnError: true }));
    }

    if (pauseButton) {
      pauseButton.addEventListener("click", () => guardedRun(async () => {
        if (guardRawPlayback()) return;
        await callAsync(actions.transportPause);
      }, { setStatusOnError: true }));
    }

    if (stopButton) {
      stopButton.addEventListener("click", () => call(actions.stopPlaybackTransport));
    }

    if (restartButton) {
      restartButton.addEventListener("click", () => guardedRun(actions.transportStartOver, { setStatusOnError: true }));
    }

    if (prevMeasureButton) {
      prevMeasureButton.addEventListener("click", () => guardedRun(() => actions.activateErrorByNav(-1), { setStatusOnError: true }));
    }

    if (nextMeasureButton) {
      nextMeasureButton.addEventListener("click", () => guardedRun(() => actions.activateErrorByNav(1), { setStatusOnError: true }));
    }

    if (settingsButton) {
      settingsButton.addEventListener("click", () => {
        const settings = getSettingsDomain();
        if (settings && typeof settings.openSettings === "function") settings.openSettings();
      });
    }

    if (resetLayoutButton) {
      resetLayoutButton.addEventListener("click", () => call(actions.resetLayout));
    }

    if (toggleFollowButton) {
      toggleFollowButton.addEventListener("click", () => guardedRun(async () => {
        if (api && typeof api.updateSettings === "function") {
          await api.updateSettings({ followPlayback: !call(state.getFollowPlayback) });
          return;
        }
        call(actions.setFollowPlayback, !call(state.getFollowPlayback));
        call(actions.updateFollowToggle);
      }));
    }

    if (toggleErrorsButton) {
      toggleErrorsButton.addEventListener("click", () => guardedRun(async () => {
        const next = !call(state.isErrorsEnabled);
        if (!next) {
          if (api && typeof api.updateSettings === "function") {
            api.updateSettings({ errorsEnabled: false }).catch(() => {});
          }
          call(actions.setErrorsEnabled, false, { triggerRefresh: false });
          return;
        }
        call(actions.setErrorsEnabled, true, { triggerRefresh: true });
        const errors = getErrorsDomain();
        if (errors && typeof errors.startScanFromToolbarEnable === "function") errors.startScanFromToolbarEnable();
      }));
    }

    if (toggleGlobalsButton) {
      toggleGlobalsButton.addEventListener("click", () => guardedRun(async () => {
        if (!api || typeof api.updateSettings !== "function") return;
        await api.updateSettings({ globalHeaderEnabled: !call(state.isGlobalHeaderEnabled) });
      }));
    }
  }

  function wire() {
    wireMenu();
    wireEscStopShortcut();
    wireTopToolbar();
    wirePlaybackToolbar();
  }

  return {
    dispatch: menuActionsController.dispatch,
    wire,
  };
}

export {
  createAppCommandsDomain,
};
