# Features and Behavior

This document describes features implemented in the current codebase. Paths refer to source locations that define the behavior.

## Core editing workflow
- ABC text is edited in a CodeMirror instance (`src/renderer/renderer.js`).
- The editor uses custom styling for headers, directives, comments, and lyrics (`src/renderer/renderer.js`, `src/renderer/style.css`).
- Changes mark the current document as dirty and trigger a debounced re-render of the score.
- A template tune is available for "New from Template" (`TEMPLATE_ABC` in `src/renderer/renderer.js`).

## Library scanning and tune indexing
- Folder scan is recursive and finds all `.abc` files (`scanLibrary` in `src/main/index.js`).
- Each file is parsed into tunes by `X:` headers (`buildTunesFromContent` in `src/main/index.js`).
- Tune metadata is extracted from headers: `T`, `C`, `K`, `M`, `L`, `Q`, `R`, `S`, `O`, `G` (`extractTuneHeader` in `src/main/index.js`).
- The library sidebar groups by file or by header tag (X, C, M, K, L, Q, R, S, O, G) (`renderLibraryTree` and grouping helpers in `src/renderer/renderer.js`).

## Tune navigation and selection
- Selecting a tune loads only its slice from the file (`selectTune` in `src/renderer/renderer.js`).
- Recent tunes, files, and folders are tracked and surfaced in the menu (`src/main/index.js`, `src/main/menu.js`).
- A "Find in Library" modal filters the library by a header tag value (`applyLibraryTagFilter` in `src/renderer/renderer.js`).

## File operations
Implemented file actions are routed through the main process via IPC:
- New / New from Template / Open / Open Folder / Save / Save As / Close (`src/main/menu.js`, `src/renderer/renderer.js`).
- Save behavior depends on context:
  - If a tune loaded from a file is active, saving replaces that tune in the source file (`saveActiveTuneToSource` in `src/renderer/renderer.js`).
  - If no file-backed tune is active, saving appends the tune to the currently selected library file and assigns a new `X:` number (`performAppendFlow` in `src/renderer/renderer.js`).
  - If no target file is selected in the library, saving shows an error.
- "Save As" is implemented and wired in the app menu (`performSaveAsFlow` in `src/renderer/renderer.js`, menu in `src/main/menu.js`).
- Unsaved changes prompt users before destructive actions (`confirmUnsavedChanges` via IPC).

## Library editing actions
The library tree supports per-tune file operations:
- Copy, cut, paste, move, and delete tunes via context menu (`initContextMenu`, `copyTuneById`, `pasteClipboardToFile`, `deleteTuneById` in `src/renderer/renderer.js`).
- Drag-and-drop a tune to another file entry to move it (with confirmation).
- Moving a tune copies it to the target file (with a new `X:`) and removes it from the source file.

## Rendering (notation preview)
- Rendering uses abc2svg scripts loaded in `src/renderer/index.html` and run from `renderNow` in `src/renderer/renderer.js`.
- The renderer collects SVG fragments (`img_out`) and injects them into the preview pane.
- Note highlights are added by abc2svg annotations and synchronized with the editor selection.
- Clicking on a highlighted note in the render pane moves the editor cursor to the corresponding ABC position.
- Render errors and warnings are captured and shown in the sidebar error panel.

## Playback (audio)
- Playback uses `snd-1.js` from abc2svg and a soundfont file loaded via the preload API (`ensureSoundfontLoaded` in `src/renderer/renderer.js`).
- Player state tracks current position and supports:
  - Start over (F4) and play/pause (F5) (`src/main/menu.js`, `src/renderer/renderer.js`).
  - Previous/next measure via the Play menu (`src/main/menu.js`).
- Selection-first playback:
  - If a non-empty editor selection exists, playback runs that selection range.
  - If no selection exists, playback runs from the current playhead/cursor context.
  - Selection loop behavior is controlled by Settings (`playbackSelectionLoopEnabled`).
- Playback highlights notes in both the rendered SVG and editor.
- Selection playback controls live in Settings (Playback -> Selection):
  - `playbackSelectionLoopEnabled` (`Loop selection`)
  - `playbackSelectionSuppressRepeats` (`Selection: suppress repeats`)
  - `playbackSelectionMuteGchords` (`Selection: mute chord symbols`)
  - `playbackSelectionAllowMidiDrums` (`Selection: allow MIDI drums`, best-effort)
  - `playbackSelectionMutedVoices` (`Selection: muted voices`; `1` always targets the de-facto first voice; best-effort; inline `[V:...]` switches are not supported)
- MIDI drums are supported via abc2svg (`%%MIDI drum`, `%%MIDI drumon`, `%%MIDI drumbars`).

## Transformations
Transform actions are implemented natively in the renderer:

Native (renderer):
- Transpose up/down one semitone (portable `transposeAbc` API in `src/shared/abc-transpose/`), including chord symbols (`"C#m7/G#"` style gchords).
- Double/half note lengths (`transformLengthScaling` in `src/renderer/renderer.js`).
- "Align Bars" tool realigns bars in the editor text (`alignBarsInEditor`).
- Set measures per line (1–9) via a conservative in-place reflow that preserves non-music constructs.

## Import / export
- Import MusicXML or MXL: `xml2abc.py` (Python) converts to ABC (`src/main/conversion/backends/xml2abc.js`).
- Import MIDI (`.mid`, `.midi`):
  - Default backend mode: `auto` (tries `midi2xml (music21) -> xml2abc`, falls back to bundled `midi2abc`).
  - Explicit backends: bundled `midi2abc` (`src/main/conversion/backends/midi2abc.js`) or `midi2xml (music21) -> MusicXML -> xml2abc` (`third_party/midi2xml/midi2xml.py` + `src/main/conversion/backends/midi2abc_music21.js`), experimental.
- Export MusicXML: `abc2xml.py` (Python) converts ABC to MusicXML (`src/main/conversion/backends/abc2xml.js`).
- Export PDF: render pane is printed to PDF via Electron printing (`print:pdf` IPC).
- Print preview opens a temporary PDF file and uses the OS PDF viewer (`print:preview` IPC).

## Settings
Settings are stored in the app state JSON and applied at launch (`src/main/index.js`).
Editable settings include:
- Editor and render zoom.
- Editor font family and size.
- Bold styling for notes and inline lyrics.
- CLI args for `abc2xml` and `xml2abc` converters.
- Playback selection behavior (loop, repeat flattening, gchord mute, voice mute list, MIDI drums best-effort).

## Error handling and feedback
- The status bar shows high-level status (Ready, Rendering, Importing, etc.).
- Errors are collected into a sidebar error pane; clicking an error jumps to the reported line/column when available.
- File and conversion errors are shown via native dialogs from the main process.

## Platform and scope notes
- Desktop app only (Electron).
- No automated tests are defined (only small harness scripts for core transforms).
- Packaging/build scripts exist for AppImage and electron-builder (see [docs/packaging.md](packaging.md)).
- Network access is not used by default; external resources are local.
