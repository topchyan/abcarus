import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const RENDERER_DIR = path.join(ROOT, "src", "renderer");
const ALLOW_PREFIXES = [path.join(RENDERER_DIR, "io") + path.sep];

const FORBIDDEN_SNIPPETS = ["window.api.readFile(", "window.api.writeFile("];

async function walkJsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === ".git") continue;
      out.push(...(await walkJsFiles(p)));
      continue;
    }
    if (!ent.isFile()) continue;
    if (!p.endsWith(".js")) continue;
    out.push(p);
  }
  return out;
}

function isAllowed(filePath) {
  const full = path.resolve(filePath);
  return ALLOW_PREFIXES.some((prefix) => full.startsWith(prefix));
}

function scanFileText(text, filePath) {
  const hits = [];
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const needle of FORBIDDEN_SNIPPETS) {
      if (!line.includes(needle)) continue;
      hits.push({ lineNumber: i + 1, needle, line });
    }
  }
  if (!hits.length) return [];
  return hits.map((h) => ({ ...h, filePath }));
}

async function main() {
  const files = await walkJsFiles(RENDERER_DIR);
  const violations = [];

  for (const file of files) {
    if (isAllowed(file)) continue;
    const text = await fs.readFile(file, "utf8");
    violations.push(...scanFileText(text, file));
  }

  if (!violations.length) return;

  const rel = (p) => path.relative(ROOT, p);
  const lines = violations.map(
    (v) => `${rel(v.filePath)}:${v.lineNumber} contains forbidden '${v.needle.trim()}'`
  );
  process.stderr.write(
    [
      "Forbidden raw file-ops found in renderer (must go through src/renderer/io/*):",
      ...lines,
      "",
    ].join("\n")
  );
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`check_no_raw_fileops.mjs failed: ${err?.stack || err}\n`);
  process.exitCode = 1;
});

