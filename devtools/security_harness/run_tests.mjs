#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { normalizeAllowedExternalUrl } = require("../../src/main/url_security.js");

async function importBundledModule(filePath) {
  const result = await build({
    entryPoints: [resolve(filePath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const encoded = Buffer.from(result.outputFiles[0].text, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const {
  callAbc2svgSafely,
  neutralizeUnsafeAbcBlocks,
} = await importBundledModule("src/renderer/security/abc_security.js");

const malicious = [
  "X:1",
  "K:C",
  "%%beginjs",
  "window.api.readFile('/home/user/private.txt')",
  "%%endjs",
  "C D E F|",
  "",
].join("\n");
const neutralized = neutralizeUnsafeAbcBlocks(malicious);
assert.equal(neutralized.length, malicious.length, "security transform must preserve ABC offsets");
assert.equal(neutralized.split("\n").length, malicious.split("\n").length, "security transform must preserve lines");
assert.doesNotMatch(neutralized, /beginjs|readFile|endjs/i);
assert.match(neutralized, /^X:1$/m);
assert.match(neutralized, /^C D E F\|$/m);

const unterminated = "X:1\r\n%%beginjs\r\nthrow new Error('owned')\r\n";
const neutralizedUnterminated = neutralizeUnsafeAbcBlocks(unterminated);
assert.equal(neutralizedUnterminated.length, unterminated.length);
assert.doesNotMatch(neutralizedUnterminated, /throw|beginjs/i);

const informationFieldBlock = [
  "X:1",
  "I:beginjs",
  "window.api.writeFile('/home/user/owned.txt', 'owned')",
  "I:endjs",
  "K:C",
].join("\n");
const neutralizedInformationFieldBlock = neutralizeUnsafeAbcBlocks(informationFieldBlock);
assert.equal(neutralizedInformationFieldBlock.length, informationFieldBlock.length);
assert.doesNotMatch(neutralizedInformationFieldBlock, /beginjs|writeFile|endjs/i);
assert.match(neutralizedInformationFieldBlock, /^K:C$/m);

const rawMarkup = [
  "X:1",
  "%%beginml",
  "<img src=x onerror=\"window.api.readFile('/home/user/private.txt')\">",
  "%%endml",
  "K:C",
].join("\n");
const neutralizedRawMarkup = neutralizeUnsafeAbcBlocks(rawMarkup);
assert.equal(neutralizedRawMarkup.length, rawMarkup.length);
assert.doesNotMatch(neutralizedRawMarkup, /beginml|onerror|endml/i);
assert.match(neutralizedRawMarkup, /^K:C$/m);

const supportedSvg = "%%beginsvg\n<defs>\n<path id=\"glyph\" d=\"M0 0\"/>\n</defs>\n%%endsvg";
assert.equal(neutralizeUnsafeAbcBlocks(supportedSvg), supportedSvg, "custom SVG definitions must remain supported");

let received = "";
callAbc2svgSafely({
  tosvg(_name, text) { received = text; },
}, "test", malicious);
assert.equal(received, neutralized);

assert.equal(normalizeAllowedExternalUrl("https://example.com/help"), "https://example.com/help");
assert.equal(normalizeAllowedExternalUrl("http://example.com/"), "http://example.com/");
for (const blocked of [
  "file:///home/user/private.txt",
  "javascript:alert(1)",
  "data:text/html,owned",
  "mailto:private@example.com",
  "https://user:password@example.com/private",
  "abcarus-sf2://local/token.sf2",
  "not a url",
]) {
  assert.equal(normalizeAllowedExternalUrl(blocked), "", `must reject ${blocked}`);
}

const rendererFiles = [
  "src/renderer/app/navigation/measure_navigation_controller.js",
  "src/renderer/playback/drum_preview_controller.js",
  "src/renderer/playback/playback_prepare_controller.js",
  "src/renderer/render/abc_to_svg_markup.js",
  "src/renderer/render/render_pipeline_controller.js",
  "src/renderer/tools/import_export/import_export_feature.js",
];
for (const file of rendererFiles) {
  const source = await readFile(file, "utf8");
  assert.doesNotMatch(source, /\.tosvg\s*\(/, `${file} must use callAbc2svgSafely()`);
}

const mainSource = await readFile("src/main/index.js", "utf8");
assert.match(mainSource, /webContents\.on\("will-navigate"/);
assert.match(mainSource, /webContents\.setWindowOpenHandler/);
assert.match(mainSource, /normalizeAllowedExternalUrl\(targetUrl\)/);

const ipcSource = await readFile("src/main/ipc.js", "utf8");
assert.match(ipcSource, /ipcMain\.handle\("shell:open-external"/);
assert.match(ipcSource, /const target = normalizeAllowedExternalUrl\(url\)/);

const rendererHtml = await readFile("src/renderer/index.html", "utf8");
assert.match(rendererHtml, /script-src\s+'self'/);
assert.doesNotMatch(rendererHtml, /unsafe-eval/);

const abc2svgRuntime = await readFile("third_party/abc2svg/abc2svg-1.js", "utf8");
assert.doesNotMatch(abc2svgRuntime, /eval\(meter\.top/);
assert.match(abc2svgRuntime, /meter\.top\.split\(\/\[ \+\]\+\//);

const debugDumpSource = await readFile("src/renderer/app/diagnostics/debug_dump_builder.js", "utf8");
assert.match(debugDumpSource, /privacyNotice:/);

const releaseWorkflow = await readFile(".github/workflows/release-assets.yml", "utf8");
assert.match(releaseWorkflow, /^permissions:\n  contents: read$/m);
assert.match(releaseWorkflow, /^  publish-release:[\s\S]*?^    permissions:\n      contents: write$/m);

console.log("security harness: all tests passed");
