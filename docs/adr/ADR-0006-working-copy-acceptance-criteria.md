# ACCEPTANCE — Working Copy Model

Purpose:
Define observable criteria to evaluate whether the Working Copy Model
is correctly implemented and whether a build is acceptable.

Failure to meet any **Critical** criterion warrants rollback.

---

## A. External Conflict Handling (Critical)

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

---

## B. Working Copy Authority (Critical)

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

---

## C. Isolation of Tune Edits (Critical)

Given:
- A file with multiple tunes (even with duplicate `X:` values).

When:
- One tune is edited or deleted.

Then:
- Only the selected tune’s segment changes.
- Other tunes remain byte-identical.

Fail if:
- Other tunes are reformatted, reordered, or modified.

---

## D. Snapshot Abort Semantics (Critical)

Given:
- A long-running file-scope operation is started.

When:
- The working copy changes during execution.

Then:
- The operation must refuse to commit.
- The user must be informed (“buffer changed; retry”).

Fail if:
- A mixed or partial result is written silently.

---

## E. Cancel Behavior (High)

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

---

## F. Determinism (High)

Given:
- Identical input file and settings.

When:
- The same operation is run twice.

Then:
- The output must be identical.

Fail if:
- Results differ without an explicit change in input or settings.

---

## G. UX Regression Guard (High)

Given:
- A simple workflow: open → edit one tune → save.

Then:
- No additional dialogs appear.
- No perceptible performance regression occurs.

Fail if:
- Common workflows become slower or noisier without cause.

---

## H. Migration Consistency (Medium)

Given:
- JobManager is introduced.

Then:
- At least one existing long task (e.g. MusicXML import)
  must be migrated to it.

Fail if:
- Two parallel progress/cancel systems coexist indefinitely.

---

## Rollback Rule

Rollback to the previous stable branch if:
- Any Critical criterion fails, or
- Two or more High criteria fail, or
- A data-loss scenario is observed.

---

End of Acceptance Criteria

