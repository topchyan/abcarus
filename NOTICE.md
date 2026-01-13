# Third-Party Notices

This project includes third-party software components.

---

## abc2svg

ABCarus uses **abc2svg** for rendering and basic playback of ABC notation.

- Project: abc2svg
- Author: Jean-François Moine
- License: GNU Lesser General Public License (LGPL)
- Website: https://github.com/leesavide/abc2svg

abc2svg is used as an external library.
No modifications have been made to the abc2svg source code unless explicitly stated.

---

## abc2xml

ABCarus includes **abc2xml** for converting ABC to MusicXML.

- Project: abc2xml
- Author: Willem G. Vree
- License: GNU Lesser General Public License (LGPL)
- Website: https://wim.vree.org/svgParse/abc2xml.html

abc2xml is used as an external tool.

---

## xml2abc

ABCarus includes **xml2abc** for converting MusicXML to ABC.

- Project: xml2abc
- Author: Willem G. Vree
- License: GNU Lesser General Public License (LGPL)
- Website: https://wim.vree.org/svgParse/xml2abc.html

xml2abc is used as an external tool.

---

## Python runtime (bundled)

ABCarus bundles a Python runtime for MusicXML import/export tools.

- Project: Python
- License: Python Software Foundation License (PSF)
- License file: third_party/python-embed/<platform>/lib/python3.11/LICENSE.txt
- Website: https://www.python.org/

---

## SoundFonts (SF2)

ABCarus ships one SF2 soundfont for playback. Licensing varies by file.

### TimGM6mb (TimGM6mb.sf2)
- Author: Tim Brechbill
- Website: https://timbrechbill.com/saxguru/
- License: GNU General Public License (GPL)
- Note: MuseScore 1.0 shipped with this soundfont

If you need full attribution or exact licensing terms for any SF2 file, refer to
the original distribution sources.

---

## Notation fonts (SMuFL)

ABCarus may ship additional notation/text fonts for abc2svg rendering.

Included fonts (SIL Open Font License 1.1 / OFL):
- Bravura / BravuraText — Steinberg / SMuFL project
- Petaluma / PetalumaText / PetalumaScript — Steinberg
- Leland / LelandText — MuseScore
- MuseJazz / MuseJazzText — MuseScore

License:
- SIL Open Font License 1.1
- License text: `assets/fonts/notation/OFL.txt`

These fonts are bundled for rendering only; they are not sold separately.

---

## Editor fonts

ABCarus ships the following font for the editor UI:

### Noto Sans Mono
- Copyright: The Noto Project Authors
- License: SIL Open Font License 1.1
- License text: `assets/fonts/editor/noto-sans-mono/OFL.txt`
- Project: https://github.com/notofonts/latin-greek-cyrillic

---

## CodeMirror

ABCarus uses **CodeMirror** as the text editor component.

- Project: CodeMirror
- License: MIT License
- Website: https://codemirror.net/

---

## Tabulator

ABCarus vendors **Tabulator** for tabular UI components.

- Project: Tabulator
- License: MIT License
- Website: https://tabulator.info/

---

## Electron

This application is built using Electron.

- Project: Electron
- License: MIT License
- Website: https://www.electronjs.org/

---

## Node.js

Electron includes Node.js.

- Project: Node.js
- License: MIT License
- Website: https://nodejs.org/
