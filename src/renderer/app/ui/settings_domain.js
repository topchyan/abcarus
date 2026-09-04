import { initSettings } from "../../settings.js";
import {
  setEditorHelpFromSettings as applyEditorHelpSettings,
  setUiFontsFromSettings as applyUiFontSettings,
} from "./settings_applicator.js";
import { createSettingsRuntimeController } from "./settings_runtime_controller.js";

function createSettingsDomain({
  api = null,
  documentRef = typeof document !== "undefined" ? document : null,
  requestAnimationFrameRef = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0),
  state = {},
  elements = {},
  controllers = {},
  actions = {},
  helpers = {},
} = {}) {
  const settingsController = initSettings(api);
  let lastZoomShortcutAtMs = 0;

  const call = (fn, ...args) => (typeof fn === "function" ? fn(...args) : undefined);
  const latestSettings = () => call(state.getLatestSettings);

  function setUiFontsFromSettings(settings) {
    applyUiFontSettings({
      documentRef,
      settings,
      libraryTree: elements.libraryTree,
    });
  }

  function setEditorHelpFromSettings(settings) {
    applyEditorHelpSettings({
      settings,
      reconfigureEditor: actions.reconfigureEditor,
    });
  }

  function setGlobalHeaderFromSettings(settings) {
    if (controllers.headerLayers) controllers.headerLayers.setFromSettings(settings);
  }

  function setAbc2svgFontsFromSettings(settings) {
    if (controllers.headerLayers) controllers.headerLayers.setFromSettings(settings);
  }

  function setFollowFromSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    if (controllers.followHighlightSettings) controllers.followHighlightSettings.setFromSettings(settings);
    if (settings.followPlayback === undefined) return;
    call(state.setFollowPlayback, settings.followPlayback !== false);
    call(actions.updateFollowToggle);
  }

  function setLayoutFromSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    if (controllers.layout) controllers.layout.setFromSettings(settings);
  }

  function setPlaybackAutoScrollFromSettings(settings) {
    if (controllers.playbackAutoScroll) controllers.playbackAutoScroll.setFromSettings(settings);
  }

  function setLoopFromSettings(settings) {
    if (controllers.focusMode) controllers.focusMode.setLoopFromSettings(settings);
  }

  function setPrintAllFromSettings(settings) {
    if (controllers.printAll) controllers.printAll.applySettings(settings);
  }

  function setMidiFromSettings(settings) {
    if (controllers.midiInput) controllers.midiInput.applyMidiSettings(settings);
  }

  function setNoteTypingPreviewFromSettings(settings) {
    if (controllers.midiInput) controllers.midiInput.applyNoteTypingPreviewSettings(settings);
  }

  function setLibraryPrefsFromSettings(settings) {
    if (controllers.libraryUiDomain) controllers.libraryUiDomain.applyLibraryPrefsFromSettings(settings);
  }

  function setMicrotonalFromSettings(settings) {
    if (controllers.microtonal) controllers.microtonal.applySettings(settings);
  }

  function setSoundfontFromSettings(settings) {
    if (controllers.soundfont) controllers.soundfont.setFromSettings(settings);
  }

  function setDrumVelocityFromSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    const buildDefaultMap = helpers.buildDefaultDrumVelocityMap;
    const clampVelocity = helpers.clampVelocity;
    if (typeof buildDefaultMap !== "function" || typeof clampVelocity !== "function") return;
    const next = settings.drumVelocityMap;
    const base = buildDefaultMap();
    if (next && typeof next === "object") {
      for (const [key, value] of Object.entries(next)) {
        const pitch = Number(key);
        if (!Number.isFinite(pitch)) continue;
        base[pitch] = clampVelocity(value);
      }
    }
    call(state.setDrumVelocityMap, base);
  }

  function resetSoundfontCache() {
    if (controllers.soundfont) controllers.soundfont.resetCache();
  }

  function refreshHeaderLayers() {
    return controllers.headerLayers ? controllers.headerLayers.refreshHeaderLayers() : Promise.resolve();
  }

  function initRuntime() {
    return createSettingsRuntimeController({
      api,
      state: {
        getLatestSettings: state.getLatestSettings,
        setLatestSettings: state.setLatestSettings,
        getHeaderSignature: () => controllers.headerLayers ? controllers.headerLayers.getSettingsSignature() : "",
        getSoundfontName: () => controllers.soundfont ? controllers.soundfont.getName() : "",
        isPayloadMode: state.isPayloadMode,
        isChordProEnabled: state.isChordProEnabled,
      },
      actions: {
        applyUiFonts: setUiFontsFromSettings,
        applyEditorHelp: setEditorHelpFromSettings,
        applyGlobalHeader: setGlobalHeaderFromSettings,
        applyAbc2svgFonts: setAbc2svgFontsFromSettings,
        applySoundfont: setSoundfontFromSettings,
        applyDrumVelocity: setDrumVelocityFromSettings,
        applyMidiSettings: setMidiFromSettings,
        applyNoteTypingPreviewSettings: setNoteTypingPreviewFromSettings,
        applyLayout: setLayoutFromSettings,
        applyFollow: setFollowFromSettings,
        applyLoop: setLoopFromSettings,
        applyPlaybackAutoScroll: setPlaybackAutoScrollFromSettings,
        applyPrintAll: setPrintAllFromSettings,
        applyLibraryPrefs: setLibraryPrefsFromSettings,
        applyMicrotonalSettings: setMicrotonalFromSettings,
        ensureSoundfontLoaded: actions.ensureSoundfontLoaded,
        exitPayloadMode: actions.exitPayloadMode,
        logStartupPerf: actions.logStartupPerf,
        markStartupSettingsApplied: actions.markStartupSettingsApplied,
        refreshChordProPdfButtonState: actions.refreshChordProPdfButtonState,
        refreshHeaderLayers,
        resetSoundfontCache,
        resetPlaybackForSoundfontChange: actions.resetPlaybackForSoundfontChange,
        scheduleRender: actions.scheduleRender,
        scheduleStartupLayoutReset: actions.scheduleStartupLayoutReset,
        setHeaderFontDirs: (res) => {
          if (controllers.headerLayers) controllers.headerLayers.setFontDirs(res);
        },
        setLibraryPrefsWriteSuppressed: (next) => {
          if (controllers.libraryUiDomain) controllers.libraryUiDomain.setPrefsWriteSuppressed(next);
        },
        setSoundfontStatus: actions.setSoundfontStatus,
        showDisclaimerIfNeeded: actions.showDisclaimerIfNeeded,
        updateErrorsFeatureUi: actions.updateErrorsFeatureUi,
        updateGlobalHeaderToggle: actions.updateGlobalHeaderToggle,
        wirePayloadMode: actions.wirePayloadMode,
      },
    }).start();
  }

  function hasController() {
    return Boolean(settingsController);
  }

  function openSettings() {
    if (settingsController) settingsController.openSettings();
  }

  function openFontsSettings() {
    if (!settingsController) return;
    if (typeof settingsController.openTab === "function") settingsController.openTab("fonts");
    else settingsController.openSettings();
  }

  async function exportSettings() {
    if (!api || typeof api.exportSettings !== "function") {
      call(actions.showToast, "Export not available.", 2400);
      return;
    }
    const res = await api.exportSettings();
    if (res && res.ok) {
      const additions = [];
      if (res.exportedHeader) additions.push("Global Header");
      if (Number(res.exportedFonts) > 0) additions.push(`${Number(res.exportedFonts)} font file(s)`);
      const note = additions.length ? ` (incl. ${additions.join(", ")})` : "";
      call(actions.showToast, `Profile exported${note}.`, 4200);
    } else if (res && res.error && res.error !== "Canceled") {
      call(actions.showToast, String(res.error), 3200);
    }
  }

  async function importSettings() {
    if (!api || typeof api.importSettings !== "function") {
      call(actions.showToast, "Import not available.", 2400);
      return;
    }
    const res = await api.importSettings();
    if (res && res.ok) {
      call(
        actions.showToast,
        (res.importedHeader || Number(res.importedFonts) > 0)
          ? `Profile imported (incl. ${[
              res.importedHeader ? "Global Header" : "",
              Number(res.importedFonts) > 0 ? `${Number(res.importedFonts)} font file(s)` : "",
            ].filter(Boolean).join(", ")}).`
          : "Profile imported.",
        4200
      );
      Promise.resolve(refreshHeaderLayers()).catch(() => {});
    } else if (res && res.error && res.error !== "Canceled") {
      call(actions.showToast, String(res.error), 3200);
    }
  }

  async function openSettingsFolder() {
    if (!api || typeof api.openSettingsFolder !== "function") {
      call(actions.showToast, "Not available.", 2400);
      return;
    }
    const res = await api.openSettingsFolder();
    if (res && res.ok) call(actions.showToast, "Opened settings folder.", 2000);
  }

  function markZoomShortcut() {
    lastZoomShortcutAtMs = Date.now();
  }

  function shouldIgnoreMenuZoomAction() {
    return Date.now() - lastZoomShortcutAtMs < 150;
  }

  function setActivePaneFromTarget(target) {
    if (!settingsController) return;
    try {
      const renderPane = elements.renderPane;
      const editorDom = call(state.getEditorDom);
      if (renderPane && target && renderPane.contains(target)) settingsController.setActivePane("render");
      else if (editorDom && target && editorDom.contains(target)) settingsController.setActivePane("editor");
    } catch {}
  }

  function zoomResetFromMenu() {
    if (shouldIgnoreMenuZoomAction() || !settingsController) return;
    settingsController.zoomReset();
    requestAnimationFrameRef(() => call(actions.centerRenderPaneOnCurrentAnchor));
  }

  function zoomInFromMenu() {
    if (!shouldIgnoreMenuZoomAction() && settingsController) settingsController.zoomIn();
  }

  function zoomOutFromMenu() {
    if (!shouldIgnoreMenuZoomAction() && settingsController) settingsController.zoomOut();
  }

  async function resetLayout() {
    try {
      if (settingsController) {
        if (typeof settingsController.resetEditorZoom === "function") await settingsController.resetEditorZoom();
        else await settingsController.zoomReset();
      }
    } catch {
      // Layout reset should still complete if persisting editor zoom fails.
    }
    if (controllers.layout) controllers.layout.resetView();
  }

  function wireActivePaneTracking() {
    const editorDom = call(state.getEditorDom);
    if (settingsController && editorDom) {
      editorDom.addEventListener("focusin", () => {
        settingsController.setActivePane("editor");
      });
    }
    if (settingsController && elements.renderPane) {
      elements.renderPane.addEventListener("pointerdown", () => {
        settingsController.setActivePane("render");
      });
    }
  }

  function wireZoomShortcuts() {
    if (!documentRef || typeof documentRef.addEventListener !== "function") return;
    documentRef.addEventListener("keydown", (event) => {
      if (!settingsController) return;
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;
      const key = String(event.key || "");
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea") return;

      const isZoomIn = key === "+" || (key === "=" && event.shiftKey);
      const isZoomOut = key === "-" || key === "_";
      const isZoomReset = key === "0";
      if (!isZoomIn && !isZoomOut && !isZoomReset) return;

      event.preventDefault();
      event.stopPropagation();
      markZoomShortcut();
      setActivePaneFromTarget(target || documentRef.activeElement);
      if (isZoomIn) settingsController.zoomIn();
      else if (isZoomOut) settingsController.zoomOut();
      else {
        settingsController.zoomReset();
        requestAnimationFrameRef(() => call(actions.centerRenderPaneOnCurrentAnchor));
      }
    }, true);

    documentRef.addEventListener("wheel", (event) => {
      if (!settingsController) return;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setActivePaneFromTarget(event.target);
      const direction = event.deltaY > 0 ? -1 : 1;
      if (direction > 0) settingsController.zoomIn();
      else settingsController.zoomOut();
    }, { passive: false });
  }

  function start() {
    initRuntime();
    wireActivePaneTracking();
    wireZoomShortcuts();
  }

  return {
    controller: settingsController,
    exportSettings,
    hasController,
    importSettings,
    openFontsSettings,
    openSettings,
    openSettingsFolder,
    refreshHeaderLayers,
    resetLayout,
    shouldIgnoreMenuZoomAction,
    start,
    zoomInFromMenu,
    zoomOutFromMenu,
    zoomResetFromMenu,
  };
}

export {
  createSettingsDomain,
};
