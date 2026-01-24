ADR-0010 — Renderer Tool Modules & Stability Rails

Date: 2026-01-24  
Status: Proposed

## Context

ABCarus’s renderer has grown organically into a large single file (`src/renderer/renderer.js`) that contains:
- UI wiring
- library interactions
- editor/render/playback logic
- and several “tools” / diagnostics panels (e.g., Intonation Explorer)

This has led to recurring problems:
- High-risk edits in unrelated areas (small changes ripple across the file).
- Slow onboarding for new contributors/agents (“100 sources of truth”).
- Accidental UI/design drift (agents “improve” UX without the project’s design intent).
- Difficulty shipping optional features without destabilizing core editing/saving workflows.

We want:
- stable core behaviors for non-technical users,
- isolated tool features that can evolve independently,
- and explicit rails for contributors/agents.

## Decision

### 1) Define “Core” vs “Tools”

**Core** (must remain stable):
- open/save/working-copy flows
- library scan/index navigation
- rendering/playback fundamentals
- header/tune boundary rules

**Tools** (optional, diagnostics/analysis features):
- panels that do not modify user data by default
- read-only analysis of working copy snapshots (single source of truth)

### 2) Move tool implementations into modules

Over time, migrate tools out of `renderer.js` into:
- `src/renderer/tools/<toolName>/...`

Each tool module should expose a small, explicit surface:
- `init({ api, ui, state, services })`
- `open()` / `close()` (optional)
- `dispose()` (optional)

No tool module should:
- do direct disk I/O (must use IPC via preload)
- rename existing IPC channels or menu action strings
- mutate working copy / files unless the tool is explicitly an editor (most are not)

### 3) Stability rails for agents/contributors

When touching UI/UX:
- Do not “redesign” existing UI without an explicit request and before/after screenshots.
- Prefer additive, reversible changes.
- Keep controls compact and consistent with existing modals/tool panels.

When touching persistence or file operations:
- tolerant-read / strict-write remains mandatory
- all writes remain atomic+retry (main process)

### 4) Documentation: a single onboarding path

Onboarding entrypoints are:
1) `AGENTS.md` (hard constraints)
2) `ORIENTATION.md` (what to read + triage playbooks)
3) `docs/README.md` (developer docs index)
4) ADRs in `docs/adr/` (why decisions exist)

## Consequences

Positive:
- Reduced blast radius for tool changes.
- Easier code review and faster onboarding.
- Less UI drift and fewer “helpful” regressions.

Trade-offs:
- Migration takes time and must be incremental.
- Some shared helpers will need lightweight “services” modules.

## Migration plan (incremental)

1) New tools must be added as modules under `src/renderer/tools/`.
2) Existing tools are moved one at a time (no big-bang refactor).
3) Keep behavior identical during moves; changes must be split into:
   - “move-only” commits
   - “behavior change” commits
