export async function mkdirp(dirPath) {
  if (!window.api || typeof window.api.mkdirp !== "function") return { ok: false, error: "API missing" };
  return window.api.mkdirp(dirPath);
}

export async function writeFile(filePath, data) {
  if (!window.api || typeof window.api.writeFile !== "function") return { ok: false, error: "API missing" };
  return window.api.writeFile(filePath, data);
}

export async function renameFile(oldPath, newPath) {
  if (!window.api || typeof window.api.renameFile !== "function") return { ok: false, error: "API missing" };
  return window.api.renameFile(oldPath, newPath);
}

export async function readFile(filePath) {
  if (!window.api || typeof window.api.readFile !== "function") return { ok: false, error: "API missing" };
  return window.api.readFile(filePath);
}

export async function fileExists(filePath) {
  if (!window.api || typeof window.api.fileExists !== "function") return false;
  return window.api.fileExists(filePath);
}

export function safeBasename(filePath) {
  if (window.api && typeof window.api.pathBasename === "function") {
    return window.api.pathBasename(filePath);
  }
  return String(filePath || "").split("/").pop() || "";
}

export function safeDirname(filePath) {
  if (window.api && typeof window.api.pathDirname === "function") {
    return window.api.pathDirname(filePath);
  }
  return String(filePath || "").split("/").slice(0, -1).join("/");
}

