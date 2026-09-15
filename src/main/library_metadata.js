const CATALOG_FACET_RE = /^\s*\[([A-Za-z][A-Za-z0-9_-]*)\]\s*(.*?)\s*$/;

function parseCatalogGroupValues(groups) {
  const catalogFacets = {};
  for (const rawValue of Array.isArray(groups) ? groups : []) {
    const match = String(rawValue || "").match(CATALOG_FACET_RE);
    if (!match || !match[2]) continue;
    const facet = match[1].toLowerCase();
    if (facet === "__proto__" || facet === "prototype" || facet === "constructor") continue;
    const value = match[2].trim();
    if (!catalogFacets[facet]) catalogFacets[facet] = [];
    if (!catalogFacets[facet].includes(value)) catalogFacets[facet].push(value);
  }
  return catalogFacets;
}

function extractTuneHeader(lines, startIdx, endIdx) {
  let title = "";
  let composer = "";
  const composers = [];
  let key = "";
  let meter = "";
  let unitLength = "";
  let tempo = "";
  let rhythm = "";
  let source = "";
  let origin = "";
  const groups = [];
  const headerFields = {};
  let sawHeader = false;
  for (let i = startIdx; i <= endIdx; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    const isBlank = trimmed === "";
    const fieldMatch = line.match(/^\s*([A-Za-z]):\s*(.*)$/);
    const isHeader = Boolean(fieldMatch) || /^\s*%/.test(line);
    if (isHeader) sawHeader = true;
    const field = fieldMatch ? fieldMatch[1].toUpperCase() : "";
    const value = fieldMatch ? fieldMatch[2].trim() : "";
    if (field) {
      if (!headerFields[field]) headerFields[field] = [];
      if (value && !headerFields[field].includes(value)) headerFields[field].push(value);
    }
    if (!title && field === "T") title = value;
    if (field === "C") {
      if (value && !composers.includes(value)) composers.push(value);
      if (!composer) composer = value;
    }
    if (!key && field === "K") key = value;
    if (!meter && field === "M") meter = value;
    if (!unitLength && field === "L") unitLength = value;
    if (!tempo && field === "Q") tempo = value;
    if (!rhythm && field === "R") rhythm = value;
    if (!source && field === "S") source = value;
    if (!origin && field === "O") origin = value;
    if (field === "G") {
      if (value && !groups.includes(value)) groups.push(value);
    }
    if (sawHeader && isBlank) break;
    if (!isHeader && !isBlank) break;
  }
  return {
    title,
    composer,
    composers,
    key,
    meter,
    unitLength,
    tempo,
    rhythm,
    source,
    origin,
    group: groups[0] || "",
    groups,
    catalogFacets: parseCatalogGroupValues(groups),
    headerFields,
  };
}

module.exports = {
  extractTuneHeader,
  parseCatalogGroupValues,
};
