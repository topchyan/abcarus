function createSettingsRuntimeController({
  api,
  state = {},
  actions = {},
} = {}) {
  function call(name, ...args) {
    const fn = actions && actions[name];
    return typeof fn === "function" ? fn(...args) : undefined;
  }

  function getLatestSettings() {
    return typeof state.getLatestSettings === "function" ? state.getLatestSettings() : null;
  }

  function setLatestSettings(settings) {
    if (typeof state.setLatestSettings === "function") state.setLatestSettings(settings || null);
  }

  function getHeaderSignature() {
    return typeof state.getHeaderSignature === "function" ? state.getHeaderSignature() : "";
  }

  function getSoundfontName() {
    return typeof state.getSoundfontName === "function" ? state.getSoundfontName() : "";
  }

  function applyCommonSettings(settings) {
    call("applyUiFonts", settings);
    call("applyEditorHelp", settings);
    call("applyGlobalHeader", settings);
    call("applyAbc2svgFonts", settings);
    call("applySoundfont", settings);
    call("applySoundfontNoteFade", settings);
    call("applyDrumVelocity", settings);
    call("applyMidiSettings", settings);
    call("applyNoteTypingPreviewSettings", settings);
    call("applyLayout", settings);
    call("applyFollow", settings);
    call("applyLoop", settings);
    call("applyPlaybackAutoScroll", settings);
    call("applyPrintAll", settings);
    call("applyLibraryPrefs", settings);
    call("applyMicrotonalSettings", settings);
    call("updateGlobalHeaderToggle");
    call("updateErrorsFeatureUi");
    Promise.resolve(call("refreshHeaderLayers")).catch(() => {});
  }

  function applyPayloadModeSettings(settings, { allowExit = true } = {}) {
    try {
      const enabled = Boolean(settings && settings.payloadModeEnabled);
      if (enabled) call("wirePayloadMode");
      if (allowExit && !enabled && state.isPayloadMode && state.isPayloadMode()) {
        Promise.resolve(call("exitPayloadMode")).catch(() => {});
      }
    } catch {}
  }

  function maybeRefreshChordProPdf(prevSettings, settings) {
    if (!(state.isChordProEnabled && state.isChordProEnabled())) return;
    const prevBin = prevSettings && prevSettings.chordproBinPath ? String(prevSettings.chordproBinPath) : "";
    const prevRepo = prevSettings && prevSettings.chordproRepoPath ? String(prevSettings.chordproRepoPath) : "";
    const nextBin = settings && settings.chordproBinPath ? String(settings.chordproBinPath) : "";
    const nextRepo = settings && settings.chordproRepoPath ? String(settings.chordproRepoPath) : "";
    if (nextBin !== prevBin || nextRepo !== prevRepo) {
      Promise.resolve(call("refreshChordProPdfButtonState", { force: true })).catch(() => {});
    }
  }

  function maybeReloadSoundfont(prevSoundfont) {
    if (prevSoundfont === getSoundfontName()) return;
    call("resetSoundfontCache");
    call("resetPlaybackForSoundfontChange");
    Promise.resolve(call("ensureSoundfontLoaded"))
      .then(() => call("prewarmCurrentTune"))
      .catch(() => {
        call("setSoundfontStatus", "Soundfont load failed", 5000);
      });
  }

  async function loadInitialSettings() {
    if (!api || typeof api.getSettings !== "function") {
      call("markStartupSettingsApplied");
      return;
    }
    call("logStartupPerf", "getSettings() start");
    try {
      const settings = await api.getSettings();
      call("logStartupPerf", "getSettings() done", { hasSettings: Boolean(settings) });
      if (settings) {
        const prevSoundfont = getSoundfontName();
        setLatestSettings(settings);
        call("logStartupPerf", "apply settings: begin");
        applyCommonSettings(settings);
        applyPayloadModeSettings(settings, { allowExit: false });
        call("showDisclaimerIfNeeded", settings);
        call("scheduleStartupLayoutReset");
        call("logStartupPerf", "apply settings: end");
        if (prevSoundfont !== getSoundfontName()) {
          maybeReloadSoundfont(prevSoundfont);
        } else {
          Promise.resolve(call("ensureSoundfontLoaded")).catch(() => {
            call("setSoundfontStatus", "Soundfont load failed", 5000);
          });
        }
        call("markStartupSettingsApplied");
      }
      call("setLibraryPrefsWriteSuppressed", false);
      if (!settings) call("markStartupSettingsApplied");
    } catch {
      call("setLibraryPrefsWriteSuppressed", false);
      call("markStartupSettingsApplied");
    }
  }

  function loadFontDirs() {
    if (!api || typeof api.getFontDirs !== "function") return;
    api.getFontDirs().then((res) => {
      if (res && res.ok) call("setHeaderFontDirs", res);
    }).catch(() => {});
  }

  function wireSettingsChanged() {
    if (!api || typeof api.onSettingsChanged !== "function") return;
    api.onSettingsChanged((settings) => {
      const prevSettings = getLatestSettings();
      setLatestSettings(settings || null);
      const prevHeader = getHeaderSignature();
      const prevSoundfont = getSoundfontName();
      applyCommonSettings(settings);
      applyPayloadModeSettings(settings, { allowExit: true });
      call("showDisclaimerIfNeeded", settings);
      if (settings && prevHeader !== getHeaderSignature()) call("scheduleRender");
      maybeReloadSoundfont(prevSoundfont);
      maybeRefreshChordProPdf(prevSettings, settings);
    });
  }

  function start() {
    loadInitialSettings();
    loadFontDirs();
    wireSettingsChanged();
  }

  return {
    applyCommonSettings,
    loadFontDirs,
    loadInitialSettings,
    start,
    wireSettingsChanged,
  };
}

export {
  createSettingsRuntimeController,
};
