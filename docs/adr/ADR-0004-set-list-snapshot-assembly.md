---
title: "ADR-0004: Set List as Snapshot-Based Assembly with Deterministic Export"
date: 2026-01-13
status: "Accepted"
---

# ADR-0004: Set List as Snapshot-Based Assembly with Deterministic Export

## Context

ABCarus is a tune-oriented editor: a single `.abc` file can contain multiple tunes separated by `X:` headers. Users often want to:
- pick tunes from different files (or from one large file),
- order them as a set,
- preview the combined result,
- then print/export or save as a new `.abc` file.

We previously observed that “orphan” documents (imported/created content with no clear target file) create a poor UX and data safety risk:
users struggle to place the result into the right file and may end up copying/pasting manually.

For Set List, we want a workflow that is:
- simple and lightweight (no “book editor”),
- auditable and deterministic,
- compatible with tolerant-read / strict-write,
- free of hidden syncing or surprising mutations of source data.

## Decision

Implement Set List as an **ephemeral workspace assembly tool**:
- Set List is **not** a new document type and is **not** a new source of truth.
- Set List entries are **immutable snapshots** of tune text captured at add-time.
- The Set List can be reordered, items can be removed, and the combined preview updates accordingly.
- Export/print/save produce deterministic outputs; the Set List itself is not persisted by default.

### Snapshot semantics

- Adding a tune to the Set List captures the tune’s ABC text as it exists at that moment.
- Snapshots are stored verbatim as text and are not structurally re-parsed until export.
- The snapshot does not update if the source file changes later.
- Updating a tune in the Set List is done explicitly by removing and re-adding it.

### Deterministic export

Exporting a Set List to a new `.abc` file:
- always produces a **new file** chosen by the user (with explicit overwrite confirmation);
- always renumbers `X:` as `1..N` **in set order**;
- uses safe write behavior (atomic replace when applicable).

Constraints:
- Renumbering happens **only at export time** (snapshots are never mutated).
- The combined preview must be WYSIWYG with the export semantics: it must show the `X:1..N` ordering.

### Page breaks

Set List provides a 3-state user choice for page breaks:
- Per tune (default): inject `%%newpage` before each tune (except the first).
- None: never inject page breaks.
- Auto: heuristic-based (e.g. inject a break only when a tune exceeds a size threshold such as N systems/pages).

Notes:
- “Compact spacing” is separate from page breaks; spacing changes do not imply breaks.
- “Auto” must be deterministic for a given set and option values. Any heuristic parameter (e.g. N systems) must be explicit user-visible settings or fixed constants.

### Preview separators

The combined preview includes lightweight separators between tunes (e.g. show `T:` and `C:` as a “tune card”):
- separators are UI-only and are not serialized into the exported `.abc`;
- separators do not affect pagination logic;
- no additional metadata beyond `T:` and `C:` is required.

## Strict-write / safety constraints

When adding a tune snapshot:
- extract the tune slice using current library offsets;
- validate the slice begins with `X:` and matches expected identity (e.g., X number) to guard against stale offsets;
- on mismatch, refuse and require a library refresh/reopen (no best-effort guessing).

When exporting:
- confirm overwrite explicitly;
- write using a safe write strategy;
- the exported file must be reproducible from the same inputs/options.

## Consequences

Positive:
- simple mental model: “Set List is a temporary workspace to produce an output file”;
- no hidden state or background syncing;
- deterministic `X:` ordering encodes set sequence;
- easy recovery: remove/re-add snapshots to update.

Negative / trade-offs:
- no automatic propagation when source tunes are edited (by design);
- “Auto” page break heuristics must be carefully chosen to avoid surprising results.

## Status

Accepted. Implement once the milestone is scheduled and UI placement is agreed.
