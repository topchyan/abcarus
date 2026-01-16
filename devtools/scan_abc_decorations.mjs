import fs from "node:fs/promises";
import path from "node:path";

function repoRoot() {
  return path.resolve(new URL(".", import.meta.url).pathname, "..");
}

function parseArgs(argv) {
  const out = {
    root: "",
    catalog: "kitchen/derived/abc2svg-decorations-catalog.json",
    outFile: "",
    maxFiles: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") out.root = argv[++i] || "";
    else if (a === "--catalog") out.catalog = argv[++i] || out.catalog;
    else if (a === "--out") out.outFile = argv[++i] || out.outFile;
    else if (a === "--max-files") out.maxFiles = Number(argv[++i] || 0) || 0;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function nowCompactStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function stripComment(line) {
  const s = String(line || "");
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "%" && s[i - 1] !== "\\") return s.slice(0, i);
  }
  return s;
}

function isMusicLine(line) {
  const t = String(line || "");
  if (!t.trim()) return false;
  if (/^\s*[A-Za-z]:/.test(t)) return false;
  if (/^\s*[Ww]:/.test(t)) return false;
  if (/^\s*%/.test(t)) return false;
  if (/^\s*%%\s*(begintext|endtext)\b/i.test(t)) return false;
  if (/^\s*%%/.test(t)) return false;
  return true;
}

async function* walkFiles(rootDir) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) yield p;
    }
  }
}

async function mkdirp(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.root) {
    process.stdout.write(
      [
        "Usage:",
        "  node devtools/scan_abc_decorations.mjs --root <folder> [--catalog <json>] [--out <report.json>] [--max-files N]",
      ].join("\n") + "\n"
    );
    process.exit(args.help ? 0 : 2);
  }

  const root = repoRoot();
  const scanRoot = path.resolve(args.root);
  const catalogPath = path.resolve(root, args.catalog);
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const decorations = Array.isArray(catalog.decorations) ? catalog.decorations : [];

  const decosByName = new Map(decorations.map((d) => [String(d.name || ""), d]));

  const countsByName = new Map();
  const countsByShorthand = new Map();
  const fileCountByName = new Map();

  const namePatterns = [];
  for (const d of decorations) {
    const name = String(d.name || "");
    if (!name) continue;
    // Count `!name!` occurrences.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    namePatterns.push({ name, re: new RegExp(`!${escaped}!`, "g") });
  }

  const shorthands = (catalog.shorthands_abc21 || [])
    .map((x) => String(x && x.char ? x.char : ""))
    .filter(Boolean);
  const shorthandChars = Array.from(new Set(shorthands));

  let filesScanned = 0;
  for await (const filePath of walkFiles(scanRoot)) {
    if (!filePath.toLowerCase().endsWith(".abc")) continue;
    filesScanned += 1;
    if (args.maxFiles && filesScanned > args.maxFiles) break;

    let text;
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    // Decoration `!name!` counting (ignore %%begintext blocks and comments).
    let inText = false;
    const cleanedLines = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = String(rawLine || "");
      const t = line.trim();
      if (/^\s*%%\s*begintext\b/i.test(t)) { inText = true; continue; }
      if (/^\s*%%\s*endtext\b/i.test(t)) { inText = false; continue; }
      if (inText) continue;
      cleanedLines.push(stripComment(line));
    }
    const cleaned = cleanedLines.join("\n");

    for (const { name, re } of namePatterns) {
      const matches = cleaned.match(re);
      const n = matches ? matches.length : 0;
      if (!n) continue;
      countsByName.set(name, (countsByName.get(name) || 0) + n);
      fileCountByName.set(name, (fileCountByName.get(name) || 0) + 1);
    }

    // Shorthand counting (approximate; only on music lines; exclude %%begintext and comments).
    inText = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const line0 = String(rawLine || "");
      const t = line0.trim();
      if (/^\s*%%\s*begintext\b/i.test(t)) { inText = true; continue; }
      if (/^\s*%%\s*endtext\b/i.test(t)) { inText = false; continue; }
      if (inText) continue;
      const line = stripComment(line0);
      if (!isMusicLine(line)) continue;

      for (const ch of shorthandChars) {
        // Heuristic: shorthand char directly before a note/rest/chord start.
        const esc = ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`${esc}(?=[A-Ga-gz\\[])`, "g");
        const m = line.match(re);
        if (m && m.length) countsByShorthand.set(ch, (countsByShorthand.get(ch) || 0) + m.length);
      }
    }
  }

  const usage = [];
  for (const [name, count] of countsByName.entries()) {
    const d = decosByName.get(name) || null;
    usage.push({
      name,
      count,
      files: fileCountByName.get(name) || 0,
      isInternal: Boolean(d && d.isInternal),
      description: d && d.description ? String(d.description) : "",
      example: d && d.example ? String(d.example) : "",
    });
  }
  usage.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const shorthandUsage = Array.from(countsByShorthand.entries())
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count || a.char.localeCompare(b.char));

  const report = {
    generatedAt: new Date().toISOString(),
    scanRoot,
    filesScanned,
    catalog: { path: catalogPath },
    usage,
    shorthandUsage,
  };

  const outFile = args.outFile
    ? path.resolve(root, args.outFile)
    : path.resolve(root, `kitchen/derived/decorations-usage-${nowCompactStamp()}.json`);
  await mkdirp(path.dirname(outFile));
  await fs.writeFile(outFile, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote: ${path.relative(root, outFile)}\n`);
}

await main();

