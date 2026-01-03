export function normalizeLibraryPath(input) {
  let value = String(input || "").trim();
  if (!value) return "";
  value = value.replace(/\\/g, "/");
  value = value.replace(/^\.\//, "");
  value = value.replace(/\/{2,}/g, "/");
  // Case-insensitive compare on Windows-like drive paths.
  if (/^[a-zA-Z]:\//.test(value)) value = value.toLowerCase();
  return value;
}

export function pathsEqual(a, b) {
  const na = normalizeLibraryPath(a);
  const nb = normalizeLibraryPath(b);
  if (!na || !nb) return false;
  return na === nb;
}

