import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function repoRootFromHere() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

function fail(message) {
  process.stderr.write(`[codemirror_harness] FAIL: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

function ok(message) {
  process.stdout.write(`[codemirror_harness] OK: ${message}\n`);
}

async function fileContains(filePath, needle) {
  const buf = await fs.readFile(filePath);
  return buf.includes(Buffer.from(needle));
}

async function importAsEsmViaTmp(filePath, tmpName) {
  const tmpPath = path.resolve("/tmp", tmpName);
  await fs.copyFile(filePath, tmpPath);
  return import(pathToFileURL(tmpPath).href);
}

function assertExports(mod, required) {
  const missing = [];
  for (const name of required) {
    if (!(name in mod)) missing.push(name);
  }
  if (missing.length) {
    const have = Object.keys(mod).sort().join(", ");
    fail(`Missing exports: ${missing.join(", ")}. Have: ${have}`);
  }
}

async function buildToTmp(repoRoot, outName) {
  const buildScript = path.resolve(repoRoot, "third_party", "codemirror", "build", "build.mjs");
  const outPath = path.resolve("/tmp", outName);
  await execFileAsync(process.execPath, [buildScript, "--out", outPath], { cwd: repoRoot });
  return outPath;
}

async function main() {
  const repoRoot = repoRootFromHere();
  const vendored = path.resolve(repoRoot, "third_party", "codemirror", "cm.js");

  const requiredExports = [
    // Current app imports (src/renderer/*.js).
    "EditorView",
    "EditorState",
    "EditorSelection",
    "basicSetup",
    "keymap",
    "Decoration",
    "RangeSetBuilder",
    "ViewPlugin",
    "indentUnit",
    "openSearchPanel",
    "gotoLine",
    "foldService",
    "foldGutter",
    "lineNumbers",

    // Needed for upcoming ABC language layers.
    "Compartment",
    "StateEffect",
    "StateField",
    "hoverTooltip",
    "autocompletion",
    "completeFromList",
    "closeBrackets",
    "closeBracketsKeymap",
    "bracketMatching",
    "linter",
    "setDiagnostics",
    "acceptCompletion",
  ];

  // 1) Vendored smoke: can be imported and has the expected surface.
  const vendoredMod = await importAsEsmViaTmp(vendored, "abcarus-cm-vendored.mjs");
  assertExports(vendoredMod, requiredExports);
  ok(`Vendored cm.js exports ${Object.keys(vendoredMod).length} names`);

  // 2) Regression guard: selection-match highlighting must not be present in cm.js.
  if (await fileContains(vendored, "cm-selectionMatch")) {
    fail("Vendored cm.js contains cm-selectionMatch (selection-match highlighting regression).");
  }
  ok("Vendored cm.js does not include selection-match highlighting");

  // 3) Recipe smoke: build to /tmp and ensure the same basic expectations.
  const built = await buildToTmp(repoRoot, "abcarus-cm-built.mjs");
  const builtMod = await importAsEsmViaTmp(built, "abcarus-cm-built-import.mjs");
  assertExports(builtMod, requiredExports);
  ok(`Recipe-built cm.js exports ${Object.keys(builtMod).length} names`);

  if (await fileContains(built, "cm-selectionMatch")) {
    fail("Recipe-built cm.js contains cm-selectionMatch (selection-match highlighting regression).");
  }
  ok("Recipe-built cm.js does not include selection-match highlighting");

  ok("All CodeMirror checks passed.");
}

try {
  await main();
} catch (err) {
  if (!process.exitCode) process.exitCode = 1;
  process.stderr.write(`[codemirror_harness] ERROR: ${err && err.message ? err.message : String(err)}\n`);
}
