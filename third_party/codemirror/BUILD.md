# CodeMirror 6 vendored bundle (`cm.js`) — Build recipe

ABCarus vendors a single-file CodeMirror 6 bundle at:
- `third_party/codemirror/cm.js`

Policy:
- Do not hand-edit `third_party/codemirror/cm.js`.
- Changes to `cm.js` must be produced by this recipe and reviewed as an atomic third-party upgrade.

## What this recipe provides

- A deterministic bundling entry module: `third_party/codemirror/build/entry.mjs`
- A build script that produces a single ESM file: `third_party/codemirror/build/build.mjs`
- Version metadata: `third_party/codemirror/VERSION.txt`

## Prerequisites

- Node.js (same as the repo’s normal dev environment)
- Dev dependencies installed: `npm install`

## Build (default output)

```bash
node third_party/codemirror/build/build.mjs
```

Output:
- `third_party/codemirror/cm.js`

## Build to a custom output path (recommended for comparison)

```bash
node third_party/codemirror/build/build.mjs --out /tmp/abcarus-cm-test.mjs
```

Tip: use a `.mjs` extension for the temporary output if you want to inspect exports with Node.js.

## Third-party review

After rebuilding `cm.js`, run:

```bash
node scripts/third_party-review.mjs
```

Then do manual smoke tests (editor typing, search, follow/practice highlighting).
