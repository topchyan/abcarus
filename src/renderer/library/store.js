export function createLibraryViewStore({ getIndex, safeBasename }) {
  let modalRowsCache = null;
  let modalRowsCacheRoot = "";

  function invalidate() {
    modalRowsCache = null;
    modalRowsCacheRoot = "";
  }

  function buildModalRows(index) {
    const normalize = (v) => String(v == null ? "" : v).trim();
    const pad2 = (n) => String(n).padStart(2, "0");
    const formatYmd = (ms) => {
      const d = new Date(ms);
      if (!Number.isFinite(d.getTime())) return "";
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    };

    const rows = [];
    for (const file of index.files || []) {
      const modified = file && file.updatedAtMs ? formatYmd(file.updatedAtMs) : "";
      const filePath = file && file.path ? file.path : "";
      const fileLabel = file && file.basename ? file.basename : safeBasename(filePath);
      const tunes = file && Array.isArray(file.tunes) ? file.tunes : [];
      for (const tune of tunes) {
        const xNumber = tune && tune.xNumber != null ? tune.xNumber : "";
        const title = tune && (tune.title || tune.preview) ? (tune.title || tune.preview) : "";
        const composer = tune && tune.composer ? tune.composer : "";
        const origin = tune && tune.origin ? tune.origin : "";
        const group = tune && tune.group ? tune.group : "";
        const key = tune && tune.key ? tune.key : "";
        const meter = tune && tune.meter ? tune.meter : "";
        const tempo = tune && tune.tempo ? tune.tempo : "";
        const rhythm = tune && tune.rhythm ? tune.rhythm : "";
        const searchText = `${normalize(fileLabel)} ${normalize(xNumber)} ${normalize(title)} ${normalize(composer)} ${normalize(key)} ${normalize(meter)} ${normalize(tempo)} ${normalize(rhythm)} ${normalize(origin)} ${normalize(group)} ${normalize(modified)}`.toLowerCase();
        rows.push({
          file: fileLabel,
          filePath,
          tuneId: tune && tune.id ? tune.id : "",
          tuneNo: xNumber,
          xNumber,
          title,
          composer,
          origin,
          group,
          key,
          meter,
          tempo,
          rhythm,
          modified,
          searchText,
        });
      }
    }
    return rows;
  }

  function getModalRows() {
    const index = typeof getIndex === "function" ? getIndex() : null;
    if (!index || !index.root || !Array.isArray(index.files) || !index.files.length) return [];
    if (modalRowsCache && modalRowsCacheRoot === index.root) return modalRowsCache;
    modalRowsCache = buildModalRows(index);
    modalRowsCacheRoot = index.root;
    return modalRowsCache;
  }

  return {
    invalidate,
    getModalRows,
  };
}
