# Windows x64 notes

## Goal

Support Windows x64 with portable import/export by bundling a minimal Python runtime to run:
- `third_party/abc2xml/abc2xml.py`
- `third_party/xml2abc/xml2abc.py`

## Why bundled Python (PBS)

ABCarus prefers a bundled Python runtime installed from a committed python-build-standalone (PBS) lock file:
- deterministic and repeatable across contributors and CI;
- no requirement for users to install Python.

Details:
- PBS workflow (locks + installers): `docs/python-build-standalone.md`
- Runtime resolution order: `docs/python-runtime.md`

## Runtime layout in ABCarus

Place the runtime at:
- `third_party/python-embed/win-x64/`
  - expected executable: `python.exe` (PBS install)

This folder is gitignored.

When packaged, binaries should be shipped via `app.asar.unpacked`, and ABCarus will prefer:
- `<resources>/app.asar.unpacked/third_party/python-embed/win-x64/python.exe`
ABCarus does not rely on system Python by default.

## Notes

- System Python fallback is opt-in only via `ABCARUS_ALLOW_SYSTEM_PYTHON=1`.
- ABCarus sets `PYTHONIOENCODING=utf-8` and, for bundled runtimes, also sets `PYTHONHOME` to the runtime root.

## Legacy (temporary)

Older python.org "embeddable" runtimes may exist under:
- `third_party/python-embed/win-x64-legacy/`

ABCarus prefers PBS under `win-x64` and only uses legacy as a fallback.
