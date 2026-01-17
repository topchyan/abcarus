# ADR-00XX — Working Copy Model for ABC Files

Status: Accepted  
Date: 2026-01-17  
Decision Owner: Architect  
Applies to: Editor, Import/Export, Transformers, Jobs, Save/Conflict handling

---

## Context

ABCarus operates on text-based `.abc` files that may contain multiple tunes.
Historically, parts of the system used disk-first workflows:
- reading from disk during operations,
- writing directly to disk from multiple code paths,
- lacking a unified conflict-detection mechanism.

As the system grows (transformers, batch jobs, multi-import, bundles),
disk-first operations create risks:
- silent overwrites,
- partial writes,
- non-deterministic behavior,
- difficult reasoning about state.

A clear data model is required.

---

## Decision

ABCarus adopts a **Working Copy Model**.

When an `.abc` file is opened:
- the entire file content is loaded into memory as a **working copy**,
- the working copy becomes the single source of truth for the session,
- disk state is treated as the last committed snapshot only.

All operations modify the working copy.
Disk writes occur only through explicit commit actions.

---

## Core Principles

1. **In-memory authority**
   - The working copy in memory is authoritative.
   - No operation reads from disk after file load, except explicit reload.

2. **Explicit commit**
   - Writing to disk happens only on:
     - Save
     - Save As
     - Explicit export
   - All writes are atomic.

3. **Session-scoped identity**
   - Tunes are identified internally by position (`tuneIndex`) and/or
     a session-scoped `tuneUid`.
   - `X:` fields are not canonical identifiers.

4. **Snapshot-based operations**
   - Long operations work on immutable snapshots of the working copy.
   - Commits are gated by conflict checks.

5. **No silent resolution**
   - Conflicts, aborts, and cancellations are always explicit and user-visible.

---

## Tune Identity

- `X:` numbers are user data only.
- Canonical identity while the file is open:
  - `tuneIndex` (0-based position), optionally paired with a session-only `tuneUid`.
- Identity does not persist across sessions.
- Identity must survive edits, deletions, and duplicate/missing `X:` fields.

---

## Editing Semantics

- Editing a tune modifies only that tune’s segment in the working copy.
- Other tunes remain unchanged.
- Deleting a tune removes only its segment.
- Undo/Redo (CodeMirror 6):
  - operates on the editor buffer,
  - is independent from disk commit logic.

---

## Versioning and Snapshots

- Each working copy maintains a monotonic `version` counter.
- Any mutation increments the version.
- Jobs capture:
  - `snapshotText`
  - `snapshotVersion`
- A job may commit only if:
  - `currentVersion === snapshotVersion`.

No implicit rebasing is allowed on MVP.

---

## External File Conflicts

Before committing to disk:
- the system rechecks the disk fingerprint
  (mtime/size and/or hash).

If a conflict is detected, the user must choose:
- Overwrite disk
- Save As
- Discard & Reload
- (optional later) View Diff

No silent overwrite is permitted.

---

## Jobs and Long Operations

- File-scope operations must run through a unified JobManager.
- JobManager responsibilities:
  - snapshot acquisition
  - progress reporting
  - cancellation
  - commit gating

Existing long tasks must migrate to this model.

---

## Consequences

### Positive
- Deterministic behavior
- Clear reasoning about state
- Safe batch operations
- Robust conflict handling
- Foundation for transformers and bundles

### Negative / Costs
- Requires refactoring disk-first code paths
- Introduces stricter invariants
- Some workflows become more explicit (dialogs on conflict)

These costs are accepted.

---

## Non-Goals (MVP)

- Automatic rebasing after conflicts
- Background auto-save
- Persistent tune IDs across sessions
- Implicit formatting on save
- Multi-writer merge logic

---

End of ADR

