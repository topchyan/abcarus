# ADR-0006 — Working Copy Model for ABC Files

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

---

## Acceptance Criteria (Merged)

Purpose: Define observable criteria to evaluate whether the Working Copy Model is correctly implemented and whether a build is acceptable.

Failure to meet any **Critical** criterion warrants rollback.

### A. External Conflict Handling (**Critical**)

Given:
- An `.abc` file is opened in ABCarus.
- The same file is modified and saved in another editor.

When:
- The user attempts to Save in ABCarus.

Then:
- The system must detect the conflict.
- The system must present explicit options:
  - Overwrite disk
  - Save As
  - Discard & Reload
- No silent overwrite is allowed.

Fail if:
- The file is overwritten without warning.
- The working copy is lost without user choice.

### B. Working Copy Authority (**Critical**)

Given:
- A file is opened and modified in ABCarus.

When:
- Operations are performed (edit, delete tune, import, transform).

Then:
- All operations act on in-memory state.
- Disk state is unchanged until explicit Save.

Fail if:
- Any operation reads from disk mid-session without explicit reload.
- Disk writes occur outside Save/Save As/export paths.

### C. Isolation of Tune Edits (**Critical**)

Given:
- A file with multiple tunes (even with duplicate `X:` values).

When:
- One tune is edited or deleted.

Then:
- Only the selected tune’s segment changes.
- Other tunes remain byte-identical.

Fail if:
- Other tunes are reformatted, reordered, or modified.

### D. Snapshot Abort Semantics (**Critical**)

Given:
- A long-running file-scope operation is started.

When:
- The working copy changes during execution.

Then:
- The operation must refuse to commit.
- The user must be informed (“buffer changed; retry”).

Fail if:
- A mixed or partial result is written silently.

### E. Cancel Behavior (**High**)

Given:
- A long operation is running.

When:
- The user presses Esc / Cancel.

Then:
- The operation stops.
- The result is either:
  - cleanly committed up to documented boundaries, or
  - not committed at all.

Fail if:
- The file is left in an undefined or corrupted state.

### F. Determinism (**High**)

Given:
- Identical input file and settings.

When:
- The same operation is run twice.

Then:
- The output must be identical.

Fail if:
- Results differ without an explicit change in input or settings.

### G. UX Regression Guard (**High**)

Given:
- A simple workflow: open → edit one tune → save.

Then:
- No additional dialogs appear.
- No perceptible performance regression occurs.

Fail if:
- Common workflows become slower or noisier without cause.

### H. Migration Consistency (**Medium**)

Given:
- JobManager is introduced.

Then:
- At least one existing long task (e.g. MusicXML import) must be migrated to it.

Fail if:
- Two parallel progress/cancel systems coexist indefinitely.

### Rollback Rule

Rollback to the previous stable branch if:
- Any Critical criterion fails, or
- Two or more High criteria fail, or
- A data-loss scenario is observed.
