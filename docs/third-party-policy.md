# Third-Party Boundary Policy

`third_party/**` is a vendored upstream area. Treat it as read-only during feature work.

## Allowed Changes

- A coherent upstream upgrade from a source/archive/build snapshot.
- Version/provenance metadata that belongs with the vendored artifact.
- License and notice updates required by the upstream component.
- Deterministic lock files for external runtimes, such as `third_party/python-embed/*/python-build-standalone.lock.json`.

## Not Allowed

- Hand-editing vendored runtime files to fix ABCarus behavior.
- Keeping local build state, caches, logs, temporary archives, or extracted workdirs in git.
- Placing ABCarus-owned adapters, recipes, wrappers, or tests inside `third_party/**`.
- Mixing a third-party upgrade with app behavior changes in the same commit.

## If Upstream Behavior Needs Adjustment

Prefer this order:

1. Fix ABCarus adapter/payload code outside `third_party/**`.
2. Report or verify the issue upstream with a minimal reproduction.
3. Upgrade to an upstream snapshot that contains the fix.
4. Use a local third-party patch only as a documented exception with an upstream artifact ID and removal plan.

## Temporary Patch Gate

A local modification under `third_party/**` may be retained only when all of the following are present:

- a minimal reproduction and an automated regression test outside `third_party/**`;
- a source-level patch submitted to the upstream maintainer, not only a change to a generated vendor file;
- the upstream ticket URL and submission date recorded in `docs/third-party-patches.md`;
- the exact upstream base artifact and the condition for removing the patch;
- verification that upgrading to the accepted upstream fix removes the local diff without changing behavior.

Until the upstream submission exists, a local vendor edit is diagnostic work only and is not release-ready.

## Review Rule

Before committing any `third_party/**` change, run the third-party boundary check and the relevant component harnesses.

## abc2svg Qualified Runtime

abc2svg additionally follows the qualified-runtime procedure documented in
`docs/abc2svg-runtime-maintenance.md`. The checked-in runtime must match the
hashes in `config/abc2svg-runtime.json`. Any downstream exception is applied by
an exact, ordered recipe in `patches/abc2svg/`; direct edits to generated
runtime files are not release-ready.

Desktop is the canonical runtime producer. Mobile may only copy a runtime whose
manifest and artifact hashes have passed desktop verification.
