# Developer Notes

## Practice Mode (branch `practice-mode`)

### Transport vs Practice
- **Transport (default)**: `Play/Pause` plays from the beginning of the tune; `Stop` resets the internal playhead to the start.
- **Practice (toggle in toolbar)**: playback uses a **looping range** plus an optional **tempo multiplier** (50/75/100). The range is derived from cursor/selection, snapped to bar boundaries when possible.

### PlaybackPlan and “pending” changes
- Playback is driven by a small `PlaybackPlan` (mode, rangeStart/rangeEnd, loopEnabled, tempoMultiplier).
- Changes to Practice settings update a `pending` plan; currently it is applied on the next **Stop → Play** restart (not mid-play).

### Selection and cursor rules (tolerant read)
- **No selection**: range starts at the cursor (snapped to the next bar boundary when available) and runs to the end of the tune.
- **Selection present**:
  - The selection is snapped to full bars:
    - start → bar boundary at/after selection start
    - end → bar boundary at/before selection end
  - Default: loops the snapped selection.
  - Optional: `From Cursor` (Practice-only) starts the loop at the **start of the bar containing the cursor** (when the cursor is inside the original selection).
  - If the cursor is outside the selection: the selection remains authoritative.
  - If snapping yields an empty/invalid range: fallback to looping the whole tune.
- Snapping prefers the parsed playback timeline (`abc2svg` symbol chain). If not available, it falls back to “no snapping”.

### Visual feedback (reduce “busy” UI)
- In Practice playback, per-note “blink/underline” is disabled.
- Instead, the **current bar** is highlighted:
  - **Editor**: via a CodeMirror decoration (`.cm-practice-bar`).
  - **Staff**: via existing `.bar-hl` elements in the rendered SVG (`.svg-practice-bar`).
- Auto-scrolling happens only when **Follow** is enabled.

### Concerns / Questions
- Pending plan changes are only applied on restart; if we later allow mid-play changes, we should apply them at a safe boundary (loop wrap preferred, then next bar boundary, then restart-only fallback).
- Staff bar highlighting depends on `.bar-hl` markup being present in the renderer output; if a future `abc2svg` update changes that, staff highlighting will need adjustment.
