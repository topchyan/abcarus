---
title: "ADR-0021: Docked Set List Navigation and Source-Backed Snapshots"
date: 2026-08-20
status: "Accepted"
refines: "ADR-0020"
---

# ADR-0021: Docked Set List Navigation and Source-Backed Snapshots

## Context

ADR-0020 defines a portable Set List document with ordered items, source hints,
content hashes, and optional embedded ABC. The first desktop implementation
presented that document in a modal window.

That presentation makes sustained assembly unclear. The active destination is
hidden while the user works in Library, additions appear to happen elsewhere,
and Library-to-list drag and drop cannot be observed. A Set List is an optional
feature, but while it is in use it is a persistent navigation and document
surface rather than a short confirmation dialog.

There is also an authority question. An embedded tune must keep a Set List
portable and recoverable without creating a second independently editable tune
beside its source ABC file.

## Decision

### Optional docked panel

Desktop presents the active Set List as a resizable panel beside Library and
Editor/Score:

```text
Library | Set List | Editor / Score
```

The panel is hidden by default and is shown on explicit request from the
application menu. Hiding it does not close, discard, or save the active Set
List document. Its close icon means `Hide Set List`.

Within an application session, reopening the panel restores the active Set
List, selected item, scroll position, and width. Focus mode temporarily hides
both Library and Set List and restores their previous visibility on exit.

Set List remains optional: users who never invoke it receive no permanent
column or toolbar controls.

### Document controls

The panel visibly identifies the active Set List and its dirty state. Its
compact document menu provides:

```text
New / Open / Save / Save As
Header
Export ABC / Export PDF / Print
```

Changing to another Set List follows `Save / Don't Save / Cancel`. Hiding the
panel does not invoke that guard. Quitting with a dirty Set List does.

The panel owns one active Set List at a time. Recent paths are navigation
history, not hidden editable documents.

### Relationship to Library

Library and Set List are two entry points into the same Editor/Score pipeline:

```text
Library item → source ABC tune → Editor / Score
Set List item → resolve source ABC tune → Editor / Score
```

They share compact row styling, active-row indication, keyboard navigation,
drag vocabulary, and context-menu conventions. They do not share state
ownership or destructive commands.

Set List order is manual document content. There is no alphabetical or metadata
sorting mode. Duplicate occurrences are valid. Visible per-row arrow and remove
buttons are replaced by drag reorder, keyboard commands, and a context menu.

Library-to-Set-List drag copies a snapshot and never removes or moves the source
tune. Dragging inside Set List changes occurrence order. An empty Set List is a
real drop target. A successful addition scrolls to and briefly highlights the
new occurrence.

### Source tune is authoritative

`embeddedAbc` is not an independently editable tune. It is a captured revision
used for portable rendering, comparison, and explicit recovery.

When a Set List row is activated and its source can be resolved, ABCarus opens
the current source tune through the normal single-tune document lifecycle.
Editor `Save` writes the source ABC file. It does not silently rewrite the
embedded snapshot.

The Editor/Score context must identify its origin, for example:

```text
Library: wip.abc · X:143
Set List: Concert Program · 3 of 14 · source wip.abc X:143
```

If the source is missing or ambiguous, the embedded snapshot remains available
for read-only preview, export, comparison, or an explicit restore-to-ABC-file
workflow. ABCarus must not silently promote it to a new source of truth.

### Snapshot identity and dates

Content hash is the authoritative revision comparison. A Set List item also
records human-readable observation metadata when a snapshot is captured:

```text
snapshot.capturedAt
snapshot.sourceFileModifiedAt (optional)
```

Filesystem time is informational only. A multi-tune ABC file changes its mtime
when any contained tune is saved, and timestamps may be preserved or rounded by
copy and filesystem operations.

Hash input normalization and the exact scope of `embeddedHeaderAbc` are defined
by the shared format contract in `docs/set-list-format.md`. Desktop and mobile
must use that same contract and its fixtures.

The domain keeps the resolution states defined by ADR-0020:

```text
FOUND_EXACT
FOUND_MODIFIED
FOUND_STRONG
AMBIGUOUS
MISSING
```

The panel may translate those states into musician-facing labels. For example,
`FOUND_MODIFIED` may appear as `Updated`, and an exact hash found at a different
path may appear as `Moved`. Such labels are presentation details derived from
the resolver result and source hints; they are not a second status model.
`FOUND_STRONG` remains a possible match that requires explicit relinking rather
than silently becoming the source.

Normal exact rows carry no status label. Exceptional states use a compact
indicator and tooltip. Detailed hashes, dates, comparison, and recovery actions
belong in the Editor/Score context or item context menu, not in expanded row
cards.

Snapshot replacement is explicit through commands such as:

```text
Show Differences
Update Snapshot from Source
Update All Changed Snapshots
Restore Snapshot to ABC File
```

Derived Set List export and print use the stored snapshot by default so that a
saved Set List remains reproducible and portable. The UI reports newer sources
before export and lets the user update snapshots deliberately.

### Explicit Add to Set List

`Add to Set List` names or presents its destination. The active visible Set List
is first, followed by a bounded list of recent documents and actions to open or
create another one.

Selecting a non-active destination first resolves dirty state, opens that Set
List as the active document, shows its panel, and only then adds and highlights
the tune. ABCarus does not silently mutate a non-active Set List JSON file in
the background.

Dragging into the visible panel needs no chooser: the destination is already
unambiguous.

An active dirty source tune cannot be snapshotted as though its unsaved editor
text were canonical. The action offers `Save and Add` or `Cancel`. After a
successful source save, the snapshot, content hash, and capture timestamp are
recorded and the Set List becomes dirty.

### Context-menu scope

Set List item commands may include:

```text
Open Source Tune
Preview Snapshot
Show Differences
Update Snapshot from Source
Duplicate Occurrence
Move Up / Move Down
Performance Options
Page Break Before
Remove from Set List
```

Library operations that rename, move, or delete source files do not appear as
Set List item operations.

### Implementation boundary

The docked panel reuses the Set List document/session domain from ADR-0020 and
the application's existing Editor/Score pipeline. It must not introduce a
second editor, a second playback renderer, a parallel source-save mechanism, or
a cloned Library domain.

Shared row, selection, drag, and context-menu presentation may be factored into
small UI primitives when reuse is proven. Library indexing and Set List
document state remain separate owners.

The modal Set List workspace is transitional and is removed as the primary
surface once the docked panel reaches feature parity. Short actions such as
Header editing, file dialogs, comparison, and recovery may remain modal.

## Verification

Focused tests must cover:

- panel hidden on a new/default workspace;
- show, hide, reopen, and Focus-mode visibility restoration;
- hiding does not save, discard, or prompt for a dirty Set List;
- Library drag into an empty and populated Set List;
- visible insertion, reorder, selection, and active-row highlighting;
- Set List row activation routes Editor Save to the source ABC file;
- source hash match and mismatch states;
- missing source retains snapshot preview/export/recovery;
- explicit snapshot update changes hash and capture timestamp;
- dirty source requires `Save and Add` or `Cancel`;
- choosing another destination makes it active before mutation;
- no background write to a non-active Set List;
- export remains deterministic from stored snapshots.

## Consequences

Set List becomes pleasant for sustained program assembly without occupying the
interface for users who do not need it. Library and Set List feel related while
retaining different invariants. Source ABC remains the only normal editing
authority, and embedded ABC remains useful as a portable, comparable, and
recoverable revision rather than becoming a competing document lifecycle.
