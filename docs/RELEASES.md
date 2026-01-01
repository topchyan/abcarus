# Releases

This project uses Semantic Versioning (SemVer) and Keep a Changelog.

## Versioning rules
- MAJOR: incompatible changes or removals that require user action.
- MINOR: new features or behavior changes that remain backward compatible.
- PATCH: bug fixes and small improvements with no behavior change.

## Tags
- Tags are annotated and follow `vX.Y.Z`.
- A tag indicates a release build.

## Release process
1) Ensure `main` is green and the working tree is clean.
2) Decide version bump (patch/minor/major).
3) Run one of:
   - `npm run release:patch`
   - `npm run release:minor`
   - `npm run release:major`
4) Push commit and tag:
   - `git push`
   - `git push origin vX.Y.Z`
5) Create a GitHub Release from the new CHANGELOG section.

## Practical checklist
For a step-by-step “one-shot” release workflow (deploy + AppImage + push), see:
- `docs/RELEASE_CHECKLIST.md`

## Release notes format
Use Keep a Changelog headings:
- Added
- Changed
- Fixed
- Removed
- Security

## Pre-releases
- Use `X.Y.Z-alpha.N`, `X.Y.Z-beta.N`, or `X.Y.Z-rc.N`.
- Pre-releases may be tagged but should be clearly labeled in GitHub Releases.

## Dev builds
- Dev builds are any commit not exactly on a `vX.Y.Z` tag.
- Version info should include build number and commit hash.

## Release notes template
```
## [X.Y.Z] - YYYY-MM-DD
### Added
- 
### Changed
- 
### Fixed
- 
### Removed
- 
### Security
- 
```
