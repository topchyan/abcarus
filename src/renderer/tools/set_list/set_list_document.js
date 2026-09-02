const SET_LIST_SCHEMA = "abcarus.setlist.v1";
const SET_LIST_SCHEMA_V2 = "abcarus.setlist.v2";
const DEFAULT_SET_LIST_HEADER_TEXT = "%%stretchlast 1\n";
const SET_LIST_RESOLUTION = Object.freeze({
  FOUND_EXACT: "FOUND_EXACT",
  FOUND_MODIFIED: "FOUND_MODIFIED",
  FOUND_STRONG: "FOUND_STRONG",
  AMBIGUOUS: "AMBIGUOUS",
  MISSING: "MISSING",
});

const MAX_SET_LIST_ITEMS = 500;
const MAX_SET_LIST_LINKS = 50;

function canonicalizeAbcForHash(value) {
  return text(value).replace(/\r\n?/g, "\n");
}

async function hashSetListAbc(value, cryptoRef = globalThis.crypto) {
  if (!cryptoRef || !cryptoRef.subtle || typeof cryptoRef.subtle.digest !== "function") {
    throw new Error("SHA-256 is unavailable.");
  }
  const bytes = new TextEncoder().encode(canonicalizeAbcForHash(value));
  const digest = await cryptoRef.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizedIdentityText(value) {
  return text(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function normalizeSource(source) {
  const raw = source && typeof source === "object" ? source : {};
  return {
    locatorHint: text(raw.locatorHint) || text(raw.tuneIdHint),
    pathHint: text(raw.pathHint),
    xNumberHint: text(raw.xNumberHint),
  };
}

function normalizeContentHash(value) {
  const raw = text(value);
  return /^sha256:[0-9a-f]{64}$/.test(raw) ? raw : "";
}

function normalizeGroups(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const groups = [];
  for (const entry of value) {
    const group = text(entry);
    if (!group || seen.has(group)) continue;
    seen.add(group);
    groups.push(group);
  }
  return groups;
}

function normalizeTuneSnapshot(snapshot) {
  const raw = snapshot && typeof snapshot === "object" ? snapshot : {};
  const legacyGroup = text(raw.group);
  const source = raw.source && typeof raw.source === "object" ? raw.source : {};
  return {
    title: text(raw.title),
    composer: text(raw.composer),
    key: text(raw.key),
    rhythm: text(raw.rhythm),
    origin: text(raw.origin),
    groups: normalizeGroups(Array.isArray(raw.groups) ? raw.groups : (legacyGroup ? [legacyGroup] : [])),
    source: normalizeSource({
      ...source,
      locatorHint: text(source.locatorHint) || text(raw.tuneIdHint),
      pathHint: text(source.pathHint) || text(raw.sourcePath),
      xNumberHint: text(source.xNumberHint) || text(raw.xNumber),
    }),
    contentHash: normalizeContentHash(raw.contentHash),
  };
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.slice(0, MAX_SET_LIST_LINKS).map((link) => {
    const raw = link && typeof link === "object" ? link : {};
    return {
      kind: text(raw.kind) || text(raw.type) || "reference",
      url: text(raw.url),
      label: text(raw.label),
    };
  }).filter((link) => link.url);
}

function normalizeSnapshotObservation(snapshot) {
  const raw = snapshot && typeof snapshot === "object" ? snapshot : {};
  const capturedAt = text(raw.capturedAt);
  if (!capturedAt) return null;
  const normalized = { capturedAt };
  const sourceFileModifiedAt = text(raw.sourceFileModifiedAt);
  if (sourceFileModifiedAt) normalized.sourceFileModifiedAt = sourceFileModifiedAt;
  return normalized;
}

function moveSetListDocumentItems(items, fromIndex, toIndex) {
  const source = Array.isArray(items) ? items : [];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= source.length || to >= source.length || from === to) {
    return source;
  }
  const next = source.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function removeSetListDocumentItem(items, index) {
  const source = Array.isArray(items) ? items : [];
  const target = Number(index);
  if (!Number.isInteger(target) || target < 0 || target >= source.length) return source;
  return source.filter((_item, itemIndex) => itemIndex !== target);
}

function insertSetListDocumentItem(items, item, index) {
  const source = Array.isArray(items) ? items : [];
  if (!item) return source;
  const next = source.slice();
  const target = Number(index);
  if (!Number.isInteger(target) || target < 0 || target >= next.length) next.push(item);
  else next.splice(target, 0, item);
  return next;
}

function normalizeSetListDocumentItem(item, options = {}) {
  if (!item || typeof item !== "object") return null;
  const makeId = typeof options.makeId === "function" ? options.makeId : () => "";
  const id = text(item.id) || text(makeId());
  if (!id) return null;
  const performance = item.performance && typeof item.performance === "object" ? item.performance : {};
  const exportIntent = item.export && typeof item.export === "object" ? item.export : {};
  const tempoScale = finiteNumber(performance.tempoScale, 1);
  const includeInPdf = typeof exportIntent.includeInPdf === "boolean"
    ? exportIntent.includeInPdf
    : boolean(exportIntent.include, true);
  const normalized = {
    id,
    tune: normalizeTuneSnapshot(item.tune),
    performance: {
      transposeSemitones: finiteNumber(performance.transposeSemitones, 0),
      tempoScale: tempoScale > 0 ? tempoScale : 1,
    },
    notes: text(item.notes),
    links: normalizeLinks(item.links),
    export: {
      includeInPdf,
      pageBreakBefore: boolean(exportIntent.pageBreakBefore, false),
    },
  };
  if (typeof item.embeddedAbc === "string" && item.embeddedAbc.trim()) {
    normalized.embeddedAbc = item.embeddedAbc;
  }
  const hasEmbeddedAbc = Boolean(typeof item.embeddedAbc === "string" && item.embeddedAbc.trim());
  if (typeof item.embeddedHeaderAbc === "string" && item.embeddedHeaderAbc.trim() && hasEmbeddedAbc) {
    normalized.embeddedHeaderAbc = item.embeddedHeaderAbc;
  }
  const snapshot = normalizeSnapshotObservation(item.snapshot);
  if (snapshot && hasEmbeddedAbc) normalized.snapshot = snapshot;
  return normalized;
}

function normalizeSetListDocument(value, options = {}) {
  if (!value || typeof value !== "object" || ![SET_LIST_SCHEMA, SET_LIST_SCHEMA_V2].includes(value.schema)) return null;
  const makeId = typeof options.makeId === "function" ? options.makeId : () => "";
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const id = text(value.id) || text(makeId());
  if (!id) return null;
  const createdAt = text(value.createdAt) || nowIso();
  const items = [];
  for (const item of Array.isArray(value.items) ? value.items : []) {
    const normalized = normalizeSetListDocumentItem(item, { makeId });
    if (normalized) items.push(normalized);
    if (items.length >= MAX_SET_LIST_ITEMS) break;
  }
  const print = value.print && typeof value.print === "object" ? value.print : {};
  return {
    schema: value.schema,
    id,
    title: text(value.title) || text(value.name) || "Untitled Set List",
    createdAt,
    updatedAt: text(value.updatedAt) || createdAt,
    print: {
      headerText: text(print.headerText),
      pageBreaks: ["perTune", "none", "auto"].includes(print.pageBreaks) ? print.pageBreaks : "perTune",
      compact: boolean(print.compact, false),
      titlePage: boolean(print.titlePage, false),
      tuneIndex: ["none", "compact", "incipits"].includes(print.tuneIndex) ? print.tuneIndex : "none",
      numberTunes: boolean(print.numberTunes, false),
      indexQrCodes: boolean(print.indexQrCodes, false),
    },
    items,
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeConflictingNotes(local, remote) {
  const localText = text(local).trim();
  const remoteText = text(remote).trim();
  if (!localText) return remoteText;
  if (!remoteText || localText === remoteText || localText.includes(remoteText)) return localText;
  if (remoteText.includes(localText)) return remoteText;
  return `${localText}\n${remoteText}`;
}

function mergeArrayValues(local, remote) {
  const values = [];
  const seen = new Set();
  for (const value of [...local, ...remote]) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(structuredClone(value));
  }
  return values;
}

function mergeSetListValue(base, local, remote, key = "") {
  if (sameJson(local, remote)) return structuredClone(local);
  if (sameJson(local, base)) return structuredClone(remote);
  if (sameJson(remote, base)) return structuredClone(local);
  if (key === "notes" && typeof local === "string" && typeof remote === "string") {
    return mergeConflictingNotes(local, remote);
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    return mergeArrayValues(local, remote);
  }
  if (local && remote && typeof local === "object" && typeof remote === "object") {
    const baseObject = base && typeof base === "object" && !Array.isArray(base) ? base : {};
    const output = {};
    const keys = new Set([...Object.keys(baseObject), ...Object.keys(local), ...Object.keys(remote)]);
    for (const childKey of keys) {
      const hasBase = Object.prototype.hasOwnProperty.call(baseObject, childKey);
      const hasLocal = Object.prototype.hasOwnProperty.call(local, childKey);
      const hasRemote = Object.prototype.hasOwnProperty.call(remote, childKey);
      if (!hasLocal && !hasRemote) continue;
      if (!hasLocal) {
        if (!hasBase || !sameJson(remote[childKey], baseObject[childKey])) {
          output[childKey] = structuredClone(remote[childKey]);
        }
        continue;
      }
      if (!hasRemote) {
        if (!hasBase || !sameJson(local[childKey], baseObject[childKey])) {
          output[childKey] = structuredClone(local[childKey]);
        }
        continue;
      }
      output[childKey] = mergeSetListValue(
        hasBase ? baseObject[childKey] : undefined,
        local[childKey],
        remote[childKey],
        childKey,
      );
    }
    return output;
  }
  return structuredClone(local);
}

function mergeSetListItems(baseItems, localItems, remoteItems) {
  const byId = (items) => new Map(items.map((item) => [String(item.id), item]));
  const base = byId(baseItems);
  const local = byId(localItems);
  const remote = byId(remoteItems);
  const merged = new Map();
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  for (const id of ids) {
    const baseItem = base.get(id);
    const localItem = local.get(id);
    const remoteItem = remote.get(id);
    if (!baseItem) {
      if (localItem && remoteItem) merged.set(id, mergeSetListValue(undefined, localItem, remoteItem));
      else if (localItem || remoteItem) merged.set(id, structuredClone(localItem || remoteItem));
      continue;
    }
    if (!localItem && !remoteItem) continue;
    if (!localItem) {
      if (!sameJson(remoteItem, baseItem)) merged.set(id, structuredClone(remoteItem));
      continue;
    }
    if (!remoteItem) {
      if (!sameJson(localItem, baseItem)) merged.set(id, structuredClone(localItem));
      continue;
    }
    merged.set(id, mergeSetListValue(baseItem, localItem, remoteItem));
  }

  const baseOrder = baseItems.map((item) => String(item.id));
  const localOrder = localItems.map((item) => String(item.id));
  const remoteOrder = remoteItems.map((item) => String(item.id));
  const localOrderChanged = !sameJson(localOrder, baseOrder);
  const remoteOrderChanged = !sameJson(remoteOrder, baseOrder);
  const preferredOrder = !localOrderChanged && remoteOrderChanged ? remoteOrder : localOrder;
  const orderedIds = [...preferredOrder, ...remoteOrder, ...localOrder];
  const output = [];
  const appended = new Set();
  for (const id of orderedIds) {
    if (appended.has(id) || !merged.has(id)) continue;
    appended.add(id);
    output.push(merged.get(id));
  }
  for (const [id, item] of merged) {
    if (!appended.has(id)) output.push(item);
  }
  return output;
}

function mergeSetListDocuments(baseValue, localValue, remoteValue, options = {}) {
  const base = normalizeSetListDocument(baseValue, options);
  const local = normalizeSetListDocument(localValue, options);
  const remote = normalizeSetListDocument(remoteValue, options);
  if (!base || !local || !remote || base.id !== local.id || base.id !== remote.id) return null;
  const merged = mergeSetListValue(base, local, remote);
  merged.schema = local.schema;
  merged.id = local.id;
  merged.createdAt = local.createdAt;
  merged.updatedAt = typeof options.nowIso === "function" ? options.nowIso() : new Date().toISOString();
  merged.items = mergeSetListItems(base.items, local.items, remote.items);
  return normalizeSetListDocument(merged, options);
}

function serializeSetListDocument(value, options = {}) {
  const normalized = normalizeSetListDocument(value, options);
  if (!normalized) throw new Error("Invalid Set List document.");
  const output = structuredClone(normalized);
  if (output.schema === SET_LIST_SCHEMA) {
    delete output.print.titlePage;
    delete output.print.tuneIndex;
    delete output.print.numberTunes;
    delete output.print.indexQrCodes;
  }
  return JSON.stringify(output, null, 2) + "\n";
}

function convertLegacySetListState(legacy, options = {}) {
  if (!legacy || typeof legacy !== "object" || String(legacy.version || "") !== "1") return null;
  const makeId = typeof options.makeId === "function" ? options.makeId : () => "";
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const timestamp = nowIso();
  const rawItems = Array.isArray(legacy.items) ? legacy.items : [];
  return normalizeSetListDocument({
    schema: SET_LIST_SCHEMA,
    id: makeId(),
    title: text(options.title) || "Imported Set List",
    createdAt: timestamp,
    updatedAt: timestamp,
    print: {
      headerText: text(legacy.headerText),
      pageBreaks: legacy.pageBreaks,
      compact: legacy.compact,
    },
    items: rawItems.map((item) => ({
      id: text(item && item.id) || makeId(),
      tune: {
        title: text(item && item.title),
        composer: text(item && item.composer),
        source: {
          locatorHint: text(item && item.sourceTuneId),
          pathHint: text(item && item.sourcePath),
          xNumberHint: text(item && item.xNumber),
        },
        contentHash: "",
      },
      embeddedAbc: text(item && item.text),
      embeddedHeaderAbc: text(item && item.headerText),
      snapshot: { capturedAt: timestamp },
      performance: { transposeSemitones: 0, tempoScale: 1 },
      notes: "",
      links: [],
      export: { includeInPdf: true, pageBreakBefore: false },
    })),
  }, { makeId, nowIso });
}

function sourcePathsEquivalent(left, right) {
  const a = text(left).replace(/\\/g, "/").replace(/\/+$/, "");
  const b = text(right).replace(/\\/g, "/").replace(/\/+$/, "");
  if (!a || !b) return false;
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function sameSource(snapshot, candidate) {
  const source = snapshot.source || {};
  return Boolean(source.pathHint && source.xNumberHint
    && sourcePathsEquivalent(candidate.sourcePath, source.pathHint)
    && text(candidate.xNumber) === source.xNumberHint);
}

function resolveSetListItem(item, candidates) {
  const snapshot = normalizeTuneSnapshot(item && item.tune);
  const pool = Array.isArray(candidates) ? candidates.filter((candidate) => candidate && typeof candidate === "object") : [];
  const hash = snapshot.contentHash;
  const sourceMatches = pool.filter((candidate) => sameSource(snapshot, candidate));

  if (sourceMatches.length === 1) {
    const candidateHash = text(sourceMatches[0].contentHash);
    if (hash && candidateHash === hash) {
      return { status: SET_LIST_RESOLUTION.FOUND_EXACT, candidate: sourceMatches[0], candidates: sourceMatches, matchedBy: "source" };
    }
    if (hash && candidateHash && candidateHash !== hash) {
      return { status: SET_LIST_RESOLUTION.FOUND_MODIFIED, candidate: sourceMatches[0], candidates: sourceMatches, matchedBy: "source" };
    }
    return { status: SET_LIST_RESOLUTION.FOUND_STRONG, candidate: sourceMatches[0], candidates: sourceMatches, matchedBy: "source" };
  }
  if (sourceMatches.length > 1) {
    return { status: SET_LIST_RESOLUTION.AMBIGUOUS, candidate: null, candidates: sourceMatches };
  }

  if (hash) {
    const hashMatches = pool.filter((candidate) => text(candidate.contentHash) === hash);
    if (hashMatches.length === 1) {
      return { status: SET_LIST_RESOLUTION.FOUND_EXACT, candidate: hashMatches[0], candidates: hashMatches, matchedBy: "hash" };
    }
    if (hashMatches.length > 1) {
      return { status: SET_LIST_RESOLUTION.AMBIGUOUS, candidate: null, candidates: hashMatches };
    }
  }

  const title = normalizedIdentityText(snapshot.title);
  const composer = normalizedIdentityText(snapshot.composer);
  const metadataMatches = pool.filter((candidate) => {
    if (!title || normalizedIdentityText(candidate.title) !== title) return false;
    if (!composer) return true;
    return normalizedIdentityText(candidate.composer) === composer;
  });
  if (metadataMatches.length === 1) {
    return { status: SET_LIST_RESOLUTION.FOUND_STRONG, candidate: metadataMatches[0], candidates: metadataMatches, matchedBy: "metadata" };
  }
  if (metadataMatches.length > 1) {
    return { status: SET_LIST_RESOLUTION.AMBIGUOUS, candidate: null, candidates: metadataMatches };
  }
  return { status: SET_LIST_RESOLUTION.MISSING, candidate: null, candidates: [] };
}

export {
  DEFAULT_SET_LIST_HEADER_TEXT,
  SET_LIST_RESOLUTION,
  SET_LIST_SCHEMA,
  SET_LIST_SCHEMA_V2,
  canonicalizeAbcForHash,
  convertLegacySetListState,
  hashSetListAbc,
  insertSetListDocumentItem,
  moveSetListDocumentItems,
  mergeSetListDocuments,
  normalizeSetListDocument,
  normalizeSetListDocumentItem,
  resolveSetListItem,
  sourcePathsEquivalent,
  removeSetListDocumentItem,
  serializeSetListDocument,
};
