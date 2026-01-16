import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
const decoPath = path.join(repoRoot, "third_party/abc2svg/core/deco.js");

function extractStandardDecoKeys(decoSource) {
  const startIdx = decoSource.indexOf("var decos = {");
  if (startIdx === -1) throw new Error("deco.js: couldn't find `var decos = {`");
  const afterStart = decoSource.slice(startIdx);

  const internalIdx = afterStart.indexOf("\n// internal");
  if (internalIdx === -1) throw new Error("deco.js: couldn't find `// internal` marker");
  const segment = afterStart.slice(0, internalIdx);

  const keys = new Set();
  const re = /(?:^|\n)\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_-]*))\s*:/g;
  let m;
  while ((m = re.exec(segment))) {
    const key = (m[1] || m[2] || "").trim();
    if (!key) continue;
    keys.add(key);
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const decoSource = await fs.readFile(decoPath, "utf8");
  const keys = extractStandardDecoKeys(decoSource);
  process.stdout.write(JSON.stringify(keys, null, 2) + "\n");
}

await main();
