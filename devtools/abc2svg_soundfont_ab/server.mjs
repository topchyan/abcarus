#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const currentDir = path.join(root, "third_party", "abc2svg");
const candidateDir = process.env.ABC2SVG_CANDIDATE_DIR
  ? path.resolve(process.env.ABC2SVG_CANDIDATE_DIR)
  : "";
const port = Number(process.env.PORT) || 8766;

if (!candidateDir || !fs.existsSync(path.join(candidateDir, "abc2svg-1.js"))) {
  console.error("Set ABC2SVG_CANDIDATE_DIR to a directory containing the candidate abc2svg scripts.");
  process.exit(1);
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".sf2": "application/octet-stream",
};

function sendFile(response, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

function safeEngineFile(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  return resolved.startsWith(`${baseDir}${path.sep}`) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    sendFile(response, path.join(here, "index.html"));
    return;
  }
  if (url.pathname === "/runner.html") {
    sendFile(response, path.join(here, "runner.html"));
    return;
  }
  const match = url.pathname.match(/^\/(current|candidate)\/(.+)$/);
  if (match) {
    const baseDir = match[1] === "current" ? currentDir : candidateDir;
    const filePath = safeEngineFile(baseDir, decodeURIComponent(match[2]));
    if (filePath) {
      sendFile(response, filePath);
      return;
    }
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SoundFont A/B page: http://127.0.0.1:${port}/`);
  console.log(`Current runtime: ${currentDir}`);
  console.log(`Candidate runtime: ${candidateDir}`);
});
