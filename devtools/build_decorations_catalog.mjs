import fs from "node:fs/promises";
import path from "node:path";

function repoRoot() {
  return path.resolve(new URL(".", import.meta.url).pathname, "..");
}

function parseArgs(argv) {
  const out = {
    stdHtml: "kitchen/refs/abcnotation-wiki/wiki/abc:standard:v2.1.html",
    abc2svgDocHtml: "kitchen/refs/abcm2ps-doc-offline/abcm2ps-doc/features.html",
    outFile: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--std") out.stdHtml = argv[++i] || out.stdHtml;
    else if (a === "--abc2svg-doc") out.abc2svgDocHtml = argv[++i] || out.abc2svgDocHtml;
    else if (a === "--out") out.outFile = argv[++i] || out.outFile;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function decodeHtml(s) {
  return String(s || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]*>/g, " "));
}

function extractBetween(html, startNeedle, endNeedle) {
  const s = String(html || "");
  const i = s.indexOf(startNeedle);
  if (i === -1) return "";
  const j = s.indexOf(endNeedle, i + startNeedle.length);
  if (j === -1) return s.slice(i);
  return s.slice(i, j);
}

function normalizeWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function parseAbc21Decorations(stdHtml) {
  // Focus on the decorations section and parse the "currently defined symbols" pre block.
  const section = extractBetween(stdHtml, 'id="decorations"', 'id="chord_symbols"') || stdHtml;

  const shorthandPre = (() => {
    const m = section.match(/A number of shorthand decoration symbols are available:\s*<\/p>\s*<pre[^>]*>([\s\S]*?)<\/pre>/i);
    return m ? m[1] : "";
  })();

  const shorthands = [];
  for (const line of decodeHtml(shorthandPre).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const mm = /^(\S+)\s+(.*)$/.exec(t);
    if (!mm) continue;
    shorthands.push({ char: mm[1], desc: normalizeWs(mm[2]) });
  }

  const symbolsPre = (() => {
    const m = section.match(/The currently defined symbols are:\s*<\/p>\s*<pre[^>]*>([\s\S]*?)<\/pre>/i);
    return m ? m[1] : "";
  })();

  const descByName = new Map();
  for (const rawLine of decodeHtml(symbolsPre).split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, " ").trimEnd();
    if (!line.trim()) continue;
    const mm = /^!([^!]+)!\s+(.*)$/.exec(line.trim());
    if (!mm) continue;
    const name = mm[1].trim();
    const desc = normalizeWs(mm[2]);
    if (!name || !desc) continue;
    descByName.set(name, desc);
  }

  return { shorthands, descByName };
}

function parseAbc2svgFeaturesDecorations(featuresHtml) {
  // Parse the "following decorations are added" list (dt/dd pairs).
  const section = extractBetween(featuresHtml, "The following decorations are added:", "</ul>") || "";
  if (!section) return new Map();

  const out = new Map();
  const dtDdRe = /<dt>\s*([\s\S]*?)\s*<\/dt>\s*<dd>\s*([\s\S]*?)\s*<\/dd>/gi;
  let m;
  while ((m = dtDdRe.exec(section))) {
    const dt = m[1] || "";
    const dd = normalizeWs(stripTags(m[2] || ""));
    const codes = [];
    const codeRe = /<code>\s*([^<]+?)\s*<\/code>/gi;
    let c;
    while ((c = codeRe.exec(dt))) {
      const txt = normalizeWs(stripTags(c[1] || ""));
      if (txt) codes.push(txt);
    }

    // Expand some known range-ish forms like `!/! .. !///!` or `!trem1! .. !trem4!`.
    const dtText = normalizeWs(stripTags(dt));
    if (/!\s*\/\s*!\s*\.\.\s*!\s*\/\/\/\s*!/i.test(dtText)) {
      codes.push("!/!");
      codes.push("!//!");
      codes.push("!///!");
    }
    const tremRange = dtText.match(/!trem(\d)!\s*\.\.\s*!trem(\d)!/i);
    if (tremRange) {
      const a = Number(tremRange[1]);
      const b = Number(tremRange[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
        for (let i = a; i <= b; i += 1) codes.push(`!trem${i}!`);
      }
    }

    for (const code of codes) {
      const mm2 = /^!([^!]+)!$/.exec(code);
      if (!mm2) continue;
      const name = mm2[1];
      if (!name) continue;
      if (!out.has(name)) out.set(name, dd);
    }
  }
  return out;
}

function extractAbc2svgDecoKeys(decoSource) {
  const startIdx = decoSource.indexOf("var decos = {");
  if (startIdx === -1) throw new Error("deco.js: couldn't find `var decos = {`");
  const afterStart = decoSource.slice(startIdx);

  const endIdx = afterStart.indexOf("},\n\n\t// types of decoration per function");
  if (endIdx === -1) throw new Error("deco.js: couldn't find end of `decos` object");
  const segment = afterStart.slice(0, endIdx);

  const internalIdx = segment.indexOf("\n// internal");
  const standardPart = internalIdx === -1 ? segment : segment.slice(0, internalIdx);
  const internalPart = internalIdx === -1 ? "" : segment.slice(internalIdx);

  const parseKeys = (seg) => {
    const keys = [];
    const re = /(?:^|\n)\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.+-]*))\s*:/g;
    let m;
    while ((m = re.exec(seg))) {
      const key = (m[1] || m[2] || "").trim();
      if (key) keys.push(key);
    }
    return Array.from(new Set(keys));
  };

  const standardKeys = parseKeys(standardPart);
  const internalKeys = parseKeys(internalPart);
  return {
    standardKeys: standardKeys.sort((a, b) => a.localeCompare(b)),
    internalKeys: internalKeys.sort((a, b) => a.localeCompare(b)),
  };
}

function buildExample(name, shorthandChar) {
  const abc = `!${name}!`;

  if (name.endsWith("(")) {
    const base = name.slice(0, -1);
    return `${abc}c2 d2 !${base})! e2`;
  }
  if (name.endsWith(")")) {
    return `!${name.slice(0, -1)}(! c2 d2 ${abc} e2`;
  }
  if (name === "trill") return `!trill!A4`;
  if (["p", "pp", "ppp", "pppp", "mp", "mf", "f", "ff", "fff", "ffff", "sfz"].includes(name)) return `${abc} c2 d2 e2`;
  if (name === ">") return `!>!c`;
  if (name === "+") return `!+!c`;
  if (name === "^") return `!^!c`;
  if (name === "dot") return `.c`;
  if (name === "gmark") return `!gmark!c`;
  if (["-", "-(", "-)"].includes(name)) return `${abc}c`;
  if (["~(", "~)"].includes(name)) return `${abc}c`;
  if (shorthandChar) return `${shorthandChar}c`;
  return `${abc}c`;
}

async function mkdirp(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(
      [
        "Usage:",
        "  node devtools/build_decorations_catalog.mjs [--std <abc2.1.html>] [--abc2svg-doc <features.html>] [--out <json>]",
      ].join("\n") + "\n"
    );
    process.exit(0);
  }

  const root = repoRoot();
  const stdPath = path.resolve(root, args.stdHtml);
  const featuresPath = path.resolve(root, args.abc2svgDocHtml);
  const decoPath = path.resolve(root, "third_party/abc2svg/core/deco.js");

  const stdHtml = await fs.readFile(stdPath, "utf8");
  const featuresHtml = await fs.readFile(featuresPath, "utf8");
  const decoSource = await fs.readFile(decoPath, "utf8");

  const std = parseAbc21Decorations(stdHtml);
  const features = parseAbc2svgFeaturesDecorations(featuresHtml);
  const keys = extractAbc2svgDecoKeys(decoSource);

  // Map shorthand by name from the ABC 2.1 shortcut list (best-effort).
  const shorthandByName = new Map();
  for (const { char, desc } of std.shorthands) {
    // This maps only the 2.1 list; actual abc2svg meaning may differ for some shorthands.
    // We'll still store it as a UI hint.
    shorthandByName.set(desc.toLowerCase(), char);
  }

  // Also infer shorthand chars from abc2svg's known shortcut mapping (kept in renderer seed).
  // We don't import runtime modules here; keep it simple and only map what we can infer from the 2.1 list.

  const allNames = Array.from(new Set([...keys.standardKeys, ...keys.internalKeys])).sort((a, b) => a.localeCompare(b));
  const catalog = [];
  for (const name of allNames) {
    const descStd = std.descByName.get(name) || "";
    const descFeat = features.get(name) || "";
    const description = descStd || descFeat || "";
    const sources = [];
    if (descStd) sources.push("abc-2.1");
    if (descFeat) sources.push("abc2svg-docs");
    if (!sources.length) sources.push(keys.internalKeys.includes(name) ? "abc2svg-internal" : "abc2svg");

    // Best-effort shorthand char: use our known abc2svg char shortcuts for a few names.
    // (We keep this minimal; the picker already prefers shorthand when available.)
    const shorthandChar =
      name === "dot" ? "."
        : name === "fermata" ? "H"
          : name === "emphasis" ? "L"
            : name === "lowermordent" ? "M"
              : name === "coda" ? "O"
                : name === "uppermordent" ? "P"
                  : name === "segno" ? "S"
                    : name === "trill" ? "T"
                      : name === "upbow" ? "u"
                        : name === "downbow" ? "v"
                          : name === "gmark" ? "~"
                            : "";

    catalog.push({
      name,
      abc: `!${name}!`,
      shorthandChar,
      description,
      sources,
      example: buildExample(name, shorthandChar),
      isInternal: keys.internalKeys.includes(name),
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    std: { source: path.relative(root, stdPath) },
    abc2svgDocs: { source: path.relative(root, featuresPath) },
    abc2svg: {
      source: path.relative(root, decoPath),
      standardCount: keys.standardKeys.length,
      internalCount: keys.internalKeys.length,
    },
    shorthands_abc21: std.shorthands,
    decorations: catalog,
  };

  const outFile = args.outFile
    ? path.resolve(root, args.outFile)
    : path.resolve(root, "kitchen/derived/abc2svg-decorations-catalog.json");
  await mkdirp(path.dirname(outFile));
  await fs.writeFile(outFile, JSON.stringify(out, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote: ${path.relative(root, outFile)}\n`);
}

await main();

