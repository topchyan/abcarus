# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.16.3] - 2026-01-05
### Changed
- CI: attach Linux/Windows artifacts to GitHub Releases on tags.
### Fixed
- Windows portable: ensure `ffmpeg.dll` is present and add a README reminding to extract before running.

## [0.16.2] - 2026-01-05
### Fixed
- AppImage: avoid duplicating converter scripts; preserve symlinks in bundled Python runtime.

## [0.16.1] - 2026-01-05
### Fixed
- Library Tree: reliably open tunes even if index entries became stale after re-parse.

## [0.16.0] - 2026-01-05
### Added
- Bundled portable Python via python-build-standalone (PBS) across platforms (lock + installers).
- Windows/macOS packaging via `electron-builder` (Linux remains AppImage).
### Changed
- Default to bundled Python; system Python only with `ABCARUS_ALLOW_SYSTEM_PYTHON=1`.
- Library UX: toolbar toggles Tree; Catalog is available via shift-click and menu.
### Removed
- Legacy `third_party/python-runtime` and deprecated “Find in Library” UI.
### Fixed
- Normalize uncommon repeat barlines (`|:::` / `:::|`) for playback.

## [0.15.1] - 2026-01-03
### Changed
- Translate ADRs to English
### Fixed
- Detect system python in AppImage


## [0.15.0] - 2026-01-03
### Added
- Support embeddable python runtime
### Changed
- Remove abc2abc dependency
- Native transpose
### Fixed
- Honor inline meter changes
- Reflow measures-per-line repeatable
- Measures-per-line without blank lines


## [0.14.0] - 2026-01-03
### Added
- Native transposition backend (with `abc2abc` as optional fallback).
- Transposition of chord symbols (gchords) in quotes (12-TET).
- Native 53-EDO transposition support via `%%MIDI temperamentequal 53`.
- Project requirements/methodology docs and ADRs.

### Changed
- Settings now include a toggle for native transposition.

### Fixed
- 53-EDO repeated transposition corruption around inline fields and `!decorations!`.

## [0.13.1] - 2026-01-02
### Changed
- No notable changes.

## [0.13.0] - 2026-01-01
### Changed
- Simplify one-shot command.

## [0.12.2] - 2025-12-31
### Changed
- Document release notes generation.
- Move local runner scripts out of repo.
- Backup existing artifact.
- Clarify local-only ignores.
- Add practical checklist.

## [0.10.0] - 2025-12-30
### Added
- TBD (release notes not yet curated).

## [0.9.2] - 2025-12-29
### Added
- Print/export for all tunes in a file, with per-tune error summaries.
- Scan-and-filter view for tunes with render errors.
- Toast notifications for export feedback.

### Changed
- Print pipeline now renders via temp HTML/PDF windows for more consistent output.
- Error list grouped by tune/file context.
- File header UI shows filename, tune selector, and error scan controls.
- Rendering ignores `%%sep` and reports a warning instead of failing.

### Fixed
- Temporary print artifacts are cleaned on startup.

## [0.9.1] - 2025-12-28
Initial public versioning baseline; feature set is ~90% complete; details to be filled as we stabilize.
