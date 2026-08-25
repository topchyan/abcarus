#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const {
  composeStateDocument,
  loadProfileDocument,
  saveStateDocument,
} = require("../../src/main/state_store.js");

async function loadSettingsStore() {
  const result = await build({
    entryPoints: ["src/renderer/settings_store.js"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  const source = result.outputFiles[0].text;
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

async function bootRuntime(profilePath, legacyPath, createWriteGate = null) {
  const loaded = await loadProfileDocument({ fs, profilePath, legacyStatePath: legacyPath });
  const appState = {
    settings: loaded.data && loaded.data.settings && typeof loaded.data.settings === "object"
      ? { ...loaded.data.settings }
      : {},
  };
  const handlers = new Map();
  const ipcMain = { handle(name, handler) { handlers.set(name, handler); } };
  const ipcRenderer = {
    invoke(name, patch) {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Missing IPC handler: ${name}`);
      return handler({}, patch);
    },
  };
  const writeGate = createWriteGate ? createWriteGate() : null;

  ipcMain.handle("settings:get", async () => ({ ...appState.settings }));
  ipcMain.handle("settings:update", async (_event, patch) => {
    appState.settings = { ...appState.settings, ...(patch || {}) };
    if (writeGate) await writeGate.promise;
    await saveStateDocument({
      fs,
      path,
      filePath: profilePath,
      data: composeStateDocument({ settings: appState.settings }),
    });
    return { ...appState.settings };
  });

  const { createSettingsStore } = await loadSettingsStore();
  const store = createSettingsStore({
    getSettings: () => ipcRenderer.invoke("settings:get"),
    updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  });
  return { appState, store, writeGate };
}

async function main() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-settings-persistence-"));
  const profilePath = path.join(dir, "abcarus-profile.json");
  const legacyPath = path.join(dir, "state.json");
  try {
    const first = await bootRuntime(profilePath, legacyPath, () => deferred());
    const updatePromise = first.store.update({
      abc2xmlArgs: "-x -y value",
      xml2abcArgs: "-x -b 3",
    });
    let settled = false;
    updatePromise.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false, "settings update must wait for the profile write boundary");

    first.writeGate.resolve();
    const committed = await updatePromise;
    assert.equal(committed.xml2abcArgs, "-x -b 3");
    assert.equal(committed.abc2xmlArgs, "-x -y value");

    const second = await bootRuntime(profilePath, legacyPath);
    const afterRestart = await second.store.get();
    assert.equal(afterRestart.xml2abcArgs, "-x -b 3", "xml2abc flags must survive restart");
    assert.equal(afterRestart.abc2xmlArgs, "-x -y value", "abc2xml flags must survive restart");

    console.log("settings persistence harness: UI store -> IPC -> disk -> restart passed");
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
