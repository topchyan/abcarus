const rendererStyleModulePaths = [
  "src/renderer/styles/01-foundation.css",
  "src/renderer/styles/02-header-status.css",
  "src/renderer/styles/03-workspace-controls.css",
  "src/renderer/styles/04-library-tree.css",
  "src/renderer/styles/05-editor-layout.css",
  "src/renderer/styles/06-score.css",
  "src/renderer/styles/07-statusbar-playback.css",
  "src/renderer/styles/08-tools.css",
  "src/renderer/styles/09-modals.css",
  "src/renderer/styles/10-set-list.css",
  "src/renderer/styles/11-settings.css",
  "src/renderer/styles/12-responsive-print-overrides.css",
];

function buildRendererStyleBundle(moduleSources) {
  return moduleSources.join("").replaceAll('url("../../../', 'url("../../');
}

export {
  buildRendererStyleBundle,
  rendererStyleModulePaths,
};
