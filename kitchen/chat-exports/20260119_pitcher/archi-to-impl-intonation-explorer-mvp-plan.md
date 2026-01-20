## Intonation Explorer — MVP (Ultra-Compact) — IMPL Plan

Scope: **MVP only**. If it doesn’t fit here → defer.

### Invariants (must hold)
- Working copy is the **single source of truth**.
- **Renderer-only logic**, **read-only**, **no side effects** (no edits, no replace, no save).
- Do not rename existing **IPC message names** / **menu action strings** (adding a new action string is OK).
- No reliance on `K:` (must work without it).
- If snapshot/tune slice is missing → **inline message**, no crash/throw.

### Deliverable
Menu entry opens a small panel/modal that shows a table of pitch-step usage for the **current tune** and allows highlighting occurrences in both:
- the **text editor** (required)
- the **score render** (required; bar-level highlight acceptable for MVP if note-level is not feasible)

### Files expected to change (MVP)
- `src/main/menu.js` (add `Tools → Diagnostics → Intonation Explorer…`)
- `src/renderer/renderer.js` (UI + analyzer + highlight behavior)
- Optional (only if needed for minimal UI): `src/renderer/index.html`, `src/renderer/renderer.css`

### NOT doing (explicit)
- No makam detection.
- No judgments/validation (“wrong notes”).
- No auto edits / replacements / batch replace UI.
- No multi-tune / multi-file analysis.
- No background jobs / throttled progress / IPC progress events.
- No requirement to map every step to fancy AEU/Western names:
  - `pc53=<n>` / pitch-class strings are acceptable for MVP.

### Step-by-step implementation
1) **Menu wiring**
   - Add menu item under `Tools → Diagnostics`.
   - Hook it into the existing “menu action → renderer handler” path.
   - Use a new action string only if needed (do not change existing ones).

2) **UI shell**
   - Create a minimal panel/modal titled `Intonation Explorer`.
   - Controls:
     - `Tonal Base`: `Manual` / `Auto` / `From K:` (must not break when `K:` missing)
     - `Refresh`
   - Table columns: `AEU | Western | Weight | Highlight`
     - For MVP, `AEU`/`Western` may show `pc53=<n>` (or another pitch-class string).
     - `Weight` is **Count only** (Duration disabled / not implemented).

3) **Data source (working copy)**
   - Obtain current active tune slice from the in-memory working copy snapshot.
   - No disk reads. If active tune or snapshot missing, show inline message.

4) **Analyzer (minimal)**
   - Tokenize note tokens in the tune slice (A–G/a–g + `^ _ =` and existing microtonal syntax used in this repo).
   - Build a frequency map keyed by pitch-step (EDO-53 aware if the repo already has that mapping; otherwise represent as a stable pitch-class string).
   - Produce sorted rows (default sort: descending count).

5) **Highlighting**
   - Clicking a table row highlights all occurrences:
     - **Editor highlight (required):** range-based highlight on the token occurrences.
     - **Score highlight (required):** if note-level mapping is too heavy for MVP, bar-level highlight is acceptable; note any limitation in the report.
   - Clicking another row switches highlight; provide a way to clear highlight (2nd click or explicit “clear” control).

6) **Refresh behavior**
   - `Refresh` rebuilds the snapshot + analysis and keeps UI stable (no crashes).
   - If the tune changed, highlights should update or clear deterministically.

### Acceptance checks (must be reported)
- AC‑1: Open Explorer on an active tune → table builds; **no document edits**, no dirty-state change.
- AC‑2: `Refresh` recomputes without errors; selection/highlight behavior remains coherent.
- AC‑3: Switch `Tonal Base` modes; if base can’t be resolved → inline message, no crash.
- AC‑4: Click row → highlight all occurrences in editor **and** score (bar-level OK if noted).
- AC‑5: Works when `K:` is absent and without saving.

### Reporting requirements (mandatory)
After implementation, create `kitchen/chat-exports/20260119_pitcher/impl-to-archi-intonation-explorer-mvp-report.md` including:
- Changed files list
- What’s implemented vs deferred (explicitly call out score highlight granularity)
- AC‑1..AC‑5 results (pass/fail + how verified)
- Full `git diff` pasted
