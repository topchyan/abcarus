# Python build-standalone (PBS)

ABCarus bundles a portable Python runtime to run MusicXML import/export tools:
- `third_party/abc2xml/abc2xml.py`
- `third_party/xml2abc/xml2abc.py`

## Why PBS (instead of system Python)

- Deterministic builds: Python version is pinned by a committed lock file.
- Portability: end users do not need to install Python.
- Repeatability: the same runtime can be installed by contributors and CI.

## Policy

- The Python version baseline is **3.11** across platforms.
- Lock files are committed (deterministic).
- Download cache and extracted runtime files are not committed.
- System Python is **disabled by default**. It can be enabled explicitly with:
  - `ABCARUS_ALLOW_SYSTEM_PYTHON=1`

## Folder convention

```
third_party/
  python-embed/
    .cache/python-build-standalone/               (not committed)
    linux-x64/
      python-build-standalone.lock.json           (committed)
    darwin-x64/
      python-build-standalone.lock.json           (committed)
    darwin-arm64/
      python-build-standalone.lock.json           (committed)
    win-x64/
      python-build-standalone.lock.json           (committed)
```

## Update lock (pin a release)

Linux/macOS:
- `node devtools/pbs/pbs-update-lock.mjs --platform=linux-x64`
- `node devtools/pbs/pbs-update-lock.mjs --platform=darwin-x64`
- `node devtools/pbs/pbs-update-lock.mjs --platform=darwin-arm64`

Windows:
- `node devtools/pbs/pbs-update-lock.mjs --platform=win-x64`

Convenience wrappers:
- Unix: `bash devtools/pbs/pbs-update-all.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File devtools/pbs/pbs-update-all.ps1`

## Install runtime (from lock)

Linux/macOS:
- `bash devtools/pbs/pbs-install-unix.sh linux-x64`
- `bash devtools/pbs/pbs-install-unix.sh darwin-x64`
- `bash devtools/pbs/pbs-install-unix.sh darwin-arm64`

Windows:
- `powershell -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-windows.ps1 -Platform win-x64`

Convenience wrappers:
- Unix: `bash devtools/pbs/pbs-install-all.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-all.ps1`

## Lock sanity check

To verify that required lock files are present and well-formed:
- `npm run pbs:check`

## Legacy Windows runtime (note)

The legacy python.org embeddable runtime is intentionally not tracked in git (it is large).
If you still have it locally, keep it under `third_party/python-embed/win-x64-legacy/` for the transition period.
