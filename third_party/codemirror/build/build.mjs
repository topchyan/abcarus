import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

function parseArgs(argv) {
  const out = { out: null, minify: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") out.out = argv[i + 1] || null;
    if (a === "--no-minify") out.minify = false;
  }
  return out;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const entry = path.resolve(repoRoot, "third_party", "codemirror", "build", "entry.mjs");

const args = parseArgs(process.argv.slice(2));
const outFile = path.resolve(args.out || path.resolve(repoRoot, "third_party", "codemirror", "cm.js"));

await build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  sourcemap: false,
  legalComments: "none",
  treeShaking: true,
  minify: Boolean(args.minify),
});

process.stdout.write(`Built CodeMirror bundle: ${outFile}\n`);
