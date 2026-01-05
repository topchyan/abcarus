# Release Notes

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
