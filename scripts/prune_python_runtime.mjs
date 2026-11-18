#!/usr/bin/env node
import path from "node:path";
import { prunePythonRuntime } from "./python_runtime_prune_lib.mjs";

function valueFor(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function platformId() {
  if (process.platform === "win32") return "win-x64";
  if (process.platform === "darwin") return process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  if (process.platform === "linux") return "linux-x64";
  return "";
}

const root = valueFor("--root") || path.join("third_party", "python-embed", platformId());
const dryRun = process.argv.includes("--dry-run");
const result = await prunePythonRuntime(root, { dryRun });
const mib = (result.bytes / (1024 * 1024)).toFixed(1);
console.log(`${dryRun ? "Would remove" : "Removed"} ${result.removedCount} entries (${mib} MiB).`);
console.log(`Preserved ${result.corpusAbcFiles} music21 ABC files.`);
