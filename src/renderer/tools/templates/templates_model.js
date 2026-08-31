function buildTemplatesFlatList(files, { safeBasename } = {}) {
  const rows = [];
  const basename = typeof safeBasename === "function"
    ? safeBasename
    : (filePath) => String(filePath || "").split(/[\\/]/).filter(Boolean).pop() || "";
  for (const file of files || []) {
    const filePath = file && file.path ? String(file.path) : "";
    const fileBasename = file && file.basename ? String(file.basename) : basename(filePath);
    const tunes = (file && file.tunes) ? file.tunes : [];
    if (tunes.length) {
      for (const tune of tunes) {
        if (!tune || !Number.isFinite(Number(tune.startOffset)) || !Number.isFinite(Number(tune.endOffset))) continue;
        rows.push({
          key: `${filePath}::${tune.startOffset}`,
          filePath,
          fileBasename,
          startOffset: Number(tune.startOffset),
          endOffset: Number(tune.endOffset),
          xNumber: tune.xNumber ? String(tune.xNumber) : "",
          title: tune.title ? String(tune.title) : "",
          composer: tune.composer ? String(tune.composer) : "",
          keySignature: tune.key ? String(tune.key) : "",
          meter: tune.meter ? String(tune.meter) : "",
          preview: tune.preview ? String(tune.preview) : "",
        });
      }
    } else {
      const length = Number(file && file.length);
      if (Number.isFinite(length) && length > 0) {
        rows.push({
          key: `${filePath}::full`,
          filePath,
          fileBasename,
          startOffset: 0,
          endOffset: length,
          xNumber: "",
          title: fileBasename || "Untitled",
          composer: "",
          keySignature: "",
          meter: "",
          preview: "Full file",
        });
      }
    }
  }
  return rows;
}

function filterTemplates(items, query) {
  const q = String(query || "").trim().toLowerCase();
  const source = Array.isArray(items) ? items : [];
  if (!q) return source;
  return source.filter((item) => {
    const hay = `${item.title} ${item.composer} ${item.xNumber} ${item.keySignature} ${item.meter} ${item.fileBasename}`.toLowerCase();
    return hay.includes(q);
  });
}

function getTemplateSubtitle(item) {
  const parts = [item && item.xNumber ? `X:${item.xNumber}` : "X:"];
  if (item && item.keySignature) parts.push(`K:${item.keySignature}`);
  if (item && item.meter) parts.push(`M:${item.meter}`);
  if (item && item.composer) parts.push(item.composer);
  if (item && item.preview === "Full file") parts.push("full file");
  return parts.join(" · ");
}

function getTemplateDisplayTitle(item) {
  return (item && (item.title || item.preview)) ? (item.title || item.preview) : "Untitled";
}

function getTemplatePreviewTitle(item) {
  return `${getTemplateDisplayTitle(item)} (${getTemplateSubtitle(item)})`;
}

function getTemplateSlice(fullText, item) {
  const full = String(fullText || "");
  const start = Number(item && item.startOffset) || 0;
  const end = Number(item && item.endOffset) || 0;
  return full ? full.slice(start, Math.max(start, end)) : "";
}

export {
  buildTemplatesFlatList,
  filterTemplates,
  getTemplateDisplayTitle,
  getTemplatePreviewTitle,
  getTemplateSlice,
  getTemplateSubtitle,
};
