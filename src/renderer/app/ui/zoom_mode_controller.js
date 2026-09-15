export function createZoomModeController({
  documentRef = typeof document !== "undefined" ? document : null,
  getSettings = () => ({}),
  getActivePane = () => "render",
  updateSettings = async () => null,
} = {}) {
  function readCssZoom(name, fallback = 1) {
    try {
      const raw = getComputedStyle(documentRef.documentElement).getPropertyValue(name);
      const value = Number(String(raw || "").trim());
      if (Number.isFinite(value) && value > 0) return value;
    } catch {}
    return fallback;
  }

  function visibleZoomPatch() {
    const settings = getSettings() || {};
    const editorBase = Number(settings.editorZoom) || 1;
    return {
      autoScalePanes: false,
      renderZoom: readCssZoom("--render-zoom", Number(settings.renderZoom) || 1),
      editorZoom: editorBase * readCssZoom("--editor-fit-zoom", 1),
    };
  }

  function zoomBy(delta) {
    const patch = visibleZoomPatch();
    if (getActivePane() === "editor") patch.editorZoom += delta;
    else patch.renderZoom += delta;
    return updateSettings(patch);
  }

  return {
    disableAutoScale: () => updateSettings(visibleZoomPatch()),
    resetAndEnableAutoScale: () => updateSettings({ autoScalePanes: true, renderZoom: 1, editorZoom: 1 }),
    visibleZoomPatch,
    zoomBy,
    zoomReset: () => updateSettings({ autoScalePanes: false, renderZoom: 1, editorZoom: 1 }),
  };
}
