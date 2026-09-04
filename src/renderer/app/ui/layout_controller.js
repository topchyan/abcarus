function clampRatio(value, fallback = 0.5) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0.1, Math.min(0.9, v));
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
} = {}) {
  let rightSplitOrientation = "vertical";
  let rightSplitRatioVertical = 0.5;
  let rightSplitRatioHorizontal = 0.5;
  let layoutPrefsSaveTimer = null;
  let pendingLayoutPrefsPatch = null;
  const layoutPrefsSaveDebounceMs = 300;
  const defaultVerticalEditorRatio = 0.44;
  const defaultHorizontalScoreRatio = 0.62;
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

  const applyRightSplitOrientation = (next) => {
    const normalized = (next === "horizontal") ? "horizontal" : "vertical";
    rightSplitOrientation = normalized;
    document.body.classList.toggle("right-split-horizontal", normalized === "horizontal");
    if (splitDivider) {
      splitDivider.setAttribute("aria-orientation", normalized === "horizontal" ? "horizontal" : "vertical");
    }
    if (toggleSplitButton) {
      toggleSplitButton.classList.toggle("toggle-active", normalized === "horizontal");
      toggleSplitButton.setAttribute("aria-pressed", normalized === "horizontal" ? "true" : "false");
      toggleSplitButton.title = normalized === "horizontal"
        ? "Toggle split orientation (Ctrl+Alt+\\) - Horizontal"
        : "Toggle split orientation (Ctrl+Alt+\\) - Vertical";
    }
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
      const startRect = (rightSplitOrientation === "horizontal")
        ? renderPane.getBoundingClientRect()
        : editorPane.getBoundingClientRect();
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

  const fitScoreToCurrentPane = ({ fitScore = true, resetScroll = true, persist = true } = {}) => {
    requestFrame(() => requestFrame(() => {
      if (fitScore && !isRawMode()) {
        const fit = computeFocusFitZoom({ currentZoom: readRenderZoom() });
        if (Number.isFinite(fit) && fit > 0) {
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
    }));
  };

  const resetView = ({ fitScore = true, resetScroll = true } = {}) => {
    if (rightSplitOrientation === "horizontal") {
      rightSplitRatioHorizontal = defaultHorizontalScoreRatio;
      scheduleSaveLayoutPrefs({ layoutSplitRatioHorizontal: rightSplitRatioHorizontal });
    } else {
      rightSplitRatioVertical = defaultVerticalEditorRatio;
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
    applyRightSplitOrientation(settings.layoutSplitOrientation === "horizontal" ? "horizontal" : "vertical");
    applyRightSplitSizesFromRatio();
  };

  const setRenderZoom = (zoom) => {
    const v = Number(zoom);
    if (!Number.isFinite(v) || v <= 0) return;
    try { document.documentElement.style.setProperty("--render-zoom", String(v)); } catch {}
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

  const computeFocusFitZoom = ({ currentZoom = null, clamp = null } = {}) => {
    if (!renderPane || !output) return null;
    const svgs = Array.from(output.querySelectorAll("svg"));
    if (!svgs.length) return null;
    const zoom = Number.isFinite(Number(currentZoom)) && Number(currentZoom) > 0
      ? Number(currentZoom)
      : readRenderZoom();
    if (!Number.isFinite(zoom) || zoom <= 0) return null;
    const paneWidth = renderPane.clientWidth || 0;
    if (paneWidth < 50) return null;

    let maxIntrinsicWidth = 0;
    const limit = Math.min(8, svgs.length);
    for (let i = 0; i < limit; i += 1) {
      const r = svgs[i] ? svgs[i].getBoundingClientRect() : null;
      if (!(r && r.width > 10)) continue;
      const w = r.width / zoom;
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

  const setSplitOrientation = (nextOrientation, { persist = true, userAction = false } = {}) => {
    const next = (nextOrientation === "horizontal") ? "horizontal" : "vertical";
    if (userAction && !isNormalModeForSplitToggle()) {
      showToast("Exit Focus/Raw mode to change split orientation.", 2400);
      return false;
    }
    const currentOrientation = rightSplitOrientation;
    if (currentOrientation === next) return true;

    try {
      const currentZoom = readRenderZoom();
      if (Number.isFinite(currentZoom) && currentZoom > 0) {
        const key = (currentOrientation === "horizontal") ? "layoutRenderZoomHorizontal" : "layoutRenderZoomVertical";
        const settings = getLatestSettings() || null;
        const prev = settings && settings[key] != null ? Number(settings[key]) : null;
        if (!Number.isFinite(prev) || Math.abs(prev - currentZoom) > 0.0001) {
          scheduleSaveLayoutPrefs({ [key]: currentZoom });
        }
      }
    } catch {}

    applyRightSplitOrientation(next);
    applyRightSplitSizesFromRatio({ rawMode: Boolean(isRawMode()) });

    try {
      const settings = getLatestSettings() || null;
      const targetKey = (next === "horizontal") ? "layoutRenderZoomHorizontal" : "layoutRenderZoomVertical";
      const desired = settings && settings[targetKey] != null ? Number(settings[targetKey]) : null;
      if (Number.isFinite(desired) && desired > 0) {
        setRenderZoom(desired);
        const current = settings && settings.renderZoom != null ? Number(settings.renderZoom) : null;
        if (!Number.isFinite(current) || Math.abs(current - desired) > 0.0001) {
          scheduleSaveLayoutPrefs({ renderZoom: desired });
        }
      }
    } catch {}

    if (persist) scheduleSaveLayoutPrefs({ layoutSplitOrientation: next });
    if (userAction) fitScoreToCurrentPane({ resetScroll: false });
    showToast(next === "horizontal" ? "Split: Horizontal" : "Split: Vertical", 1500);
    return true;
  };

  const toggleSplitOrientation = ({ userAction = false } = {}) => {
    const next = rightSplitOrientation === "horizontal" ? "vertical" : "horizontal";
    return setSplitOrientation(next, { persist: true, userAction });
  };

  return {
    applyRightSplitOrientation,
    applyRightSplitSizesFromRatio,
    getRightSplitOrientation: () => rightSplitOrientation,
    getSidebarWidth,
    fitScoreToCurrentPane,
    initPaneResizer,
    initRightPaneResizer,
    initSidebarResizer,
    resetRightPaneSplit,
    resetView,
    computeFocusFitZoom,
    getRenderZoomFactor,
    readRenderZoom,
    scheduleSaveLayoutPrefs,
    setFromSettings,
    setPaneSizes,
    setRenderZoom,
    setRightPaneSizes,
    setSidebarSplitSizes,
    setSplitOrientation,
    toggleSplitOrientation,
  };
}
