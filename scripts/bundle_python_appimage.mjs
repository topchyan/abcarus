#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const appDir = getArgValue("--appdir");
const pythonRoot = getArgValue("--python-root");
const verbose = args.has("--verbose");

if (!appDir) {
  console.error("Usage: node scripts/bundle_python_appimage.mjs --appdir <AppDir> [--python-root <dir>] [--verbose]");
  process.exit(1);
}

const resolvedAppDir = path.resolve(appDir);
const destRoot = path.join(resolvedAppDir, "usr", "share", "abcarus");

const pythonScripts = await findPythonScripts(repoRoot);
const importMap = await buildImportMap(pythonScripts);
const allImports = new Set();
for (const imports of importMap.values()) {
  for (const mod of imports) allImports.add(mod);
}

let stdlibDir = null;
let stdlibModules = new Set();
if (pythonRoot) {
  stdlibDir = await findStdlibDir(pythonRoot);
  if (stdlibDir) {
    stdlibModules = await collectStdlibModules(stdlibDir);
  }
}

const externalImports = [];
if (stdlibDir) {
  for (const mod of Array.from(allImports).sort()) {
    if (!stdlibModules.has(mod)) externalImports.push(mod);
  }
}

await copyPythonScripts(destRoot, pythonScripts);

const copiedRuntime = pythonRoot ? await copyPythonRuntime(pythonRoot, resolvedAppDir) : {};

if (verbose) {
  const manifest = {
    appDir: resolvedAppDir,
    pythonRoot: pythonRoot ? path.resolve(pythonRoot) : null,
    stdlibDir,
    scripts: pythonScripts.map((scriptPath) => ({
      source: scriptPath,
      destination: path.join(destRoot, path.relative(repoRoot, scriptPath)),
      imports: Array.from(importMap.get(scriptPath)).sort(),
    })),
    imports: Array.from(allImports).sort(),
    externalImports,
    copiedRuntime,
  };
  console.log(JSON.stringify(manifest, null, 2));
}

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function findPythonScripts(root) {
  // Only ship the tool scripts that ABCarus actually executes.
  // Do NOT scan/copy bundled runtimes (e.g. python stdlib under third_party/python-embed),
  // as that explodes AppImage size and duplicates the runtime that is copied separately.
  const toolDirs = [
    path.join(root, "third_party", "abc2xml"),
    path.join(root, "third_party", "xml2abc"),
  ];
  const scripts = [];
  for (const dir of toolDirs) {
    if (!(await existsDir(dir))) continue;
    await walkDir(dir, (entryPath, dirent) => {
      if (dirent.isFile() && entryPath.endsWith(".py")) scripts.push(entryPath);
    });
  }
  return scripts;
}

async function walkDir(dir, onEntry) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const entryPath = path.join(dir, entry.name);
    await onEntry(entryPath, entry);
    if (entry.isDirectory()) await walkDir(entryPath, onEntry);
  }
}

async function buildImportMap(scripts) {
  const map = new Map();
  for (const scriptPath of scripts) {
    const text = await fs.promises.readFile(scriptPath, "utf8");
    const imports = collectImports(text);
    map.set(scriptPath, imports);
  }
  return map;
}

function collectImports(text) {
  const modules = new Set();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const fromMatch = trimmed.match(/\bfrom\s+([a-zA-Z0-9_\.]+)\s+import\s+/);
    if (fromMatch) {
      modules.add(fromMatch[1].split(".")[0]);
      continue;
    }

    const importMatch = trimmed.match(/\bimport\s+(.+)/);
    if (importMatch) {
      const raw = importMatch[1].split("#")[0];
      for (const part of raw.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0];
        if (name) modules.add(name.split(".")[0]);
      }
    }
  }
  return modules;
}

async function findStdlibDir(pythonRootDir) {
  const root = path.resolve(pythonRootDir);
  const libDir = path.join(root, "lib");
  const lib64Dir = path.join(root, "lib64");
  const winLibDir = path.join(root, "Lib");
  const candidates = [];

  if (await existsDir(libDir)) {
    const entries = await fs.promises.readdir(libDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("python")) {
        candidates.push(path.join(libDir, entry.name));
      }
    }
  }

  if (await existsDir(lib64Dir)) {
    const entries = await fs.promises.readdir(lib64Dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("python")) {
        candidates.push(path.join(lib64Dir, entry.name));
      }
    }
  }

  if (await existsDir(winLibDir)) {
    candidates.push(winLibDir);
  }

  for (const candidate of candidates) {
    if (await existsFile(path.join(candidate, "os.py"))) return candidate;
  }
  return null;
}

async function collectStdlibModules(stdlibDir) {
  const mods = new Set();
  const entries = await fs.promises.readdir(stdlibDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".py")) {
      mods.add(entry.name.replace(/\.py$/, ""));
    } else if (entry.isDirectory()) {
      if (await existsFile(path.join(stdlibDir, entry.name, "__init__.py"))) {
        mods.add(entry.name);
      }
    }
  }
  return mods;
}

async function copyPythonScripts(destBase, scripts) {
  for (const scriptPath of scripts) {
    const relPath = path.relative(repoRoot, scriptPath);
    const destPath = path.join(destBase, relPath);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.copyFile(scriptPath, destPath);
  }
}

async function copyPythonRuntime(pythonRootDir, appDirPath) {
  const root = path.resolve(pythonRootDir);
  const destUsr = path.join(appDirPath, "usr");
  const copied = {};

  const binDir = path.join(root, "bin");
  if (await existsDir(binDir)) {
    await fs.promises.cp(binDir, path.join(destUsr, "bin"), { recursive: true });
    copied.bin = true;
    const python3Path = path.join(destUsr, "bin", "python3");
    if (await existsFile(python3Path)) {
      await fs.promises.chmod(python3Path, 0o755);
    }
  }

  const libDir = path.join(root, "lib");
  if (await existsDir(libDir)) {
    await fs.promises.cp(libDir, path.join(destUsr, "lib"), { recursive: true });
    copied.lib = true;
  }

  const lib64Dir = path.join(root, "lib64");
  if (await existsDir(lib64Dir)) {
    await fs.promises.cp(lib64Dir, path.join(destUsr, "lib64"), { recursive: true });
    copied.lib64 = true;
  }

  const winLibDir = path.join(root, "Lib");
  if (await existsDir(winLibDir)) {
    await fs.promises.cp(winLibDir, path.join(destUsr, "Lib"), { recursive: true });
    copied.Lib = true;
  }

  return copied;
}

async function existsDir(dirPath) {
  try {
    const stat = await fs.promises.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function existsFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
