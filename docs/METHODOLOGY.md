# Development Methodology (Chat-Driven, Docs-Backed)

This project is developed iteratively via chat sessions. To prevent “context loss”, we treat chat history as *raw input* and maintain explicit, version-controlled sources of truth.

## Sources of truth (ordered)
1) Code + `git` history (canonical).
2) ADRs in `docs/adr/` (architectural decisions + constraints).
3) Requirements in `docs/REQUIREMENTS.md` (product + engineering invariants).
4) `docs/features.md` / `docs/architecture.md` (descriptions of current behavior/structure).
5) Local devlog (optional; kept out of git).
6) Chat exports (raw evidence; not canonical; kept out of git).

## How we capture decisions

### When to write an ADR
Write/update an ADR when a change affects any of these:
- State ownership boundaries (main vs renderer), IPC patterns, persistence model.
- File safety model (atomic writes, stale guards, kill-switches).
- Cross-cutting performance model (scan/index strategy, throttling, caching policy).

ADRs should be small, concrete, and include constraints/acceptance criteria.

### How we record non-architectural decisions
- Add/adjust requirements in `docs/REQUIREMENTS.md`.
- Update `docs/features.md` when behavior changes.
- Optionally append a dated entry to a local devlog for session history and “why”:
  - `node scripts/chat-log.mjs -m "what changed" --notes "optional notes"`

## Chat exports workflow (context preservation)
Rules of thumb:
- Treat exports as raw logs: do not rely on them as “spec” unless the same decision is recorded in an ADR/requirements.
- When a chat introduces a new invariant/requirement, convert it into one of:
  - an ADR (`docs/adr/`), or
  - a requirement (`docs/REQUIREMENTS.md`), or
  - a QA checklist item (`docs/qa/manual-merge-checklist.md`).

## Implementation discipline (project conventions)
- Prefer plain JavaScript; avoid new dependencies unless truly needed.
- Keep state ownership clear (single source of truth per concern).
- Keep IPC surfaces stable: do not rename existing menu action strings or IPC message names casually.
- File writes: safe-by-default (temp + replace/rename, retries for platform quirks).
- Renderer should not access Node APIs directly; use preload/IPC.
- Progress events must be throttled; avoid per-file IPC spam.

## QA philosophy (no automated test suite)
There are no full automated UI tests. Validation is primarily manual and scenario-driven.

Required checks when touching file operations, rename/move, or persistence:
- Follow `docs/qa/manual-merge-checklist.md`.
- Specifically test:
  - read-only files / permission errors
  - file modified on disk between index and write
  - paths with spaces and non-ASCII characters

Targeted harnesses exist for algorithmic work:
- Transposition harness: `devtools/transpose_harness/` (run via `npm run test:transpose`).

## Prioritization (initiative ranking template)
When planning work (especially performance/architecture), rank initiatives using:
- Impact: H/M/L
- Effort: H/M/L
- Risk: H/M/L
- Dependencies
- User-visible change

Store dated plans under `roadmaps/YYYYMMDD/` as Markdown files.

## Release workflow
- User-facing changes live in `CHANGELOG.md` (Keep a Changelog format).
- Session narrative can live in a local devlog (not committed).
- Versioning and releases:
  - `docs/VERSIONING.md`
  - `docs/RELEASES.md`
  - `docs/RELEASE_CHECKLIST.md`

## Licensing hygiene
- Do not copy/translate GPL/LGPL code into app-owned sources unless the licensing plan is explicit and compatible.
- Prefer thin wrappers around third-party tools under `third_party/` so upgrades remain straightforward and license boundaries stay clear.
