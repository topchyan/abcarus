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

const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-mobile-sync-"));
const outsideRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-mobile-sync-outside-"));
const nested = path.join(tempRoot, "nested");
await fs.promises.mkdir(nested);
await fs.promises.writeFile(path.join(tempRoot, "one.abc"), "X:1\nT:One\nK:C\nC|\n", "utf8");
await fs.promises.writeFile(path.join(nested, "two.ABC"), "X:2\nT:Two\nK:G\nG|\n", "utf8");
await fs.promises.writeFile(path.join(tempRoot, "ignore.txt"), "not abc", "utf8");
await fs.promises.writeFile(path.join(outsideRoot, "secret.abc"), "X:9\nT:Secret\nK:C\nC|\n", "utf8");
try {
  await fs.promises.symlink(path.join(outsideRoot, "secret.abc"), path.join(tempRoot, "linked.abc"));
} catch {}

const server = createMobileLibraryServer({
  fs,
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

  console.log("mobile library sync harness: all tests passed");
} finally {
  await server.stop();
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
  await fs.promises.rm(outsideRoot, { recursive: true, force: true });
}
