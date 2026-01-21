## Makam DNA Overlay — MVP (Ultra-Compact) — IMPL Plan

Scope: **MVP only**. If it doesn’t fit → defer.

### Invariants (must hold)
- Working copy is the **single source of truth**.
- **Renderer-only logic**, **read-only**, **no side effects**.
- Do not rename existing **IPC message names** / **menu action strings** (adding a new action string is OK).
- If data is missing/unparseable → inline message, no crash/throw.

### Input data
- `docs/makam_dna/AYDEMIR_MAKAM_DNA.json`

MVP uses fields:
- `rawTable.entries[*]` (makam + durak/guclu/yeden/seyir/construction)
- `detailedExamples.entries[*]` (optional: notes_used[].tr/eu for better matching)

### Files expected to change
- `src/main/menu.js` (add Tools → Diagnostics → Makam DNA…)
- `src/renderer/index.html` (panel markup)
- `src/renderer/style.css` (panel styles; reuse tool-panel)
- `src/renderer/renderer.js` (panel logic + highlight)
- Optional: add a small renderer-only helper module under `src/renderer/` if it reduces clutter (no deps).

### Step-by-step
1) **Menu wiring**
   - Add menu item under Tools → Diagnostics.
   - Hook into existing menu-action plumbing (new action string OK).

2) **Panel UI (minimal)**
   - Small draggable panel (reuse `.tool-panel` pattern).
   - Controls:
     - Makam select (dropdown)
     - Refresh button (optional; can re-render on change)
   - Sections:
     - Card: Durak/Güçlü/Yeden/Seyir/Accidentals/Construction
     - Perde list/table (clickable rows)
   - Inline status line (errors, “No matches”, etc.).

3) **Load data**
   - Fetch JSON at runtime from `docs/makam_dna/AYDEMIR_MAKAM_DNA.json` (renderer).
   - Build a makam list and lookup map.
   - Use `detailedExamples` when available; otherwise `rawTable` only.

4) **Derive highlight targets (MVP)**
   - For clicked element, attempt to derive a **written letter token**:
     - Prefer `notes_used[].eu` if you can match a Perde name.
     - Else parse the parenthesized letter from strings like `Rast (G)` / `Neva (D)` / `Irak (low F#)`.
   - Extract:
     - `letter` A–G
     - optional accidental `#`/`b`
   - If you can’t derive → show “No matches”.

5) **Highlight implementation**
   - Editor: highlight all matching note tokens in the active tune text.
     - Use the same “note token” tokenizer already used by Intonation Explorer where possible.
     - Match by letter (and accidental if possible).
   - Score: required.
     - Prefer note-level highlight via the existing abc2svg mapping (like Intonation Explorer).
     - Bar-level fallback is acceptable if note-level fails; note that in report.
   - Close panel clears highlights.

### NOT doing (explicit)
- No makam detection.
- No Perde↔pc53 mapping.
- No Written/Concert/Instrument frame logic.
- No edits / replace UI.
- No correctness judgments.

### Acceptance checks (must be reported)
- AC‑1: Panel open/close and makam selection does not change text/dirty state.
- AC‑2: Card renders even with missing fields.
- AC‑3: Click role/perde highlights matches in editor+score; or shows “No matches”.
- AC‑4: Close clears highlights.

### Reporting requirements
After implementation, create `kitchen/chat-exports/20260119_pitcher/impl-to-archi-makam-dna-mvp-report.md` with:
- Changed files list
- Implemented vs deferred
- AC‑1..AC‑4 results
- Full `git diff`
