# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]



## [0.22.12] - 2026-01-23
### Fixed
- Intonation Explorer: skip comments (`% ...`) and mid-tune field lines (`K:`, `M:`, `V:` / `[K:...]`) during pitch scanning so counts/highlights reflect only music tokens.

## [0.22.11] - 2026-01-23
### Fixed
- Templates: tolerate indented `X:` when inserting/appending templates (prevents duplicate `X:` headers).
- Header: editing no longer “snaps back” to the library index; Reload stays explicit.
- Header: Save Header no longer injects leading blank lines before `X:` (prevents shifting tune starts).
- Render/Print: keep file-level `%%header`/`%%footer` for print/export while suppressing repeated book-style prose in per-tune renders.
- Working Copy: header/tune boundary detection uses `^[\\t ]*X:` (not `^\\s*X:`) to avoid newline-eating boundary bugs.

### Docs
- ADR-0007: document header authority and header/X boundary rules.

## [0.22.10] - 2026-01-22
### Added
- Tools → Diagnostics: Intonation Explorer (MVP+) for analyzing pitch usage of the active tune and highlighting occurrences in the editor + score.

## [0.22.9] - 2026-01-22
### Fixed
- Transpose: avoid injecting large spacing/alignment unless “Auto-align bars after transforms” is enabled.
- Render: ignore file-level prose/layout header blocks (e.g., `%%begintext`, `%%center`) when rendering a single selected tune.

## [0.22.8] - 2026-01-21
### Fixed
- Print All Tunes: allow continuous printing/export (multiple tunes per page) and honor manual `%%newpage` directives.

### Added
- Settings: Print → All tunes options for Print All (page breaks + “ask each time”).
- Docs: add SymbTr makam → `K:` signature correlation report under `docs/makam_dna/`.

## [0.22.7] - 2026-01-20
### Fixed
- Append confirmation dialog: “Do not show again” now persists and disables the prompt for subsequent appends.

## [0.22.6] - 2026-01-20
### Fixed
- Save dialogs: avoid double overwrite confirmations (use the native Save dialog prompt without an extra ABCarus prompt).

## [0.22.5] - 2026-01-20
### Fixed
- Library: cut/paste (move) uses working copy snapshots more reliably to avoid stale-offset deletes and duplication edge cases.
- Working Copy: tune sync/selection avoids disk fallback when a working copy is open.
- Working Copy: reduce “Reload from disk” prompts during normal workflows (treat reload as explicit recovery).
- Save: handle missing-on-disk (externally deleted) files with an explicit Recreate / Save As / Cancel prompt.
- Save As / New File: prompt once for overwrite, directly create the requested path, and keep Untitled files from lingering in the UI.

### Changed
- Working Copy: Save is session-authoritative and overwrites external on-disk changes by default.
- Renumber X: when enabled (clean file), renumber now auto-saves so you can keep navigating immediately.

## [0.22.4] - 2026-01-19
### Fixed
- Playback/Focus: exiting Focus no longer leaves a stale loop range that makes Play start inside the previous Focus loop segment.
- New Tune: the File menu action now matches the [+] button behavior (adds directly into the active file, no Untitled draft detour).

### Changed
- Status: unify app/file status into a single bottom-left chip with clearer Saved/Unsaved/Conflict states.

### Developer
- Tests: add quick checks to prevent raw renderer disk I/O bypasses and to catch renderer syntax/build errors early.
- Docs: merge Working Copy acceptance criteria into the Working Copy ADR (removes duplicate ADR-0006 numbering).

## [0.22.3] - 2026-01-18
### Added
- Templates: a Templates Library picker (manage folder, search, preview, insert one tune as a new tune in the active file).

## [0.22.2] - 2026-01-18
### Fixed
- New Tune draft: after appending+Save, switching away and back no longer shows a stale pre-save version.

## [0.22.1] - 2026-01-18
### Added
- Working Copy (WC) model: opened files are edited via a versioned in-memory buffer (prevents disk corruption and enables conflict-gated saves).

### Changed
- Structural file operations (renumber X / move / delete / duplicate / append) are gated on clean state to avoid ambiguous partial results.

## [0.22.0] - 2026-01-18
### Fixed
- macOS: toolbar button icons render reliably (inline SVG sprite; avoids external SVG loading issues on Monterey).

## [0.21.7] - 2026-01-18
### Fixed
- Security/CSP: revert temporary `file:` allowances added for icon loading.

## [0.21.6] - 2026-01-18
### Fixed
- UI/Icons: inline toolbar SVG icons (no external icon file loading; fixes missing icons on macOS Monterey).

## [0.21.5] - 2026-01-18
### Fixed
- UI/Icons: allow loading local `file:` SVG/font assets in CSP (fixes missing toolbar icons on some macOS setups).

## [0.21.4] - 2026-01-18
### Fixed
- Toolbar: use SVG background images for button icons (improves macOS compatibility).

## [0.21.3] - 2026-01-18
### Fixed
- Toolbar: macOS button icons render correctly (SVG masks use alpha mode).

## [0.21.2] - 2026-01-17
### Fixed
- Playback: avoid truncating `K:` when applying offset-stable header reordering (prevents cases like `K:Dm` turning into `K:D` during playback).

## [0.21.1] - 2026-01-17
### Added
- Import (MusicXML): allow selecting and importing multiple files at once (preserves the selection order; appends all imported tunes to the chosen target `.abc` file; auto-drops the default “Untitled” placeholder tune when importing into a brand-new file).
- Renumber: X renumbering now starts from `X:1`.

### Fixed
- Import (MusicXML): prompt for target (`This file` vs `New file…`) and allow canceling long imports via `Esc` (saves already-imported tunes).
- Import (MusicXML): Linux portal dialogs no longer invert multi-selection order.

## [0.21.0] - 2026-01-16
### Added
- Editor: `Ctrl+F1` GM instrument picker for `%%MIDI program`, `%%MIDI chordprog`, and `%%MIDI bassprog` (searchable; inserts number and `% Instrument Name` comment).
- Editor: `Ctrl+F2` decoration picker with search, details, and SVG preview; supports range decorations (wrap selection) and favorites.
- Editor: decoration picker window can be moved (drag header) and resized.
- Devtools: scripts to build an abc2svg decorations catalog and scan decoration usage in `.abc` files.

### Changed
- Layout/Zoom: score zoom is remembered per split orientation (vertical vs horizontal) and restored on startup.
- Zoom: `Ctrl/Cmd+Wheel` zooms the pane under the pointer; `Ctrl/Cmd+-/+` zooms the focused pane.
- Focus: fit-to-width uses its own baseline zoom (does not depend on the previous mode/zoom).
- Docs/Repo: move large offline reference snapshots out of tracked `docs/` into local-only `kitchen/` (keeps the repo leaner).

### Fixed
- Startup: stop resetting score zoom on launch.

## [0.20.5] - 2026-01-15
### Added
- Layout: horizontal split option for score/editor with persisted split ratios.
- Toolbar: `Split` toggle button and `Ctrl/Cmd+Alt+\\` shortcut.
- Help: `Report an Issue…` shortcut to GitHub issue templates.

### Changed
- Layout (horizontal): score is on top, editor below.
- Toolbar: transport + Focus controls are centered.

## [0.20.4] - 2026-01-15
### Fixed
- Playback (Follow): in multi-voice tunes, Follow now consistently tracks `V:1` when present and avoids voice timeline collisions.

## [0.20.3] - 2026-01-14
### Changed
- Packaging metadata: add repository/homepage/license fields for better tooling interoperability.
- Docs: clarify macOS downloads as experimental.

### Fixed
- Third-party notices: correct abc2svg upstream link and record local patch notes.
- abc2svg tooling: patch vendored `abc2mid` to load drum support for `%%MIDI drum*` inputs.

## [0.20.2] - 2026-01-14
### Added
- Set List: snapshot-based tune assembly with drag & drop reorder, print/PDF/export, and optional header template.

### Changed
- Templates: replace the default template tune with “Կատակային Պար / Humoresque Dance”.
- Save As: suggest filenames as `<T>_<C>.abc` (prefers latin `T:` when multiple titles are present).

### Fixed
- Focus: hide Library Tree while in Focus mode (restores on exit) so the score is centered.
- Focus: loop range remembers values per tune and prevents invalid `from > to`.
- Set List: hide error summary cards in exported/printed PDFs (Preview-only).
- New Tune / New Tune from Template: allow opening drafts without an active library file (use normal Save/Close flow).

## [0.20.1] - 2026-01-13
### Added
- Help: add an in-app user guide (`Help → ABCarus User Guide`) and a new `docs/USER_GUIDE.md`.

### Changed
- Docs: consolidate workflow/release/packaging notes and reduce duplication across reference files.

### Fixed
- Import (MusicXML): require an active target `.abc` file, confirm append, then append the imported tune to the end of that file with `X:max+1` and activate it.

## [0.20.0] - 2026-01-13
### Added
- Editor: bundle Noto Sans Mono (OFL) and allow adding custom editor fonts by file.
- Settings: footer actions (OK/Cancel/Apply) and import/export from the dialog.

### Changed
- Settings: redesigned desktop modal with stable layout and improved grouping.
- Settings: simplify navigation (General, Editor, Fonts, Playback, Options, Global Header); Options combines Tools/Library/Dialogs.
- Menus (Linux/Windows): move Settings/Fonts into Edit menu; remove separate Settings menu.

### Fixed
- Settings: preserve values when switching Basic/Advanced.
- Settings: do not show “Canceled” popup on import/export cancel.

## [0.19.5] - 2026-01-12
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
