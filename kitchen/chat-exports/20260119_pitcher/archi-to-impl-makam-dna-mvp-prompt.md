## Message to IMPL (copy/paste)

Task: **Makam DNA Overlay — MVP (Ultra-Compact)**.

### Goal
Visually connect a selected makam “skeleton” (Aydemir DNA) to what is **actually written** in the current ABC tune.

### Hard invariants
- Analyze **active tune only** (working copy is the single source of truth).
- **Renderer-only logic**, **read-only**, **0 side effects** (no edits, no replace, no save).
- Do not rename existing **IPC message names** / **menu action strings** (adding a new action string is OK).
- If data is missing → show inline message; **do NOT throw**.

### MVP scope (Do)
- UI entry: `Tools → Diagnostics → Makam DNA…`
- Panel shows:
  - **Makam selector** (manual pick from `docs/makam_dna/AYDEMIR_MAKAM_DNA.json`)
  - Card fields (as text):
    - `Durak` (tonic)
    - `Güçlü` (dominant) (support primary/secondary if present as text)
    - `Yeden` (leading tone)
    - `Seyir` (behavior)
    - `Accidentals`
    - `Construction`
  - A list/table of “Perde” items:
    - Prefer `notes_used[].tr` if present for the selected makam.
    - Otherwise fallback to a minimal set derived from `durak/guclu/yeden` (+ accidentals as plain text rows).

### Highlight behavior (critical)
- Clicking `Durak`/`Güçlü`/`Yeden`/a Perde row triggers highlight of **as-written** notes in:
  - text editor (required)
  - score (required; note-level highlight when possible, bar-level fallback OK)

**Important:** In MVP we do **NOT** map Perde↔pc53, and we do **NOT** do any “frame” conversion (Written/Concert/Instrument). We highlight only what is written in ABC.

### Matching rule (MVP)
- For each clickable element, pick a **written token** to search/highlight:
  - If the selected makam entry contains `notes_used[].eu` for the same Perde (or if you can parse something like `(G)` from `durak`/`guclu`/`yeden`), use that as a **letter name** (A–G plus optional `#` / `b`) and highlight those letter tokens in the active tune.
  - If a clean match can’t be derived, show “No matches” (do not crash).

No microtonal correctness claims. No edits.

### NOT doing (explicit)
- No makam detection.
- No Perde↔pc53/AEU mapping.
- No Written/Concert/Instrument frame switch.
- No judgments/corrections.
- No file writes, no background jobs.

### Acceptance checks (manual)
- AC‑1: Opening the panel and selecting a makam does **not** modify the tune or dirty state.
- AC‑2: Card renders reliably even when some fields are missing.
- AC‑3: Clicking `Durak/Güçlü/Yeden/Perde` highlights matches in editor+score; if none, show “No matches”.
- AC‑4: Closing the panel clears highlights.

### Reporting requirements (mandatory)
All artifacts go in `kitchen/chat-exports/20260119_pitcher/`.

Before coding: create `kitchen/chat-exports/20260119_pitcher/archi-to-impl-makam-dna-mvp-plan.md` (files + steps + explicit “NOT doing” list).

After coding: create `kitchen/chat-exports/20260119_pitcher/impl-to-archi-makam-dna-mvp-report.md` including:
- Changed files list
- Implemented vs deferred
- AC‑1..AC‑4 results (pass/fail + how verified)
- Full `git diff` pasted
