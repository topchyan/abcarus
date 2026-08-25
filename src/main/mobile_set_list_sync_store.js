"use strict";

const SET_LIST_SCHEMA = "abcarus.setlist.v1";
const STORE_SCHEMA = "abcarus.setlist-sync.v1";

function parseTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function validDocument(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value.schema === SET_LIST_SCHEMA
    && String(value.id || "").trim()
    && String(value.title || "").trim()
    && Array.isArray(value.items)
    && parseTime(value.updatedAt) > 0
  );
}

function safeFileName(value) {
  const name = String(value || "Set List")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${name || "Set List"}.abcarus-setlist.json`;
}

function createMobileSetListSyncStore({ fs, path, getStoreDir, getDefaultDir } = {}) {
  if (!fs || !path || typeof getStoreDir !== "function" || typeof getDefaultDir !== "function") {
    throw new Error("Set-list sync storage dependencies are required.");
  }
  let queue = Promise.resolve();

  const storePath = () => path.join(getStoreDir(), "index.json");
  async function load() {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(storePath(), "utf8"));
      return parsed && parsed.schema === STORE_SCHEMA && parsed.entries && typeof parsed.entries === "object"
        ? parsed
        : { schema: STORE_SCHEMA, entries: {} };
    } catch {
      return { schema: STORE_SCHEMA, entries: {} };
    }
  }

  async function writeText(target, text) {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.writeFile(temporary, text, "utf8");
    await fs.promises.rename(temporary, target);
  }

  async function save(state) {
    await writeText(storePath(), `${JSON.stringify(state, null, 2)}\n`);
  }

  async function chooseNewPath(document, entries) {
    const dir = getDefaultDir();
    const parsed = path.parse(safeFileName(document.title));
    let candidate = path.join(dir, `${parsed.name}${parsed.ext}`);
    const occupied = new Set(Object.values(entries).map((entry) => String(entry && entry.filePath || "")));
    for (let suffix = 2; occupied.has(candidate); suffix += 1) {
      candidate = path.join(dir, `${parsed.name} ${suffix}${parsed.ext}`);
    }
    return candidate;
  }

  function serialize(document) {
    return `${JSON.stringify(document, null, 2)}\n`;
  }

  function run(operation) {
    const next = queue.then(operation, operation);
    queue = next.catch(() => {});
    return next;
  }

  async function publishImpl(document, filePath) {
    if (!validDocument(document)) throw new Error("Invalid Set List document.");
    const state = await load();
    const id = String(document.id);
    const existing = state.entries[id];
    const target = String(filePath || (existing && existing.filePath) || "").trim()
      || await chooseNewPath(document, state.entries);
    const incomingWins = !existing || parseTime(document.updatedAt) >= parseTime(existing.document.updatedAt);
    const winner = incomingWins ? structuredClone(document) : existing.document;
    state.entries[id] = { filePath: target, document: winner };
    if (!incomingWins || String(filePath || "").trim() !== target) {
      await writeText(target, serialize(winner));
    }
    await save(state);
    return { document: winner, filePath: target, remoteWon: !incomingWins };
  }

  async function syncImpl(documents) {
    const state = await load();
    for (const document of Array.isArray(documents) ? documents : []) {
      if (!validDocument(document)) continue;
      const id = String(document.id);
      const existing = state.entries[id];
      if (existing && parseTime(existing.document.updatedAt) > parseTime(document.updatedAt)) continue;
      const target = String(existing && existing.filePath || "").trim()
        || await chooseNewPath(document, state.entries);
      const copy = structuredClone(document);
      state.entries[id] = { filePath: target, document: copy };
      await writeText(target, serialize(copy));
    }
    await save(state);
    return Object.values(state.entries)
      .filter((entry) => entry && validDocument(entry.document))
      .map((entry) => structuredClone(entry.document));
  }

  return {
    list: () => run(async () => {
      const state = await load();
      return Object.values(state.entries).filter((entry) => entry && validDocument(entry.document));
    }),
    publish: (document, filePath) => run(() => publishImpl(document, filePath)),
    sync: (documents) => run(() => syncImpl(documents)),
  };
}

module.exports = { createMobileSetListSyncStore, parseTime, validDocument };
