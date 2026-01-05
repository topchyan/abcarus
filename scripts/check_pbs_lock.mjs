#!/usr/bin/env node
// scripts/check_pbs_lock.mjs
// Verifies that python-build-standalone lock files exist and look sane.
//
// Usage:
//   node scripts/check_pbs_lock.mjs                 # check all platforms
//   node scripts/check_pbs_lock.mjs --platform=linux-x64

import fs from "node:fs";
import path from "node:path";

const argv = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) return [m[1], m[2]];
  const m2 = arg.match(/^--(.+)$/);
  return m2 ? [m2[1], "true"] : [arg, "true"];
}));

const KNOWN_PLATFORMS = ["linux-x64", "darwin-x64", "darwin-arm64", "win-x64"];
const platformArg = String(argv.platform || "").trim();
const platforms = platformArg ? [platformArg] : KNOWN_PLATFORMS;

if (platformArg && !KNOWN_PLATFORMS.includes(platformArg)) {
  console.error(`Unknown platform: ${platformArg}`);
  console.error(`Expected one of: ${KNOWN_PLATFORMS.join(", ")}`);
  process.exit(1);
}

function must(cond, message) {
  if (cond) return;
  throw new Error(message);
}

function isSha256(text) {
  return typeof text === "string" && /^[a-f0-9]{64}$/i.test(text.trim());
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

const expectedTriples = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win-x64": "x86_64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
};

let ok = true;
for (const platform of platforms) {
  try {
    const lockPath = path.join(
      "third_party",
      "python-embed",
      platform,
      "python-build-standalone.lock.json"
    );
    must(fs.existsSync(lockPath), `Missing lock file: ${lockPath}`);
    const lock = readJson(lockPath);
    must(lock && typeof lock === "object", `Invalid JSON object in: ${lockPath}`);
    must(lock.repo === "astral-sh/python-build-standalone", `Unexpected repo in ${lockPath}: ${lock.repo}`);
    must(typeof lock.tag === "string" && lock.tag.trim(), `Missing tag in ${lockPath}`);
    must(typeof lock.asset === "string" && lock.asset.trim(), `Missing asset in ${lockPath}`);
    must(isSha256(lock.sha256), `Missing/invalid sha256 in ${lockPath}`);
    must(lock.platform === platform, `platform mismatch in ${lockPath}: ${lock.platform} (expected ${platform})`);
    must(lock.pyMinor === "3.11", `pyMinor mismatch in ${lockPath}: ${lock.pyMinor} (expected 3.11)`);
    must(lock.flavor === "install_only_stripped" || lock.flavor === "install_only", `Unexpected flavor in ${lockPath}: ${lock.flavor}`);
    must(lock.triple === expectedTriples[platform], `triple mismatch in ${lockPath}: ${lock.triple} (expected ${expectedTriples[platform]})`);
    console.log(`OK: ${lockPath}`);
  } catch (e) {
    ok = false;
    console.error(`FAIL: ${platform}: ${e && e.message ? e.message : String(e)}`);
  }
}

process.exit(ok ? 0 : 1);

