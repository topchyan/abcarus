# Scripts overview

Quick usage (no arguments):
- Local AppImage staging: `bash scripts/build_appimage_local.sh`
- Release AppImage (bundle portable Python + build + appimagetool): `bash scripts/build_appimage_release.sh`

Local-only scripts:
- Put personal scripts with hardcoded paths under `scripts/local/` (gitignored).
  - Examples: `scripts/local/run.sh`, `scripts/local/get_recents.sh` (kept out of GitHub).

Details:
- `build_appimage_local.sh` stages an AppDir for local testing (expects a portable Python runtime under `third_party/python-embed/linux-x64`).
- `build_appimage_release.sh` installs the pinned portable Python runtime via `devtools/pbs/`, builds the AppDir, then runs appimagetool at `../appimagetool/appimagetool-x86_64.AppImage` to generate the final AppImage.
- `build_appimage.sh` is the AppDir staging script used by the other two scripts and always embeds the portable Python runtime.
- `bundle_python_appimage.mjs` copies Python scripts and the runtime into the AppDir.
- `install_icons.sh` installs desktop icons for local dev.
- Local runner scripts live under `scripts/local/` (gitignored).
- `transpose_tests.mjs` is a local utility for transpose tests.
