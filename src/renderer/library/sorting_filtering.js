const GROUP_SORT_MODES = new Set([
  "name_asc",
  "name_desc",
  "count_asc",
  "count_desc",
  "update_asc",
  "update_desc",
]);

const TUNE_SORT_MODES = new Set([
  "x_asc",
  "x_desc",
  "t_asc",
  "t_desc",
  "c_asc",
  "c_desc",
  "k_asc",
  "k_desc",
  "update_asc",
  "update_desc",
  "file_asc",
  "file_desc",
]);

function normalizeSortText(text) {
  return String(text || "").toLowerCase();
}

function compareSortText(a, b) {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), undefined, { numeric: true });
}

function getDefaultGroupSortMode(mode) {
  return mode === "file" ? "update_desc" : "name_asc";
}

function getDefaultTuneSortMode(_mode) {
  return "x_asc";
}

function normalizeGroupSortMode(mode) {
  const v = String(mode || "").trim();
  if (v === "file_asc") return "name_asc";
  if (v === "file_desc") return "name_desc";
  return GROUP_SORT_MODES.has(v) ? v : "";
}

function normalizeTuneSortMode(mode) {
  const v = String(mode || "").trim();
  return TUNE_SORT_MODES.has(v) ? v : "";
}

function getTuneSortValue(tune) {
  if (!tune) return null;
  const xNum = Number(tune.xNumber);
  if (Number.isFinite(xNum)) return xNum;
  return null;
}

function fallbackBasename(filePath) {
  return String(filePath || "").split("/").pop() || "";
}

function resolveSafeBasename(options = {}) {
  return typeof options.safeBasename === "function" ? options.safeBasename : fallbackBasename;
}

function getFileLabel(file, options = {}) {
  const basename = resolveSafeBasename(options);
  return (file && file.basename) ? file.basename : basename(file && file.path ? file.path : "");
}

function getTuneLabel(tune) {
  if (!tune) return "";
  const title = tune.title || tune.preview || "";
  const composer = tune.composer || "";
  const key = tune.key || "";
  const label = [title, composer, key].filter(Boolean).join(" - ");
  if (label) return label;
  if (tune.xNumber) return `X:${tune.xNumber}`;
  return "";
}

function getTuneFilePath(tune) {
  if (!tune) return "";
  if (tune.filePath) return String(tune.filePath);
  if (tune.path) return String(tune.path);
  const id = String(tune.id || "");
  const sep = id.indexOf("::");
  if (sep > 0) return id.slice(0, sep);
  return "";
}

function getTuneFileLabel(tune, options = {}) {
  const basename = resolveSafeBasename(options);
  return basename(getTuneFilePath(tune));
}

function getTuneUpdatedAtMs(tune) {
  if (!tune) return 0;
  const direct = Number(tune.updatedAtMs);
  if (Number.isFinite(direct)) return direct;
  const fromFile = Number(tune.__fileUpdatedAtMs);
  if (Number.isFinite(fromFile)) return fromFile;
  return 0;
}

function getEntryTuneCount(entry) {
  if (!entry || !entry.tunes) return 0;
  if (Number.isFinite(entry.tuneCount)) return entry.tuneCount;
  return entry.tunes.length || 0;
}

function isActiveFile(file, activeFilePath, options = {}) {
  const filePath = file && (file.path || file.id);
  if (!filePath || !activeFilePath) return false;
  if (typeof options.pathsEqual === "function") {
    return options.pathsEqual(filePath, activeFilePath);
  }
  return String(filePath) === String(activeFilePath);
}

function promoteActiveFile(list, activeFilePath, options = {}) {
  if (!activeFilePath || !Array.isArray(list) || list.length < 2) return list;
  const index = list.findIndex((file) => isActiveFile(file, activeFilePath, options));
  if (index > 0) {
    const [active] = list.splice(index, 1);
    list.unshift(active);
  }
  return list;
}

function compareTunes(a, b, mode, options = {}) {
  const dir = mode.endsWith("desc") ? -1 : 1;
  if (mode.startsWith("x_")) {
    const aX = getTuneSortValue(a);
    const bX = getTuneSortValue(b);
    if (Number.isFinite(aX) && Number.isFinite(bX) && aX !== bX) return (aX - bX) * dir;
    if (Number.isFinite(aX) && !Number.isFinite(bX)) return -1 * dir;
    if (!Number.isFinite(aX) && Number.isFinite(bX)) return 1 * dir;
  } else if (mode.startsWith("t_")) {
    const diff = compareSortText(a && a.title ? a.title : "", b && b.title ? b.title : "") * dir;
    if (diff) return diff;
  } else if (mode.startsWith("c_")) {
    const diff = compareSortText(a && a.composer ? a.composer : "", b && b.composer ? b.composer : "") * dir;
    if (diff) return diff;
  } else if (mode.startsWith("k_")) {
    const diff = compareSortText(a && a.key ? a.key : "", b && b.key ? b.key : "") * dir;
    if (diff) return diff;
  } else if (mode.startsWith("update_")) {
    const diff = (getTuneUpdatedAtMs(a) - getTuneUpdatedAtMs(b)) * dir;
    if (diff) return diff;
  } else if (mode.startsWith("file_")) {
    const diff = compareSortText(getTuneFileLabel(a, options), getTuneFileLabel(b, options)) * dir;
    if (diff) return diff;
  }
  return compareSortText(getTuneLabel(a), getTuneLabel(b)) * dir;
}

function sortTunes(list, mode, options = {}) {
  const sorted = Array.isArray(list) ? list.slice() : [];
  const groupMode = options.groupMode;
  const normalizedMode = normalizeTuneSortMode(mode) || getDefaultTuneSortMode(groupMode);
  sorted.sort((a, b) => compareTunes(a, b, normalizedMode, options));
  return sorted;
}

function sortLibraryFiles(files, options = {}) {
  const list = (files || []).map((file) => ({
    ...file,
    tunes: Array.isArray(file.tunes) ? file.tunes.slice() : [],
  }));
  const groupMode = options.groupMode;
  const sortMode = options.sortMode;
  const mode = normalizeGroupSortMode(sortMode) || getDefaultGroupSortMode(groupMode);
  const dir = mode.endsWith("desc") ? -1 : 1;
  if (mode.startsWith("update_")) {
    list.sort((a, b) => ((a.updatedAtMs || 0) - (b.updatedAtMs || 0)) * dir);
  } else if (mode.startsWith("count_")) {
    list.sort((a, b) => {
      const diff = (getEntryTuneCount(a) - getEntryTuneCount(b)) * dir;
      if (diff) return diff;
      return compareSortText(getFileLabel(a, options), getFileLabel(b, options)) * dir;
    });
  } else {
    list.sort((a, b) => compareSortText(getFileLabel(a, options), getFileLabel(b, options)) * dir);
  }
  for (const file of list) {
    if (file.tunes && file.tunes.length) {
      file.tunes = sortTunes(file.tunes, options.tuneSortMode, options);
    }
  }
  if (groupMode === "file") promoteActiveFile(list, options.activeFilePath, options);
  return list;
}

function sortGroupEntries(entries, options = {}) {
  const list = entries ? entries.slice() : [];
  const groupMode = options.groupMode;
  const sortMode = options.sortMode;
  const mode = normalizeGroupSortMode(sortMode) || getDefaultGroupSortMode(groupMode);
  const dir = mode.endsWith("desc") ? -1 : 1;
  if (mode.startsWith("update_")) {
    list.sort((a, b) => ((a.updatedAtMs || 0) - (b.updatedAtMs || 0)) * dir);
  } else if (mode.startsWith("count_")) {
    list.sort((a, b) => {
      const diff = (getEntryTuneCount(a) - getEntryTuneCount(b)) * dir;
      if (diff) return diff;
      return compareSortText(a.label, b.label) * dir;
    });
  } else {
    list.sort((a, b) => compareSortText(a.label, b.label) * dir);
  }
  if (options.groupMode === "file" && options.activeFilePath) {
    const index = list.findIndex((entry) => (
      entry && entry.isFile && isActiveFile(entry, options.activeFilePath, options)
    ));
    if (index > 0) {
      const [active] = list.splice(index, 1);
      list.unshift(active);
    }
  }
  return list;
}

function normalizeFilterValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchLibraryText(value, needle) {
  if (!value) return false;
  return normalizeFilterValue(value).includes(needle);
}

function matchLibraryValues(values, needle) {
  if (!values) return false;
  if (Array.isArray(values)) return values.some((value) => matchLibraryText(value, needle));
  return Object.values(values).some((value) => matchLibraryValues(value, needle));
}

function matchLibraryHeaderFields(headerFields, needle) {
  if (!headerFields || typeof headerFields !== "object") return false;
  const qualified = String(needle || "").match(/^([a-z]):\s*(.*)$/i);
  if (!qualified) return matchLibraryValues(headerFields, needle);
  const values = headerFields[qualified[1].toUpperCase()];
  if (!values) return false;
  const valueNeedle = normalizeFilterValue(qualified[2]);
  return valueNeedle ? matchLibraryValues(values, valueNeedle) : true;
}

function matchLibraryFileHeader(headerText, needle) {
  if (!headerText) return false;
  const fields = {};
  for (const line of String(headerText).split(/\r\n|\n|\r/)) {
    const match = line.match(/^\s*([A-Za-z]):\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toUpperCase();
    const value = match[2].trim();
    if (!fields[field]) fields[field] = [];
    if (value) fields[field].push(value);
  }
  return matchLibraryHeaderFields(fields, needle);
}

function tuneMatchesText(tune, needle, options = {}) {
  if (!tune) return false;
  const normalizeTitleKey = typeof options.normalizeTitleKey === "function" ? options.normalizeTitleKey : null;
  const rawTitle = tune.title || tune.preview || "";
  const needleKey = normalizeTitleKey ? normalizeTitleKey(String(needle || ""), 0, Boolean(options.titleKeyStrict)) : "";
  if (needleKey) {
    const titleKey = normalizeTitleKey(rawTitle, 0, Boolean(options.titleKeyStrict));
    if (titleKey && titleKey.includes(needleKey)) return true;
  }
  if (matchLibraryText(tune.title, needle)) return true;
  if (matchLibraryText(tune.preview, needle)) return true;
  if (matchLibraryText(tune.composer, needle)) return true;
  if (matchLibraryValues(tune.composers, needle)) return true;
  if (matchLibraryText(tune.key, needle)) return true;
  if (matchLibraryText(tune.meter, needle)) return true;
  if (matchLibraryText(tune.unitLength, needle)) return true;
  if (matchLibraryText(tune.tempo, needle)) return true;
  if (matchLibraryText(tune.rhythm, needle)) return true;
  if (matchLibraryText(tune.source, needle)) return true;
  if (matchLibraryText(tune.origin, needle)) return true;
  if (matchLibraryText(tune.group, needle)) return true;
  if (matchLibraryValues(tune.groups, needle)) return true;
  if (matchLibraryValues(tune.catalogFacets, needle)) return true;
  if (matchLibraryHeaderFields(tune.headerFields, needle)) return true;
  if (matchLibraryText(String(tune.xNumber || ""), needle)) return true;
  return false;
}

function applyLibraryTextFilter(files, query, options = {}) {
  const needle = normalizeFilterValue(query);
  if (!needle) return files;
  const filtered = [];
  for (const file of files || []) {
    const tunes = Array.isArray(file.tunes) ? file.tunes : [];
    const fileMatch = matchLibraryText(file.basename, needle)
      || matchLibraryFileHeader(file.headerText, needle);
    const matchedTunes = fileMatch ? tunes : tunes.filter((tune) => tuneMatchesText(tune, needle, options));
    if (matchedTunes.length || fileMatch) {
      filtered.push({
        path: file.path,
        basename: file.basename,
        headerText: file.headerText || "",
        headerEndOffset: file.headerEndOffset || 0,
        updatedAtMs: file.updatedAtMs || 0,
        tunes: matchedTunes,
      });
    }
  }
  return filtered;
}

export {
  applyLibraryTextFilter,
  getDefaultGroupSortMode,
  getDefaultTuneSortMode,
  getEntryTuneCount,
  normalizeGroupSortMode,
  normalizeTuneSortMode,
  sortGroupEntries,
  sortLibraryFiles,
  sortTunes,
};
