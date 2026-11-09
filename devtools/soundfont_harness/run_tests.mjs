#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createSoundfontProtocol,
} = require("../../src/main/soundfontProtocol.js");

async function importBundledModule(filePath) {
  const result = await build({
    entryPoints: [path.resolve(filePath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const encoded = Buffer.from(result.outputFiles[0].text, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const handlers = new Map();
const protocol = {
  handle: (scheme, handler) => handlers.set(scheme, handler),
};
const service = createSoundfontProtocol({ protocol, fs, path });
service.register();
assert.equal(typeof handlers.get("abcarus-sf2"), "function");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "abcarus-sf2-"));
const sf2Path = path.join(tempDir, "external sound.sf2");
fs.writeFileSync(sf2Path, Buffer.from([1, 2, 3, 4]));
try {
  const streamUrl = await service.exposeFile(sf2Path);
  assert.match(streamUrl, /^abcarus-sf2:\/\/local\/[a-f0-9]+\.sf2$/);
  const response = await handlers.get("abcarus-sf2")({
    method: "GET",
    url: streamUrl,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "4");
  assert.deepEqual(
    Array.from(new Uint8Array(await response.arrayBuffer())),
    [1, 2, 3, 4],
  );
  assert.equal((await handlers.get("abcarus-sf2")({
    method: "GET",
    url: "abcarus-sf2://local/missing.sf2",
  })).status, 404);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const { createSoundfontController } = await importBundledModule(
  "src/renderer/playback/soundfont_controller.js",
);
const applied = [];
const requested = [];
const windowRef = {
  location: { href: "file:///app/src/renderer/index.html" },
  abc2svg: {},
};
const controller = createSoundfontController({
  windowRef,
  api: {
    getSoundfontStreamUrl: async (name) => {
      requested.push(name);
      return "abcarus-sf2://local/test.sf2";
    },
  },
  actions: {
    ensurePlayer: () => ({ set_sfu: (source) => applied.push(source) }),
  },
});
controller.setFromSettings({ soundfontName: "/tmp/external.sf2" });
await controller.ensureReady();
assert.deepEqual(requested, ["/tmp/external.sf2"]);
assert.deepEqual(applied, ["abcarus-sf2://local/test.sf2"]);
assert.equal(windowRef.abc2svg.sf2, null);
assert.doesNotMatch(controller.getSource(), /^file:/);

const oversizedNotices = [];
let oversizedStreamRequests = 0;
const oversizedWindow = {
  location: { href: "file:///app/src/renderer/index.html" },
  abc2svg: {},
};
const oversizedController = createSoundfontController({
  windowRef: oversizedWindow,
  api: {
    getSoundfontInfo: async () => ({ name: "oversized.sf2", size: 489303960 }),
    getSoundfontStreamUrl: async () => {
      oversizedStreamRequests += 1;
      return "abcarus-sf2://local/oversized.sf2";
    },
    readFileBase64: async () => "YnVuZGxlZA==",
  },
  actions: {
    showToast: (message) => oversizedNotices.push(message),
  },
});
oversizedController.setFromSettings({ soundfontName: "/tmp/oversized.sf2" });
await oversizedController.ensureLoaded();
assert.equal(oversizedStreamRequests, 0, "oversized SF2 must be rejected before abc2svg receives it");
assert.equal(oversizedController.getReadyName(), "TimGM6mb.sf2");
assert.equal(oversizedController.getSource(), "abc2svg.sf2");
assert.match(oversizedController.getLastLoadError().message, /384 MiB safe loading limit/);
assert.equal(oversizedNotices.length, 1);
assert.match(oversizedNotices[0], /Using TimGM6mb\.sf2/);
await oversizedController.ensureLoaded();
assert.equal(oversizedNotices.length, 1, "fallback notice must not repeat on every playback attempt");

let releaseBundledRead;
const bundledRead = new Promise((resolve) => {
  releaseBundledRead = resolve;
});
const raceWindow = {
  location: { href: "file:///app/src/renderer/index.html" },
  abc2svg: {},
};
const raceController = createSoundfontController({
  windowRef: raceWindow,
  api: {
    readFileBase64: async () => bundledRead,
    getSoundfontStreamUrl: async () => "abcarus-sf2://local/current.sf2",
  },
});
const staleLoad = raceController.ensureLoaded();
raceController.setFromSettings({ soundfontName: "/tmp/current.sf2" });
raceController.resetCache();
const currentLoad = raceController.ensureLoaded();
releaseBundledRead("c3RhbGU=");
await Promise.all([staleLoad, currentLoad]);
assert.equal(raceController.getReadyName(), "/tmp/current.sf2");
assert.equal(raceController.getSource(), "abcarus-sf2://local/current.sf2");
assert.equal(raceWindow.abc2svg.sf2, null);

const runtimeListeners = new Map();
const runtimeNotices = [];
const runtimeStops = [];
const runtimeWindow = {
  location: { href: "file:///app/src/renderer/index.html" },
  abc2svg: {},
  addEventListener: (type, handler) => runtimeListeners.set(type, handler),
};
const runtimeController = createSoundfontController({
  windowRef: runtimeWindow,
  api: {
    getSoundfontStreamUrl: async () => "abcarus-sf2://local/incompatible.sf2",
  },
  actions: {
    showToast: (message) => runtimeNotices.push(message),
    stopPlayback: (message) => runtimeStops.push(message),
  },
});
runtimeController.setFromSettings({ soundfontName: "/tmp/incompatible.sf2" });
runtimeController.installRuntimeErrorHandler();
runtimeListeners.get("error")({
  message: "Failed to set the 'loopStart' property on 'AudioBufferSourceNode': The provided double value is non-finite.",
});
assert.equal(runtimeNotices.length, 1);
assert.match(runtimeNotices[0], /incompatible with abc2svg/);
assert.deepEqual(runtimeStops, runtimeNotices);
assert.match(runtimeController.getLastLoadError().message, /loopStart/);

const { createSettingsRuntimeController } = await importBundledModule(
  "src/renderer/app/ui/settings_runtime_controller.js",
);
let activeName = "TimGM6mb.sf2";
const initialCalls = [];
const settingsRuntime = createSettingsRuntimeController({
  api: {
    getSettings: async () => ({ soundfontName: "/tmp/initial.sf2" }),
  },
  state: {
    getSoundfontName: () => activeName,
    setLatestSettings: () => {},
  },
  actions: {
    applySoundfont: (settings) => {
      activeName = settings.soundfontName;
      initialCalls.push("apply");
    },
    resetSoundfontCache: () => initialCalls.push("reset-cache"),
    resetPlaybackForSoundfontChange: () => initialCalls.push("reset-player"),
    ensureSoundfontLoaded: () => initialCalls.push("load"),
    prewarmCurrentTune: () => initialCalls.push("prewarm"),
  },
});
await settingsRuntime.loadInitialSettings();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(initialCalls, ["apply", "reset-cache", "reset-player", "load", "prewarm"]);

const rendererHtml = await readFile("src/renderer/index.html", "utf8");
assert.match(rendererHtml, /connect-src[^;]*\babcarus-sf2:/);

console.log("soundfont harness: all tests passed");
