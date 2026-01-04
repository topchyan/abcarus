---
title: "ADR-0002: Incremental Full Scan (Gated)"
date: 2026-01-02
status: "Accepted with constraints"
---

# ADR-0002: Incremental Full Library Scan (Gated)

## Context

A full library scan (`scanLibrary`) provides familiar UX: the tree is filled quickly and predictably with tunes under files. For large collections and repeated open/refresh cycles, this becomes an O(N) penalty: reading and parsing all files again.

The project already has a best-effort persisted index in `userData`. It can act as an accelerator on subsequent runs when validated by `mtimeMs/size`, but it must not become a new source of truth.

## Decision

Make `scanLibrary()` incremental without changing UX:
- For unchanged files (matching `mtimeMs` and `size`), read `tunes/xIssues/header` from the persisted index/cache and skip reading the file.
- For new/changed files, read and parse, then update the persisted index.
- Best-effort cleanup of deleted entries is limited to the current `libraryRoot`.
- Progress stays throttled; a final `done` is required. It is acceptable to add counters like `cachedCount/parsedCount` to the payload without increasing event frequency.

## Constraints (gates)

1. The persisted index is an accelerator only, not a source of truth. Final validation happens on `openTune`: if `X/offset/structure` mismatches, force a file reparse and self-heal the index entry.
2. No UX changes: do not introduce “Loading…” or intermediate states in Tree/Modal.
3. The index is scoped by `libraryRoot/roots`: deleted-entry cleanup is limited to the current roots.
4. Format versioning + atomic writes (temp + rename/replace) + safe fallback: on errors/incompatibility the index is ignored and rebuilt.
5. A kill-switch (no UI) is required: an env/config toggle to restore “parse everything” without reverting commits.

## Implementation (vertical slice)

Only a narrow slice in `scanLibrary/refresh`:
- `scanLibrary()` uses the persisted index for unchanged files, parses only changed ones, and performs cleanup under the root.
- `openTune/selectTune` validates `X/offset` and, on mismatch, forces a file reparse and reopens the tune.
- Kill-switch: `ABCARUS_DISABLE_LIBRARY_INDEX=1` disables use of the persisted index (accelerator).

## Metrics / expected impact

- Improvement: repeated `scanLibrary()` (open folder / refresh) should get faster for large libraries by reusing unchanged-file results.
- Guardrail: Tree/Modal UX and behavior remain unchanged (no new intermediate states).
