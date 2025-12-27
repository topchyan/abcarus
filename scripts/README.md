# Scripts overview

Quick usage (no arguments):
- Local AppImage staging (no bundled Python): `bash scripts/build_appimage_local.sh`
- Release AppImage (sync Python + build + appimagetool): `bash scripts/build_appimage_release.sh`
- Sync Python runtime into repo: `bash scripts/sync_python_runtime.sh`

Local-only scripts:
- Put personal scripts with hardcoded paths under `scripts/local/` (gitignored).

Details:
- `build_appimage_local.sh` removes any bundled runtime, then builds an AppDir for quick local testing.
- `build_appimage_release.sh` snapshots the system Python into `third_party/python-runtime`, builds the AppDir, then runs appimagetool at `../appimagetool/appimagetool-x86_64.AppImage` to generate the final AppImage.
- `build_appimage.sh` is the AppDir staging script used by the other two scripts and always embeds `third_party/python-runtime`.
- `bundle_python_appimage.mjs` copies Python scripts and the runtime into the AppDir.
- `sync_python_runtime.sh` copies the system Python executable + stdlib into `third_party/python-runtime`.
- `install_icons.sh` installs desktop icons for local dev.
- `run.sh` starts the Electron app.
- `transpose_tests.mjs` is a local utility for transpose tests.
