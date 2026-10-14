## UI style guide

### Tokens

Global UI tokens live in `src/renderer/styles/01-foundation.css` under `:root`.

Renderer styles are authored as the ordered modules `src/renderer/styles/01-*.css`
through `12-*.css`. The numeric prefix is part of the cascade contract; add new
rules to the owning module without reordering them. Run `npm run styles:build`
to regenerate the single `src/renderer/style.css` runtime bundle.

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

### Dialogs

Treat the three dialog categories separately:

- Native Electron dialogs use operating-system controls and conventions.
- Blocking in-app dialogs use `.modal`, `.modal-card`, `.modal-header`, `.modal-body`, and `.modal-footer`.
- Non-blocking tool panels and popovers keep their own compact controls and do not use a modal footer.

ABC helper popovers use the shared `.abc-helper-popover`, `.abc-helper-header`,
and `.abc-helper-body` surface classes. Their domain-specific fields may differ,
but they must not introduce independent colors, shadows, typography, or button styles.

Blocking in-app dialogs must follow these rules:

- Put one 32px symbol-only close button (`.modal-close`) at the top right.
- Close, Escape, and Cancel must have the same non-committing behavior.
- Do not close a dialog when the user clicks its backdrop. This prevents accidental loss of form state.
- Put utility actions in `.modal-footer-left`; put Cancel before the primary action on the right.
- Use `aria-modal="true"` and an accessible dialog label.

### Application menu

- Let Electron render accelerators in the native shortcut column. Do not repeat shortcuts in item labels.
- Let the operating system determine native menu dimensions. Group infrequent checkbox options in a submenu when their checkmark column would make the primary menu inconsistent.
- Keep document lifecycle, import/export, and printing in File.
- Keep display-only actions in View, playback modes in Play, and transformations/workflows in Tools.
- Add shortcuts only to frequent, stable commands. A menu item without a shortcut is valid.

### Toolbar

- Keep the top toolbar focused on frequent file, transport, input/playback-mode, and view actions.
- Put document modes such as Raw next to the active document/tune controls.
- Keep Settings available from the toolbar. It reopens the last-used section; the native Fonts command may still open the Fonts section directly.
- Use `aria-pressed` and the shared active style for persistent toggle buttons.
