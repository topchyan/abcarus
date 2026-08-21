const SET_LIST_SCHEMA = "abcarus.setlist.v1";
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
    tuneIdHint: text(raw.tuneIdHint),
    pathHint: text(raw.pathHint),
    xNumberHint: text(raw.xNumberHint),
  };
}

function normalizeTuneSnapshot(snapshot) {
  const raw = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    title: text(raw.title),
    composer: text(raw.composer),
    key: text(raw.key),
    rhythm: text(raw.rhythm),
    origin: text(raw.origin),
    groups: Array.isArray(raw.groups) ? raw.groups.map(text).filter(Boolean) : [],
    source: normalizeSource(raw.source),
    contentHash: text(raw.contentHash),
  };
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.slice(0, MAX_SET_LIST_LINKS).map((link) => {
    const raw = link && typeof link === "object" ? link : {};
    return {
      kind: text(raw.kind) || "reference",
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
  const normalized = {
    id,
    tune: normalizeTuneSnapshot(item.tune),
    performance: {
      transposeSemitones: finiteNumber(performance.transposeSemitones, 0),
      tempoScale: finiteNumber(performance.tempoScale, 1),
    },
    notes: text(item.notes),
    links: normalizeLinks(item.links),
    export: {
      includeInPdf: boolean(exportIntent.includeInPdf, true),
      pageBreakBefore: boolean(exportIntent.pageBreakBefore, false),
    },
  };
  if (typeof item.embeddedAbc === "string" && item.embeddedAbc.trim()) {
    normalized.embeddedAbc = item.embeddedAbc;
  }
  if (typeof item.embeddedHeaderAbc === "string" && item.embeddedHeaderAbc.trim()) {
    normalized.embeddedHeaderAbc = item.embeddedHeaderAbc;
  }
  const snapshot = normalizeSnapshotObservation(item.snapshot);
  if (snapshot) normalized.snapshot = snapshot;
  return normalized;
}

function normalizeSetListDocument(value, options = {}) {
  if (!value || typeof value !== "object" || value.schema !== SET_LIST_SCHEMA) return null;
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
    schema: SET_LIST_SCHEMA,
    id,
    title: text(value.title) || "Untitled Set List",
    createdAt,
    updatedAt: text(value.updatedAt) || createdAt,
    print: {
      headerText: text(print.headerText),
      pageBreaks: ["perTune", "none", "auto"].includes(print.pageBreaks) ? print.pageBreaks : "perTune",
      compact: boolean(print.compact, false),
    },
    items,
  };
}

function serializeSetListDocument(value, options = {}) {
  const normalized = normalizeSetListDocument(value, options);
  if (!normalized) throw new Error("Invalid Set List document.");
  return JSON.stringify(normalized, null, 2) + "\n";
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
          tuneIdHint: text(item && item.sourceTuneId),
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

function sameSource(snapshot, candidate) {
  const source = snapshot.source || {};
  return Boolean(source.pathHint && source.xNumberHint
    && text(candidate.sourcePath) === source.pathHint
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
      return { status: SET_LIST_RESOLUTION.FOUND_EXACT, candidate: sourceMatches[0], candidates: sourceMatches };
    }
    if (hash && candidateHash && candidateHash !== hash) {
      return { status: SET_LIST_RESOLUTION.FOUND_MODIFIED, candidate: sourceMatches[0], candidates: sourceMatches };
    }
    return { status: SET_LIST_RESOLUTION.FOUND_STRONG, candidate: sourceMatches[0], candidates: sourceMatches };
  }
  if (sourceMatches.length > 1) {
    return { status: SET_LIST_RESOLUTION.AMBIGUOUS, candidate: null, candidates: sourceMatches };
  }

  if (hash) {
    const hashMatches = pool.filter((candidate) => text(candidate.contentHash) === hash);
    if (hashMatches.length === 1) {
      return { status: SET_LIST_RESOLUTION.FOUND_EXACT, candidate: hashMatches[0], candidates: hashMatches };
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
    return { status: SET_LIST_RESOLUTION.FOUND_STRONG, candidate: metadataMatches[0], candidates: metadataMatches };
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
  canonicalizeAbcForHash,
  convertLegacySetListState,
  hashSetListAbc,
  insertSetListDocumentItem,
  moveSetListDocumentItems,
  normalizeSetListDocument,
  normalizeSetListDocumentItem,
  resolveSetListItem,
  removeSetListDocumentItem,
  serializeSetListDocument,
};
