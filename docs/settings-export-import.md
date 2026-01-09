# Settings Export/Import (offline, portable)

ABCarus is intentionally offline: no cloud accounts and no network sync.
To make your setup portable (SciTE-style), use the built-in **Export Settings** / **Import Settings** commands.

## Files

Export creates:
- `abcarus.properties` — app settings (key/value), suitable for versioning and manual edits.
- `user_settings.abc` — your user header layer (if present), copied alongside the properties file.

Import reads:
- `abcarus.properties`
- and optionally `user_settings.abc` if it is in the same folder.

## Optional: attach a canonical settings file

By default, ABCarus keeps settings internally (under the OS profile).

When you **Export Settings…** (or **Import Settings…**), the selected `abcarus.properties` becomes the **canonical**
settings source of truth on the next start.

If you later edit the canonical file externally, ABCarus will pick it up on the next start and also when the app
regains focus (best-effort, without background watchers).

If the canonical file disappears, ABCarus falls back to the last internal snapshot and continues to work.

## Where settings live by default

ABCarus also keeps its live state under the OS user profile (`app.getPath('userData')`).
Uninstall behavior differs by OS/installer, so **Export Settings** is the reliable way to preserve your configuration.

Tip: the userData folder can be opened via **Help → Open Settings Folder**.
