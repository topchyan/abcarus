# ABC Standards (2.1 / 2.2) — Notes for ABCarus

ABCarus primarily targets **ABC 2.1 (Dec 2011)** as the stable baseline, while also supporting commonly-used extensions as implemented by **abc2svg**.

Standards:
- ABC 2.1: https://abcnotation.com/wiki/abc:standard:v2.1
- ABC 2.2 (draft): https://abcnotation.com/wiki/abc:standard:v2.2

## How ABCarus uses the standard

ABCarus needs the standard mostly for **parsing boundaries**, **lint/warnings**, and **safe transformations**:
- Tune boundaries: a tune runs from `X:` up to (but not including) the next `X:`; **blank lines terminate a tune**.
- Header vs tune body: file header (before the first `X:`) vs per-tune header (inside a tune before the music).
- Inline fields: bracketed fields like `[K:...]`, `[M:...]`, `[Q:...]` can appear inside the tune body.
- Comments: `%` starts a comment; a **literal blank line** is semantically meaningful, so transforms must avoid producing blank lines inside tunes.
- Voices: `V:` and in-tune voice changes are common; ABCarus treats them as first-class for rendering/playback via abc2svg.
- Chord symbols (“gchords”): quoted strings like `"Am7"` are chord symbols, not lyrics/annotations.

Where ABCarus defers to abc2svg:
- Playback/typesetting behavior is defined by the bundled abc2svg version, which may accept extensions beyond the core standard.

## Practical “baseline rules” (useful for lint and transforms)

These are the rules that most often affect editing safety and warnings:
- **No blank lines inside tunes** (except inside `%%begintext ... %%endtext` blocks).
- Meter (`M:`) defines expected bar length; common writing practice includes an **incomplete pickup bar** at the start.
- Repeat markers and barlines (`|:`, `:|`, `::`, `|]`, `:|]`, first/second endings) must occur at bar boundaries.
- Macros (`U:`) expand to decorations/strings; a macro value must match the syntax expected by the rendering/playback engine.

## What ABC 2.2 changes vs 2.1 (high-level)

ABC 2.2 is explicitly published as a **draft** and focuses on clarifying and restructuring areas that were “volatile” in 2.1:
- Major rewrite/restructure of **voice modifiers (clefs + transposition)** section (rules intended to be compatible, but written more clearly).
- More explicit support for additional clef values/parameters (and some deprecations of older clef syntaxes).
- Incorporates a formal **Transposition** section and related syntax (including `V:*` discussed in the multiple voices section).
- Adds/clarifies some **decorations** (e.g. variants like `!marcato!`, D.C./D.S. markers, plus editorial/courtesy-related decorations).

ABCarus should treat 2.2 as an *informational* reference and follow abc2svg for the actual accepted surface area.

