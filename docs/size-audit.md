## Size audit (packaging)

### Build system (current)

Linux shipping uses a custom AppImage build:
- AppDir assembly: `scripts/build_appimage.sh`
- AppImage packaging: `deploy.sh` (invokes `npm run appimage` and `appimagetool`)

### What we exclude from packaged output (Linux AppImage)

To reduce AppImage size, the AppImage builder now excludes non-runtime content when copying the repo into `resources/app`:
- `docs/**`
- `devtools/**`
- `scripts/**`
- `docs/qa/chat-exports/**`
- `third_party/python-runtime/**` (runtime is copied into AppDir `usr/` instead)
- `third_party/python-embed/**` (bundled runtime is copied into AppDir `usr/` instead)
- root `*.md`

Runtime-critical directories remain included, e.g.:
- `src/**`
- `assets/**`
- `third_party/**` (except runtime folders above)

### AppImage Python scripts bundling

The AppImage build copies only the Python tool scripts that ABCarus executes:
- `third_party/abc2xml/**`
- `third_party/xml2abc/**`

It intentionally does not scan/copy bundled runtimes (e.g. `third_party/python-runtime/**`) into `usr/share/abcarus`, to avoid duplication and unnecessary size.

### Known size drivers

In practice the largest components are:
- Electron runtime (dominant)
- Bundled Python runtime (when present)
- Soundfonts and third-party render/playback assets

### Local inspection

Use `devtools/size_report.js` to print the top-N largest files/directories:
- `node devtools/size_report.js dist/appimage/AppDir`
