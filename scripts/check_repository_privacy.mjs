#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const buildFiles = packageJson.build && Array.isArray(packageJson.build.files)
  ? packageJson.build.files
  : [];

const requiredBuildExclusions = [
  "!kitchen/**",
  "!debug_dumps/**",
  "!docs/qa/**",
  "!docs/roadmaps/**",
  "!assets/brand/**",
  "!scripts/local/**",
  "!third_party/_upd/**",
];

const failures = [];
for (const pattern of requiredBuildExclusions) {
  if (!buildFiles.includes(pattern)) {
    failures.push(`package.json build.files must include ${pattern}`);
  }
}

const forbiddenTrackedRoots = [
  "debug_dumps/",
  "docs/qa/",
  "scripts/local/",
  "third_party/_upd/",
];
const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

for (const file of trackedFiles) {
  if (forbiddenTrackedRoots.some((root) => file.startsWith(root))) {
    failures.push(`${file}: private/local path must not be tracked`);
  }
  if (file.startsWith("kitchen/") && file !== "kitchen/README.md") {
    failures.push(`${file}: only kitchen/README.md may be tracked`);
  }
}

const personalPathPatterns = [
  /\/home\/avetik(?:\/|\b)/,
  /\/Users\/avetik(?:\/|\b)/i,
  /[A-Za-z]:[\\/]Users[\\/]avetik(?:[\\/]|\b)/i,
];

for (const file of trackedFiles) {
  let text;
  try {
    const data = fs.readFileSync(file);
    if (data.includes(0)) continue;
    text = data.toString("utf8");
  } catch {
    continue;
  }
  if (personalPathPatterns.some((pattern) => pattern.test(text))) {
    failures.push(`${file}: contains a developer-specific absolute path`);
  }
}

if (failures.length) {
  console.error("repository privacy check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("repository privacy check: passed");
