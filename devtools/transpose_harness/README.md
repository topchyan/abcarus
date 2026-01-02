# Transpose Harness (dev-only)

This folder contains a deterministic test harness for a standalone “native” ABC transposition algorithm.

It is **dev-only** and must not ship in release builds.

## Run

From the repo root:

```bash
npm run test:transpose
```

Verbose (prints a sample input/output before running tests):

```bash
npm run test:transpose -- --verbose
```

Or directly:

```bash
node devtools/transpose_harness/run_tests.js
```

## What this does

- Loads fixtures from `devtools/transpose_harness/fixtures/`
- Runs `transpose_abc(text, deltaSteps)` from `devtools/transpose_harness/transpose.js`
- Compares exact bytes against golden files in `devtools/transpose_harness/expected/` for selected tests
- Runs semantic “pitch equivalence” checks for regression safety

## Determinism notes

- No randomness, no timestamps.
- If multiple spellings are valid, the algorithm follows a stable tie-break policy documented in the prompt that introduced this harness.
