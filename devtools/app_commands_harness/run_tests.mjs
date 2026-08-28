#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/renderer/app/commands/app_commands_domain.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const { createAppCommandsDomain } = await import(`data:text/javascript;base64,${encoded}`);

function createButton() {
  let clickHandler = null;
  return {
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    },
    click(event = {}) {
      assert.equal(typeof clickHandler, "function");
      clickHandler(event);
    },
  };
}

const newTuneButton = createButton();
const toggleLibraryButton = createButton();
const libraryCatalogButton = createButton();
const openFolderAsLibraryButton = createButton();
const libraryToolbarMenu = {
  open: true,
  contains: () => false,
};
const documentRef = {
  activeElement: null,
  addEventListener() {},
};
const settingsPatches = [];
let newTuneCalls = 0;
let newFromTemplateCalls = 0;
let templatesCalls = 0;
let toggleLibraryCalls = 0;
let libraryCatalogCalls = 0;
let openFolderCalls = 0;
let libraryMetadataCalls = 0;
let toggleSetListCalls = 0;
let printSetListCalls = 0;
let stopPlaybackCalls = 0;

const domain = createAppCommandsDomain({
  api: {
    onMenuAction() {},
    updateSettings: async (patch) => { settingsPatches.push(patch); },
  },
  documentRef,
  elements: {
    newTuneButton,
    toggleLibraryButton,
    libraryToolbarMenu,
    libraryCatalogButton,
    openFolderAsLibraryButton,
  },
  state: {
    isPayloadMode: () => false,
    isRawModeActive: () => false,
  },
  actions: {
    fileNewTune: async () => { newTuneCalls += 1; },
    fileNewFromTemplate: async () => { newFromTemplateCalls += 1; },
    openTemplatesModal: async () => { templatesCalls += 1; },
    toggleLibrary: () => { toggleLibraryCalls += 1; },
    openLibraryCatalog: () => { libraryCatalogCalls += 1; },
    scanAndLoadLibrary: async () => { openFolderCalls += 1; },
    openLibraryMetadata: () => { libraryMetadataCalls += 1; },
    toggleSetList: () => { toggleSetListCalls += 1; },
    printSetList: async () => { printSetListCalls += 1; },
    stopPlaybackTransport: () => { stopPlaybackCalls += 1; },
  },
});

domain.wire();
newTuneButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(newTuneCalls, 1, "New Tune toolbar button must dispatch the canonical fileNewTune action");
toggleLibraryButton.click({ shiftKey: true });
assert.equal(toggleLibraryCalls, 1, "Library primary action must always toggle the Tree");
assert.equal(libraryCatalogCalls, 0, "Library Catalog must not depend on hidden Shift-click behavior");
libraryCatalogButton.click();
assert.equal(libraryToolbarMenu.open, false);
assert.equal(libraryCatalogCalls, 1, "Library dropdown must expose Catalog");
libraryToolbarMenu.open = true;
openFolderAsLibraryButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(libraryToolbarMenu.open, false);
assert.equal(openFolderCalls, 1, "Library dropdown must expose Open Folder as Library");
await domain.dispatch("newFromTemplate");
await domain.dispatch("templatesModal");
assert.equal(newFromTemplateCalls, 1, "New Tune From Template must retain its new-file contract");
assert.equal(templatesCalls, 1, "Templates Library must remain distinct from New Tune");
await domain.dispatch("libraryMetadata");
assert.equal(libraryMetadataCalls, 1, "Tools -> Library Metadata must dispatch its feature action");
await domain.dispatch("toggleSetList");
await domain.dispatch("printSetList");
await domain.dispatch("stopPlayback");
await domain.dispatch({ type: "toggleSelectionLoop", value: true });
assert.equal(toggleSetListCalls, 1, "View -> Show/Hide Set List Panel must toggle the docked panel");
assert.equal(printSetListCalls, 1, "File -> Print Active Set List must print the active Set List");
assert.equal(stopPlaybackCalls, 1, "Play -> Stop must stop playback");
assert.deepEqual(settingsPatches.at(-1), { playbackSelectionLoopEnabled: true }, "Play -> Options -> Loop Selection must persist its setting");

console.log("app commands harness: all tests passed");
