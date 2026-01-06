# Requirements (Product + Engineering)

This document consolidates the *explicit* requirements and invariants that guide ABCarus development. It is meant to prevent “lost context” across chat-driven sessions.

Sources used to build this doc:
- Accepted ADRs in `docs/adr/`.
- Current implementation (see `docs/features.md`, `docs/architecture.md`).

If a requirement in this file conflicts with the codebase, treat it as a signal to either:
1) update the code to match, or
2) update this document to reflect a deliberate change (and record an ADR if it’s architectural).

## Hard invariants (non-negotiable)

### Data safety: tolerant-read / strict-write
- Reads/scans must be tolerant: partial failures must not take down the whole library UI.
- Writes must be strict: operations that modify user files must refuse to proceed when inputs look stale/unsafe.
- Writes must be atomic where possible (temp + rename/replace) and must not corrupt files on failure.
- Platform quirks (notably Windows rename/locking) must be handled with retries/backoff in write paths.

### State ownership: single source of truth
- Renderer owns canonical *UI state* for the Library (Tree/Modal) and related UI preferences.
- Main process owns canonical *I/O state* (filesystem access, scanning/parsing, persisted index, conversions).
- IPC is used as RPC plus throttled progress events; do not stream/replicate large “live store state” over IPC.
- Keep state changes auditable and local; avoid clever abstractions.

### Progress events must be throttled
- Never emit “event per file” progress updates from main→renderer.
- Prefer time-based throttling (e.g., 100–250ms) and always emit a final `done`.

## Functional requirements (by area)

### File menu + document lifecycle
Baseline: standard desktop editor semantics for New/Open/Save/Save As/Close/Quit and window close.
- A single “dirty gate” must protect all destructive actions (New/Open/Close/Quit/window close).
- Cancel means *no state change* (no file switch, no close, no quit).
- `Save` saves the current document; if untitled it must route to `Save As`.
- “Append to library file” (if supported) must be explicit and must not happen as an implicit fallback from `Save`.

### Library scan + indexing
- Full scan UX must remain predictable (Tree shows tunes under files, without new placeholder “lazy loading” states).
- Persisted index in `userData` is an *accelerator*, not a source of truth (see `docs/adr/ADR-0002-incremental-full-scan-gated.md`).
- Open-tune must self-heal on stale offsets: if file changed on disk, re-parse and refuse to silently open the wrong tune.
- Any write action (move/copy/delete/rename/append) must be guarded against stale offsets and refuse loudly instead of corrupting.
- Library progress UI must remain responsive; avoid IPC spam.
- Sorting expectations:
  - Sort-by options include file/tune ascending/descending and update-time ascending/descending.
  - Default sorting favors “most recently updated first” (Update Desc) so newly saved files bubble to the top.

### Import / export workflow
Import sources are treated as *new* tunes/buffers.
- If the editor is dirty, import must prompt: Save / Don’t Save / Cancel.
  - Save: run existing save flow; if save succeeds continue import; if save fails/cancels abort import.
  - Don’t Save: continue import.
  - Cancel: abort import with no changes.
- MusicXML import should run default cleanup transforms before presenting the result to the user:
  - measures per line (commonly 4)
  - bar alignment
- After import, the tune should be saveable:
  - If there is no active file-backed tune, `Save` should guide the user to choose a target `.abc` file and confirm appending the imported tune.
  - If the imported ABC lacks a `T:` title, use a derived title from the source filename as a fallback.
- `Save As` defaults:
  - Default folder: the active library folder (if any).
  - Default filename: `Title - Composer - Key.abc` (or a reasonable subset when fields are missing).
- After a successful `Save As`, the active tune reference must switch from “Untitled” to the new file location and the Library should refresh to show it for the current session (even if outside the initially scanned root; persistence across restarts is not required for out-of-root files).

### Playback + “practice loop” behavior
Playback must be deterministic and must stay in sync between editor and rendered SVG.
- Playback should only start from an explicit Play action, never from SVG clicks.
- Cursor movement must not implicitly start playback or alter the active playback range.
- Any playback range must be defined in *editor text offsets* (canonical ABC source), not in derived indices.
- Stop conditions must be strict: playback must stop before emitting any note beyond the requested end offset.
- Debug surfaces must remain stable if already published (do not remove or rename existing debug APIs without a deliberate migration plan).

### Settings + persistence
- User settings must persist in `app.getPath("userData")` (see `src/main/index.js` state/settings).
- Settings should be portable *in principle* (human-readable, versioned/migratable), but correctness and safety come first.
- Third-party tools that expose important flags should be configurable via Settings, with clear defaults and an obvious “reset to defaults” path.
- Where a native implementation exists (e.g., semitone transpose), it should be the default, and legacy/external tools should remain available as an optional fallback during stabilization.

## Non-goals (for now)
- Cloud sync, accounts, or network-dependent features.
- Complex “DAW-like” playback engines; playback is for reference and editing support.
- Risky automatic rewriting of user libraries without explicit confirmation.

## Related references
- `docs/features.md` (what the code currently does)
- `docs/architecture.md` (where responsibilities live)
- `docs/adr/ADR-0001-library-store-renderer-library-service-main.md`
- `docs/adr/ADR-0002-incremental-full-scan-gated.md`
- `docs/qa/manual-merge-checklist.md`
