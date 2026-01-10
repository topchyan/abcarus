# Workflow (Quick Reference)

This is the “day-to-day” workflow for ABCarus: how we run the app, how we cut releases, what we commit, and which debug flags matter.

## Quick Start (Dev)

```bash
npm install
npm start
```

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
