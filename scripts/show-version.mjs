import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");

function readPkgVersion() {
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  return String(pkg.version || "");
}

function runGit(args) {
  try {
    return String(execFileSync("git", args, { cwd: root })).trim();
  } catch {
    return "";
  }
}

const version = readPkgVersion();
const commit = process.env.ABCARUS_COMMIT || runGit(["rev-parse", "--short", "HEAD"]);
const build = process.env.ABCARUS_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || "local";
const tag = runGit(["describe", "--tags", "--exact-match"]);
const channel = tag && tag === `v${version}` ? "release" : "dev";

console.log(`Version: ${version}`);
console.log(`Build: ${build}`);
console.log(`Commit: ${commit}`);
console.log(`Channel: ${channel}`);
