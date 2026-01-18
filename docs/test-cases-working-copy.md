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
- Delete is blocked if the target file has unsaved changes.
- When Delete succeeds, the file is saved immediately (disk changes apply right away).
- Library Tree list updates immediately (tune count decreases).

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

Notes
- Under ADR-0006, renumbering updates the working copy immediately; disk changes only after Save.

---

## WC-03b — Renumber X then Save persists renumbering (Critical)

**Preconditions**
- Open an `.abc` file with at least 3 tunes and messy `X:` numbering (e.g. `X:7`, `X:200`, `X:2`).

**Steps**
1. Run “Renumber X”.
2. Confirm Library Tree shows sequential `X:` values.
3. Press **Save**.
4. Refresh the library and/or reopen the file.

**Expected**
- Renumbered `X:` values remain sequential after Save.
- Save does not revert the file to pre-renumber numbering.

---

## WC-03c — Renumber X blocked when dirty (Critical)

**Preconditions**
- Open an `.abc` file from Library (working copy is active).

**Steps**
1. Make any edit so the file becomes dirty (change one character).
2. Attempt “Renumber X”.

**Expected**
- Action is blocked.
- Message tells the user: “Renumber X is disabled while the file has unsaved changes. Save/Discard first.”

---

## WC-03d — Renumber handles non-numeric X values (Critical)

**Preconditions**
- Prepare a file with multiple tunes where some `X:` values are non-numeric:
  - `X:100`, `X:0`, `X:cat`, `X:dog`, `X:banana`, `X:3.141592654`

**Steps**
1. Open the file in ABCarus.
2. Ensure the file is clean (no unsaved changes).
3. Run “Renumber X”.
4. Press Save.
5. Reopen the file and inspect the `X:` lines.

**Expected**
- `X:` lines become strictly consecutive: `X:1`, `X:2`, `X:3`, ...
- Only `X:` lines change; no other lines are modified.

---

## WC-03e — Structural ops blocked when dirty (High)

**Preconditions**
- Open an `.abc` file from Library (working copy is active).

**Steps**
1. Make any edit so the file becomes dirty.
2. Try Library file/tune operations that modify files:
   - Duplicate Tune
   - Delete Tune
   - Paste Tune / Move Tune
   - Rename file
   - Import MusicXML into an existing file

**Expected**
- Actions are blocked (or hidden) until Save/Discard.
- Message is explicit: Save/Discard first.

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
  - Save Copy As & Switch…
  - Discard & Reload
  - Cancel
- Overwrite replaces disk content with the working copy.
- Save Copy As & Switch… writes the working copy to a new path and switches the editor to that file.
- Discard & Reload restores the working copy from disk (losing unsaved edits).
- Cancel leaves everything unchanged.

---

## WC-05b — Conflict cancel → explicit reload path (High)

**Preconditions**
- Same as WC-05.

**Steps**
1. Trigger the conflict dialog (as in WC-05).
2. Choose **Cancel**.
3. Try to open the same tune/file again from the Library Tree.
4. Also try: right-click the file in Library Tree → **Reload from disk…**.

**Expected**
- After Cancel, ABCarus does not silently “reload behind your back”.
- When opening that file/tune again, ABCarus offers a **Reload from disk** prompt (discarding unsaved changes).
- File context menu offers **Reload from disk…** while the conflict is unresolved.
- After Reload, editor + header reflect disk state, and the conflict prompt no longer appears.

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

---

## WC-13 — Move tune between files is transactional (Critical)

**Preconditions**
- Two `.abc` files in the Library, `A.abc` and `B.abc`, each with multiple tunes.
- Ensure there are **no unsaved changes** in either file (no dirty tune, no dirty header).

**Steps**
1. In `A.abc`, “Cut” a tune (or whatever UI puts a tune into move buffer).
2. Select `B.abc` as the target and paste/move the tune into it.
3. Verify:
   - The tune is appended to the end of `B.abc`.
   - `A.abc` no longer contains the tune.
   - Both files have sequential `X:` numbering after the move.
4. Repeat the move while introducing a conflict:
   - Open `B.abc` externally, modify & save it.
   - Try the move again.

**Expected**
- The move refuses to run if source/target has unsaved changes.
- On success:
  - Target file is saved (append + renumber), then source file is saved (delete + renumber).
  - Library refreshes both files.
- On conflict:
  - Move is refused and no partial duplication/removal occurs.

---

## WC-14 — Duplicate tune inserts next and renumbers (High)

**Preconditions**
- A `.abc` file with at least 3 tunes.
- Ensure there are **no unsaved changes** in the file.

**Steps**
1. Select tune #2.
2. Run “Duplicate Tune”.
3. Verify in Library Tree:
   - A new tune appears immediately after the original.
   - The new tune’s title is prefixed with `(Copy)`.
4. Verify:
   - `X:` numbering remains sequential for the file after duplication.
   - Disk file is updated immediately (no extra Save needed).

**Expected**
- Duplicate is refused if the file has unsaved changes.
- Duplicate is atomic: either the file is updated and renumbered, or nothing changes.

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

---

## WC-14 — Save As writes full file from Working Copy (Critical)

**Preconditions**
- Open an existing multi-tune file from Library.

**Steps**
1. Edit the tune header (Header panel) and a note in the current tune.
2. Use `Save As…` and save to a new filename.
3. Open the saved file and verify:
   - header changes are present,
   - all tunes are present (not just the active tune),
   - tune edit is present.

**Expected**
- Save As produces a complete `.abc` file (header + all tunes) from the working copy, atomically.
