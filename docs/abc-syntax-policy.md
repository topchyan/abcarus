# ABC Syntax Policy (ABCarus)

This document is the **single, human-readable source of truth** for how ABCarus interprets and manipulates ABC text.
It is intended for:
- implementing parsing/scanning,
- implementing safe transformations,
- implementing warnings/lint rules,
- maintaining compatibility with real-world ABC collections.

Related references:
- `docs/abc-standards.md` (ABC 2.1 / 2.2 notes + links)
- `docs/REQUIREMENTS.md` (tolerant-read / strict-write invariants)
- `third_party/abc2svg/` (practical accepted syntax for rendering/playback)

## 1) Guiding principles

1. **Tolerant read / strict write**
   - Reading/parsing should accept common real-world variations.
   - Writing must avoid producing ambiguous or tune-breaking output.
2. **Do not corrupt user data**
   - Never introduce tune-terminating blank lines.
   - Avoid reformatting beyond the explicitly requested operation.
3. **abc2svg is the execution engine**
   - Rendering/playback behavior is defined by the bundled abc2svg version.
   - ABCarus should validate and warn, but must not “invent” semantics beyond what abc2svg can handle.

## 2) Dialect baseline

ABCarus targets **ABC 2.1** as the stable baseline. ABC 2.2 is a draft and serves as a reference for clarifications and transposition/clef rules, but acceptance is ultimately determined by abc2svg.

ABCarus also supports common extensions used in the wild (especially `%%` directives and abc2svg features), but treats them as **engine-defined**.

## 3) File structure: files, tunes, headers

### 3.1 File header vs tune header

- **File header**: lines before the first `X:` in a file.
- **Tune**: begins at a line starting with `X:` and ends immediately before the next `X:` (or end of file).
- **Tune header**: information fields inside a tune before the first music body line.

### 3.2 Blank lines (critical)

Policy: **A blank line terminates a tune.**

Therefore, transformations must ensure:
- No blank lines are introduced inside tunes.
- The only acceptable blank lines are tune separators (between tunes), and blank lines inside `%%begintext ... %%endtext`.

If a transform would create a blank line inside a tune, it must replace it with `%` (a harmless comment) or avoid generating it in the first place.

## 4) Lines and comments

- `%` begins a comment, unless escaped as `\%` (rare in practice).
- A line may contain an inline comment after musical content.
- `%%` directives are treated as special comment/directive lines; they may affect rendering/playback.

Transforms should preserve:
- comments (especially `%%` directives),
- ordering of header lines unless the transform explicitly targets them.

## 5) Information fields

### 5.1 Field line form

An information field line matches:
- `^[ \t]*[A-Za-z]:` (e.g. `X:`, `T:`, `M:`, `K:`, `V:`, `Q:`, `L:`, `P:`, `U:`, `I:` …)

### 5.2 Inline fields

Inline fields are bracketed fields inside tune body lines, e.g.:
- `[K:Em]`, `[M:7/8]`, `[Q:1/4=120]`, `[V:1]`, `[I:...]`

Transforms must:
- preserve them verbatim unless explicitly modifying them,
- treat them as “structural tokens” (do not split them).

## 6) Tune body tokens (practical subset)

This is not a full formal grammar; it is the operational subset we rely on for transforms/lint:

- **Pitches**: `A-G` / `a-g` (octave by case + apostrophes/commas)
- **Accidentals**: `^`, `^^`, `_`, `__`, `=` and numeric/fractional variants used by some dialects
- **Durations**: numbers and fractions after notes/rests
- **Rests**: `z`, `x`, `Z` (common in practice)
- **Barlines/repeats**: `|`, `|:`, `:|`, `::`, `|]`, `:|]`, `[|`, plus first/second endings `|1`, `|2`
- **Chords/unisons**: `[CEG]` style note groups
- **Chord symbols (gchords)**: quoted strings like `"Am7"`, `"A7/E"`
- **Decorations**: `!trill!` and related `!name!` constructs
- **Annotations**: `^text`, `_text`, `@...` (engine-defined; preserve)
- **Lyrics**: `w:` lines and continuation

## 7) ABCarus interpretation rules (implementation-facing)

### 7.1 “Tune identity”

Tune identity is anchored on:
- `X:` reference number (preferred when present),
- otherwise file position (stable offsets) with a rescan strategy.

### 7.2 Error levels

ABCarus uses three tiers:
- **Error**: likely prevents correct rendering/playback or corrupts structure (e.g. blank line inside tune).
- **Warning**: likely unintended / confusing but may still render/play.
- **Info**: unusual but valid in some dialects; shown only when relevant.

### 7.3 Bar-length warnings

Meter (`M:` or inline `[M:...]`) defines expected bar length.

Warnings should be:
- based on the **effective local meter** at the position,
- tolerant of pickup/incomplete first bars,
- tolerant of common repeat/ending constructs,
- engine-aligned (if abc2svg accepts it, prefer warning over error).

## 8) Transformations: safety contract

Every transformation must satisfy:
- **Idempotence** where reasonable (running it twice converges).
- **No new blank lines** inside tunes.
- Preserve non-target text (comments, unknown directives, spacing) as much as possible.

### 8.1 Strict-write rules

When writing back to disk:
- use atomic replace (temp + rename) with retries,
- reject stale offsets or concurrent edits (unless explicitly resolved by reloading/merging).

## 9) Scope boundaries (what ABCarus will not define)

ABCarus does not attempt to define:
- complete dialect semantics for all `%%` directives,
- the authoritative playback interpretation of microtonal systems,
- a complete formal grammar for every extension.

In these cases, ABCarus defers to:
- abc2svg behavior,
- and uses warnings to communicate ambiguity/risk.

