import fs from "node:fs";
import path from "node:path";

// music21 imports music21.test.testRunner from its public __init__, so singular
// `test` packages are not generally safe to remove.
const TEST_DIR_NAMES = new Set(["tests", "__pycache__"]);

function isMusic21CorpusDir(dirPath) {
  return path.basename(dirPath).toLowerCase() === "corpus"
    && path.basename(path.dirname(dirPath)).toLowerCase() === "music21";
}

function shouldKeepCorpusFile(corpusRoot, filePath) {
  const relative = path.relative(corpusRoot, filePath);
  const extension = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  if (extension === ".abc") return true;
  if (basename.startsWith("license") || basename.startsWith("readme")) return true;
  return !relative.includes(path.sep) && extension === ".py";
}

async function pathSize(targetPath) {
  try {
    const stat = await fs.promises.lstat(targetPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.size;
    let total = 0;
    for (const entry of await fs.promises.readdir(targetPath)) {
      total += await pathSize(path.join(targetPath, entry));
    }
    return total;
  } catch {
    return 0;
  }
}

async function prunePythonRuntime(rootPath, { dryRun = false } = {}) {
  const root = path.resolve(rootPath);
  const removed = [];
  let bytes = 0;
  let corpusAbcFiles = 0;

  async function remove(targetPath, kind) {
    const size = await pathSize(targetPath);
    bytes += size;
    removed.push({ path: targetPath, kind, bytes: size });
    if (!dryRun) await fs.promises.rm(targetPath, { recursive: true, force: true });
  }

  async function pruneCorpus(corpusRoot) {
    async function walk(dirPath) {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const target = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase() === "__pycache__") {
            await remove(target, "cache");
            continue;
          }
          await walk(target);
          if (!dryRun) {
            const remaining = await fs.promises.readdir(target);
            if (!remaining.length) await fs.promises.rmdir(target);
          }
          continue;
        }
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".abc") {
          corpusAbcFiles += 1;
          continue;
        }
        if (!shouldKeepCorpusFile(corpusRoot, target)) await remove(target, "non-abc-corpus");
      }
    }
    await walk(corpusRoot);
  }

  async function walk(dirPath) {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (isMusic21CorpusDir(target)) {
          await pruneCorpus(target);
          continue;
        }
        if (TEST_DIR_NAMES.has(entry.name.toLowerCase())) {
          await remove(target, entry.name === "__pycache__" ? "cache" : "tests");
          continue;
        }
        await walk(target);
        continue;
      }
      if (entry.isFile() && /\.(?:pyc|pyo)$/i.test(entry.name)) await remove(target, "cache");
    }
  }

  const sitePackagesRoots = [];
  async function findSitePackages(dirPath) {
    if (path.basename(dirPath).toLowerCase() === "site-packages") {
      sitePackagesRoots.push(dirPath);
      return;
    }
    for (const entry of await fs.promises.readdir(dirPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      await findSitePackages(path.join(dirPath, entry.name));
    }
  }

  await findSitePackages(root);
  for (const sitePackagesRoot of sitePackagesRoots) await walk(sitePackagesRoot);
  return { root, dryRun, removedCount: removed.length, bytes, corpusAbcFiles, removed };
}

export { prunePythonRuntime, shouldKeepCorpusFile };
