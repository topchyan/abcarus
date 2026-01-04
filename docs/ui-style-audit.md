## UI style audit

### Focus

This pass standardizes styling across:
- Toolbar buttons and separators
- Settings controls
- Context menus (custom HTML menus)

Native OS menus (Electron application menu) cannot be styled and are excluded.

### Changes made

- Introduced a minimal token layer (CSS variables) in `src/renderer/style.css` for:
  - UI typography (`--font-family-ui`, `--font-size-ui`, `--line-height-ui`)
  - spacing (`--space-*`)
  - radii, borders, colors, shadows, focus ring
- Updated context menu styling to use the same tokens as the rest of the UI:
  - consistent font, padding, radius, border, shadow, hover background
- Standardized focus styling via `:focus-visible` across buttons/inputs/selects/textarea.

