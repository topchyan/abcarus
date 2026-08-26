function text(value) {
  return String(value == null ? "" : value).trim();
}

function addField(fields, key, value) {
  const cleanKey = text(key);
  const cleanValue = text(value);
  if (!cleanKey || !cleanValue) return;
  if (!fields[cleanKey]) fields[cleanKey] = [];
  if (!fields[cleanKey].includes(cleanValue)) fields[cleanKey].push(cleanValue);
}

function parseTuneHeaderFields(abcText) {
  const fields = {};
  let sawKey = false;
  for (const rawLine of String(abcText || "").split(/\r\n|\n|\r/)) {
    const line = String(rawLine || "");
    const match = line.match(/^\s*([A-Za-z]):\s*(.*)$/);
    if (match) {
      const field = match[1].toUpperCase();
      const value = match[2].trim();
      if (field === "G") {
        const facet = value.match(/^\[([A-Za-z][A-Za-z0-9_-]*)\]\s*(.*)$/);
        if (facet && facet[2].trim()) addField(fields, `G:${facet[1].toLowerCase()}`, facet[2]);
        else addField(fields, "G", value);
      } else {
        addField(fields, field, value);
      }
      if (field === "K") sawKey = true;
      continue;
    }
    if (sawKey && line.trim() && !/^\s*%/.test(line)) break;
  }
  return fields;
}

function splitAbcTunes(abcText) {
  const source = String(abcText || "");
  const starts = [];
  const re = /^[ \t]*X:/gm;
  let match;
  while ((match = re.exec(source)) !== null) starts.push(match.index);
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length));
}

function extractTuneListItemsFromAbc(abcText, { sourceFile = "" } = {}) {
  return splitAbcTunes(abcText).map((tuneText, index) => ({
    index,
    fields: parseTuneHeaderFields(tuneText),
    sourceFile: text(sourceFile),
  }));
}

function normalizeTuneListItem(item, index) {
  const fields = {};
  for (const [key, values] of Object.entries(item && item.fields || {})) {
    (Array.isArray(values) ? values : [values]).forEach((value) => addField(fields, key, value));
  }
  if (!fields.T) addField(fields, "T", item && (item.title || item.preview) || `Tune ${index + 1}`);
  if (!fields.C) {
    const composers = Array.isArray(item && item.composers) ? item.composers : [item && item.composer];
    composers.forEach((composer) => addField(fields, "C", composer));
  }
  if (!fields.K) addField(fields, "K", item && (item.originalKey || item.key));
  if (!fields.X) addField(fields, "X", item && (item.xNumber || item.x));
  return {
    index,
    fields,
    sourceFile: text(item && (item.sourceFile || item.sourcePath || item.filePath)).split(/[\\/]/).pop() || "",
  };
}

function fieldValue(item, column) {
  if (column === "number") return String(item.index + 1);
  if (column === "source") return item.sourceFile;
  return (item.fields[column] || []).join("; ");
}

function getColumnLabel(column) {
  if (column === "number") return "No.";
  if (column === "source") return "Source file";
  if (column.startsWith("G:")) return `G:[${column.slice(2)}]`;
  return column;
}

function discoverTuneListColumns(items) {
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const normalized = normalizeTuneListItem(item, index);
    Object.keys(normalized.fields).forEach((key) => seen.add(key));
    if (normalized.sourceFile) seen.add("source");
  });
  const priority = ["X", "T", "C", "K", "M", "L", "Q", "R", "O", "S", "A", "B", "D", "F", "H", "N", "P", "Z", "G"];
  const rank = new Map(priority.map((key, index) => [key, index]));
  return ["number", ...Array.from(seen).sort((a, b) => {
    const aRank = rank.has(a) ? rank.get(a) : (a.startsWith("G:") ? 100 : 80);
    const bRank = rank.has(b) ? rank.get(b) : (b.startsWith("G:") ? 100 : 80);
    return (aRank - bRank) || a.localeCompare(b);
  })];
}

function compareText(a, b) {
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: "base" });
}

function sortTuneListItems(items, order = "original", direction = "asc") {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeTuneListItem);
  if (order === "original") return normalized;
  const multiplier = direction === "desc" ? -1 : 1;
  return normalized.slice().sort((a, b) => {
    const primary = compareText(fieldValue(a, order), fieldValue(b, order)) * multiplier;
    return primary || compareText(fieldValue(a, "T"), fieldValue(b, "T")) || (a.index - b.index);
  });
}

function csvCell(value, delimiter) {
  const valueText = text(value);
  if (!/["\r\n]/.test(valueText) && !valueText.includes(delimiter)) return valueText;
  return `"${valueText.replace(/"/g, '""')}"`;
}

function buildTuneListText(items, {
  order = "original",
  direction = "asc",
  format = "csv",
  columns = ["number", "T", "C", "K"],
} = {}) {
  const selectedColumns = (Array.isArray(columns) ? columns : []).filter(Boolean);
  if (!selectedColumns.length) return "";
  const sorted = sortTuneListItems(items, order, direction);
  if (format === "plain") {
    return sorted.map((item, index) => {
      const values = selectedColumns.map((column) => (
        column === "number" ? String(index + 1) : fieldValue(item, column)
      )).filter(Boolean);
      const prefix = selectedColumns[0] === "number" ? `${values.shift()}. ` : "";
      return `${prefix}${values.join(" — ")}`;
    }).join("\n");
  }
  const delimiter = format === "tsv" ? "\t" : ",";
  const rows = [selectedColumns.map(getColumnLabel)];
  sorted.forEach((item, index) => rows.push(selectedColumns.map((column) => (
    column === "number" ? String(index + 1) : fieldValue(item, column)
  ))));
  return rows.map((row) => row.map((value) => csvCell(value, delimiter)).join(delimiter)).join("\n");
}

function createTuneListExportController({
  modal, closeButton, sourceLabel, orderSelect, directionSelect, formatSelect,
  columnsContainer, preview, cancelButton, copyButton, exportButton,
  clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null,
  exportText = async () => false,
  showToast = () => {},
} = {}) {
  let sourceItems = [];
  let sourceTitle = "Tune List";

  function getSelectedColumns() {
    if (!columnsContainer) return [];
    return Array.from(columnsContainer.querySelectorAll("input[data-column]:checked"))
      .map((input) => input.dataset.column).filter(Boolean);
  }

  function refresh() {
    if (!preview) return "";
    const output = buildTuneListText(sourceItems, {
      order: orderSelect ? orderSelect.value : "original",
      direction: directionSelect ? directionSelect.value : "asc",
      format: formatSelect ? formatSelect.value : "csv",
      columns: getSelectedColumns(),
    });
    preview.value = output;
    if (directionSelect) directionSelect.disabled = !orderSelect || orderSelect.value === "original";
    if (copyButton) copyButton.disabled = !output;
    if (exportButton) exportButton.disabled = !output;
    return output;
  }

  function renderColumns() {
    const columns = discoverTuneListColumns(sourceItems);
    if (orderSelect) {
      orderSelect.textContent = "";
      for (const column of ["original", ...columns.filter((value) => value !== "number")]) {
        const option = document.createElement("option");
        option.value = column;
        option.textContent = column === "original" ? "Current order" : getColumnLabel(column);
        orderSelect.appendChild(option);
      }
    }
    if (!columnsContainer) return;
    columnsContainer.textContent = "";
    for (const column of columns) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.column = column;
      input.checked = ["number", "T", "C", "K"].includes(column);
      input.addEventListener("change", refresh);
      label.append(input, document.createTextNode(` ${getColumnLabel(column)}`));
      columnsContainer.appendChild(label);
    }
  }

  function close() {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function open({ title = "Tune List", items = [] } = {}) {
    if (!modal) return false;
    sourceItems = Array.isArray(items) ? items.slice() : [];
    sourceTitle = String(title || "Tune List");
    if (sourceLabel) sourceLabel.textContent = sourceTitle;
    if (formatSelect) formatSelect.value = "csv";
    if (directionSelect) directionSelect.value = "asc";
    renderColumns();
    if (orderSelect) orderSelect.value = "original";
    refresh();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (orderSelect) orderSelect.focus();
    return true;
  }

  async function copy() {
    const output = refresh();
    if (!output || !clipboard || typeof clipboard.writeText !== "function") return false;
    await clipboard.writeText(output);
    showToast(`Copied ${sourceItems.length} tunes.`, 2200);
    return true;
  }

  async function exportFile() {
    const output = refresh();
    if (!output) return false;
    const format = formatSelect ? formatSelect.value : "csv";
    const extension = format === "plain" ? "txt" : format;
    const ok = await exportText({ content: `${output}\n`, suggestedName: `${sourceTitle}.${extension}` });
    if (ok) showToast(`Exported ${sourceItems.length} tunes.`, 2200);
    return Boolean(ok);
  }

  if (closeButton) closeButton.addEventListener("click", close);
  if (cancelButton) cancelButton.addEventListener("click", close);
  if (orderSelect) orderSelect.addEventListener("change", refresh);
  if (directionSelect) directionSelect.addEventListener("change", refresh);
  if (formatSelect) formatSelect.addEventListener("change", refresh);
  if (copyButton) copyButton.addEventListener("click", () => { copy().catch(() => {}); });
  if (exportButton) exportButton.addEventListener("click", () => { exportFile().catch(() => {}); });
  if (modal) modal.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  });

  return { close, open, refresh };
}

export {
  buildTuneListText,
  createTuneListExportController,
  discoverTuneListColumns,
  extractTuneListItemsFromAbc,
  parseTuneHeaderFields,
  sortTuneListItems,
};
