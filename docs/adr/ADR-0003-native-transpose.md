# ADR-0003: Native Transposition (abc2abc replacement) + microtonal 53-EDO support

Date: 2026-01-04  
Status: Accepted

## Context

Historically, ABCarus used the external `abc2abc` tool (abcMIDI) for transposition. This adds a dependency on an external binary, platform-specific behavioral differences, and limits evolution (in particular: microtonal logic and handling of gchords in quotes).

We need:
- in-app transposition (a drop-in replacement for semitone transpose) without relying on `abc2abc`;
- correct handling of the microtonal case `%%MIDI temperamentequal 53` (53-EDO) without corrupting text/annotations;
- transposition of gchords strictly in 12-TET.

## Decision

Introduce “native transpose” as the primary transposition path in the UI:
- Enabled by default (`useNativeTranspose: true`), can be disabled in Settings.
- On errors/incompatibility, the native path must refuse rather than “silently” modify text.

Native transposition is implemented in `src/renderer/transpose.mjs` and invoked from the renderer (via existing UI/IPC paths), without changing IPC names or menu action strings.

### 53-EDO (`temperamentequal 53`)

When `%%MIDI temperamentequal 53` is present, transposition runs in “53 mode”:
- apply a deterministic “western semitone” shift (±1) in 53-EDO;
- transpose microtonal accidentals in `K:` and inline `[K:...]`;
- do *not* modify the contents of `!decorations!` or bracketed fields `[X:...]` except `[K:...]`, to avoid text corruption and cascading errors on repeated transpositions.

### gchords (quoted chord symbols)

Strings like `"Em7"`, `"A7/E"`, `"C#m7/G#"` are transposed in 12-TET:
- transpose the root and (if present) the slash-bass;
- preserve quoted text annotations that do not look like chord symbols.

## Scope (where to look in code)

- Algorithm: `src/renderer/transpose.mjs`
- Enable/fallback: `src/renderer/renderer.js` (`useNativeTranspose`)
- Setting UI: `src/renderer/index.html`, `src/renderer/settings.js`
- Header integration (temperamentequal from header): `src/renderer/renderer.js` (passes effective header into transpose)

## Consequences

Positive:
- fewer external dependencies (transposition no longer requires `abc2abc`);
- controlled behavior and the ability to apply targeted fixes (including microtonal cases);
- easier portability to Windows/macOS (fewer “required binaries”).

Negative:
- responsibility for transposition correctness now lives in the ABCarus codebase;
- some complex/rare cases may require strict refusal or fallback to avoid risking data corruption.

## Invariants

- Tolerant-read / strict-write: the native path must be conservative and prefer refusal/fallback over “silent corruption”.
- Do not spam the renderer with progress/status updates.
- Stability under repeated transpositions: no register/text “drift” caused by processing non-note constructs.

## Idea authorship (not legal advice)

The “native transpose” idea as a replacement for `abc2abc`, and the required musical behavior/quality constraints, were defined by the project owner (Avetik) and implemented in ABCarus. Legal status and rights are defined by the repository license and contributor agreements.
