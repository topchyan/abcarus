# Agent Notes for ABCarus

This repo is a small Electron app for working with ABC notation.

## Quick start
- Install deps: `npm install`
- Run app: `npm run start`

## Project layout
- `src/main/` Electron main process (window, IPC, menu).
- `src/preload.js` Preload bridge for renderer IPC.
- `src/renderer/` UI (HTML/CSS/JS).
- `third_party/` External tooling for import/export.

## Hard constraints / invariants
- Prefer tolerant-read / strict-write behavior: it should be easy to scan/search, and hard to corrupt user data.
- File writes must be safe: use atomic replace where possible (write temp + rename), with retries for platform quirks.
- Avoid “clever” abstractions. Keep state ownership clear (single source of truth) and changes auditable.
- Throttle UI progress updates; do not spam the renderer with high-frequency status events.

## Conventions
- Keep changes small and focused; avoid introducing new dependencies unless needed.
- Prefer plain JavaScript and simple utilities over abstractions.
- Maintain existing menu action strings and IPC message names.

## Import/export prerequisites
- Python 3 on PATH for `third_party/abc2xml/abc2xml.py` and `third_party/xml2abc/xml2abc.py`.
- `abc2abc` binary from abcMIDI on PATH for `abc2abc` transforms.

## Tests
- No automated tests are set up; validate changes by running the app.
- When changing file operations (rename/move/write), test with:
  - read-only file / permission errors
  - file modified on disk between index and write
  - paths with spaces and non-ASCII characters
