#!/usr/bin/env node

// Generates a TSV report of GitHub Release download counts.
// Usage:
//   node scripts/release-downloads-report.mjs [--limit N]
//   node scripts/release-downloads-report.mjs --all
//
// Output columns:
//   tag\tpublishedAt\ttotal\tassetCount\tassets
// Where `assets` is a '; ' separated list: name(downloadCount)

import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const out = { all: false, limit: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--all") out.all = true;
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
    const assetList = assets
      .map((a) => `${safe(a.name)}(${Number(a.download_count) || 0})`)
      .join("; ");

    rows.push({ tag, publishedAt, total, assetCount: assets.length, assets: assetList });
  }

  // Sort newest-ish by semver tag if possible, else keep tag string order.
  // Keep stable output: tag asc by default.
  rows.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true, sensitivity: "base" }));

  process.stdout.write("tag\tpublishedAt\ttotal\tassetCount\tassets\n");
  for (const r of rows) {
    process.stdout.write(`${safe(r.tag)}\t${safe(r.publishedAt)}\t${r.total}\t${r.assetCount}\t${safe(r.assets)}\n`);
  }
}

main();
