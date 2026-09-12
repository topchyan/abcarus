# Transposition (Status + Design Notes)

> Research warning (2026-09-11): production transpose and the isolated 53-EDO
> truth-scale harness currently use incompatible enharmonic maps. Passing tests
> do not resolve that conflict because the harnesses validate their own models.
> Do not extend the 4/5-comma semitone heuristic before reviewing
> `docs/roadmaps/20260911/microtonal-transposition-research.md`.

## Current status in the app
Semitone transposition is implemented as a native JS transform:
- `transformTranspose` in `src/renderer/transpose.mjs`

Semitone transposition runs via the built-in JS engine.

Notes:
- In 12-EDO (default) and 24-EDO (`%%MIDI temperamentequal 24`), microtonal accidentals are supported in quarter-tone steps (`^/`, `_/`) and numeric half-step form (`^1/2`, `_1/2`).
- In 53-EDO (`%%MIDI temperamentequal 53`), numeric accidentals (`^n` / `_n`) are treated as 12/53-semitone units (e.g. `_3` = `_-36/53`).
- The EDO mode is detected from the current editor text plus the enabled global header (if any).

### Experimental Bolahenk / concert conversion

When **Support microtonal notation** is enabled, the Tools menu exposes a
separate Bolahenk/concert converter for 53-EDO material. It is deliberately not
shown to the default audience and does not share the ordinary semitone
transpose contract.

The converter currently:

- applies the fixed Bolahenk-to-concert offset of `-22` EDO53 steps (or `+22`
  for the reverse operation);
- preserves `M:`, `L:`, `Q:`, voice attributes, note lengths, form, and layout;
- resolves key and bar accidentals before moving each pitch;
- rewrites the target key map and only emits required body accidentals;
- transposes conventional chord symbols by the corresponding perfect fourth;
- refuses input without `%%MIDI temperamentequal 53`.

This is a literal notation-frame conversion, not a general makam transposer or
an Arabic-notation adaptation. Output still requires musical review. The
research basis and acceptance corpus are recorded in
`docs/roadmaps/20260911/microtonal-transposition-research.md`.

### Length encoding versus rhythmic notation

The Tools menu intentionally exposes two different reversible operations:

- **Note Lengths → Double/Half** changes `L:` and compensates by changing every
  ABC note/rest multiplier. Rendered note values, `M:`, `Q:`, and playback stay
  unchanged; this only changes ABC encoding granularity.
- **Rhythmic Notation (Mertebe) → Augment/Diminish ×2** changes the unit in
  `M:`, `L:`, and `Q:` while leaving note/rest multipliers unchanged. Rendered
  note values and meter denomination change, while relative rhythm and playback
  time remain unchanged.

Mertebe conversion is independent of Bolahenk/concert pitch conversion and is
therefore a separate command.

## Native transposition work (experimental)
There is active/experimental work toward a broader native transposition engine and a test corpus:
- Harness runner: `devtools/transpose_harness/run_tests.js` (`npm run test:transpose`)
- Core logic under test: `devtools/transpose_harness/transpose.js`
- 53-EDO “truth scale” utilities/tests: `tests/truth_scale_53/`

This work is intentionally isolated until it has strong acceptance criteria and sufficient coverage.

## Existing experimental model (53-EDO + “European semitone” steps)
The current harness codifies a specific experimental model used in the test corpus:
- Treat Western 12‑TET semitone steps as a sequence of ±4/±5 steps in 53‑EDO.
- Preserve micro-accidental intent as much as possible by deterministic respelling rules.
- Support numeric micro accidentals in tokens (e.g. `^3F`, `_5B`) and propagate them consistently when transposing.

This model must not be treated as the final domain contract. In 53-EDO, `C#` and
`Db` are distinct pitches, so a target spelling/perde is needed to choose between
the 5-comma chromatic semitone and 4-comma diatonic semitone. See the dated
research note above for the proposed tonic/perde and Ahenk-oriented workflow.

Any replacement acceptance criteria should be expressed as fixtures plus golden
outputs and must cross-check one shared pitch model against abc2svg playback. The
app integration should remain tolerant-read/strict-write: refuse ambiguous cases
rather than corrupting notation.
