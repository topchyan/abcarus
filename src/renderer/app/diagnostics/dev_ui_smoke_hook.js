function installDevUiSmokeHook({
  windowRef = typeof window !== "undefined" ? window : null,
  devConfig = {},
  setEditorText = () => {},
  setCleanDocument = null,
  getEditorText = () => "",
  scheduleRender = () => {},
  getState = () => ({}),
  elements = {},
  getHasSvg = () => false,
  getPlaybackDebug = () => null,
  clickPlay = () => {},
  clickStop = () => {},
  clickClose = () => {},
  setPayloadTuneIdentity = () => {},
  dispatchAction = async () => {},
  setPayloadModeSettingEnabled = () => {},
  setRightPaneSize = () => {},
} = {}) {
  if (!windowRef || !devConfig || devConfig.ABCARUS_DEV_UI_SMOKE !== "1") return false;
  windowRef.__abcarusDevUiSmoke = {
    setText: (text) => {
      setEditorText(String(text || ""));
      scheduleRender();
    },
    setCleanDocument: (text) => {
      if (typeof setCleanDocument === "function") setCleanDocument(String(text || ""));
      else setEditorText(String(text || ""));
      scheduleRender();
    },
    getText: () => getEditorText(),
    scheduleRender,
    clickPlay,
    clickStop,
    clickClose,
    preparePayloadTune: (text) => {
      const content = String(text || "");
      if (typeof setCleanDocument === "function") setCleanDocument(content);
      else setEditorText(content);
      setPayloadTuneIdentity();
    },
    dispatchAction,
    setPayloadModeSettingEnabled,
    setRightPaneSize,
    snapshot: () => {
      const state = getState() || {};
      const playButton = elements.playButton || null;
      const stopButton = elements.stopButton || null;
      const closeButton = elements.closeButton || null;
      const status = elements.status || null;
      const toast = elements.toast || null;
      const tuneSelect = elements.tuneSelect || null;
      return {
        isPlaying: Boolean(state.isPlaying),
        isPaused: Boolean(state.isPaused),
        waitingForFirstNote: Boolean(state.waitingForFirstNote),
        playbackStartArmed: Boolean(state.playbackStartArmed),
        playText: playButton ? String(playButton.textContent || "").trim() : "",
        playActive: playButton ? playButton.classList.contains("active") : false,
        playDisabled: playButton ? Boolean(playButton.disabled) : true,
        stopDisabled: stopButton ? Boolean(stopButton.disabled) : true,
        closeDisabled: closeButton ? Boolean(closeButton.disabled) : true,
        status: status ? String(status.textContent || "").trim() : "",
        toast: toast ? String(toast.textContent || "").trim() : "",
        editorText: getEditorText(),
        hasSvg: Boolean(getHasSvg()),
        tuneSelectDisabled: tuneSelect ? Boolean(tuneSelect.disabled) : true,
        tuneSelectValue: tuneSelect ? String(tuneSelect.value || "") : "",
        tuneSelectText: tuneSelect ? String(tuneSelect.textContent || "").trim() : "",
        playbackDebug: getPlaybackDebug(),
        soundfont: state.soundfont || null,
        payloadMode: Boolean(state.payloadMode),
        selection: state.selection || null,
        payloadBarHidden: elements.payloadBar
          ? elements.payloadBar.classList.contains("hidden")
          : true,
      };
    },
  };
  return true;
}

export {
  installDevUiSmokeHook,
};
