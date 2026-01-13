# Releases

This project uses Semantic Versioning (SemVer) and Keep a Changelog.

Versioning details live in `docs/VERSIONING.md` (to avoid duplicating rules across multiple files).

## Tags
- Tags are annotated and follow `vX.Y.Z`.
- A tag indicates a release build.

## Release process
1) Ensure `master` is green and the working tree is clean.
2) Decide version bump (patch/minor/major).
3) Run one of:
   - `npm run release:patch`
   - `npm run release:minor`
   - `npm run release:major`
4) Push commit and tag:
   - `git push`
   - `git push origin vX.Y.Z`
5) Create a GitHub Release from the new CHANGELOG section.
   - CI builds and uploads artifacts on tag push via `.github/workflows/release-assets.yml`.
   - You typically only need to write/paste the release notes; artifacts are uploaded automatically to the GitHub Release for that tag.

## CI: Release Assets workflow

`.github/workflows/release-assets.yml`:
- runs automatically on tag pushes matching `v*`;
- can be run manually (workflow_dispatch) to rebuild artifacts for an existing tag.

Manual rebuild (upload to GitHub Release):
- Run the workflow with `ref: vX.Y.Z` and `publish: true`.
- `publish` is ignored for non-tag refs; uploads are only allowed for `v*` tags.

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

Pre-releases and build metadata are documented in `docs/VERSIONING.md`.

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
