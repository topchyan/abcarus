# ABCarus

ABCarus is a desktop application for working with music encoded in ABC notation.

---
⚠️ Status: Early-stage / pre-release

ABCarus is functional but still under active development.
Expect changes. Back up your data.
---

See `docs/DISCLAIMER.md` and `CHANGELOG.md`.

The application is designed for navigating, editing, and rendering large collections of ABC files. It treats each tune (from `X:` to the next `X:`) as an independent unit, rather than operating only at the file level. This makes it suitable for archival work, traditional repertoires, and structured study of notated music.

### Development setup
- Install dependencies: `npm install`
- Ensure Python 3 is on your PATH (required for import/export tooling)

### Soundfonts
ABCarus ships only one bundled soundfont (`TimGM6mb.sf2`). Additional soundfonts are optional and installed locally. See `docs/soundfonts.md`.

### Release builds
Release AppImage builds bundle a local Python runtime at build time. See `scripts/README.md` for the release workflow and tooling.

### Core features

- Recursive scanning of folders containing `.abc` files
- Parsing files into individual tunes based on `X:` headers
- Navigation by files and tunes
- Text-based editing of ABC notation
- Visual rendering of notation
- Print/export PDF for single tunes or full files
- Basic playback for reference
- Error scanning and grouped diagnostics

### Design goals

- Text-first workflow
- Predictable and reproducible behavior
- Minimal abstractions over the ABC format
- Suitability for large libraries
- Long-term maintainability

Playback and rendering are implemented to support reading and editing, not to replace musical interpretation.

### Status

ABCarus is under active development.  
Internal APIs, UI layout, and feature set may change.

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

Python (3 recommended) must be installed and available as `python3` or `python` on your PATH.

abc2abc transforms require the `abc2abc` binary from the abcMIDI package to be installed and on your PATH.

### Platforms

- Linux (actively developed and tested)
- Windows (planned, not yet tested)
- macOS (lowest priority; may not be implemented)

### Credits

Major third-party components used by ABCarus:

- abc2svg — https://chiselapp.com/user/moinejf/repository/abc2svg/doc/trunk/README.md
- abc2xml — https://wim.vree.org/svgParse/abc2xml.html
- xml2abc — https://wim.vree.org/svgParse/xml2abc.html
- abcMIDI (abc2abc) — http://abc.sourceforge.net/abcMIDI/
- CodeMirror — https://codemirror.net/
- Electron — https://www.electronjs.org/
- Node.js — https://nodejs.org/
- Python — https://www.python.org/
- TimGM6mb.sf2 (soundfont) — https://timbrechbill.com/saxguru/

See `NOTICE` for licenses and attribution details.

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
See NOTICE for details.
