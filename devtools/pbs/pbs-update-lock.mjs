// devtools/pbs/pbs-update-lock.mjs
// Updates a pinned python-build-standalone lock file for a given platform.
//
// Examples:
//   node devtools/pbs/pbs-update-lock.mjs --platform=linux-x64
//   node devtools/pbs/pbs-update-lock.mjs --platform=win-x64 --tag=20251217
//   node devtools/pbs/pbs-update-lock.mjs --platform=darwin-arm64 --py=3.11 --flavor=install_only_stripped

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";

const argv = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) return [m[1], m[2]];
  const m2 = arg.match(/^--(.+)$/);
  return m2 ? [m2[1], "true"] : [arg, "true"];
}));

const REPO = "astral-sh/python-build-standalone";
const CACHE_DIR = path.join("third_party", "python-embed", ".cache", "python-build-standalone");

const platform = String(argv.platform || "").trim();
if (!platform) {
  console.error("Missing required flag: --platform=<linux-x64|win-x64|darwin-x64|darwin-arm64>");
  process.exit(1);
}

const pyMinor = String(argv.py || "3.11").trim();
const flavor = String(argv.flavor || "install_only_stripped").trim();
const tag = String(argv.tag || "latest").trim();

const PLATFORM_TRIPLES = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win-x64": "x86_64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
};

const triple = PLATFORM_TRIPLES[platform];
if (!triple) {
  console.error(`Unknown --platform value: ${platform}`);
  console.error(`Expected one of: ${Object.keys(PLATFORM_TRIPLES).join(", ")}`);
  process.exit(1);
}

const outLock = path.join("third_party", "python-embed", platform, "python-build-standalone.lock.json");
fs.mkdirSync(path.dirname(outLock), { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "abcarus-pbs-locker", ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON for ${url}: ${e && e.message ? e.message : String(e)}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${url}\n${data.slice(0, 800)}`));
        }
      });
    }).on("error", reject);
  });
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { "User-Agent": "abcarus-pbs-downloader" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        return resolve(download(res.headers.location, destPath));
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
  });
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const s = fs.createReadStream(p);
    s.on("data", (d) => hash.update(d));
    s.on("end", () => resolve(hash.digest("hex")));
    s.on("error", reject);
  });
}

function parsePatch(name) {
  // cpython-3.11.14+20251217-... => 14
  const safeMinor = pyMinor.replace(".", "\\.");
  const m = name.match(new RegExp(`^cpython-${safeMinor}\\.([0-9]+)\\+`));
  return m ? Number(m[1]) : -1;
}

async function main() {
  const release = tag === "latest"
    ? await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
    : await fetchJson(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`);

  const tagName = String(release.tag_name || "").trim();
  if (!tagName) throw new Error(`Unexpected GitHub release payload (missing tag_name) for tag=${tag}`);

  const suffix = `-${triple}-${flavor}.tar.gz`;
  const candidates = Array.isArray(release.assets)
    ? release.assets
      .map((a) => a && a.name ? String(a.name) : "")
      .filter((n) => n.startsWith(`cpython-${pyMinor}.`) && n.endsWith(suffix))
    : [];

  if (candidates.length === 0) {
    throw new Error(
      `No assets match py=${pyMinor}, triple=${triple}, flavor=${flavor} in release ${tagName}.\n` +
      `Expected suffix: ${suffix}`
    );
  }

  candidates.sort((a, b) => parsePatch(b) - parsePatch(a));
  const assetName = candidates[0];
  const downloadUrl = `https://github.com/${REPO}/releases/download/${tagName}/${assetName}`;
  const cached = path.join(CACHE_DIR, assetName);

  console.log(`Selected release: ${tagName}`);
  console.log(`Selected platform: ${platform}`);
  console.log(`Selected triple:  ${triple}`);
  console.log(`Selected asset:   ${assetName}`);
  console.log(`Downloading:      ${downloadUrl}`);

  await download(downloadUrl, cached);
  const sha256 = await sha256File(cached);

  const lock = {
    repo: REPO,
    tag: tagName,
    asset: assetName,
    sha256,
    triple,
    platform,
    pyMinor,
    flavor,
    downloadedAtUtc: new Date().toISOString(),
  };

  fs.writeFileSync(outLock, JSON.stringify(lock, null, 2) + "\n", "utf8");
  console.log(`Wrote lock: ${outLock}`);
  console.log(`sha256: ${sha256}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});

