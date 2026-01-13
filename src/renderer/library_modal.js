(function () {
  "use strict";

  const $overlay = document.getElementById("libOverlay");
  const $filter = document.getElementById("libFilter");
  const $close = document.getElementById("libClose");
  const $open = document.getElementById("libOpen");
  const $status = document.getElementById("libStatus");
  const $modal = $overlay ? $overlay.querySelector(".lib-modal") : null;
  let $addToSetList = null;

  const STORAGE_TABLE_STATE_KEY = "abcarus.libraryModal.tableState.v1";
  const STORAGE_FILTER_KEY = "abcarus.libraryModal.filter.v1";
  const SAVE_DEBOUNCE_MS = 250;

  let libTable = null;
  let selectedRowData = null;
  let tabulatorEventsBound = false;
  let statusTimer = null;
  let saveStateTimer = null;
  let saveFilterTimer = null;
  let pendingFilterValue = null;
  let currentRowsCache = [];
  let lastModalRect = null;
  let redrawTimer = null;

  const DEFAULT_SORT = [{ column: "modified", dir: "desc" }];
  const DEFAULT_COLUMNS = [
    { title: "File", field: "file", widthGrow: 2 },
    { title: "#", field: "tuneNo", width: 60, hozAlign: "right" },
    { title: "Title", field: "title", widthGrow: 5 },
    { title: "Composer", field: "composer", widthGrow: 2 },
    { title: "Origin", field: "origin", widthGrow: 2 },
    { title: "Group", field: "group", widthGrow: 2 },
    { title: "Key", field: "key", width: 80 },
    { title: "Meter", field: "meter", width: 80 },
    { title: "Tempo", field: "tempo", width: 110 },
    { title: "Rhythm", field: "rhythm", width: 120 },
    { title: "Modified", field: "modified", width: 110 },
  ];
  const KNOWN_FIELDS = new Set(DEFAULT_COLUMNS.map((col) => col.field).filter(Boolean));

  function setStatusMessage(text, { isError = false, timeoutMs = 0 } = {}) {
    if (!$status) return;
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    $status.textContent = String(text || "");
    $status.classList.toggle("error", Boolean(isError));
    if (timeoutMs > 0) {
      statusTimer = setTimeout(() => {
        statusTimer = null;
        $status.textContent = "";
        $status.classList.remove("error");
      }, timeoutMs);
    }
  }

  function resetStatus() {
    setStatusMessage("", { isError: false, timeoutMs: 0 });
  }

  function readJsonStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

    function clearStorage(key) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }

    function scheduleTableRedraw() {
      if (redrawTimer) clearTimeout(redrawTimer);
      redrawTimer = setTimeout(() => {
        redrawTimer = null;
        try {
          if (libTable && typeof libTable.redraw === "function") libTable.redraw(true);
        } catch {}
      }, 60);
    }

    function applyModalRect(rect) {
      if (!$modal || !rect) return;
      $modal.style.transform = "none";
      $modal.style.left = `${Math.round(rect.left)}px`;
      $modal.style.top = `${Math.round(rect.top)}px`;
      $modal.style.width = `${Math.round(rect.width)}px`;
      $modal.style.height = `${Math.round(rect.height)}px`;
    }

    function clampModalRect(rect) {
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      const margin = 12;
      const minW = 820;
      const minH = 420;
      const maxW = Math.max(minW, vw - margin * 2);
      const maxH = Math.max(minH, vh - margin * 2);

      let width = Math.max(minW, Math.min(maxW, rect.width));
      let height = Math.max(minH, Math.min(maxH, rect.height));
      let left = rect.left;
      let top = rect.top;

      left = Math.max(margin, Math.min(vw - margin - width, left));
      top = Math.max(margin, Math.min(vh - margin - height, top));

      return { left, top, width, height };
    }

    function ensureResizeHandles() {
      if (!$modal) return;
      if ($modal.querySelector(".lib-resize-handle")) return;

      const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
      for (const dir of dirs) {
        const handle = document.createElement("div");
        handle.className = `lib-resize-handle ${dir}`;
        handle.dataset.dir = dir;
        handle.setAttribute("aria-hidden", "true");
        $modal.appendChild(handle);
      }

      const onPointerDown = (e) => {
        const target = e.target;
        const dir = target && target.dataset ? target.dataset.dir : "";
        if (!dir) return;
        if (e.button != null && e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = $modal.getBoundingClientRect();
        applyModalRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });

        const startX = e.clientX;
        const startY = e.clientY;
        const start = $modal.getBoundingClientRect();

        const move = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          let left = start.left;
          let top = start.top;
          let width = start.width;
          let height = start.height;

          if (dir.includes("e")) width = start.width + dx;
          if (dir.includes("s")) height = start.height + dy;
          if (dir.includes("w")) {
            width = start.width - dx;
            left = start.left + dx;
          }
          if (dir.includes("n")) {
            height = start.height - dy;
            top = start.top + dy;
          }

          const clamped = clampModalRect({ left, top, width, height });
          applyModalRect(clamped);
          scheduleTableRedraw();
        };

        const up = () => {
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", up, true);
          $modal.classList.remove("lib-resizing");
          const r = $modal.getBoundingClientRect();
          lastModalRect = clampModalRect({ left: r.left, top: r.top, width: r.width, height: r.height });
          scheduleTableRedraw();
        };

        $modal.classList.add("lib-resizing");
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
      };

      $modal.addEventListener("pointerdown", onPointerDown, true);
    }

    function scheduleSaveTableState() {
      if (!libTable) return;
      if (saveStateTimer) clearTimeout(saveStateTimer);
      saveStateTimer = setTimeout(() => {
      saveStateTimer = null;
      const state = getCurrentTableState();
      if (state) writeJsonStorage(STORAGE_TABLE_STATE_KEY, state);
    }, SAVE_DEBOUNCE_MS);
  }

  function scheduleSaveFilter(value) {
    if (saveFilterTimer) clearTimeout(saveFilterTimer);
    const v = String(value || "");
    saveFilterTimer = setTimeout(() => {
      saveFilterTimer = null;
      writeJsonStorage(STORAGE_FILTER_KEY, { value: v });
    }, SAVE_DEBOUNCE_MS);
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

    function buildOpenSelection(rowData) {
      const filePath = normalizeString(rowData && (rowData.filePath || rowData.file));
      if (!filePath) {
        setStatusMessage("Missing file path", { isError: true, timeoutMs: 2500 });
        return null;
      }

    const tuneId = normalizeString(rowData && rowData.tuneId);
    const tuneNoRaw = rowData && rowData.tuneNo != null ? normalizeString(rowData.tuneNo) : "";
    const xNumber = normalizeString(rowData && rowData.xNumber);
    const title = normalizeString(rowData && rowData.title);

      if (!tuneId && !tuneNoRaw && !xNumber) {
        setStatusMessage("Missing tune id", { isError: true, timeoutMs: 2500 });
        return null;
      }

    const selection = { filePath };
    if (tuneId) selection.tuneId = tuneId;
    else if (xNumber) selection.xNumber = xNumber;
    else if (tuneNoRaw) selection.tuneNo = tuneNoRaw;
    if (title) selection.title = title;
    return selection;
  }

  async function openSelectedTune(rowData) {
    if (!rowData) return { ok: false, error: "No selection." };
    const selection = buildOpenSelection(rowData);
    if (!selection) return { ok: false, error: "Validation failed.", validation: true };
    const actions = window.libraryActions;
    const opener = actions && typeof actions.openTune === "function"
      ? actions.openTune
      : window.openTuneFromLibrarySelection;
    if (typeof opener !== "function") {
      console.log("Open:", rowData);
      return { ok: false, error: "Open handler not available." };
    }
    const res = await opener(selection);
    if (res && res.ok) return { ok: true };
    if (res && res.cancelled) return { ok: false, cancelled: true };
    return { ok: false, error: (res && res.error) ? res.error : "Unable to open tune." };
  }

    function buildSearchString(r) {
      return `${r && r.file != null ? r.file : ""} ${r && r.tuneNo != null ? r.tuneNo : ""} ${r && r.title != null ? r.title : ""} ${r && r.composer != null ? r.composer : ""} ${r && r.key != null ? r.key : ""} ${r && r.meter != null ? r.meter : ""} ${r && r.tempo != null ? r.tempo : ""} ${r && r.rhythm != null ? r.rhythm : ""} ${r && r.origin != null ? r.origin : ""} ${r && r.group != null ? r.group : ""} ${r && r.modified != null ? r.modified : ""}`.toLowerCase();
    }

    function getRowSearchText(rowData) {
      try {
        if (rowData && typeof rowData.searchText === "string") return rowData.searchText;
      } catch {}
      return buildSearchString(rowData);
    }

    function getDemoLibraryRows() {
      const rows = [];
      const files = [
        "my_compositions.abc",
      "armenian_tunes.abc",
      "greek_book.abc",
      "irish_session.abc",
      "wip.abc",
    ];
    const composers = [
      "Traditional",
      "J. S. Bach",
      "Ara Dinkjian",
      "Komitas",
      "Anonymous",
      "Avetik",
    ];
      const keys = ["Am", "Dm", "Gm", "C", "D", "Em", "F", "G", "Bb"];
      const meters = ["2/4", "3/4", "4/4", "6/8", "7/8", "9/8", "10/8", "11/8"];
      const rhythms = ["reel", "jig", "waltz", "karsilama", "kopanica", "semai", "hsum"];
      const origins = ["Armenia", "Greece", "Ireland", "Macedonia", "Thrace", "West Armenia"];
      const groups = ["session", "choral", "dance", "wip", "solo"];
      const tempos = ["1/4=120", "1/4=180", "1/8=220", "1/4=60"];

      const pad2 = (n) => String(n).padStart(2, "0");
      const formatDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

      for (let i = 1; i <= 100; i += 1) {
        const file = files[i % files.length];
        const tuneNo = i;
        const title = `Demo Tune ${i}`;
        const composer = composers[i % composers.length];
        const key = keys[i % keys.length];
        const meter = meters[i % meters.length];
        const modified = formatDate(new Date(Date.now() - (i * 24 * 60 * 60 * 1000)));
        const origin = origins[i % origins.length];
        const group = groups[i % groups.length];
        const rhythm = rhythms[i % rhythms.length];
        const tempo = tempos[i % tempos.length];
        rows.push({
          file,
          tuneNo,
          title,
          composer,
          origin,
          group,
          key,
          meter,
          tempo,
          rhythm,
          modified,
        });
      }

      return rows;
    }

  function formatDateYmd(ts) {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "";
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // DEV-ONLY FALLBACK (disabled):
  // The Library List must never infer a library root or rescan automatically.
  // Keep this stub only as a reminder of what NOT to do.
  async function getRealLibraryRows() {
    return null;
  }

  function syncOpenButtonEnabled() {
    if (!$open) return;
    $open.disabled = !selectedRowData;
  }

  function syncAddToSetListEnabled() {
    if (!$addToSetList) return;
    $addToSetList.disabled = !selectedRowData;
  }

  function requestAddToSetList(rowData) {
    if (!rowData) return;
    document.dispatchEvent(new CustomEvent("set-list:add", { detail: { row: rowData } }));
  }

    function setSelectedRowData(data) {
      selectedRowData = data || null;
      syncOpenButtonEnabled();
      syncAddToSetListEnabled();
      resetStatus();
    }

  function getVisibleRowCount() {
    if (!libTable) return 0;
    try {
      if (typeof libTable.getDataCount === "function") {
        const count = libTable.getDataCount("active");
        if (Number.isFinite(count)) return count;
      }
    } catch {}
    try {
      if (typeof libTable.getRows === "function") return libTable.getRows("active").length;
    } catch {}
    return 0;
  }

  function getCurrentTableState() {
    if (!libTable) return null;
    const state = { columns: [], sort: [] };
    try {
      if (typeof libTable.getColumnLayout === "function") {
        const layout = libTable.getColumnLayout();
        if (Array.isArray(layout)) state.columns = layout;
      }
    } catch {}
    try {
      if (typeof libTable.getSorters === "function") {
        const sorters = libTable.getSorters();
        if (Array.isArray(sorters) && sorters.length) {
          state.sort = sorters.map((s) => ({
            column: s.field || s.column,
            dir: s.dir,
          })).filter((s) => s.column && s.dir);
        } else {
          state.sort = [];
        }
      }
    } catch {}
    if (!Array.isArray(state.columns) || !state.columns.length) return null;
    return state;
  }

  function applySavedTableState() {
    if (!libTable) return;
    const saved = readJsonStorage(STORAGE_TABLE_STATE_KEY);
    if (!saved || typeof saved !== "object") return;

    const columns = Array.isArray(saved.columns) ? saved.columns : null;
    if (!columns) return;

    const filteredColumns = columns
      .filter((col) => col && typeof col.field === "string")
      .filter((col) => KNOWN_FIELDS.has(col.field));

    if (!filteredColumns.length) {
      clearStorage(STORAGE_TABLE_STATE_KEY);
      return;
    }

    try {
      if (typeof libTable.setColumnLayout === "function") {
        libTable.setColumnLayout(filteredColumns);
      }
    } catch {}

    try {
      const sort = Array.isArray(saved.sort) ? saved.sort : [];
      const filteredSort = sort
        .map((s) => ({
          column: s && (s.column || s.field),
          dir: s && s.dir,
        }))
        .filter((s) => s.column && (s.dir === "asc" || s.dir === "desc"))
        .filter((s) => KNOWN_FIELDS.has(s.column));

      if (typeof libTable.setSort === "function") {
        if (filteredSort.length) libTable.setSort(filteredSort);
        else libTable.setSort(DEFAULT_SORT);
      }
    } catch {}
  }

  function recreateTableWithDefaults(rows) {
    if (!$overlay) return;
    const data = Array.isArray(rows) ? rows : [];
    try {
      if (libTable && typeof libTable.destroy === "function") libTable.destroy();
    } catch {}
    libTable = null;
    tabulatorEventsBound = false;
    const table = ensureTabulator(data);
    if (!table) return;
    try {
      if (typeof table.setSort === "function") table.setSort(DEFAULT_SORT);
    } catch {}
    try { table.redraw(true); } catch {}
  }

  function ensureTabulator(initialData) {
    if (!window.Tabulator) {
      console.error("Tabulator not found on window.Tabulator.");
      return null;
    }
    if (libTable) return libTable;
    libTable = new window.Tabulator("#libTable", {
      height: "100%",
      layout: "fitDataStretch",
      columnMinWidth: 90,
      selectable: 1,
      selectableRows: 1,
      data: Array.isArray(initialData) ? initialData : [],
      initialSort: DEFAULT_SORT,
      columns: DEFAULT_COLUMNS,
    });

    if (!tabulatorEventsBound) {
      tabulatorEventsBound = true;

      libTable.on("rowClick", (_e, row) => {
        try { row.select(); } catch (_err) {}
        setSelectedRowData(row ? row.getData() : null);
      });

      libTable.on("rowDblClick", (_e, row) => {
        try { row.select(); } catch (_err) {}
        setSelectedRowData(row ? row.getData() : null);
        openSelectedIfAny().catch(() => {});
      });

      libTable.on("dataLoaded", () => {
        setSelectedRowData(null);
        if (pendingFilterValue != null) {
          const v = String(pendingFilterValue);
          pendingFilterValue = null;
          if ($filter) $filter.value = v;
          applyQuickFilter(v);
        }
      });

      libTable.on("dataFiltered", () => {
        setSelectedRowData(null);
        const count = getVisibleRowCount();
        if (count === 0 && $filter && String($filter.value || "").trim()) {
          setStatusMessage("No results", { isError: false, timeoutMs: 2500 });
        }
      });

      const persistEvents = [
        "columnMoved",
        "columnResized",
        "columnVisibilityChanged",
        "sortChanged",
        "dataSorted",
      ];
      for (const name of persistEvents) {
        try {
          libTable.on(name, () => scheduleSaveTableState());
        } catch {}
      }
    }

    return libTable;
  }

  function applyQuickFilter(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!libTable) return;
    resetStatus();
    setSelectedRowData(null);
    try { libTable.deselectRow(); } catch (_e) {}
    if (!q) {
      libTable.clearFilter(true);
      return;
    }
    libTable.setFilter((data) => {
      try {
        return getRowSearchText(data).includes(q);
      } catch (_e) {
        return false;
      }
    });
    const count = getVisibleRowCount();
    if (count === 0) {
      setStatusMessage("No results", { isError: false, timeoutMs: 2500 });
    }
  }

  function clearFilterAndSelection() {
    if ($filter) $filter.value = "";
    pendingFilterValue = "";
    resetStatus();
    setSelectedRowData(null);
    if (libTable) {
      try { libTable.deselectRow(); } catch (_e) {}
      try { libTable.clearFilter(true); } catch (_e) {}
    }
    clearStorage(STORAGE_FILTER_KEY);
  }

  function openLibraryModal(rows) {
    if (!$overlay) return;

    setSelectedRowData(null);
    resetStatus();
    $overlay.hidden = false;
    ensureResizeHandles();
    if (lastModalRect) applyModalRect(clampModalRect(lastModalRect));
    document.dispatchEvent(new CustomEvent("library-modal:opened"));

    requestAnimationFrame(() => {
      const providedRows = Array.isArray(rows) ? rows : null;
      const hadTable = Boolean(libTable);
      const table = ensureTabulator(providedRows || []);
      if (!table) return;

      applySavedTableState();

      const savedFilter = readJsonStorage(STORAGE_FILTER_KEY);
      const savedValue = savedFilter && typeof savedFilter.value === "string" ? savedFilter.value : "";
      pendingFilterValue = savedValue;

      const finalizeOpen = () => {
        setSelectedRowData(null);
        try { table.deselectRow(); } catch (_e) {}
        try { table.redraw(true); } catch (_e) {}
        scheduleTableRedraw();
        if ($filter) $filter.focus();
      };

      if (providedRows) {
        const isSameData = currentRowsCache === providedRows;
        currentRowsCache = providedRows;
        if (hadTable && !isSameData) {
          Promise.resolve(table.setData(providedRows)).then(() => {
            finalizeOpen();
          }).catch(() => {
            finalizeOpen();
          });
        } else {
          finalizeOpen();
          if (pendingFilterValue != null) {
            const v = String(pendingFilterValue);
            pendingFilterValue = null;
            if ($filter) $filter.value = v;
            applyQuickFilter(v);
          }
        }
        return;
      }

      // No library data provided: do not infer a library root or scan automatically.
      // Renderer must be the single source of truth for library data.
      currentRowsCache = [];
      setStatusMessage("No library loaded.", { isError: false, timeoutMs: 0 });
      if (hadTable) {
        Promise.resolve(table.setData([])).then(() => finalizeOpen()).catch(() => finalizeOpen());
      } else {
        finalizeOpen();
      }
    });
  }

  function closeLibraryModal() {
    if (!$overlay) return;
    $overlay.hidden = true;
    setSelectedRowData(null);
    resetStatus();
    document.dispatchEvent(new CustomEvent("library-modal:closed"));
    if (libTable) {
      try { libTable.deselectRow(); } catch (_e) {}
    }
  }

  document.addEventListener("library-modal:update-rows", (ev) => {
    try {
      if (!$overlay || $overlay.hidden) return;
      const rows = ev && ev.detail && Array.isArray(ev.detail.rows) ? ev.detail.rows : null;
      if (!rows) return;
      const table = ensureTabulator(currentRowsCache || []);
      if (!table) return;
      if (currentRowsCache === rows) return;
      currentRowsCache = rows;
      pendingFilterValue = $filter ? String($filter.value || "") : "";
      Promise.resolve(table.setData(rows)).catch(() => {});
    } catch {}
  });

  async function openSelectedIfAny() {
    if (!selectedRowData) return;
    const res = await openSelectedTune(selectedRowData);
    if (res && res.ok) {
      closeLibraryModal();
      return;
    }
    if (res && res.validation) {
      return;
    }
    if (res && res.cancelled) {
      setStatusMessage("Open cancelled (unsaved changes)", { isError: false, timeoutMs: 2500 });
      return;
    }
    const msg = (res && res.error) ? String(res.error) : "Unable to open tune.";
    if (window.api && typeof window.api.showOpenError === "function") {
      await window.api.showOpenError(msg);
      resetStatus();
      return;
    }
    setStatusMessage(msg, { isError: true, timeoutMs: 6000 });
  }

  if ($close) {
    $close.addEventListener("click", () => closeLibraryModal());
  }

  if ($open) {
    $open.addEventListener("click", () => { openSelectedIfAny().catch(() => {}); });
  }

  if ($filter) {
    $filter.addEventListener("input", () => {
      const value = $filter.value || "";
      scheduleSaveFilter(value);
      applyQuickFilter(value);
    });
  }

  (function ensureClearButton() {
    if (!$overlay || !$filter) return;
    const controls = $overlay.querySelector(".lib-controls");
    if (!controls) return;
    if (controls.querySelector("#libClear") && controls.querySelector("#libAddToSetList")) return;

    if (!controls.querySelector("#libAddToSetList")) {
      const btn = document.createElement("button");
      btn.id = "libAddToSetList";
      btn.type = "button";
      btn.className = "lib-btn";
      btn.textContent = "Add to Set List";
      btn.disabled = !selectedRowData;
      btn.addEventListener("click", () => {
        if (!selectedRowData) return;
        requestAddToSetList(selectedRowData);
      });
      $addToSetList = btn;
      const insertBeforeEl = controls.querySelector("#libClear");
      controls.insertBefore(btn, insertBeforeEl);
    } else {
      $addToSetList = controls.querySelector("#libAddToSetList");
    }

    if (controls.querySelector("#libClear")) return;

    const btn = document.createElement("button");
    btn.id = "libClear";
    btn.type = "button";
    btn.className = "lib-btn";
    btn.textContent = "Clear";
    btn.addEventListener("click", () => {
      clearFilterAndSelection();
      if ($filter) $filter.focus();
    });
    controls.appendChild(btn);

    const resetBtn = document.createElement("button");
    resetBtn.id = "libResetLayout";
    resetBtn.type = "button";
    resetBtn.className = "lib-btn";
    resetBtn.textContent = "Reset layout";
    resetBtn.addEventListener("click", () => {
      clearStorage(STORAGE_TABLE_STATE_KEY);
      clearStorage(STORAGE_FILTER_KEY);
      resetStatus();
      setSelectedRowData(null);
      if ($filter) $filter.value = "";
      pendingFilterValue = "";
      recreateTableWithDefaults(currentRowsCache);
      if (libTable) {
        try { libTable.deselectRow(); } catch (_e) {}
        try { libTable.clearFilter(true); } catch (_e) {}
      }
      if ($filter) $filter.focus();
    });
    controls.appendChild(resetBtn);
  })();

  const onKeyDown = (e) => {
    const isOverlayOpen = $overlay && $overlay.hidden === false;
    const key = e.key;

    if (!isOverlayOpen) {
      return;
    }

    if (key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeLibraryModal();
      return;
    }
    if (key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (selectedRowData) openSelectedIfAny().catch(() => {});
    }
  };

  document.addEventListener("keydown", onKeyDown, true);

  window.openLibraryModal = openLibraryModal;
  window.closeLibraryModal = closeLibraryModal;
  window.openSelectedTune = openSelectedTune;
  window.getDemoLibraryRows = getDemoLibraryRows;
})();
