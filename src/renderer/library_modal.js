(function () {
  "use strict";

  const $overlay = document.getElementById("libOverlay");
  const $filter = document.getElementById("libFilter");
  const $close = document.getElementById("libClose");
  const $open = document.getElementById("libOpen");
  const $hint = $overlay ? $overlay.querySelector(".lib-hint") : null;
  const baseHintText = $hint ? String($hint.textContent || "") : "";

  const STORAGE_TABLE_STATE_KEY = "abcarus.libraryModal.tableState.v1";
  const STORAGE_FILTER_KEY = "abcarus.libraryModal.filter.v1";
  const SAVE_DEBOUNCE_MS = 250;

  let libTable = null;
  let selectedRowData = null;
  let tabulatorEventsBound = false;
  let hintTimer = null;
  let saveStateTimer = null;
  let saveFilterTimer = null;
  let pendingFilterValue = null;
  let currentRowsCache = [];

  const DEFAULT_SORT = [{ column: "modified", dir: "desc" }];
  const DEFAULT_COLUMNS = [
    { title: "File", field: "file", widthGrow: 2 },
    { title: "#", field: "tuneNo", width: 60, hozAlign: "right" },
    { title: "Title", field: "title", widthGrow: 5 },
    { title: "Composer", field: "composer", widthGrow: 2 },
    { title: "Key", field: "key", width: 80 },
    { title: "Meter", field: "meter", width: 80 },
    { title: "Modified", field: "modified", width: 110 },
    {
      title: "Tags",
      field: "tags",
      widthGrow: 1,
      maxWidth: 260,
      formatter: "textarea",
      cssClass: "lib-tags-cell",
    },
  ];
  const KNOWN_FIELDS = new Set(DEFAULT_COLUMNS.map((col) => col.field).filter(Boolean));

  function setHintMessage(text, { isError = false, timeoutMs = 0 } = {}) {
    if (!$hint) return;
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
    $hint.textContent = String(text || "");
    $hint.classList.toggle("error", Boolean(isError));
    $hint.setAttribute("role", "status");
    $hint.setAttribute("aria-live", "polite");
    if (timeoutMs > 0) {
      hintTimer = setTimeout(() => {
        hintTimer = null;
        $hint.textContent = baseHintText;
        $hint.classList.remove("error");
      }, timeoutMs);
    }
  }

  function resetHint() {
    setHintMessage(baseHintText, { isError: false, timeoutMs: 0 });
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
      setHintMessage("Missing file path", { isError: true, timeoutMs: 2500 });
      return null;
    }

    const tuneId = normalizeString(rowData && rowData.tuneId);
    const tuneNoRaw = rowData && rowData.tuneNo != null ? normalizeString(rowData.tuneNo) : "";
    const xNumber = normalizeString(rowData && rowData.xNumber);
    const title = normalizeString(rowData && rowData.title);

    if (!tuneId && !tuneNoRaw && !xNumber) {
      setHintMessage("Missing tune id", { isError: true, timeoutMs: 2500 });
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
    const opener = window.openTuneFromLibrarySelection;
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
    return `${r && r.file != null ? r.file : ""} ${r && r.tuneNo != null ? r.tuneNo : ""} ${r && r.title != null ? r.title : ""} ${r && r.composer != null ? r.composer : ""} ${r && r.key != null ? r.key : ""} ${r && r.meter != null ? r.meter : ""} ${r && r.modified != null ? r.modified : ""} ${r && r.tags != null ? r.tags : ""}`.toLowerCase();
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
    const tags = ["armenian", "greek", "dance", "slow", "wip", "session", "choral", "solo", "reel", "jig"];

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
      const tagA = tags[i % tags.length];
      const tagB = tags[(i + 3) % tags.length];
      rows.push({
        file,
        tuneNo,
        title,
        composer,
        key,
        meter,
        modified,
        tags: `${tagA}, ${tagB}`,
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

  async function getRealLibraryRows() {
    if (!window.api || typeof window.api.getLastRecent !== "function" || typeof window.api.scanLibrary !== "function") {
      return null;
    }
    const last = await window.api.getLastRecent();
    if (!last || !last.entry || !last.entry.path) return null;

    const filePath = String(last.entry.path || "");
    const rootDir = (window.api && typeof window.api.pathDirname === "function")
      ? window.api.pathDirname(filePath)
      : null;
    if (!rootDir) return null;

    const res = await window.api.scanLibrary(rootDir);
    const files = res && Array.isArray(res.files) ? res.files : [];
    const rows = [];

    for (const file of files) {
      const modified = file && file.updatedAtMs ? formatDateYmd(file.updatedAtMs) : "";
      const fileLabel = (file && file.basename) ? file.basename : (file && file.path ? String(file.path).split(/[\\/]/).pop() : "");
      const tunes = file && Array.isArray(file.tunes) ? file.tunes : [];
      for (const tune of tunes) {
        const tagParts = [];
        if (tune && tune.rhythm) tagParts.push(`R:${tune.rhythm}`);
        if (tune && tune.tempo) tagParts.push(`Q:${tune.tempo}`);
        if (tune && tune.origin) tagParts.push(`O:${tune.origin}`);
        if (tune && tune.group) tagParts.push(`G:${tune.group}`);
        rows.push({
          file: fileLabel,
          filePath: file && file.path ? file.path : "",
          tuneId: tune && tune.id ? tune.id : "",
          tuneNo: tune && tune.xNumber != null ? tune.xNumber : "",
          title: tune && (tune.title || tune.preview) ? (tune.title || tune.preview) : "",
          composer: tune && tune.composer ? tune.composer : "",
          key: tune && tune.key ? tune.key : "",
          meter: tune && tune.meter ? tune.meter : "",
          modified,
          tags: tagParts.join(", "),
        });
      }
    }

    return rows;
  }

  function syncOpenButtonEnabled() {
    if (!$open) return;
    $open.disabled = !selectedRowData;
  }

  function setSelectedRowData(data) {
    selectedRowData = data || null;
    syncOpenButtonEnabled();
    resetHint();
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
          setHintMessage("No results", { isError: false, timeoutMs: 2500 });
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
    resetHint();
    setSelectedRowData(null);
    try { libTable.deselectRow(); } catch (_e) {}
    if (!q) {
      libTable.clearFilter(true);
      return;
    }
    libTable.setFilter((data) => {
      try {
        return buildSearchString(data).includes(q);
      } catch (_e) {
        return false;
      }
    });
    const count = getVisibleRowCount();
    if (count === 0) {
      setHintMessage("No results", { isError: false, timeoutMs: 2500 });
      return;
    }
  }

  function clearFilterAndSelection() {
    if ($filter) $filter.value = "";
    pendingFilterValue = "";
    resetHint();
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
    resetHint();
    $overlay.hidden = false;

    requestAnimationFrame(() => {
      const fallback = Array.isArray(rows) ? rows : getDemoLibraryRows();
      const hadTable = Boolean(libTable);
      const table = ensureTabulator([]);
      if (!table) return;

      applySavedTableState();

      const savedFilter = readJsonStorage(STORAGE_FILTER_KEY);
      const savedValue = savedFilter && typeof savedFilter.value === "string" ? savedFilter.value : "";
      pendingFilterValue = savedValue;

      const load = hadTable ? table.setData([]) : null;
      Promise.resolve(load).then(() => {
        setSelectedRowData(null);
        currentRowsCache = [];
        try { table.deselectRow(); } catch (_e) {}
        try { table.redraw(true); } catch (_e) {}
        if ($filter) $filter.focus();
      }).catch((_e) => {
        try { table.redraw(true); } catch (_e2) {}
        if ($filter) $filter.focus();
      });

      Promise.resolve().then(async () => {
        let realRows = null;
        try {
          realRows = await getRealLibraryRows();
        } catch (e) {
          console.warn("Library modal: unable to load real library rows, falling back to demo.", e);
        }
        const nextRows = (realRows && realRows.length) ? realRows : fallback;
        await table.setData(nextRows);
        setSelectedRowData(null);
        currentRowsCache = nextRows;
        try { table.deselectRow(); } catch (_e) {}
        try { table.redraw(true); } catch (_e) {}
      }).catch((_e) => {});
    });
  }

  function closeLibraryModal() {
    if (!$overlay) return;
    $overlay.hidden = true;
    setSelectedRowData(null);
    resetHint();
    if (libTable) {
      try { libTable.deselectRow(); } catch (_e) {}
    }
  }

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
      setHintMessage("Open cancelled (unsaved changes)", { isError: false, timeoutMs: 2500 });
      return;
    }
    const msg = (res && res.error) ? String(res.error) : "Unable to open tune.";
    if (window.api && typeof window.api.showOpenError === "function") {
      await window.api.showOpenError(msg);
      resetHint();
      return;
    }
    setHintMessage(msg, { isError: true, timeoutMs: 6000 });
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
      resetHint();
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
    const code = e.code;
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    if (!isOverlayOpen) {
      const isHotkey = isCtrlOrCmd
        && e.shiftKey
        && !e.altKey
        && (code === "KeyL" || key === "l" || key === "L");
      if (isHotkey) {
        e.preventDefault();
        e.stopPropagation();
        openLibraryModal();
      }
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
