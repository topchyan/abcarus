#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function importRendererModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const { createDocumentLifecycleController } = await importRendererModule(
  resolve("src/renderer/app/document/document_lifecycle_controller.js")
);
const { createCurrentDocumentController } = await importRendererModule(
  resolve("src/renderer/app/document/current_document_controller.js")
);
const { createDocumentSessionController } = await importRendererModule(
  resolve("src/renderer/app/document/document_session_controller.js")
);
const { createLibraryMetadataController } = await importRendererModule(
  resolve("src/renderer/library/library_metadata_controller.js")
);
const { createLibraryLifecycleController } = await importRendererModule(
  resolve("src/renderer/library/library_lifecycle_controller.js")
);
const { createLibraryDocumentContext } = await importRendererModule(
  resolve("src/renderer/library/library_document_context.js")
);
const { createActiveTuneContextStore } = await importRendererModule(
  resolve("src/renderer/app/document/active_tune_context_store.js")
);
const { createSaveFlowController } = await importRendererModule(
  resolve("src/renderer/app/document/save_flow_controller.js")
);

function testBeginCleanFileDocumentClearsStaleSaveContext() {
  const calls = [];
  let currentDocument = null;
  let activeFilePath = "/tmp/old.abc";
  let dirtyIndicator = true;

  const controller = createDocumentLifecycleController({
    actions: {
      clearActiveTuneState: () => calls.push("clearActiveTuneState"),
      setActiveFilePath: (path) => { activeFilePath = path || ""; },
      setCurrentDocument: (doc) => { currentDocument = doc; },
      setDirtyIndicator: (next) => { dirtyIndicator = Boolean(next); },
      markHeaderClean: () => calls.push("markHeaderClean"),
      setTuneMetaText: (text) => calls.push(["setTuneMetaText", text]),
      setFileNameMeta: (text) => calls.push(["setFileNameMeta", text]),
      clearErrors: () => calls.push("clearErrors"),
      updateFileHeaderPanel: () => calls.push("updateFileHeaderPanel"),
      updateHeaderStateUi: () => calls.push("updateHeaderStateUi"),
    },
    constants: {
      untitledLabel: "Untitled",
    },
  });

  controller.beginCleanFileDocument({
    path: "/tmp/new.abc",
    content: "X:1\nT:New\nK:C\nC|\n",
    tuneLabel: "Untitled",
    fileLabel: "new",
  });

  assert.equal(activeFilePath, "/tmp/new.abc");
  assert.deepEqual(currentDocument, {
    path: "/tmp/new.abc",
    dirty: false,
    content: "X:1\nT:New\nK:C\nC|\n",
  });
  assert.equal(dirtyIndicator, false);
  assert.ok(calls.includes("clearActiveTuneState"), "active tune state must be reset before opening a clean file document");
  assert.ok(calls.includes("markHeaderClean"), "header state should be clean for a clean file document");
}

function testCurrentDocumentControllerKeepsSessionAndUiTogether() {
  const calls = [];
  let document = null;
  const session = {
    replaceCurrentDocument: (next) => {
      document = next;
      return next;
    },
  };
  const controller = createCurrentDocumentController({
    state: {
      getDocumentSessionController: () => session,
      getDocumentLifecycleController: () => ({
        applyDocumentToUi: (next) => calls.push(["apply", next]),
        showEmptyState: () => calls.push(["empty"]),
      }),
    },
  });

  const next = { path: "/tmp/song.abc", content: "X:1\n", dirty: false };
  assert.equal(controller.setCurrentDocument(next), next);
  assert.equal(document, next);
  assert.deepEqual(calls, [["apply", next]], "document replacement must reconcile UI immediately");

  controller.clearCurrentDocument();
  assert.equal(document, null);
  assert.deepEqual(calls, [["apply", next], ["empty"]], "clearing a document must enter empty UI state");
}

async function testDontSaveRequiresSuccessfulTuneReload() {
  let currentDocument = { path: "/tmp/song.abc", content: "edited", dirty: true };
  let reloadCalls = 0;
  const controller = createDocumentSessionController({
    api: { confirmUnsavedChanges: async () => "dont_save" },
    state: {
      getCurrentDoc: () => currentDocument,
      setCurrentDoc: (next) => { currentDocument = next; },
      getActiveFilePath: () => "/tmp/song.abc",
      getActiveTuneMeta: () => ({ path: "/tmp/song.abc", id: "song::1" }),
      getHeaderDirty: () => false,
      hasUnsavedChangesInActiveEditContext: () => false,
      isRawMode: () => false,
      isChordProEnabled: () => false,
    },
    actions: {
      discardFileChangesForActiveFile: async () => {
        reloadCalls += 1;
        currentDocument = { path: "/tmp/song.abc", content: "from disk", dirty: false };
        return true;
      },
      markHeaderClean: () => {},
      updateHeaderStateUI: () => {},
    },
  });

  assert.equal(await controller.confirmAbandonIfDirty("switching tunes"), true);
  assert.equal(reloadCalls, 1);
  assert.deepEqual(currentDocument, { path: "/tmp/song.abc", content: "from disk", dirty: false });

  currentDocument = { path: "/tmp/song.abc", content: "edited again", dirty: true };
  const failed = createDocumentSessionController({
    api: { confirmUnsavedChanges: async () => "dont_save" },
    state: {
      getCurrentDoc: () => currentDocument,
      getActiveFilePath: () => "/tmp/song.abc",
      getActiveTuneMeta: () => ({ path: "/tmp/song.abc", id: "song::1" }),
      getHeaderDirty: () => false,
      hasUnsavedChangesInActiveEditContext: () => false,
      isRawMode: () => false,
      isChordProEnabled: () => false,
    },
    actions: {
      discardFileChangesForActiveFile: async () => false,
      markHeaderClean: () => {},
      updateHeaderStateUI: () => {},
    },
  });
  assert.equal(await failed.confirmAbandonIfDirty("switching tunes"), false, "failed discard must block navigation");

  let headerReloadCalls = 0;
  const headerOnly = createDocumentSessionController({
    api: { confirmUnsavedChanges: async () => "dont_save" },
    state: {
      getCurrentDoc: () => ({ path: "/tmp/song.abc", content: "from disk", dirty: false }),
      getActiveFilePath: () => "/tmp/song.abc",
      getActiveTuneMeta: () => ({ path: "/tmp/song.abc", id: "song::1" }),
      getHeaderDirty: () => true,
      hasUnsavedChangesInActiveEditContext: () => true,
      isRawMode: () => false,
      isChordProEnabled: () => false,
    },
    actions: {
      discardFileChangesForActiveFile: async () => {
        headerReloadCalls += 1;
        return true;
      },
      markHeaderClean: () => { throw new Error("header-only discard must reload before clearing header state"); },
      updateHeaderStateUI: () => {},
    },
  });
  assert.equal(await headerOnly.confirmAbandonIfDirty("switching tunes"), true);
  assert.equal(headerReloadCalls, 1, "header-only discard must reload the file context");
}

async function testFileOpenUsesLibraryRestorationPath() {
  const filePath = "/tmp/tunes.abc";
  const calls = [];
  const controller = createDocumentSessionController({
    actions: {
      showOpenDialog: async () => filePath,
      readFile: async () => ({ ok: true, data: "X:1\nT:First\nK:C\nC |\n" }),
      loadLibraryFileIntoEditor: async (path, options) => {
        calls.push([path, options]);
        return { ok: true };
      },
      loadSingleLibraryFile: async () => {
        throw new Error("fileOpen must not bypass last-tune restoration");
      },
      safeDirname: () => "/tmp",
    },
  });

  await controller.fileOpen();
  assert.deepEqual(calls, [[filePath, { skipConfirm: true }]]);
}

function testBeginFullFileModeContextClearsTuneBeforeSaveSession() {
  const calls = [];
  const controller = createDocumentLifecycleController({
    actions: {
      clearActiveTuneState: (path) => calls.push(["clearActiveTuneState", path]),
    },
  });

  controller.beginFullFileModeContext("/tmp/song.pro", "chordpro_open");

  assert.deepEqual(calls, [
    ["clearActiveTuneState", "/tmp/song.pro"],
  ]);
}

function testBeginRawFullFileContextPreservesTuneState() {
  const calls = [];
  const controller = createDocumentLifecycleController({
    actions: {
      clearActiveTuneState: () => calls.push(["clearActiveTuneState"]),
      setActiveFilePath: (path) => calls.push(["setActiveFilePath", path]),
    },
  });

  controller.beginRawFullFileContext("/tmp/raw.abc", "raw_mode");

  assert.deepEqual(calls, [
    ["setActiveFilePath", "/tmp/raw.abc"],
  ]);
}

function testSetRawActiveTuneContextClearsStaleUidAndIndex() {
  const calls = [];
  const meta = { path: "/tmp/raw.abc", xNumber: "2" };
  const controller = createDocumentLifecycleController({
    actions: {
      setActiveTuneId: (value) => calls.push(["setActiveTuneId", value]),
      setActiveTuneUid: (value) => calls.push(["setActiveTuneUid", value]),
      setActiveTuneIndex: (value) => calls.push(["setActiveTuneIndex", value]),
      setActiveTuneMeta: (value) => calls.push(["setActiveTuneMeta", value]),
    },
  });

  controller.setRawActiveTuneContext("/tmp/raw.abc::2", meta);

  assert.deepEqual(calls, [
    ["setActiveTuneId", "/tmp/raw.abc::2"],
    ["setActiveTuneUid", null],
    ["setActiveTuneIndex", null],
    ["setActiveTuneMeta", meta],
  ]);
}

function testLibraryDocumentContextShowsCleanFileDocument() {
  const calls = [];
  const context = createLibraryDocumentContext({
    markActiveTuneButton: (id) => calls.push(["markActiveTuneButton", id]),
    markCurrentDocumentClean: () => calls.push(["markCurrentDocumentClean"]),
    setActiveTuneId: (id) => calls.push(["setActiveTuneId", id]),
    setActiveTuneUid: (uid) => calls.push(["setActiveTuneUid", uid]),
    setActiveTuneIndex: (index) => calls.push(["setActiveTuneIndex", index]),
    setActiveTuneMeta: (meta) => calls.push(["setActiveTuneMeta", meta]),
    setActiveTuneText: (text, meta, options) => calls.push(["setActiveTuneText", text, meta, options]),
    setCurrentDocument: (doc) => calls.push(["setCurrentDocument", doc]),
    setDirtyIndicator: (dirty) => calls.push(["setDirtyIndicator", dirty]),
  });

  context.showCleanFileDocument("/tmp/empty.abc", "");

  assert.deepEqual(calls, [
    ["setActiveTuneText", "", null, { suppressRecent: true }],
    ["setCurrentDocument", { path: "/tmp/empty.abc", dirty: false, content: "" }],
    ["setActiveTuneId", null],
    ["setActiveTuneUid", null],
    ["setActiveTuneIndex", null],
    ["setActiveTuneMeta", null],
    ["markCurrentDocumentClean"],
    ["setDirtyIndicator", false],
    ["markActiveTuneButton", null],
  ]);
}

function testLibraryDocumentContextUsesAtomicActiveContextClear() {
  const activeContext = createActiveTuneContextStore();
  activeContext.setActiveFilePath("/tmp/active.abc");
  activeContext.setActiveTuneId("legacy-id");
  activeContext.setActiveTuneUid("stable-uid");
  activeContext.setActiveTuneIndex(2);
  activeContext.setActiveTuneMeta({ path: "/tmp/active.abc", tuneUid: "stable-uid" });

  const context = createLibraryDocumentContext({
    activeTuneContext: activeContext,
    setActiveTuneText: () => {},
    setCurrentDocument: () => {},
  });

  context.showCleanFileDocument("/tmp/active.abc", "");

  assert.equal(activeContext.getActiveFilePath(), "/tmp/active.abc");
  assert.equal(activeContext.getActiveTuneId(), null);
  assert.equal(activeContext.getActiveTuneUid(), null);
  assert.equal(activeContext.getActiveTuneIndex(), null);
  assert.equal(activeContext.getActiveTuneMeta(), null);
}

function testDropActiveLibraryFileClearsSaveSession() {
  const activePath = "/tmp/library/active.abc";
  let libraryIndex = {
    root: "/tmp/library",
    files: [
      { path: activePath, basename: "active.abc", tunes: [] },
      { path: "/tmp/library/other.abc", basename: "other.abc", tunes: [] },
    ],
  };
  let activeFilePath = activePath;
  let activeTuneMeta = { path: activePath, tuneUid: "abc123" };
  let activeTuneId = "old-id";
  let activeTuneUid = "abc123";
  let activeTuneIndex = 0;
  let currentDocumentPath = activePath;
  let patchedDocument = null;

  const controller = createLibraryMetadataController({
    state: {
      getLibraryIndex: () => libraryIndex,
      setLibraryIndex: (next) => { libraryIndex = next; },
      getActiveFilePath: () => activeFilePath,
      setActiveFilePath: (next) => { activeFilePath = next || ""; },
      getActiveTuneMeta: () => activeTuneMeta,
      setActiveTuneMeta: (next) => { activeTuneMeta = next; },
      getCurrentDocumentPath: () => currentDocumentPath,
      setActiveTuneId: (next) => { activeTuneId = next; },
      setActiveTuneUid: (next) => { activeTuneUid = next; },
      setActiveTuneIndex: (next) => { activeTuneIndex = next; },
    },
    actions: {
      invalidateLibraryView: () => {},
      patchCurrentDocument: (patch) => {
        patchedDocument = patch;
        currentDocumentPath = patch.path || "";
      },
      pathsEqual: (a, b) => String(a || "") === String(b || ""),
      setDirtyIndicator: () => {},
      updateLibraryStatus: () => {},
      scheduleRenderLibraryTree: () => {},
    },
  });

  const dropped = controller.dropLibraryFileEntry(activePath);

  assert.equal(dropped, true);
  assert.equal(libraryIndex.files.length, 1);
  assert.equal(activeFilePath, activePath, "the loaded path must remain available for Save As");
  assert.deepEqual(activeTuneMeta, { path: activePath, tuneUid: "abc123" });
  assert.equal(activeTuneId, "old-id");
  assert.equal(activeTuneUid, "abc123");
  assert.equal(activeTuneIndex, 0);
  assert.equal(patchedDocument, null, "the loaded buffer must remain available for Save As");
}

function testDropInactiveLibraryFileDoesNotClearSaveSession() {
  const activePath = "/tmp/library/active.abc";
  const inactivePath = "/tmp/library/inactive.abc";
  let libraryIndex = {
    root: "/tmp/library",
    files: [
      { path: activePath, basename: "active.abc", tunes: [] },
      { path: inactivePath, basename: "inactive.abc", tunes: [] },
    ],
  };
  let clearSaveCalls = 0;

  const controller = createLibraryMetadataController({
    state: {
      getLibraryIndex: () => libraryIndex,
      setLibraryIndex: (next) => { libraryIndex = next; },
      getActiveFilePath: () => activePath,
      setActiveFilePath: () => { throw new Error("dirty document active path must be preserved"); },
      getActiveTuneMeta: () => ({ path: activePath, tuneUid: "abc123" }),
      setActiveTuneMeta: () => { throw new Error("dirty document tune context must be preserved"); },
      getCurrentDocumentPath: () => activePath,
    },
    actions: {
      invalidateLibraryView: () => {},
      patchCurrentDocument: () => {},
      pathsEqual: (a, b) => String(a || "") === String(b || ""),
      setDirtyIndicator: () => {},
      updateLibraryStatus: () => {},
      scheduleRenderLibraryTree: () => {},
    },
  });

  const dropped = controller.dropLibraryFileEntry(inactivePath);

  assert.equal(dropped, true);
  assert.equal(libraryIndex.files.length, 1);
}

function testDropDeletedActiveFilePreservesDirtyDocument() {
  const activePath = "/tmp/library/active.abc";
  let libraryIndex = {
    root: "/tmp/library",
    files: [{ path: activePath, basename: "active.abc", tunes: [] }],
  };
  let patched = null;
  let dirtyIndicatorCalls = 0;
  const controller = createLibraryMetadataController({
    state: {
      getLibraryIndex: () => libraryIndex,
      setLibraryIndex: (next) => { libraryIndex = next; },
      getActiveFilePath: () => activePath,
      getActiveTuneMeta: () => ({ path: activePath, tuneUid: "abc123" }),
      getCurrentDocumentPath: () => activePath,
      isCurrentDocumentDirty: () => true,
      getHeaderDirty: () => false,
    },
    actions: {
      invalidateLibraryView: () => {},
      patchCurrentDocument: (patch) => { patched = patch; },
      pathsEqual: (a, b) => String(a || "") === String(b || ""),
      setDirtyIndicator: () => { dirtyIndicatorCalls += 1; },
      updateLibraryStatus: () => {},
      scheduleRenderLibraryTree: () => {},
    },
  });

  assert.equal(controller.dropLibraryFileEntry(activePath), true);
  assert.equal(libraryIndex.files.length, 0);
  assert.equal(patched, null, "dirty document must remain available for Save to recreate the file");
  assert.equal(dirtyIndicatorCalls, 0, "deleting the disk entry must not clear dirty UI state");
}

function testLibraryReconcilesSavedTuneByStableIdentity() {
  let activeId = "/tmp/tunes.abc::10";
  let activeUid = "uid-second";
  let activeIndex = 1;
  let activeMeta = {
    path: "/tmp/tunes.abc",
    xNumber: "2",
    title: "Second",
  };
  const controller = createLibraryLifecycleController({
    state: {
      getActiveTuneId: () => activeId,
      getActiveTuneIndex: () => activeIndex,
      getActiveTuneMeta: () => activeMeta,
      getActiveTuneUid: () => activeUid,
    },
    actions: {
      buildTuneMetaLabel: (meta) => meta.title,
      markActiveTuneButton: () => {},
      safeBasename: (p) => String(p).split("/").pop(),
      setActiveTuneId: (value) => { activeId = value; },
      setActiveTuneIndex: (value) => { activeIndex = value; },
      setActiveTuneMeta: (value) => { activeMeta = value; },
      setActiveTuneUid: (value) => { activeUid = value; },
      setFileNameMeta: () => {},
      setTuneMetaText: () => {},
      stripFileExtension: (name) => String(name).replace(/\.[^.]+$/, ""),
    },
    constants: {
      SAVE_INTENT: { REPLACE_TUNE: "replace_tune" },
    },
  });
  const updatedFile = {
    path: "/tmp/tunes.abc",
    basename: "tunes.abc",
    tunes: [
      { id: "first", tuneUid: "uid-first", tuneIndex: 0, xNumber: "1", title: "First" },
      { id: "second-new-offset", tuneUid: "uid-second", tuneIndex: 1, xNumber: "2", title: "Second", startOffset: 22, endOffset: 50 },
    ],
  };

  assert.equal(controller.reconcileActiveTuneAfterSave(updatedFile.path, updatedFile), true);
  assert.equal(activeId, "second-new-offset");
  assert.equal(activeUid, "uid-second");
  assert.equal(activeIndex, 1);
  assert.equal(activeMeta.startOffset, 22);
}

async function testSimpleTuneSaveIsOwnedBySaveController() {
  const filePath = "/tmp/tunes.abc";
  const sourceText = "X:2\nT:Second\nK:C\nD|\n";
  const editedText = "X:2\nT:Changed\nK:C\nE|\n";
  let writePayload = null;
  let reconciled = false;
  let patched = null;
  const controller = createSaveFlowController({
    state: {
      getActiveTuneMeta: () => ({
        path: filePath,
        xNumber: "2",
        documentParts: { header: "", before: "", active: sourceText, after: "" },
      }),
      getHeaderEditorValue: () => "",
    },
    actions: {
      getEditorValue: () => editedText,
      readFile: async () => ({ ok: true, data: sourceText }),
      writeFile: async (path, data, options) => {
        writePayload = { path, data, options };
        return { ok: true };
      },
      markDiskConflictPath: () => {},
      patchCurrentDocument: (value) => { patched = value; },
      pathsEqual: (a, b) => a === b,
      reconcileActiveTuneAfterSave: () => { reconciled = true; },
      refreshLibraryFile: async () => ({ path: filePath, tunes: [] }),
      setActiveFilePath: () => {},
      setActiveTuneMeta: () => {},
      setDirtyIndicator: () => {},
      updateFileHeaderPanel: () => {},
      withFileLock: async (_path, fn) => fn(),
    },
  });

  assert.equal(await controller.performSimpleTuneSave(filePath), true);
  assert.deepEqual(writePayload, {
    path: filePath,
    data: editedText,
    options: {},
  });
  assert.deepEqual(patched, {
    path: filePath,
    content: editedText,
    dirty: false,
  });
  assert.equal(reconciled, true);
}

testBeginCleanFileDocumentClearsStaleSaveContext();
testCurrentDocumentControllerKeepsSessionAndUiTogether();
await testDontSaveRequiresSuccessfulTuneReload();
await testFileOpenUsesLibraryRestorationPath();
testBeginFullFileModeContextClearsTuneBeforeSaveSession();
testBeginRawFullFileContextPreservesTuneState();
testSetRawActiveTuneContextClearsStaleUidAndIndex();
testLibraryDocumentContextShowsCleanFileDocument();
testLibraryDocumentContextUsesAtomicActiveContextClear();
testDropActiveLibraryFileClearsSaveSession();
testDropInactiveLibraryFileDoesNotClearSaveSession();
testDropDeletedActiveFilePreservesDirtyDocument();
testLibraryReconcilesSavedTuneByStableIdentity();
await testSimpleTuneSaveIsOwnedBySaveController();

console.log("[document_context_harness] OK");
