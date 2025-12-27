import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import semver from "semver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const changelogPath = path.join(root, "CHANGELOG.md");

const bumpType = process.argv[2];
if (!["patch", "minor", "major"].includes(bumpType)) {
  console.error("Usage: node scripts/release.mjs <patch|minor|major>");
  process.exit(1);
}

function runGit(args) {
  return String(execFileSync("git", args, { cwd: root })).trim();
}

const status = runGit(["status", "--porcelain"]);
if (status) {
  console.error("Git working tree is not clean. Commit or stash changes first.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const current = String(pkg.version || "");
const next = semver.inc(current, bumpType);
if (!next) {
  console.error(`Failed to bump version from ${current}.`);
  process.exit(1);
}

pkg.version = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = next;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = next;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

const today = new Date().toISOString().slice(0, 10);
const changelog = fs.readFileSync(changelogPath, "utf8");
const header = "## [Unreleased]";
const idx = changelog.indexOf(header);
if (idx === -1) {
  console.error("CHANGELOG.md is missing the Unreleased section.");
  process.exit(1);
}

const insertAt = idx + header.length;
const entry = `\n\n## [${next}] - ${today}\n### Added\n- \n### Changed\n- \n### Fixed\n- \n### Removed\n- \n`;
const updated = changelog.slice(0, insertAt) + entry + changelog.slice(insertAt);
fs.writeFileSync(changelogPath, updated);

runGit(["add", "package.json", "package-lock.json", "CHANGELOG.md"]);
runGit(["commit", "-m", `chore(release): v${next}`]);
runGit(["tag", "-a", `v${next}`, "-m", `v${next}`]);

console.log(`Release prepared: v${next}`);
console.log("Next steps:");
console.log("  git push");
console.log(`  git push origin v${next}`);
console.log("  Create GitHub Release using the CHANGELOG entry.");
