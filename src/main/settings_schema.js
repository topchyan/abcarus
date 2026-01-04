function getPlatformDefaults() {
  return {
    // On Cinnamon/GTK, native file dialogs can appear off-screen; portal dialogs are more reliable.
    usePortalFileDialogs: process.platform === "linux",
  };
}

function getSettingsSchema() {
  const platformDefaults = getPlatformDefaults();
  return [
    {
      key: "renderZoom",
      type: "number",
      default: 1,
      section: "General",
      label: "Score zoom (%)",
      help: "Zoom level for the rendered score (50–800%).",
      ui: { input: "percent", min: 50, max: 800, step: 5 },
    },
    {
      key: "editorZoom",
      type: "number",
      default: 1,
      section: "General",
      label: "Editor zoom (%)",
      help: "Zoom level for the editor (50–800%).",
      ui: { input: "percent", min: 50, max: 800, step: 5 },
    },
    {
      key: "followPlayback",
      type: "boolean",
      default: true,
      section: "Playback",
      label: "Follow playback",
      help: "Controls the Follow toggle in the toolbar.",
      // UI control lives in the main toolbar, not in the Settings modal.
    },
    {
      key: "soundfontName",
      type: "string",
      default: "TimGM6mb.sf2",
      section: "Playback",
      label: "Soundfont",
      help: "Default soundfont for playback (controlled via the toolbar).",
    },
    {
      key: "drumVelocityMap",
      type: "object",
      default: {},
      section: "Playback",
      label: "Drum mixer",
      help: "Default velocities for GM drum pitches. Tune-specific velocities still apply.",
      ui: { input: "drumVelocityMap" },
      advanced: true,
    },
    {
      key: "useNativeTranspose",
      type: "boolean",
      default: true,
      section: "Tools",
      label: "Use native transpose",
      help: "When enabled, semitone transposition runs via the built-in JS engine.",
      ui: { input: "checkbox" },
    },
    {
      key: "autoAlignBarsAfterTransforms",
      type: "boolean",
      default: false,
      section: "Tools",
      label: "Auto-align bars after transforms",
      help: "After running a transform, optionally align bar spacing for readability.",
      ui: { input: "checkbox" },
      advanced: true,
    },
    {
      key: "abc2xmlArgs",
      type: "string",
      default: "",
      section: "Import/Export",
      label: "abc2xml flags",
      help: "Space-separated flags passed to abc2xml.",
      ui: { input: "text", placeholder: "-x -y=value" },
      advanced: true,
    },
    {
      key: "xml2abcArgs",
      type: "string",
      default: "",
      section: "Import/Export",
      label: "xml2abc flags",
      help: "Space-separated flags passed to xml2abc.",
      ui: { input: "text", placeholder: "-x -y=value" },
      advanced: true,
    },
    {
      key: "globalHeaderEnabled",
      type: "boolean",
      default: true,
      section: "Header",
      label: "Enable global header",
      help: "Prepended before file headers and tunes during render/playback.",
      ui: { input: "checkbox" },
    },
    {
      key: "globalHeaderText",
      type: "string",
      default: "",
      section: "Header",
      label: "Global header",
      help: "Prepended before file headers and tunes during render/playback.",
      ui: { input: "code" },
    },
    {
      key: "editorFontFamily",
      type: "string",
      default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      section: "Editor",
      label: "Font family",
      ui: { input: "text" },
    },
    {
      key: "editorFontSize",
      type: "number",
      default: 13,
      section: "Editor",
      label: "Font size",
      ui: { input: "number", min: 8, max: 32, step: 1 },
    },
    {
      key: "editorNotesBold",
      type: "boolean",
      default: true,
      section: "Editor",
      label: "Bold notes",
      ui: { input: "checkbox" },
    },
    {
      key: "editorLyricsBold",
      type: "boolean",
      default: true,
      section: "Editor",
      label: "Bold inline lyrics",
      ui: { input: "checkbox" },
    },
    {
      key: "usePortalFileDialogs",
      type: "boolean",
      default: platformDefaults.usePortalFileDialogs,
      section: "Dialogs",
      label: "Use portal file dialogs (Linux)",
      help: "Improves Open/Save dialog placement on some Linux desktops.",
      ui: { input: "checkbox" },
      advanced: true,
    },
    {
      key: "libraryAutoRenumberAfterMove",
      type: "boolean",
      default: false,
      section: "Library",
      label: "Auto-renumber X after move",
      help: "When moving a tune between files, renumber X headers in both files to be sequential (starting at the first X).",
      ui: { input: "checkbox" },
    },
    // Non-modal / internal / persisted UI prefs (kept for compatibility).
    { key: "soundfontPaths", type: "array", default: [], section: "Advanced", advanced: true, legacy: true },
    { key: "disclaimerSeen", type: "boolean", default: false, section: "Advanced", advanced: true, legacy: true },
    { key: "errorsEnabled", type: "boolean", default: false, section: "Advanced", advanced: true, legacy: true },
    { key: "usePortalFileDialogsSetByUser", type: "boolean", default: false, section: "Advanced", advanced: true, legacy: true },
    { key: "libraryPaneVisible", type: "boolean", default: false, section: "Advanced", advanced: true, legacy: true },
    { key: "libraryPaneWidth", type: "number", default: 280, section: "Advanced", advanced: true, legacy: true },
    { key: "libraryGroupBy", type: "string", default: "file", section: "Advanced", advanced: true, legacy: true },
    { key: "librarySortBy", type: "string", default: "update_desc", section: "Advanced", advanced: true, legacy: true },
    { key: "libraryFilterText", type: "string", default: "", section: "Advanced", advanced: true, legacy: true },
    { key: "libraryUiStateByRoot", type: "object", default: {}, section: "Advanced", advanced: true, legacy: true },
  ];
}

function getDefaultSettingsFromSchema(schema) {
  const out = {};
  for (const entry of schema) {
    if (!entry || !entry.key) continue;
    out[entry.key] = entry.default;
  }
  return out;
}

function getDefaultSettings() {
  return getDefaultSettingsFromSchema(getSettingsSchema());
}

module.exports = {
  getSettingsSchema,
  getDefaultSettings,
};
