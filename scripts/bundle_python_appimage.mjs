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

const copiedRuntime = pythonRoot ? await copyPythonRuntime(pythonRoot, resolvedAppDir) : {};

if (verbose) {
  const manifest = {
    appDir: resolvedAppDir,
    pythonRoot: pythonRoot ? path.resolve(pythonRoot) : null,
    copiedRuntime,
  };
  console.log(JSON.stringify(manifest, null, 2));
}

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function copyPythonRuntime(pythonRootDir, appDirPath) {
  const root = path.resolve(pythonRootDir);
  const destUsr = path.join(appDirPath, "usr");
  const copied = {};

  const binDir = path.join(root, "bin");
  if (await existsDir(binDir)) {
    await fs.promises.cp(binDir, path.join(destUsr, "bin"), { recursive: true, verbatimSymlinks: true });
    copied.bin = true;
    const python3Path = path.join(destUsr, "bin", "python3");
    if (await existsFile(python3Path)) {
      await fs.promises.chmod(python3Path, 0o755);
    }
  }

  const libDir = path.join(root, "lib");
  if (await existsDir(libDir)) {
    await fs.promises.cp(libDir, path.join(destUsr, "lib"), { recursive: true, verbatimSymlinks: true });
    copied.lib = true;
  }

  const lib64Dir = path.join(root, "lib64");
  if (await existsDir(lib64Dir)) {
    await fs.promises.cp(lib64Dir, path.join(destUsr, "lib64"), { recursive: true, verbatimSymlinks: true });
    copied.lib64 = true;
  }

  const winLibDir = path.join(root, "Lib");
  if (await existsDir(winLibDir)) {
    await fs.promises.cp(winLibDir, path.join(destUsr, "Lib"), { recursive: true, verbatimSymlinks: true });
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
