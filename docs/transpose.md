# Transposition (Status + Design Notes)

## Current status in the app
Semitone transposition is implemented as a native JS transform:
- `transformTranspose` in `src/renderer/transpose.mjs`

Semitone transposition runs via the built-in JS engine.

Notes:
- In 12-EDO (default) and 24-EDO (`%%MIDI temperamentequal 24`), microtonal accidentals are supported in quarter-tone steps (`^/`, `_/`) and numeric half-step form (`^1/2`, `_1/2`).
- In 53-EDO (`%%MIDI temperamentequal 53`), numeric accidentals (`^n` / `_n`) are treated as 12/53-semitone units (e.g. `_3` = `_-36/53`).
- The EDO mode is detected from the current editor text plus the enabled global header (if any).

## Native transposition work (experimental)
There is active/experimental work toward a broader native transposition engine and a test corpus:
- Harness runner: `devtools/transpose_harness/run_tests.js` (`npm run test:transpose`)
- Core logic under test: `devtools/transpose_harness/transpose.js`
- 53-EDO “truth scale” utilities/tests: `tests/truth_scale_53/`

This work is intentionally isolated until it has strong acceptance criteria and sufficient coverage.

## Working model (53-EDO + “European semitone” steps)
The current harness codifies a specific model used in the test corpus:
- Treat Western 12‑TET semitone steps as a sequence of ±4/±5 steps in 53‑EDO.
- Preserve micro-accidental intent as much as possible by deterministic respelling rules.
- Support numeric micro accidentals in tokens (e.g. `^3F`, `_5B`) and propagate them consistently when transposing.

If/when this becomes a production feature, the acceptance criteria should be expressed as fixtures + golden outputs in the harness, and the app integration should remain tolerant-read/strict-write (refuse on ambiguous cases rather than corrupting notation).
