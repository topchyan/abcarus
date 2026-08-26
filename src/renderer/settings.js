/*
SETTINGS UX (maintainer summary)
- Changes are staged while Settings is open; `Apply`/`OK` commits via `store.update`, `Cancel` discards.
- Global Header is an external ABC file and is saved directly after edits.
- Search filters across all Settings pages, narrows the left nav, and opens the only matching page automatically.
- Advanced settings render in the same page as regular settings.
- “Reset Section…” resets only the active section keys to schema defaults.
*/

import {
  EditorView,
  EditorState,
  basicSetup,
  indentUnit,
  rectangularSelection,
} from "../../third_party/codemirror/cm.js";
import { createSettingsStore } from "./settings_store.js";
import { createSettingsFolderControl } from "./app/ui/settings_folder_control.js";
import {
  buildUserFontFaceCss,
  createInterfaceFontControl,
  getCatalogUserFontFiles as collectCatalogUserFontFiles,
  interfaceFontFamilyForFile as buildInterfaceFontFamily,
  isSoundfontPath,
  normalizeFontCatalog,
  normalizeEditorFontFamily,
  normalizeUserFontFiles,
  settingsPatchForRemovedUserFont as buildRemovedFontSettingsPatch,
  safeBasename,
  toFileUrl,
  userFontFileFromFamily,
} from "./app/ui/font_settings_model.js";

const ZOOM_STEP = 0.1;
const SETTINGS_UI_STATE_KEY = "abcarus.settings.uiState.v1";
const rectSelectionExt = rectangularSelection({
  eventFilter: (event) => Boolean(
    event
    && event.button === 0
    && (
      event.altKey
      || (event.ctrlKey && event.shiftKey)
    )
  ),
});
const SETTINGS_SECTION_HINTS = {
  general: "General application settings.",
  playback: "Playback behavior and visuals.",
  editor: "Editing, notation, and note-entry behavior.",
  fonts: "Fonts and soundfonts used for UI, editor, rendering, and playback.",
  library: "Library organization, templates, and tune handling.",
  print: "Print and PDF output options.",
  importexport: "MusicXML, MIDI, ChordPro, and conversion behavior.",
  header: "Global ABC directives prepended during render/playback.",
  microtonal: "Makam, perde, and EDO-53 notation support.",
  advanced: "Less frequently used compatibility and diagnostic options.",
};

const SETTINGS_PANEL_KEYS = {
  editor: new Set([
    "editorHelpEnabled",
    "useNativeTranspose",
    "autoAlignBarsAfterTransforms",
    "midiInputEnabled",
    "midiInputMuted",
    "midiInputKeyAware",
    "midiInputGrid",
    "midiInputMacroEnabled",
    "midiInputBeepEnabled",
    "midiInputBeepVolume",
    "midiInputBeepDuration",
    "noteTypingPreviewEnabled",
    "noteTypingPreviewVolume",
    "noteTypingPreviewLengthMode",
    "noteTypingPreviewTrigger",
    "noteTypingPreviewEnvelope",
    "noteTypingPreviewRetriggerDuration",
    "noteTypingPreviewSkipMicrotones",
  ]),
  importExport: new Set([
    "abc2xmlArgs",
    "xml2abcArgs",
    "stripImportedMeasureComments",
    "autoFormatImportedAbc",
    "midiImportBackend",
    "midi2abcArgs",
    "mp3ExportTimidityPath",
    "mp3ExportFfmpegPath",
    "chordproBinPath",
    "chordproRepoPath",
  ]),
  microtonal: new Set(["supportMicrotonalNotation"]),
  advanced: new Set(["payloadModeEnabled"]),
};

function settingsEntryBelongsToPanel(entry, panelKey, sectionName) {
  const key = String(entry && entry.key || "");
  for (const [candidate, keys] of Object.entries(SETTINGS_PANEL_KEYS)) {
    if (keys.has(key)) return candidate.toLowerCase() === String(panelKey || "").toLowerCase();
  }
  if (panelKey === "general") return sectionName === "General" || sectionName === "Dialogs";
  return sectionName.toLowerCase() === panelKey.toLowerCase();
}

const FALLBACK_SCHEMA = [
  { key: "renderZoom", type: "number", default: 1, section: "General", label: "Score zoom (%)", ui: { input: "percent", min: 50, max: 800, step: 5 } },
  { key: "editorZoom", type: "number", default: 1, section: "General", label: "Editor zoom (%)", ui: { input: "percent", min: 50, max: 800, step: 5 } },
  { key: "editorHelpEnabled", type: "boolean", default: true, section: "General", group: "Editor Help", groupOrder: 30, label: "Enable editor help", ui: { input: "checkbox" } },
  { key: "uiFontFamily", type: "string", default: "system-ui, -apple-system, \"Segoe UI\", Roboto, Ubuntu, Cantarell, \"Noto Sans\", sans-serif", section: "Fonts", group: "Interface", label: "Font family", ui: { input: "select", options: "interfaceFonts" } },
  { key: "uiFontSize", type: "number", default: 13, section: "Fonts", group: "Interface", label: "Font size", ui: { input: "number", min: 10, max: 28, step: 1 } },
  { key: "libraryUiFontFamily", type: "string", default: "system-ui, -apple-system, \"Segoe UI\", Roboto, Ubuntu, Cantarell, \"Noto Sans\", sans-serif", section: "Fonts", group: "Interface", label: "Library font family", ui: { input: "select", options: "interfaceFonts" } },
  { key: "libraryUiFontSize", type: "number", default: 12, section: "Fonts", group: "Interface", label: "Library font size", ui: { input: "number", min: 10, max: 40, step: 1 } },
  { key: "editorFontFamily", type: "string", default: "\"ABCarus DejaVu Sans Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", section: "Fonts", group: "Editor", label: "Font family", ui: { input: "text" } },
  { key: "editorFontSize", type: "number", default: 13, section: "Fonts", group: "Editor", label: "Font size", ui: { input: "number", min: 8, max: 32, step: 1 } },
  { key: "editorNotesBold", type: "boolean", default: true, section: "Fonts", group: "Editor", label: "Notes", ui: { input: "checkbox" } },
  { key: "editorLyricsBold", type: "boolean", default: true, section: "Fonts", group: "Editor", label: "Lyrics", ui: { input: "checkbox" } },
  { key: "useNativeTranspose", type: "boolean", default: true, section: "Tools", label: "Use native transpose", ui: { input: "checkbox" } },
  { key: "supportMicrotonalNotation", type: "boolean", default: false, section: "Tools", group: "Microtonal notation", groupOrder: 5, label: "Support microtonal notation", help: "Enables optional makam/perde/EDO-53 tools such as Intonation Explorer and Makam DNA.", ui: { input: "checkbox" }, advanced: true },
  { key: "payloadModeEnabled", type: "boolean", default: false, section: "Tools", group: "Diagnostics", groupOrder: 6, label: "Enable Payload Mode (Diagnostics)", ui: { input: "checkbox" }, advanced: true },
  { key: "autoAlignBarsAfterTransforms", type: "boolean", default: false, section: "Tools", label: "Auto-align bars after transforms", ui: { input: "checkbox" }, advanced: true },
  { key: "abc2xmlArgs", type: "string", default: "", section: "Tools", group: "ABC <-> MusicXML", groupOrder: 10, label: "abc2xml flags", ui: { input: "text", placeholder: "e.g. -x -y <value>" }, advanced: true },
  { key: "xml2abcArgs", type: "string", default: "", section: "Tools", group: "ABC <-> MusicXML", groupOrder: 10, label: "xml2abc flags", ui: { input: "text", placeholder: "e.g. -x -b 3" }, advanced: true },
  { key: "stripImportedMeasureComments", type: "boolean", default: true, section: "Tools", group: "ABC <-> MusicXML", groupOrder: 10, label: "Remove imported measure comments", help: "Remove xml2abc comments such as %7 and %14 from imported ABC text.", ui: { input: "checkbox" }, advanced: true },
  { key: "autoFormatImportedAbc", type: "boolean", default: true, section: "Tools", group: "ABC <-> MusicXML", groupOrder: 10, label: "Auto-format imported ABC", help: "Apply the standard ABCarus line-break and bar alignment pass after import.", ui: { input: "checkbox" }, advanced: true },
  { key: "midiImportBackend", type: "string", default: "auto", section: "Tools", group: "MIDI import", groupOrder: 20, label: "MIDI import backend", ui: { input: "select", options: [ { value: "auto", label: "Auto (prefer midi2xml/music21)" }, { value: "midi2abc", label: "Bundled midi2abc" }, { value: "music21-xml2abc", label: "midi2xml (music21) -> xml2abc" } ] }, advanced: true },
  { key: "midi2abcArgs", type: "string", default: "", section: "Tools", group: "MIDI import", groupOrder: 20, label: "MIDI import flags", ui: { input: "text", placeholder: "--title \"My Tune\" --meter 4/4 --key Dm --grid 1/16" }, advanced: true },
  { key: "mp3ExportTimidityPath", type: "string", default: "", section: "Tools", group: "MP3 export", groupOrder: 30, label: "TiMidity++ path", help: "Optional absolute path to timidity. Leave empty to auto-detect in PATH.", ui: { input: "text", placeholder: "/usr/bin/timidity" }, advanced: true },
  { key: "mp3ExportFfmpegPath", type: "string", default: "", section: "Tools", group: "MP3 export", groupOrder: 30, label: "FFmpeg path", help: "Optional absolute path to ffmpeg. Leave empty to auto-detect in PATH.", ui: { input: "text", placeholder: "/usr/bin/ffmpeg" }, advanced: true },
  { key: "chordproBinPath", type: "string", default: "", section: "Tools", group: "ChordPro", groupOrder: 40, label: "Binary path", help: "Optional absolute path to chordpro executable. Leave empty to auto-detect in PATH.", ui: { input: "text", placeholder: "/usr/bin/chordpro" }, advanced: true },
  { key: "chordproRepoPath", type: "string", default: "", section: "Tools", group: "ChordPro", groupOrder: 40, label: "Repository path", help: "Optional path to a ChordPro source checkout (expects script/chordpro.pl).", ui: { input: "text", placeholder: "/path/to/chordpro" }, advanced: true },
  { key: "midiInputEnabled", type: "boolean", default: false, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Enable MIDI input (step)", ui: { input: "checkbox" } },
  { key: "midiInputMuted", type: "boolean", default: false, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Mute MIDI input", ui: { input: "checkbox" } },
  { key: "midiInputKeyAware", type: "boolean", default: false, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Key-aware spelling", ui: { input: "checkbox" } },
  { key: "midiInputGrid", type: "string", default: "1/16", section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Step grid (note length)", ui: { input: "select", options: [ { value: "1/8", label: "1/8" }, { value: "1/16", label: "1/16" }, { value: "1/32", label: "1/32" } ] } },
  { key: "midiInputMacroEnabled", type: "boolean", default: true, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Enable MIDI text macros", ui: { input: "checkbox" }, advanced: true },
  { key: "midiInputBeepEnabled", type: "boolean", default: false, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Note preview on MIDI input", ui: { input: "checkbox" }, advanced: true },
  { key: "midiInputBeepVolume", type: "number", default: 0.2, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "MIDI preview volume (%)", ui: { input: "percent", min: 0, max: 100, step: 5 }, advanced: true },
  { key: "midiInputBeepDuration", type: "number", default: 140, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "MIDI preview duration (ms)", ui: { input: "number", min: 40, max: 400, step: 10 }, advanced: true },
  { key: "noteTypingPreviewEnabled", type: "boolean", default: false, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Play notes while typing", ui: { input: "checkbox" }, advanced: true },
  { key: "noteTypingPreviewVolume", type: "number", default: 0.22, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Typing preview volume (%)", ui: { input: "percent", min: 0, max: 100, step: 5 }, advanced: true },
  { key: "noteTypingPreviewLengthMode", type: "string", default: "typed", section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Typing preview length mode", ui: { input: "select", options: [ { value: "typed", label: "Use typed duration" }, { value: "base", label: "Use base length (L:)" } ] }, advanced: true },
  { key: "noteTypingPreviewTrigger", type: "string", default: "delimiter", section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Typing preview trigger", ui: { input: "select", options: [ { value: "delimiter", label: "On delimiter (space, bar, tab, newline)" }, { value: "note", label: "Immediately on note letter" } ] }, advanced: true },
  { key: "noteTypingPreviewEnvelope", type: "string", default: "short", section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Typing preview envelope", ui: { input: "select", options: [ { value: "short", label: "Short" }, { value: "medium", label: "Medium" } ] }, advanced: true },
  { key: "noteTypingPreviewRetriggerDuration", type: "boolean", default: true, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Typing preview: retrigger on duration", ui: { input: "checkbox" }, advanced: true },
  { key: "noteTypingPreviewSkipMicrotones", type: "boolean", default: true, section: "Tools", group: "MIDI Input", groupOrder: 30, label: "Typing preview: skip microtonal tokens", ui: { input: "checkbox" }, advanced: true },
  { key: "globalHeaderEnabled", type: "boolean", default: true, section: "Header", label: "Enable global header", ui: { input: "checkbox" } },
  { key: "globalHeaderText", type: "string", default: "", legacy: true },
  { key: "usePortalFileDialogs", type: "boolean", default: true, section: "Dialogs", label: "Use portal file dialogs (Linux)", ui: { input: "checkbox" }, advanced: true },
  { key: "startupSplashSeconds", type: "number", default: 0, section: "General", group: "Startup", groupOrder: 12, label: "Startup splash duration (s)", help: "Minimum time to keep the startup splash visible. Set 0 to disable splash.", ui: { input: "number", min: 0, max: 30, step: 1 } },
  { key: "libraryAutoRenumberAfterMove", type: "boolean", default: false, section: "Library", label: "Auto-renumber X after move", ui: { input: "checkbox" } },
  { key: "printSourceQrCodes", type: "boolean", default: false, section: "Print", group: "Source links", groupOrder: 20, label: "Print source QR codes", help: "When enabled, print/PDF output adds a small QR code next to readable F: source URLs.", ui: { input: "checkbox" } },
	  { key: "followHighlightColor", type: "string", default: "#1e90ff", section: "Playback", label: "Follow highlight color", ui: { input: "color" } },
	  { key: "followMeasureColor", type: "string", default: "", section: "Playback", label: "Follow staff color", ui: { input: "color" }, advanced: true },
	  { key: "followHighlightBarOpacity", type: "number", default: 0.12, section: "Playback", label: "Follow bar opacity (%)", ui: { input: "percent", min: 0, max: 60, step: 1 }, advanced: true },
	  { key: "followMeasureOpacity", type: "number", default: 0.08, section: "Playback", label: "Follow staff opacity (%)", ui: { input: "percent", min: 0, max: 30, step: 1 }, advanced: true },
	  { key: "followPlayheadOpacity", type: "number", default: 0.7, section: "Playback", label: "Follow playhead opacity (%)", ui: { input: "percent", min: 0, max: 100, step: 1 }, advanced: true },
	  { key: "followPlayheadWidth", type: "number", default: 2, section: "Playback", label: "Follow playhead width (px)", ui: { input: "number", min: 1, max: 6, step: 1 }, advanced: true },
	  { key: "followPlayheadPad", type: "number", default: 8, section: "Playback", label: "Playhead extra height (px)", ui: { input: "number", min: 0, max: 24, step: 1 }, advanced: true },
  { key: "followPlayheadBetweenNotesWeight", type: "number", default: 1, section: "Playback", label: "Playhead between notes (%)", ui: { input: "percent", min: 0, max: 100, step: 5 }, advanced: true },
  { key: "followPlayheadShift", type: "number", default: 0, section: "Playback", label: "Playhead horizontal shift (px)", ui: { input: "number", min: -20, max: 20, step: 1 }, advanced: true },
  { key: "followPlayheadFirstBias", type: "number", default: 6, section: "Playback", label: "First-note bias (px)", ui: { input: "number", min: 0, max: 20, step: 1 }, advanced: true },
		  {
		    key: "playbackAutoScrollMode",
		    type: "string",
		    default: "Keep Visible",
	    section: "Playback",
	    label: "Playback auto-scroll",
	    ui: {
	      input: "select",
	      options: [
	        { value: "Off", label: "Off" },
	        { value: "Keep Visible", label: "Keep Cursor Visible" },
	        { value: "Page Turn", label: "Smooth Follow" },
	        { value: "Centered", label: "Center Cursor" },
	      ],
	    },
	  },
  { key: "playbackAutoScrollHorizontal", type: "boolean", default: true, section: "Playback", label: "Allow horizontal auto-scroll", ui: { input: "checkbox" }, advanced: true },
  { key: "playbackAutoScrollPauseMs", type: "number", default: 1800, section: "Playback", label: "Auto-scroll pause after manual scroll (ms)", ui: { input: "number", min: 0, max: 5000, step: 100 }, advanced: true },
  { key: "soundfontName", type: "string", default: "TimGM6mb.sf2", section: "Fonts", label: "Soundfont (SF2)", ui: { input: "select", options: "soundfonts" } },
  { key: "abc2svgNotationFontFile", type: "string", default: "", section: "Fonts", label: "Notation font", ui: { input: "select", options: "notationFonts" } },
  { key: "abc2svgTextFontFile", type: "string", default: "", section: "Fonts", label: "Text font", ui: { input: "select", options: "textFonts" } },
];

const GLOBAL_HEADER_EDITOR_ENTRY = {
  key: "__globalHeaderFile",
  section: "Header",
  group: "Global header",
  groupOrder: 10,
  label: "Global header text",
  help: "Edits user_settings.abc directly. Changes are saved automatically.",
  ui: { input: "code" },
};

function buildDefaults(schema) {
  const out = {};
  for (const entry of schema) {
    if (!entry || !entry.key) continue;
    out[entry.key] = entry.default;
  }
  return out;
}

function groupSchemaForModal(schema) {
  const uiEntries = [
    ...(schema || []).filter((e) => e && e.ui && e.ui.input && !e.legacy),
    GLOBAL_HEADER_EDITOR_ENTRY,
  ];
  const bySection = new Map();
  for (const entry of uiEntries) {
    const section = String(entry.section || "Other");
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(entry);
  }
  for (const entries of bySection.values()) {
    entries.sort((a, b) => {
      const ao = Number(a && a.order);
      const bo = Number(b && b.order);
      const hasAo = Number.isFinite(ao);
      const hasBo = Number.isFinite(bo);
      if (hasAo || hasBo) {
        const av = hasAo ? ao : 999;
        const bv = hasBo ? bo : 999;
        if (av !== bv) return av - bv;
      }
      const sectionName = String((a && a.section) || (b && b.section) || "");
      if (sectionName === "Fonts") {
        const order = new Map([
          ["abc2svgNotationFontFile", 0],
          ["abc2svgTextFontFile", 1],
          ["soundfontName", 2],
        ]);
        const ak = order.has(a.key) ? order.get(a.key) : 999;
        const bk = order.has(b.key) ? order.get(b.key) : 999;
        if (ak !== bk) return ak - bk;
      }
      return String(a.label || a.key).localeCompare(String(b.label || b.key));
    });
  }
  return bySection;
}

export function initSettings(api) {
  const store = createSettingsStore(api);

  const $settingsModal = document.getElementById("settingsModal");
  const $settingsCard = $settingsModal ? $settingsModal.querySelector(".modal-card") : null;
  const $settingsHeader = $settingsModal ? $settingsModal.querySelector(".modal-header") : null;
  const $settingsFilter = document.getElementById("settingsFilter");
  const $settingsSectionTitle = document.getElementById("settingsSectionTitle");
  const $settingsSectionHint = document.getElementById("settingsSectionHint");
  const $settingsNoResults = document.getElementById("settingsNoResults");
  const $settingsTabsHost = document.getElementById("settingsTabs");
  const $settingsPanelsHost = document.getElementById("settingsPanels");
  const $settingsExport = document.getElementById("settingsExport");
  const $settingsImport = document.getElementById("settingsImport");
  const $settingsResetSection = document.getElementById("settingsResetSection");
  const $settingsCancel = document.getElementById("settingsCancel");
  const $settingsOk = document.getElementById("settingsOk");

  // Legacy controls kept in HTML for compatibility.
  const $settingsClose = document.getElementById("settingsClose");
  const $settingsReset = document.getElementById("settingsReset");
  const $settingsShowAdvanced = document.getElementById("settingsShowAdvanced");
  const $renderPane = document.querySelector(".render-pane");
  const $editorPane = document.querySelector(".editor-pane");

  let schema = FALLBACK_SCHEMA;
  let defaultSettings = buildDefaults(schema);
  let currentSettings = { ...defaultSettings };
  let activePane = "render";
  let lastActiveTab = "general";
  let setActiveTab = null;
  let applySettingsFilter = null;
  let cachedFontLists = { notation: [], text: [] };
  let cachedFontDirs = { bundledDir: "", userDir: "" };
  let cachedSoundfonts = [];
  const knownTabs = new Set([
    "general",
    "editor",
    "fonts",
    "playback",
    "library",
    "print",
    "importexport",
    "header",
    "microtonal",
    "advanced",
  ]);
  let dragState = null;
  let draftPatch = {};
  let isSettingsOpen = false;
  let settingsPanelsByKey = new Map();

  function formatFontOptionLabel(ref) {
    const raw = String(ref || "");
    const m = raw.match(/^(bundled|user):(.*)$/);
    if (!m) return raw;
    const origin = m[1] === "user" ? "User" : "Bundled";
    const name = String(m[2] || "").replace(/\.(otf|ttf|woff2?)$/i, "");
    return `${name} (${origin})`;
  }

  function populateFontSelect(selectEl, optionsKey) {
    if (!selectEl) return;
    const prev = String(selectEl.value || "");
    selectEl.textContent = "";

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = "Default (bundled)";
    selectEl.appendChild(optDefault);

    const pushOptions = (refs) => {
      for (const ref of refs) {
        const option = document.createElement("option");
        option.value = String(ref || "");
        option.textContent = formatFontOptionLabel(option.value);
        selectEl.appendChild(option);
      }
    };

    if (optionsKey === "notationFonts") pushOptions(cachedFontLists.notation || []);
    else if (optionsKey === "textFonts") pushOptions(cachedFontLists.text || []);

    // Restore selection if possible.
    selectEl.value = prev;
    if (selectEl.value !== prev) selectEl.value = "";
  }

  function isFontRefInOptions(ref, optionsKey) {
    const raw = String(ref || "");
    if (!raw) return false;
    const list = optionsKey === "textFonts"
      ? (cachedFontLists && Array.isArray(cachedFontLists.text) ? cachedFontLists.text : [])
      : (cachedFontLists && Array.isArray(cachedFontLists.notation) ? cachedFontLists.notation : []);
    return list.includes(raw);
  }

  function classifyFontRef(ref) {
    const raw = String(ref || "");
    if (!raw) return "";
    if (isFontRefInOptions(raw, "notationFonts")) return "notation";
    if (isFontRefInOptions(raw, "textFonts")) return "text";
    return "";
  }

  function getCatalogUserFontFiles() {
    return collectCatalogUserFontFiles(cachedFontLists);
  }

  function interfaceFontFamilyForFile(fileName, defaultFamily = defaultSettings.uiFontFamily) {
    return buildInterfaceFontFamily(fileName, defaultFamily);
  }

  async function reloadFontCatalog() {
    if (!api || typeof api.listFonts !== "function") return false;
    const list = await api.listFonts().catch(() => null);
    if (!list || !list.ok) return false;
    cachedFontLists = normalizeFontCatalog(list);
    return true;
  }

  function refreshInterfaceFontControls() {
    for (const meta of controlByKey.values()) {
      const optionsKey = meta && meta.entry && meta.entry.ui ? meta.entry.ui.options : "";
      if (optionsKey !== "interfaceFonts" || !meta.el) continue;
      if (typeof meta.refresh === "function") meta.refresh(getEffectiveSettings()[meta.entry.key]);
      if (typeof meta.updateRemoveEnabled === "function") meta.updateRemoveEnabled();
    }
  }

  function settingsPatchForRemovedUserFont(fileName, settings) {
    return buildRemovedFontSettingsPatch({
      fileName,
      settings: settings || getEffectiveSettings(),
      defaults: defaultSettings,
    });
  }

  function refreshFontSelectControls() {
    const effective = getEffectiveSettings();
    for (const [key, meta] of controlByKey.entries()) {
      if (!meta || !meta.entry || !meta.el) continue;
      if (!meta.entry.ui || meta.entry.ui.input !== "select") continue;
      const optionsKey = meta.entry.ui && meta.entry.ui.options ? String(meta.entry.ui.options) : "";
      if (optionsKey !== "notationFonts" && optionsKey !== "textFonts") continue;
      populateFontSelect(meta.el, optionsKey);
      const v = String(effective[key] || "");
      meta.el.value = v;
      if (meta.el.value !== v) meta.el.value = "";
    }
  }

  function populateSoundfontSelect(selectEl) {
    if (!selectEl) return;
    const prev = String(selectEl.value || "");
    selectEl.textContent = "";

    const fallback = "TimGM6mb.sf2";
    const defaultName = String(defaultSettings.soundfontName || fallback);
    const current = String(currentSettings.soundfontName || fallback);
    const entries = Array.isArray(cachedSoundfonts) ? cachedSoundfonts : [];
    const normalized = [];

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = `Default (${safeBasename(defaultName).replace(/\\.sf2$/i, "")})`;
    selectEl.appendChild(optDefault);

    for (const item of entries) {
      if (!item) continue;
      if (typeof item === "string") {
        normalized.push({ name: item, source: isSoundfontPath(item) ? "user" : "bundled" });
      } else if (typeof item === "object" && item.name) {
        normalized.push({ name: String(item.name), source: item.source === "user" ? "user" : "bundled" });
      }
    }

    if (current && !normalized.some((x) => x.name === current)) {
      normalized.unshift({ name: current, source: isSoundfontPath(current) ? "user" : "bundled" });
    }
    if (defaultName && !normalized.some((x) => x.name === defaultName)) {
      normalized.unshift({ name: defaultName, source: isSoundfontPath(defaultName) ? "user" : "bundled" });
    }

    const seen = new Set();
    for (const item of normalized) {
      if (!item || !item.name || seen.has(item.name)) continue;
      seen.add(item.name);
      const option = document.createElement("option");
      option.value = item.name;
      const label = safeBasename(item.name).replace(/\.sf2$/i, "");
      option.textContent = `${label}${item.source === "user" ? " (user)" : " (bundled)"}`;
      selectEl.appendChild(option);
    }

    selectEl.value = prev;
    if (selectEl.value !== prev) {
      selectEl.value = String(current) === String(defaultName) ? "" : current;
    }
  }

  const controlByKey = new Map(); // key -> { entry, el, kind }
  let globalHeaderView = null;
  let suppressGlobalUpdate = false;
  let globalHeaderFileText = "";
  let globalHeaderFileExists = false;
  let globalHeaderDraftDirty = false;
  let globalHeaderSaveTimer = null;
  let globalHeaderSavePromise = null;
  let globalHeaderStatusEl = null;
  let globalHeaderPath = "";

  function readUiState() {
    try {
      const raw = localStorage.getItem(SETTINGS_UI_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeUiState(patch) {
    try {
      const prev = readUiState() || {};
      const next = { ...prev, ...(patch || {}) };
      localStorage.setItem(SETTINGS_UI_STATE_KEY, JSON.stringify(next));
    } catch {}
  }

  function getEditorFontUserFiles() {
    const ui = readUiState() || {};
    return normalizeUserFontFiles(getCatalogUserFontFiles(), ui.editorFontUserFiles);
  }

  function setEditorFontUserFiles(list) {
    writeUiState({ editorFontUserFiles: normalizeUserFontFiles(list) });
  }

  async function updateSettings(patch) {
    const next = await store.update(patch);
    if (next) applySettings(next);
  }

  function getEffectiveSettings() {
    return { ...defaultSettings, ...currentSettings, ...(draftPatch || {}) };
  }

  function setDraftPatch(next) {
    draftPatch = next && typeof next === "object" ? next : {};
  }

  function discardDraftPatch() {
    setDraftPatch({});
    applySettings(currentSettings);
  }

  async function applyDraftPatch() {
    const patch = draftPatch || {};
    if (!patch || Object.keys(patch).length === 0) return true;
    const next = await store.update(patch).catch((error) => { alert(`Unable to save settings.\n\n${error && error.message ? error.message : String(error || "Unknown error")}`); return null; });
    if (!next) return false;
    setDraftPatch({});
    applySettings(next);
    return true;
  }

  function setGlobalHeaderEditorText(text) {
    const nextText = String(text == null ? "" : text);
    if (!globalHeaderView) return;
    const currentText = globalHeaderView.state.doc.toString();
    if (currentText === nextText) return;
    suppressGlobalUpdate = true;
    globalHeaderView.dispatch({
      changes: { from: 0, to: globalHeaderView.state.doc.length, insert: nextText },
    });
    suppressGlobalUpdate = false;
  }

  function updateGlobalHeaderStatus(message, { error = false } = {}) {
    if (!globalHeaderStatusEl) return;
    const prefix = globalHeaderPath ? `${globalHeaderPath}\n` : "";
    globalHeaderStatusEl.textContent = `${prefix}${String(message || "")}`.trim();
    globalHeaderStatusEl.classList.toggle("settings-error", Boolean(error));
  }

  async function loadGlobalHeaderFile() {
    if (!api || typeof api.readGlobalHeader !== "function") {
      globalHeaderFileText = "";
      globalHeaderFileExists = false;
      globalHeaderDraftDirty = false;
      setGlobalHeaderEditorText("");
      return true;
    }
    const result = await api.readGlobalHeader().catch(() => null);
    if (!result || !result.ok) {
      alert((result && result.error) ? result.error : "Unable to read Global Header.");
      return false;
    }
    globalHeaderFileText = String(result.text == null ? "" : result.text);
    globalHeaderFileExists = Boolean(result.exists);
    globalHeaderPath = String(result.path || "");
    globalHeaderDraftDirty = false;
    setGlobalHeaderEditorText(globalHeaderFileText);
    updateGlobalHeaderStatus(globalHeaderFileExists ? "Saved" : "Optional file does not exist yet.");
    return true;
  }

  function scheduleGlobalHeaderSave() {
    if (globalHeaderSaveTimer) clearTimeout(globalHeaderSaveTimer);
    updateGlobalHeaderStatus("Pending save...");
    globalHeaderSaveTimer = setTimeout(() => {
      globalHeaderSaveTimer = null;
      flushGlobalHeaderSave().catch(() => {});
    }, 400);
  }

  async function flushGlobalHeaderSave() {
    if (globalHeaderSaveTimer) {
      clearTimeout(globalHeaderSaveTimer);
      globalHeaderSaveTimer = null;
    }
    if (globalHeaderSavePromise) {
      const priorOk = await globalHeaderSavePromise;
      if (!priorOk) return false;
    }
    if (!globalHeaderView) return true;
    const text = globalHeaderView.state.doc.toString();
    if (text === globalHeaderFileText) {
      globalHeaderDraftDirty = false;
      updateGlobalHeaderStatus(globalHeaderFileExists ? "Saved" : "Optional file does not exist yet.");
      return true;
    }
    if (!api || typeof api.writeGlobalHeader !== "function") {
      updateGlobalHeaderStatus("Unable to save Global Header.", { error: true });
      return false;
    }
    updateGlobalHeaderStatus("Saving...");
    globalHeaderSavePromise = (async () => {
      const result = await api.writeGlobalHeader(text).catch(() => null);
      if (!result || !result.ok) {
        updateGlobalHeaderStatus(
          (result && result.error) ? `Save failed: ${result.error}` : "Save failed.",
          { error: true },
        );
        return false;
      }
      globalHeaderFileText = String(result.text == null ? text : result.text);
      globalHeaderFileExists = Boolean(result.exists);
      globalHeaderPath = String(result.path || globalHeaderPath);
      const currentText = globalHeaderView ? globalHeaderView.state.doc.toString() : globalHeaderFileText;
      globalHeaderDraftDirty = currentText !== globalHeaderFileText;
      updateGlobalHeaderStatus(globalHeaderDraftDirty ? "Pending save..." : "Saved");
      return true;
    })();
    const saved = await globalHeaderSavePromise;
    globalHeaderSavePromise = null;
    if (saved && globalHeaderDraftDirty) return flushGlobalHeaderSave();
    return saved;
  }

  function stageSetting(key, value) {
    if (!key) return;
    const effective = getEffectiveSettings();
    if (Object.is(effective[key], value)) return;
    const next = { ...(draftPatch || {}) };
    next[key] = value;
    setDraftPatch(next);
    applySettings(currentSettings);
  }

  function ensureUserFontFaces() {
    const userDir = String(cachedFontDirs && cachedFontDirs.userDir ? cachedFontDirs.userDir : "");
    if (!userDir) return;
    let styleEl = document.getElementById("abcarusEditorUserFonts");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "abcarusEditorUserFonts";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildUserFontFaceCss({
      userDir,
      fontFiles: getEditorFontUserFiles(),
      toFileUrl,
    });
  }

  function applySettings(settings) {
    currentSettings = { ...defaultSettings, ...(settings || {}) };
    currentSettings.editorFontFamily = normalizeEditorFontFamily(
      currentSettings.editorFontFamily,
      defaultSettings.editorFontFamily,
    );
    const effectiveSettings = getEffectiveSettings();
    ensureUserFontFaces();

    const root = document.documentElement.style;
    root.setProperty("--editor-font-family", effectiveSettings.editorFontFamily);
    root.setProperty("--editor-font-size", `${effectiveSettings.editorFontSize}px`);
    root.setProperty("--editor-notes-weight", effectiveSettings.editorNotesBold ? "600" : "400");
    root.setProperty("--editor-lyrics-weight", effectiveSettings.editorLyricsBold ? "600" : "400");
    if (!(document.body && document.body.classList.contains("focus-mode"))) {
      root.setProperty("--render-zoom", String(effectiveSettings.renderZoom));
    }
    root.setProperty("--editor-zoom", String(effectiveSettings.editorZoom));

    for (const [key, meta] of controlByKey.entries()) {
      const entry = meta.entry;
      if (!entry || !entry.ui) continue;
      const kind = entry.ui.input;
      const value = effectiveSettings[key];
      if (kind === "checkbox" && meta.el) {
        meta.el.checked = Boolean(value);
      } else if (kind === "percent" && meta.el) {
        meta.el.value = String(Math.round((Number(value) || 1) * 100));
      } else if (kind === "color" && meta.el) {
        meta.el.value = String(value || "#000000");
      } else if (kind === "select" && meta.el) {
        if (key === "soundfontName") {
          const fallback = "TimGM6mb.sf2";
          const defaultName = String(defaultSettings.soundfontName || fallback);
          meta.el.value = String(value || "") === defaultName ? "" : String(value || "");
        } else if (key === "editorFontFamily") {
          const defaultFamily = String(defaultSettings.editorFontFamily || "");
          const systemFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          const v = String(value || "");
          if (v === defaultFamily) {
            meta.el.value = "";
          } else if (v === systemFamily) {
            meta.el.value = "__system__";
          } else {
            const m = v.match(/ABCarus User Font: ([^"]+)/);
            meta.el.value = m ? `user:${String(m[1] || "")}` : "";
          }
        } else {
          meta.el.value = String(value || "");
        }
        if (typeof meta.updateRemoveEnabled === "function") meta.updateRemoveEnabled();
      } else if ((kind === "number" || kind === "text" || kind === "folder") && meta.el) {
        meta.el.value = String(value == null ? "" : value);
      }
    }

    if (globalHeaderView) {
      const nextText = globalHeaderDraftDirty
        ? globalHeaderView.state.doc.toString()
        : globalHeaderFileText;
      const doc = globalHeaderView.state.doc.toString();
      if (doc !== nextText) {
        suppressGlobalUpdate = true;
        globalHeaderView.dispatch({
          changes: { from: 0, to: globalHeaderView.state.doc.length, insert: nextText },
        });
        suppressGlobalUpdate = false;
      }
    }

  }

  async function openSettings() {
    await initPromise.catch(() => {});
    const loaded = await loadGlobalHeaderFile();
    if (!loaded) return;
    if (!$settingsModal) return;
    isSettingsOpen = true;
    $settingsModal.classList.add("open");
    $settingsModal.setAttribute("aria-hidden", "false");
    if ($settingsFilter) $settingsFilter.value = "";
    if (typeof setActiveTab === "function") setActiveTab(lastActiveTab);
    if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
    scheduleClampModalPosition();
    setTimeout(() => {
      if ($settingsFilter) {
        $settingsFilter.focus();
        $settingsFilter.select();
      }
    }, 0);
  }

  async function closeSettings({ discardDraft = false } = {}) {
    if (!$settingsModal) return;
    const headerSaved = await flushGlobalHeaderSave();
    if (!headerSaved) return false;
    isSettingsOpen = false;
    if (discardDraft) discardDraftPatch();
    if ($settingsFilter) $settingsFilter.value = "";
    if (applySettingsFilter && $settingsFilter) applySettingsFilter("");
    $settingsModal.classList.remove("open");
    $settingsModal.setAttribute("aria-hidden", "true");
    return true;
  }

  function readModalPosition() {
    const ui = readUiState();
    if (!ui || !ui.settingsModalPos) return null;
    const pos = ui.settingsModalPos;
    if (!pos || typeof pos !== "object") return null;
    const x = Number(pos.x);
    const y = Number(pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function applyModalPosition(pos) {
    if (!$settingsCard) return;
    if (!pos) {
      $settingsCard.style.transform = "";
      return;
    }
    const x = Math.round(Number(pos.x) || 0);
    const y = Math.round(Number(pos.y) || 0);
    $settingsCard.style.transform = `translate(${x}px, ${y}px)`;
  }

  function readModalPositionFromTransform() {
    if (!$settingsCard) return null;
    const current = String($settingsCard.style.transform || "");
    const m = current.match(/translate\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
    if (!m) return null;
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function clampModalPosition(pos) {
    if (!$settingsCard) return pos;
    const x = Number(pos && pos.x);
    const y = Number(pos && pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
    const rect = $settingsCard.getBoundingClientRect();
    const pad = 12;
    const baseLeft = (window.innerWidth - rect.width) / 2;
    const baseTop = (window.innerHeight - rect.height) / 2;

    let minX = pad - baseLeft;
    let maxX = (window.innerWidth - pad - rect.width) - baseLeft;
    let minY = pad - baseTop;
    let maxY = (window.innerHeight - pad - rect.height) - baseTop;

    // If the modal is larger than the viewport, prefer keeping the top-left visible.
    if (minX > maxX) {
      maxX = minX;
    }
    if (minY > maxY) {
      maxY = minY;
    }

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }

  function clampAndPersistModalPosition() {
    if (!$settingsCard) return;
    const pos = readModalPositionFromTransform() || readModalPosition() || { x: 0, y: 0 };
    const clamped = clampModalPosition(pos);
    applyModalPosition(clamped);
    writeUiState({ settingsModalPos: clamped });
  }

  function scheduleClampModalPosition() {
    if (!$settingsModal || !$settingsCard) return;
    if (!$settingsModal.classList.contains("open")) return;
    // Let layout settle (tab changes / advanced toggles can change height).
    requestAnimationFrame(() => requestAnimationFrame(() => clampAndPersistModalPosition()));
  }

  function initSettingsDrag() {
    if (!$settingsCard || !$settingsHeader) return;

    const applyFromUi = () => {
      const pos = readModalPosition();
      applyModalPosition(pos ? clampModalPosition(pos) : null);
    };
    applyFromUi();

    $settingsHeader.addEventListener("pointerdown", (event) => {
      if (!event || event.button !== 0) return;
      const target = event.target;
      if (target && (target.closest("button") || target.closest("input") || target.closest("select") || target.closest("textarea"))) {
        return;
      }
      if (!$settingsModal.classList.contains("open")) return;

      const start = readModalPosition() || { x: 0, y: 0 };
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: start.x,
        originY: start.y,
      };
      $settingsCard.classList.add("dragging");
      try { $settingsHeader.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });

    $settingsHeader.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const next = clampModalPosition({ x: dragState.originX + dx, y: dragState.originY + dy });
      applyModalPosition(next);
    });

    const endDrag = (event) => {
      if (!dragState) return;
      if (event && dragState.pointerId != null && event.pointerId !== dragState.pointerId) return;
      const current = $settingsCard.style.transform || "";
      const m = current.match(/translate\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
      const pos = m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
      writeUiState({ settingsModalPos: clampModalPosition(pos) });
      dragState = null;
      $settingsCard.classList.remove("dragging");
      try { if (event) $settingsHeader.releasePointerCapture(event.pointerId); } catch {}
    };

    $settingsHeader.addEventListener("pointerup", endDrag);
    $settingsHeader.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", () => {
      const pos = readModalPosition();
      if (!pos) return;
      const clamped = clampModalPosition(pos);
      applyModalPosition(clamped);
      writeUiState({ settingsModalPos: clamped });
    });
  }

  function zoomBy(delta) {
    if (activePane === "editor") {
      const nextZoom = (currentSettings.editorZoom || 1) + delta;
      updateSettings({ editorZoom: nextZoom }).catch(() => {});
    } else {
      const nextZoom = (currentSettings.renderZoom || 1) + delta;
      updateSettings({ renderZoom: nextZoom }).catch(() => {});
    }
  }

  function zoomReset() {
    updateSettings({ renderZoom: 1, editorZoom: 1 }).catch(() => {});
  }

  function createRow(entry) {
    const row = document.createElement("label");
    row.className = "settings-row";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = String(entry.label || entry.key);
    row.appendChild(labelSpan);

    const kind = entry.ui.input;
    let input = null;
    if (kind === "action") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-action";
      btn.textContent = "Reset";
      btn.addEventListener("click", () => {
        try {
          if (entry.key === "libraryResetCache") {
            document.dispatchEvent(new CustomEvent("abcarus:reset-library-cache"));
          }
        } catch {}
      });
      row.appendChild(btn);
      return row;
    }
    if (kind === "checkbox") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => {
        stageSetting(entry.key, Boolean(input.checked));
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    if (kind === "number" || kind === "percent") {
      input = document.createElement("input");
      input.type = "number";
      if (entry.section === "Fonts" && entry.help) input.title = String(entry.help);
      if (entry.ui.min != null) input.min = String(entry.ui.min);
      if (entry.ui.max != null) input.max = String(entry.ui.max);
      if (entry.ui.step != null) input.step = String(entry.ui.step);
      input.addEventListener("change", () => {
        const raw = Number(input.value);
        if (kind === "percent") {
          stageSetting(entry.key, raw / 100);
        } else {
          stageSetting(entry.key, raw);
        }
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    if (kind === "text") {
      input = document.createElement("input");
      input.type = "text";
      if (entry.section === "Fonts" && entry.help) input.title = String(entry.help);
      if (entry.ui.placeholder) input.placeholder = String(entry.ui.placeholder);
      input.addEventListener("input", () => {
        stageSetting(entry.key, input.value || "");
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }
    if (kind === "folder") {
      const { control, input: folderInput } = createSettingsFolderControl({ api, entry, onChange: (value) => stageSetting(entry.key, value) });
      input = folderInput;
      row.appendChild(control);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    if (kind === "select") {
      const select = document.createElement("select");
      select.dataset.settingsKey = String(entry.key || "");
      if (entry.section === "Fonts" && entry.help) select.title = String(entry.help);
      const optionsKey = entry.ui && entry.ui.options ? String(entry.ui.options) : "";
      const isFontSelect = optionsKey === "notationFonts" || optionsKey === "textFonts";
      const isSoundfontSelect = optionsKey === "soundfonts";
      const isInterfaceFontFamily = optionsKey === "interfaceFonts";
      const isEditorFontFamily = entry.key === "editorFontFamily";

      if (isInterfaceFontFamily) {
        const defaultFamily = String(defaultSettings[entry.key] || defaultSettings.uiFontFamily || entry.default || "");
        const control = createInterfaceFontControl({
          documentRef: document,
          entry,
          selected: getEffectiveSettings()[entry.key],
          defaultFamily,
          getUserFontFiles: getCatalogUserFontFiles,
          onChange: (value) => stageSetting(entry.key, value),
          onAdd: async () => {
            if (!api || typeof api.pickFont !== "function" || typeof api.installFont !== "function") return "";
            const pick = await api.pickFont().catch(() => null);
            if (!pick || !pick.ok || !pick.path) return "";
            const res = await api.installFont(pick.path).catch(() => null);
            if (!res || !res.ok || !res.name) {
              alert(res && res.error ? res.error : "Failed to add font.");
              return "";
            }
            const remembered = getEditorFontUserFiles();
            if (!remembered.includes(res.name)) setEditorFontUserFiles([res.name, ...remembered]);
            await reloadFontCatalog();
            ensureUserFontFaces();
            refreshInterfaceFontControls();
            return interfaceFontFamilyForFile(res.name, defaultFamily);
          },
          onRemove: async (fileName) => {
            if (!confirm(`Delete ABCarus installed copy of "${fileName}"?\n\nThe original external font file will not be touched.`)) return false;
            if (!api || typeof api.removeFont !== "function") return false;
            const effectiveBeforeRemove = getEffectiveSettings();
            const res = await api.removeFont(fileName).catch(() => null);
            if (!res || !res.ok) {
              alert(res && res.error ? res.error : "Failed to remove font.");
              return false;
            }
            const patch = settingsPatchForRemovedUserFont(fileName, effectiveBeforeRemove);
            const nextDraft = { ...(draftPatch || {}) };
            for (const key of Object.keys(patch)) delete nextDraft[key];
            setDraftPatch(nextDraft);
            if (Object.keys(patch).length) await updateSettings(patch).catch(() => {});
            setEditorFontUserFiles(getEditorFontUserFiles().filter((name) => name !== fileName));
            await reloadFontCatalog();
            ensureUserFontFaces();
            refreshFontSelectControls();
            refreshInterfaceFontControls();
            return true;
          },
        });
        row.appendChild(control.wrap);
        controlByKey.set(entry.key, {
          entry,
          el: control.select,
          refresh: control.refresh,
          updateRemoveEnabled: control.updateRemoveEnabled,
        });
        return row;
      }

      if (isEditorFontFamily) {
        const defaultFamily = String(defaultSettings.editorFontFamily || entry.default || "");
        const systemFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

        const optDefault = document.createElement("option");
        optDefault.value = "";
        optDefault.textContent = "Default (bundled)";
        select.appendChild(optDefault);

        const optSystem = document.createElement("option");
        optSystem.value = "__system__";
        optSystem.textContent = "System monospace";
        select.appendChild(optSystem);

        const userFiles = getEditorFontUserFiles();
        for (const fileName of userFiles) {
          const safe = String(fileName || "").trim();
          if (!safe) continue;
          const option = document.createElement("option");
          option.value = `user:${safe}`;
          option.textContent = `${safe} (user)`;
          select.appendChild(option);
        }

        select.addEventListener("change", () => {
          const v = String(select.value || "");
          if (!v) {
            stageSetting(entry.key, defaultFamily);
            return;
          }
          if (v === "__system__") {
            stageSetting(entry.key, systemFamily);
            return;
          }
          const m = v.match(/^user:(.+)$/);
          if (m) {
            const file = String(m[1] || "");
            const family = `\"ABCarus User Font: ${file}\", ${systemFamily}`;
            stageSetting(entry.key, family);
            return;
          }
        });

        const wrap = document.createElement("div");
        wrap.className = "settings-select-row";
        wrap.appendChild(select);

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.textContent = "Add…";
        addBtn.title = "Copy a font into ABCarus and use it in the editor.";
        addBtn.addEventListener("click", async () => {
          if (!api || typeof api.pickFont !== "function" || typeof api.installFont !== "function") return;
          const pick = await api.pickFont().catch(() => null);
          if (!pick || !pick.ok || !pick.path) return;
          const res = await api.installFont(pick.path).catch(() => null);
          if (!res || !res.ok || !res.name) return;
          const next = getEditorFontUserFiles();
          if (!next.includes(res.name)) {
            next.unshift(res.name);
            setEditorFontUserFiles(next);
          }
          await reloadFontCatalog();
          const option = document.createElement("option");
          option.value = `user:${res.name}`;
          option.textContent = `${res.name} (user)`;
          select.appendChild(option);
          select.value = option.value;
          ensureUserFontFaces();
          refreshInterfaceFontControls();
          const family = `\"ABCarus User Font: ${res.name}\", ${systemFamily}`;
          stageSetting(entry.key, family);
        });

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "Remove";

        const updateRemoveEnabled = () => {
          const v = String(select.value || "");
          const m = v.match(/^user:(.+)$/);
          const file = m ? String(m[1] || "") : "";
          const canRemove = Boolean(file && getEditorFontUserFiles().includes(file));
          removeBtn.disabled = !canRemove;
          removeBtn.textContent = "Remove";
          removeBtn.title = canRemove
            ? "Delete the ABCarus-installed copy. The original external font file will not be touched."
            : "Select a font added to ABCarus to remove it.";
        };

        removeBtn.addEventListener("click", async () => {
          const v = String(select.value || "");
          const m = v.match(/^user:(.+)$/);
          const file = m ? String(m[1] || "") : "";
          if (!file) return;
          const list = getEditorFontUserFiles();
          if (!list.includes(file)) return;
          if (!confirm(`Delete ABCarus installed copy of "${file}"?\n\nThe original external font file will not be touched.`)) return;
          if (!api || typeof api.removeFont !== "function") return;
          const effectiveBeforeRemove = getEffectiveSettings();
          const res = await api.removeFont(file).catch(() => null);
          if (!res || !res.ok) return;
          const patch = settingsPatchForRemovedUserFont(file, effectiveBeforeRemove);
          const nextDraft = { ...(draftPatch || {}) };
          for (const key of Object.keys(patch)) delete nextDraft[key];
          setDraftPatch(nextDraft);
          if (Object.keys(patch).length) await updateSettings(patch).catch(() => {});
          setEditorFontUserFiles(list.filter((x) => x !== file));
          const opt = Array.from(select.options).find((o) => String(o.value) === `user:${file}`);
          if (opt) opt.remove();
          await reloadFontCatalog();
          select.value = "";
          ensureUserFontFaces();
          refreshFontSelectControls();
          refreshInterfaceFontControls();
          updateRemoveEnabled();
        });

        select.addEventListener("change", updateRemoveEnabled);
        updateRemoveEnabled();

        wrap.appendChild(addBtn);
        wrap.appendChild(removeBtn);
        row.appendChild(wrap);
        controlByKey.set(entry.key, { entry, el: select, updateRemoveEnabled });
        return row;
      }

      if (isFontSelect) {
        populateFontSelect(select, optionsKey);
      } else if (isSoundfontSelect) {
        populateSoundfontSelect(select);
      } else if (Array.isArray(entry.ui && entry.ui.options)) {
        if (!isEditorFontFamily) {
          const optDefault = document.createElement("option");
          optDefault.value = "";
          optDefault.textContent = "Default";
          select.appendChild(optDefault);
        }
        for (const rawOpt of entry.ui.options) {
          const isObj = rawOpt && typeof rawOpt === "object";
          const value = isObj ? rawOpt.value : rawOpt;
          if (isEditorFontFamily && String(value) === "__custom__") continue;
          const label = isObj ? (rawOpt.label != null ? rawOpt.label : rawOpt.value) : rawOpt;
          const option = document.createElement("option");
          option.value = String(value || "");
          option.textContent = String(label || "");
          select.appendChild(option);
        }
      }

      select.addEventListener("change", () => {
        if (entry.key === "soundfontName") {
          const fallback = "TimGM6mb.sf2";
          const defaultName = String(defaultSettings.soundfontName || fallback);
          stageSetting(entry.key, select.value ? select.value : defaultName);
          return;
        }
        stageSetting(entry.key, select.value || "");
      });

      if (!isFontSelect && !isSoundfontSelect) {
        row.appendChild(select);
        controlByKey.set(entry.key, { entry, el: select });
        return row;
      }

      const wrap = document.createElement("div");
      wrap.className = "settings-select-row";
      wrap.appendChild(select);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "Add…";
      addBtn.title = isSoundfontSelect
        ? "Add an external SoundFont reference. The original file stays in its current location."
        : "Copy a font into ABCarus and add it to this list.";
      addBtn.addEventListener("click", async () => {
        if (isSoundfontSelect) {
          if (!api || typeof api.pickSoundfont !== "function") return;
          const picked = await api.pickSoundfont().catch(() => null);
          if (!picked) return;
          if (!/\.sf2$/i.test(String(picked))) {
            alert("Soundfont must be a .sf2 file.");
            return;
          }
          if (api.fileExists) {
            const exists = await api.fileExists(picked).catch(() => false);
            if (!exists) {
              alert("Soundfont file not found.");
              return;
            }
          }
          const existing = Array.isArray(currentSettings.soundfontPaths) ? currentSettings.soundfontPaths : [];
          const nextPaths = existing.includes(picked) ? existing : [...existing, picked];
          await updateSettings({ soundfontPaths: nextPaths, soundfontName: picked }).catch(() => {});
          const list = await api.listSoundfonts().catch(() => []);
          cachedSoundfonts = Array.isArray(list) ? list : [];
          populateSoundfontSelect(select);
          select.value = picked;
          stageSetting(entry.key, picked);
          return;
        }

        if (!api || typeof api.pickFont !== "function" || typeof api.installFont !== "function") return;
        const pick = await api.pickFont().catch(() => null);
        if (!pick || !pick.ok || !pick.path) return;
        const res = await api.installFont(pick.path).catch(() => null);
        if (!res || !res.ok) {
          alert(res && res.error ? res.error : "Failed to add font.");
          return;
        }
        await reloadFontCatalog();
        const newRef = `user:${String(res.name || "")}`;
        refreshFontSelectControls();
        refreshInterfaceFontControls();

        const category = classifyFontRef(newRef);
        const keyByCategory = {
          notation: "abc2svgNotationFontFile",
          text: "abc2svgTextFontFile",
        };
        const targetKey = keyByCategory[category] || entry.key;

        if (targetKey === entry.key && isFontRefInOptions(newRef, optionsKey)) {
          select.value = newRef;
          stageSetting(entry.key, newRef);
          return;
        }

        // If user added a font via the "wrong" picker (e.g. text font in notation selector),
        // route it to the matching setting to avoid ending up with an empty/invalid select value.
        stageSetting(targetKey, newRef);
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", async () => {
        if (isSoundfontSelect) {
          const current = String(select.value || "");
          if (!current) return;
          if (!isSoundfontPath(current)) {
            alert("Bundled soundfonts cannot be removed.");
            return;
          }
          const label = safeBasename(current).replace(/\.sf2$/i, "");
          if (api && typeof api.confirmRemoveSoundfont === "function") {
            const ok = await api.confirmRemoveSoundfont(label).catch(() => false);
            if (!ok) return;
          } else if (!confirm(`Remove "${label}" from the list?`)) {
            return;
          }
          const existing = Array.isArray(currentSettings.soundfontPaths) ? currentSettings.soundfontPaths : [];
          const nextPaths = existing.filter((item) => item !== current);
          const fallback = "TimGM6mb.sf2";
          const nextName = current === String(currentSettings.soundfontName || "") ? fallback : String(currentSettings.soundfontName || fallback);
          await updateSettings({ soundfontPaths: nextPaths, soundfontName: nextName }).catch(() => {});
          const list = await api.listSoundfonts().catch(() => []);
          cachedSoundfonts = Array.isArray(list) ? list : [];
          populateSoundfontSelect(select);
          select.value = nextName;
          stageSetting(entry.key, nextName);
          return;
        }

        const current = String(select.value || "");
        const m = current.match(/^user:(.+)$/);
        if (!m) return;
        const fileName = String(m[1] || "");
        if (!fileName) return;
        const ok = confirm(`Delete ABCarus installed copy of "${fileName}"?\n\nThe original external font file will not be touched.`);
        if (!ok) return;
        if (!api || typeof api.removeFont !== "function") return;
        const effectiveBeforeRemove = getEffectiveSettings();
        const res = await api.removeFont(fileName).catch(() => null);
        if (!res || !res.ok) {
          alert(res && res.error ? res.error : "Failed to remove font.");
          return;
        }
        const patch = settingsPatchForRemovedUserFont(fileName, effectiveBeforeRemove);
        if (Object.keys(patch).length) {
          const nextDraft = { ...(draftPatch || {}) };
          for (const key of Object.keys(patch)) delete nextDraft[key];
          setDraftPatch(nextDraft);
          await updateSettings(patch).catch(() => {});
        }
        setEditorFontUserFiles(getEditorFontUserFiles().filter((name) => String(name || "") !== fileName));
        await reloadFontCatalog();
        ensureUserFontFaces();
        refreshFontSelectControls();
        refreshInterfaceFontControls();
        updateRemoveEnabled();
      });

      const updateRemoveEnabled = () => {
        const current = String(select.value || "");
        if (isSoundfontSelect) {
          const canRemove = isSoundfontPath(current);
          removeBtn.disabled = !canRemove;
          removeBtn.textContent = "Remove";
          removeBtn.title = canRemove
            ? "Remove this external soundfont reference from ABCarus. The file will not be deleted."
            : "Select an external SoundFont to remove its reference.";
        } else {
          const canRemove = /^user:/.test(current);
          removeBtn.disabled = !canRemove;
          removeBtn.textContent = "Remove";
          removeBtn.title = canRemove
            ? "Delete the ABCarus-installed copy. The original external font file will not be touched."
            : "Select a font added to ABCarus to remove it.";
        }
      };
      select.addEventListener("change", updateRemoveEnabled);
      updateRemoveEnabled();

      wrap.appendChild(addBtn);
      wrap.appendChild(removeBtn);
      row.appendChild(wrap);
      controlByKey.set(entry.key, { entry, el: select, updateRemoveEnabled });
      return row;
    }

    if (kind === "color") {
      input = document.createElement("input");
      input.type = "color";
      input.addEventListener("change", () => {
        const v = String(input.value || "").trim();
        stageSetting(entry.key, v);
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    // Other inputs are handled as custom sections.
    return null;
  }

  function createGroup(title, help) {
    const group = document.createElement("div");
    group.className = "settings-group";
    const head = document.createElement("div");
    head.className = "settings-title";
    head.textContent = title;
    group.appendChild(head);
    if (help) {
      const p = document.createElement("div");
      p.className = "settings-help";
      p.textContent = help;
      group.appendChild(p);
    }
    return group;
  }

  function buildSettingsUi() {
    if (!$settingsTabsHost || !$settingsPanelsHost) return;
    $settingsTabsHost.textContent = "";
    $settingsPanelsHost.textContent = "";
    controlByKey.clear();
    if (globalHeaderView) {
      try { globalHeaderView.destroy(); } catch {}
      globalHeaderView = null;
    }
    globalHeaderStatusEl = null;

    const bySectionRaw = groupSchemaForModal(schema);
    const bySection = new Map();
    for (const [sectionName, entries] of bySectionRaw.entries()) {
      const filtered = (entries || []).filter((entry) => {
        // Hide the Drums mixer from Settings for now; users can control velocities per tune.
        if (!entry) return false;
        if (entry.key === "drumVelocityMap") return false;
        if (String(entry.section || "").toLowerCase() === "drums") return false;
        return true;
      });
      if (filtered.length) bySection.set(sectionName, filtered);
    }

    const panels = [
      { key: "general", label: "General", sections: ["General", "Dialogs"] },
      { key: "editor", label: "Editor & Notation", sections: ["General", "Tools"] },
      { key: "fonts", label: "Fonts", sections: ["Fonts"] },
      { key: "playback", label: "Playback", sections: ["Playback"] },
      { key: "library", label: "Library", sections: ["Library"] },
      { key: "print", label: "Print", sections: ["Print"] },
      { key: "importexport", label: "Import & Export", sections: ["Tools"] },
      { key: "header", label: "Global Header", sections: ["Header"] },
      { key: "microtonal", label: "Microtonal", sections: ["Tools"] },
      { key: "advanced", label: "Diagnostics & Advanced", sections: ["Tools"] },
    ];
    const panelKeys = new Set(panels.map((p) => p.key));
    settingsPanelsByKey = new Map(panels.map((p) => [p.key, p]));

    const uiState = readUiState();
    if (uiState && uiState.activeTab) {
      const rawTab = normalizeTabKey(uiState.activeTab);
      if (panelKeys.has(rawTab)) lastActiveTab = rawTab;
    }
    writeUiState({ activeTab: lastActiveTab });

    setActiveTab = (name, options = {}) => {
      lastActiveTab = normalizeTabKey(name || "general");
      writeUiState({ activeTab: lastActiveTab });
      const tabs = Array.from($settingsTabsHost.querySelectorAll("[data-settings-tab]"));
      const panels = Array.from($settingsPanelsHost.querySelectorAll("[data-settings-panel]"));
      tabs.forEach((tab) => {
        const active = tab.dataset.settingsTab === lastActiveTab;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.settingsPanel === lastActiveTab);
      });
      const meta = settingsPanelsByKey.get(lastActiveTab);
      if ($settingsSectionTitle) $settingsSectionTitle.textContent = meta ? meta.label : "";
      if ($settingsSectionHint) {
        const hint = SETTINGS_SECTION_HINTS[lastActiveTab] || "";
        $settingsSectionHint.textContent = hint;
        $settingsSectionHint.style.display = hint ? "" : "none";
      }
      if (options.applyFilter !== false && applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
      scheduleClampModalPosition();
    };

    for (const panel of panels) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "settings-tab";
      tab.dataset.settingsTab = panel.key;
      tab.setAttribute("role", "tab");
      tab.textContent = panel.label;
      tab.addEventListener("click", () => setActiveTab(panel.key));
      $settingsTabsHost.appendChild(tab);

      const panelEl = document.createElement("div");
      panelEl.className = "settings-panel";
      panelEl.dataset.settingsPanel = panel.key;
      panelEl.setAttribute("role", "tabpanel");

      for (const sectionName of panel.sections) {
        const entries = (bySection.get(sectionName) || [])
          .filter((entry) => settingsEntryBelongsToPanel(entry, panel.key, sectionName));
        const groups = new Map(); // groupTitle -> entries[]
        for (const entry of entries) {
          const title = entry && entry.group ? String(entry.group) : sectionName;
          if (!groups.has(title)) groups.set(title, []);
          groups.get(title).push(entry);
        }

        const getGroupOrder = (groupEntries) => {
          let best = Infinity;
          for (const entry of groupEntries) {
            const n = Number(entry && entry.groupOrder);
            if (Number.isFinite(n)) best = Math.min(best, n);
          }
          return best === Infinity ? 999 : best;
        };

        const orderedGroups = Array.from(groups.entries())
          .map(([title, groupEntries]) => ({ title, order: getGroupOrder(groupEntries), entries: groupEntries }))
          .sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));

        for (const g of orderedGroups) {
          const groupEntries = g.entries || [];
          const visibleEntries = groupEntries.filter((e) => e.ui && e.ui.input && e.ui.input !== "code");
          const codeEntry = groupEntries.find((e) => e.ui && e.ui.input === "code");

          if (!visibleEntries.length && !codeEntry) continue;

          const group = createGroup(g.title, null);

          const appendEntryBlock = (entry, host) => {
            const row = createRow(entry);
            if (!row) return;
            const block = document.createElement("div");
            block.className = "settings-entry";
            if (sectionName === "Fonts") block.classList.add("settings-entry--font-choice");
            block.dataset.settingsSearch = `${entry.key} ${entry.label || ""} ${entry.help || ""} ${sectionName} ${g.title}`.toLowerCase();
            block.dataset.settingsKey = String(entry.key || "");
            block.appendChild(row);
            if (entry.help && sectionName !== "Fonts") {
              const help = document.createElement("div");
              help.className = "settings-help";
              help.textContent = String(entry.help);
              block.appendChild(help);
            }
            host.appendChild(block);
          };

          const isFontsSection = sectionName === "Fonts";
          const fontsGroupHelp = isFontsSection ? "" : "";

          if (isFontsSection && fontsGroupHelp) {
            const help = document.createElement("div");
            help.className = "settings-help";
            help.textContent = fontsGroupHelp;
            group.appendChild(help);
          }

          const createCompactPairBlock = (labelText, familyKey, sizeKey) => {
            const familyEntry = groupEntries.find((e) => e && e.key === familyKey);
            const sizeEntry = groupEntries.find((e) => e && e.key === sizeKey);
            if (!familyEntry || !sizeEntry) return null;

            const familyRow = createRow(familyEntry);
            const sizeRow = createRow(sizeEntry);
            const familyControl = familyRow
              ? (familyRow.querySelector(".settings-select-row") || familyRow.querySelector("input, select, textarea"))
              : null;
            const sizeControl = sizeRow
              ? (sizeRow.querySelector(".settings-select-row") || sizeRow.querySelector("input, select, textarea"))
              : null;
            if (!familyControl || !sizeControl) return null;

            const block = document.createElement("div");
            block.className = "settings-entry settings-entry--compact-pair";
            block.dataset.settingsSearch =
              `${familyEntry.key} ${familyEntry.label || ""} ${familyEntry.help || ""} ${sizeEntry.key} ${sizeEntry.label || ""} ${sizeEntry.help || ""} ${sectionName} ${g.title}`.toLowerCase();

            const label = document.createElement("span");
            label.textContent = labelText;
            block.appendChild(label);

            const pair = document.createElement("div");
            pair.className = "settings-fontpair";

            const familyField = document.createElement("div");
            familyField.className = "settings-fontpair-field";
            const familyLabel = document.createElement("div");
            familyLabel.className = "settings-fontpair-label";
            familyLabel.textContent = "Family";
            familyField.appendChild(familyLabel);
            familyField.appendChild(familyControl);

            const sizeField = document.createElement("div");
            sizeField.className = "settings-fontpair-field";
            const sizeLabel = document.createElement("div");
            sizeLabel.className = "settings-fontpair-label";
            sizeLabel.textContent = "Size";
            sizeField.appendChild(sizeLabel);
            sizeField.appendChild(sizeControl);

            pair.appendChild(familyField);
            pair.appendChild(sizeField);

            block.appendChild(pair);
            return block;
          };

          const createCompactFontTableBlock = (rows) => {
            const rowSpecs = Array.isArray(rows) ? rows : [];
            const resolved = [];
            for (const spec of rowSpecs) {
              if (!spec) continue;
              const familyEntry = groupEntries.find((e) => e && e.key === spec.familyKey);
              const sizeEntry = groupEntries.find((e) => e && e.key === spec.sizeKey);
              if (!familyEntry || !sizeEntry) continue;

              const familyRow = createRow(familyEntry);
              const sizeRow = createRow(sizeEntry);
              const familyControl = familyRow
                ? (familyRow.querySelector(".settings-select-row") || familyRow.querySelector("input, select, textarea"))
                : null;
              const sizeControl = sizeRow ? sizeRow.querySelector("input, select, textarea") : null;
              if (!familyControl || !sizeControl) continue;
              resolved.push({
                label: String(spec.label || ""),
                familyEntry,
                sizeEntry,
                familyControl,
                sizeControl,
              });
            }

            if (!resolved.length) return null;

            const block = document.createElement("div");
            block.className = "settings-entry settings-entry--fonttable";
            block.dataset.settingsSearch = resolved.map((r) =>
              `${r.familyEntry.key} ${r.familyEntry.label || ""} ${r.familyEntry.help || ""} ${r.sizeEntry.key} ${r.sizeEntry.label || ""} ${r.sizeEntry.help || ""} ${sectionName} ${g.title}`
            ).join(" ").toLowerCase();

            const label = document.createElement("span");
            label.textContent = "";
            block.appendChild(label);

            const table = document.createElement("div");
            table.className = "settings-fonttable";

            const headBlank = document.createElement("div");
            headBlank.className = "settings-fonttable-head";
            headBlank.textContent = "";
            const headFamily = document.createElement("div");
            headFamily.className = "settings-fonttable-head";
            headFamily.textContent = "Family";
            const headSize = document.createElement("div");
            headSize.className = "settings-fonttable-head";
            headSize.textContent = "Size";
            table.appendChild(headBlank);
            table.appendChild(headFamily);
            table.appendChild(headSize);

            for (const r of resolved) {
              const cellLabel = document.createElement("div");
              cellLabel.className = "settings-fonttable-rowlabel";
              cellLabel.textContent = r.label;
              const cellFamily = document.createElement("div");
              cellFamily.className = "settings-fonttable-cell";
              cellFamily.appendChild(r.familyControl);
              const cellSize = document.createElement("div");
              cellSize.className = "settings-fonttable-cell";
              cellSize.appendChild(r.sizeControl);
              table.appendChild(cellLabel);
              table.appendChild(cellFamily);
              table.appendChild(cellSize);
            }

            block.appendChild(table);
            return block;
          };

          const createCompactTogglesBlock = (labelText, keyA, keyB) => {
            const aEntry = groupEntries.find((e) => e && e.key === keyA);
            const bEntry = groupEntries.find((e) => e && e.key === keyB);
            if (!aEntry || !bEntry) return null;
            const aRow = createRow(aEntry);
            const bRow = createRow(bEntry);
            const aInput = aRow ? aRow.querySelector("input[type=\"checkbox\"]") : null;
            const bInput = bRow ? bRow.querySelector("input[type=\"checkbox\"]") : null;
            if (!aInput || !bInput) return null;

            const block = document.createElement("div");
            block.className = "settings-entry settings-entry--compact-toggles";
            block.dataset.settingsSearch =
              `${aEntry.key} ${aEntry.label || ""} ${aEntry.help || ""} ${bEntry.key} ${bEntry.label || ""} ${bEntry.help || ""} ${sectionName} ${g.title}`.toLowerCase();

            const label = document.createElement("span");
            label.textContent = labelText;
            block.appendChild(label);

            const row = document.createElement("div");
            row.className = "settings-fonttoggles";

            const aLabel = document.createElement("label");
            aLabel.className = "settings-toggle";
            aLabel.appendChild(aInput);
            const aText = document.createElement("span");
            aText.textContent = String(aEntry.label || "");
            aLabel.appendChild(aText);

            const bLabel = document.createElement("label");
            bLabel.className = "settings-toggle";
            bLabel.appendChild(bInput);
            const bText = document.createElement("span");
            bText.textContent = String(bEntry.label || "");
            bLabel.appendChild(bText);

            row.appendChild(aLabel);
            row.appendChild(bLabel);

            block.appendChild(row);
            return block;
          };

          if (isFontsSection && g.title === "Interface") {
            const table = createCompactFontTableBlock([
              { label: "Interface", familyKey: "uiFontFamily", sizeKey: "uiFontSize" },
              { label: "Library", familyKey: "libraryUiFontFamily", sizeKey: "libraryUiFontSize" },
            ]);
            if (table) group.appendChild(table);
          } else if (isFontsSection && g.title === "Editor") {
            const pair = createCompactPairBlock("", "editorFontFamily", "editorFontSize");
            if (pair) group.appendChild(pair);
            const toggles = createCompactTogglesBlock("Bold", "editorNotesBold", "editorLyricsBold");
            if (toggles) group.appendChild(toggles);
          } else {
            for (const entry of visibleEntries) appendEntryBlock(entry, group);
          }

          if (codeEntry) {
            const editorBlock = document.createElement("div");
            editorBlock.className = "settings-entry";
            editorBlock.dataset.settingsSearch = `${codeEntry.key} ${codeEntry.label || ""} ${codeEntry.help || ""} ${sectionName} ${g.title}`.toLowerCase();

            const editorHost = document.createElement("div");
            editorHost.className = "settings-editor";
            editorHost.setAttribute("aria-label", String(codeEntry.label || "Settings editor"));
            editorBlock.appendChild(editorHost);

            if (codeEntry.help) {
              const help = document.createElement("div");
              help.className = "settings-help";
              help.textContent = String(codeEntry.help);
              editorBlock.appendChild(help);
            }

            const updateListener = EditorView.updateListener.of((update) => {
              if (!update.docChanged || suppressGlobalUpdate) return;
              globalHeaderDraftDirty = update.state.doc.toString() !== globalHeaderFileText;
              if (globalHeaderDraftDirty) scheduleGlobalHeaderSave();
            });
            const state = EditorState.create({
              doc: "",
              extensions: [
                basicSetup,
                rectSelectionExt,
                updateListener,
                EditorState.tabSize.of(2),
                indentUnit.of("  "),
              ],
            });
            globalHeaderView = new EditorView({ state, parent: editorHost });
            globalHeaderStatusEl = document.createElement("div");
            globalHeaderStatusEl.className = "settings-help settings-global-header-status";
            editorBlock.appendChild(globalHeaderStatusEl);
            updateGlobalHeaderStatus(globalHeaderFileExists ? "Saved" : "Optional file does not exist yet.");
            group.appendChild(editorBlock);
          }

          panelEl.appendChild(group);
        }
      }

      $settingsPanelsHost.appendChild(panelEl);
    }

    // Rehydrate control values after rebuilding the UI (e.g. mode switch).
    applySettings(currentSettings);
    setActiveTab(lastActiveTab);

    applySettingsFilter = (raw) => {
      const needle = String(raw || "").trim().toLowerCase();
      const anyQuery = Boolean(needle);
      const matchesByPanel = new Map();
      const panelEls = Array.from($settingsPanelsHost.querySelectorAll("[data-settings-panel]"));

      for (const panelEl of panelEls) {
        const blocks = Array.from(panelEl.querySelectorAll(".settings-entry"));
        const groups = Array.from(panelEl.querySelectorAll(".settings-group"));
        let panelMatches = 0;

        for (const block of blocks) {
          const hay = String(block.dataset.settingsSearch || "");
          const match = !anyQuery || hay.includes(needle);
          block.style.display = match ? "" : "none";
          if (anyQuery && match) panelMatches += 1;
        }

        for (const group of groups) {
          const visible = Boolean(group.querySelector(".settings-entry:not([style*='display: none'])"));
          group.style.display = visible ? "" : "none";
        }

        matchesByPanel.set(panelEl.dataset.settingsPanel, anyQuery ? panelMatches : blocks.length);
      }

      const tabs = Array.from($settingsTabsHost.querySelectorAll("[data-settings-tab]"));
      const matchingTabs = [];
      for (const tab of tabs) {
        const key = tab.dataset.settingsTab;
        const hasMatches = !anyQuery || (matchesByPanel.get(key) || 0) > 0;
        tab.hidden = !hasMatches;
        if (hasMatches) matchingTabs.push(key);
      }

      if (anyQuery) {
        if (matchingTabs.length === 1 && matchingTabs[0] !== lastActiveTab) {
          setActiveTab(matchingTabs[0], { applyFilter: false });
        } else if (matchingTabs.length > 1 && !matchingTabs.includes(lastActiveTab)) {
          setActiveTab(matchingTabs[0], { applyFilter: false });
        }
      }

      if ($settingsNoResults) {
        if (!anyQuery) {
          $settingsNoResults.classList.add("hidden");
          $settingsNoResults.textContent = "";
        } else if (!matchingTabs.length) {
          $settingsNoResults.classList.remove("hidden");
          $settingsNoResults.textContent = "No matches in settings.";
        } else {
          $settingsNoResults.classList.add("hidden");
          $settingsNoResults.textContent = "";
        }
      }
      scheduleClampModalPosition();
    };
  }

  if ($settingsClose) {
    $settingsClose.addEventListener("click", () => { void closeSettings({ discardDraft: true }); });
  }
  if ($settingsModal) {
    $settingsModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void closeSettings({ discardDraft: true });
      }
    });
  }
  if ($settingsFilter) {
    $settingsFilter.addEventListener("input", () => {
      if (applySettingsFilter) applySettingsFilter($settingsFilter.value);
    });
  }
  if ($settingsReset) {
    $settingsReset.addEventListener("click", async () => {
      // Preserve previous behavior: reset only what the Settings modal owns.
      const patch = {};
      for (const entry of schema) {
        if (!entry || !entry.key || !entry.ui || !entry.ui.input || entry.legacy) continue;
        if (entry.key === "drumVelocityMap") continue;
        if (String(entry.section || "").toLowerCase() === "drums") continue;
        patch[entry.key] = entry.default;
      }
      await flushGlobalHeaderSave().catch(() => false);
      await updateSettings(patch).catch(() => {});
    });
  }
  if ($settingsCancel) $settingsCancel.addEventListener("click", () => { void closeSettings({ discardDraft: true }); });
  if ($settingsOk) {
    $settingsOk.addEventListener("click", async () => {
      const headerSaved = await flushGlobalHeaderSave().catch(() => false);
      if (!headerSaved) return;
      const settingsSaved = await applyDraftPatch().catch(() => false);
      if (!settingsSaved) return;
      await closeSettings({ discardDraft: false });
    });
  }
  if ($settingsResetSection) {
    $settingsResetSection.addEventListener("click", async () => {
      const meta = settingsPanelsByKey.get(lastActiveTab);
      const sectionLabel = meta ? meta.label : "this section";
      if (!confirm(`Restore defaults for this section?\n\n(${sectionLabel})`)) return;

      const patch = {};
      for (const entry of schema) {
        if (!entry || !entry.key || !entry.ui || !entry.ui.input || entry.legacy) continue;
        if (entry.key === "drumVelocityMap") continue;
        if (String(entry.section || "").toLowerCase() === "drums") continue;
        if (!meta || !meta.sections.includes(String(entry.section || ""))) continue;
        patch[entry.key] = entry.default;
      }

      const nextDraft = { ...(draftPatch || {}) };
      for (const key of Object.keys(patch)) delete nextDraft[key];
      setDraftPatch(nextDraft);

      const headerSaved = await flushGlobalHeaderSave().catch(() => false);
      if (!headerSaved) return;
      await updateSettings(patch).catch(() => {});
      buildSettingsUi();
      if (typeof setActiveTab === "function") setActiveTab(lastActiveTab);
    });
  }

  if ($settingsExport) {
    $settingsExport.addEventListener("click", async () => {
      if (!api || typeof api.exportSettings !== "function") return;
      const headerSaved = await flushGlobalHeaderSave().catch(() => false);
      if (!headerSaved) return;
      const res = await api.exportSettings().catch(() => null);
      if (res && res.ok === false && String(res.error || "").toLowerCase() === "canceled") return;
      if (!res || !res.ok || !res.path) {
        alert((res && res.error) ? res.error : "Failed to export profile.");
        return;
      }
      const exported = [];
      if (res.exportedHeader) exported.push("user_settings.abc");
      if (Number(res.exportedFonts) > 0) exported.push(`${Number(res.exportedFonts)} added font file(s)`);
      const note = exported.length ? `\n(incl. ${exported.join(", ")})` : "";
      alert(`Profile exported:\n${res.path}${note}`);
    });
  }

  if ($settingsImport) {
    $settingsImport.addEventListener("click", async () => {
      if (!api || typeof api.importSettings !== "function") return;
      const headerSaved = await flushGlobalHeaderSave().catch(() => false);
      if (!headerSaved) return;
      const res = await api.importSettings().catch(() => null);
      if (res && res.ok === false && String(res.error || "").toLowerCase() === "canceled") return;
      if (!res || !res.ok) {
        alert((res && res.error) ? res.error : "Failed to import profile.");
        return;
      }
      if (res.settings) applySettings(res.settings);
      if (Number(res.importedFonts) > 0) {
        await reloadFontCatalog();
        ensureUserFontFaces();
      }
      buildSettingsUi();
      await loadGlobalHeaderFile();
      if (typeof setActiveTab === "function") setActiveTab(lastActiveTab);
      const imported = [];
      if (res.importedHeader) imported.push("Global Header");
      if (Number(res.importedFonts) > 0) imported.push(`${Number(res.importedFonts)} font file(s)`);
      const note = imported.length ? ` (incl. ${imported.join(", ")})` : "";
      alert(`Profile imported${note}.\nSome changes apply immediately; others may require a restart.`);
    });
  }

  store.subscribe((settings) => {
    if (settings) applySettings(settings);
  });

  if ($renderPane) {
    $renderPane.addEventListener("pointerdown", () => { activePane = "render"; });
  }
  if ($editorPane) {
    $editorPane.addEventListener("pointerdown", () => { activePane = "editor"; });
  }

  const initPromise = (async () => {
    const schemaRes = await store.getSchema().catch(() => null);
    if (schemaRes && schemaRes.ok && Array.isArray(schemaRes.schema)) schema = schemaRes.schema;
    if (api && typeof api.getFontDirs === "function") {
      const res = await api.getFontDirs().catch(() => null);
      if (res && res.ok) {
        cachedFontDirs = { bundledDir: String(res.bundledDir || ""), userDir: String(res.userDir || "") };
      }
    }
    await reloadFontCatalog();
    if (api && typeof api.listSoundfonts === "function") {
      const list = await api.listSoundfonts().catch(() => []);
      cachedSoundfonts = Array.isArray(list) ? list : [];
    }
    defaultSettings = buildDefaults(schema);
    buildSettingsUi();
    initSettingsDrag();
    const settings = await store.get().catch(() => null);
    if (settings) applySettings(settings);
    await loadGlobalHeaderFile();
    if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
  })();

  function normalizeTabKey(raw) {
    const key = String(raw || "").trim().toLowerCase();
    if (!key) return "general";
    if (key === "main") return "general";
    if (key === "editor") return "editor";
    if (key === "import" || key === "importexport" || key === "import/export" || key === "xml") return "importexport";
    if (key === "tools") return "editor";
    if (key === "library") return "library";
    if (key === "dialogs") return "general";
    if (key === "options") return "general";
    if (knownTabs.has(key)) return key;
    return "general";
  }

  async function openTab(tabKey) {
    await initPromise.catch(() => {});
    lastActiveTab = normalizeTabKey(tabKey);
    await openSettings();
  }

  return {
    openSettings,
    openTab,
    closeSettings,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    zoomReset,
    resetEditorZoom: () => updateSettings({ editorZoom: 1 }),
    setActivePane: (pane) => { activePane = pane; },
  };
}
