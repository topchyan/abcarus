# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- CI: macOS builds now run on supported GitHub Actions runners (macos-13 retired); release upload is skipped on non-tag runs.


## [0.19.4] - 2026-01-12
### Added
- Playback: experimental toggle “Use native abc2svg %%MIDI drum*” in Settings → Playback (Advanced), with safe fallback to injected `V:DRUM`.

### Changed
- Playback: Focus replaces Practice (speed + loop).

### Fixed
- Playback: loop edge cases (avoid silent stop when end <= start).
- Settings: modal no longer “flies away” when Advanced enabled (position clamped).

## [0.19.3] - 2026-01-12
### Added
- Playback: Focus Mode (F7) to hide panels and auto-fit the score for hands-free playing.

### Changed
- Playback: Follow now highlights the current staff segment (more readable than bar separators in many layouts).
- Playback: Settings expose staff highlight color/opacity and current bar (staff segment) opacity.
- Third-party: abc2svg runtime update (drum parsing/edge cases).

### Fixed
- Playback: auto-scroll behavior under zoom is more reliable.
- Playback: Follow measure highlight alignment is consistent in Focus Mode.

## [0.19.2] - 2026-01-10
### Changed
- Settings: redesign dialog with left navigation and stable desktop layout; hide Drums page for now.
- UI: make modal footers consistent and add standard Esc/Enter behaviors.
- Toolbar: clarify “Reset view” (layout + zoom) label/tooltip.
- Library: simplify post-scan status text (count kept in tooltip only).

## [0.19.1] - 2026-01-09
### Changed
- Icons: improve generation scripts (ICO frame ordering, Linux window icon variants) and add icon post-processing helper.

### Fixed
- Playback: Follow highlight no longer disappears due to playback-only sanitization changing text offsets.
- Playback: start now works when an inline field (e.g. `[P:...]`) shares a line with music (`|:`).
- Navigation: Alt+PgDn no longer gets “stuck” after Align Bars.

## [0.19.0] - 2026-01-09
### Added
- Playback: Follow mode now highlights the current bar and shows a vertical playhead line in the score (configurable in Settings).
- Playback: Go to Measure… (Cmd/Ctrl+G) to jump the transport start to a specific bar.
- Settings: import/export portable `.properties` settings (SciTE-style).

### Changed
- Settings: split Playback vs Drums sections to reduce confusion.
- Edit: Go to Line moved to Cmd/Ctrl+Alt+G (Cmd/Ctrl+G is reserved for Go to Measure).
- Diagnostics: gate verbose renderer diagnostics behind opt-in debug flags.

### Fixed
- Playback: more robust startup on some real-world ABC that violates strict K:-placement assumptions (playback-only workaround + warning).

## [0.18.0] - 2026-01-08
### Added
- CI: stable `/releases/latest/download/...` filenames for all release artifacts.
- CI: Linux: portable folder build (`ABCarus-x86_64-portable.tar.gz`) alongside AppImage.
- CI: macOS: DMG builds for both Apple Silicon (arm64) and Intel (x64).
### Changed
- CI: Windows: publish stable-named Setup/portable/zip artifacts and checksums.
### Fixed
- Icons: generate transparent app icons without losing colors; improve Linux window icon visibility (default gold, optional override).

## [0.17.2] - 2026-01-07
### Added
- Editor: toggle comment (`Cmd/Ctrl+/`).
### Changed
- Branding: update app icon assets.
- Repo: keep internal-only “kitchen” artifacts out of GitHub.
### Fixed
- Windows: improve window icon selection.

## [0.17.1] - 2026-01-06
### Added
- Developer tooling: third-party upgrade review (`npm run thirdparty:review`) and abc2svg upgrade helper (`npm run abc2svg:upgrade`).
### Changed
- Windows packaging: add single-file portable build alongside Setup installer.
### Fixed
- Playback: tolerate missing `abc2svg.drum` in some upstream builds.
- Playback: normalize `^3/4` / `_3/4` accidentals for compatibility.


## [0.17.0] - 2026-01-06
### Added
- abc2svg v1.22.35 update (includes MIDI drum support via `%%MIDI drum`, `%%MIDI drumon`, `%%MIDI drumbars`).
### Changed
- Docs: archive Codex task prompts and update packaging/build notes.
### Fixed
- Errors mode: enabling `Errors` now auto-runs “Scan for errors” for the active file.
- Repeat-length warnings: handle inline meter changes and common pickup bars around repeat markers.
- Playback: guard against a crash in abc2svg drum generation on some tunes.

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
