# Versioning Policy

ABCarus follows Semantic Versioning (SemVer).

Source of truth
- `package.json` is the canonical version for the app.
- Releases are tagged as `vX.Y.Z`.

Rules
- MAJOR: breaking changes or removals that require user action.
- MINOR: new features and behavior changes that remain backward compatible.
- PATCH: bug fixes and small improvements.

Pre-releases
- `X.Y.Z-alpha.N`, `X.Y.Z-beta.N`, `X.Y.Z-rc.N`.
- Used for stabilization before a final release.

Build metadata
- About dialog shows version, build number, and git commit.
- Build number is from `ABCARUS_BUILD_NUMBER` or `GITHUB_RUN_NUMBER`, else `local`.
- Commit hash is from `ABCARUS_COMMIT` or git.

FAQ
Q: When is a build considered a release?
A: When the commit is tagged exactly `vX.Y.Z`.

Q: How do I bump versions?
A: Use `npm run release:patch|minor|major`.
