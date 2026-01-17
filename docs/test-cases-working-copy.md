# Working Copy Migration — Manual Test Cases

This file collects **manual regression tests** for the ADR-0006 Working Copy Model migration.
Add new cases here as tickets land so we keep a stable, repeatable checklist.

## Conventions
- “WC” = in-memory working copy (authoritative while file is open)
- “Disk” = last committed file state
- Unless stated otherwise: the user does **not** press Save during the test

---

## WC-01 — Duplicate `X:` selection/edit isolation (Critical)

**Preconditions**
- Create/open an `.abc` file with 5 tunes where every tune starts with `X:1` (duplicate X values).

**Steps**
1. Select tune #3 in Library.
2. Make a small edit inside tune #3 (e.g. change one note).
3. Switch to tune #1 and #5 and confirm their text is unchanged.

**Expected**
- Selection works correctly even with duplicate `X:`.
- Only tune #3 changes; all other tunes remain byte-identical.

---

## WC-02 — Delete tune without touching others (Critical)

**Preconditions**
- Same as WC-01.

**Steps**
1. Select tune #2.
2. Delete the tune (whatever UI action corresponds).
3. Verify tune #1 and tune #3 (formerly #3) are unchanged.

**Expected**
- Only the deleted tune segment is removed.
- Other tunes are unchanged byte-for-byte.

---

## WC-03 — Renumber X affects only `X:` lines (Critical/High)

**Preconditions**
- A file with multiple tunes and messy/duplicate `X:` values.

**Steps**
1. Run “Renumber X” action.
2. Inspect the file contents (in editor) around the first line of each tune.

**Expected**
- Only the first `X:` line of each tune is updated.
- No other formatting/whitespace changes occur elsewhere.

---

## WC-04 — Working copy authority: no disk writes without Save (Critical)

**Preconditions**
- Open an `.abc` file from disk in ABCarus.
- In a terminal, record its fingerprint: `stat -c '%Y %s' <file>` (mtime seconds + size).

**Steps**
1. Edit a tune, delete a tune, renumber X, and/or import MusicXML into the open file.
2. Do **not** press Save.
3. Re-run `stat -c '%Y %s' <file>` on the same file.

**Expected**
- Disk fingerprint is unchanged until explicit Save/Save As/export.

---

## WC-05 — External conflict dialog on Save (Critical)

**Preconditions**
- Open an existing `.abc` file in ABCarus.
- Open the same file in another editor.

**Steps**
1. Modify and save the file in the external editor.
2. In ABCarus, modify something else (optional).
3. Attempt Save in ABCarus.

**Expected**
- ABCarus detects conflict and offers:
  - Overwrite
  - Save Copy As…
  - Discard & Reload
  - Cancel
- Overwrite replaces disk content with the working copy.
- Save Copy As… writes the working copy to a new path and keeps the current file dirty.
- Discard & Reload restores the working copy from disk (losing unsaved edits).
- Cancel leaves everything unchanged.

---

## WC-06 — New unsaved file: first Save As semantics (High)

**Preconditions**
- Start with a brand new unsaved document (no path on disk yet).

**Steps**
1. Attempt Save.
2. In Save As dialog, choose:
   - a new path that does not exist.
3. Save again (now that the file exists).

**Expected**
- First Save triggers Save As.
- After first Save As, subsequent Save performs conflict gating against the saved fingerprint.

---

## WC-07 — Snapshot abort semantics (Critical)

**Preconditions**
- A long-running file-scope operation exists (e.g. MusicXML import job, or a file-scope transformer job).

**Steps**
1. Start the long-running operation.
2. While it is running, modify the editor buffer (any change).

**Expected**
- The operation must refuse to commit (“buffer changed; retry”).
- No partial/mixed output is committed silently.

---

## WC-08 — Cancel semantics on long operations (High)

**Preconditions**
- A long-running operation exists and shows a progress UI with Cancel/Esc.

**Steps**
1. Start the operation.
2. Press Esc / click Cancel.

**Expected**
- Operation stops.
- Result is either cleanly applied up to documented boundaries or not applied at all.
- App remains responsive; no corrupted state.

---

## WC-09 — Tune selection remains correct without relying on `X:` (High)

**Preconditions**
- An `.abc` file with multiple tunes, including duplicate `X:` values (e.g. all `X:1`).

**Steps**
1. Open the file from Library (so a working copy session is created).
2. Click several tunes in the Library tree; confirm the editor shows the clicked tune.
3. Use the tune `<select>` (dropdown) to switch between tunes; confirm the editor follows the dropdown.
4. Trigger a library re-render (collapse/expand a group, change group/sort mode, or reload the library view).

**Expected**
- Selecting tunes does not depend on `X:` numbers matching.
- Active tune highlight stays correct after re-render.
- Dropdown navigation continues to select the intended tune.

---

## WC-10 — Tune slicing prefers Working Copy boundaries (Medium)

**Preconditions**
- A file with multiple tunes, with duplicate or messy `X:` values.

**Steps**
1. Open the file in the Library so a working copy is created.
2. Switch between several tunes.
3. For each tune, confirm the editor starts exactly at that tune’s `X:` line (no “drift” into previous/next tune).

**Expected**
- Tune slicing remains correct even if Library tune offsets drift (working copy segmentation is used when available).

---

## WC-11 — Edits update Working Copy (High)

**Preconditions**
- Open a multi-tune `.abc` file from Library (so a working copy session is created).

**Steps**
1. Select a tune and make a small edit.
2. Switch to another tune (do not Save).
3. Switch back to the first tune.

**Expected**
- The edit is preserved (it came from the working copy), even if the file on disk was not changed.

---

## WC-12 — “Don’t Save” discards Working Copy edits (Critical)

**Preconditions**
- Open a file from Library (working copy exists).

**Steps**
1. Edit the current tune (make it dirty).
2. Click another tune.
3. When prompted about unsaved changes, choose “Don’t Save”.
4. Switch back to the original tune.

**Expected**
- The tune text is restored to the last disk-saved state (unsaved edits are discarded).

---

## WC-13 — Save commits Working Copy to disk (Critical)

**Preconditions**
- Open an existing `.abc` file from Library (working copy exists).

**Steps**
1. Edit the current tune.
2. Press Save.
3. Close the file and re-open it (or restart the app and re-open it).

**Expected**
- Disk file contains the edit (Save commits from working copy).
- No “stale offsets / expected X:” refusal appears (Save does not depend on `X:` for correctness).
