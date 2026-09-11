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

const { createLibraryLifecycleController } = await importRendererModule(
  resolve("src/renderer/library/library_lifecycle_controller.js"),
);

{
  const sibling = {
    path: "/music/b.abc",
    basename: "b.abc",
    tunes: [{ id: "b" }],
  };
  let libraryIndex = {
    root: "/music",
    files: [
      { path: "/music/a.abc", basename: "a.abc", tunes: [] },
      sibling,
    ],
    indexMode: "full",
  };
  const parsedFile = {
    path: "/music/a.abc",
    basename: "a.abc",
    tunes: [{ id: "a" }],
  };
  const controller = createLibraryLifecycleController({
    api: {
      parseLibraryFile: async () => ({
        root: "/music",
        files: [parsedFile],
      }),
    },
    state: {
      getLibraryIndex: () => libraryIndex,
      setLibraryIndex: (next) => { libraryIndex = next; },
    },
    actions: {
      pathsEqual: (left, right) => left === right,
      safeBasename: (value) => String(value || "").split("/").pop(),
      safeDirname: (value) => String(value || "").replace(/\/[^/]*$/, ""),
    },
  });

  assert.equal(await controller.loadSingleLibraryFile("/music/a.abc"), parsedFile);
  assert.equal(libraryIndex.root, "/music");
  assert.equal(libraryIndex.indexMode, "full");
  assert.equal(libraryIndex.files.length, 2);
  assert.equal(libraryIndex.files[0], parsedFile);
  assert.equal(libraryIndex.files[1], sibling);
}

{
  let libraryIndex = {
    root: "/old",
    files: [{ path: "/old/a.abc", tunes: [] }],
    indexMode: "full",
  };
  const controller = createLibraryLifecycleController({
    api: {
      parseLibraryFile: async () => ({
        root: "/new",
        files: [{ path: "/new/a.abc", basename: "a.abc", tunes: [{ id: "new" }] }],
      }),
    },
    state: {
      getLibraryIndex: () => libraryIndex,
      setLibraryIndex: (next) => { libraryIndex = next; },
    },
    actions: {
      pathsEqual: (left, right) => left === right,
      safeBasename: (value) => String(value || "").split("/").pop(),
      safeDirname: (value) => String(value || "").replace(/\/[^/]*$/, ""),
    },
  });

  await controller.loadSingleLibraryFile("/new/a.abc");
  assert.equal(libraryIndex.root, "/new");
  assert.equal(libraryIndex.indexMode, "single");
  assert.equal(libraryIndex.files.length, 1);
}

{
  let libraryIndex = {
    root: "/music",
    files: [{
      path: "/music/a.abc",
      basename: "a.abc",
      tunes: [{ id: "/music/a.abc::1", tuneUid: "a-1", startOffset: 0, endOffset: 18, xNumber: "1", title: "A" }],
    }],
  };
  let activeFilePath = "";
  let renders = 0;
  const controller = createLibraryLifecycleController({
    state: {
      getLibraryIndex: () => libraryIndex,
      getRawMode: () => false,
    },
    actions: {
      pathsEqual: (left, right) => left === right,
      readFile: async () => ({ ok: true, data: "X:1\nT:A\nK:C\nC D E |\n" }),
      setActiveFilePath: (value) => { activeFilePath = value || ""; },
      setActiveTuneMeta: () => {},
      setActiveTuneId: () => {},
      setActiveTuneUid: () => {},
      setActiveTuneIndex: () => {},
      setActiveTuneText: (text, metadata) => { activeFilePath = metadata.path; },
      scheduleRenderLibraryTree: () => { renders += 1; },
      splitFileIntoHeaderAndBody: (text) => ({ headerText: "", bodyText: text }),
      safeBasename: (value) => String(value || "").split("/").pop(),
      ensureSafeToAbandonCurrentDoc: async () => true,
      markActiveTuneButton: () => {},
      resetPlaybackState: () => {},
      setDirtyIndicator: () => {},
      setPlaybackRange: () => {},
    },
  });
  const result = await controller.selectTune("a-1", { skipConfirm: true });
  assert.equal(result.ok, true);
  assert.equal(activeFilePath, "/music/a.abc");
  assert.equal(renders, 1, "selecting a tune must refresh Library ordering");
}

{
  const selected = [];
  const libraryIndex = {
    root: "/music",
    files: [{
      path: "/music/a.abc",
      tunes: [
        { id: "/music/a.abc::0", tuneUid: "a-1", startOffset: 0, xNumber: "1", title: "First" },
        { id: "/music/a.abc::20", tuneUid: "a-2", startOffset: 20, xNumber: "2", title: "Second" },
      ],
    }],
  };
  const controller = createLibraryLifecycleController({
    api: {
      getRecentCandidates: async () => [{
        type: "tune",
        entry: {
          path: "/music/a.abc",
          xNumber: "2",
          title: "Second",
          startOffset: 20,
          endOffset: 40,
        },
      }],
    },
    state: { getLibraryIndex: () => libraryIndex },
    actions: {
      pathsEqual: (left, right) => left === right,
      readFile: async () => ({ ok: true, data: "X:1\nT:First\nK:C\nC |\n" }),
      setActiveTuneMeta: (metadata) => { selected.push(metadata.tuneUid); },
      safeBasename: (value) => String(value || "").split("/").pop(),
      safeDirname: (value) => String(value || "").replace(/\/[^/]*$/, ""),
    },
  });

  const result = await controller.loadLibraryFileIntoEditor("/music/a.abc");
  assert.equal(result.ok, true);
  assert.deepEqual(selected, ["a-2"], "reopening a file must restore its latest selected tune");
}

{
  const tuneText = "X:2\nT:Chosen from Recent\nK:C\nC D E F |\n";
  const recentWrites = [];
  const libraryIndex = {
    root: "/music",
    files: [{
      path: "/music/a.abc",
      basename: "a.abc",
      tunes: [{
        id: "/music/a.abc::0",
        tuneUid: "a-2",
        startOffset: 0,
        endOffset: tuneText.length,
        xNumber: "2",
        title: "Chosen from Recent",
      }],
    }],
  };
  const controller = createLibraryLifecycleController({
    api: {
      addRecentTune: async (entry) => { recentWrites.push(entry); },
    },
    state: { getLibraryIndex: () => libraryIndex },
    actions: {
      pathsEqual: (left, right) => left === right,
      readFile: async () => ({ ok: true, data: tuneText }),
      safeBasename: (value) => String(value || "").split("/").pop(),
      safeDirname: (value) => String(value || "").replace(/\/[^/]*$/, ""),
    },
  });
  const entry = {
    path: "/music/a.abc",
    startOffset: 0,
    endOffset: tuneText.length,
    xNumber: "2",
    title: "Chosen from Recent",
  };

  assert.equal((await controller.openRecentTune(entry)).ok, true);
  assert.equal(recentWrites.length, 1, "a user-selected recent tune must become the latest tune");
  assert.equal((await controller.openRecentTune(entry, { suppressRecent: true })).ok, true);
  assert.equal(recentWrites.length, 1, "startup restoration must not rewrite recent tune order");

  const staleResult = await controller.openRecentTune({
    ...entry,
    xNumber: "999",
    title: "Removed tune",
  });
  assert.equal(staleResult.ok, false, "a stale recent entry must not silently open the first tune");
  assert.equal(recentWrites.length, 1);
}

console.log("library lifecycle harness: all tests passed");
