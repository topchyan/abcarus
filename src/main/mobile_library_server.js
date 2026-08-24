"use strict";

const crypto = require("crypto");
const http = require("http");
const os = require("os");
const path = require("path");

const DEFAULT_PORT = 43821;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;

function isWithinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function normalizeRelativePath(value) {
  const raw = String(value || "").replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || raw.includes("\0")) return "";
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) return "";
  if (path.posix.extname(normalized).toLowerCase() !== ".abc") return "";
  return normalized;
}

function encodeCredential(value) {
  return Buffer.from(String(value || ""), "utf8").toString("base64url");
}

function localIpv4Addresses(networkInterfaces = os.networkInterfaces()) {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces || {})) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== "IPv4") continue;
      if (!addresses.includes(entry.address)) addresses.push(entry.address);
    }
  }
  return addresses.sort((a, b) => a.localeCompare(b));
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendText(response, statusCode, text) {
  const body = Buffer.from(String(text || ""), "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function listAbcFiles(fs, root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".abc")) {
        try {
          const stat = await fs.promises.stat(absolutePath);
          files.push({
            path: path.relative(root, absolutePath).split(path.sep).join("/"),
            updatedAtMs: Number.isFinite(stat.mtimeMs) ? Math.round(stat.mtimeMs) : 0,
            sizeBytes: Number.isFinite(stat.size) ? stat.size : -1,
          });
        } catch {}
      }
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function createMobileLibraryServer({ fs, port = DEFAULT_PORT, networkInterfaces } = {}) {
  if (!fs || !fs.promises) throw new Error("A filesystem implementation is required.");

  let server = null;
  let root = "";
  let code = "";
  let serverId = "";
  let listeningPort = 0;

  async function resolveLibraryFile(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) return "";
    const candidate = path.resolve(root, ...normalized.split("/"));
    if (!isWithinRoot(root, candidate)) return "";
    try {
      const realCandidate = await fs.promises.realpath(candidate);
      if (!isWithinRoot(root, realCandidate)) return "";
      const stat = await fs.promises.stat(realCandidate);
      if (!stat.isFile() || stat.size > MAX_RESPONSE_BYTES) return "";
      return realCandidate;
    } catch {
      return "";
    }
  }

  async function handleRequest(request, response) {
    try {
      const credential = String(request.headers["x-abcarus-credential"] || "");
      const legacyCode = String(request.headers["x-abcarus-code"] || "");
      if (credential !== encodeCredential(code) && legacyCode !== code) {
        sendJson(response, 401, { error: "Invalid connection code" });
        return;
      }
      const url = new URL(request.url || "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/v1/info") {
        sendJson(response, 200, {
          protocol: "abcarus-library-v1",
          serverId,
          libraryName: path.basename(root) || "ABCarus Library",
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/files") {
        sendJson(response, 200, { files: await listAbcFiles(fs, root) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/file") {
        const filePath = await resolveLibraryFile(url.searchParams.get("path"));
        if (!filePath) {
          sendJson(response, 404, { error: "ABC file not found" });
          return;
        }
        sendText(response, 200, await fs.promises.readFile(filePath, "utf8"));
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/batch") {
        const payload = await readJsonBody(request);
        const requestedPaths = Array.isArray(payload.paths) ? payload.paths.slice(0, 25) : [];
        const files = [];
        let totalBytes = 0;
        for (const requestedPath of requestedPaths) {
          const relativePath = normalizeRelativePath(requestedPath);
          const filePath = await resolveLibraryFile(relativePath);
          if (!filePath) continue;
          const content = await fs.promises.readFile(filePath, "utf8");
          totalBytes += Buffer.byteLength(content, "utf8");
          if (totalBytes > MAX_RESPONSE_BYTES) throw new Error("Requested batch is too large.");
          files.push({ path: relativePath, content });
        }
        sendJson(response, 200, { files });
        return;
      }
      if (request.method !== "GET" && request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }
      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 500, { error: error && error.message ? error.message : "Server error" });
    }
  }

  async function start(rootDir, options = {}) {
    const requestedRoot = await fs.promises.realpath(path.resolve(String(rootDir || "")));
    const stat = await fs.promises.stat(requestedRoot);
    if (!stat.isDirectory()) throw new Error("The current library folder is unavailable.");
    const requestedCode = String(options.code || "").trim() || crypto.randomBytes(5).toString("hex").toUpperCase();
    const requestedPort = Number.isInteger(Number(options.port))
      ? Math.min(65535, Math.max(0, Number(options.port)))
      : port;
    if (server && root === requestedRoot && code === requestedCode && listeningPort === requestedPort) return info();
    await stop();
    root = requestedRoot;
    code = requestedCode;
    serverId = /^[0-9a-f-]{36}$/i.test(String(options.serverId || ""))
      ? String(options.serverId).toLowerCase()
      : crypto.randomUUID();
    server = http.createServer((request, response) => {
      handleRequest(request, response);
    });
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(requestedPort, "0.0.0.0");
      });
    } catch (error) {
      server = null;
      root = "";
      code = "";
      serverId = "";
      throw error;
    }
    listeningPort = server.address().port;
    return info();
  }

  async function stop() {
    const current = server;
    server = null;
    root = "";
    code = "";
    serverId = "";
    listeningPort = 0;
    if (!current) return;
    await new Promise((resolve) => current.close(() => resolve()));
  }

  function info() {
    return {
      active: Boolean(server),
      root,
      code,
      serverId,
      port: listeningPort,
      addresses: localIpv4Addresses(networkInterfaces ? networkInterfaces() : undefined),
    };
  }

  return { info, start, stop };
}

module.exports = {
  DEFAULT_PORT,
  createMobileLibraryServer,
  encodeCredential,
  localIpv4Addresses,
  normalizeRelativePath,
};
