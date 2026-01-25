ADR-0011 — Payload Mode (Diagnostics)

Date: 2026-01-25  
Status: Proposed

## Context

When troubleshooting rendering or playback issues, users need to see the *exact payload* sent to `abc2svg`, including:
- file‑level header directives,
- tune header,
- ABCarus‑added directives/prefixes,
- and the tune body.

Currently this payload is implicit, which makes it hard to understand why a directive does (or doesn’t) affect the rendered score.
The user also wants to experiment by editing the payload and immediately seeing the result in the score, without altering the original file.

## Decision

Introduce a diagnostics‑only **Payload Mode** in the main screen (not a modal).

### Entry / Exit
- Entry via **Help → Diagnostics → Payload Mode (Current Tune)**.
- Only allowed from **normal mode** (not Raw / Focus).
- Dedicated **Exit Payload Mode** button to return to the normal editor.

### Behavior
- Payload editor shows the *final* payload that goes to `abc2svg`.
- Payload is **editable** for diagnostics (sandbox).
- Changes affect **render/playback immediately**, with the same debounce behavior as normal editing.
- **No file writes**: payload edits are not persisted to disk.
- No “payload of payload”: rendering uses the payload directly with **no additional ABCarus augmentation**.

### Layers (diagnostic annotations)
Payload Mode includes a **“Show layers”** toggle that highlights *only external additions*:
- File‑level header additions.
- ABCarus‑added directives/prefixes.

Original tune text remains unmarked.

### Safety
- Mode is explicitly diagnostic and isolated from file‑save paths.
- Exiting Payload Mode discards sandbox edits.
- While in Payload Mode, destructive and authority‑changing actions are disabled/blocked:
  - Save / Save As / structural edits (Renumber X, transforms, etc.)
  - Library navigation and file/tune operations (open/close/move/copy/delete)
- Payload Mode must never write to disk or update the working copy store.
- Editor↔render mappings are treated as **payload‑local**; the UI does not attempt to map positions back to the original source text (ambiguous due to injected layers).

## Consequences

Positive:
- Users can inspect the exact render input.
- Fast diagnosis for header/directive issues.
- Safe sandbox for experiments without corrupting files.

Trade‑offs:
- Adds another mode to the UI (must be clearly labeled).
- Requires clear separation between payload rendering and normal rendering paths.

## Acceptance (MVP)

- Payload Mode accessible from Help → Diagnostics and only from normal mode.
- Editable payload reflects immediately in score/playback.
- Exit returns to normal editor without saving payload edits.
- Layer highlighting identifies only external additions (file header + ABCarus).
