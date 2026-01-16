# ABCarus Developer Documentation

ABCarus is a desktop Electron application for editing and managing collections of music in ABC notation. It treats each tune (from `X:` to the next `X:`) as a separate unit, supports library-level navigation, and renders scores using abc2svg.

This documentation is based on the current codebase and does not assume features that are not implemented.

## Start here

- Day-to-day workflow (dev + release): `WORKFLOW.md` (repo root)
- Project orientation + invariants: `ORIENTATION.md` (repo root)
- User-facing overview: `README.md` (repo root)
- User guide (how to use the app): `docs/USER_GUIDE.md`

## Local-only "kitchen"

Some reference material (standards snapshots, manuals, chat exports, scratch notes) is intentionally kept **out of git**.
Use `kitchen/` at the repo root for this kind of content (it is ignored by `.gitignore`).

## What ABCarus is
- A text-first ABC editor with a split view for notation rendering.
- A library browser that scans folders for `.abc` files and indexes tunes.
- A playback and print/export tool powered by abc2svg and soundfonts.

## Intended use
ABCarus is designed for users who maintain or study large collections of ABC files and need per-tune navigation, editing, and preview. The UX centers on tune-level operations (select, move, copy, delete) rather than full-file editing.

## Quick start (development)
- Install dependencies: `npm install`
- Run the app: `npm start`

Scripts are defined in `package.json`.

## Runtime dependencies
- Electron (dev dependency in `package.json`).
- Bundled Python 3.11 runtime for MusicXML import/export (`third_party/abc2xml/abc2xml.py`, `third_party/xml2abc/xml2abc.py`).
- Soundfont data in `third_party/sf2/` for audio playback.

## Key folders
- `src/main/`: Electron main process (window, menus, IPC, file dialogs, scanning).
- `src/preload.js`: Preload bridge exposing IPC APIs to the renderer.
- `src/renderer/`: UI and feature logic (editor, library, rendering, playback).
- `third_party/`: Bundled external tools and libraries (abc2svg, xml2abc, abc2xml, soundfonts).
- `assets/`: App icons.

## Packaging/build
Packaging scripts are available:
- Linux AppImage: `npm run appimage` (see `scripts/build_appimage.sh` and `docs/packaging.md`)
- Windows/macOS: `npm run dist:win` / `npm run dist:mac` (electron-builder; see `docs/packaging.md`)

## Releases
- Versioning rules: `docs/VERSIONING.md`
- Release policy + CI notes: `docs/RELEASES.md`
- Step-by-step checklist: `docs/RELEASE_CHECKLIST.md`
- Changelog: `CHANGELOG.md` (repo root)

## Packaging and Python (import/export)
- Packaging (per OS): `docs/packaging.md`
- Bundled Python policy + PBS workflow: `docs/python-build-standalone.md`
- Runtime resolution order and env: `docs/python-runtime.md`
- Windows-specific Python notes: `docs/windows.md`

## Settings
- Settings structure + schema workflow: `docs/settings-structure.md`
- Export/import settings (offline): `docs/settings-export-import.md`
- Settings audit notes: `docs/settings-audit.md`

## Detailed docs
- `docs/features.md`: End-user features and behaviors.
- `docs/architecture.md`: Main/renderer responsibilities, IPC, and data flow.
- `docs/REQUIREMENTS.md`: Consolidated product + engineering requirements/invariants.
- `docs/METHODOLOGY.md`: How we develop (chat-driven) without losing context.
- `docs/abc2svg-upgrade-playbook.md`: Repeatable pipeline for upgrading `third_party/abc2svg/`.
- `docs/abc-syntax-policy.md`: ABCarus rules for ABC syntax, linting, and safe transforms.
- `docs/abc-standards.md`: ABC 2.1/2.2 references used for lint/transforms.
- `docs/soundfonts.md`: Soundfont selection and local setup.
- `docs/notation-fonts.md`: Notation font (SMuFL / `%%musicfont`) notes and how to add more.
- `docs/adr/`: Architecture decision records (ADRs).
