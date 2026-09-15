function clampRatio(value, fallback = 0.5) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0.1, Math.min(0.9, v));
}

const SPLIT_MODES = [
  "vertical-editor-left",
  "vertical-score-left",
  "horizontal-editor-top",
  "horizontal-score-top",
];

const SPLIT_MODE_LABELS = {
  "vertical-editor-left": "Editor left - Score right",
  "vertical-score-left": "Score left - Editor right",
  "horizontal-editor-top": "Editor top - Score bottom",
  "horizontal-score-top": "Score top - Editor bottom",
};

function normalizeSplitMode(value) {
  return SPLIT_MODES.includes(value) ? value : null;
}

function splitOrientationForMode(mode) {
  return String(mode || "").startsWith("horizontal-") ? "horizontal" : "vertical";
}

function defaultSplitModeForOrientation(orientation) {
  return orientation === "horizontal" ? "horizontal-score-top" : "vertical-editor-left";
}

export function firstPaneRoleForMode(mode) {
  return mode === "vertical-score-left" || mode === "horizontal-score-top" ? "score" : "editor";
}

export function defaultFirstPaneRatioForMode(mode) {
  if (mode === "horizontal-editor-top") return 0.38;
  if (mode === "horizontal-score-top") return 0.62;
  if (mode === "vertical-score-left") return 0.56;
  return 0.44;
}

export function createLayoutController({
  main,
  divider,
  sidebar,
  rightSplit,
  splitDivider,
  editorPane,
  renderPane,
  output,
  sidebarBody,
  sidebarSplit,
  errorPane,
  libraryTree,
  toggleSplitButton,
  autoFitButton,
  splitModeButtons = [],
  minPaneWidth = 220,
  minRightPaneWidth = 220,
  minRightPaneHeight = 180,
  minErrorPaneHeight = 120,
  useErrorOverlay = true,
  getLibraryVisible = () => false,
  getSetListVisible = () => false,
  getSetListPaneWidth = () => 300,
  setListDividerWidth = 6,
  getLatestSettings = () => null,
  isNormalModeForSplitToggle = () => true,
  isRawMode = () => false,
  getSidebarWidth = () => 280,
  setSidebarWidth = () => {},
  saveLibraryPrefs = () => {},
  saveLayoutPrefs = async () => {},
  showToast = () => {},
  getEditorText = () => "",
  requestEditorMeasure = () => {},
} = {}) {
  let rightSplitMode = "vertical-editor-left";
  let rightSplitOrientation = "vertical";
  let rightSplitRatioVertical = 0.5;
  let rightSplitRatioHorizontal = 0.5;
  let layoutPrefsSaveTimer = null;
  let pendingLayoutPrefsPatch = null;
  let adaptiveFitFrame = null;
  let adaptiveResizeObserver = null;
  const adaptivePaneWidths = new WeakMap();
  const layoutPrefsSaveDebounceMs = 300;
  const requestFrame = (callback) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }
    return setTimeout(callback, 0);
  };

  const scheduleSaveLayoutPrefs = (patch) => {
    if (!patch || typeof patch !== "object") return;
    pendingLayoutPrefsPatch = { ...(pendingLayoutPrefsPatch || {}), ...patch };
    if (layoutPrefsSaveTimer) clearTimeout(layoutPrefsSaveTimer);
    layoutPrefsSaveTimer = setTimeout(async () => {
      const nextPatch = pendingLayoutPrefsPatch;
      pendingLayoutPrefsPatch = null;
      layoutPrefsSaveTimer = null;
      if (!nextPatch) return;
      try { await saveLayoutPrefs(nextPatch); } catch {}
    }, layoutPrefsSaveDebounceMs);
  };

  const setPaneSizes = (leftWidth) => {
    if (!main || !divider || !sidebar) return;
    const total = main.clientWidth;
    const dividerWidth = divider.offsetWidth || 6;
    const setListVisible = Boolean(getSetListVisible());
    const setListPaneWidth = Math.max(220, Number(getSetListPaneWidth()) || 300);
    const setListOccupied = setListVisible ? setListPaneWidth + setListDividerWidth : 0;
    const available = Math.max(0, total - dividerWidth - setListOccupied);
    const min = Math.min(minPaneWidth, Math.max(0, available / 2));
    const clamped = Math.max(min, Math.min(leftWidth, available - min));
    setSidebarWidth(clamped);
    main.style.gridTemplateColumns = setListVisible
      ? `${clamped}px ${dividerWidth}px ${setListPaneWidth}px ${setListDividerWidth}px 1fr`
      : `${clamped}px ${dividerWidth}px 0px 0px 1fr`;
    if (getLibraryVisible()) {
      saveLibraryPrefs({ libraryPaneWidth: Math.round(clamped) });
    }
  };

  const initPaneResizer = () => {
    if (!main || !divider || !sidebar) return;
    divider.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      divider.setPointerCapture(e.pointerId);
      const startLeft = sidebar.getBoundingClientRect().width;
      const startX = e.clientX;
      const onMove = (ev) => setPaneSizes(startLeft + (ev.clientX - startX));
      const onUp = () => {
        divider.releasePointerCapture(e.pointerId);
        divider.removeEventListener("pointermove", onMove);
        divider.removeEventListener("pointerup", onUp);
        divider.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("resizing");
      };
      document.body.classList.add("resizing");
      divider.addEventListener("pointermove", onMove);
      divider.addEventListener("pointerup", onUp);
      divider.addEventListener("pointercancel", onUp);
    });
    window.addEventListener("resize", () => {
      if (!getLibraryVisible()) return;
      setPaneSizes(sidebar.getBoundingClientRect().width);
    });
  };

  const applyRightSplitMode = (nextMode) => {
    const normalized = normalizeSplitMode(nextMode) || "vertical-editor-left";
    rightSplitMode = normalized;
    rightSplitOrientation = splitOrientationForMode(normalized);
    document.body.classList.toggle("right-split-horizontal", rightSplitOrientation === "horizontal");
    for (const mode of SPLIT_MODES) {
      document.body.classList.toggle(`right-split-mode-${mode}`, mode === normalized);
    }
    if (splitDivider) {
      splitDivider.setAttribute("aria-orientation", rightSplitOrientation === "horizontal" ? "horizontal" : "vertical");
    }
    if (toggleSplitButton) {
      toggleSplitButton.classList.toggle("toggle-active", normalized !== "vertical-editor-left");
      toggleSplitButton.setAttribute("aria-pressed", normalized === "vertical-editor-left" ? "false" : "true");
      toggleSplitButton.title = `Cycle split layout (Ctrl+Alt+\\) - ${SPLIT_MODE_LABELS[normalized]}`;
    }
    for (const button of splitModeButtons) {
      if (!button) continue;
      const active = button.dataset && button.dataset.splitMode === normalized;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
    }
  };

  const applyRightSplitOrientation = (next) => {
    applyRightSplitMode(defaultSplitModeForOrientation(next === "horizontal" ? "horizontal" : "vertical"));
  };

  const applyRightSplitSizesFromRatio = ({ rawMode = false } = {}) => {
    if (!rightSplit || !splitDivider || !editorPane) return;
    if (rawMode) {
      rightSplit.style.gridTemplateColumns = "1fr";
      rightSplit.style.gridTemplateRows = "1fr";
      return;
    }
    const dividerSize = (rightSplitOrientation === "horizontal")
      ? (splitDivider.offsetHeight || 6)
      : (splitDivider.offsetWidth || 6);

    if (rightSplitOrientation === "horizontal") {
      const total = rightSplit.clientHeight;
      const min = Math.min(minRightPaneHeight, Math.max(0, (total - dividerSize) / 2));
      const ratio = clampRatio(rightSplitRatioHorizontal, 0.5);
      const wanted = (total - dividerSize) * ratio;
      const clamped = Math.max(min, Math.min(wanted, total - min - dividerSize));
      rightSplit.style.gridTemplateColumns = "1fr";
      rightSplit.style.gridTemplateRows = `${Math.round(clamped)}px ${dividerSize}px 1fr`;
    } else {
      const total = rightSplit.clientWidth;
      const min = Math.min(minRightPaneWidth, Math.max(0, (total - dividerSize) / 2));
      const ratio = clampRatio(rightSplitRatioVertical, 0.5);
      const wanted = (total - dividerSize) * ratio;
      const clamped = Math.max(min, Math.min(wanted, total - min - dividerSize));
      rightSplit.style.gridTemplateRows = "1fr";
      rightSplit.style.gridTemplateColumns = `${Math.round(clamped)}px ${dividerSize}px 1fr`;
    }
  };

  const setRightPaneSizes = (leftWidth, { rawMode = false } = {}) => {
    if (!rightSplit || !splitDivider || !renderPane || !editorPane) return;
    if (rawMode) {
      rightSplit.style.gridTemplateColumns = "1fr";
      rightSplit.style.gridTemplateRows = "1fr";
      return;
    }
    if (rightSplitOrientation === "horizontal") {
      const total = rightSplit.clientHeight;
      const dividerHeight = splitDivider.offsetHeight || 6;
      const min = Math.min(minRightPaneHeight, Math.max(0, (total - dividerHeight) / 2));
      const clamped = Math.max(min, Math.min(leftWidth, total - min - dividerHeight));
      rightSplitRatioHorizontal = clampRatio((total - dividerHeight) ? (clamped / (total - dividerHeight)) : rightSplitRatioHorizontal, rightSplitRatioHorizontal);
      rightSplit.style.gridTemplateColumns = "1fr";
      rightSplit.style.gridTemplateRows = `${Math.round(clamped)}px ${dividerHeight}px 1fr`;
      scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
    } else {
      const total = rightSplit.clientWidth;
      const dividerWidth = splitDivider.offsetWidth || 6;
      const min = Math.min(minRightPaneWidth, Math.max(0, (total - dividerWidth) / 2));
      const clamped = Math.max(min, Math.min(leftWidth, total - min - dividerWidth));
      rightSplitRatioVertical = clampRatio((total - dividerWidth) ? (clamped / (total - dividerWidth)) : rightSplitRatioVertical, rightSplitRatioVertical);
      rightSplit.style.gridTemplateRows = "1fr";
      rightSplit.style.gridTemplateColumns = `${Math.round(clamped)}px ${dividerWidth}px 1fr`;
      scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
    }
  };

  const initRightPaneResizer = ({ isRawMode = () => false } = {}) => {
    if (!rightSplit || !splitDivider || !renderPane || !editorPane) return;
    splitDivider.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      splitDivider.setPointerCapture(e.pointerId);
      const firstPane = firstPaneRoleForMode(rightSplitMode) === "score" ? renderPane : editorPane;
      const startRect = firstPane.getBoundingClientRect();
      const startSize = (rightSplitOrientation === "horizontal") ? startRect.height : startRect.width;
      const startPos = (rightSplitOrientation === "horizontal") ? e.clientY : e.clientX;
      const onMove = (ev) => {
        const delta = (rightSplitOrientation === "horizontal") ? (ev.clientY - startPos) : (ev.clientX - startPos);
        setRightPaneSizes(startSize + delta, { rawMode: Boolean(isRawMode()) });
      };
      const onUp = () => {
        splitDivider.releasePointerCapture(e.pointerId);
        splitDivider.removeEventListener("pointermove", onMove);
        splitDivider.removeEventListener("pointerup", onUp);
        splitDivider.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("resizing-cols");
        document.body.classList.remove("resizing-rows");
      };
      if (rightSplitOrientation === "horizontal") document.body.classList.add("resizing-rows");
      else document.body.classList.add("resizing-cols");
      splitDivider.addEventListener("pointermove", onMove);
      splitDivider.addEventListener("pointerup", onUp);
      splitDivider.addEventListener("pointercancel", onUp);
    });
    window.addEventListener("resize", () => {
      if (isRawMode()) {
        rightSplit.style.gridTemplateColumns = "1fr";
        rightSplit.style.gridTemplateRows = "1fr";
        return;
      }
      applyRightSplitSizesFromRatio();
    });
  };

  const resetRightPaneSplit = () => {
    if (!rightSplit) return;
    if (splitDivider) {
      if (rightSplitOrientation === "horizontal") {
        rightSplitRatioHorizontal = 0.5;
        scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
      } else {
        rightSplitRatioVertical = 0.5;
        scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
      }
    }
    applyRightSplitSizesFromRatio();
  };

  const applyScoreFitNow = ({ fitScore = true, resetScroll = true, persist = true, tolerance = 0 } = {}) => {
    if (fitScore && !isRawMode()) {
      const current = readRenderZoom();
      const fit = computeFocusFitZoom({ currentZoom: current });
      const relativeChange = Number.isFinite(current) && current > 0 ? Math.abs(fit - current) / current : Infinity;
      if (Number.isFinite(fit) && fit > 0 && relativeChange > tolerance) {
        setRenderZoom(fit);
        const orientationZoomKey = rightSplitOrientation === "horizontal"
          ? "layoutRenderZoomHorizontal"
          : "layoutRenderZoomVertical";
        if (persist) scheduleSaveLayoutPrefs({ renderZoom: fit, [orientationZoomKey]: fit });
      }
    }
    if (resetScroll && renderPane) {
      if (typeof renderPane.scrollTo === "function") renderPane.scrollTo({ top: 0, left: 0 });
      else {
        renderPane.scrollTop = 0;
        renderPane.scrollLeft = 0;
      }
    }
  };

  const fitScoreToCurrentPane = (options = {}) => {
    requestFrame(() => requestFrame(() => applyScoreFitNow(options)));
  };

  const resetView = ({ fitScore = true, resetScroll = true } = {}) => {
    const defaultRatio = defaultFirstPaneRatioForMode(rightSplitMode);
    if (rightSplitOrientation === "horizontal") {
      rightSplitRatioHorizontal = defaultRatio;
      scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
    } else {
      rightSplitRatioVertical = defaultRatio;
      scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
    }
    applyRightSplitSizesFromRatio({ rawMode: Boolean(isRawMode()) });
    fitScoreToCurrentPane({ fitScore, resetScroll });
  };

  const setSidebarSplitSizes = (topHeight) => {
    if (useErrorOverlay) return;
    if (!sidebarBody || !sidebarSplit || !errorPane || !libraryTree) return;
    const total = sidebarBody.clientHeight;
    const dividerHeight = sidebarSplit.offsetHeight || 6;
    const min = Math.min(minErrorPaneHeight, Math.max(0, (total - dividerHeight) / 2));
    const clamped = Math.max(min, Math.min(topHeight, total - min - dividerHeight));
    sidebarBody.style.gridTemplateRows = `${clamped}px ${dividerHeight}px 1fr`;
  };

  const initSidebarResizer = () => {
    if (useErrorOverlay) return;
    if (!sidebarBody || !sidebarSplit || !errorPane || !libraryTree || !sidebar) return;
    sidebarSplit.addEventListener("pointerdown", (e) => {
      if (!sidebar.classList.contains("has-errors")) return;
      e.preventDefault();
      sidebarSplit.setPointerCapture(e.pointerId);
      const startTop = libraryTree.getBoundingClientRect().height;
      const startY = e.clientY;
      const onMove = (ev) => setSidebarSplitSizes(startTop + (ev.clientY - startY));
      const onUp = () => {
        sidebarSplit.releasePointerCapture(e.pointerId);
        sidebarSplit.removeEventListener("pointermove", onMove);
        sidebarSplit.removeEventListener("pointerup", onUp);
        sidebarSplit.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("resizing-rows");
      };
      document.body.classList.add("resizing-rows");
      sidebarSplit.addEventListener("pointermove", onMove);
      sidebarSplit.addEventListener("pointerup", onUp);
      sidebarSplit.addEventListener("pointercancel", onUp);
    });
    window.addEventListener("resize", () => {
      if (!sidebar.classList.contains("has-errors")) return;
      setSidebarSplitSizes(libraryTree.getBoundingClientRect().height);
    });
  };

  const setFromSettings = (settings) => {
    if (!settings || typeof settings !== "object") return;
    rightSplitRatioVertical = clampRatio(settings.layoutSplitRatioVertical, rightSplitRatioVertical);
    rightSplitRatioHorizontal = clampRatio(settings.layoutSplitRatioHorizontal, rightSplitRatioHorizontal);
    const savedMode = normalizeSplitMode(settings.layoutSplitMode)
      || defaultSplitModeForOrientation(settings.layoutSplitOrientation === "horizontal" ? "horizontal" : "vertical");
    const autoScaleEnabled = settings.autoScalePanes !== false;
    // Older Auto Fit resets stored the leading-track ratio without accounting for reversed pane order.
    if (autoScaleEnabled && savedMode === "horizontal-editor-top" && Math.abs(rightSplitRatioHorizontal - 0.62) < 0.001) {
      rightSplitRatioHorizontal = defaultFirstPaneRatioForMode(savedMode);
      scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
    }
    if (autoScaleEnabled && savedMode === "vertical-score-left" && Math.abs(rightSplitRatioVertical - 0.44) < 0.001) {
      rightSplitRatioVertical = defaultFirstPaneRatioForMode(savedMode);
      scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
    }
    applyRightSplitMode(savedMode);
    applyRightSplitSizesFromRatio();
    updateAutoFitButton(autoScaleEnabled);
    if (!autoScaleEnabled) setEditorFitZoom(1);
    else scheduleAdaptiveFit();
  };

  const updateAutoFitButton = (enabled) => {
    if (!autoFitButton) return;
    const active = Boolean(enabled);
    autoFitButton.classList.toggle("toggle-active", active);
    autoFitButton.setAttribute("aria-pressed", active ? "true" : "false");
    const label = autoFitButton.querySelector(".btn-text");
    if (label) label.textContent = active ? "Auto fit" : "Reset view";
    autoFitButton.title = active
      ? "Auto fit is on. Click to keep the current zoom and switch to manual zoom (F8)"
      : "Reset view and enable Auto fit (F8)";
    autoFitButton.setAttribute("aria-label", active ? "Disable automatic fit" : "Reset view and enable automatic fit");
  };

  const setRenderZoom = (zoom) => {
    const v = Number(zoom);
    if (!Number.isFinite(v) || v <= 0) return;
    try { document.documentElement.style.setProperty("--render-zoom", String(v)); } catch {}
  };

  const setEditorFitZoom = (zoom) => {
    const v = Number(zoom);
    if (!Number.isFinite(v) || v <= 0) return;
    try { document.documentElement.style.setProperty("--editor-fit-zoom", String(v)); } catch {}
    try { requestEditorMeasure(); } catch {}
  };

  const readEditorFitZoom = () => {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--editor-fit-zoom");
      const value = Number(String(raw || "").trim());
      if (Number.isFinite(value) && value > 0) return value;
    } catch {}
    return 1;
  };

  const computeEditorFitZoom = () => {
    if (!editorPane || typeof editorPane.querySelector !== "function") return 1;
    const content = editorPane.querySelector(".cm-content");
    const scroller = editorPane.querySelector(".cm-scroller");
    if (!content || !scroller || !(scroller.clientWidth > 40)) return 1;
    const text = String(getEditorText() || "");
    if (!text) return 1;
    let longest = "";
    for (const line of text.split(/\r\n|\n|\r/)) {
      if (line.length > longest.length) longest = line;
    }
    if (!longest) return 1;
    const gutters = editorPane.querySelector(".cm-gutters");
    const gutterWidth = gutters && typeof gutters.getBoundingClientRect === "function"
      ? gutters.getBoundingClientRect().width
      : 0;
    const available = Math.max(40, scroller.clientWidth - gutterWidth - 20);
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      const style = getComputedStyle(content);
      if (!context || !style) return 1;
      context.font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize || "13px"} ${style.fontFamily || "monospace"}`;
      const currentFit = readEditorFitZoom();
      const measured = context.measureText(longest.replace(/\t/g, "    ")).width;
      const intrinsic = measured / currentFit;
      if (!(intrinsic > 1)) return 1;
      return Math.max(0.5, Math.min(1, available / (intrinsic + 8)));
    } catch {
      return 1;
    }
  };

  const readRenderZoom = ({ fallback = 1 } = {}) => {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--render-zoom");
      const v = Number(String(raw || "").trim());
      if (Number.isFinite(v) && v > 0) return v;
    } catch {}
    return fallback;
  };

  const getRenderZoomFactor = () => {
    const cssZoom = readRenderZoom({ fallback: null });
    if (Number.isFinite(cssZoom) && cssZoom > 0) return cssZoom;
    try {
      if (output) {
        const raw = getComputedStyle(output).zoom;
        const value = Number(String(raw || "").trim());
        if (Number.isFinite(value) && value > 0) return value;
      }
    } catch {}
    const settings = getLatestSettings() || null;
    const fromSettings = settings && Number(settings.renderZoom);
    return Number.isFinite(fromSettings) && fromSettings > 0 ? fromSettings : 1;
  };

  const computeFocusFitZoom = ({ currentZoom = null, clamp = null, fitMode = null } = {}) => {
    if (!renderPane || !output) return null;
    const svgs = Array.from(output.querySelectorAll("svg"));
    if (!svgs.length) return null;
    const zoom = Number.isFinite(Number(currentZoom)) && Number(currentZoom) > 0
      ? Number(currentZoom)
      : readRenderZoom();
    if (!Number.isFinite(zoom) || zoom <= 0) return null;
    const paneWidth = renderPane.clientWidth || 0;
    if (paneWidth < 50) return null;

    const settings = getLatestSettings() || null;
    const mode = fitMode || (settings && settings.scoreFitMode === "page" ? "page" : "content");
    let maxIntrinsicWidth = 0;
    const limit = Math.min(8, svgs.length);
    for (let i = 0; i < limit; i += 1) {
      const r = svgs[i] ? svgs[i].getBoundingClientRect() : null;
      if (!(r && r.width > 10)) continue;
      let w = r.width / zoom;
      if (mode === "content" && typeof svgs[i].getBBox === "function") {
        try {
          const box = svgs[i].getBBox();
          const viewBox = svgs[i].viewBox && svgs[i].viewBox.baseVal;
          const viewWidth = viewBox && Number(viewBox.width);
          const contentRight = Math.max(0, Number(box.x) || 0) + Math.max(0, Number(box.width) || 0);
          if (viewWidth > 0 && contentRight > 10) w *= Math.min(1, contentRight / viewWidth);
        } catch {}
      }
      if (Number.isFinite(w) && w > maxIntrinsicWidth) maxIntrinsicWidth = w;
    }
    if (!Number.isFinite(maxIntrinsicWidth) || maxIntrinsicWidth <= 10) return null;
    let outputHorizontalPadding = 24;
    try {
      const outputStyle = getComputedStyle(output);
      const left = Number.parseFloat(outputStyle.paddingLeft || "0") || 0;
      const right = Number.parseFloat(outputStyle.paddingRight || "0") || 0;
      outputHorizontalPadding = left + right;
    } catch {}
    const target = Math.max(100, paneWidth);
    const next = target / (maxIntrinsicWidth + outputHorizontalPadding);
    return typeof clamp === "function" ? clamp(next, 0.5, 8, zoom) : Math.max(0.5, Math.min(8, next));
  };

  const fitEditorToCurrentPane = () => {
    const settings = getLatestSettings() || null;
    if (settings && settings.autoScalePanes === false) {
      setEditorFitZoom(1);
      return 1;
    }
    const fit = computeEditorFitZoom();
    const current = readEditorFitZoom();
    if (Math.abs(fit - current) / current > 0.003) setEditorFitZoom(fit);
    return fit;
  };

  const scheduleAdaptiveFit = ({ score = true, editor = true } = {}) => {
    const settings = getLatestSettings() || null;
    if (settings && settings.autoScalePanes === false) {
      setEditorFitZoom(1);
      return;
    }
    if (adaptiveFitFrame != null) return;
    adaptiveFitFrame = true;
    requestFrame(() => {
      adaptiveFitFrame = null;
      if (editor) fitEditorToCurrentPane();
      if (score && !isRawMode()) applyScoreFitNow({ resetScroll: false, persist: false, tolerance: 0.003 });
    });
  };

  const initAdaptiveFit = () => {
    if (typeof ResizeObserver !== "function") return false;
    if (adaptiveResizeObserver) return true;
    adaptiveResizeObserver = new ResizeObserver((entries = []) => {
      if (!entries.length) {
        scheduleAdaptiveFit();
        return;
      }
      let fitEditor = false;
      let fitScore = false;
      for (const entry of entries) {
        const target = entry && entry.target;
        if (!target) continue;
        const width = Number(entry.contentRect && entry.contentRect.width) || Number(target.clientWidth) || 0;
        const previous = adaptivePaneWidths.get(target);
        adaptivePaneWidths.set(target, width);
        if (Number.isFinite(previous) && Math.abs(width - previous) < 1) continue;
        if (target === editorPane) fitEditor = true;
        if (target === renderPane) fitScore = true;
      }
      if (fitEditor || fitScore) scheduleAdaptiveFit({ editor: fitEditor, score: fitScore });
    });
    if (editorPane) adaptiveResizeObserver.observe(editorPane);
    if (renderPane) adaptiveResizeObserver.observe(renderPane);
    scheduleAdaptiveFit();
    return true;
  };

  const setSplitOrientation = (nextOrientation, { persist = true, userAction = false } = {}) => {
    const next = defaultSplitModeForOrientation(nextOrientation === "horizontal" ? "horizontal" : "vertical");
    return setSplitMode(next, { persist, userAction });
  };

  const setSplitMode = (nextMode, { persist = true, userAction = false } = {}) => {
    const next = normalizeSplitMode(nextMode) || "vertical-editor-left";
    if (userAction && !isNormalModeForSplitToggle()) {
      showToast("Exit Focus/Raw mode to change split layout.", 2400);
      return false;
    }
    const currentMode = rightSplitMode;
    if (currentMode === next) return true;
    const currentOrientation = rightSplitOrientation;
    const nextOrientation = splitOrientationForMode(next);
    const settings = getLatestSettings() || null;
    const autoScaleEnabled = !settings || settings.autoScalePanes !== false;

    if (currentOrientation !== nextOrientation && autoScaleEnabled) {
      const defaultRatio = defaultFirstPaneRatioForMode(next);
      if (nextOrientation === "horizontal") {
        rightSplitRatioHorizontal = defaultRatio;
        if (persist) scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
      } else {
        rightSplitRatioVertical = defaultRatio;
        if (persist) scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
      }
    } else if (currentOrientation === nextOrientation && firstPaneRoleForMode(currentMode) !== firstPaneRoleForMode(next)) {
      if (nextOrientation === "horizontal") {
        rightSplitRatioHorizontal = 1 - rightSplitRatioHorizontal;
        if (persist) scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
      } else {
        rightSplitRatioVertical = 1 - rightSplitRatioVertical;
        if (persist) scheduleSaveLayoutPrefs({ layoutSplitRatioVertical: rightSplitRatioVertical });
      }
    }

    try {
      const currentZoom = readRenderZoom();
      if (Number.isFinite(currentZoom) && currentZoom > 0) {
        const key = (currentOrientation === "horizontal") ? "layoutRenderZoomHorizontal" : "layoutRenderZoomVertical";
        const prev = settings && settings[key] != null ? Number(settings[key]) : null;
        if (!Number.isFinite(prev) || Math.abs(prev - currentZoom) > 0.0001) {
          scheduleSaveLayoutPrefs({ [key]: currentZoom });
        }
      }
    } catch {}

    applyRightSplitMode(next);
    applyRightSplitSizesFromRatio({ rawMode: Boolean(isRawMode()) });

    try {
      const targetKey = (nextOrientation === "horizontal") ? "layoutRenderZoomHorizontal" : "layoutRenderZoomVertical";
      const desired = settings && settings[targetKey] != null ? Number(settings[targetKey]) : null;
      if (Number.isFinite(desired) && desired > 0) {
        setRenderZoom(desired);
        const current = settings && settings.renderZoom != null ? Number(settings.renderZoom) : null;
        if (!Number.isFinite(current) || Math.abs(current - desired) > 0.0001) {
          scheduleSaveLayoutPrefs({ renderZoom: desired });
        }
      }
    } catch {}

    if (persist) scheduleSaveLayoutPrefs({ layoutSplitMode: next, layoutSplitOrientation: nextOrientation });
    if (userAction) fitScoreToCurrentPane({ resetScroll: false });
    showToast(`Split: ${SPLIT_MODE_LABELS[next]}`, 1500);
    return true;
  };

  const toggleSplitOrientation = ({ userAction = false } = {}) => {
    const currentIndex = SPLIT_MODES.indexOf(rightSplitMode);
    const next = SPLIT_MODES[(currentIndex + 1) % SPLIT_MODES.length];
    return setSplitMode(next, { persist: true, userAction });
  };

  return {
    applyRightSplitOrientation,
    applyRightSplitMode,
    applyRightSplitSizesFromRatio,
    getRightSplitOrientation: () => rightSplitOrientation,
    getRightSplitMode: () => rightSplitMode,
    getSidebarWidth,
    fitScoreToCurrentPane,
    fitEditorToCurrentPane,
    initAdaptiveFit,
    initPaneResizer,
    initRightPaneResizer,
    initSidebarResizer,
    resetRightPaneSplit,
    resetView,
    computeFocusFitZoom,
    getRenderZoomFactor,
    readRenderZoom,
    scheduleAdaptiveFit,
    scheduleSaveLayoutPrefs,
    setFromSettings,
    setPaneSizes,
    setRenderZoom,
    setRightPaneSizes,
    setSidebarSplitSizes,
    setSplitOrientation,
    setSplitMode,
    toggleSplitOrientation,
  };
}
