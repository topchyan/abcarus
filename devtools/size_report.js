#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("dist/appimage/AppDir");
const topN = Number.isFinite(Number(process.argv[3])) ? Number(process.argv[3]) : 30;

function statSafe(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function isSymlink(stat) {
  return stat && stat.isSymbolicLink && stat.isSymbolicLink();
}

function dirEntriesSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function computeSize(p) {
  const st = statSafe(p);
  if (!st) return 0;
  if (isSymlink(st)) return 0;
  if (st.isFile()) return st.size;
  if (!st.isDirectory()) return 0;

  let total = 0;
  for (const entry of dirEntriesSafe(p)) {
    total += computeSize(path.join(p, entry.name));
  }
  return total;
}

function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = b;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : (idx === 1 ? 1 : 2);
  return `${val.toFixed(digits)} ${units[idx]}`;
}

function listTop(dir) {
  const entries = dirEntriesSafe(dir)
    .map((e) => path.join(dir, e.name))
    .map((p) => ({ path: p, size: computeSize(p) }))
    .sort((a, b) => b.size - a.size);
  return entries.slice(0, topN);
}

function main() {
  const st = statSafe(root);
  if (!st || !st.isDirectory()) {
    console.error(`Not a directory: ${root}`);
    process.exit(1);
  }

  console.log(`# Size report`);
  console.log(`Root: ${root}`);
  console.log(`Top: ${topN}`);
  console.log("");

  const targets = [
    root,
    path.join(root, "usr", "lib"),
    path.join(root, "usr", "share"),
    path.join(root, "usr", "lib", "abcarus"),
    path.join(root, "usr", "lib", "abcarus", "electron"),
    path.join(root, "usr", "lib", "abcarus", "electron", "resources", "app"),
  ].filter((p, idx, arr) => arr.indexOf(p) === idx);

  for (const target of targets) {
    const st2 = statSafe(target);
    if (!st2 || !st2.isDirectory()) continue;
    console.log(`## ${target}`);
    for (const item of listTop(target)) {
      const rel = path.relative(root, item.path) || ".";
      console.log(`${formatBytes(item.size)}\t${rel}`);
    }
    console.log("");
  }
}

main();

