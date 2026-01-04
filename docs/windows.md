# Windows x64 notes

## Goal

Support Windows x64 with portable import/export by bundling a minimal Python runtime to run:
- `third_party/abc2xml/abc2xml.py`
- `third_party/xml2abc/xml2abc.py`

## Why embeddable Python

Python “embeddable” for Windows is a minimal distribution intended to be shipped with applications. It is typically much smaller than a full install (no `pip` by default) and is suitable when we only need the standard library.

Practical size expectation (Windows x64):
- Embeddable ZIP: ~8–12 MB
- Unpacked: ~20–35 MB (varies by Python version)

## Runtime layout in ABCarus

Place the runtime at:
- `third_party/python-embed/win-x64/`
  - expected executable: `python.exe` (or `python3.exe`)

This folder is gitignored.

When packaged, binaries should be shipped via `app.asar.unpacked`, and ABCarus will prefer:
- `<resources>/app.asar.unpacked/third_party/python-embed/win-x64/python.exe`

If not present, ABCarus falls back to system Python (`python` on PATH).

## Notes

- The embeddable distribution should include its `pythonXY.zip` / `_pth` configuration so `python -c "print('ok')"` works out of the box.
- ABCarus sets `PYTHONIOENCODING=utf-8` and, for bundled runtimes, also sets `PYTHONHOME` to the runtime directory.
