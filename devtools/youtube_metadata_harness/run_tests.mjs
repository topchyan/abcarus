#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";

const bundled = await build({ entryPoints: ["src/renderer/tools/source_link/youtube_metadata_model.js"], bundle: true, format: "esm", platform: "node", write: false });
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const { applyYouTubeMetadata, collectYouTubeSources } = await import(`data:text/javascript;base64,${encoded}`);
const abc = [
  "X:1", "T:First", "F:https://youtu.be/abc123DEF45", "N:User note", "K:C", "C|", "",
  "X:2", "T:Second", "F:https://www.youtube.com/watch?v=xyz987UVW65", "N:[YouTube title] Old", "N:[YouTube channel] Old channel", "K:G", "G|", "",
].join("\n");
const sources = collectYouTubeSources(abc);
assert.equal(sources.length, 2);
assert.equal(sources[0].xNumber, "1");
assert.equal(sources[1].title, "Second");
const metadata = new Map([
  ["abc123DEF45", { title: "First video", channel: "Channel One" }],
  ["xyz987UVW65", { title: "Second video", channel: "Channel Two" }],
]);
const result = applyYouTubeMetadata(abc, metadata);
assert.equal(result.updated, 2);
assert.match(result.text, /F:https:\/\/youtu\.be\/abc123DEF45\nD:\[YouTube title\] First video\nD:\[YouTube channel\] Channel One\nN:User note/);
assert.doesNotMatch(result.text, /N:\[YouTube title\] Old/);
assert.doesNotMatch(result.text, /N:\[YouTube channel\] Old channel/);
const second = applyYouTubeMetadata(result.text, metadata);
assert.equal(second.updated, 0);
assert.equal(second.unchanged, 2);
assert.equal(second.text, result.text);
const eofResult = applyYouTubeMetadata("X:3\nF:https://youtu.be/abc123DEF45", metadata);
assert.match(eofResult.text, /F:https:\/\/youtu\.be\/abc123DEF45\nD:\[YouTube title\] First video\nD:\[YouTube channel\] Channel One\n$/);

const actionBundle = await build({ entryPoints: ["src/renderer/tools/source_link/youtube_metadata_action.js"], bundle: true, format: "esm", platform: "node", write: false });
const actionEncoded = Buffer.from(actionBundle.outputFiles[0].text, "utf8").toString("base64");
const { createYouTubeMetadataAction } = await import(`data:text/javascript;base64,${actionEncoded}`);

async function runMetadataAction(fileText, { confirmed = true } = {}) {
  const statuses = [];
  const writes = [];
  const action = createYouTubeMetadataAction({
    api: {
      fetchYouTubeMetadata: async (url) => ({
        ok: true,
        ...metadata.get(collectYouTubeSources(`X:1\nF:${url}`)[0].videoId),
      }),
      confirmYouTubeMetadataUpdate: async () => confirmed,
    },
    state: {
      getActiveFilePath: () => "/music/test.abc",
      getRawMode: () => false,
    },
    actions: {
      readFile: async () => ({ ok: true, data: fileText }),
      refreshLibraryFile: async () => ({ tunes: [] }),
      requireCleanForFileOp: async () => true,
      setStatus: (status) => statuses.push(status),
      withFileLock: async (_path, fn) => fn(),
      writeFile: async (_path, text) => {
        writes.push(text);
        return { ok: true };
      },
    },
  });
  await action.updateActiveFile();
  return { statuses, writes };
}

const updatedAction = await runMetadataAction(abc);
assert.equal(updatedAction.statuses.at(-1), "YouTube metadata updated · 2 links.");
assert.equal(updatedAction.writes.length, 1);

const currentAction = await runMetadataAction(result.text);
assert.equal(currentAction.statuses.at(-1), "YouTube metadata is up to date.");
assert.equal(currentAction.writes.length, 0);

const emptyAction = await runMetadataAction("X:1\nT:No link\nK:C\nC|");
assert.equal(emptyAction.statuses.at(-1), "No YouTube links found.");

const canceledAction = await runMetadataAction(abc, { confirmed: false });
assert.equal(canceledAction.statuses.at(-1), "YouTube metadata update canceled.");
assert.equal(canceledAction.writes.length, 0);

const rendererSource = fs.readFileSync("src/renderer/renderer.js", "utf8");
assert.match(
  rendererSource,
  /createAppCommandsDomain\([\s\S]*?actions:\s*\{[\s\S]*?updateYouTubeMetadata:\s*\(\)\s*=>\s*sourceLinkFeature\.updateYouTubeMetadata\(\)/,
  "app commands must wire the YouTube metadata action to the source-link feature",
);

const printBundle = await build({ entryPoints: ["src/renderer/print/source_link_markup.js"], bundle: true, format: "esm", platform: "node", write: false });
const printEncoded = Buffer.from(printBundle.outputFiles[0].text, "utf8").toString("base64");
const { buildPrintSourceLinkMarkup, collectPrintSources } = await import(`data:text/javascript;base64,${printEncoded}`);
const printSources = collectPrintSources(result.text);
assert.equal(printSources.length, 2);
assert.deepEqual(
  { title: printSources[0].title, channel: printSources[0].channel, videoId: printSources[0].videoId },
  { title: "First video", channel: "Channel One", videoId: "abc123DEF45" },
);
const legacyPrintSources = collectPrintSources([
  "X:4",
  "F:https://youtu.be/abc123DEF45",
  "N:[YouTube title] Legacy video",
  "N:[YouTube channel] Legacy channel",
  "K:C",
].join("\n"));
assert.deepEqual(
  { title: legacyPrintSources[0].title, channel: legacyPrintSources[0].channel },
  { title: "Legacy video", channel: "Legacy channel" },
  "print must retain compatibility with yesterday's N: metadata",
);
const printMarkup = await buildPrintSourceLinkMarkup(result.text, {
  includeQr: true,
  createQrDataUrl: async (url) => `data:image/png;base64,${Buffer.from(url).toString("base64")}`,
});
assert.match(printMarkup, />First video</);
assert.match(printMarkup, />YouTube \/ Channel One</);
assert.match(printMarkup, />youtu\.be\/abc123DEF45</);
assert.equal((printMarkup.match(/<img /g) || []).length, 2);
assert.doesNotMatch(printMarkup, /border-top/);
console.log("youtube metadata harness: all tests passed");
