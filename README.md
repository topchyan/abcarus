# ABCarus

ABCarus is a desktop application for working with music encoded in ABC notation.

The application is designed for navigating, editing, and rendering large collections of ABC files. It treats each tune (from `X:` to the next `X:`) as an independent unit, rather than operating only at the file level. This makes it suitable for archival work, traditional repertoires, and structured study of notated music.

### Core features

- Recursive scanning of folders containing `.abc` files
- Parsing files into individual tunes based on `X:` headers
- Navigation by files and tunes
- Text-based editing of ABC notation
- Visual rendering of notation
- Basic playback for reference

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

- Linux
- macOS
- Windows

### Licensing

ABCarus source code is licensed under the MIT License.

This project uses third-party components, including abc2svg (LGPL) and CodeMirror (MIT).
See NOTICE for details.
