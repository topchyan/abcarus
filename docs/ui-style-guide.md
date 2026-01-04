## UI style guide

### Tokens

Global UI tokens live in `src/renderer/style.css` under `:root`.

Core tokens:
- Typography: `--font-family-ui`, `--font-size-ui`, `--line-height-ui`
- Spacing scale: `--space-1` … `--space-4`
- Shape: `--radius-1`, `--radius-2`
- Surfaces: `--bg`, `--panel-bg`
- Text: `--text`, `--muted-text`
- Borders/shadows: `--border-color`, `--shadow-md`
- Interaction: `--hover-bg`, `--active-bg`, `--focus-ring`

### Rules

- Prefer tokens over hard-coded values in new UI.
- Use `:focus-visible` styles (already standardized) rather than per-component focus hacks.
- Keep context menus, popovers, and modal surfaces consistent with `--panel-bg`, `--border-color`, `--radius-*`, and `--shadow-*`.

