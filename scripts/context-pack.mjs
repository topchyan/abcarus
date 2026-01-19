import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function usage(exitCode = 1) {
  const msg = [
    "Usage:",
    "  node scripts/context-pack.mjs [--out kitchen/context.md] [--chats N] [--dumps N] [--max-bytes N] [--include-diff]",
    "",
    "Notes:",
    "  - Reads local-only artifacts from kitchen/ and generates a single Markdown context file.",
    "  - Intended for sharing context with an external reviewer/architect without zipping folders.",
    "",
    "Defaults:",
    "  --out kitchen/context.md",
    "  --chats 3",
    "  --dumps 2",
    "  --max-bytes 800000",
  ].join("\n");
  process.stderr.write(`${msg}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = {
    outPath: "kitchen/context.md",
    chats: 3,
    dumps: 2,
    maxBytes: 800000,
    includeDiff: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") out.outPath = String(argv[i + 1] || ""), i += 1;
    else if (a === "--chats") out.chats = Number(argv[i + 1] || ""), i += 1;
    else if (a === "--dumps") out.dumps = Number(argv[i + 1] || ""), i += 1;
    else if (a === "--max-bytes") out.maxBytes = Number(argv[i + 1] || ""), i += 1;
    else if (a === "--include-diff") out.includeDiff = true;
    else if (a === "-h" || a === "--help") usage(0);
    else usage(1);
  }
  if (!out.outPath) usage(1);
  if (!Number.isFinite(out.chats) || out.chats < 0) usage(1);
  if (!Number.isFinite(out.dumps) || out.dumps < 0) usage(1);
  if (!Number.isFinite(out.maxBytes) || out.maxBytes < 0) usage(1);
  out.chats = Math.floor(out.chats);
  out.dumps = Math.floor(out.dumps);
  out.maxBytes = Math.floor(out.maxBytes);
  return out;
}

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr) : "";
    const stdout = e && e.stdout ? String(e.stdout) : "";
    return `${stdout}\n${stderr}`.trim();
  }
}

function nowStamp() {
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}${tz ? ` (${tz})` : ""}`;
}

function safeRel(root, absPath) {
  const rel = path.relative(root, absPath).replaceAll(path.sep, "/");
  return rel.startsWith("..") ? absPath : rel;
}

function listFilesSorted(dirAbs) {
  try {
    const names = fs.readdirSync(dirAbs);
    const items = [];
    for (const name of names) {
      const p = path.join(dirAbs, name);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      items.push({ path: p, name, stat: st });
    }
    items.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return items;
  } catch {
    return [];
  }
}

function listFilesSortedRecursive(dirAbs) {
  const items = [];
  function walk(cur) {
    let names;
    try {
      names = fs.readdirSync(cur);
    } catch {
      return;
    }
    for (const name of names) {
      const p = path.join(cur, name);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) items.push({ path: p, name: path.basename(p), stat: st });
    }
  }
  walk(dirAbs);
  items.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return items;
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatFileManifest(root, items) {
  if (!items.length) return "_(none found)_\n";
  const lines = [];
  for (const it of items) {
    lines.push(`- \`${safeRel(root, it.path)}\` (${formatBytes(it.stat.size)}, mtime ${new Date(it.stat.mtimeMs).toISOString()})`);
  }
  return `${lines.join("\n")}\n`;
}

function readTextTruncated(absPath, maxBytes) {
  let buf;
  try {
    buf = fs.readFileSync(absPath);
  } catch {
    return { text: "", note: "read failed" };
  }
  if (buf.length <= maxBytes) return { text: buf.toString("utf8"), note: "" };
  const headBytes = Math.max(0, Math.floor(maxBytes * 0.7));
  const tailBytes = Math.max(0, maxBytes - headBytes);
  const head = buf.subarray(0, headBytes).toString("utf8");
  const tail = buf.subarray(buf.length - tailBytes).toString("utf8");
  return {
    text: `${head}\n\n… [TRUNCATED: ${formatBytes(buf.length)} > ${formatBytes(maxBytes)}] …\n\n${tail}`,
    note: `truncated (${formatBytes(buf.length)} > ${formatBytes(maxBytes)})`,
  };
}

function tryReadJson(absPath) {
  try {
    const txt = fs.readFileSync(absPath, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function getByPath(obj, dotted) {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = String(dotted).split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function summarizeDebugDump(absPath) {
  const j = tryReadJson(absPath);
  if (!j) return "";
  const ctx = getByPath(j, "context") || {};
  const summary = {
    label: ctx.label,
    filePath: ctx.filePath,
    xNumber: ctx.xNumber,
    tuneTitle: ctx.tuneTitle,
    appVersion: getByPath(j, "app.version") || getByPath(j, "meta.appVersion"),
    platform: getByPath(j, "app.platform") || getByPath(j, "meta.platform"),
  };
  const compact = JSON.stringify(summary, null, 2);
  if (compact === "{}") return "";
  return `\n\`\`\`json\n${compact}\n\`\`\`\n`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileAtomic(absPath, content) {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });

  const base = path.basename(absPath);
  const tmp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, content, "utf8");

  const tries = 6;
  for (let i = 0; i < tries; i += 1) {
    try {
      fs.renameSync(tmp, absPath);
      return;
    } catch (e) {
      if (i === tries - 1) throw e;
      sleep(30 * (i + 1));
    }
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const outAbs = path.isAbsolute(args.outPath) ? args.outPath : path.join(root, args.outPath);

const chatDir = path.join(root, "kitchen/chat-exports");
const dumpDir = path.join(root, "kitchen/debug_dumps");

const branch = run("git rev-parse --abbrev-ref HEAD", root);
const head = run("git rev-parse --short HEAD", root);
const subject = run("git log -1 --pretty=%s", root);
const status = run("git status --porcelain=v1", root);
const diffStat = run("git diff --stat", root);
const diff = args.includeDiff ? run("git diff", root) : "";

const chatsAll = listFilesSortedRecursive(chatDir).filter((it) => it.name.toLowerCase().endsWith(".md"));
const dumpsAll = listFilesSorted(dumpDir);
const chatsPick = chatsAll.slice(0, args.chats);
const dumpsPick = dumpsAll.slice(0, args.dumps);

const parts = [];
parts.push(`# ABCarus context packet\n`);
parts.push(`Generated: ${nowStamp()}\n`);
parts.push(`## Repo state\n`);
parts.push(`- Branch: \`${branch || "(unknown)"}\``);
parts.push(`- HEAD: \`${head || "(unknown)"}\`${subject ? ` (${subject})` : ""}`);
parts.push("");
parts.push(`**Git status (porcelain)**\n`);
parts.push("```text");
parts.push(status || "(clean)");
parts.push("```");
parts.push("");
parts.push(`**Working tree diffstat**\n`);
parts.push("```text");
parts.push(diffStat || "(no diff)");
parts.push("```");
parts.push("");

if (args.includeDiff) {
  parts.push(`## Working tree diff\n`);
  parts.push("```diff");
  parts.push(diff || "(no diff)");
  parts.push("```");
  parts.push("");
}

parts.push(`## Kitchen artifacts\n`);
parts.push(`### Recent chat exports (manifest)\n`);
parts.push(formatFileManifest(root, chatsPick));
parts.push(`### Recent debug dumps (manifest)\n`);
parts.push(formatFileManifest(root, dumpsPick));

const dumpsNonJson = dumpsPick.filter((it) => !it.name.toLowerCase().endsWith(".json"));
if (dumpsNonJson.length) {
  parts.push("");
  parts.push(
    `Note: non-JSON attachments are listed above. If they matter (e.g. screenshots), upload those files alongside this Markdown.\n`
  );
}

if (chatsPick.length) {
  parts.push(`## Chat exports (contents)\n`);
  for (const it of chatsPick) {
    const { text, note } = readTextTruncated(it.path, args.maxBytes);
    parts.push(`### \`${safeRel(root, it.path)}\`${note ? ` — ${note}` : ""}\n`);
    parts.push(text.trim() ? text : "_(empty)_");
    parts.push("\n");
  }
}

if (dumpsPick.length) {
  parts.push(`## Debug dumps (summaries)\n`);
  for (const it of dumpsPick) {
    parts.push(`### \`${safeRel(root, it.path)}\`\n`);
    if (!it.name.toLowerCase().endsWith(".json")) {
      parts.push("_(non-JSON attachment; see manifest above)_\n");
      continue;
    }
    const summary = summarizeDebugDump(it.path);
    if (summary) parts.push(summary);
    else parts.push("_(no summary extracted; JSON parse failed or unexpected shape)_\n");
  }
}

writeFileAtomic(outAbs, `${parts.join("\n").trim()}\n`);
process.stdout.write(`Wrote ${outAbs}\n`);
