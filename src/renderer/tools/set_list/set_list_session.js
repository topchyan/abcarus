import {
  DEFAULT_SET_LIST_HEADER_TEXT,
  SET_LIST_SCHEMA,
  normalizeSetListDocument,
  serializeSetListDocument,
} from "./set_list_document.js";

const DEFAULT_RECENTS_KEY = "abcarus.setList.recentPaths.v1";
const MAX_RECENT_SET_LISTS = 12;

function createEmptySetListDocument({ id, title = "Untitled Set List", nowIso } = {}) {
  const timestamp = typeof nowIso === "function" ? nowIso() : new Date().toISOString();
  return {
    schema: SET_LIST_SCHEMA,
    id: String(id || ""),
    title: String(title || "Untitled Set List"),
    createdAt: timestamp,
    updatedAt: timestamp,
    print: { headerText: DEFAULT_SET_LIST_HEADER_TEXT, pageBreaks: "perTune", compact: false },
    items: [],
  };
}

function normalizeRecentPaths(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const paths = [];
  for (const entry of value) {
    const path = String(entry || "").trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
    if (paths.length >= MAX_RECENT_SET_LISTS) break;
  }
  return paths;
}

function createSetListSession({
  makeId = () => globalThis.crypto.randomUUID(),
  nowIso = () => new Date().toISOString(),
  readFile = async () => ({ ok: false, error: "Read unavailable." }),
  writeFile = async () => ({ ok: false, error: "Write unavailable." }),
  readStorage = () => null,
  writeStorage = () => false,
  recentsKey = DEFAULT_RECENTS_KEY,
  onChange = () => {},
} = {}) {
  let document = createEmptySetListDocument({ id: makeId(), nowIso });
  let filePath = "";
  let diskText = null;
  let persistedUpdatedAt = "";
  let dirty = false;
  let dirtyReasons = [];
  let recentPaths = normalizeRecentPaths(readStorage(recentsKey));

  function snapshot() {
    return {
      document,
      filePath,
      persistedUpdatedAt,
      dirty,
      dirtyReasons: dirtyReasons.slice(),
      recentPaths: recentPaths.slice(),
    };
  }

  function emit() {
    onChange(snapshot());
  }

  function rememberPath(path) {
    const normalized = String(path || "").trim();
    if (!normalized) return;
    recentPaths = normalizeRecentPaths([normalized, ...recentPaths]);
    writeStorage(recentsKey, recentPaths);
  }

  function replaceDocument(nextDocument, {
    nextFilePath = "",
    nextDiskText = null,
    nextDirty = false,
    nextDirtyReasons = [],
  } = {}) {
    const normalized = normalizeSetListDocument(nextDocument, { makeId, nowIso });
    if (!normalized) throw new Error("Invalid Set List document.");
    document = normalized;
    filePath = String(nextFilePath || "");
    diskText = typeof nextDiskText === "string" ? nextDiskText : null;
    dirty = Boolean(nextDirty);
    if (!filePath) persistedUpdatedAt = "";
    else if (!dirty && typeof nextDiskText === "string") persistedUpdatedAt = normalized.updatedAt;
    dirtyReasons = dirty
      ? Array.from(new Set((Array.isArray(nextDirtyReasons) ? nextDirtyReasons : []).map((value) => String(value || "").trim()).filter(Boolean)))
      : [];
    if (filePath) rememberPath(filePath);
    emit();
    return snapshot();
  }

  function mutate(mutator, { reason = "content" } = {}) {
    const draft = structuredClone(document);
    const result = typeof mutator === "function" ? mutator(draft) : draft;
    const candidate = result && typeof result === "object" ? result : draft;
    candidate.updatedAt = nowIso();
    return replaceDocument(candidate, {
      nextFilePath: filePath,
      nextDiskText: diskText,
      nextDirty: true,
      nextDirtyReasons: [...dirtyReasons, reason],
    });
  }

  function newDocument(title) {
    return replaceDocument(createEmptySetListDocument({ id: makeId(), title, nowIso }));
  }

  async function open(path) {
    const target = String(path || "").trim();
    if (!target) return { ok: false, canceled: true };
    const result = await readFile(target);
    if (!result || !result.ok) return { ok: false, error: result && result.error ? result.error : "Unable to read Set List." };
    const raw = String(result.data || "");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, error: `Invalid Set List JSON: ${error.message}` };
    }
    const normalized = normalizeSetListDocument(parsed, { makeId, nowIso });
    if (!normalized) return { ok: false, error: "Unsupported or invalid Set List document." };
    replaceDocument(normalized, { nextFilePath: target, nextDiskText: raw, nextDirty: false });
    return { ok: true, state: snapshot() };
  }

  async function save(path = filePath, { overwriteExternal = false } = {}) {
    const target = String(path || "").trim();
    if (!target) return { ok: false, needsPath: true };
    const nextDocument = { ...document, updatedAt: nowIso() };
    const serialized = serializeSetListDocument(nextDocument, { makeId, nowIso });
    const options = !overwriteExternal && target === filePath && typeof diskText === "string"
      ? { expectedData: diskText }
      : {};
    const result = await writeFile(target, serialized, options);
    if (!result || !result.ok) {
      return {
        ok: false,
        conflict: Boolean(result && result.conflict),
        error: result && result.error ? result.error : "Unable to save Set List.",
      };
    }
    replaceDocument(nextDocument, { nextFilePath: target, nextDiskText: serialized, nextDirty: false });
    return { ok: true, path: target, state: snapshot() };
  }

  function forgetRecentPath(path) {
    const target = String(path || "");
    recentPaths = recentPaths.filter((entry) => entry !== target);
    writeStorage(recentsKey, recentPaths);
    emit();
  }

  return {
    forgetRecentPath,
    getState: snapshot,
    mutate,
    newDocument,
    open,
    rememberRecentPath: rememberPath,
    replaceDocument,
    save,
  };
}

export {
  DEFAULT_RECENTS_KEY,
  createEmptySetListDocument,
  createSetListSession,
  normalizeRecentPaths,
};
