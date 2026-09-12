## Settings audit

### Source of truth

Settings metadata and defaults live in `src/main/settings_schema.js`.

Main process owns:
- persistence (`abcarus-profile.json`; under Electron `userData` for installed builds)
- validation/normalization on write (`updateSettings()` in `src/main/index.js`)

Renderer owns:
- Settings modal layout (`src/renderer/settings.js`)
- UI-only “controls elsewhere” (e.g. toolbar toggles) that still persist to the same settings object.

### User-facing settings (Settings modal)

Grouped as displayed in the Settings modal:

**Main**
- `renderZoom` (default `1`) — Score zoom (%)
- `editorZoom` (default `1`) — Editor zoom (%)
- `editorFontFamily` (default monospace stack) — Font family
- `editorFontSize` (default `13`) — Font size
- `editorNotesBold` (default `true`) — Bold notes
- `editorLyricsBold` (default `true`) — Bold inline lyrics
- `useNativeTranspose` (default `true`) — Use native transpose
- `libraryAutoRenumberAfterMove` (default `false`) — Auto-renumber X after move
- `usePortalFileDialogs` (default: `true` on Linux, else `false`) — Use portal file dialogs (Linux) *(Advanced)*

### Electron upgrade checkpoint

When upgrading Electron, retest Linux file dialogs with portal mode enabled and a
remembered directory/file. Verify both of these invariants together:

- the dialog opens above and centered relative to ABCarus;
- `defaultPath` (or the portal equivalent, such as `current_folder`) is honored.

Native GTK dialogs currently honor remembered paths more reliably in this
environment but can lose their transient parent and appear behind the app or at
the screen origin. Keep portal dialogs as the default until an Electron upgrade
proves both behaviors work together.

**Import/Export**
- `abc2xmlArgs` (default `""`) — abc2xml flags *(Advanced)*
- `xml2abcArgs` (default `""`) — xml2abc flags *(Advanced)*

**Header**
- `globalHeaderEnabled` (default `true`) — Enable global header
- `globalHeaderText` (legacy import only; runtime Global Header lives in `user_settings.abc`)

**Drums**
- `drumVelocityMap` (default `{}`) — Drum mixer *(Advanced)*

### Settings controlled elsewhere (not in Settings modal)

These settings remain part of the schema for documentation and compatibility, but are controlled in other UI surfaces:
- `followPlayback` — toolbar Follow toggle
- `soundfontName` — toolbar soundfont selector
- `soundfontPaths` — soundfont add/remove flow

### Legacy / internal persisted keys

These keys are kept for backward compatibility and/or internal UI state persistence:
- `disclaimerSeen`
- `errorsEnabled` (intentionally forced Off on persist)
- `usePortalFileDialogsSetByUser`
- `libraryPaneVisible`, `libraryPaneWidth`, `libraryGroupBy`, `librarySortBy`, `libraryFilterText`, `libraryUiStateByRoot`
