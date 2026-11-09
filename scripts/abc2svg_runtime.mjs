#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config", "abc2svg-runtime.json");
const runtimeDir = path.join(root, "third_party", "abc2svg");
const runtimeManifestPath = path.join(runtimeDir, "runtime-manifest.json");
const runtimeFilesPath = path.join(runtimeDir, "runtime-files.json");

function fail(message) {
  throw new Error(String(message || "abc2svg runtime operation failed"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, filePath);
}

function findEocd(buffer) {
  const signature = 0x06054b50;
  const minimum = 22;
  const maximumSearch = Math.min(buffer.length - minimum, 0xffff + minimum);
  for (let back = 0; back <= maximumSearch; back += 1) {
    const offset = buffer.length - minimum - back;
    if (offset >= 0 && buffer.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
}

function zipEntries(archive) {
  const eocd = findEocd(archive);
  if (eocd < 0) fail("Invalid ZIP archive: end-of-directory record not found");
  const count = archive.readUInt16LE(eocd + 10);
  const directoryOffset = archive.readUInt32LE(eocd + 16);
  if (count === 0xffff || directoryOffset === 0xffffffff) fail("ZIP64 archives are not supported");

  const entries = [];
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) fail(`Invalid ZIP directory entry at ${offset}`);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(archive, entry) {
  if (archive.readUInt32LE(entry.localOffset) !== 0x04034b50) fail(`Invalid ZIP entry: ${entry.name}`);
  const nameLength = archive.readUInt16LE(entry.localOffset + 26);
  const extraLength = archive.readUInt16LE(entry.localOffset + 28);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = archive.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  fail(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`);
}

function artifactFromArchive(archive, entries, fileName) {
  const matches = entries.filter((entry) => entry.name.endsWith(`/${fileName}`) || entry.name === fileName);
  if (matches.length !== 1) fail(`Expected one ${fileName} in archive, found ${matches.length}`);
  return readZipEntry(archive, matches[0]);
}

function managedFilesFromArchive(archive, entries) {
  const fileEntries = entries.filter(
    (entry) => entry.name && !entry.name.endsWith("/") && !entry.name.toLowerCase().endsWith(".php")
  );
  const roots = new Set(fileEntries.map((entry) => entry.name.split("/")[0]));
  if (roots.size !== 1) fail(`Expected one archive root, found ${[...roots].join(", ")}`);
  const prefix = `${[...roots][0]}/`;
  const files = new Map();
  for (const entry of fileEntries) {
    if (!entry.name.startsWith(prefix)) fail(`Archive entry is outside ${prefix}: ${entry.name}`);
    const relative = entry.name.slice(prefix.length);
    if (!relative || relative.startsWith("/") || relative.split("/").includes("..")) {
      fail(`Unsafe archive path: ${entry.name}`);
    }
    files.set(relative, readZipEntry(archive, entry));
  }
  return files;
}

function applyPatch(contents, patch, actualInputSha) {
  if (actualInputSha !== patch.expectedInputSha256) {
    fail(`${patch.id}: expected input ${patch.expectedInputSha256}, got ${actualInputSha}`);
  }
  const input = contents.toString("utf8");
  const occurrences = input.split(patch.replacement.from).length - 1;
  if (occurrences !== 1) fail(`${patch.id}: expected one exact replacement target, found ${occurrences}`);
  const output = Buffer.from(input.replace(patch.replacement.from, patch.replacement.to));
  const outputSha = sha256(output);
  if (outputSha !== patch.expectedOutputSha256) {
    fail(`${patch.id}: expected output ${patch.expectedOutputSha256}, got ${outputSha}`);
  }
  return output;
}

function loadManifest() {
  const manifest = readJson(manifestPath);
  if (manifest.schema !== "abcarus.abc2svg-runtime.v1") fail(`Unsupported manifest schema: ${manifest.schema}`);
  return manifest;
}

function serializedManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function filesLock(files) {
  const hashes = {};
  for (const fileName of [...files.keys()].sort()) hashes[fileName] = sha256(files.get(fileName));
  return { schema: "abcarus.abc2svg-runtime-files.v1", files: hashes };
}

function serializedFilesLock(lock) {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

function applyRuntime(archivePath) {
  if (!archivePath) fail("Usage: node scripts/abc2svg_runtime.mjs apply --archive <abc2svg.zip>");
  const manifest = loadManifest();
  const archive = fs.readFileSync(path.resolve(archivePath));
  const archiveSha = sha256(archive);
  if (archiveSha !== manifest.upstream.archiveSha256) {
    fail(`Archive SHA256 mismatch: expected ${manifest.upstream.archiveSha256}, got ${archiveSha}`);
  }

  const entries = zipEntries(archive);
  const files = managedFilesFromArchive(archive, entries);
  for (const [fileName, metadata] of Object.entries(manifest.artifacts)) {
    const contents = files.get(fileName) || artifactFromArchive(archive, entries, fileName);
    const upstreamSha = sha256(contents);
    if (upstreamSha !== metadata.upstreamSha256) {
      fail(`${fileName}: expected upstream ${metadata.upstreamSha256}, got ${upstreamSha}`);
    }
  }

  for (const patchRef of manifest.patches) {
    const patch = readJson(path.join(root, patchRef.recipe));
    if (patch.id !== patchRef.id) fail(`Patch ID mismatch in ${patchRef.recipe}`);
    const contents = files.get(patch.target);
    if (!contents) fail(`${patch.id}: target ${patch.target} is not a runtime artifact`);
    files.set(patch.target, applyPatch(contents, patch, sha256(contents)));
  }

  for (const [fileName, metadata] of Object.entries(manifest.artifacts)) {
    const actualSha = sha256(files.get(fileName));
    if (actualSha !== metadata.sha256) fail(`${fileName}: expected final ${metadata.sha256}, got ${actualSha}`);
  }

  const lock = filesLock(files);
  const lockText = serializedFilesLock(lock);
  const lockSha = sha256(lockText);
  if (lockSha !== manifest.filesLockSha256) {
    fail(`Runtime files lock mismatch: expected ${manifest.filesLockSha256}, got ${lockSha}`);
  }

  if (fs.existsSync(runtimeFilesPath)) {
    const previousLock = readJson(runtimeFilesPath);
    if (previousLock.schema === "abcarus.abc2svg-runtime-files.v1") {
      for (const previousFile of Object.keys(previousLock.files || {})) {
        if (files.has(previousFile) || previousFile.split("/").includes("..")) continue;
        const stalePath = path.join(runtimeDir, previousFile);
        if (fs.existsSync(stalePath) && fs.statSync(stalePath).isFile()) fs.unlinkSync(stalePath);
      }
    }
  }

  for (const [fileName, contents] of files) {
    atomicWrite(path.join(runtimeDir, fileName), contents);
  }
  atomicWrite(runtimeFilesPath, lockText);
  atomicWrite(runtimeManifestPath, serializedManifest(manifest));
  verifyRuntime(manifest);
  console.log(`Applied abc2svg ${manifest.upstream.version} with ${manifest.patches.length} downstream patch(es).`);
}

function verifyRuntime(manifest = loadManifest()) {
  const copiedManifest = readJson(runtimeManifestPath);
  if (serializedManifest(copiedManifest) !== serializedManifest(manifest)) {
    fail("Vendored runtime manifest differs from config/abc2svg-runtime.json");
  }
  const lock = readJson(runtimeFilesPath);
  if (lock.schema !== "abcarus.abc2svg-runtime-files.v1") fail(`Unsupported files lock schema: ${lock.schema}`);
  const lockText = serializedFilesLock(lock);
  const lockSha = sha256(lockText);
  if (lockSha !== manifest.filesLockSha256) {
    fail(`Vendored files lock mismatch: expected ${manifest.filesLockSha256}, got ${lockSha}`);
  }
  for (const [fileName, expectedSha] of Object.entries(lock.files)) {
    const filePath = path.join(runtimeDir, fileName);
    if (!fs.existsSync(filePath)) fail(`Missing runtime artifact: ${fileName}`);
    const actualSha = sha256(fs.readFileSync(filePath));
    if (actualSha !== expectedSha) fail(`${fileName}: expected ${expectedSha}, got ${actualSha}`);
  }
  for (const [fileName, metadata] of Object.entries(manifest.artifacts)) {
    if (lock.files[fileName] !== metadata.sha256) {
      fail(`${fileName}: key artifact hash differs between manifest and files lock`);
    }
  }
  const core = fs.readFileSync(path.join(runtimeDir, "abc2svg-1.js"), "utf8");
  if (!core.includes(`abc2svg.version="${manifest.upstream.version}"`)) {
    fail(`abc2svg-1.js does not identify itself as ${manifest.upstream.version}`);
  }
  console.log(
    `Verified abc2svg ${manifest.upstream.version}: ${Object.keys(lock.files).length} files and patch manifest match.`
  );
}

function parseArgs(argv) {
  const result = { command: argv[2] || "verify", archive: "" };
  for (let index = 3; index < argv.length; index += 1) {
    if (argv[index] === "--archive") result.archive = argv[++index] || "";
  }
  return result;
}

try {
  const args = parseArgs(process.argv);
  if (args.command === "apply") applyRuntime(args.archive);
  else if (args.command === "verify") verifyRuntime();
  else fail(`Unknown command: ${args.command}`);
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
