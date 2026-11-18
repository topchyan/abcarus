const { execFile } = require("child_process");
const { resolvePythonExecutable, pythonEnvForExecutable } = require("./conversion/utils");

function runPythonJson(pythonPath) {
  const code = [
    "import json, pathlib, music21",
    "root = pathlib.Path(music21.__file__).resolve().parent / 'corpus'",
    "print(json.dumps({'root': str(root), 'version': getattr(music21, '__version__', '')}))",
  ].join("; ");
  return new Promise((resolve, reject) => {
    execFile(pythonPath, ["-c", code], {
      timeout: 10000,
      env: { ...process.env, ...pythonEnvForExecutable(pythonPath) },
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || stdout || error.message || error).trim()));
        return;
      }
      try {
        resolve(JSON.parse(String(stdout || "").trim()));
      } catch {
        reject(new Error("Unable to locate the built-in music21 corpus."));
      }
    });
  });
}

async function collectCollectionFiles(fs, path, corpusRoot) {
  const files = [];
  async function walk(dirPath) {
    for (const entry of await fs.promises.readdir(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith(".abc") || lower.startsWith("license")) {
          files.push({ source: fullPath, relative: path.relative(corpusRoot, fullPath) });
        }
      }
    }
  }
  await walk(corpusRoot);
  return files;
}

async function uniqueDestination(fs, path, parentDir, baseName) {
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const name = suffix === 1 ? baseName : `${baseName} (${suffix})`;
    const candidate = path.join(parentDir, name);
    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
    } catch {
      return candidate;
    }
  }
  throw new Error("Unable to create a unique collection folder.");
}

async function copyBundledAbcCollection({ fs, path, corpusRoot, destinationParent, version = "" }) {
  const sourceRoot = path.resolve(corpusRoot);
  const destination = await uniqueDestination(fs, path, destinationParent, "music21 ABC Collection");
  const files = await collectCollectionFiles(fs, path, sourceRoot);
  const abcCount = files.filter((entry) => entry.relative.toLowerCase().endsWith(".abc")).length;
  if (!abcCount) throw new Error("The bundled music21 corpus contains no ABC files.");

  await fs.promises.mkdir(destination, { recursive: false });
  try {
    for (const entry of files) {
      const target = path.resolve(destination, entry.relative);
      if (!target.startsWith(`${path.resolve(destination)}${path.sep}`)) {
        throw new Error("Invalid path in the bundled collection.");
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(entry.source, target);
    }
    const readme = [
      "music21 ABC Collection",
      "",
      `Imported by ABCarus from the bundled music21 corpus${version ? ` ${version}` : ""}.`,
      "These are editable copies; the application-bundled originals remain read-only.",
      "License files supplied with the corpus are preserved beside the music files.",
      "",
    ].join("\n");
    await fs.promises.writeFile(path.join(destination, "README.txt"), readme, "utf8");
  } catch (error) {
    await fs.promises.rm(destination, { recursive: true, force: true });
    throw error;
  }
  return { ok: true, root: destination, count: abcCount, version };
}

async function importBundledAbcCollection({ fs, path, dialog, app, parent }) {
  const pythonPath = await resolvePythonExecutable();
  const info = await runPythonJson(pythonPath);
  const result = await dialog.showOpenDialog(parent || undefined, {
    modal: true,
    title: "Choose Location for Built-in ABC Collection",
    defaultPath: app && typeof app.getPath === "function" ? app.getPath("documents") : undefined,
    properties: ["openDirectory", "createDirectory"],
  });
  if (!result || result.canceled || !result.filePaths || !result.filePaths.length) {
    return { ok: false, cancelled: true };
  }
  return copyBundledAbcCollection({
    fs,
    path,
    corpusRoot: info.root,
    destinationParent: result.filePaths[0],
    version: info.version,
  });
}

module.exports = {
  collectCollectionFiles,
  copyBundledAbcCollection,
  importBundledAbcCollection,
};
