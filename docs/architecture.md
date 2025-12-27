# Architecture and Data Flow

This document explains how ABCarus is structured, with references to the main modules.

## Process model
ABCarus is an Electron app with a main process and a renderer process:
- Main process: window lifecycle, menu, native dialogs, filesystem access, library scanning, conversion backends (`src/main/index.js`, `src/main/ipc.js`, `src/main/menu.js`).
- Renderer process: UI, editor, library interactions, rendering, playback, and feature logic (`src/renderer/renderer.js`).
- Preload bridge: safe IPC surface for the renderer (`src/preload.js`).

## Main process responsibilities
`src/main/index.js`:
- Creates the `BrowserWindow` and loads `src/renderer/index.html`.
- Controls application state (recent items, settings) and persists it to `state.json` in `app.getPath("userData")`.
- Scans folders and parses `.abc` files into tunes (tune boundaries and metadata).
- Provides printing and PDF export using Electron's printing APIs.

`src/main/ipc.js`:
- Defines IPC handlers for file dialogs, filesystem I/O, library scan, print/export, and conversions.
- Wraps conversion backends and returns structured error payloads to the renderer.

`src/main/menu.js`:
- Defines the native application menu, keyboard shortcuts, and menu actions.
- Sends menu actions to the renderer via `menu:action` IPC.

## Renderer process responsibilities
`src/renderer/renderer.js`:
- Creates the CodeMirror editor, handles shortcuts, and tracks dirty state.
- Manages the library view (grouping, selection, filtering, context menus).
- Performs render pipeline with abc2svg and manages the SVG output.
- Drives playback using abc2svg's `snd-1.js` and soundfont data.
- Implements file operations (save/append, save-as, move/copy/delete tunes).

`src/renderer/settings.js`:
- Settings modal logic and UI state.
- Sends settings updates to the main process for persistence.

`src/renderer/index.html` and `src/renderer/style.css`:
- UI structure and styling for panes, modals, and editor/render layout.

## Preload bridge
`src/preload.js` exposes a small API to the renderer:
- Dialogs (open/save/confirm).
- File I/O, library scanning, and printing.
- Conversion endpoints for MusicXML and abc2abc transforms.
- Settings access and updates.

The renderer does not access Node APIs directly; it uses these IPC methods.

## Key data flows

### Library scan and tune index
1. Renderer asks to scan a folder: `window.api.scanLibrary`.
2. Main process recursively discovers `.abc` files and parses each into tunes (`scanLibrary` and `buildTunesFromContent`).
3. Renderer receives a library index (`{ root, files: [{ path, tunes }] }`) and renders the tree.

### Tune selection and editing
1. Renderer loads the tune slice using offsets and displays it in the editor.
2. Changes set the document as dirty and trigger re-render.
3. Saving either replaces the tune in-place (if loaded from a file) or appends a new tune to the active file.

### Rendering pipeline
1. Renderer uses abc2svg (`third_party/abc2svg/abc2svg-1.js`) to convert ABC to SVG.
2. Errors and warnings are collected into the sidebar error panel.
3. Annotations create SVG rectangles that map note positions back to source indices.

### Playback pipeline
1. Soundfont data is read via preload and cached in `window.abc2svg.sf2`.
2. The abc2svg player (`snd-1.js`) is fed the parsed tune.
3. Playback events highlight notes in both the SVG and editor.

### Import/export pipeline
- Import MusicXML/MXL: main process runs `xml2abc.py`, returns ABC to the renderer.
- Export MusicXML: main process runs `abc2xml.py` on the current editor buffer.
- abc2abc transforms: main process executes the `abc2abc` binary and returns updated ABC text.

## External dependencies and upgrade points
Bundled tools are in `third_party/`:
- `abc2svg` for rendering and playback.
- `abc2xml` and `xml2abc` for conversion.
- `abcMIDI` (specifically `abc2abc`) for transformations.
- Soundfonts (`third_party/sf2/`).

Upgrading these components may require updates to:
- Script paths and load logic (`src/main/conversion/index.js`).
- Rendering or playback APIs in `src/renderer/renderer.js`.

## Limitations visible in code
- No automated tests or build/packaging scripts.
- "Save As" is implemented but not wired to a menu action.
- Single-window UI; no session restoration beyond saved recents/settings.
