# Native Transposition

This project includes a native ABC transposition engine to avoid relying on `abc2abc` for semitone shifts.

## Pitch model
- Each note is parsed into an absolute pitch in 12‑TET: `absolute_pitch = octave * 12 + pc`.
- Pitch class `pc` is `0..11` with `C=0` and `B=11`.
- Octave is derived from ABC case + comma/apostrophe marks.
- Transposition is a direct shift: `absolute_pitch += Δ`.

## Parsing rules
- Key signatures are applied when `K:` is present (major/minor only in phase 1).
- Measure accidentals override key signatures and apply to the same letter + octave for the rest of the bar.
- Accidentals reset at barlines (`|`).
- Comments, lyrics, and text blocks are preserved verbatim.

## Output modes
- **Chromatic mode** (`K:none` or forced):
  - Uses a consistent flat or sharp spelling for all pitch classes.
  - Emits `=` only when needed to cancel a bar accidental.
- **Tonal mode** (default when `K:` is present):
  - Transposes the key and respells notes to minimize explicit accidentals.
  - Chooses a key spelling with minimal accidentals, preferring the original sharp/flat style.

## Microtones (24‑TET)
- Quarter‑tone accidentals are supported: `^/` and `_/`.
- Internally, pitches are represented in quarter‑steps (24‑TET). Semitone transposition adds `Δ * 2` steps.
- Key signatures remain semitone‑based; quarter‑tones always emit explicit accidentals.
