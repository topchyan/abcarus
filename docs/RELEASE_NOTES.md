# Release Notes

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
