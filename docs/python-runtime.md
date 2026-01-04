## Bundled Python runtime (import/export)

ABCarus can run the import/export tools (`xml2abc`, `abc2xml`) using either:
- a bundled Python runtime shipped with the app (preferred), or
- system Python (`python3` / `python`) as a fallback.

This is intentionally “tolerant-read / strict-write”: if Python is unavailable, the app should refuse import/export clearly rather than guessing.

### Folder convention (dev + packaged)

Place an embeddable/runtime Python distribution in:

`third_party/python-embed/<platform-arch>/`

Supported `platform-arch` values:
- `win-x64`
- `darwin-x64`
- `darwin-arm64`
- `linux-x64`

Expected executable names:
- Windows: `python.exe` (optionally `python3.exe`)
- macOS/Linux: `python3` (optionally `python`)

These folders are gitignored in development. They are expected to be shipped via `app.asar.unpacked` in packaged builds.

### Resolution order

At runtime, ABCarus resolves Python in this order:
1. Linux AppImage: `${APPDIR}/usr/bin/python3` (if present)
2. Packaged app: `<resources>/app.asar.unpacked/third_party/python-embed/<platform-arch>/<python>`
3. Dev tree: `<repo>/third_party/python-embed/<platform-arch>/<python>`
4. System fallback:
   - Linux/macOS: `python3`, then `python`
   - Windows: `python`

### Environment for bundled runtimes

When executing a bundled runtime, ABCarus sets:
- `PYTHONUTF8=1`
- `PYTHONIOENCODING=utf-8`
- `PYTHONHOME=<runtime dir>` (only for bundled runtimes)

System Python is not forced to use `PYTHONHOME`.

### AppImage note

The AppImage build bundles the runtime into the AppDir under `usr/` so it can be executed via `${APPDIR}/usr/bin/python3`. This is independent of the dev convention above.

