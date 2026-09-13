import { readFile, writeFile } from "node:fs/promises";

const SOURCE = "docs/makam_dna/SYMBTR_MAKAMS_K_SIGNATURES.json";
const OUT = "src/shared/abc-transpose/makam_k_signatures.min.mjs";

function firstTopK(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (Array.isArray(entry.topK) && entry.topK[0] && typeof entry.topK[0].k === "string") {
    return entry.topK[0].k;
  }
  const signatures = entry.kSignatures && typeof entry.kSignatures === "object" ? entry.kSignatures : {};
  return Object.keys(signatures)[0] || "";
}

const raw = JSON.parse(await readFile(SOURCE, "utf8"));
const byMakam = raw && raw.byMakam && typeof raw.byMakam === "object" ? raw.byMakam : {};
const rows = Object.entries(byMakam)
  .map(([makam, entry]) => ({
    makam,
    k: firstTopK(entry),
    count: Number(entry && entry.count) || 0,
  }))
  .filter((row) => row.makam && row.k)
  .sort((a, b) => (b.count - a.count) || a.makam.localeCompare(b.makam));

const body = [
  "// Auto-generated from `docs/makam_dna/SYMBTR_MAKAMS_K_SIGNATURES.json` (byMakam -> topK).",
  "// Run `node scripts/build_makam_k_signatures_runtime.mjs` after rebuilding the JSON.",
  `export default Object.freeze(${JSON.stringify(rows, null, 2)});`,
  "",
].join("\n");

await writeFile(OUT, body, "utf8");
console.log(`Wrote ${OUT} (${rows.length} makam K signatures)`);
