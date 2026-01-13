<p align="center">
  <img src="assets/icons/abcarus_96.png" width="96" height="96" alt="ABCarus logo" />
</p>
<h1 align="center">ABCarus</h1>

ABCarus is a desktop application for working with music encoded in ABC notation.

ABCarus is designed for navigating, editing, rendering, and organizing large collections of `.abc` files. It treats each tune (from `X:` to the next `X:`) as an independent unit, which supports archival workflows and large libraries.

## Status

Pre-release / under active development. Internal APIs, UI layout, and the feature set may change. Keep backups of your data.

See `docs/DISCLAIMER.md` and `CHANGELOG.md`.

## Downloads (latest)

- Release page: [GitHub Releases][releases-latest]
- Linux: [AppImage][dl-linux-appimage] · [Portable (AppDir tar.gz)][dl-linux-portable] · [SHA256][sha-linux]
- Windows: [Setup][dl-win-setup] · [Portable (.exe)][dl-win-portable] · [Portable (win-unpacked zip)][dl-win-unpacked] · [SHA256][sha-windows]
- macOS: [DMG (arm64)][dl-mac-arm64] · [DMG (x64)][dl-mac-x64] · [SHA256 (arm64)][sha-mac-arm64] · [SHA256 (x64)][sha-mac-x64]

[releases-latest]: https://github.com/topchyan/abcarus/releases/latest

[dl-linux-appimage]: https://github.com/topchyan/abcarus/releases/latest/download/ABCarus-x86_64.AppImage
[dl-linux-portable]: https://github.com/topchyan/abcarus/releases/latest/download/ABCarus-x86_64-portable.tar.gz
[sha-linux]: https://github.com/topchyan/abcarus/releases/latest/download/SHA256SUMS-linux.txt

[dl-win-setup]: https://github.com/topchyan/abcarus/releases/latest/download/ABCarus-setup-x64.exe
[dl-win-portable]: https://github.com/topchyan/abcarus/releases/latest/download/ABCarus-portable-x64.exe
[dl-win-unpacked]: https://github.com/topchyan/abcarus/releases/latest/download/ABCarus-win-unpacked-x64.zip
[sha-windows]: https://github.com/topchyan/abcarus/releases/latest/download/SHA256SUMS-windows.txt

[dl-mac-arm64]: https://github.com/topchyan/abcarus/releases/latest/download/ABCarus-macos-arm64.dmg
[dl-mac-x64]: https://github.com/topchyan/abcarus/releases/latest/download/ABCarus-macos-x64.dmg
[sha-mac-arm64]: https://github.com/topchyan/abcarus/releases/latest/download/SHA256SUMS-macos-arm64.txt
[sha-mac-x64]: https://github.com/topchyan/abcarus/releases/latest/download/SHA256SUMS-macos-x64.txt

## Project docs (recommended starting points)
- User Guide (how to use the app): `docs/USER_GUIDE.md`
- Quick workflow (dev + release): `WORKFLOW.md`
- Detailed release checklist: `docs/RELEASE_CHECKLIST.md`
- `docs/README.md` (developer documentation index)
- `docs/REQUIREMENTS.md` (product + engineering invariants)
- `docs/METHODOLOGY.md` (chat-driven workflow without losing context)
- `docs/qa/manual-merge-checklist.md` (manual QA for risky changes)

## Quick workflow

See `WORKFLOW.md` for:
- 3–5-command release flow (version → tag → push → verify)
- What we commit / keep local (e.g. `scripts/local/**`)
- Useful debug env vars (e.g. `ABCARUS_DEBUG_KEYS=1`)

## Quick start (development)

### Development setup
- Install dependencies: `npm install`
- Run the app: `npm start`

Python is not required for basic editing/rendering/playback in development. It is only needed for MusicXML import/export.

### Soundfonts
ABCarus ships only one bundled soundfont (`TimGM6mb.sf2`). Additional soundfonts are optional and installed locally. See `docs/soundfonts.md`.

### Notation fonts (SMuFL)
ABCarus ships several bundled notation/text fonts (SIL OFL 1.1) for abc2svg rendering. See `docs/notation-fonts.md` and `NOTICE.md`.

### Release builds
Release builds bundle a local Python runtime (PBS) for MusicXML import/export. See `docs/python-build-standalone.md` and `docs/python-runtime.md`.

### Core features

- Recursive scanning of folders containing `.abc` files
- File + tune navigation (tunes are separated by `X:` headers)
- Text-first editing of ABC
- Notation rendering
- Print/export PDF for single tunes or full files
- Basic playback for reference
- Error scanning and grouped diagnostics

## Design goals

- Text-first workflow
- Predictable, reproducible behavior
- Minimal abstractions over the ABC format
- Suitability for large libraries
- Long-term maintainability

Playback and rendering are implemented to support reading and editing, not to replace musical interpretation.

### Rendering notes

- `%%sep` can trigger abc2svg errors in some scores. ABCarus currently ignores `%%sep` during rendering and logs a warning. Keep the original notation in your files.
- Printing/exporting all tunes includes error summaries and inline error cards for tunes that fail to render.

### Versioning & Releases

- SemVer is used, with `package.json` as the source of truth.
- Releases are tagged `vX.Y.Z` and documented in `CHANGELOG.md`.
- See `docs/VERSIONING.md` and `docs/RELEASES.md`.

### Technology

- Electron
- JavaScript
- ABC notation
- abc2svg (rendering and basic playback)

### Import/Export prerequisites

Import/Export uses external Python converters stored under `third_party/`:

- `third_party/abc2xml/abc2xml.py` (ABC → MusicXML)
- `third_party/xml2abc/xml2abc.py` (MusicXML → ABC)

By default, ABCarus prefers a bundled Python runtime (PBS). In development, install it with:

- Linux: `bash devtools/pbs/pbs-install-unix.sh linux-x64`
- macOS: `bash devtools/pbs/pbs-install-unix.sh darwin-arm64` or `bash devtools/pbs/pbs-install-unix.sh darwin-x64`
- Windows: `pwsh -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-windows.ps1 -Platform win-x64`

System Python fallback is opt-in only via `ABCARUS_ALLOW_SYSTEM_PYTHON=1`.

### Platforms

- Linux, Windows, macOS (release builds provided; Linux is the primary development platform)

### Credits

Major third-party components used by ABCarus:

- abc2svg — https://chiselapp.com/user/moinejf/repository/abc2svg/doc/trunk/README.md
- abc2xml — https://wim.vree.org/svgParse/abc2xml.html
- xml2abc — https://wim.vree.org/svgParse/xml2abc.html
- CodeMirror — https://codemirror.net/
- Tabulator — https://tabulator.info/
- Electron — https://www.electronjs.org/
- Node.js — https://nodejs.org/
- Python — https://www.python.org/
- TimGM6mb.sf2 (soundfont) — https://timbrechbill.com/saxguru/

See `NOTICE.md` for licenses and attribution details.

### Inspiration

Projects that inspired ABCarus:

- EasyABC — https://sourceforge.net/projects/easyabc/
- Michael Eskin's ABC Transcription Tools — https://michaeleskin.com/abctools/abctools.html
- Jef Moine's abc2svg / txtmus — http://moinejf.free.fr/
- Willem Vree (abc2xml / xml2abc) — https://wim.vree.org/
- abcMIDI (James Allwright author, Seymour Shlien, current maintainer) — https://abcmidi.sourceforge.io/
- abc2js (Paul Rosen) — https://www.abcjs.net/
- AbcToSheet (Sergio Di Mico) — https://abctosheet.my.to/
- SymbTr research project — https://github.com/MTG/symbtr

### Licensing

ABCarus source code is licensed under the MIT License.

This project uses third-party components, including abc2svg (LGPL) and CodeMirror (MIT).
See `NOTICE.md` for details.
