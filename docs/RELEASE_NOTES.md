# Release Notes

## [0.17.1] - 2026-01-06

Range: v0.17.0..HEAD

### Added
- Developer tooling: third-party upgrade review (`npm run thirdparty:review`) and abc2svg upgrade helper (`npm run abc2svg:upgrade`).
### Changed
- Windows packaging: add single-file portable build alongside Setup installer.
### Fixed
- Playback: tolerate missing `abc2svg.drum` in some upstream builds.
- Playback: normalize `^3/4` / `_3/4` accidentals for compatibility.

## [0.17.0] - 2026-01-06

Range: v0.16.3..HEAD

### Added
- abc2svg v1.22.35 update (MIDI drums via `%%MIDI drum`).
### Changed
- Docs: update packaging/build notes; archive official Codex task prompts.
### Fixed
- Errors mode: enabling `Errors` auto-runs “Scan for errors” for the active file.
- Repeat-length warnings: handle inline meter changes and common pickup bars around repeat markers.
- Playback: guard against a crash in abc2svg drum generation on some tunes.

## [0.16.3] - 2026-01-05

Range: v0.16.2..HEAD

### Changed
- CI: attach Linux/Windows artifacts to GitHub Releases on tags.
### Fixed
- Windows portable: ensure `ffmpeg.dll` is present and add a README reminding to extract before running.

## [0.16.2] - 2026-01-05

Range: v0.16.1..HEAD

Name: AppImage Packaging Fix

### Fixed
- AppImage: avoid duplicating converter scripts; preserve symlinks in bundled Python runtime.

## [0.16.1] - 2026-01-05

Range: v0.16.0..HEAD

Name: Library Stability Patch

### Fixed
- Library Tree: reliably open tunes even if index entries became stale after re-parse.

## [0.16.0] - 2026-01-05

Range: v0.15.1..HEAD

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
