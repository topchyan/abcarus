ADR-0014 - Practical Microtonal Transpose

Date: 2026-04-25
Status: Superseded for future development (2026-09-11)

The implementation described here remains historical context for the current
code, but its European-semitone and inferred-finalis model is no longer the
target design. It is superseded by the tonic/perde/Ahenk-oriented direction
recorded during internal research.

Do not extend the existing 4/5-comma heuristic. Preserve current behavior until
the replacement has a verified reference corpus and can be introduced without
silently rewriting ambiguous notation.

## Context

ABCarus supports users who edit and play back ABC files containing microtonal material. This is a minority workflow, but it is important for repertoire imported from Turkish, Arabic, and related traditions, including sources that arrive through MusicXML with unstable or incomplete microtonal glyph support.

The app currently uses 53-TET as a practical storage and playback layer for much of this material. This does not mean ABCarus treats 53-TET as a complete theoretical authority. It is a working representation rich enough to preserve and audition many microtonal pitch relationships while keeping the text editable in ABC.

Microtonal transpose therefore has different goals from ordinary 12-EDO transpose:

- preserve the audible interval skeleton of the melody,
- keep playback useful for checking authorial pitch intent,
- output notation a musician can read without excessive theoretical noise,
- avoid making ordinary users pay complexity costs in normal 12-EDO workflows.

## Decision

### 1) Transpose by European semitone steps

User transpose commands move music by European semitone steps (`+1`, `-1`, `+2`, etc.), not by arbitrary koma counts.

For microtonal material, the microtonal relationships move with the melody. They are not an independent transposition grid exposed to the user.

### 2) Preserve the melodic interval skeleton

The primary invariant is the melodic pitch skeleton:

```text
source pitches -> intervals relative to an anchor -> shifted pitches
```

The shifted result should preserve the audible interval relationships of the original melody as closely as the chosen EDO representation allows.

### 3) Use a non-microtonal tonic/finalis anchor

The tonic/finalis anchor used for practical transpose must be an ordinary European pitch class. It may be natural, sharp, or flat, but it must not be a microtonal variant.

When no explicit finalis metadata is available, use the last non-microtonal pitched note as a practical heuristic. If that cannot be found, fall back to the active `K:` context.

This keeps the transpose operation grounded in a musician-readable tonal center.

### 4) Treat `K:` as input context, not final authority

For microtonal transpose, `K:` helps read the source notes. It is not necessarily the best representation after transpose.

After the pitches are shifted, ABCarus may build a surrogate key signature:

```abc
K:none ...
```

The surrogate key should be derived from stable accidentals in the resulting material. Rare or local deviations should remain inline.

The editor text and rendered notation must match. ABCarus should not silently render a different display-only key from the text shown to the user.

### 5) Prefer performer-readable notation

When multiple spellings preserve the same pitch, choose the one that is most useful for a musician:

- prefer ordinary non-microtonal spelling when it does not damage the melodic reading,
- prefer known named-perde spellings from the existing perde mapping when appropriate,
- avoid excessive inline accidentals,
- avoid adding signs to the surrogate key if they only create more local cancellations.

Exact theoretical spelling is secondary to readable, playable notation.

### 6) Preserve diatonic melodic contour

Spelling must not be chosen note-by-note in isolation when that destroys the melodic contour.

If the source melody has distinct letter steps such as:

```text
G A B
```

then a transposed result should preserve a comparable stepped contour where possible. It should not collapse the phrase into a sequence such as:

```text
A A A
```

or into repeated variants of one letter merely because those are enharmonically valid.

This is especially important in microtonal contexts, where a locally valid enharmonic spelling can make the result look mechanically generated and musically misleading.

This rule does not hard-code individual enharmonic choices such as `^5g` versus `_4A`.
Those choices are context-dependent. A spelling that is poor in one phrase may be correct in
another if it preserves the melodic contour and reduces accidental noise across the bar.

### 7) Accidental memory is part of spelling cost

ABC accidental memory within a bar must be considered during spelling selection.

A spelling that appears simple for one note may force explicit naturals or repeated corrections later in the same bar. Such choices should be penalized when evaluating a whole bar or phrase.

## Consequences

Positive:

- Microtonal transpose remains useful for playback and practical reading.
- 53-TET can serve as a robust interchange layer without pretending to be the only theoretical model.
- Transposed output avoids many pathological enharmonic spellings.
- The editor remains truthful: text and staff rendering agree.

Trade-offs:

- The implementation cannot rely only on local per-note spelling.
- Some choices require phrase-level or at least bar-level context.
- A theoretically canonical named-perde spelling may be rejected when it damages the melodic contour.
- Future improvements should compare whole candidate sequences, not only individual notes.

## Implementation notes (non-normative)

The current implementation already contains pieces of this direction:

- 53-TET source reading and playback support,
- file-level `%%MIDI temperamentequal 53` inheritance,
- practical finalis-anchor heuristics,
- surrogate `K:none ...` extraction,
- standard ordering and register placement for surrogate key signs,
- named-perde lookup through `src/shared/abc-transpose/perde_by_abc.mjs`.

The next implementation step should be a context-aware spelling selector. A practical first version can work per bar:

1. Read source notes and their effective pitches.
2. Shift pitches by the selected European semitone delta.
3. Generate a small candidate set per note.
4. Select the lowest-cost sequence across the bar.
5. Include costs for pitch preservation, melodic letter contour, named-perde family, surrogate-key agreement, accidental memory, and readability.

This should replace increasingly complex local scoring rules only after regression coverage exists for representative makam examples.
