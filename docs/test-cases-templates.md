# Templates Library — Manual Test Cases

This file collects **manual regression tests** for the Templates Library feature (user-managed tune templates).

## TL-01 — Open Templates picker

**Steps**
1. Open an `.abc` file in the editor (so there is an active file).
2. Click the Templates button (library icon) next to the tune selector.

**Expected**
- Templates modal opens.
- Folder label shows the templates folder name (hover shows full path).

---

## TL-02 — Manage / Change / Reload

**Steps**
1. Open Templates modal.
2. Click **Manage…**
3. Click **Change…** and pick a different folder.
4. Click **Reload**

**Expected**
- Manage opens the templates folder in the OS file manager (folder is created if missing).
- Change updates the configured templates folder and the list reloads.
- Reload re-scans the folder.

---

## TL-03 — Insert a template tune into the active file

**Preconditions**
- Templates folder contains at least one `.abc` file with at least one tune (starts with `X:`).

**Steps**
1. Open an `.abc` file in the editor (active file).
2. Open Templates modal.
3. Select a template and click **Insert**.

**Expected**
- The template tune is appended to the active file and saved immediately.
- The newly appended tune is selected.
- `X:` is rewritten to the next available X number in the active file.

