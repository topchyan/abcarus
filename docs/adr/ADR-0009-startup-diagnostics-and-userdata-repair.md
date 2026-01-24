ADR-0009 — Startup Diagnostics & userData Repair (Chromium Storage)

Date: 2026-01-24  
Status: Accepted

## Context

ABCarus is an Electron app. Electron embeds Chromium, which maintains browser storage databases under `app.getPath("userData")`
(e.g., Service Worker storage, CacheStorage, code cache).

We observed a class of “startup regressions” that were not caused by ABCarus code:
- multi-second startup delays (blank/white window before UI becomes responsive),
- Chromium errors such as `Failed to delete the database: Database IO error`,
- the issue disappearing after cleaning Chromium storage folders under `userData`.

Without a defined playbook, we wasted significant time debugging application code when the root cause was local profile corruption/locks.

## Decision

### 1) Treat Chromium storage errors as a first-class startup triage path

When startup becomes slow and Chromium logs mention database I/O issues, **do not** assume a code regression first.

Perform an A/B check:
- Launch with current `userData`.
- Launch with a fresh temporary `userData` (or after cleaning only safe cache folders).

If the fresh profile is fast, treat the issue as `userData` corruption/locks.

### 2) Safe repair procedure (keep ABCarus state; reset Chromium caches)

Allowed repair actions (safe to regenerate):
- delete `Service Worker/Database`
- delete `Service Worker/CacheStorage`
- delete `Service Worker/ScriptCache`
- delete `Code Cache`

Must preserve (do not delete without explicit user intent):
- `state.json`
- `user_settings.abc`
- `abcarus.properties` (if present)
- `fonts/`
- `templates/`
- any user-created data files

### 3) Escalation

If the error returns after cleaning:
- check filesystem permissions/ownership for `userData`
- check OS logs (e.g., `dmesg`) for disk/filesystem I/O errors
- consider hardware/FS issues rather than app code

## Consequences

Positive:
- Faster diagnosis of “slow startup” incidents.
- Reduces false attribution to renderer/main-process changes.
- Provides a safe, repeatable remediation that does not destroy ABCarus data.

Trade-offs:
- Requires discipline to run the A/B check before deep code investigation.
- Cleaning caches may remove Chromium-side artifacts (acceptable).

## Implementation notes (non-normative)

- Linux `userData` commonly lives under `~/.config/<appName>` in dev; verify by checking the running process argument `--user-data-dir=...`
  or via `Help → Open Settings Folder`.
