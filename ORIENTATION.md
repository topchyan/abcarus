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

### Debug dumps (preferred over live console logs)

- Manual dump: `Ctrl+Shift+D` → saves `abcarus-debug-*.json`.
- Dumps include file+tune identity near the top (`context.label`, `context.filePath`, `context.xNumber`).
- Default dump dir when running from source: `scripts/local/debug_dumps/` (not committed).

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

