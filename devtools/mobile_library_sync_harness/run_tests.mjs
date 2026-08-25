import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createMobileLibraryServer,
  encodeCredential,
  normalizeRelativePath,
} = require("../../src/main/mobile_library_server.js");
const { createMobileSetListSyncStore } = require("../../src/main/mobile_set_list_sync_store.js");

const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-mobile-sync-"));
const outsideRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-mobile-sync-outside-"));
const nested = path.join(tempRoot, "nested");
const syncRoot = path.join(tempRoot, "sync-state");
const setListRoot = path.join(tempRoot, "set-lists");
await fs.promises.mkdir(nested);
await fs.promises.writeFile(path.join(tempRoot, "one.abc"), "X:1\nT:One\nK:C\nC|\n", "utf8");
await fs.promises.writeFile(path.join(nested, "two.ABC"), "X:2\nT:Two\nK:G\nG|\n", "utf8");
await fs.promises.writeFile(path.join(tempRoot, "ignore.txt"), "not abc", "utf8");
await fs.promises.writeFile(path.join(outsideRoot, "secret.abc"), "X:9\nT:Secret\nK:C\nC|\n", "utf8");
try {
  await fs.promises.symlink(path.join(outsideRoot, "secret.abc"), path.join(tempRoot, "linked.abc"));
} catch {}

const setListStore = createMobileSetListSyncStore({
  fs,
  path,
  getStoreDir: () => syncRoot,
  getDefaultDir: () => setListRoot,
});
const server = createMobileLibraryServer({
  fs,
  syncSetLists: (documents) => setListStore.sync(documents),
  networkInterfaces: () => ({
    wifi: [{ address: "192.168.1.25", family: "IPv4", internal: false }],
  }),
});

try {
  assert.equal(normalizeRelativePath("../secret.abc"), "");
  assert.equal(normalizeRelativePath("nested/two.ABC"), "nested/two.ABC");

  const info = await server.start(tempRoot, {
    code: "easy пароль 42",
    port: 0,
    serverId: "12345678-1234-1234-1234-123456789abc",
  });
  const base = `http://127.0.0.1:${info.port}`;
  assert.deepEqual(info.addresses, ["192.168.1.25"]);

  const unauthorized = await fetch(`${base}/v1/info`);
  assert.equal(unauthorized.status, 401);

  const headers = { "X-ABCarus-Credential": encodeCredential(info.code) };
  const serverInfo = await (await fetch(`${base}/v1/info`, { headers })).json();
  assert.equal(serverInfo.protocol, "abcarus-library-v1");
  assert.equal(serverInfo.serverId, "12345678-1234-1234-1234-123456789abc");

  const manifest = await (await fetch(`${base}/v1/files`, { headers })).json();
  assert.deepEqual(manifest.files.map((file) => file.path), ["nested/two.ABC", "one.abc"]);

  const batchResponse = await fetch(`${base}/v1/batch`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ paths: ["one.abc", "nested/two.ABC", "../secret.abc", "linked.abc"] }),
  });
  assert.equal(batchResponse.status, 200);
  const batch = await batchResponse.json();
  assert.deepEqual(batch.files.map((file) => file.path), ["one.abc", "nested/two.ABC"]);
  assert.match(batch.files[0].content, /T:One/);

  const setList = {
    schema: "abcarus.setlist.v1",
    id: "gig-id",
    title: "Friday Gig",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-21T12:00:00.000Z",
    print: { headerText: "", pageBreaks: "perTune", compact: false },
    items: [],
  };
  const syncResponse = await fetch(`${base}/v1/set-lists/sync`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ setLists: [setList] }),
  });
  assert.equal(syncResponse.status, 200);
  const synced = await syncResponse.json();
  assert.equal(synced.setLists[0].title, "Friday Gig");
  const entries = await setListStore.list();
  assert.equal(entries.length, 1);
  assert.equal(JSON.parse(await fs.promises.readFile(entries[0].filePath, "utf8")).id, "gig-id");

  const newerDesktop = { ...setList, title: "Desktop order", updatedAt: "2026-08-22T12:00:00.000Z" };
  await setListStore.publish(newerDesktop, entries[0].filePath);
  await setListStore.sync([{ ...setList, title: "Stale tablet order" }]);
  assert.equal((await setListStore.list())[0].document.title, "Desktop order");

  const newestTablet = { ...setList, title: "Tablet order", updatedAt: "2026-08-23T12:00:00.000Z" };
  await setListStore.sync([newestTablet]);
  assert.equal((await setListStore.list())[0].document.title, "Tablet order");
  assert.equal(JSON.parse(await fs.promises.readFile(entries[0].filePath, "utf8")).title, "Tablet order");

  const restarted = await server.start(tempRoot, {
    code: "replacement password",
    port: info.port,
    serverId: info.serverId,
  });
  assert.equal(restarted.port, info.port);
  assert.equal((await fetch(`${base}/v1/info`, { headers })).status, 401);
  assert.equal((await fetch(`${base}/v1/info`, {
    headers: { "X-ABCarus-Credential": encodeCredential(restarted.code) },
  })).status, 200);

  console.log("mobile library sync harness: all tests passed");
} finally {
  await server.stop();
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
  await fs.promises.rm(outsideRoot, { recursive: true, force: true });
}
