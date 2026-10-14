# Renderer CSS modules

The numeric filename prefixes define the renderer cascade order. These files
are the canonical CSS sources. `npm run styles:build` concatenates them into
the single runtime stylesheet `src/renderer/style.css`; the application loads
that bundle before `library_modal.css` to avoid partial-layout frames during
startup.

The initial modules are contiguous slices of the former monolithic
`style.css`. Their names identify the dominant responsibility in each slice;
some shared or late override rules intentionally remain outside a strict
component boundary to preserve cascade behavior.

When adding or moving a rule:

- prefer the module that owns the affected UI;
- preserve intentional late overrides in `12-responsive-print-overrides.css`;
- remember that asset URLs are relative to this directory;
- run `npm run styles:build` after every module edit;
- run `npm run -s test:renderer-build` and the visual baseline runner before
  changing module order or moving existing rules between modules. The build
  check fails when the runtime bundle is stale.
