<p align="center">
  <img src="assets/icons/abcarus_96.png" width="96" height="96" alt="ABCarus logo" />
</p>
<h1 align="center">ABCarus</h1>

ABCarus is a desktop application for working with music encoded in ABC notation. It is designed for navigating, editing, rendering, and organizing large collections of `.abc` files. It treats each tune (from `X:` to the next `X:`) as an independent unit, which supports archival workflows and large libraries.

## Highlights

- Text-first ABC editing with tune-level navigation (`X:` blocks)
- Fast rendering and playback for iterative editing
- Focus/selection playback controls for targeted practice/debug
- Print/PDF export for single tunes or full files
- MusicXML import/export (bundled in release builds)
- Error scanning and grouped diagnostics for large files

## Status

ABCarus is in active development with regular updates. Behavior is kept stable, but selected UI/workflow details may be refined between releases.

## Downloads (latest)

- Release page: [GitHub Releases][releases-latest]
- Linux: [AppImage][dl-linux-appimage] · [Portable (AppDir tar.gz)][dl-linux-portable] · [SHA256][sha-linux]
- Windows: [Setup][dl-win-setup] · [Portable (.exe)][dl-win-portable] · [Portable (win-unpacked zip)][dl-win-unpacked] · [SHA256][sha-windows]
- macOS (experimental): [DMG (arm64)][dl-mac-arm64] · [DMG (x64)][dl-mac-x64] · [SHA256 (arm64)][sha-mac-arm64] · [SHA256 (x64)][sha-mac-x64]

macOS note: builds are currently not notarized. On some macOS versions, Gatekeeper may report the app as “damaged” and refuse to open it.
After verifying the SHA256 sums, you can remove the quarantine attribute:
`xattr -dr com.apple.quarantine /Applications/ABCarus.app`.

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

## Choose your build

| Platform | Artifact | Recommended for | Notes |
|---|---|---|---|
| Windows | `ABCarus-setup-x64.exe` | Most users | Easiest install/update path |
| Windows | `ABCarus-win-unpacked-x64.zip` | Portable use with faster startup | No installer, folder-based |
| Windows | `ABCarus-portable-x64.exe` | Single-file portability | May start slowly on some systems |
| Linux | `ABCarus-x86_64.AppImage` | Most users | Single file, standard desktop flow |
| Linux | `ABCarus-x86_64-portable.tar.gz` | Portable/folder deployment | No AppImage runtime dependency |
| macOS (experimental) | `ABCarus-macos-*.dmg` | Manual install/testing | Not notarized yet |

## Quick install (end users)

1. Open [GitHub Releases][releases-latest] and download the build for your OS.
2. Verify SHA256 checksums for your platform.
3. Install/launch:
Linux: `chmod +x ABCarus-x86_64.AppImage && ./ABCarus-x86_64.AppImage`
Windows: run Setup or unpack portable zip and launch `ABCarus.exe`
macOS: mount DMG, move app to `/Applications`, launch

Release builds already bundle everything needed for normal use, including the Python runtime used by MusicXML import/export.

## Command-line startup options

You can pass startup options when launching ABCarus:

- `--version` / `-version` — print app version and exit.
- `--input <path>` / `-input <path>` — open the specified ABC file at startup.
- positional file path (without `--input`) is also accepted.
- `--factorysettings` / `-factorysettings` — reset saved app state/settings before startup.
- `--log` / `-log` — write a session log file in userData while the app runs.

Examples:

- Linux AppImage:
  - `./ABCarus-x86_64.AppImage --input "/path/to/tune.abc"`
- Windows:
  - `"C:\\Program Files\\ABCarus\\ABCarus.exe" --input "C:\\abc\\collection.abc"`
- macOS:
  - `open -a ABCarus --args --input "/Users/name/collection.abc"`
- Development (npm):
  - `npm start -- --input "/path/to/tune.abc"`

## Known limitations

- Windows single-file portable (`ABCarus-portable-x64.exe`) may start slowly on some systems (for example due to pre-launch extraction and OS security scanning). In this period, app UI may not appear immediately.
- If this affects your workflow, use `ABCarus-win-unpacked-x64.zip` (folder-based portable build), which typically starts faster and more predictably.

## Troubleshooting

- App does not appear immediately on Windows portable `.exe`:
Use `ABCarus-win-unpacked-x64.zip` and launch from the extracted folder.
- macOS reports app as “damaged”:
Verify SHA256, then run `xattr -dr com.apple.quarantine /Applications/ABCarus.app`.
- Playback seems inconsistent after many quick edits:
Restart app and retest with a fresh playback run; if reproducible, capture a debug dump and report.
- ChordPro preview unavailable:
Check ChordPro CLI availability/settings (see User Guide).

## Documentation

For users:
- User Guide (how to use ABCarus): [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Changelog (what changed): [CHANGELOG.md](CHANGELOG.md)

For contributors:
- Quick workflow (dev + release): [docs/WORKFLOW.md](docs/WORKFLOW.md)
- Developer documentation index: [docs/README.md](docs/README.md)
- Detailed release checklist: [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
- Product + engineering invariants: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Methodology (chat-driven, docs-backed): [docs/METHODOLOGY.md](docs/METHODOLOGY.md)

## Quick start (development)

### Development setup
- Requirements: Node.js (LTS) and npm
- Install dependencies: `npm install`
- Run the app: `npm start`

Python is not required for basic editing/rendering/playback in development. It is only needed for MusicXML import/export.
For import/export in development, install PBS runtime for your current OS:
- Linux/macOS: `bash devtools/pbs/pbs-install-all.sh`
- Windows: `pwsh -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-all.ps1`

### Soundfonts
ABCarus ships only one bundled soundfont (`TimGM6mb.sf2`). Additional soundfonts are optional and installed locally. See [docs/soundfonts.md](docs/soundfonts.md).

### Notation fonts (SMuFL)
ABCarus ships several bundled notation/text fonts (SIL OFL 1.1) for abc2svg rendering. See [docs/notation-fonts.md](docs/notation-fonts.md) and [NOTICE.md](NOTICE.md).

### Release builds
Release builds bundle a local Python runtime (PBS) for MusicXML import/export. See [docs/python-build-standalone.md](docs/python-build-standalone.md) and [docs/python-runtime.md](docs/python-runtime.md).

### Core features

- Recursive scanning of folders containing `.abc` files
- File + tune navigation (tunes are separated by `X:` headers)
- Text-first editing of ABC
- Notation rendering
- Print/export PDF for single tunes or full files
- Playback for editing/reference (including Focus/selection controls and soundfont-based output)
- Error scanning and grouped diagnostics

## Scope / non-goals

ABCarus is a text-first editor and workflow tool for ABC notation.
It is not intended to replace DAWs, full engraving suites, or performance-grade interpretation engines.

## Design goals

- Text-first workflow
- Predictable, reproducible behavior
- Minimal abstractions over the ABC format
- Suitability for large libraries
- Long-term maintainability

Playback and rendering are implemented to support reading and editing, not to replace musical interpretation.

### Rendering notes

- `%%sep` can trigger abc2svg errors in some scores. ABCarus first tries normal rendering; if that fails and `%%sep` is present, it retries with a length-safe `%%sep` fallback and shows a warning.
- Printing/exporting all tunes includes error summaries and inline error cards for tunes that fail to render.

### Versioning & Releases

- SemVer is used, with `package.json` as the source of truth.
- Releases are tagged `vX.Y.Z` and documented in [CHANGELOG.md](CHANGELOG.md).
- See [docs/VERSIONING.md](docs/VERSIONING.md) and [docs/RELEASES.md](docs/RELEASES.md).

### Technology

- Electron
- JavaScript
- ABC notation
- abc2svg (rendering and basic playback)

ABCarus rendering/playback behavior follows the bundled `abc2svg` engine by Jean-Francois Moine.
For ABC/abcm2ps directive reference (including `%%MIDI` family), see:
- http://moinejf.free.fr/abcm2ps-doc/index.html

### Import/Export prerequisites

Import/Export uses external Python converters stored under `third_party/`:

- `third_party/abc2xml/abc2xml.py` (ABC → MusicXML)
- `third_party/xml2abc/xml2abc.py` (MusicXML → ABC)
- `third_party/midi2xml/midi2xml.py` (MIDI → MusicXML, experimental backend)
- `third_party/midi2abc/midi2abc.mjs` (MIDI → ABC, experimental)

By default, ABCarus prefers a bundled Python runtime (PBS). In development, install PBS with:

- Linux/macOS: `bash devtools/pbs/pbs-install-all.sh`
- Windows: `pwsh -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-all.ps1`

System Python fallback is opt-in only via `ABCARUS_ALLOW_SYSTEM_PYTHON=1`.

### Platforms

- Linux, Windows, macOS (release builds provided; Linux is the primary development platform)

### Credits

Major third-party components used by ABCarus:

- abc2svg — https://chiselapp.com/user/moinejf/repository/abc2svg/doc/trunk/README.md
- abc2xml — https://wim.vree.org/svgParse/abc2xml.html
- xml2abc — https://wim.vree.org/svgParse/xml2abc.html
- music21 — https://github.com/cuthbertLab/music21
- midi2abc — https://github.com/marmooo/midi2abc
- CodeMirror — https://codemirror.net/
- Tabulator — https://tabulator.info/
- qrcodejs — https://github.com/davidshimjs/qrcodejs
- Electron — https://www.electronjs.org/
- Node.js — https://nodejs.org/
- Python — https://www.python.org/
- TimGM6mb.sf2 (soundfont) — https://timbrechbill.com/saxguru/

See [NOTICE.md](NOTICE.md) for licenses and attribution details.

### Inspiration

| Name | Project(s) | Why it matters to ABCarus | Link |
|---|---|---|---|
| Chris Walshaw | ABC notation | Where ABC comes from and where the spec lives | https://abcnotation.com/ |
| Jean‑François Moine | abc2svg, txtmus, abcm2ps | The rendering engine we build on (abc2svg) and a lot of ABC craft around it | http://moinejf.free.fr/ |
| Seymour Shlien | EasyABC, runabc, midiexplorer | A long-running desktop editor that shaped many real-world workflows | https://ifdo.ca/~seymour/runabc/top.html |
| James Allwright | abcMIDI | The classic ABC→MIDI toolbox many people still rely on | https://abcmidi.sourceforge.io/ |
| Michael Eskin | ABC Transcription Tools | A huge set of practical online helpers for everyday ABC work | https://michaeleskin.com/abctools/abctools.html |
| cuthbertLab | music21 | MIDI parsing backend used by the optional MIDI -> MusicXML -> ABC pipeline | https://github.com/cuthbertLab/music21 |
| marmooo | midi2abc | Practical MIDI → ABC conversion baseline used for bundled import | https://github.com/marmooo/midi2abc |
| Paul Rosen | abcjs | One of the most common ABC renderers on the web | https://www.abcjs.net/ |
| Johan Vromans | ChordPro | A strong song/chords world that overlaps with ABC use cases | https://www.chordpro.org/ |
| Willem Vree | abc2xml, xml2abc | The MusicXML bridge (ABC ↔ MusicXML) | https://wim.vree.org/ |
| Sergio Di Mico | AbcToSheet | Another take on turning ABC into sheet music | https://abctosheet.my.to/ |
| Benoît Rouits | qabc, redrose | Small, sharp ABC projects worth studying | https://github.com/be1 |
| MTG | SymbTr | Research angle on symbolic music data | https://github.com/MTG/symbtr |

### Personal acknowledgements

These are personal sources of inspiration and gratitude, separate from the technical projects above:

- [Houshamadyan](https://www.houshamadyan.org/home.html) — a project to reconstruct Ottoman Armenian town and village life.
- [Ara Dinkjian](https://www.aradinkjian.com/) — composer, musician, and oud teacher.
- [Corpus Musicae Ottomanicae](https://corpus-musicae-ottomanicae.de/content/index.xml) — critical edition of Near Eastern music manuscripts.
- My Lord and Savior Yeshua

### Licensing

ABCarus source code is licensed under the MIT License.

This project uses third-party components, including abc2svg (LGPL) and CodeMirror (MIT).
See [NOTICE.md](NOTICE.md) for details.
