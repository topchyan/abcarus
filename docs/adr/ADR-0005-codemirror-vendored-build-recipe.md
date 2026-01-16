---
title: "ADR-0005: CodeMirror 6 Vendored Bundle with Reproducible Build Recipe"
date: 2026-01-16
status: "Accepted"
---

# ADR-0005: CodeMirror 6 Vendored Bundle with Reproducible Build Recipe

## Context

ABCarus uses a vendored CodeMirror 6 bundle:
- `third_party/codemirror/cm.js`

This file is treated as a third-party artifact:
- no hand-editing in the repo,
- upgrades must be atomic, reviewable, and reversible.

The ABC language roadmap requires access to additional CodeMirror 6 APIs (compartments, hover, diagnostics, richer completion helpers).
Those APIs exist in upstream CM6, but are not necessarily exported by the current vendored bundle.

## Decision

Keep CodeMirror 6 as a vendored single-file bundle (`third_party/codemirror/cm.js`) and introduce a reproducible build recipe that:
- produces `cm.js` deterministically from upstream CM6 sources,
- defines an explicit export surface (only what ABCarus intends to use),
- records upstream version/commit metadata.

Upgrades remain atomic:
- one commit replaces `third_party/codemirror/cm.js` (and updates `VERSION.txt` as needed),
- the change is reviewed via the existing third-party review workflow.

## Constraints

- Do not hand-edit `third_party/codemirror/cm.js`.
- Avoid unbounded API drift: exports are explicitly curated via an entry module.
- Prefer a minimal, predictable bundler toolchain for the recipe.
- Maintain a fast typing loop: avoid accidentally pulling heavy optional features into the default path.

## Implementation Notes

- Recipe lives under `third_party/codemirror/`:
  - `third_party/codemirror/build/entry.*` defines imports/exports
  - `third_party/codemirror/build/build.mjs` builds the bundle
  - `third_party/codemirror/BUILD.md` documents how to rebuild
  - `third_party/codemirror/VERSION.txt` records upstream tag/commit and build tool versions

## Upgrade Checklist

When upgrading CodeMirror:
1. Rebuild `third_party/codemirror/cm.js` using the recipe.
2. Update `third_party/codemirror/VERSION.txt`.
3. Run third-party review: `node scripts/third_party-review.mjs`.
4. Manual smoke tests:
   - typing latency on a large ABC file
   - existing editor decorations/plugins
   - search panel, bracket matching, close brackets
   - playback follow/practice highlighting

## Alternatives Considered

- Using npm `@codemirror/*` packages directly (Option B): rejected for now due to higher integration/build complexity and weaker third-party boundary.
