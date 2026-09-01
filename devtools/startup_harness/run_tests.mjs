#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function importRendererModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const { createStartupController } = await importRendererModule(
  resolve("src/renderer/app/startup/startup_controller.js"),
);

{
  const events = [];
  let root = "";
  const controller = createStartupController({
    api: {
      getRecentCandidates: async () => [
        { type: "tune", entry: { path: "/music/a.abc", id: "missing" } },
        { type: "file", entry: { path: "/music/a.abc" } },
        { type: "folder", entry: { path: "/music" } },
      ],
      getSettings: async () => ({}),
    },
    getLibraryRoot: () => root,
    loadLibraryFromFolder: async (path, options) => {
      events.push(["load-folder", path, options]);
      root = path;
    },
    openRecentTune: async () => {
      events.push(["open-tune"]);
      return { ok: false };
    },
    openRecentFile: async () => {
      events.push(["open-file"]);
      return { ok: true };
    },
    markRecentOpenStarted: () => events.push(["recent-started"]),
    renderStatus: () => events.push(["render-status"]),
  });

  assert.equal(await controller.start(), true);
  assert.deepEqual(events, [
    ["load-folder", "/music", { selectInitialTune: false }],
    ["recent-started"],
    ["open-tune"],
    ["open-file"],
    ["recent-started"],
    ["render-status"],
  ]);
}

{
  const events = [];
  let root = "";
  const controller = createStartupController({
    api: {
      getRecentCandidates: async () => [
        { type: "tune", entry: { path: "/home/music/current/various.abc" } },
        { type: "file", entry: { path: "/home/music/current/various.abc" } },
        { type: "folder", entry: { path: "/media/old-library" } },
        { type: "folder", entry: { path: "/home/music" } },
        { type: "folder", entry: { path: "/home/music/current" } },
      ],
      getSettings: async () => ({}),
    },
    getLibraryRoot: () => root,
    loadLibraryFromFolder: async (path) => {
      events.push(["load-folder", path]);
      root = path;
    },
    openRecentTune: async () => {
      events.push(["open-tune"]);
      return { ok: true };
    },
  });

  assert.equal(await controller.start(), true);
  assert.deepEqual(events, [
    ["load-folder", "/home/music/current"],
    ["open-tune"],
  ]);
}

{
  const events = [];
  const controller = createStartupController({
    api: {
      getRecentCandidates: async () => [
        { type: "tune", entry: { path: "/music-archive/a.abc" } },
        { type: "folder", entry: { path: "/music" } },
      ],
      getSettings: async () => ({}),
    },
    loadLibraryFromFolder: async (path) => events.push(path),
    openRecentTune: async () => ({ ok: true }),
  });

  assert.equal(await controller.start(), true);
  assert.deepEqual(events, ["/music"], "folder matching must respect path boundaries");
}

{
  let legacyCalls = 0;
  let readyCalls = 0;
  const controller = createStartupController({
    api: {
      getRecentCandidates: async () => [],
      getLastRecent: async () => {
        legacyCalls += 1;
        return null;
      },
    },
    markUiReady: () => { readyCalls += 1; },
  });

  assert.equal(await controller.start(), false);
  assert.equal(legacyCalls, 1);
  assert.equal(readyCalls, 1);
}

{
  const frames = [];
  const events = [];
  const controller = createStartupController({
    requestAnimationFrameRef: (callback) => frames.push(callback),
    applyInitialLayout: () => events.push("layout"),
    centerRenderPane: () => events.push("center"),
  });

  controller.scheduleLayoutReset();
  controller.scheduleLayoutReset();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(events, ["layout"]);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(events, ["layout", "center"]);
  controller.scheduleLayoutReset();
  assert.equal(frames.length, 0);
}

{
  let progressHandler = null;
  const statuses = [];
  const timers = [];
  let statusRefreshes = 0;
  const controller = createStartupController({
    api: {
      onLibraryProgress: (handler) => { progressHandler = handler; },
    },
    setScanStatus: (...args) => statuses.push(args),
    updateLibraryStatus: () => { statusRefreshes += 1; },
    setTimeoutRef: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutRef: (timer) => { timer.cleared = true; },
  });

  assert.equal(controller.wireLibraryProgress(), true);
  assert.equal(controller.wireLibraryProgress(), false);
  assert.equal(typeof progressHandler, "function");

  progressHandler({ phase: "discover", filesFound: 12 });
  progressHandler({ phase: "parse", index: 4, total: 4 });
  progressHandler({ phase: "done", filesFound: 12 });
  assert.deepEqual(statuses, [
    ["Scanning… 12 files"],
    ["Indexing… 4/4"],
    ["Indexed · 12 files"],
  ]);
  assert.equal(timers.length, 2);
  assert.equal(timers[0].delay, 600);
  assert.equal(timers[0].cleared, true);
  assert.equal(timers[1].delay, 900);
  timers[1].callback();
  assert.equal(statusRefreshes, 1);
}

console.log("startup harness: all tests passed");
