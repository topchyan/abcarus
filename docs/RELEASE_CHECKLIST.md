# Release checklist (practical)

This is a step-by-step guide for making a release build and pushing it to GitHub.

Where to find:
- High-level policy: `docs/RELEASES.md`
- This checklist: `docs/RELEASE_CHECKLIST.md`
- Release history (manual notes): `DEVLOG.md`
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

## 2) Update CHANGELOG and DEVLOG

If you use `deploy.sh` (recommended), it can do both automatically (see below).

Manual (optional):
- Append DEVLOG entry:
  - `node scripts/chat-log.mjs -m "your message" --notes "optional notes"`
- Edit `CHANGELOG.md`:
  - Ensure `## [Unreleased]` exists.
  - Add a new `## [X.Y.Z] - YYYY-MM-DD` section right under it.

## 3) Release (recommended: one-shot)

This is the “do it all in one shot” flow:

1) Make sure you are in the repo root.
2) Run:
   - Minimal (recommended):
     - `bash deploy.sh --version patch -m "chore(release)"`
   - Minor/major:
     - `bash deploy.sh --version minor -m "chore(release)"`
     - `bash deploy.sh --version major -m "chore(release)"`

Notes on the commit message:
- If you omit the version, `deploy.sh` appends it automatically (e.g. `: v0.12.2`).
- You can also use `{version}` placeholder: `-m "chore(release): {version}"`.
3) After it finishes:
   - AppImage artifact: `dist/appimage/Abcarus-x86_64.AppImage`

Notes:
- `deploy.sh` pushes by default (non-interactive). Use `--ask` to re-enable prompts.
- If you want to build without pushing: add `--skip-push`.
- If you want to control the changelog / notes generation:
  - Use `--skip-release-docs` to disable auto-generation.
  - Use `--release-from <ref>` to set the git range start (default: latest `v*` tag).
  - Use `--release-notes-path <path>` to choose where notes are written (default: `docs/RELEASE_NOTES.md`).

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
