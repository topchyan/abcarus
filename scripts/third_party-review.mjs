#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function parseArgs(argv) {
  const args = { candidate: null, outDir: null, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--candidate") args.candidate = argv[++i] || null;
    else if (a === "--out-dir") args.outDir = argv[++i] || null;
    else if (a === "-h" || a === "--help") {
      args.help = true;
    }
  }
  return args;
}

function sha256File(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readTextMaybe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowUtcCompact() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}${pad(d.getUTCSeconds())}Z`;
}

function readUInt64LE(buf, off) {
  const lo = buf.readUInt32LE(off);
  const hi = buf.readUInt32LE(off + 4);
  return hi * 2 ** 32 + lo;
}

function zipLocateEocd(buf) {
  // EOCD signature: 0x06054b50
  // EOCD minimum size is 22 bytes. Comment length is 2 bytes at offset 20.
  const sig = 0x06054b50;
  const min = 22;
  const maxSearch = Math.min(buf.length - min, 0xffff + min); // spec: max comment 64k
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
  const cdSize = zipBuf.readUInt32LE(eocdOff + 12);
  const cdOffset = zipBuf.readUInt32LE(eocdOff + 16);

  // Zip64 would use 0xffff/0xffffffff sentinels here.
  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error(`Zip64 not supported by this script (use external unzip): ${zipPath}`);
  }

  const sig = 0x02014b50;
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (zipBuf.readUInt32LE(p) !== sig) throw new Error(`Invalid central directory entry at ${p}: ${zipPath}`);
    const method = zipBuf.readUInt16LE(p + 10);
    const compSize = zipBuf.readUInt32LE(p + 20);
    const uncompSize = zipBuf.readUInt32LE(p + 24);
    const nameLen = zipBuf.readUInt16LE(p + 28);
    const extraLen = zipBuf.readUInt16LE(p + 30);
    const commentLen = zipBuf.readUInt16LE(p + 32);
    const localHeaderOff = zipBuf.readUInt32LE(p + 42);
    const name = zipBuf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({
      name,
      method,
      compSize,
      uncompSize,
      localHeaderOff,
    });
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
  if (entry.method === 8) {
    // deflate
    return zlib.inflateRawSync(comp, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  }
  return null;
}

function findZipEntryBySuffix(entries, suffix) {
  const matches = entries.filter((e) => e.endsWith(suffix));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  matches.sort((a, b) => a.length - b.length);
  return matches[0];
}

function detectAbc2svgVersion(versionTxt) {
  const m1 = versionTxt.match(/abc2svg\.version\s*=\s*"([^"]+)"/);
  const m2 = versionTxt.match(/abc2svg\.vdate\s*=\s*"([^"]+)"/);
  return { version: m1 ? m1[1] : "", date: m2 ? m2[1] : "" };
}

function detectPythonToolVersion(sourceText) {
  const m = sourceText.match(/\bVERSION\s*=\s*(\d+)\b/);
  return m ? m[1] : "";
}

function componentInventory(root) {
  const base = path.resolve(root, "third_party");
  const abc2svgVersionTxt = readTextMaybe(path.join(base, "abc2svg", "version.txt"));
  const abc2svg = {
    name: "abc2svg",
    path: "third_party/abc2svg",
    kind: "js",
    version: detectAbc2svgVersion(abc2svgVersionTxt).version,
    versionDate: detectAbc2svgVersion(abc2svgVersionTxt).date,
    keyFiles: ["abc2svg/version.txt", "abc2svg/abc2svg-1.js", "abc2svg/snd-1.js", "abc2svg/MIDI-1.js"],
  };

  const abc2xmlText = readTextMaybe(path.join(base, "abc2xml", "abc2xml.py"));
  const abc2xml = {
    name: "abc2xml",
    path: "third_party/abc2xml/abc2xml.py",
    kind: "python",
    version: detectPythonToolVersion(abc2xmlText),
    keyFiles: ["abc2xml/abc2xml.py"],
  };

  const xml2abcText = readTextMaybe(path.join(base, "xml2abc", "xml2abc.py"));
  const xml2abc = {
    name: "xml2abc",
    path: "third_party/xml2abc/xml2abc.py",
    kind: "python",
    version: detectPythonToolVersion(xml2abcText),
    keyFiles: ["xml2abc/xml2abc.py"],
  };

  const tabVersion = readTextMaybe(path.join(base, "tabulator", "VERSION.txt")).trim();
  const tabulator = {
    name: "tabulator",
    path: "third_party/tabulator",
    kind: "js-asset",
    version: tabVersion,
    keyFiles: ["tabulator/VERSION.txt", "tabulator/tabulator.min.js"],
  };

  const codemirror = {
    name: "codemirror (vendored build)",
    path: "third_party/codemirror/cm.js",
    kind: "js-asset",
    version: "",
    keyFiles: ["codemirror/cm.js"],
  };

  return [abc2svg, abc2xml, xml2abc, tabulator, codemirror].map((c) => {
    const hashes = {};
    for (const rel of c.keyFiles) {
      const abs = path.join(base, rel);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        hashes[rel] = sha256File(abs);
      }
    }
    return { ...c, sha256: hashes };
  });
}

function candidateSummary(root, candidateZip, components) {
  const zipAbs = path.resolve(root, candidateZip);
  if (!fs.existsSync(zipAbs)) throw new Error(`Candidate zip not found: ${candidateZip}`);

  const zip = zipList(zipAbs);
  const entries = zip.entries.map((e) => e.name);
  const out = {
    zip: candidateZip,
    sha256: sha256File(zipAbs),
    entryCount: entries.length,
    topLevel: Array.from(
      new Set(
        entries
          .map((e) => e.split("/")[0])
          .filter(Boolean)
      )
    ).sort(),
    warnings: [],
    keyFileComparisons: [],
    missingKeyFiles: [],
  };

  function suffixCandidates(rel) {
    const cleaned = rel.replace(/^third_party\//, "");
    const parts = cleaned.split("/").filter(Boolean);
    const candidates = new Set();
    candidates.add("/" + cleaned);
    if (parts.length >= 2) candidates.add("/" + parts.slice(1).join("/"));
    if (parts.length >= 1) candidates.add("/" + parts[parts.length - 1]);
    return Array.from(candidates);
  }

  for (const comp of components) {
    for (const rel of comp.keyFiles) {
      const entry =
        suffixCandidates(rel)
          .map((s) => findZipEntryBySuffix(entries, s))
          .find(Boolean) || null;
      if (!entry) {
        out.missingKeyFiles.push({ component: comp.name, keyFile: rel });
        continue;
      }
      const buf = zipReadEntry(zip, entry);
      if (!buf) continue;
      const zipHash = sha256Buffer(buf);
      const localHash = comp.sha256[rel] || "";
      out.keyFileComparisons.push({
        component: comp.name,
        keyFile: rel,
        zipEntry: entry,
        localSha256: localHash,
        zipSha256: zipHash,
        changed: Boolean(localHash && zipHash && localHash !== zipHash),
      });
    }
  }

  // Heuristic warnings for common mismatch cases (abc2svg source tree vs our vendored dist files).
  const hasA2sDist = entries.some((e) => e.endsWith("/abc2svg-1.js")) || entries.some((e) => e.endsWith("/snd-1.js"));
  const hasA2sCore = entries.some((e) => e.includes("/core/abc2svg.js"));
  if (hasA2sCore && !hasA2sDist) {
    out.warnings.push(
      "Candidate looks like an abc2svg source tree (core/abc2svg.js) without prebuilt dist files (abc2svg-1.js, snd-1.js). " +
        "Review is limited until dist artifacts are available or built."
    );
  }

  return out;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Third-party review report`);
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push(``);

  lines.push(`## Inventory`);
  for (const c of report.components) {
    const ver = c.version ? ` (${c.version})` : "";
    lines.push(`- ${c.name}${ver} — \`${c.path}\``);
  }
  lines.push(``);

  if (report.candidate) {
    lines.push(`## Candidate`);
    lines.push(`- Zip: \`${report.candidate.zip}\``);
    lines.push(`- Zip SHA256: \`${report.candidate.sha256}\``);
    lines.push(`- Entries: ${report.candidate.entryCount}`);
    lines.push(`- Top-level: ${report.candidate.topLevel.join(", ")}`);
    lines.push(``);

    if (report.candidate.warnings && report.candidate.warnings.length) {
      lines.push(`### Warnings`);
      for (const w of report.candidate.warnings) lines.push(`- ${w}`);
      lines.push(``);
    }

    const changed = report.candidate.keyFileComparisons.filter((x) => x.changed);
    const same = report.candidate.keyFileComparisons.filter((x) => !x.changed);
    if (changed.length) {
      lines.push(`### Key file diffs (changed)`);
      for (const x of changed) {
        lines.push(`- ${x.component}: \`${x.keyFile}\` differs (local ${x.localSha256.slice(0, 12)}…, zip ${x.zipSha256.slice(0, 12)}…)`);
      }
      lines.push(``);
    }
    if (same.length) {
      lines.push(`### Key file diffs (unchanged)`);
      for (const x of same) {
        lines.push(`- ${x.component}: \`${x.keyFile}\` unchanged`);
      }
      lines.push(``);
    }

    if (report.candidate.missingKeyFiles && report.candidate.missingKeyFiles.length) {
      const grouped = new Map();
      for (const m of report.candidate.missingKeyFiles) {
        if (!grouped.has(m.component)) grouped.set(m.component, []);
        grouped.get(m.component).push(m.keyFile);
      }
      lines.push(`### Missing key files in candidate`);
      for (const [comp, files] of grouped.entries()) {
        lines.push(`- ${comp}: ${files.map((f) => `\`${f}\``).join(", ")}`);
      }
      lines.push(``);
    }
  }

  lines.push(`## Verdict`);
  lines.push(`- SAFE / NEEDS PATCH / HOLD:`);
  lines.push(`- Notes:`);
  lines.push(``);
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/third_party-review.mjs [--candidate <zip>] [--out-dir <dir>] [--json]`);
    process.exit(0);
  }

  const root = repoRoot();
  const components = componentInventory(root);
  const report = {
    generatedAtUtc: new Date().toISOString(),
    components,
    candidate: null,
  };

  if (args.candidate) {
    report.candidate = candidateSummary(root, args.candidate, components);
  }

  const defaultOut = path.join(root, "scripts", "local", "third-party-reviews");
  const outDir = args.outDir ? path.resolve(root, args.outDir) : defaultOut;
  ensureDir(outDir);

  const stamp = nowUtcCompact();
  const outBase = path.join(outDir, `third-party-review-${stamp}`);
  fs.writeFileSync(`${outBase}.json`, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(`${outBase}.md`, renderMarkdown(report), "utf8");

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Wrote:\n- ${path.relative(root, `${outBase}.md`)}\n- ${path.relative(root, `${outBase}.json`)}`);
  }
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
