# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Library context menus now provide Expand All and Collapse All for file and metadata grouping modes.

### Fixed
- Selection playback includes generated drum and accompaniment events belonging to the final selected measure instead of stopping before that measure sounds.
- Focus, selection, and A-B loops can run seamlessly without reparsing or an audio-start gap; an optional shared loop pause remains available in Playback settings.


## [1.9.3] - 2026-09-04
### Fixed
- The measure-fill indicator now advances correctly across barlines next to ABC line continuations instead of combining adjacent measures into an apparent overfull measure.
- Score fitting now completes in one action after changing Split orientation, entering or leaving Focus, dragging the Editor/Score divider, or using Reset View.

## [1.9.2] - 2026-09-03
### Added
- Pressing Tab at the end of a complete single-voice measure inserts a barline; when a barline already follows, Tab advances past it. Incomplete, overfull, unsupported, and multi-voice contexts are left unchanged with status feedback.

### Changed
- Desktop and mobile Set List synchronization now use the canonical `abcarus.setlist.v2` document format exclusively.
- Tune-scoped `%%titleformat` directives inherited from a file or Set List header are applied consistently to each tune in the Score, playback, print, PDF, and conversion paths.

### Fixed
- External and mobile Set List updates refresh clean open documents, while independently edited or concurrently saved Set Lists are merged without silently overwriting either side.
- Unsafe abc2svg `%%beginjs` and `%%loadjs` directives are blocked before module loading and rendering.
- Custom `%%setdiag` guitar diagrams preserve empty finger positions, preventing later finger labels from shifting left in Chromium. This backports upstream abc2svg check-in `cecc0ec042` until the next complete abc2svg upgrade.

## [1.9.1] - 2026-09-01
### Added
- The Editor status bar now shows contextual measure fill while entering notation, with understated incomplete and overfull feedback.

### Changed
- Library, Set List, and Editor/Score now use aligned panel-owned headers and status bars; Library controls use a compact two-row layout and document/library statuses are explicit.
- YouTube metadata updates now report a clear final outcome for updated, current, unavailable, canceled, and missing-link cases.

### Fixed
- Library rows no longer overflow and paint over the Library footer.
- The document status remains anchored at the right edge when contextual measure information appears.

## [1.9.0] - 2026-09-01
### Added
- Set List printing can add an optional title page and tune index. The index can be compact or include notation incipits, optional QR source links, printed tune numbering, effective tempo, and practice notes.
- Set List documents using the new print presentation options are written as `abcarus.setlist.v2`; unchanged v1 documents remain v1-compatible.
- The docked Set List panel shows when the active Set List was last saved.

### Changed
- Set List index incipits use each occurrence's saved performance transposition, omit leading silent measures and part labels, and are cropped into a consistent compact layout.

### Fixed
- Standard chord symbols now produce the default abc2svg accompaniment even when a tune does not contain an explicit `%%MIDI gchord` pattern, including selection playback.
- Set List PDF export preserves complete staff rendering while applying tight SVG bounds only to index incipits.

## [1.8.3] - 2026-08-31
### Added
- The main toolbar now exposes the Set List panel directly, and an opened Set List can refresh its tune snapshots from Library sources with one command.
- Templates now show a rendered notation preview together with their X, key, and meter metadata.

### Changed
- Set List rows show the effective performance key, while performance transposition remains a Set List-only override until the Library source is explicitly opened for editing.
- The MIDI input control is hidden when no MIDI input device is available.

### Fixed
- Saving or refreshing a Library tune now synchronizes matching Set List snapshots and keys, including portable/mobile source locators, and saves the refreshed Set List automatically.
- Runtime tempo changes now apply from the first playback start instead of taking effect only after playback has begun.
- Clicking a score note now starts playback from that exact note instead of snapping to an earlier measure or reusing stale pause/restart state.

## [1.8.2] - 2026-08-28
### Changed
- Application menus now group Library, Set List, File Header, and split-view controls under View; Set List printing is under File, and ABC Helpers is under Tools.
- Split orientation has one menu command, playback exposes Stop and Loop Selection consistently, and menu labels match the toolbar terminology for Reset View and font settings.

### Fixed
- Score ranges selected by double-clicking measures now start and loop from the selected passage instead of falling back to normal playback.

## [1.8.1] - 2026-08-26
### Fixed
- Application settings now persist on Windows; profile durability checks use a writable file handle instead of attempting `fsync` through a read-only handle rejected by Windows.
- Windows release builds now run profile write-and-restart persistence tests before packaging.

## [1.8.0] - 2026-08-26
### Added
- Set List occurrences can store a performance transposition without changing the source ABC. The Editor, Score, and playback show the derived performance version, while an explicit Original Tune action can apply it permanently and synchronize the Set List snapshot.
- Set List practice notes are editable and saved with the portable Set List document.
- Library files and Set Lists can export configurable, sortable tune inventories, including repeated namespaced metadata, as CSV or plain text.
- Desktop Library and saved Set Lists can be shared with ABCarus Mobile over the local network, with configurable access credentials and portable Set List synchronization.

### Changed
- Tunes opened from a Set List use a visibly read-only performance view until the user explicitly chooses to edit the Library source.
- Align Bars now fits consecutive lyric lines to their music rows, preserves already aligned manual grids, handles repeat separators consistently, and formats MusicXML imports immediately after conversion.
- Set List panel visibility, the active Set List, performance overrides, and cleared practice notes persist reliably across restarts and application shutdown.

### Fixed
- Optional `midi2xml`/music21 availability no longer appears as a general missing-tool failure when bundled `midi2abc` can provide MIDI import fallback.
- Windows and macOS release jobs now verify the bundled Python dependencies after installation; Windows packaging also fails immediately when `pip` cannot install them.

## [1.7.4] - 2026-08-25
### Fixed
- MusicXML converter flags entered in Settings are now staged immediately and Settings completion waits until the application profile is written to disk. This makes `xml2abc` and `abc2xml` flags persist reliably across restarts.
- Align Bars now formats every consecutive lyric (`w:`) line belonging to a music line, including multi-verse MusicXML imports.

## [1.7.3] - 2026-08-24
### Fixed
- MusicXML import now uses the saved `xml2abc` flags in the desktop import workflow. Imports with `-b N` retain the converter's requested measures-per-line layout and then apply Align Bars without reflowing to four measures per line.

## [1.7.2] - 2026-08-23
### Fixed
- MusicXML import now preserves `xml2abc -b` bar-per-line wrapping instead of overriding it with ABCarus auto-formatting.

## [1.7.1] - 2026-08-21
### Added
- Set List panel shortcuts: `F6` toggles the panel and `Ctrl/Cmd+Alt+P` prints the active Set List.
- Set List Layout now exposes global print page margins alongside page-break controls.

### Changed
- Showing or hiding the Set List recalculates the Editor/Score layout as part of view reset.
- Set List dirty state now identifies changed areas such as items, layout, header, snapshots, and title.
- Page-break choices use explicit labels for forced, continuous, and automatic behavior.

### Fixed
- Tools → Set List → Show/Hide Panel now reaches the renderer action correctly.

## [1.7.0] - 2026-08-21
### Added
- Set Lists are now portable, self-contained JSON documents with tune snapshots, source resolution, print/export settings, and explicit snapshot update actions.
- Set Lists open as a docked, hideable workspace beside the Library and use the same Editor/Score pipeline as Library navigation.

### Changed
- Set List drag-and-drop now distinguishes Library copies from internal reordering and provides deterministic before/after placement feedback.
- `Reset View` now adapts to Split orientation, gives the Score a larger share of the available space, fits notation to the available width, and centers the rendered score.
- Toggling Library or Set List recalculates the layout and score fit; Set List source-status dots are no longer shown in every row.

### Fixed
- The Editor/Score pane remains visible when the Set List workspace is hidden.
- Dragging a Library tune after reordering a Set List no longer accidentally reorders the Set List.

## [1.6.1] - 2026-08-20
### Changed
- Updated abc2svg to the 2026-08-20 upstream tip and tightened the renderer Content Security Policy without requiring `unsafe-eval`.

### Fixed
- Hardened handling of externally supplied documents, external navigation, diagnostics, and release packaging.
- Developer-only workspace material and machine-specific paths are excluded from packaged applications.

## [1.6.0] - 2026-08-19
### Added
- Library grouping and search now understand repeated namespaced `G:` metadata for makam, form, repertoire, cultural context, and period.
- `Tools → Library Metadata…` safely adds catalog tags to the current tune or every tune in the active ABC file, with an affected-tune preview and idempotent writes.
- Double-clicking measures in the rendered score selects an exact playback range in normal and Focus modes, with visible score shading and repeat-safe physical boundaries.
- A runtime tempo slider and step controls adjust playback speed without editing `Q:` or marking the tune dirty; straightforward tempo declarations also show the effective BPM.

### Changed
- YouTube recording titles and channels are now stored in semantically appropriate `D:` discography fields. Metadata written previously to managed `N:` lines remains readable and is migrated on the next metadata update.
- Score transport, tempo, selection-loop, and Focus controls now share one aligned toolbar above the notation; Focus mode keeps that toolbar on a single line and hides unrelated file/library chrome.
- The Library toolbar button now has an explicit actions menu for Library Catalog and Open Folder as Library instead of a hidden Shift-click gesture.
- New Tune and Templates commands use distinct labels that reflect whether they add to the active file, open the templates library, or create a separate file from a starter template.

### Fixed
- Score-selected Focus ranges use their exact rendered source offsets, avoiding shifted playback starts in tunes with multiple repeat sections and ambiguous display bar numbers.
- Loop Selection is shown only when the editor has an actual text selection.

## [1.5.0] - 2026-08-16
### Added
- Source-link tools can fetch YouTube title, channel, and availability metadata into `N:` fields for use in the editor and printed output.
- `File -> Export -> MusicXML (All Tunes)...` exports every tune in the active ABC file as an individually named MusicXML document, applying the effective Global and File Header hierarchy and reporting partial conversion failures.

### Changed
- Dialogs, toolbar controls, menus, and ABC helper popovers use a more consistent visual and interaction model.
- Printed YouTube sources use a compact metadata layout with aligned QR codes and tighter, predictable PDF page insets.

### Fixed
- Printed source links and QR codes are positioned relative to the notation area without an unwanted separator line.
- Long-running batch MusicXML export uses an explicit request/reply protocol, preventing successful exports from ending with a false IPC error.
- Batch MusicXML export remembers its own destination folder and starts on the Desktop when no prior destination exists.

## [1.4.1] - 2026-08-13
### Fixed
- Playback started from inside a `P:` part now continues with the correct remaining part sequence instead of restarting the current part; updated abc2svg to upstream check-in `c64c0aea48` and added a regression test for boundary and mid-part starts.

## [1.4.0] - 2026-08-10
### Changed
- Application preferences and working UI state now share one canonical `abcarus-profile.json`; Export and Import operate on standalone copies instead of attaching an external settings file.
- Existing `state.json` and attached `abcarus.properties` settings are migrated one way into the unified profile; obsolete state files are removed only after the new profile is written successfully.
- Global Header ABC now has one runtime source of truth: `user_settings.abc`. The Settings editor writes that file directly, while `globalHeaderEnabled` remains an ordinary application preference.
- Portable-folder builds resolve `user_settings.abc` beside the application; installed builds continue to use the OS user-data directory.
- New exports keep the JSON profile in `abcarus-profile.json` and Global Header ABC in the neighboring `user_settings.abc` file.
- Interface and Library fonts use friendly presets and shared user-font selectors instead of exposing CSS fallback strings as the primary UI.
- Profile export/import carries fonts added to ABCarus in a neighboring `fonts/` directory.

### Fixed
- Legacy embedded `globalHeaderText` is migrated once without allowing a deliberately deleted `user_settings.abc` to reappear on later launches.

## [1.3.0] - 2026-08-08
### Added
- Settings is reorganized into task-oriented panels, including grouped Import & Export controls.
- File dialogs remember operation-specific folders and selected file filters, with graceful fallback when paths are unavailable.
- Packaged builds now include the bundled `midi2abc` converter in the available tool set.

### Changed
- Updated Electron to 43 for the experimental cross-platform build line.
- Updated abc2svg to the upstream tip containing the SF2 loop-point fix.

### Fixed
- Tune saves can reconstruct missing single-tune document parts from the current file when stable offsets remain valid.
- Linux file dialogs retain portal positioning behavior while keeping the remembered-path state available for future Electron dialog improvements.
- SF2 playback no longer uses the broken loop-point expression from abc2svg v1.23.4.

## [1.2.3] - 2026-08-05
### Changed
- Release preparation now validates changelog notes, package versions, and tag ownership before preflight, then verifies the release tag before publishing.

## [1.2.2] - 2026-08-05
### Fixed
- Turkish notation conversion now uses reversible 12-EDO spelling with explicit 53-TET key-signature restoration, preserving sharp notation and round-trip fidelity.

## [1.2.1] - 2026-08-04
### Fixed
- Settings changes are flushed to the attached portable properties file before application shutdown, preventing Global Header changes from disappearing after restart.

## [1.2.0] - 2026-08-04
### Added
- Portable settings export now carries Global Header data in the single `abcarus.properties` file.
- Emergency recovery and failed-save handling preserve the active document when the original path becomes unavailable.

### Changed
- File and tune editing now follows the single-tune document model more consistently across Raw, ChordPro, Library, Save As, and navigation flows.
- Settings import synchronizes the imported Global Header with the active runtime layer while retaining compatibility with legacy `user_settings.abc` files.

### Fixed
- Prevented stale document and library context from causing lost edits or failed repeated saves.
- Removed obsolete template file-cache behavior and tightened document, Library, and ChordPro lifecycle checks.

## [1.1.0] - 2026-08-03
### Added
- Recent Folders now remembers directories used to open files or complete Save As operations, while preserving previously used folders.

### Changed
- File, tune, header, import, export, Raw, ChordPro, Library, and revert operations now use direct disk reads and atomic writes with on-disk baseline checks.

### Removed
- Removed the global Working Copy architecture, its IPC bridge, preload API, persistence store, and related mutation paths.

### Fixed
- Save and file-operation flows no longer maintain a hidden second editable copy of the document, reducing stale-state and lost-edit risks.

## [1.0.0] - 2026-08-01
### Added
- First major release of ABCarus with domain-oriented renderer architecture and dedicated Library, playback, rendering, document, tools, settings, and diagnostics modules.
- Intonation Explorer, Makam DNA, microtonal notation support, templates, MIDI input, native abc2svg drums, ChordPro, PDF, Print All, and Set List workflows.
- Release preflight, UI smoke, file-operation, working-copy, state-store, and renderer boundary checks.

### Changed
- Renderer responsibilities are separated into maintainable functional domains while preserving the existing user workflows.
- Save As now preserves a dirty source on cancel, writes and verifies the destination before rebinding the same working copy, and rejects unsafe same-path operations.
- Working-copy and application state persistence use stronger atomic-write, recovery, and context-safety checks.

### Fixed
- Tune/file creation, movement, duplication, Save As, raw mode, playback focus, error navigation, Library lifecycle, and recent-state restoration paths were hardened.
- Release validation now runs before public release creation and publishes a release only after all platform assets are built and uploaded.

### Known limitations
- Some external SoundFont files may fail for particular instruments or notes due to the current abc2svg SoundFont runtime. The bundled `TimGM6mb.sf2` remains the recommended fallback.

## [0.42.0] - 2026-06-28
### Added
- Drum Pattern helper can now preview and write drum patterns as compact `%%MIDI drum`, readable ABCarus `%%MIDI drum +:` blocks, or abc2svg/txtmus `%%begindrum` tablature.
- Editor highlighting now recognizes `%%begindrum` tablature rows, with distinct styling for shortcut keys, hits, rests, bar separators, and instrument mappings.

### Fixed
- `%%MIDI drum` to `%%drum` conversion now preserves playback onsets for multiplier tokens such as `d2`, writing one tablature hit followed by rests instead of repeated hits.

## [0.41.0] - 2026-06-22
### Changed
- Updated bundled `abc2svg` to v1.23.3 from Jef Moine's 2026-06-21 tip.
- Playback now relies on native `abc2svg` MIDI drum handling for canonical `%%MIDI drum` directives, with the legacy `V:DRUM` compatibility path removed from the normal playback pipeline.
- The Drum Pattern editor now writes canonical one-line `%%MIDI drum <pattern> <pitches> <velocities>` directives while continuing to read existing `%%MIDI drum +:` blocks.

### Fixed
- File save/export replacement fallback now preserves the previous file via backup-rename instead of deleting the destination before replacement.
- Working-copy saves are guarded more strictly so failed saves surface as errors instead of silently losing user edits.

## [0.40.0] - 2026-06-21
### Added
- Intonation Explorer now suggests makam candidates from 53-EDO pitch usage, K signatures, makam DNA entries, and phrase/seyir cues, with quick actions to use a candidate as declared or comparison makam.

### Changed
- Settings now shows all options in one mode and searches across all settings pages, narrowing the left navigation as results change.
- Release download compact reports now emit wide TSV columns for asset categories and allow larger GitHub CLI responses.

### Fixed
- Playback Follow now prefers a pitched melody voice over accompaniment-only `x` voices when choosing the voice to track in multi-voice lead sheets.

## [0.39.1] - 2026-06-01
### Fixed
- Transposition now preserves explicit accidentals correctly for separated minor key signatures such as `K:G Minor`, avoiding dropped sharp sevenths when moving to another minor key.

## [0.39.0] - 2026-05-28
### Changed
- Updated bundled `abc2svg` to Jef Moine's 2026-05-28 tip with the upstream `P:` selection playback fix.

### Fixed
- Full-tune playback for ABC `P:` part-order tunes now starts the abc2svg engine from the tune root, matching abc2svg editor behavior and avoiding extra repeats when the cursor is on the first playable note.

## [0.38.1] - 2026-04-24
### Changed
- Package/build metadata now consistently uses the `abcarus` / `ABCarus` naming across package manifests, AppImage guidance, and developer orientation notes.
- Release publishing now syncs the version notes from `CHANGELOG.md` into the GitHub Release body automatically via `gh`.

### Fixed
- `Align Bars` no longer inserts a spurious leading gap when a tune contains section boundaries followed by inline meter/unit fields.
- Bare `+:` continuation lines now inherit directive/header highlighting correctly in the editor.
- `%%MIDI drum +:` continuation directives are collapsed consistently for render/playback compatibility, avoiding false abc2svg parse errors in normal rendering.
- Directive-origin errors no longer show bogus `Beats:` diagnostics computed from header text.
- Note highlight/follow/click mapping is restored after MIDI drum compatibility rewrites, so the cursor tracks individual notes again instead of snapping to the bar start.

## [0.38.0] - 2026-04-19
### Added
- Linux portable archive now includes an explicit top-level launcher `./ABCarus` (keeps `./AppRun` as legacy alias) for clearer end-user startup.
- Regression guards extended:
  - `test:main-cli` now checks forced reload routing for external file-open flow.
  - `test:renderer-build` now checks same-path reopen reload path (`openRecentFile` force reload + metadata refresh).

### Changed
- External/CLI file-open actions now pass `forceReload` to renderer, so opening an already active file path re-reads current on-disk state deterministically.

### Fixed
- Reopening the same file path after external edits now reloads working copy + library metadata instead of silently keeping stale in-memory content.
- Focus playback boundary handling hardened for problematic repeat/volta layouts:
  - default `0 -> 0` in Focus resolves to full tune scope,
  - end boundary fallback keeps selected/visible final bar inclusive.
- Focus drum payload handling stabilized:
  - safer suppression path for injected `V:DRUM`,
  - stricter drum bar mismatch detection to fail closed instead of producing broken playback.

## [0.37.2] - 2026-04-17
### Added
- Main-process CLI regression guard: new `npm run test:main-cli` (`scripts/check_main_cli_open.mjs`) validates single-instance + argv parsing cases used by OS file-open flows.
- Packaging regression guard: new `npm run test:file-associations` (`scripts/check_file_associations.mjs`) validates `.abc` file-association metadata in `package.json` and AppImage desktop entry.
- Release checklist now includes a cross-platform `.abc` file-open sanity section (Linux/Windows/macOS) to prevent silent association regressions before publishing.

### Changed
- `test:quick` now includes both new regression checks (`test:main-cli`, `test:file-associations`) so release smoke runs cover file-open/association paths.

### Fixed
- Linux desktop/AppImage metadata now advertises `.abc` MIME types (`text/x-abc`, `application/x-abc`).
- Startup CLI file-open path is now single-instance safe and deterministic: second launch requests focus existing window and opens the requested file through the existing dirty-check flow.
- CLI parsing for positional file arguments is now robust for launcher-style argv layouts and `file://...` paths.

## [0.37.1] - 2026-04-14
### Fixed
- Improved responsive toolbar layout on narrow windows (Linux/Windows): top control rows now wrap predictably instead of visually overlapping or producing broken button text alignment.
- Stabilized file-header control row wrapping (`New Tune`, `Templates`, `Errors`, `Follow`, `Globals`) so controls flow as coherent groups at reduced widths.

## [0.37.0] - 2026-04-08
### Changed
- Library Tree sorting is now split into two independent controls:
  - `Sort groups` (top-level file/group ordering),
  - `Sort tunes` (ordering of tunes inside each file/group).
- In grouped modes (`Group by` not `File`), default group ordering is now deterministic by name (`Name A→Z`) for clearer navigation.
- Legacy library sort settings are migrated (`file_asc`/`file_desc` -> `name_asc`/`name_desc`) to keep existing user preferences compatible.

## [0.36.1] - 2026-04-05
### Added
- Help menu now includes a direct link to Jef Moine's `abc2svg / abcm2ps` directive reference:
  `Help -> abc2svg / abcm2ps Reference (Jef Moine)`.
- User docs now include practical guidance for using Templates to apply `%%MIDI`-style playback overrides without manually rebuilding boilerplate.

### Changed
- README and User Guide now explicitly document that ABCarus rendering/playback is powered by bundled `abc2svg`, with a direct reference link for advanced directives.

## [0.36.0] - 2026-04-03
### Added
- Command-line startup options:
  - `--version` / `-version` (print version and exit)
  - `--input <path>` / `-input <path>` (open file at startup)
  - positional file path support (open file at startup)
  - `--factorysettings` / `-factorysettings` (reset persisted state/settings before startup)
  - `--log` / `-log` (session log file under userData)
- Documentation updates for CLI usage across Linux/Windows/macOS and development (`npm start -- ...`).

### Changed
- Main window startup behavior now restores persisted window geometry/state (bounds + maximized/fullscreen), instead of always defaulting to maximized.

### Fixed
- Raw mode now always loads the latest on-disk file state after Save (no stale working-copy snapshot when switching to Raw).

## [0.35.0] - 2026-03-23
### Changed
- Upgraded bundled `abc2svg` runtime to latest upstream tip (post-fix from Jef) and refreshed integrated playback assets:
  `abc2svg-1.js`, `snd-1.js`, `MIDI-1.js`, `version.txt`.

## [0.34.5] - 2026-03-14
### Fixed
- Print/Preview/PDF now preserve notation/text font overrides reliably by resolving bundled font URLs for the temporary print document.
- Font assignment in Settings is now robust when users add/remove custom fonts across `Notation font` and `Text font` selectors:
  text-family names such as `FinaleMaestroText-Regular` are classified correctly, selectors stay synchronized, and stale removed references are cleared.

### Added
- Startup splash status plumbing between renderer and main process (`app:startup-status`) for clearer startup-phase reporting.
- Setting `Startup splash duration (s)` in `Settings -> General -> Startup` to control minimum splash visibility (0 disables splash).

### Changed
- Updated bundled `abc2svg` engine files (`abc2svg-1.js`, `MIDI-1.js`) to the current integrated upstream state used in this tree.

## [0.34.4] - 2026-03-02
### Fixed
- Unified `Close` behavior: toolbar `Close` and `File -> Close` now use the same close-to-empty flow (no implicit auto-open of another file).
- Empty-buffer flow: after closing to `Untitled (unsaved)`, typing now creates a working document state so `Save` works reliably (opens `Save As` when needed).
- Window title in empty draft state now shows `Untitled (unsaved)` consistently and tracks draft dirty state.

### Changed
- Settings editor now supports rectangular selection (`Alt+drag`, with `Ctrl+Shift+drag` fallback where OS intercepts `Alt` drag).

## [0.34.3] - 2026-02-28
### Added
- Focus playback regression fixture for `X:218 Slide Dance` (`devtools/focus_playback_harness/fixtures/slide_dance_x218_focus_repeat.abc`) with explicit reprise-boundary coverage.
- Focus playback harness coverage for visible-scope repeat-close extension (`TEST 19`), preventing premature stop before `:|` in `Suppress repeats = off`.

### Changed
- Focus toolbar controls are now grouped by intent (range / playback options / voices) for a cleaner scan path.
- Focus labels were shortened for readability (`No repeats`, `Chords`, `Drums`, `Voices`) while preserving behavior.
- Focus mode now hides non-essential top-bar actions (`Library`, file actions, `Raw`, `MIDI`, `Split`) to reduce toolbar noise during loop work.
- Normal mode label restored to `Loop selection` with explicit tooltip: applies to text selection in the ABC editor (not staff selection).

### Fixed
- Focus playback (`visible` mode, `Suppress repeats = off`): end boundary now auto-extends to the nearest required `:|` when the visible slice cuts an open `|:` block, so final reprises are not dropped.
- Focus playback end-boundary enforcement uses exclusive end-symbol semantics, improving deterministic repeat execution at range boundaries.
- Focus playback options (`Gchords` / `Drums`) are now directly controllable from the Focus toolbar and applied on the next start without opening Settings.

## [0.34.2] - 2026-02-28
### Changed
- `File -> Open` now includes a dedicated `ChordPro` file filter for quicker selection in mixed score folders.

### Fixed
- ChordPro auto-detection on Windows now checks the default install location (`Program Files\\ChordPro.ORG\\ChordPro\\chordpro.exe`, including x86 variant).
- ChordPro file detection now also recognizes `.chord` extension.

## [0.34.1] - 2026-02-27
### Added
- ChordPro settings: new optional paths in `Settings -> Advanced -> Options -> Tools -> Import/Export` for
  `ChordPro: binary path` and `ChordPro: repo path` to support explicit CLI resolution across platforms.

### Changed
- ChordPro integration is now non-blocking: opening/editing ChordPro files no longer requires a working CLI.
- ChordPro PDF Preview button state is now availability-aware in ChordPro mode (enabled only when CLI is available).

### Fixed
- ChordPro UX flow: when opening a ChordPro file without CLI, app now shows a compact guidance toast with exact settings path, instead of blocking file open.

## [0.34.0] - 2026-02-26
### Added
- abc2svg tooling: new `npm run abc2svg:fetch-tip` helper to download latest upstream tip zip into `third_party/_upd/`.
- About diagnostics: show current bundled `abc2svg` version/date in system information.

### Changed
- Upgraded bundled `abc2svg` package to `v1.22.37`.
- abc2svg upgrade pipeline now applies package files consistently (including `version.txt`) and no longer skips `abc2svg-1.js` on version/date-only diffs.
- Release downloads report: added compact terminal format (`--format compact` / `--compact`) and excluded checksum assets from totals/breakdown.

### Fixed
- File-header sanitization now preserves all content inside `%%beginsvg ... %%endsvg` blocks (no line stripping inside SVG blocks).

## [0.33.1] - 2026-02-21
### Changed
- Follow playback synchronization now resolves note anchors by nearest timing (forward-biased on ties) to reduce visual lag/jitter in dense multi-voice passages.
- Follow auto-scroll during playback now uses deterministic instant movement (no easing), eliminating delayed “catch-up” behavior on long scores.
- Local dev runner now defaults to cacheless startup (`ABCARUS_DEV_NO_CACHE=1`) and clears Electron runtime caches in dev for more reliable verification after code changes.

### Fixed
- Follow mapping robustness: note-highlight lookup now uses indexed nearest-note resolution instead of repeated broad SVG queries, reducing highlight instability and scroll stutter.
- Playback preparation now rebuilds payload state per start, preventing stale tune-switch state from leaking into Follow/playback mapping.
- Debug dumps now include explicit Follow pipeline version to verify the running code path during regression analysis.


## [0.33.0] - 2026-02-16
### Added
- Export: MP3 export via external `TiMidity++ -> FFmpeg (libmp3lame)` pipeline (`File -> Export -> MP3…`) with runtime availability checks.
- Settings: configurable paths for MP3 toolchain binaries (`MP3 export: TiMidity++ path`, `MP3 export: FFmpeg path`) with PATH auto-detection fallback.

### Changed
- Linux portal save dialogs: enabled filename-preserving defaults for export/save flows so suggested names are applied consistently.
- MIDI input popover wording clarified (`Preview volume (input + typing)`, `MIDI preview ms`) to match actual behavior.

### Fixed
- Focus playback muting: voice muting now applies at parsed-symbol level, remains deterministic in multi-voice tunes, and correctly supports muting `V:1` (including implicit first-voice mapping when explicit `V:1` is missing/malformed).
- Focus playback robustness: fixed no-sound failures caused by muted-voice preprocessing edge cases.
- Typing note preview: inline field directives like `[P:...]` / `[K:...]` / `[V:...]` no longer trigger note preview.
- Preview loudness consistency: MIDI-input preview and typing preview volume are now synchronized (UI + persisted settings), removing mismatched perceived loudness.
- Export dialogs: hardened MusicXML save dialog error handling and aligned suggested-name behavior across MusicXML/MIDI/MP3/PDF/settings export.

### Tests
- Focus playback harness extended for muted-voice invariance and first-voice fallback (`V:1` implicit mapping).
- Note preview harness extended with regression coverage for inline field suppression (`[P:...]` should not sound).

## [0.32.3] - 2026-02-14
### Added
- Tools → Transform: new `Reflow by Linebreak Marker` action that reflows by `I:linebreak` / `%%linebreak` marker (default `$`).
- Measures harness: added regression fixtures/cases for linebreak-marker reflow, including marker-tail comments (`$ %N`) and mid-block inline comments.

### Changed
- Tools menu IA: removed nested `Transform` bucket; related operations are now grouped directly under `Tools` (`Transpose`, `Note Lengths`, `Bar Layout`).
- Help menu IA: moved `Toggle Developer Tools` and `Open Settings Folder` under `Help → Diagnostics`; moved `Diagnostics` section below `Report an Issue…`.
- Toolbar/File-header controls: added/expanded labels and icons for `New Tune`, `Templates`, `Focus`, `Split`, `Errors`, `Follow`, `Globals`, `Refresh`, and `Clear`; refreshed `Fonts` icon for clearer meaning.

### Fixed
- Linebreak-marker reflow no longer produces short/fragmented lines around marker comments; comment-bearing lines now merge deterministically with adjacent music blocks.
- File-header toggle buttons (`Errors`/`Follow`/`Globals`) no longer lose icons during runtime state updates.
- Renderer build guard now enforces inline toolbar SVG sprite usage (macOS-safe path; prevents regressions to external icon loading).

## [0.32.2] - 2026-02-14
### Fixed
- Focus playback: segment bar-range resolution no longer shifts when muted voices are configured; From/To now resolve deterministically from score bar numbering.
- Focus toolbar: `From` and `To` fields are now independent while editing (no cross-overwrite during typing).
- Focus playback: when `To < From`, bounds are normalized by swapping only at Play/Resume time.

### Changed
- Added/expanded automated Focus regression harness scenarios for reprise/volta boundary resolution and muted-voice invariance.

## [0.32.1] - 2026-02-13
### Fixed
- Typing note preview now ignores non-musical text contexts (headers/comments/lyrics/quoted text), so ordinary prose editing no longer triggers note audio.

## [0.32.0] - 2026-02-12
### Added
- Editor: optional `Play notes while typing` preview with `On delimiter` or `Immediate` trigger modes.
- Editor: typed-note preview options for duration mode, envelope (`Short`/`Medium`), and optional retrigger when duration suffix is typed.
- Play menu: added `Play Notes While Typing` toggle for quick on/off without opening Settings.

### Changed
- MIDI input preview labels now explicitly describe WebAudio note preview (replacing legacy “beep” wording in UI/settings).

### Fixed
- Immediate typing-preview mode now handles contiguous note entry (for example `d4e4f4`) and applies typed durations correctly.

## [0.31.1] - 2026-02-12
### Added
- Focus toolbar: added inline controls for selection-scope playback options (`Suppress repeats`, `Mute voices`) so they can be changed without opening Settings.

### Fixed
- Focus loop playback now honors selection-scope option changes from the toolbar immediately on next start (repeat suppression and voice muting).

## [0.31.0] - 2026-02-11
### Added
- Dialog memory: file chooser dialogs now remember the last successfully used folder and reopen there across sessions.

### Fixed
- Playback (Focus loop): bar-range bounds now resolve deterministically in linear visible order, preventing loop ranges like `3..6` from running past the selected end on repeat-heavy material.
- Measures reflow: inline key-change fields (e.g. `[K:F]`) are no longer absorbed into barline tokens, preventing broken inline field formatting in imported/reflowed output.
- Linux portal dialogs: improved default-path behavior and URI path normalization (`file://...`) for better folder recall reliability.

### Changed
- Documentation: microtones/MIDI notes are now user-oriented and exclude internal implementation-only references.

## [0.30.1] - 2026-02-10
### Fixed
- Meter diagnostics: bar-length checks now handle `&` overlays as parallel strands (use longest strand), avoiding false mismatch warnings from summed durations.

## [0.30.0] - 2026-02-09
### Added
- Dev QA: added `test:ui-smoke` (`scripts/ui_smoke.mjs`) with an Electron UI self-check mode (`ABCARUS_DEV_UI_SMOKE=1`) to verify key renderer contracts automatically.

### Changed
- UI controls: unified button styling across renderer surfaces (toolbar, file header actions, templates, tool panels, set list, catalog actions) with a shared tactile press/hover model and common theme tokens.
- UI controls: unified dropdown (`select`) styling to match the button theme (height, radius, borders, background, hover/focus behavior), while keeping local width/layout constraints.
- Header controls: made segmented control groups render as visually detached button sets with consistent spacing.
- Focus toolbar: hides `Loop selection` while Focus mode is active to avoid presenting two loop concepts at once.
- Library Catalog: aligned `.lib-btn` styling with the shared control contract.

### Docs
- Added a required UI change verification protocol to [ORIENTATION.md](ORIENTATION.md) (run-from-repo + explicit acceptance checks + visible diagnostic delta first when needed).

## [0.29.2] - 2026-02-08
### Fixed
- Save flow hardening: explicit save-intent routing (`replace_tune` / `append_to_file` / `full_file`) to avoid ambiguous Save behavior in edge contexts.
- Tune save: normalize tune text to `X:`-first form before write/sync, so leading comment/banner lines before `X:` no longer break save.
- New tune append: strengthened target-file resolution to reduce accidental “no target” failures.

### Changed
- Selection playback now requires an intentional bar-span selection (playable content + barline) instead of any non-empty selection.
- Added a compact selection-playback flags toast (loop/repeats/chords/voices/drums) shown only when selection playback is actually engaged.

## [0.29.1] - 2026-02-05
### Changed
- Playback: selection playback now supports looping and options via Settings (repeats/chords/voice mute); A–B toolbar controls removed.
- Playback: selection mode can optionally allow MIDI drums (best-effort).
### Added
- Notation fonts: bundle Golden Age and Ekmelos (SMuFL).

## [0.29.0] - 2026-02-05
### Added
- Experimental: ChordPro mode with selectable ABC fragments and full-file view (Raw) support.
- ChordPro: PDF preview/export via ChordPro CLI (unsaved edits supported for preview).
- ChordPro: refuse to open if ChordPro CLI is unavailable; extended file extensions (including `.chopro`).

### Fixed
- ChordPro: keep working-copy sync consistent after transforms (e.g., Align Bars) so Save/Raw reflect changes.

## [0.28.0] - 2026-02-03
### Added
- Export: MIDI file export (abc2svg midigen).
- Playback: configurable reverb/chorus levels (CC91/CC93) with built-in audio FX.
- Playback: FX presets for reverb/chorus (including Custom/manual mode).
- Errors: show drum skeleton mismatch warnings in the Errors list.

### Changed
- Updated bundled abc2svg core and playback engine.

## [0.27.0] - 2026-02-02
### Added
- MIDI input (step): enable/disable, mute, key-aware spelling, and grid-length insertion.
- MIDI input: taskbar indicator + popover controls (including beep toggle, volume, duration).
- MIDI input: optional low-note text macros for barlines/durations/repeats.

## [0.26.0] - 2026-02-02
### Added
- ABC Helpers (Ctrl+F2): GM program picker for `%%MIDI program/chordprog/bassprog` with search + auto-comment insertion.
- ABC Helpers (Ctrl+F2): `%%MIDI drum` mini-editor with pattern fields, bar grouping, hit list, and GM drum picker.
- ABC Helpers (Ctrl+F2): `%%MIDI gchord` mini-editor with legend and beat-aligned preview.

### Fixed
- Playback Follow: keep highlighting stable for multi-line `%%MIDI drum +:` directives (avoid length-shifting sanitization).

## [0.25.2] - 2026-02-01
### Fixed
- Save: verify on-disk content matches the working copy (post-write read-back); failed verification is treated as a failed Save.
- Templates: widen the modal by default and add a preview right-click menu (Copy / Select All).

## [0.25.1] - 2026-01-30
### Fixed
- Toasts: hide non-critical messages unless Diagnostics → “Show Debug Messages” is enabled.


## [0.25.0] - 2026-01-30
### Added
- Library: group by `T` using a normalized TitleKey, plus TitleKey-aware quick search in Library Catalog.
- Library Settings: configure TitleKey length, strict TitleKey mode, and optional library cache (default OFF) with a reset action.
- Diagnostics: optional toggles for debug messages and auto-debug dumps (Help → Diagnostics).

### Fixed
- Playback selection: stabilize range playback and clean up stale playhead markers after playback ends.

## [0.24.4] - 2026-01-27
### Fixed
- Errors: do not flag pickup (anacrusis) or final partial bars as mismatches, and keep bar numbers aligned with abc2svg.

## [0.24.2] - 2026-01-27
### Added
- Templates: allow choosing a template for New from Template, with Insert/Replace/Append actions.
- Templates: support `.abc` files without `X:` by treating the whole file as a template (auto-adds `X:` on insert).
- Templates: add in-app “Edit…” action to open the selected template file externally.

### Changed
- Templates: group related actions under `File → Templates` and add `Edit → ABC Helpers…` + `File → Revert to Disk`.

## [0.24.0] - 2026-01-27
### Changed
- Errors: show bar-length markers only when `Errors` is enabled, and move bar-mismatch badges into a non-overlapping line header.
- Errors: make the `Scan` button explicitly scan the file for error tunes (and toggle the error-only tune filter).

### Fixed
- Errors: prevent CodeMirror crashes from unsorted bar-mismatch decorations.
- Errors: treat pickups (anacrusis) and split bars that sum to a full measure as valid patterns.
- Errors: anchor bar mismatch navigation by explicit editor offsets, not just line/column parsing.

### Added
- Errors: include bar mismatch diagnostics in the `Errors` list and enable jump-to-bar navigation.

## [0.23.2] - 2026-01-26
### Added
- Diagnostics: add Payload Mode to inspect the current tune’s Render vs Playback payload (including per-layer/delta highlighting).
- Debug dumps: include working copy state plus a lightweight recent-actions trace to aid troubleshooting intermittent issues without reproduction steps.

### Fixed
- Playback drums: align injected `V:DRUM` bar/repeat skeleton with the primary voice and preserve original line wrapping for easier comparison.
- Playback drums: use `c`/`d` tokens for `%%MIDI drummap` keys (does not affect sound, improves readability).
- Working Copy: auto-reopen a missing WC session on Save to avoid “No working copy open” save failures.

## [0.23.1] - 2026-01-25
### Fixed
- Charset: honor `%%abc-charset` when reading `.abc` files (tolerant-read / strict-write) so non-UTF8 tunebooks render correctly without changing the app UI encoding.
- Library: apply `%%abc-charset` decoding during library scans so file/tune names display correctly in the UI for mixed-encoding libraries.
- UI: move Intonation Explorer from `Tools → Diagnostics` to `Tools → Study` to better reflect its purpose.

## [0.23.0] - 2026-01-25
### Added
- Settings: Fonts — configure UI + Library Tree font family/size (with sensible defaults and reset/import/export support).
- Transpose harness: add a regression fixture/test to prevent “large numeric” EDO-53 accidentals from being emitted.

### Fixed
- Transpose (EDO-53): avoid “mathematical” spellings like `_10B` / `^13G` by constraining output to the canonical micro-accidental set.

### Changed
- UI: make app modals draggable/resizable so tool dialogs don’t trap the user behind fixed overlays.

## [0.22.14] - 2026-01-24
### Added
- Makam DNA: ship a generic built-in dataset (`docs/makam_dna/MAKAM_DNA.json`) and allow editing it in-app from Intonation Explorer (saved locally under userData; does not modify tunes).
- Docs: ADR-0009 startup diagnostics playbook for Chromium `userData` storage corruption and safe repair.
- Docs: ADR-0010 (proposed) plan for moving renderer tools into modules + contributor stability rails.

### Changed
- Status chip: show `Loading…` during startup until the app finishes initialization and the library/tune is ready.

## [0.22.13] - 2026-01-24
### Added
- Intonation Explorer: show Perde names (EDO-53) and expand Perde coverage for the SymbTr makam corpus.

### Fixed
- Intonation Explorer: always show numeric micro-accidentals (EDO-53) in the table to avoid ambiguous `^`/`_` spellings.
- Intonation Explorer: include octave marks in `ABC (effective)` so octave variants don’t collapse into one row.
- Perde mapping: align register selection with ABC octave/case (e.g., `^f` = Evç vs `^F` = Irâk).

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
- Help: add an in-app user guide (`Help → ABCarus User Guide`) and a new [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

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
