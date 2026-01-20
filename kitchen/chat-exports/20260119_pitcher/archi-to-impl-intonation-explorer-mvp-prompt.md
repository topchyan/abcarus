## Message to IMPL (copy/paste)

Task: **Intonation Explorer — MVP (Ultra‑Compact)**. No improvements beyond spec.

### Goal
Read‑only “DNA snapshot” of the current tune for tonal study.

### Hard invariants
- Analyze **current working copy only** (working copy = single source of truth).
- **Renderer‑only logic**, **read‑only**, **0 side effects** (no edits, no replace, no auto‑save).
- Don’t rename existing **IPC message names** / **menu action strings** (adding new ones is OK).
- If snapshot missing / error → show **inline message** in the panel; **do NOT throw**.

### UI
Menu: `Tools → Diagnostics → Intonation Explorer`

Controls: `[ Tonal Base ] [ Refresh ]`

Table columns: `AEU | Western | Weight | Highlight`

### MVP clarifications (mandatory)
1) **Weight**: `Count` only (default). `Duration` is **disabled / not implemented** in MVP.
2) **Highlight**: click row → highlight all occurrences in **text editor**. If SVG highlight is not feasible, **bar‑level highlight is acceptable** (or defer SVG highlight, but state it explicitly in the report).
3) **No reliance on `K:`**. “From K:” option is allowed, but analysis must work without it.

### Minimal algorithm
- Obtain **active tune slice** from working‑copy snapshot (no disk reads).
- Tokenize ABC note tokens (A–G/a–g + accidentals `^ _ =` and existing microtonal syntax used in this repo).
- Compute used steps (EDO‑53 aware) and aggregate counts.
- Map step → AEU name + western approx (fallback to `pc53=<n>` if needed for MVP).
- Render table; clicking rows triggers editor highlight.

### Acceptance checks (manual)
- AC‑1: With an open file and an active tune, opening Explorer builds the table and **does not change** document/dirty state.
- AC‑2: `Refresh` recomputes without errors or losing selection.
- AC‑3: Changing `Tonal Base` updates results; if base can’t be resolved → inline message (no crash).
- AC‑4: Clicking a row highlights all occurrences in editor (and in SVG if implemented).
- AC‑5: Works when `K:` is absent and without saving the file.

### Reporting requirements (mandatory)
All artifacts go in `kitchen/chat-exports/20260119_pitcher/`.

Before coding: create `kitchen/chat-exports/20260119_pitcher/archi-to-impl-intonation-explorer-mvp-plan.md` (files + steps + explicit “NOT doing” list).

After coding: create `kitchen/chat-exports/20260119_pitcher/impl-to-archi-intonation-explorer-mvp-report.md` including:
- Changed files list
- What’s implemented vs deferred (explicitly note SVG highlight if deferred)
- AC‑1..AC‑5 results (pass/fail + how verified)
- Full `git diff` pasted
