import {
  EditorView,
  EditorState,
  basicSetup,
  indentUnit,
} from "../../third_party/codemirror/cm.js";

const DEFAULT_SETTINGS = {
  renderZoom: 1,
  editorZoom: 1,
  editorFontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  editorFontSize: 13,
  editorNotesBold: true,
  editorLyricsBold: true,
  abc2xmlArgs: "",
  xml2abcArgs: "",
  globalHeaderText: "",
  globalHeaderEnabled: true,
  soundfontName: "TimGM6mb.sf2",
  followPlayback: true,
};

const ZOOM_STEP = 0.1;

export function initSettings(api) {
  const $settingsModal = document.getElementById("settingsModal");
  const $settingsClose = document.getElementById("settingsClose");
  const $settingsReset = document.getElementById("settingsReset");
  const $settingsRenderZoom = document.getElementById("settingsRenderZoom");
  const $settingsEditorZoom = document.getElementById("settingsEditorZoom");
  const $settingsFontFamily = document.getElementById("settingsFontFamily");
  const $settingsFontSize = document.getElementById("settingsFontSize");
  const $settingsNotesBold = document.getElementById("settingsNotesBold");
  const $settingsLyricsBold = document.getElementById("settingsLyricsBold");
  const $settingsAbc2xmlArgs = document.getElementById("settingsAbc2xmlArgs");
  const $settingsXml2abcArgs = document.getElementById("settingsXml2abcArgs");
  const $settingsGlobalHeader = document.getElementById("settingsGlobalHeader");
  const $settingsGlobalHeaderEnabled = document.getElementById("settingsGlobalHeaderEnabled");
  const $settingsSoundfont = document.getElementById("settingsSoundfont");
  const $settingsTabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
  const $settingsPanels = Array.from(document.querySelectorAll("[data-settings-panel]"));
  const $renderPane = document.querySelector(".render-pane");
  const $editorPane = document.querySelector(".editor-pane");

  let currentSettings = { ...DEFAULT_SETTINGS };
  let activePane = "render";
  let globalHeaderView = null;
  let suppressGlobalUpdate = false;
  let globalUpdateTimer = null;
  let soundfontOptionsLoaded = false;
  let soundfontOptionsLoading = null;

  function setGlobalHeaderValue(text) {
    if (!globalHeaderView) return;
    const next = String(text || "");
    const doc = globalHeaderView.state.doc.toString();
    if (doc === next) return;
    suppressGlobalUpdate = true;
    globalHeaderView.dispatch({
      changes: { from: 0, to: globalHeaderView.state.doc.length, insert: next },
    });
    suppressGlobalUpdate = false;
  }

  function applySettings(settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...settings };
    const root = document.documentElement.style;
    root.setProperty("--editor-font-family", currentSettings.editorFontFamily);
    root.setProperty("--editor-font-size", `${currentSettings.editorFontSize}px`);
    root.setProperty("--editor-notes-weight", currentSettings.editorNotesBold ? "600" : "400");
    root.setProperty("--editor-lyrics-weight", currentSettings.editorLyricsBold ? "600" : "400");
    root.setProperty("--render-zoom", String(currentSettings.renderZoom));
    root.setProperty("--editor-zoom", String(currentSettings.editorZoom));

    if ($settingsRenderZoom) {
      $settingsRenderZoom.value = String(Math.round(currentSettings.renderZoom * 100));
    }
    if ($settingsEditorZoom) {
      $settingsEditorZoom.value = String(Math.round(currentSettings.editorZoom * 100));
    }
    if ($settingsFontFamily) $settingsFontFamily.value = currentSettings.editorFontFamily;
    if ($settingsFontSize) $settingsFontSize.value = String(currentSettings.editorFontSize);
    if ($settingsNotesBold) $settingsNotesBold.checked = !!currentSettings.editorNotesBold;
    if ($settingsLyricsBold) $settingsLyricsBold.checked = !!currentSettings.editorLyricsBold;
    if ($settingsAbc2xmlArgs) $settingsAbc2xmlArgs.value = currentSettings.abc2xmlArgs || "";
    if ($settingsXml2abcArgs) $settingsXml2abcArgs.value = currentSettings.xml2abcArgs || "";
    if ($settingsGlobalHeaderEnabled) $settingsGlobalHeaderEnabled.checked = currentSettings.globalHeaderEnabled !== false;
    setGlobalHeaderValue(currentSettings.globalHeaderText || "");
    if ($settingsSoundfont) {
      if (!soundfontOptionsLoaded) {
        loadSoundfontOptions();
      }
      $settingsSoundfont.value = currentSettings.soundfontName || DEFAULT_SETTINGS.soundfontName;
    }
  }

  async function loadSoundfontOptions(force) {
    if (!$settingsSoundfont) return;
    if (soundfontOptionsLoading && !force) return soundfontOptionsLoading;
    if (force) {
      soundfontOptionsLoading = null;
      soundfontOptionsLoaded = false;
    }
    soundfontOptionsLoading = (async () => {
      let fonts = [];
      if (api && typeof api.listSoundfonts === "function") {
        try {
          const list = await api.listSoundfonts();
          if (Array.isArray(list)) fonts = list;
        } catch {}
      }
      const fallback = DEFAULT_SETTINGS.soundfontName;
      const current = currentSettings.soundfontName || fallback;
      if (current && !fonts.includes(current)) fonts.unshift(current);
      if (!fonts.includes(fallback)) fonts.unshift(fallback);
      const seen = new Set();
      $settingsSoundfont.textContent = "";
      for (const name of fonts) {
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        $settingsSoundfont.appendChild(option);
      }
      soundfontOptionsLoaded = true;
      $settingsSoundfont.value = current;
    })();
    return soundfontOptionsLoading;
  }

  async function updateSettings(patch) {
    if (!api || typeof api.updateSettings !== "function") return;
    const next = await api.updateSettings(patch);
    if (next) applySettings(next);
  }

  function openSettings() {
    if (!$settingsModal) return;
    $settingsModal.classList.add("open");
    $settingsModal.setAttribute("aria-hidden", "false");
    loadSoundfontOptions(true);
  }

  function closeSettings() {
    if (!$settingsModal) return;
    $settingsModal.classList.remove("open");
    $settingsModal.setAttribute("aria-hidden", "true");
  }

  function zoomBy(delta) {
    if (activePane === "editor") {
      const nextZoom = (currentSettings.editorZoom || 1) + delta;
      updateSettings({ editorZoom: nextZoom });
    } else {
      const nextZoom = (currentSettings.renderZoom || 1) + delta;
      updateSettings({ renderZoom: nextZoom });
    }
  }

  function zoomReset() {
    updateSettings({ renderZoom: 1, editorZoom: 1 });
  }

  if ($settingsClose) {
    $settingsClose.addEventListener("click", () => {
      closeSettings();
    });
  }

  if ($settingsModal) {
    $settingsModal.addEventListener("click", (e) => {
      if (e.target === $settingsModal) closeSettings();
    });
  }

  if ($settingsReset) {
    $settingsReset.addEventListener("click", () => {
      updateSettings({ ...DEFAULT_SETTINGS });
    });
  }

  if ($settingsRenderZoom) {
    $settingsRenderZoom.addEventListener("change", () => {
      const value = Number($settingsRenderZoom.value || 100);
      updateSettings({ renderZoom: value / 100 });
    });
  }

  if ($settingsEditorZoom) {
    $settingsEditorZoom.addEventListener("change", () => {
      const value = Number($settingsEditorZoom.value || 100);
      updateSettings({ editorZoom: value / 100 });
    });
  }

  if ($settingsFontFamily) {
    $settingsFontFamily.addEventListener("change", () => {
      updateSettings({
        editorFontFamily: $settingsFontFamily.value || DEFAULT_SETTINGS.editorFontFamily,
      });
    });
  }

  if ($settingsFontSize) {
    $settingsFontSize.addEventListener("change", () => {
      updateSettings({
        editorFontSize: Number($settingsFontSize.value || DEFAULT_SETTINGS.editorFontSize),
      });
    });
  }

  if ($settingsNotesBold) {
    $settingsNotesBold.addEventListener("change", () => {
      updateSettings({ editorNotesBold: $settingsNotesBold.checked });
    });
  }

  if ($settingsLyricsBold) {
    $settingsLyricsBold.addEventListener("change", () => {
      updateSettings({ editorLyricsBold: $settingsLyricsBold.checked });
    });
  }

  if ($settingsAbc2xmlArgs) {
    $settingsAbc2xmlArgs.addEventListener("change", () => {
      updateSettings({ abc2xmlArgs: $settingsAbc2xmlArgs.value || "" });
    });
  }

  if ($settingsXml2abcArgs) {
    $settingsXml2abcArgs.addEventListener("change", () => {
      updateSettings({ xml2abcArgs: $settingsXml2abcArgs.value || "" });
    });
  }

  if ($settingsSoundfont) {
    $settingsSoundfont.addEventListener("change", () => {
      updateSettings({ soundfontName: $settingsSoundfont.value || DEFAULT_SETTINGS.soundfontName });
    });
  }

  if ($settingsGlobalHeaderEnabled) {
    $settingsGlobalHeaderEnabled.addEventListener("change", () => {
      updateSettings({ globalHeaderEnabled: $settingsGlobalHeaderEnabled.checked });
    });
  }

  if ($settingsGlobalHeader && !globalHeaderView) {
    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged || suppressGlobalUpdate) return;
      if (globalUpdateTimer) clearTimeout(globalUpdateTimer);
      globalUpdateTimer = setTimeout(() => {
        if (!globalHeaderView) return;
        const text = globalHeaderView.state.doc.toString();
        updateSettings({ globalHeaderText: text });
      }, 400);
    });
    const state = EditorState.create({
      doc: currentSettings.globalHeaderText || "",
      extensions: [
        basicSetup,
        updateListener,
        EditorState.tabSize.of(2),
        indentUnit.of("  "),
      ],
    });
    globalHeaderView = new EditorView({
      state,
      parent: $settingsGlobalHeader,
    });
  }

  if ($settingsTabs.length && $settingsPanels.length) {
    const setActiveTab = (name) => {
      $settingsTabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.settingsTab === name);
      });
      $settingsPanels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.settingsPanel === name);
      });
    };
    $settingsTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        setActiveTab(tab.dataset.settingsTab);
      });
    });
    setActiveTab("main");
  }

  if (api && typeof api.onSettingsChanged === "function") {
    api.onSettingsChanged((settings) => {
      if (settings) applySettings(settings);
    });
  }

  if ($renderPane) {
    $renderPane.addEventListener("pointerdown", () => {
      activePane = "render";
    });
  }

  if ($editorPane) {
    $editorPane.addEventListener("pointerdown", () => {
      activePane = "editor";
    });
  }

  (async () => {
    if (api && typeof api.getSettings === "function") {
      const settings = await api.getSettings();
      if (settings) applySettings(settings);
    }
  })();

  return {
    openSettings,
    closeSettings,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    zoomReset,
    setActivePane: (pane) => { activePane = pane; },
  };
}
