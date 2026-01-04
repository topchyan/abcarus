const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");

class ConversionError extends Error {
  constructor(message, detail, code) {
    super(message);
    this.code = code;
    this.detail = detail || "";
  }
}

let cachedPython = null;

function resolveRepoRootFromHere() {
  // This file lives in `src/main/conversion/`.
  return path.resolve(__dirname, "..", "..", "..");
}

function getPythonEmbedPlatformArch() {
  if (process.platform === "win32") return "win-x64";
  if (process.platform === "darwin") return process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  if (process.platform === "linux") return "linux-x64";
  return "";
}

function bundledPythonCandidates() {
  const candidates = [];

  // Linux AppImage (already bundled by build script).
  if (process.env.APPDIR) {
    candidates.push(
      path.join(process.env.APPDIR, "usr", "bin", "python3"),
      path.join(process.env.APPDIR, "usr", "bin", "python")
    );
  }

  // Packaged app: include large binaries via app.asar.unpacked.
  const unpackedThirdParty = path.join(
    process.resourcesPath || "",
    "app.asar.unpacked",
    "third_party"
  );
  const embedDir = path.join(unpackedThirdParty, "python-embed", getPythonEmbedPlatformArch());

  if (process.platform === "win32") {
    candidates.push(path.join(embedDir, "python.exe"), path.join(embedDir, "python3.exe"));
  } else {
    candidates.push(path.join(embedDir, "python3"), path.join(embedDir, "python"));
  }

  // Dev tree (optional local runtime; typically gitignored).
  const devThirdParty = path.join(resolveRepoRootFromHere(), "third_party");
  const devEmbedDir = path.join(devThirdParty, "python-embed", getPythonEmbedPlatformArch());
  if (process.platform === "win32") {
    candidates.push(path.join(devEmbedDir, "python.exe"), path.join(devEmbedDir, "python3.exe"));
  } else {
    candidates.push(path.join(devEmbedDir, "python3"), path.join(devEmbedDir, "python"));
  }

  return candidates;
}

function pythonEnvForExecutable(pythonPath) {
  const exe = String(pythonPath || "");
  if (!exe) return {};
  const lower = exe.toLowerCase();
  const isBundled = lower.includes(`${path.sep}python-runtime${path.sep}`)
    || lower.includes(`${path.sep}python-embed${path.sep}`)
    || (Boolean(process.env.APPDIR)
      && exe.includes(path.sep)
      && path.resolve(exe).startsWith(path.resolve(process.env.APPDIR)));
  if (!isBundled) return { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
  // Embeddable Python on Windows often needs PYTHONHOME to find stdlib zip.
  return { PYTHONHOME: path.dirname(exe), PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
}

async function resolvePythonExecutable() {
  if (cachedPython) return cachedPython;
  const candidates = [];
  for (const c of bundledPythonCandidates()) candidates.push(c);
  if (process.platform === "win32") candidates.push("python");
  else candidates.push("python3", "python");

  for (const candidate of candidates) {
    try {
      if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
      const isPathLike = candidate.includes(path.sep);
      const probe = isPathLike
        ? "import sys; import os; print(sys.executable); print(os.getcwd())"
        : "print('ok')";
      await new Promise((resolve, reject) => {
        execFile(candidate, ["-c", probe], {
          timeout: 4000,
          env: { ...process.env, ...pythonEnvForExecutable(candidate) },
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      cachedPython = candidate;
      return candidate;
    } catch {}
  }
  throw new ConversionError(
    "Python not found.",
    "Install Python (3 recommended) or bundle an embeddable Python runtime to use import/export tools.",
    "PYTHON_NOT_FOUND"
  );
}

function resolveNodeExecutable() {
  return process.execPath;
}

async function runNodeScript({
  nodePath,
  scriptPath,
  args,
  cwd,
  timeoutMs = 20000,
  maxOutputBytes = 10 * 1024 * 1024,
}) {
  return runPythonScript({
    pythonPath: nodePath,
    scriptPath,
    args,
    cwd,
    timeoutMs,
    maxOutputBytes,
    env: { ELECTRON_RUN_AS_NODE: "1" },
  });
}

async function runPythonScript({
  pythonPath,
  scriptPath,
  args,
  cwd,
  timeoutMs = 20000,
  maxOutputBytes = 10 * 1024 * 1024,
  env,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, ...(args || [])], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        ...pythonEnvForExecutable(pythonPath),
        ...(env || {}),
      },
    });

    let stdoutLen = 0;
    let stderrLen = 0;
    const stdoutChunks = [];
    const stderrChunks = [];
    let finished = false;

    const fail = (err) => {
      if (finished) return;
      finished = true;
      reject(err);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new ConversionError("Converter timed out.", `Timed out after ${timeoutMs}ms.`, "CONVERSION_TIMEOUT"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutLen += chunk.length;
      if (stdoutLen > maxOutputBytes) {
        child.kill("SIGKILL");
        fail(new ConversionError("Converter output too large.", "Stdout exceeded limit.", "OUTPUT_TOO_LARGE"));
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrLen += chunk.length;
      if (stderrLen > maxOutputBytes) {
        child.kill("SIGKILL");
        fail(new ConversionError("Converter output too large.", "Stderr exceeded limit.", "OUTPUT_TOO_LARGE"));
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      fail(new ConversionError("Failed to launch converter.", err && err.message ? err.message : String(err), "SPAWN_FAILED"));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code !== 0) {
        reject(new ConversionError("Converter failed.", stderr || stdout || `Exit code ${code}`, "CONVERSION_FAILED"));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-"));
  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

async function findFirstFileByExt(dir, exts) {
  const candidates = exts.map((ext) => ext.toLowerCase());
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (candidates.includes(ext)) return path.join(dir, entry.name);
  }
  return null;
}

function parseArgString(value) {
  if (!value) return [];
  const text = String(value);
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens;
}

async function resolveExecutable(candidates, probeArgs = ["--help"]) {
  for (const candidate of candidates) {
    try {
      await new Promise((resolve, reject) => {
        execFile(candidate, probeArgs, { timeout: 4000 }, (err) => {
          if (err && err.code === "ENOENT") reject(err);
          else resolve();
        });
      });
      return candidate;
    } catch {}
  }
  throw new ConversionError(
    "Executable not found.",
    `Missing one of: ${candidates.join(", ")}`,
    "EXECUTABLE_NOT_FOUND"
  );
}

async function runProcess({
  command,
  args,
  cwd,
  timeoutMs = 20000,
  maxOutputBytes = 10 * 1024 * 1024,
  env,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args || [], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(env || {}) },
    });

    let stdoutLen = 0;
    let stderrLen = 0;
    const stdoutChunks = [];
    const stderrChunks = [];
    let finished = false;

    const fail = (err) => {
      if (finished) return;
      finished = true;
      reject(err);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new ConversionError("Process timed out.", `Timed out after ${timeoutMs}ms.`, "PROCESS_TIMEOUT"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutLen += chunk.length;
      if (stdoutLen > maxOutputBytes) {
        child.kill("SIGKILL");
        fail(new ConversionError("Output too large.", "Stdout exceeded limit.", "OUTPUT_TOO_LARGE"));
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrLen += chunk.length;
      if (stderrLen > maxOutputBytes) {
        child.kill("SIGKILL");
        fail(new ConversionError("Output too large.", "Stderr exceeded limit.", "OUTPUT_TOO_LARGE"));
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      fail(new ConversionError("Failed to launch process.", err && err.message ? err.message : String(err), "SPAWN_FAILED"));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code !== 0) {
        reject(new ConversionError("Process failed.", stderr || stdout || `Exit code ${code}`, "PROCESS_FAILED"));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

module.exports = {
  ConversionError,
  resolvePythonExecutable,
  resolveNodeExecutable,
  resolveExecutable,
  runPythonScript,
  runNodeScript,
  runProcess,
  withTempDir,
  findFirstFileByExt,
  parseArgString,
};
