const fs = require("fs");

async function statFingerprint(filePath) {
  const raw = String(filePath || "");
  if (!raw) throw new Error("Missing file path.");
  const stat = await fs.promises.stat(raw);
  return {
    mtimeMs: Number(stat.mtimeMs),
    size: Number(stat.size),
  };
}

module.exports = {
  statFingerprint,
};

