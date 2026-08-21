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
1) `File → Open Folder as Library…`
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
- Menu: `File → Open Folder as Library…`
- ABCarus scans the folder recursively and builds a sidebar library of tunes.

Tips:
- The dropdown beside the toolbar `Library` button exposes both `Library Catalog…` and `Open Folder as Library…`.
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
2) Use `File → New Tune (Add to Active File)`.
3) Edit the draft, then press `File → Save`.

ABCarus appends the new tune to the end of the active file and assigns `X:` as `max(X:)+1`.

`Templates Library…` inserts, replaces, or appends reusable snippets. `New Tune From Template` instead creates a new file from the bundled starter template; these actions intentionally remain separate.

### Unsaved changes prompts
Destructive actions (open/close/quit, etc.) prompt you when there are unsaved changes. Choosing Cancel leaves the current file/tune unchanged.

## 6) Managing tunes (copy/move/delete)

In the library tree you can:
- Copy/Cut/Paste tunes via the context menu.
- Drag-and-drop a tune onto another file entry to move it (with confirmation).

Move semantics:
- Moving a tune copies it to the target file (assigning a new `X:`) and removes it from the source file.

## 7) Set List (build a performance program)

Set List is a portable performance document containing an ordered selection of
tunes. Save one program per `*.abcarus-setlist.json` file; use `Export ABC…`,
`Export PDF…`, or `Print…` to create derived output.

- Open: `View → Set List…`
- Add tunes:
  - Library tree: right-click a tune → `Add to Set List`
  - Library Catalog: select a row → `Add to Set List`
  - Active tune: right-click in the editor → `Add Active Tune to Set List`
- Reorder: drag-and-drop inside the Set List, or use ↑ / ↓.
- Remove: `✕` per row, or `Clear` to reset the list.
- Documents: use `New`, `Open…`, `Save`, and `Save As…` in the Set List window.
- Name: edit the name at the top of the Set List window.
- When several recent Set Lists exist, adding from Library asks which document
  should receive the tune. The current document is listed first.

Export/print:
- `Export ABC…` saves a new `.abc` file.
- `Export PDF…` / `Print…` render the assembled list as a printable document.

Important notes:
- Export normalizes `X:` as `1..N` in the exported/printed output (to encode order and avoid conflicts).
- Newly added entries currently include their ABC snapshot, preserving the
  existing self-contained Set List behavior. Saved documents also retain
  Library identity and a content hash for explicit comparison/relink workflows.
- In the Set List window, use `Edit > Add Active Tune` to add the currently
  open tune to the visible list. To choose a different tune, use `Add to Set
  List` from that tune's Library context menu.
- An existing pre-document Set List appears as a clean `Previous Set List`.
  Use `Save As…` to keep it as `*.abcarus-setlist.json`. Opening or creating a
  different Set List discards this one-time compatibility copy without an
  unsaved-changes warning unless you actually edited it first.
- `Header…` lets you define Set List–specific abc2svg directives (for example `%%stretchlast 1`) that are added to exported Set List files and used for Set List print/PDF.

## 8) Playback (audio)

- The score toolbar above the rendered notation contains Play/Pause, Stop, Start Over, and runtime tempo controls.
- Menu: `Play → Play / Pause` (`F5`)
- Menu: `Play → Start Over` (`F4`)
- Menu: `Play → Go to Measure…`

During playback, ABCarus highlights notes in both the editor and the preview.

The tempo slider and `−`/`+` buttons adjust playback without changing `Q:` or making the document dirty. For a simple `Q:fraction=number` declaration, ABCarus shows the effective BPM and beat unit. For other valid but more complex `Q:` forms, it shows the relative percentage instead of guessing.

### Focus range from the score
- Double-click a measure in the rendered score to select it for playback in normal or Focus mode.
- Double-click another measure to extend the range; the endpoints are ordered automatically.
- A further double-click starts a new range. A single click clears the score range.
- The selected measures are shaded. In Focus mode, the same boundaries appear in the From/To controls.
- Editing the range while playback is active stops playback before applying the new boundaries.

### Selection playback
- Playback is selection-first.
- If text is selected in the editor, Play runs that selected range.
- The `Loop selection` control above the score appears only while text is selected.
- If nothing is selected, Play runs from normal transport context.
- Loop/repeat/mute behavior for selection playback is configured in Settings:
  - `Playback -> Selection -> Loop selection`
  - `Playback -> Selection -> Selection: suppress repeats`
  - `Playback -> Selection -> Selection: mute chord symbols`
  - `Playback -> Selection -> Selection: allow MIDI drums` (best-effort)
  - `Playback -> Selection -> Selection: muted voices` (comma-separated IDs; `1` always means the de-facto first voice; best-effort, inline `[V:...]` switches are not supported)

Soundfonts:
- Playback uses an SF2 soundfont. You can select a soundfont in Settings (see below).

## 9) Print and export

PDF / print:
- `File → Print…`
- `File → Print All Tunes…`
- `File → Export → PDF…`
- `File → Export → PDF (All Tunes)…`

Source links:
- A valid `F:https://…` field is shown as a source action and can be included in print/PDF output.
- `Tools → Source Links → Update YouTube Metadata (Active File)…` reads YouTube titles and channels for all YouTube `F:` links in the active file.
- After confirmation, ABCarus writes managed `D:[YouTube title]` and `D:[YouTube channel]` discography lines immediately after each corresponding `F:` line.

### Library metadata

`Tools → Library Metadata…` adds namespaced `G:` catalog metadata to the current tune or every tune in the active ABC file. Supported categories are Makam, Form, Repertoire, Cultural, and Period.

Current Tune updates the editor and becomes an ordinary unsaved change. All Tunes in File requires a clean document, previews the number of affected tunes, writes the file atomically, and reloads the active tune. Existing identical tags are left unchanged.
- Existing user-authored `N:` fields are preserved. YouTube metadata written previously as managed `N:` lines is migrated to `D:` on update. Unavailable links are reported but are not written into the ABC file.

MusicXML:
- Import: `File → Import → MusicXML…`
- Export: `File → Export → MusicXML…`
- Export every tune in the active ABC file: `File → Export → MusicXML (All Tunes)…`. ABCarus creates a new `File name - MusicXML` folder containing one standard `.musicxml` file per tune. Existing export folders are never overwritten.
- Batch MusicXML export applies the same enabled Global Header hierarchy and File Header to each tune, with tune-level directives taking precedence. ABCarus runtime font paths are intentionally excluded.

MIDI:
- Import: `File → Import → MIDI…` (experimental, converts `.mid/.midi` to ABC)

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

## 10) Tools: transformations

Transform tools edit the ABC text in-place (conservatively):

- `Tools → Transform → Transpose → Up Semitone / Down Semitone`
- `Tools → Transform → Note Lengths → Double / Half`
- `Tools → Transform → Measures per Line → 1…9`
- `Tools → Renumber X (Active File)…`
- `Tools → Align Bars`

## 11) Settings and fonts

### Settings
- Menu: `Settings…` (macOS: in the app menu; Windows/Linux: `Edit → Settings…`)
- Settings include editor and render zoom, editor font size, converter arguments, and more.
- Playback selection options are in `Settings -> Playback -> Selection`.

### Fonts
- Menu: `Fonts…` (`F9`)
- Notation fonts (SMuFL / abc2svg) and text fonts can be selected here.
- User-installed fonts are stored under `<userData>/fonts/notation/` and appear in font dropdowns.

Soundfonts are managed separately (SF2), and can also be installed locally.

## 12) Help and diagnostics

- `Help → ABCarus User Guide` opens this guide.
- `Help → ABC Guide (F1)` opens a general ABC notation guide.
- `Help → abc2svg / abcm2ps Reference (Jef Moine)` opens directive/reference docs (including `%%MIDI` keywords).
- `Help → Diagnostics → Save Debug Dump…` saves a JSON dump useful for bug reports. The dump includes the active ABC/header text and local file paths; review or redact it before sharing it publicly.
- `Help → Open Settings Folder` opens the folder that stores app settings and user-installed assets.

## 13) Templates (quick practical use)

Templates are reusable ABC snippets you can insert as a starting point (for example, playback directives) without manually rebuilding boilerplate each time.

Where:
- `Tools → Templates → Templates Library…`
- or `File → New Tune From Template`

Typical use for playback overrides:
- Put your preferred `%%MIDI` lines in a template.
- Start a new tune from that template, then paste/import the target tune body.
- This keeps your original source file untouched while letting you test alternate playback behavior.

Minimal template example:

```abc
X:1
T:Template: Playback Overrides
M:4/4
L:1/8
Q:1/4=120
%%MIDI gchord f2c2
%%MIDI program 1 73
K:C
```

Reference for advanced directives:
- `http://moinejf.free.fr/abcm2ps-doc/index.html`

## 14) Troubleshooting (common)

### “My changes don’t show up in preview”
- Ensure you are editing valid ABC (missing `K:` is a common cause of “nothing renders”).
- Check the errors panel for the first error; fixing the earliest error often fixes the rest.

### “Playback is silent”
- Confirm a soundfont is selected in Settings and that the file exists.
- Try a different soundfont if notes/drums are missing (coverage varies by SF2).
- Some external SF2 files can fail only on particular instruments or notes because of a known limitation in the current abc2svg SF2 runtime. Use the bundled `TimGM6mb.sf2` as the fallback.

### “Import/Export MusicXML fails”
- Release builds include a bundled Python runtime; in development you may need to install it.
- If system Python fallback is required, it is opt-in via `ABCARUS_ALLOW_SYSTEM_PYTHON=1`.

## 15) Quick shortcuts (common)

These are the default menu shortcuts:

- Open: `Ctrl/Cmd+O`
- Open Folder as Library: `Ctrl/Cmd+Shift+O`
- Save: `Ctrl/Cmd+S`
- Save As: `Ctrl/Cmd+Shift+S`
- Find: `Ctrl/Cmd+F`
- Replace: `Ctrl+H` (Windows/Linux) or `Cmd+Alt+F` (macOS)
- Start Over: `F4`
- Play/Pause: `F5`
- Fonts: `F9`

## 16) Command-line startup options

ABCarus can be launched with optional startup flags:

- `--version` / `-version`  
  Print app version and exit.

- `--input <path>` / `-input <path>`  
  Open a specific `.abc` file on startup.

- positional file path (no `--input`)  
  Also opens that file on startup.

- `--factorysettings` / `-factorysettings`  
  Reset persisted app state/settings before startup.

- `--log` / `-log`  
  Write a session log file in userData while the app runs.

Examples:

- Linux:
  - `./ABCarus-x86_64.AppImage --input "/path/to/file.abc"`
- Windows:
  - `ABCarus-portable-x64.exe --input "C:\\abc\\file.abc"`
- macOS:
  - `open -a ABCarus --args --input "/Users/name/file.abc"`
- Dev run:
  - `npm start -- --version`
  - `npm start -- --factorysettings --log --input "/path/to/file.abc"`
