function createPlaybackUiController({
  elements = {},
  state = {},
  actions = {},
} = {}) {
  const {
    renderPane = null,
    playButton = null,
    pauseButton = null,
    playPauseButton = null,
    stopButton = null,
    resetLayoutButton = null,
    focusModeButton = null,
    toggleLibraryButton = null,
    toggleSetListButton = null,
    libraryRefreshButton = null,
    libraryClearFilterButton = null,
    groupBySelect = null,
    sortBySelect = null,
    sortTunesBySelect = null,
    librarySearchInput = null,
    tuneSelect = null,
    fileNewButton = null,
    fileOpenButton = null,
    fileSaveButton = null,
    fileCloseButton = null,
    toggleRawButton = null,
    toggleErrorsButton = null,
    toggleFollowButton = null,
    toggleGlobalsButton = null,
    fileHeaderToggle = null,
    fileHeaderSaveButton = null,
    fileHeaderReloadButton = null,
    practiceTempoInput = null,
    practiceLoopEnabled = null,
    practiceLoopFrom = null,
    practiceLoopTo = null,
    selectionSuppressEnabled = null,
    selectionGchordsEnabled = null,
    selectionDrumsEnabled = null,
    selectionMutedVoices = null,
    settingsButton = null,
    xIssuesAutoFixButton = null,
    xIssuesJumpButton = null,
    xIssuesCopyButton = null,
    xIssuesCloseButton = null,
  } = elements;

  const {
    transport = null,
    selectionRuntime = null,
    getEditorView = () => null,
    getIsPlaying = () => false,
    getIsPaused = () => false,
    getWaitingForFirstNote = () => false,
    getFollowPlayback = () => false,
    isChordProEnabled = () => false,
    isChordProFullView = () => false,
  } = state;

  const {
    setButtonText = (button, text) => { if (button) button.textContent = String(text || ""); },
    recordDebugLog = () => {},
    scheduleAutoDump = () => {},
    logPlaybackGuardError = () => {},
    setStatus = () => {},
    clearNoteSelection = () => {},
    resetPlaybackUiState = () => {},
    clearSvgPlayhead = () => {},
    clearSvgFollowBarHighlight = () => {},
    clearSvgFollowMeasureHighlight = () => {},
    updateAbUi = () => {},
    updatePracticeUi = () => {},
  } = actions;

  let renderBusy = false;

  function isPlaybackBusy() {
    return Boolean(getIsPlaying() || getIsPaused() || getWaitingForFirstNote());
  }

  function setRenderBusy(next) {
    renderBusy = Boolean(next);
    try {
      if (renderPane) renderPane.classList.toggle("is-rendering", renderBusy);
    } catch {}
  }

  function updatePlayButton() {
    const isPlaying = Boolean(getIsPlaying());
    const isPaused = Boolean(getIsPaused());
    const waitingForFirstNote = Boolean(getWaitingForFirstNote());

    if (playButton) {
      playButton.classList.toggle("active", isPlaying);
      playButton.disabled = false;
    }
    if (pauseButton) {
      pauseButton.classList.toggle("active", isPaused);
      pauseButton.disabled = !(isPlaying || isPaused);
    }
    if (stopButton) {
      stopButton.disabled = !(isPlaying || isPaused || waitingForFirstNote);
    }
    if (playPauseButton) {
      playPauseButton.classList.toggle("active", Boolean(isPlaying || isPaused));
      playPauseButton.disabled = false;
      playPauseButton.classList.toggle("is-playing", isPlaying);
      if (isPlaying) setButtonText(playPauseButton, "Pause");
      else if (isPaused) setButtonText(playPauseButton, "Resume");
      else setButtonText(playPauseButton, "Play");
    }
    updatePlaybackInteractionLock();
    updatePracticeUi();
    updateAbUi();
  }

  function updatePlaybackInteractionLock() {
    const busy = isPlaybackBusy();
    const disable = (el, allowWhileBusy = false) => {
      if (!el) return;
      el.disabled = busy && !allowWhileBusy;
    };

    disable(playButton, true);
    disable(pauseButton, true);
    disable(playPauseButton, true);
    disable(stopButton, true);
    disable(resetLayoutButton, true);
    disable(focusModeButton, true);

    disable(toggleLibraryButton);
    disable(toggleSetListButton);
    disable(libraryRefreshButton);
    disable(libraryClearFilterButton);
    disable(groupBySelect);
    disable(sortBySelect);
    disable(sortTunesBySelect);
    disable(librarySearchInput);
    disable(tuneSelect);

    disable(fileNewButton);
    disable(fileOpenButton);
    disable(fileSaveButton);
    disable(fileCloseButton);
    disable(toggleRawButton);

    disable(toggleErrorsButton);
    disable(toggleFollowButton);
    disable(toggleGlobalsButton);
    disable(fileHeaderToggle);
    disable(fileHeaderSaveButton);
    disable(fileHeaderReloadButton);

    disable(practiceTempoInput, true);
    disable(practiceLoopEnabled);
    disable(practiceLoopFrom);
    disable(practiceLoopTo);
    disable(selectionSuppressEnabled);
    disable(selectionGchordsEnabled);
    disable(selectionDrumsEnabled);
    disable(selectionMutedVoices);

    disable(settingsButton);

    disable(xIssuesAutoFixButton);
    disable(xIssuesJumpButton);
    disable(xIssuesCopyButton);
    disable(xIssuesCloseButton, true);

    updateAbUi();

    if (isChordProEnabled() && isChordProFullView()) {
      if (playButton) playButton.disabled = true;
      if (pauseButton) pauseButton.disabled = true;
      if (playPauseButton) playPauseButton.disabled = true;
      if (stopButton) stopButton.disabled = true;
      if (toggleFollowButton) toggleFollowButton.disabled = true;
      if (toggleErrorsButton) toggleErrorsButton.disabled = true;
    }
  }

  function handlePlaybackGuardStop(message) {
    if (!transport || typeof transport.resetAfterGuardStop !== "function") return;
    const result = transport.resetAfterGuardStop(message);
    try { recordDebugLog("warn", [`Playback guard: ${transport.lastPlaybackGuardMessage}`]); } catch {}
    try { reportPlaybackGuardError(message); } catch {}
    try { scheduleAutoDump("playback-guard", transport.lastPlaybackGuardMessage); } catch {}
    setStatus("OK");
    updatePlayButton();
    clearNoteSelection();
    resetPlaybackUiState();
    if (
      result
      && result.wasSelectionOrigin
      && selectionRuntime
      && typeof selectionRuntime.restoreSelection === "function"
    ) {
      selectionRuntime.restoreSelection(getEditorView());
    }
    if (selectionRuntime && typeof selectionRuntime.clearSelectionCapture === "function") {
      selectionRuntime.clearSelectionCapture();
    }
  }

  function reportPlaybackGuardError(message) {
    logPlaybackGuardError(message);
  }

  function updateFollowToggle() {
    if (!toggleFollowButton) return;
    const enabled = Boolean(getFollowPlayback());
    toggleFollowButton.classList.toggle("toggle-active", enabled);
    setButtonText(toggleFollowButton, "Follow");
    toggleFollowButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    if (!enabled) {
      clearSvgPlayhead();
      clearSvgFollowBarHighlight();
      clearSvgFollowMeasureHighlight();
    }
  }

  return {
    handlePlaybackGuardStop,
    isPlaybackBusy,
    reportPlaybackGuardError,
    setRenderBusy,
    updateFollowToggle,
    updatePlayButton,
    updatePlaybackInteractionLock,
  };
}

export {
  createPlaybackUiController,
};
