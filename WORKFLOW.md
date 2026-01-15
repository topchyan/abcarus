# Workflow (Quick Reference)

This is the “day-to-day” workflow for ABCarus: how we run the app, how we cut releases, what we commit, and which debug flags matter.

## Quick Start (Dev)

```bash
npm install
npm start
```

### Gotcha: `ELECTRON_RUN_AS_NODE`

If `ELECTRON_RUN_AS_NODE=1` leaks into your environment, Electron starts in "Node mode" and the app will not open (main process crashes early; e.g. `app.whenReady` is undefined).

- Check: `env | grep ELECTRON_RUN_AS_NODE`
- Fix (current shell): `unset ELECTRON_RUN_AS_NODE`

For local dev runs, `scripts/local/run.sh` defensively unsets it.

## Branch Status

- `feat/playback-autoscroll` — experimental / archived (kept for history; do not base new work on it).
- Use branches based on `master` (or the current stabilization PR branch) for new work.

## Release (3–5 commands)

1) Update `CHANGELOG.md` under `## [Unreleased]` (make sure it’s not empty).
2) Bump version + tag (pick one):

```bash
npm run release:patch
# or: npm run release:minor
# or: npm run release:major
```

3) Push commit + tag:

```bash
git push
git push origin vX.Y.Z
```

### One-command publish (guarded)

If you want a single command that prepares a release and pushes `master` + the tag, use:

```bash
npm run publish:patch
```

Guards:
- Refuses to run unless you are on `master`.
- Requires a clean working tree.
- Requires `master` to match `origin/master` before preparing the release.
- Requires `CHANGELOG.md` `## [Unreleased]` to be non-empty.

Example (patch):
```bash
npm run release:patch
# prints: Release prepared: v0.19.2 (example)
git push
git push origin v0.19.2
```

4) Verify GitHub Actions produced the expected artifacts for the tag:
   - Tag push triggers GitHub Actions workflows, including `.github/workflows/release-assets.yml`.
   - Look for artifacts either on the GitHub Release page for `vX.Y.Z` and/or in Actions (run artifacts).
5) Sanity check the built app (start, open file, render, play; and import/export if Python is bundled).

For the detailed checklist see `docs/RELEASE_CHECKLIST.md`.

## Release Channels: Stable vs RC (Unstable)

- **Stable** releases use tags like `vX.Y.Z` (e.g. `v0.20.2`) and are treated as the default “Latest” channel.
- **RC / Unstable** releases use tags like `vX.Y.Z-rc.N` (e.g. `v0.20.3-rc.1`).

GitHub Actions will automatically mark any tag that contains a `-` (for example `-rc.1`) as a GitHub **Pre-release**
when uploading assets via `.github/workflows/release-assets.yml`.

## Third-party updates (abc2svg)

Upstream `abc2svg` updates usually arrive as a source snapshot under `third_party/_upd/` (not committed). The safe workflow:

```bash
# 1) Generate a review report (SAFE / HOLD)
npm run thirdparty:review -- --candidate third_party/_upd/<abc2svg>.zip --abc2svg-build

# 2) Apply the upgrade (keeps the change small and easy to revert)
npm run abc2svg:upgrade -- --zip third_party/_upd/<abc2svg>.zip --apply

# 3) Run local harness checks
npm run test:measures
npm run test:transpose
npm run test:settings
npm run test:truth-scale
```

Details + checklist live in `docs/third-party-review.md`.
For a repeatable end-to-end “pipeline” (including required manual smoke tests and patch policy), use:
- `docs/abc2svg-upgrade-playbook.md`

## Verify release via `gh` (no browser)

If you have GitHub CLI installed and authenticated (`gh auth login`), you can verify releases from the terminal:

```bash
gh auth status

# See the latest releases
gh release list -L 10

# See assets attached to a specific release
gh release view vX.Y.Z

# Check the tag-triggered workflow runs
gh run list -L 10 --workflow release-assets.yml
```

Notes:
- `release-assets.yml` runs on `push` to tags `v*` and uploads artifacts to the GitHub Release for that tag.
- It also supports manual runs (workflow_dispatch) with inputs:
  - `ref`: git ref to build (use a tag like `vX.Y.Z` to publish)
  - `publish`: when `true`, uploads artifacts to the GitHub Release (only for `ref` starting with `v`)

Manual rebuild example (no browser):
```bash
gh workflow run release-assets.yml -f ref=vX.Y.Z -f publish=true
```

## GitHub Actions artifact quota

GitHub Actions “Artifacts” storage is quota-limited. If the quota is exhausted, workflows that use `actions/upload-artifact`
will fail with “Artifact storage quota has been hit”.

ABCarus avoids this for releases by uploading binaries to **GitHub Releases** via `.github/workflows/release-assets.yml`
(instead of Actions Artifacts).

## If release script fails (EPERM / git issues)

If `npm run release:*` fails due to git permissions or an “EPERM” error, do the minimal manual fallback:

1) Ensure `CHANGELOG.md` has a filled `## [Unreleased]` section.
2) Manually bump `package.json` (+ `package-lock.json` if present) to the target version.
3) Commit:

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
```

4) Tag and push:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push
git push origin vX.Y.Z
```

## What We Commit / Don’t Commit

**Committed (expected in git):**
- Source code (`src/`), build scripts (`scripts/`, `devtools/`), and project docs (`docs/`).
- `package.json` and `package-lock.json`.
- Deterministic locks (e.g. PBS lock files): `third_party/python-embed/*/python-build-standalone.lock.json`.

**Not committed (kept local by policy):**
- Local-only helpers and dumps: `scripts/local/**`, `debug_dumps/**`.
- Raw chat exports and private QA notes: `docs/qa/**`.
- Brand “kitchen”/drafts: `assets/brand/**`.
- Download/update staging: `third_party/_upd/**`.
- Installed PBS runtimes and caches:
  - `third_party/python-embed/.cache/**`
  - `third_party/python-embed/*/(bin|lib|include|share)/**`

The canonical list lives in `.gitignore`; this section documents intent.

## Branch / Push etiquette (especially during debugging)

To avoid spamming GitHub with WIP commits during rapid iteration:

- Prefer **local-only iteration** while investigating a bug (uncommitted changes or local commits).
- Do **not** push a branch until you have a coherent checkpoint (or someone explicitly asks to push/PR).
- If you need to share progress mid-way, prefer a **single “checkpoint” push** with a clear message (or open a Draft PR), rather than many small pushes.
- Once the fix is confirmed, squash/clean up as needed, then push and open/update the PR.

## Useful Environment Variables (Debug / Ops)

**UI / platform diagnostics**
- `ABCARUS_DEBUG_KEYS=1` — log keyboard shortcuts and key routing.
- `ABCARUS_DEBUG_DIALOGS=1` — log file-dialog parenting/bounds decisions (Linux window-manager issues).
- `ABCARUS_USE_PORTAL=1` — force xdg-desktop-portal dialogs on Linux (helps on some desktops).
- `ABCARUS_DEBUG_THEME=1` — print detected/forced theme and chosen window icon.

**Library / indexing**
- `ABCARUS_DISABLE_LIBRARY_INDEX=1` — disable the persisted library index (kill-switch).

**Python (MusicXML import/export)**
- `ABCARUS_ALLOW_SYSTEM_PYTHON=1` — allow falling back to system Python when no bundled runtime is present.
- `ABCARUS_ALLOW_OTHER_PYTHON=1` — allow non-3.11 Python (normally rejected).

**Build metadata (About dialog)**
- `ABCARUS_BUILD_NUMBER=...` — build number (CI typically uses `GITHUB_RUN_NUMBER`).
- `ABCARUS_COMMIT=...` — commit hash override (otherwise derived from git).
- `ABCARUS_BUILD_DATE=...` — build date string shown in diagnostics.

**Linux window icon selection**
- `ABCARUS_LINUX_WINDOW_ICON_VARIANT=dark|light` — force window icon variant (debug/override).

## Debug playbook (when something breaks)

When reporting a bug, try to include: app version (About), OS/desktop, minimal ABC snippet/file, and exact repro steps.

**Where logs go**
- Electron main process logs go to the terminal you launched `npm start` from.
- Renderer logs go to DevTools Console (View → Toggle Developer Tools).
- Debug dumps are JSON files you can attach to issues/PRs. They include the active file path + tune identity near the top (`context.label`, `context.filePath`, `context.xNumber`).

**Debug dumps (recommended)**
- Manual dump: press `Ctrl+Shift+D` (or menu action) and save `abcarus-debug-*.json`.
- Auto-dump on runtime errors (opt-in for development):
  - `ABCARUS_DEV_AUTO_DUMP=1 npm start`
  - Optional: `ABCARUS_DEV_AUTO_DUMP_DIR=/some/path` (override dump directory)
  - Runtime toggle (DevTools): `window.__abcarusAutoDumpOnError = true|false`

**Experimental: abc2svg native `%%MIDI drum*`**
- Enable native drum handling for playback (dev only): `ABCARUS_DEV_NATIVE_MIDI_DRUMS=1 npm start`
- Runtime toggle (DevTools): `window.__abcarusNativeMidiDrums = true|false`
- Note: this is experimental; for compatibility it may move `%%MIDI drum*` directives that appear before `K:` to just after `K:` during playback parsing.
- UI toggle: Settings → Playback (Advanced) → “Use native abc2svg %%MIDI drum* (experimental)”.

**Keyboard shortcuts / key routing**
```bash
ABCARUS_DEBUG_KEYS=1 npm start
```
Reproduce and copy the `[keys] ...` lines from the terminal.

**Playback issues (parse errors, Follow, “cannot start”)**
- In DevTools Console (no rebuild needed):
  - `window.__abcarusDebugPlayback = true` (prints playback payload/head + parsed previews)
  - `window.__abcarusPlaybackTrace = true` (per-note trace; no reload required)
  - `window.__abcarusDebugDrums = true` (prints drum-related payload lines)
- Optional toggles (set before starting playback, then try again):
  - `window.__abcarusPlaybackStripChordSymbols = true`
  - `window.__abcarusPlaybackExpandRepeats = true`
- Useful dump helpers:
  - `window.__abcarusPlaybackDebug?.getState()`
  - `window.__abcarusPlaybackDebug?.getDiagnostics()`
  - `window.__abcarusPlaybackDebug?.getTrace().slice(-50)`

**Icons (Linux)**
- Install/update local icons: `bash scripts/install_icons.sh`
- If the DE still shows the old icon, re-run `gtk-update-icon-cache` for your hicolor dir (the script already tries).
