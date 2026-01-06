# Release checklist (practical)

This is a step-by-step guide for making a release build and pushing it to GitHub.

Where to find:
- High-level policy: `docs/RELEASES.md`
- This checklist: `docs/RELEASE_CHECKLIST.md`
- User-facing changelog: `CHANGELOG.md`
- Generated release notes (per release): `docs/RELEASE_NOTES.md`

---

## 0) Preconditions

- You are on the right branch (usually `master`).
- You can run the app locally: `npm run start`
- AppImage toolchain is available (see `scripts/README.md`).

## Local-only files (do not commit)

This repo intentionally keeps some things local (debug dumps, personal scripts, etc.).

- Repo-shared ignores live in `.gitignore` (tracked and pushed to GitHub).
- Personal/host-specific ignores should NOT go into `.gitignore`.
  Use one of:
  - `.git/info/exclude` (applies only to your clone)
  - your global git ignore file (e.g. `~/.config/git/ignore`)

## 1) Prepare the release message

You typically want:
- a short commit subject (used on GitHub commit list)
- an optional longer body (details)

Example:
- Subject: `release: v0.12.2`
- Body: a few bullet points, one per major change.

## 2) Update CHANGELOG (and optional local devlog)

The repository release flow is driven by `scripts/release.mjs` (via `npm run release:*`) and
`scripts/generate-release-docs.mjs` (to update `CHANGELOG.md` and `docs/RELEASE_NOTES.md`).

Manual (optional):
- Append local devlog entry:
  - `node scripts/chat-log.mjs -m "your message" --notes "optional notes"`
- Edit `CHANGELOG.md`:
  - Ensure `## [Unreleased]` exists.
  - Add a new `## [X.Y.Z] - YYYY-MM-DD` section right under it.

## 3) Release (recommended)

This flow bumps the version, updates release docs, commits, and creates a tag:

1) Ensure the working tree is clean.
2) Run one of:
   - `npm run release:patch`
   - `npm run release:minor`
   - `npm run release:major`

3) Push commit and tag:
   - `git push`
   - `git push origin vX.Y.Z`

Notes:
- Release notes are generated from git history and written to:
  - `CHANGELOG.md`
  - `docs/RELEASE_NOTES.md`

## 4) Push (if skipped earlier)

- `git push origin master`
- `git push origin vX.Y.Z`

## 5) Create GitHub Release (manual)

1) Go to the GitHub repository.
2) Create a new Release from tag `vX.Y.Z`.
3) Paste the release notes from `CHANGELOG.md` section `## [X.Y.Z] - ...`.
4) Upload `dist/appimage/Abcarus-x86_64.AppImage`.

## 6) Troubleshooting AppImage build

If you see errors about FUSE (/dev/fuse) or runtime download:

- You can run AppImage-based tools without FUSE via:
  - `APPIMAGE_EXTRACT_AND_RUN=1`
- `appimagetool` may need a runtime file (`runtime-x86_64`).
  - Place it at: `dist/appimage/runtime-x86_64`
  - Then rebuild using `appimagetool --runtime-file dist/appimage/runtime-x86_64 ...`

## Local helpers (not in git)

Some contributors keep optional convenience scripts under `scripts/local/` (gitignored).
They are not required for the release process.
