# ADR-0007 — Header Authority & Header/X Boundary Rules

Date: 2026-01-23  
Status: Accepted

## Context

ABCarus edits multi-tune `.abc` files that commonly contain:
- a *file-level header/preamble* (directives, comments, metadata, etc.), and
- multiple tunes separated by `X:` headers.

In January 2026 we observed regressions around header editing and saving:
- header text “snapping back” to an older value,
- header appearing empty until the user pressed Reload,
- extra blank lines being injected before `X:` (and therefore inside each tune),
- inconsistent behavior between renderer-side parsing and working-copy segmentation.

Root cause: multiple implicit “sources of truth” were allowed to overwrite each other:
- `entry.headerText` in the renderer Library Index (async-updated),
- the UI header editor (user’s active input),
- the working-copy “header boundary” logic (where header ends and first `X:` begins).

We need a clear, enforceable contract that preserves:
- user trust (no invisible edits),
- deterministic file shape (header boundary stability),
- strict-write semantics (predictable writes, no silent mutations).

## Decision

### 1) Authority rules

1. **Header editor is authoritative for the active file.**
   - Once a file is active and the header editor has loaded that file’s header, the UI must not auto-overwrite the header editor for that same file.
   - Any disk/library refresh must not silently “heal” the header editor.
   - Reloading the header is an explicit user action (via Reload button).

2. **Library Index is authoritative only for initial hydration and navigation.**
   - `entry.headerText` is used to populate the header editor when switching to a different file.
   - `entry.headerText` is not used to override the header editor mid-edit for the same file.

3. **After an explicit Save Header, the header editor becomes clean.**
   - Save Header updates the working copy header and commits to disk.
   - Any subsequent header changes come only from the user or explicit Reload.

### 2) Header/X boundary rules

1. **Boundary marker:** the header ends immediately before the first `X:` line in the file.
2. **Whitespace policy:** leading indentation before `X:` is allowed (spaces/tabs only).
3. **Regex rule (mandatory):** use `^[\t ]*X:` (multiline) for boundary detection.
4. **Forbidden pattern:** `^\s*X:` is not allowed for boundary detection, because `\s` includes newlines in JavaScript and can cause boundary shifts into blank lines, leading to:
   - blank lines being captured as part of the “first tune” slice,
   - `X:` no longer being the first line of a tune,
   - hard-to-debug save/parse divergence.

These boundary rules must be applied consistently in:
- working-copy header insertion/replacement,
- tune segmentation for the working copy,
- renderer-side header/body splitting (`findHeaderEndOffset` or equivalents).

## Consequences

Positive:
- Header edits are stable and predictable (no snap-back, no “empty until Reload”).
- Header saving no longer perturbs tune boundaries or injects blank lines.
- Renderer and working-copy stay aligned on what “header” means.

Negative / trade-offs:
- Some formerly “helpful” background refresh behavior is intentionally removed (must use explicit Reload).
- If a scan populates `entry.headerText` after the panel first shows, the UI may require a one-time, non-destructive hydration step (only when the header editor is empty and not dirty).

## Implementation notes (non-normative)

- Keep header editor initialization independent of scan timing; ensure the editor exists before attempting to set its contents.
- If a file becomes active before scan populates `entry.headerText`, allow a single safe hydration when:
  - same file,
  - header editor is empty,
  - header is not dirty,
  - `entry.headerText` is now non-empty.
  This is not a “sync loop”; it is an initial-load recovery.

## Open questions

- Should header edits participate in a unified “Save” action (save tune + header) or remain separate UX? (Current behavior supports both; keep consistent with WC invariants.)
- Should we provide a “Normalize header/tune boundary” maintenance action to clean existing files that already contain leading blank lines before `X:`?

