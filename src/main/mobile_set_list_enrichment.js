"use strict";

function isWithinRoot(path, root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function cleanPathHint(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

async function listAbcFiles(fs, path, rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const directory = stack.pop();
    let entries = [];
    try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".abc")) files.push(absolute);
    }
  }
  return files;
}

function chooseSourcePath(path, rootDir, files, pathHint) {
  const hint = cleanPathHint(pathHint);
  if (!hint || path.posix.extname(hint).toLowerCase() !== ".abc") return "";
  const direct = path.isAbsolute(hint)
    ? path.resolve(hint)
    : path.resolve(rootDir, ...hint.split("/"));
  if (isWithinRoot(path, rootDir, direct) && files.includes(direct)) return direct;
  const comparable = hint.toLocaleLowerCase("en");
  const matches = files.filter((filePath) => {
    const relative = path.relative(rootDir, filePath).split(path.sep).join("/").toLocaleLowerCase("en");
    return relative === comparable || relative.endsWith(`/${comparable}`)
      || path.basename(filePath).toLocaleLowerCase("en") === path.posix.basename(comparable);
  });
  return matches.length === 1 ? matches[0] : "";
}

function fillMissingTuneMetadata(snapshot, tune) {
  if (!snapshot || typeof snapshot !== "object" || !tune || typeof tune !== "object") return false;
  let changed = false;
  for (const key of ["title", "composer", "key", "rhythm", "origin"]) {
    if (String(snapshot[key] || "").trim() || !String(tune[key] || "").trim()) continue;
    snapshot[key] = String(tune[key]);
    changed = true;
  }
  if ((!Array.isArray(snapshot.groups) || snapshot.groups.length === 0) && Array.isArray(tune.groups) && tune.groups.length) {
    snapshot.groups = tune.groups.map(String).filter(Boolean);
    changed = true;
  }
  return changed;
}

async function enrichMobileSetListDocuments({ documents, rootDir, fs, path, parseFile } = {}) {
  const source = Array.isArray(documents) ? documents : [];
  if (!rootDir || !fs || !path || typeof parseFile !== "function") return structuredClone(source);
  const root = path.resolve(rootDir);
  const files = await listAbcFiles(fs, path, root);
  const result = structuredClone(source);
  const parsedByPath = new Map();

  for (const document of result) {
    for (const item of Array.isArray(document && document.items) ? document.items : []) {
      const snapshot = item && item.tune;
      const sourceHint = snapshot && snapshot.source && snapshot.source.pathHint;
      const filePath = chooseSourcePath(path, root, files, sourceHint);
      if (!filePath) continue;
      if (!parsedByPath.has(filePath)) {
        try { parsedByPath.set(filePath, await parseFile(filePath)); } catch { parsedByPath.set(filePath, null); }
      }
      const parsed = parsedByPath.get(filePath);
      const tunes = parsed && Array.isArray(parsed.tunes) ? parsed.tunes : [];
      const xNumber = String(snapshot.source && snapshot.source.xNumberHint || "");
      let matches = xNumber ? tunes.filter((tune) => String(tune.xNumber || "") === xNumber) : [];
      if (matches.length !== 1) {
        const title = String(snapshot.title || "").normalize("NFKC").trim().toLocaleLowerCase("en");
        matches = title ? tunes.filter((tune) => String(tune.title || "").normalize("NFKC").trim().toLocaleLowerCase("en") === title) : [];
      }
      if (matches.length === 1) fillMissingTuneMetadata(snapshot, matches[0]);
    }
  }
  return result;
}

module.exports = { enrichMobileSetListDocuments, fillMissingTuneMetadata };
