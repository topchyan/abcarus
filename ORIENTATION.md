# ABCarus — Orientation (for new Codex chats)

This document is the “memory handoff” for continuing work on ABCarus without re-discovering basics each chat.
Read this first, then follow the referenced docs.

## What this repo is

ABCarus is a small Electron desktop app for working with ABC notation:
- Main process: `src/main/` (window, IPC, menu).
- Preload bridge: `src/preload.js` (renderer ↔ main IPC).
- Renderer/UI: `src/renderer/` (HTML/CSS/JS).
- Import/export tooling: `third_party/` (Python scripts, abcMIDI `abc2abc`).

## Project invariants (do not break)

- Prefer **tolerant-read / strict-write**: easy to scan/search, hard to corrupt user data.
- File writes must be **safe** (atomic replace when possible; temp+rename; retries for platform quirks).
- Avoid clever abstractions; keep state ownership clear and changes auditable.
- Throttle UI progress/status updates; do not spam renderer events.
- Maintain existing **menu action strings** and **IPC message names**.
- Keep changes small and focused; avoid new dependencies unless necessary.

## “Where to look” (in order)

1) `AGENTS.md` — repo-specific agent notes + constraints.
2) `WORKFLOW.md` — day-to-day workflow, release flow, debug flags, “what not to commit”.
3) `README.md` — user-facing overview and quick commands.
4) `docs/` — deeper docs and release notes/checklists.

## Local development

- Install deps: `npm install`
- Run app: `npm start`

If something behaves “impossibly” (e.g. Electron commands acting like Node), check environment gotchas in `WORKFLOW.md`.

## Debugging workflow (preferred)

## Startup triage (do this early)

If startup suddenly becomes very slow (blank/white window for seconds), do **not** assume it is a code regression first.
Electron/Chromium can get stuck on corrupted or locked browser-storage databases under `userData` and stall startup.

### 1) Confirm where `userData` lives (Linux)

Preferred (non-technical): use the app menu:
- `Help → Open Settings Folder`

Alternative (terminal): while the app is running, find `--user-data-dir=...`:
- `pgrep -af electron | head -n 50`

In dev, this repo’s Electron profile commonly ends up at:
- `~/.config/abc-electron-proto`

### 2) Symptom to recognize

You may see a Chromium log line like:
- `Failed to delete the database: Database IO error`

If this appears and correlates with multi-second startup delays, treat it as a **profile storage issue** first.

### 3) Safe repair (keep app data; reset Chromium caches)

**Goal:** clear only regeneratable Chromium caches (Service Worker storage and code cache), without touching ABCarus state/settings.

1) Quit the app.
2) Back up the important ABCarus files from `userData`:
   - `state.json`
   - `user_settings.abc`
   - `abcarus.properties` (if present)
   - `fonts/` (if present)
   - `templates/` (if present)
3) Delete only these folders (they are safe to regenerate):
   - `Service Worker/Database`
   - `Service Worker/CacheStorage`
   - `Service Worker/ScriptCache`
   - `Code Cache`

After that, launch again. If startup returns to normal and the DB error disappears, the cause was the corrupted/locked Chromium storage.

If the error keeps coming back after cleaning, escalate:
- check filesystem permissions on `userData`
- check OS logs (`dmesg`) for I/O errors

### Debug dumps (preferred over live console logs)

- Manual dump: `Ctrl+Shift+D` → saves `abcarus-debug-*.json`.
- Dumps include file+tune identity near the top (`context.label`, `context.filePath`, `context.xNumber`).
- Default dump dir when running from source: `kitchen/debug_dumps/` (not committed).

Auto-dumps are opt-in (dev only):
- `ABCARUS_DEV_AUTO_DUMP=1 npm start`
- Optional: `ABCARUS_DEV_AUTO_DUMP_DIR=/some/path`

### Repro discipline

When reporting/fixing a bug, capture:
- Exact file path + tune (`X:`) + steps + expected/actual.
- One fresh debug dump produced during/after the failure.

## Git / branch etiquette (important)

During rapid debugging/iteration:
- Prefer working **locally** (uncommitted or local commits).
- Do **not** push WIP commits to GitHub unless explicitly requested.
- Push only when there is a coherent checkpoint (or when asked to open/update a PR).

See also: `WORKFLOW.md` → “Branch / Push etiquette”.

## Third-party updates (abc2svg, etc.)

- Upstream updates may arrive under `third_party/_upd/` (staging; not committed).
- Prefer integrating updates via the repo’s scripts and documenting the delta; avoid hand-editing vendored code unless necessary.

## What never to commit

By policy (see `WORKFLOW.md` and `.gitignore`):
- `scripts/local/**` (local helpers, dumps).
- `third_party/_upd/**` (staging).

## Quick commands (common)

- Run tests/harnesses (when relevant):
  - `npm run test:measures`
  - `npm run test:transpose`
  - `npm run test:settings`
  - `npm run test:truth-scale`

## Releases (patch/minor/major)

ABCarus uses `scripts/release.mjs` (via `npm run release:*`) to prepare releases.
It requires a clean git working tree and a non-empty `CHANGELOG.md` `## [Unreleased]` section.

**Patch release sequence (typical)**
- Ensure `master` is up to date and clean:
  - `git checkout master && git pull`
  - `npm run test:settings && npm run test:measures`
- Add release notes to `CHANGELOG.md` under `## [Unreleased]` (must be non-empty), then commit:
  - `git add CHANGELOG.md && git commit -m "docs: add unreleased notes for next patch"`
- Prepare the release (bumps version, moves changelog entry, creates tag):
  - `npm run release:patch`
- Publish:
  - `git push origin master`
  - `git push origin vX.Y.Z`

**CI gotchas**
- If GitHub Actions fails with “GitHub Releases requires a tag”, you ran the release workflow on a branch ref; publishing happens only on tags (`refs/tags/v*`).
- If GitHub retires runner images (e.g. `macos-13`), update `.github/workflows/release-assets.yml` and cut a new patch tag so the fixed workflow exists in the tag ref used by CI.
