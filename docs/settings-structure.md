## Settings structure

### Goals

- Keep settings intuitive for users and maintainable for developers.
- Preserve tolerant-read / strict-write: unknown keys must be tolerated; writes must be validated and normalized.

### Source of truth

Settings schema lives in `src/main/settings_schema.js` and defines:
- key
- type
- default
- section
- (optional) label/help
- (optional) UI rendering hints (`ui`)
- (optional) `advanced` / `legacy` flags

Main process persists and normalizes settings in `src/main/index.js` (`updateSettings()`).

Renderer Settings modal is generated from the schema in `src/renderer/settings.js`.

### Adding a new setting

1. Add an entry to `src/main/settings_schema.js`.
2. If the setting needs validation/normalization, update `updateSettings()` in `src/main/index.js`.
3. If the setting should appear in the Settings modal:
   - add a `label` (and optional `help`)
   - add `ui` with an `input` type (`checkbox`, `text`, `number`, `percent`, `code`, `drumVelocityMap`)
   - decide whether it is `advanced`
4. If the setting is controlled outside the modal (e.g. toolbar), omit `ui`.

### Backward compatibility rules

- Do not rename keys. If you must, implement a migration that reads old keys and writes the new one while preserving behavior.
- Unknown keys in persisted settings must not be deleted automatically.
- Prefer conservative behavior: refuse risky transforms rather than silently corrupting user data.

