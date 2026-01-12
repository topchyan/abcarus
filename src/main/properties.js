function parseBoolean(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parseNumber(raw) {
  const n = Number(String(raw || "").trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseProperties(text) {
  const out = new Map();
  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (!key) continue;
    out.set(key, value);
  }
  return out;
}

function encodeValue(value, type) {
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") return Number.isFinite(Number(value)) ? String(Number(value)) : "";
  if (type === "array" || type === "object") {
    try { return JSON.stringify(value == null ? (type === "array" ? [] : {}) : value); } catch { return type === "array" ? "[]" : "{}"; }
  }
  return String(value == null ? "" : value);
}

function encodePropertiesFromSchema(settings, schema) {
  const s = settings && typeof settings === "object" ? settings : {};
  const lines = [];
  lines.push("# ABCarus settings (export)");
  lines.push("# Format: key=value (UTF-8)");
  lines.push("# booleans: true/false");
  lines.push("# numbers: plain (e.g. 1.0)");
  lines.push("# arrays/objects: JSON in one line");
  lines.push("");
  const bySection = new Map();
  for (const entry of (Array.isArray(schema) ? schema : [])) {
    if (!entry || !entry.key) continue;
    const section = entry.section || "General";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(entry);
  }
  for (const [section, entries] of bySection.entries()) {
    lines.push(`# ${section}`);
    for (const entry of entries) {
      if (!entry || !entry.key) continue;
      // Keep global header text in file form (user_settings.abc) instead of embedding multi-line strings here.
      if (entry.key === "globalHeaderText") continue;
      const value = (Object.prototype.hasOwnProperty.call(s, entry.key) && s[entry.key] !== undefined)
        ? s[entry.key]
        : entry.default;
      const raw = encodeValue(value, entry.type);
      lines.push(`${entry.key}=${raw}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function parseSettingsPatchFromProperties(propertiesText, schema) {
  const map = parseProperties(propertiesText);
  const schemaMap = new Map();
  for (const entry of (Array.isArray(schema) ? schema : [])) {
    if (!entry || !entry.key) continue;
    schemaMap.set(entry.key, entry);
  }
  const patch = {};
  for (const [key, raw] of map.entries()) {
    const entry = schemaMap.get(key);
    if (!entry) continue;
    if (entry.key === "globalHeaderText") continue;
    if (entry.type === "boolean") {
      const v = parseBoolean(raw);
      if (v == null) continue;
      patch[key] = v;
      continue;
    }
    if (entry.type === "number") {
      const v = parseNumber(raw);
      if (v == null) continue;
      patch[key] = v;
      continue;
    }
    if (entry.type === "array") {
      const v = parseJson(raw);
      if (!Array.isArray(v)) continue;
      patch[key] = v;
      continue;
    }
    if (entry.type === "object") {
      const v = parseJson(raw);
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      patch[key] = v;
      continue;
    }
    patch[key] = String(raw == null ? "" : raw);
  }
  return patch;
}

module.exports = {
  encodePropertiesFromSchema,
  parseSettingsPatchFromProperties,
};
