# ABCarus Set List Format

Status: Draft 0.3  
Schema identifier: `abcarus.setlist.v1`  
Normative schema: `docs/schemas/abcarus.setlist.v1.schema.json`

This document is the portable data contract shared by ABCarus desktop and
mobile clients. ADR-0020 defines the document model. ADR-0021 defines the
desktop workflow and source-versus-snapshot authority.

## Compatibility

One Set List is one UTF-8 JSON file named `*.abcarus-setlist.json`.

Readers of `abcarus.setlist.v1` are tolerant of omitted optional fields and
unknown fields. Writers emit only fields defined by the v1 schema. Consequently,
opening and saving a v1 document in an older writer may discard fields that the
writer does not understand. This is an intentional tolerant-read/strict-write
tradeoff: semantic format additions require a new schema revision rather than
silently extending frozen v1. A reader must reject an unknown schema identifier
instead of rewriting it.

Fields added during the v1 draft period, including `snapshot`, remain optional
when reading existing files. Newly captured embedded revisions should write
them when the information is available.

## Document

```json
{
  "schema": "abcarus.setlist.v1",
  "id": "set-list-id",
  "title": "Autumn Concert",
  "createdAt": "2026-08-20T12:00:00.000Z",
  "updatedAt": "2026-08-20T12:00:00.000Z",
  "print": {
    "headerText": "%%stretchlast 1\n",
    "pageBreaks": "perTune",
    "compact": false
  },
  "items": []
}
```

`items` array order is performance order. The same source tune may appear more
than once. Each occurrence has its own `id`, performance settings, notes, and
export intent.

## Item

An item contains a metadata snapshot and source hints:

```json
{
  "id": "occurrence-id",
  "tune": {
    "title": "Song A",
    "composer": "Composer",
    "key": "D",
    "rhythm": "",
    "origin": "",
    "groups": [],
    "source": {
      "locatorHint": "/music/file.abc::12",
      "pathHint": "/music/file.abc",
      "xNumberHint": "12"
    },
    "contentHash": "sha256:..."
  },
  "embeddedAbc": "X:12\nT:Song A\nK:D\nD E F G|\n",
  "embeddedHeaderAbc": "%%stretchlast 1\n",
  "snapshot": {
    "capturedAt": "2026-08-20T12:00:00.000Z",
    "sourceFileModifiedAt": "2026-08-20T11:55:00.000Z"
  },
  "performance": {
    "transposeSemitones": 0,
    "tempoScale": 1
  },
  "notes": "",
  "links": [],
  "export": {
    "includeInPdf": true,
    "pageBreakBefore": false
  }
}
```

Source hints assist resolution but are neither durable identity nor editing
authority. `locatorHint` is an application-derived locator, not a tune ID.
`pathHint` may be absolute or relative and may use platform-specific syntax. A
reader must not assume that it exists, is portable to another device, or still
refers to the same content. `xNumberHint` is meaningful only within a candidate
source file. `contentHash` identifies the captured tune text.

### Embedded ABC

`embeddedAbc` is the exact captured tune block, including its `X:` field. It is
a portable revision used by deterministic export, rendering, comparison, and
explicit recovery. It is not an independently editable tune document.

If `embeddedAbc` is absent, the item is lightweight and requires a resolvable
Library source for rendering or playback.

### Embedded header

`embeddedHeaderAbc` is the source ABC file preamble that precedes its first
`X:` tune boundary at capture time. It may contain ABC fields, comments,
formatting directives, and text blocks that form the source-file context.

It does not contain:

- bundled, user, folder, or other external Global Header layers;
- the Set List document's own `print.headerText`;
- directives copied from another tune;
- renderer- or playback-only compatibility transforms.

The field is omitted when the source file has no preamble. Consumers must not
interpret it as authority to modify the source file header.

Directives physically located after one tune's `X:` boundary and before the
next tune's `X:` boundary are not part of `embeddedHeaderAbc`. They remain in
the tune segment assigned by the source segmenter. This matches the desktop
single-tune pipeline; the Set List format does not invent a second
interpretation of inter-tune directives.

### Snapshot observation

`snapshot.capturedAt` records when the embedded revision was captured or
explicitly updated. `snapshot.sourceFileModifiedAt` records the source file
mtime observed then, if available. Both are UTC RFC 3339 timestamps.

Dates are display and diagnostic hints. They do not establish equality,
freshness, or source identity. Content hash remains authoritative.

## Hash Contract

The v1 hash contract is intentionally minimal and must be identical on desktop
and mobile:

1. Input is the exact `embeddedAbc` tune string, not the file header, Global
   Header, Set List header, render payload, or playback payload.
2. Replace every CRLF (`\r\n`) and lone CR (`\r`) with LF (`\n`).
3. Make no other changes. In particular, do not trim whitespace, normalize
   Unicode, remove a BOM, reorder fields, or add/remove a final newline.
4. Encode the resulting string as UTF-8.
5. Compute SHA-256.
6. Store lowercase hexadecimal as `sha256:<64 hex characters>`.

Consequently, line-ending-only differences compare equal across platforms;
all other textual differences remain visible. Metadata matching normalization
is a separate resolver concern and must never alter the content hash input.

## Resolution

Resolution reports one of the domain states below:

```text
FOUND_EXACT
FOUND_MODIFIED
FOUND_STRONG
AMBIGUOUS
MISSING
```

Rules are evaluated in this order:

1. A unique `pathHint` plus `xNumberHint` candidate with the same non-empty
   content hash is `FOUND_EXACT`.
2. The same unique source hint with two different non-empty hashes is
   `FOUND_MODIFIED`.
3. A unique source-hint candidate without sufficient hashes is `FOUND_STRONG`.
4. Without a source match, a unique exact hash match is `FOUND_EXACT`; more
   than one is `AMBIGUOUS`.
5. A unique normalized title/composer match is `FOUND_STRONG`; more than one is
   `AMBIGUOUS`.
6. Otherwise the result is `MISSING`.

`FOUND_STRONG` is never an automatic relink. Relinking, replacing a snapshot,
or restoring a snapshot to an ABC file requires an explicit user action.

Finding exact content at a different path remains `FOUND_EXACT`. A desktop UI
may label that situation `Moved`, but that label is not a sixth domain state.

## Deterministic export

Export and print use stored `embeddedAbc` and `embeddedHeaderAbc` by default.
This preserves the saved program even when a Library source changes later.
Before export, a client may report modified sources and offer an explicit
snapshot update.

`print.pageBreaks` controls automatic breaks. `item.export.pageBreakBefore`
adds an explicit break before that occurrence (except the first printable
item), even when automatic mode is `none`. A false value does not suppress an
automatic `perTune` or `auto` break; v1 intentionally has no tri-state override.

`item.export.includeInPdf` controls PDF and direct print output only. It does
not remove the occurrence from combined ABC export. Page-break intent applies
to combined ABC, PDF, and direct print output.

`tune.groups` is an array of strings. It is semantically a set of descriptive
groups: array order has no resolution or export meaning. Writers preserve the
provided order for readable, stable round trips and should avoid duplicates.

## Draft migration aliases

Older local/mobile and pre-freeze desktop representations are migration input,
not canonical aliases. Import maps them in one direction:

```text
SetList.name / top-level name     → title
tuneIdHint                        → tune.source.locatorHint
tune.sourcePath                   → tune.source.pathHint
tune.xNumber                      → tune.source.xNumberHint
tune.group                        → tune.groups[]
links[].type                      → links[].kind
export.include                    → export.includeInPdf
```

Canonical v1 writers emit only the right-hand form.

## Cross-platform fixtures

Desktop and mobile implementations must share fixtures for:

- LF, CRLF, and lone-CR hash equivalence;
- significant trailing whitespace and final-newline differences;
- non-ASCII ABC text encoded as UTF-8;
- lightweight and self-contained items;
- exact content found at a moved path;
- modified, strong, ambiguous, and missing resolution;
- unknown future schema rejection;
- deterministic read-normalize-write output.
