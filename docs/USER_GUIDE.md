# ABCarus User Guide

ABCarus is a desktop app for working with music in ABC notation. It is optimized for large collections of `.abc` files and treats each tune (from `X:` to the next `X:`) as an independent unit.

## Contents

- Getting started
- Files vs tunes
- Building and using a library
- Editing, preview, and errors
- Saving (replace vs append)
- Managing tunes (copy/move/delete)
- Set List (build a playlist file)
- Playback
- Print and export
- Import/export MusicXML
- Tools and transformations
- Settings, fonts, and soundfonts
- Troubleshooting and diagnostics

## Getting started

If you are new to ABC notation itself, use:
- `Help → ABC Guide (F1)` (general ABC tutorial)

If you already have `.abc` files, the fastest “ABCarus way” is:
1) `File → Open Library Folder…`
2) Select a tune in the library.
3) Edit on the left, preview on the right.
4) `File → Save` (see “Saving” below).

## 1) The main idea: files vs tunes

- A single `.abc` file can contain multiple tunes.
- In ABCarus, most actions operate on the *current tune* (the tune you selected), not necessarily the whole file.

## 2) Open files and build a library

### Open a file
- Menu: `File → Open…`
- The file opens in the editor, with notation preview on the right.

### Open a library folder (recommended for collections)
- Menu: `File → Open Library Folder…`
- ABCarus scans the folder recursively and builds a sidebar library of tunes.

Tips:
- Use `View → Toggle Library` to show/hide the library sidebar.
- Use `View → Library Catalog…` for a list-style browser of tunes.

## 3) Navigating the library

- The library sidebar groups tunes by file and can also group by common ABC headers (composer, key, meter, etc.).
- Selecting a tune loads only that tune’s slice into the editor.
- “Recent Folders / Files / Tunes” are available under the `File` menu.

## 4) Editing and preview

### Editor
- Edit the ABC text on the left.
- The score preview re-renders automatically (debounced) as you edit.
- Useful editor actions:
  - `Edit → Find…`
  - `Edit → Replace…`
  - `Edit → Go to Line…`
  - `Edit → Toggle Comment`

### Preview (notation)
- The preview pane renders ABC to SVG using abc2svg.
- Clicking a highlighted note in the preview moves the editor cursor to the corresponding ABC position.
- Render errors/warnings appear in the sidebar errors panel; clicking an error jumps to the reported location when possible.

### File header vs tune header (how directives apply)
ABC directives can appear in different places and affect different scopes:
- File header: applies to all tunes in the file (before the first `X:`).
- Tune header: applies only to that tune (between `X:` and the tune body).

ABCarus can also inject additional header lines via Settings (for example, fonts). If you need a per-tune override, put the directive in the tune header.

## 5) Saving: the two common modes

ABCarus has two distinct “Save” outcomes depending on what you’re editing:

### Save replaces a tune in an existing file
If the active tune came from a `.abc` file, `File → Save` updates *that tune* in the source file (in-place).

### Save appends a new tune to a target file
If the active tune is not file-backed (for example, a new draft), `File → Save` appends it to the currently selected library file and assigns a new `X:` number.

Related actions:
- `File → Save As…` writes the current tune to a new file/location.
- `File → Append to Active File…` is an explicit “append” flow.

If there is no selected target file when an append-save is needed, ABCarus shows an error instead of guessing.

### Creating a new tune (recommended)
To create a new tune inside an existing multi-tune file:
1) Open/select the target `.abc` file.
2) Use either:
   - `File → New Tune (Draft in Active File)` or
   - `File → New Tune From Template`
3) Edit the draft, then press `File → Save`.

ABCarus appends the new tune to the end of the active file and assigns `X:` as `max(X:)+1`.

### Unsaved changes prompts
Destructive actions (open/close/quit, etc.) prompt you when there are unsaved changes. Choosing Cancel leaves the current file/tune unchanged.

## 6) Managing tunes (copy/move/delete)

In the library tree you can:
- Copy/Cut/Paste tunes via the context menu.
- Drag-and-drop a tune onto another file entry to move it (with confirmation).

Move semantics:
- Moving a tune copies it to the target file (assigning a new `X:`) and removes it from the source file.

## 7) Set List (build a playlist file)

Set List is a lightweight “assembly workspace” for building a new `.abc` file out of existing tunes, in a chosen order.

- Open: `View → Set List…`
- Add tunes:
  - Library tree: right-click a tune → `Add to Set List`
  - Library Catalog: select a row → `Add to Set List`
  - Active tune: right-click in the editor → `Add Active Tune to Set List`
- Reorder: drag-and-drop inside the Set List, or use ↑ / ↓.
- Remove: `✕` per row, or `Clear` to reset the list.

Export/print:
- `Export ABC…` saves a new `.abc` file.
- `Export PDF…` / `Print…` render the assembled list as a printable document.

Important notes:
- Export normalizes `X:` as `1..N` in the exported/printed output (to encode order and avoid conflicts).
- Set List entries are snapshots: if the source file changes later, the Set List does not update automatically. Remove+re-add if you need a refreshed version.
- The last Set List is restored when you restart ABCarus (stored locally on this machine). Use `Clear` to remove it.

## 7) Playback (audio)

- Menu: `Play → Play / Pause` (`F5`)
- Menu: `Play → Start Over` (`F4`)
- Menu: `Play → Go to Measure…`

During playback, ABCarus highlights notes in both the editor and the preview.

Soundfonts:
- Playback uses an SF2 soundfont. You can select a soundfont in Settings (see below).

## 8) Print and export

PDF / print:
- `File → Print…`
- `File → Print All Tunes…`
- `File → Export → PDF…`
- `File → Export → PDF (All Tunes)…`

MusicXML:
- Import: `File → Import → MusicXML…`
- Export: `File → Export → MusicXML…`

MusicXML import/export requires Python (bundled in release builds; configurable in development). If Python is unavailable, ABCarus refuses the operation with an error rather than producing partial output.

### Import into the current file (recommended workflow)
If you are working inside a multi-tune `.abc` file and import MusicXML:
1) Open/select a tune from the target file.
2) `File → Import → MusicXML…`
3) Confirm appending to the current file.

ABCarus appends the imported tune to the end of that file, assigns `X:` as `max(X:)+1`, and makes the new tune active. After that, `File → Save` updates the imported tune in-place like any other tune from the file.

Note: MusicXML import requires an active target `.abc` file. If no file is open/selected, ABCarus asks you to open/select a file first (to avoid creating an “orphan” tune that cannot be saved into the right place).

### Exporting “All Tunes”
When exporting/printing all tunes, ABCarus processes each tune and includes error summaries for tunes that fail to render. This is useful for bulk checks on large files.

## 9) Tools: transformations

Transform tools edit the ABC text in-place (conservatively):

- `Tools → Transform → Transpose → Up Semitone / Down Semitone`
- `Tools → Transform → Note Lengths → Double / Half`
- `Tools → Transform → Measures per Line → 1…9`
- `Tools → Renumber X (Active File)…`
- `Tools → Align Bars`

## 10) Settings and fonts

### Settings
- Menu: `Settings…` (macOS: in the app menu; Windows/Linux: `Edit → Settings…`)
- Settings include editor and render zoom, editor font size, converter arguments, and more.

### Fonts
- Menu: `Fonts…` (`F9`)
- Notation fonts (SMuFL / abc2svg) and text fonts can be selected here.
- User-installed fonts are stored under `<userData>/fonts/notation/` and appear in font dropdowns.

Soundfonts are managed separately (SF2), and can also be installed locally.

## 11) Help and diagnostics

- `Help → ABCarus User Guide` opens this guide.
- `Help → ABC Guide (F1)` opens a general ABC notation guide.
- `Help → Diagnostics → Save Debug Dump…` saves a JSON dump useful for bug reports.
- `Help → Open Settings Folder` opens the folder that stores app settings and user-installed assets.

## 12) Troubleshooting (common)

### “My changes don’t show up in preview”
- Ensure you are editing valid ABC (missing `K:` is a common cause of “nothing renders”).
- Check the errors panel for the first error; fixing the earliest error often fixes the rest.

### “Playback is silent”
- Confirm a soundfont is selected in Settings and that the file exists.
- Try a different soundfont if notes/drums are missing (coverage varies by SF2).

### “Import/Export MusicXML fails”
- Release builds include a bundled Python runtime; in development you may need to install it.
- If system Python fallback is required, it is opt-in via `ABCARUS_ALLOW_SYSTEM_PYTHON=1`.

## 12) Quick shortcuts (common)

These are the default menu shortcuts:

- Open: `Ctrl/Cmd+O`
- Open Library Folder: `Ctrl/Cmd+Shift+O`
- Save: `Ctrl/Cmd+S`
- Save As: `Ctrl/Cmd+Shift+S`
- Find: `Ctrl/Cmd+F`
- Replace: `Ctrl+H` (Windows/Linux) or `Cmd+Alt+F` (macOS)
- Start Over: `F4`
- Play/Pause: `F5`
- Fonts: `F9`
