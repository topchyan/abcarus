# Release checklist (practical)

This is a step-by-step guide for making a release build and pushing it to GitHub.

Where to find:
- High-level policy: `docs/RELEASES.md`
- This checklist: `docs/RELEASE_CHECKLIST.md`
- Release history (manual notes): `DEVLOG.md`
- User-facing changelog: `CHANGELOG.md`

---

## 0) Preconditions

- You are on the right branch (usually `master`).
- You can run the app locally: `npm run start`
- AppImage toolchain is available (see `scripts/README.md`).

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
   - Patch release:
     - `bash deploy.sh --commit-all --version patch --tag -m "release: vX.Y.Z" -b "optional details"`
   - Minor/major:
     - `bash deploy.sh --commit-all --version minor --tag -m "release: vX.Y.Z"`
     - `bash deploy.sh --commit-all --version major --tag -m "release: vX.Y.Z"`
3) After it finishes:
   - AppImage artifact: `dist/appimage/Abcarus-x86_64.AppImage`

Notes:
- `deploy.sh` will prompt before pushing unless you pass `-y`.
- If you want to build without pushing: add `--skip-push`.

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

