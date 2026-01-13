# Packaging (Windows/macOS/Linux)

ABCarus supports:
- Linux: AppImage via scripts under `scripts/`
- Windows/macOS: `electron-builder` (run on the target OS)

## Python runtime (PBS)

Import/export uses Python tools (`abc2xml`, `xml2abc`) and expects a bundled Python runtime installed from python-build-standalone (PBS).

References:
- PBS policy + lock/install workflow: `docs/python-build-standalone.md`
- Runtime resolution order and system fallback (`ABCARUS_ALLOW_SYSTEM_PYTHON=1`): `docs/python-runtime.md`
- Windows runtime layout notes: `docs/windows.md`

Before packaging, install the PBS runtime for your platform:
- Update lock: `node devtools/pbs/pbs-update-lock.mjs --platform=<platform>`
- Install: `bash devtools/pbs/pbs-install-unix.sh <platform>` (Linux/macOS) or
  `pwsh -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-windows.ps1 -Platform win-x64` (Windows)
The `dist:*` scripts include a pre-check that fails fast if the runtime is missing:
- `npm run pbs:check-runtime`

## Windows (NSIS)

Run on Windows:
- `npm install`
- `npm run pbs:check`
- `pwsh -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-windows.ps1 -Platform win-x64`
- `npm run dist:win`

Output: `dist/electron-builder/`

## macOS (DMG)

Run on macOS:
- `npm install`
- `npm run pbs:check`
- `bash devtools/pbs/pbs-install-unix.sh darwin-arm64` (Apple Silicon) or `darwin-x64` (Intel)
- `npm run dist:mac`

Output: `dist/electron-builder/`

Minimum supported macOS:
- Electron 28 supports **macOS 10.15 (Catalina) and up**. ABCarus sets `build.mac.minimumSystemVersion` accordingly.

Note: DMG signing/notarization is not configured here; add it when preparing public releases.

## Linux (AppImage)

Run on Linux:
- `npm install`
- `npm run pbs:check`
- `bash devtools/pbs/pbs-install-unix.sh linux-x64`
- `bash scripts/build_appimage_release.sh`

Output: `dist/appimage/ABCarus-x86_64.AppImage`
