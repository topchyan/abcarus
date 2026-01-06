#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import zlib from "zlib";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rmrf(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(p) {
  return sha256Buffer(fs.readFileSync(p));
}

function safeRel(entryName) {
  const p = String(entryName || "").replace(/\\/g, "/");
  if (!p) return null;
  if (p.includes("..")) return null;
  if (p.startsWith("/")) return null;
  return p;
}

function zipLocateEocd(buf) {
  const sig = 0x06054b50;
  const min = 22;
  const maxSearch = Math.min(buf.length - min, 0xffff + min);
  for (let back = 0; back <= maxSearch; back += 1) {
    const i = buf.length - min - back;
    if (i < 0) break;
    if (buf.readUInt32LE(i) !== sig) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    if (i + min + commentLen === buf.length) return i;
  }
  return -1;
}

function zipList(zipPath) {
  const zipBuf = fs.readFileSync(zipPath);
  const eocdOff = zipLocateEocd(zipBuf);
  if (eocdOff < 0) throw new Error(`Invalid zip (EOCD not found): ${zipPath}`);

  const diskNo = zipBuf.readUInt16LE(eocdOff + 4);
  const diskCd = zipBuf.readUInt16LE(eocdOff + 6);
  if (diskNo !== 0 || diskCd !== 0) throw new Error(`Multi-disk zip not supported: ${zipPath}`);

  const entryCount = zipBuf.readUInt16LE(eocdOff + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdOff + 16);

  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    throw new Error(`Zip64 not supported by this script: ${zipPath}`);
  }

  const sig = 0x02014b50;
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (zipBuf.readUInt32LE(p) !== sig) throw new Error(`Invalid central directory entry at ${p}: ${zipPath}`);
    const method = zipBuf.readUInt16LE(p + 10);
    const compSize = zipBuf.readUInt32LE(p + 20);
    const nameLen = zipBuf.readUInt16LE(p + 28);
    const extraLen = zipBuf.readUInt16LE(p + 30);
    const commentLen = zipBuf.readUInt16LE(p + 32);
    const localHeaderOff = zipBuf.readUInt32LE(p + 42);
    const name = zipBuf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compSize, localHeaderOff });
    p = p + 46 + nameLen + extraLen + commentLen;
  }

  return { zipBuf, entries };
}

function zipReadEntry(zip, entryName) {
  const entry = zip.entries.find((e) => e.name === entryName);
  if (!entry) return null;

  const buf = zip.zipBuf;
  const localSig = 0x04034b50;
  if (buf.readUInt32LE(entry.localHeaderOff) !== localSig) return null;

  const nameLen = buf.readUInt16LE(entry.localHeaderOff + 26);
  const extraLen = buf.readUInt16LE(entry.localHeaderOff + 28);
  const dataOff = entry.localHeaderOff + 30 + nameLen + extraLen;
  const comp = buf.slice(dataOff, dataOff + entry.compSize);

  if (entry.method === 0) return comp;
  if (entry.method === 8) return zlib.inflateRawSync(comp);
  return null;
}

function extractZipToDir(zipPath, destDir) {
  const zip = zipList(zipPath);
  for (const e of zip.entries) {
    const rel = safeRel(e.name);
    if (!rel) continue;
    if (rel.endsWith("/")) {
      ensureDir(path.join(destDir, rel));
      continue;
    }
    const buf = zipReadEntry(zip, e.name);
    if (!buf) continue;
    const abs = path.join(destDir, rel);
    ensureDir(path.dirname(abs));
    fs.writeFileSync(abs, buf);
    if (path.basename(abs) === "build") {
      try {
        fs.chmodSync(abs, 0o755);
      } catch {
        // ignore
      }
    }
  }
}

function stripAbc2svgVdate(text) {
  const lines = String(text || "").split(/\r?\n/);
  const filtered = lines.filter((ln) => !/^\s*abc2svg\.version=.*abc2svg\.vdate=.*\s*$/.test(ln));
  return filtered.join("\n");
}

function checkSndDrumContract(builtSndText) {
  const src = String(builtSndText || "");
  const callsDrum = src.includes("abc2svg.drum(");
  const definesDrum = src.includes("abc2svg.drum=") || src.includes("abc2svg.drum =") || src.includes("function abc2svg.drum");
  if (callsDrum && !definesDrum) {
    return {
      ok: false,
      message:
        "Built snd-1.js calls abc2svg.drum() but does not define it. " +
        "Upgrading only snd-1.js may break playback unless abc2svg.drum exists elsewhere.",
    };
  }
  return { ok: true, message: "" };
}

function atomicWriteFile(destPath, buf) {
  const dir = path.dirname(destPath);
  ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(destPath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, destPath);
}

function readMaybe(p) {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const args = { zip: null, apply: false, keepWorkdir: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--zip") args.zip = argv[++i] || null;
    else if (a === "--apply") args.apply = true;
    else if (a === "--keep-workdir") args.keepWorkdir = true;
    else if (a === "-h" || a === "--help") args.help = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.zip) {
    console.log(
      "Usage: node scripts/upgrade_abc2svg_from_source_zip.mjs --zip third_party/_upd/<abc2svg>.zip [--apply] [--keep-workdir]"
    );
    process.exit(args.help ? 0 : 2);
  }

  const root = repoRoot();
  const zipAbs = path.resolve(root, args.zip);
  if (!fileExists(zipAbs)) throw new Error(`Zip not found: ${args.zip}`);

  const outBase = path.join(root, "scripts", "local", "third-party-reviews");
  ensureDir(outBase);

  const workDir = fs.mkdtempSync(path.join(outBase, "abc2svg-upgrade-"));
  extractZipToDir(zipAbs, workDir);

  const topDirs = fs.readdirSync(workDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const srcRoot = topDirs.length === 1 ? path.join(workDir, topDirs[0]) : workDir;

  const buildScript = path.join(srcRoot, "build");
  if (!fileExists(buildScript)) throw new Error(`Not an abc2svg source archive (missing build): ${args.zip}`);

  const bash = process.platform === "win32" ? null : "bash";
  if (!bash) throw new Error("abc2svg build step requires bash (not available on win32).");

  const r = spawnSync(bash, ["./build"], { cwd: srcRoot, encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(`abc2svg build failed with exit code ${r.status}`);

  const destRoot = path.join(root, "third_party", "abc2svg");
  const candidates = [
    "abc2svg-1.js",
    "snd-1.js",
    "MIDI-1.js",
    "edit-1.js",
    "edit-1.xhtml",
    "edit-1.css",
  ];

  const changes = [];
  for (const f of candidates) {
    const builtPath = path.join(srcRoot, f);
    if (!fileExists(builtPath)) continue;
    const builtBuf = fs.readFileSync(builtPath);
    if (f === "snd-1.js") {
      const chk = checkSndDrumContract(builtBuf.toString("utf8"));
      if (!chk.ok) {
        console.error(`WARNING: ${chk.message}`);
      }
    }

    const destPath = path.join(destRoot, f);
    const localBuf = readMaybe(destPath);

    if (f === "abc2svg-1.js" && localBuf) {
      const a = sha256Buffer(Buffer.from(stripAbc2svgVdate(localBuf.toString("utf8")), "utf8"));
      const b = sha256Buffer(Buffer.from(stripAbc2svgVdate(builtBuf.toString("utf8")), "utf8"));
      if (a === b) {
        changes.push({ file: f, action: "skip (only vdate differs)" });
        continue;
      }
    }

    const localSha = localBuf ? sha256Buffer(localBuf) : null;
    const builtSha = sha256Buffer(builtBuf);
    const changed = !localSha || localSha !== builtSha;
    changes.push({ file: f, action: changed ? "update" : "unchanged", localSha, builtSha });

    if (args.apply && changed) {
      atomicWriteFile(destPath, builtBuf);
    }
  }

  console.log("\nabc2svg upgrade summary:");
  console.log(`- Source zip: ${args.zip}`);
  console.log(`- Zip SHA256: ${sha256File(zipAbs)}`);
  console.log(`- Extracted root: ${path.relative(root, srcRoot)}`);
  console.log(`- Apply: ${args.apply}`);
  for (const c of changes) {
    console.log(`  - ${c.file}: ${c.action}`);
  }

  if (args.keepWorkdir) {
    console.log(`- Workdir kept: ${path.relative(root, workDir)}`);
  } else {
    rmrf(workDir);
  }
}

try {
  main();
} catch (e) {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
}
