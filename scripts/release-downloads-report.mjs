#!/usr/bin/env node

// Generates a TSV report of GitHub Release download counts.
// Usage:
//   node scripts/release-downloads-report.mjs [--limit N]
//   node scripts/release-downloads-report.mjs --all
//   node scripts/release-downloads-report.mjs --format wide
//
// Formats:
// - long (default): tag, publishedAt, total, assetCount, assets (one cell: name(count); ...)
// - wide: crosstab with stable columns per asset kind (short names), plus otherTotal/otherAssets.

import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const out = { all: false, limit: 30, format: "long" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--format") {
      const v = String(argv[i + 1] || "").trim();
      if (v === "wide" || v === "long") out.format = v;
      i += 1;
    } else if (a === "--wide") out.format = "wide";
    else if (a === "--limit") {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
      i += 1;
    }
  }
  return out;
}

function runGhJson(args) {
  const buf = execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(buf);
}

function safe(s) {
  return String(s == null ? "" : s).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function assetToKey(assetName) {
  const name = String(assetName || "");
  if (!name) return null;

  const n = name.toLowerCase();
  if (/^abcarus-macos-x64\.dmg$/.test(n)) return "mac_x64_dmg";
  if (/^abcarus-macos-arm64\.dmg$/.test(n)) return "mac_arm64_dmg";
  if (/^abcarus-portable-x64\.exe$/.test(n)) return "win_portable_x64";
  if (/^abcarus-setup-x64\.exe$/.test(n)) return "win_setup_x64";
  if (/^abcarus-win-unpacked-x64\.zip$/.test(n)) return "win_unpacked_zip";
  if (/^abcarus-x86_64\.appimage$/.test(n)) return "linux_appimage";
  if (/^abcarus-x86_64-portable\.tar\.gz$/.test(n)) return "linux_portable_targz";
  if (/^sha256sums-linux\.txt$/.test(n)) return "sha_linux";
  if (/^sha256sums-macos-x64\.txt$/.test(n)) return "sha_macos_x64";
  if (/^sha256sums-macos-arm64\.txt$/.test(n)) return "sha_macos_arm64";
  if (/^sha256sums-windows\.txt$/.test(n)) return "sha_windows";

  return null;
}

function wideColumns() {
  return [
    { key: "mac_arm64_dmg", label: "mac_arm64_dmg" },
    { key: "mac_x64_dmg", label: "mac_x64_dmg" },
    { key: "win_setup_x64", label: "win_setup_x64" },
    { key: "win_portable_x64", label: "win_portable_x64" },
    { key: "win_unpacked_zip", label: "win_unpacked_zip" },
    { key: "linux_appimage", label: "linux_appimage" },
    { key: "linux_portable_targz", label: "linux_portable_targz" },
    { key: "sha_linux", label: "sha_linux" },
    { key: "sha_macos_arm64", label: "sha_macos_arm64" },
    { key: "sha_macos_x64", label: "sha_macos_x64" },
    { key: "sha_windows", label: "sha_windows" },
  ];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Use `gh api` instead of `gh release list --json` because older gh versions
  // (e.g. 2.23 on Debian) don't support `--json` on `gh release list`.
  const releasesAll = runGhJson([
    "api",
    "--paginate",
    "-H",
    "Accept: application/vnd.github+json",
    "repos/{owner}/{repo}/releases?per_page=100",
  ]).filter((r) => r && r.tag_name && !r.draft);

  // Keep stable order: newest first, then apply limit (unless --all).
  releasesAll.sort((a, b) => String(b.published_at || b.created_at || "").localeCompare(String(a.published_at || a.created_at || "")));
  const releases = opts.all ? releasesAll : releasesAll.slice(0, opts.limit);

  const rows = [];
  for (const rel of releases) {
    const tag = String(rel.tag_name || "");
    const publishedAt = rel.published_at || rel.created_at || "";
    const assets = Array.isArray(rel.assets) ? rel.assets : [];

    const total = assets.reduce((sum, a) => sum + (Number(a.download_count) || 0), 0);
    if (opts.format === "wide") {
      const byKey = new Map();
      const other = [];
      let otherTotal = 0;
      for (const a of assets) {
        const name = a && a.name ? String(a.name) : "";
        const count = Number(a && a.download_count) || 0;
        const key = assetToKey(name);
        if (key) byKey.set(key, (byKey.get(key) || 0) + count);
        else if (name) {
          otherTotal += count;
          other.push(`${safe(name)}(${count})`);
        }
      }
      rows.push({
        tag,
        publishedAt,
        total,
        assetCount: assets.length,
        byKey,
        otherTotal,
        otherAssets: other.join("; "),
      });
    } else {
      const assetList = assets
        .map((a) => `${safe(a.name)}(${Number(a.download_count) || 0})`)
        .join("; ");
      rows.push({ tag, publishedAt, total, assetCount: assets.length, assets: assetList });
    }
  }

  // Sort newest-ish by semver tag if possible, else keep tag string order.
  // Keep stable output: tag asc by default.
  rows.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true, sensitivity: "base" }));

  if (opts.format === "wide") {
    const cols = wideColumns();
    process.stdout.write(
      ["tag", "publishedAt", "total", "assetCount", ...cols.map((c) => c.label), "otherTotal", "otherAssets"].join("\t") + "\n"
    );
    for (const r of rows) {
      const values = cols.map((c) => {
        const v = r.byKey && typeof r.byKey.get === "function" ? (r.byKey.get(c.key) || 0) : 0;
        return String(Number(v) || 0);
      });
      process.stdout.write(
        [
          safe(r.tag),
          safe(r.publishedAt),
          String(r.total),
          String(r.assetCount),
          ...values,
          String(Number(r.otherTotal) || 0),
          safe(r.otherAssets || ""),
        ].join("\t") + "\n"
      );
    }
    return;
  }

  process.stdout.write("tag\tpublishedAt\ttotal\tassetCount\tassets\n");
  for (const r of rows) {
    process.stdout.write(`${safe(r.tag)}\t${safe(r.publishedAt)}\t${r.total}\t${r.assetCount}\t${safe(r.assets)}\n`);
  }
}

main();
