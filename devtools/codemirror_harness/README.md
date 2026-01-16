# CodeMirror Harness

This harness provides a repeatable sanity check for the vendored CodeMirror 6 bundle:
- `third_party/codemirror/cm.js`

It is intended to catch upgrade regressions early (especially export surface changes and accidental “selection match” highlighting).

## Run

```bash
npm run test:codemirror
```

## What it checks

- The vendored `cm.js` can be imported and exports the symbols ABCarus relies on.
- The vendored `cm.js` does not include selection-match highlighting (`cm-selectionMatch`).
- The build recipe can generate a new bundle to `/tmp` and the resulting exports match expectations.

