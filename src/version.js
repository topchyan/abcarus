const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function readPackageVersion() {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    return String(pkg.version || "");
  } catch {
    return "";
  }
}

function runGit(cwd, args) {
  try {
    return String(execFileSync("git", args, { cwd })).trim();
  } catch {
    return "";
  }
}

function getVersionInfo() {
  const appPath = path.join(__dirname, "..");
  const version = readPackageVersion();
  const envCommit = process.env.ABCARUS_COMMIT || "";
  const envBuild = process.env.ABCARUS_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || "";
  const commit = envCommit || runGit(appPath, ["rev-parse", "--short", "HEAD"]);
  const build = envBuild || "local";
  const tag = runGit(appPath, ["describe", "--tags", "--exact-match"]);
  const channel = tag && tag === `v${version}` ? "release" : "dev";
  return { version, build, commit, channel };
}

module.exports = { getVersionInfo };
