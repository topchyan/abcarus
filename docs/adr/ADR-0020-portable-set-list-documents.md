---
title: "ADR-0020: Portable Set List Documents"
date: 2026-08-20
status: "Accepted"
supersedes: "ADR-0004"
refined_by: "ADR-0021"
---

# ADR-0020: Portable Set List Documents

## Context

The original Set List is a local, single-list assembly workspace. It stores
immutable tune snapshots in browser storage and can export ABC, PDF, or print
output. That workflow is useful, but it cannot represent named performance
programs, portable saved revisions, explicit Library reconciliation, or a
shared desktop/mobile contract.

A Set List is a musician-facing document. It is not a general Library backup
and does not own or silently modify source tune files. Its embedded tune
snapshots may, however, be used as explicit comparison and recovery material as
defined by ADR-0021.

## Decision

### Document contract

One Set List is stored as one readable JSON file:

```text
*.abcarus-setlist.json
schema: abcarus.setlist.v1
```

The normative field and compatibility contract is documented in
`docs/set-list-format.md`; its canonical strict-write JSON Schema is
`docs/schemas/abcarus.setlist.v1.schema.json`.

The format is platform-neutral and contains no Electron or DOM state. Desktop
and mobile implementations must use the same field semantics and compatibility
fixtures.

A document contains identity, title, timestamps, ordered items, and export
defaults. Array order is performance order. Every occurrence has its own item
ID, so the same tune may occur more than once with different overrides.

Each item contains:

```text
tune snapshot
optional embeddedAbc
performance overrides
notes
links
export intent
```

For self-contained rendering, an item may also carry `embeddedHeaderAbc`, the
captured source file header that accompanied `embeddedAbc`. It is part of the
saved revision, not a live reference to the source file.

For Set List rendering, header layers are composed from least to most specific:
the captured source file header, then the Set List Header, then the tune body.
This lets the Set List define its own explicit print layout while preserving
tune-local directives as the final authority. Application print preferences
control only the outer Chromium page and do not inject hidden ABC directives.

Source paths and `X:` numbers are matching hints, not durable identity and not
authority over saved musical content. `contentHash` identifies the ABC revision
that the snapshot describes.

### Linked and self-contained items

```text
embeddedAbc absent
→ resolve the item against the current Library

embeddedAbc present
→ the Set List contains a saved playable/renderable revision
→ Library is used for comparison, update, or relink
```

Lightweight and self-contained Set Lists use the same format. Embedding may be
chosen per item. A missing Library source with `embeddedAbc` remains usable. A
missing source without `embeddedAbc` is unresolved.

### Library resolution

Resolution is deterministic and reports one of:

```text
FOUND_EXACT
FOUND_MODIFIED
FOUND_STRONG
AMBIGUOUS
MISSING
```

Exact content hash is stronger than path. A unique path plus `X:` match with a
different content hash is modified. A unique exact metadata match may be
reported as strong. Multiple equally valid matches are ambiguous. The resolver
must not silently pick an ambiguous candidate or overwrite `embeddedAbc`.

For modified items the UI offers explicit actions such as use saved, use
current, compare, update saved revision, and relink. Updating or removing an
embedded revision changes the Set List document and participates in its
dirty/save/undo lifecycle. It never mutates the source Library tune.

### Existing Set List compatibility

The existing local snapshot list is a supported special case, not a parallel
model. Its stored tune `text` is already a self-contained snapshot and is
converted to `embeddedAbc`. Existing ordering, Set List header, page-break and
compact-print choices are preserved. Current ABC/PDF/print actions become
derived exports from the converted document.

The old browser-storage representation may be imported once into an unsaved
Set List document. New features must not continue writing two independent Set
List models.

### Persistence and UI boundary

The domain owns validation, normalization, item operations, serialization, and
Library resolution. It has no file dialogs, DOM, Electron IPC, rendering, or
playback dependencies.

Desktop owns a Set Lists workspace and file persistence. Mobile may use a
different interface, but it must preserve document and resolution semantics.
PDF and combined ABC are derived artifacts, not alternate sources of truth.

### Adding from Library

> Refined by ADR-0021: desktop additions must produce a visible result in the
> active docked Set List panel. A non-active Set List is opened and made active
> before it is changed; it is not silently rewritten in the background.

`Add to Set List` from a tune context menu targets an explicit document. When
several Set Lists are known, the command presents a compact chooser containing
the active Set List first, other recent Set Lists, and actions to open or create
a Set List. On desktop, the selected destination is opened, made active, and
shown before the tune is added, as specified by ADR-0021. Other clients must
provide equally explicit destination and result feedback.

The application profile may retain recent Set List paths and the last-used
path for this chooser. Those path hints are navigation history only: Set List
content is always read from its `.abcarus-setlist.json` file. Missing recent
files are not reconstructed from profile state or retained as hidden copies.

### Safety

- Opening malformed JSON is tolerant only where defaults are unambiguous.
- Saving emits only the canonical schema and known fields.
- Unknown future schema versions are rejected rather than rewritten.
- Source Library files are read-only to Set List reconciliation.
- Relink and embedded-revision updates are explicit user operations.
- Set List writes use the canonical atomic file I/O layer.

## Verification

Shared fixtures cover:

- lightweight Set List;
- self-contained Set List;
- modified Library tune;
- missing tune with embedded ABC;
- missing tune without embedded ABC;
- ambiguous title/composer match;
- conversion of the previous local snapshot format.

Desktop and mobile must accept the same fixtures. Round-trip serialization
must be deterministic apart from explicitly updated timestamps.

## Consequences

Set Lists become durable, portable performance documents while retaining the
current quick assembly workflow. The implementation gains explicit dirty and
resolution states, but avoids a database, sync engine, dependency injection
framework, or hidden source-file mutation.
