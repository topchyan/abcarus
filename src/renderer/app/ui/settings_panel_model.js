const PANEL_KEYS = {
  editor: new Set([
    "editorHelpEnabled",
    "useNativeTranspose",
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

export const SETTINGS_SECTION_HINTS = {
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

export function settingsEntryBelongsToPanel(entry, panelKey, sectionName) {
  const key = String(entry && entry.key || "");
  for (const [candidate, keys] of Object.entries(PANEL_KEYS)) {
    if (keys.has(key)) return candidate.toLowerCase() === String(panelKey || "").toLowerCase();
  }
  if (panelKey === "general") return sectionName === "General" || sectionName === "Dialogs";
  return sectionName.toLowerCase() === panelKey.toLowerCase();
}
