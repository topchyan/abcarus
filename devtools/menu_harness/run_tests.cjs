#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const filePath = path.join(root, "src/main/menu.js");
const source = fs.readFileSync(filePath, "utf8");
const moduleRef = { exports: {} };
const localRequire = (id) => {
  if (id === "electron") return { Menu: {} };
  return require(id);
};
const wrapper = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${source}\n})`, {
  filename: filePath,
});
wrapper(localRequire, moduleRef, moduleRef.exports, filePath, path.dirname(filePath));

const { buildMenuTemplate } = moduleRef.exports;
assert.equal(typeof buildMenuTemplate, "function");

const actions = [];
const template = buildMenuTemplate({
  name: "ABCarus",
  recentFolders: [],
  recentFiles: [],
  recentTunes: [],
  settings: {
    playbackSelectionLoopEnabled: false,
    noteTypingPreviewEnabled: false,
  },
  debugFlags: {},
}, (action) => actions.push(action));

const menu = (label) => template.find((entry) => entry.label === label);
const labels = (entry) => (entry && Array.isArray(entry.submenu) ? entry.submenu.map((item) => item.label).filter(Boolean) : []);
const findItem = (entry, label) => entry.submenu.find((item) => item.label === label);

const fileMenu = menu("File");
const editMenu = menu("Edit");
const viewMenu = menu("View");
const playMenu = menu("Play");
const toolsMenu = menu("Tools");

assert(labels(viewMenu).includes("Show/Hide Library Panel"));
assert(labels(viewMenu).includes("Library Catalog…"));
assert(labels(viewMenu).includes("Show/Hide Set List Panel"));
assert(labels(viewMenu).includes("Show/Hide File Header"));
assert.equal(labels(viewMenu).filter((label) => label.includes("Cycle Split Layout")).length, 1);
const splitLayoutMenu = menu("View").submenu.find((item) => item.label === "Split Layout");
assert.deepEqual(labels(splitLayoutMenu), [
  "Editor left / Score right",
  "Score left / Editor right",
  "Editor top / Score bottom",
  "Score top / Editor bottom",
]);
assert(labels(fileMenu).includes("Print Active Set List…"));
assert(!labels(toolsMenu).includes("Set List"));
assert(labels(toolsMenu).includes("ABC Helpers…"));
assert(labels(toolsMenu).includes("Update YouTube Metadata (Active File)…"));
assert(labels(toolsMenu).includes("Rhythmic Notation (Mertebe)"));
assert(!labels(toolsMenu).includes("Bolahenk / Concert (Experimental)"));
assert(!labels(editMenu).includes("ABC Helpers…"));
assert(labels(playMenu).includes("Stop"));
assert(labels(playMenu).includes("Reset View") === false);
assert(labels(viewMenu).includes("Reset View"));

const mertebeMenu = findItem(toolsMenu, "Rhythmic Notation (Mertebe)");
assert.deepEqual(labels(mertebeMenu), [
  "Augment ×2 (Eighth → Quarter)",
  "Diminish ×2 (Quarter → Eighth)",
]);
assert.equal(mertebeMenu.submenu[0].accelerator, "CmdOrCtrl+Shift+PageUp");
assert.equal(mertebeMenu.submenu[1].accelerator, "CmdOrCtrl+Shift+PageDown");

const experimentalTemplate = buildMenuTemplate({
  name: "ABCarus",
  recentFolders: [],
  recentFiles: [],
  recentTunes: [],
  settings: { supportMicrotonalNotation: true },
  debugFlags: {},
}, () => {});
const experimentalTools = experimentalTemplate.find((entry) => entry.label === "Tools");
const notationConverter = experimentalTools.submenu.find((item) => item.label === "Bolahenk / Concert (Experimental)");
assert(notationConverter);
assert.deepEqual(labels(notationConverter), [
  "Convert Bolahenk to Concert",
  "Convert Concert to Bolahenk",
]);

const playOptions = findItem(playMenu, "Options");
const loopSelection = findItem(playOptions, "Loop Selection");
assert(loopSelection && loopSelection.type === "checkbox");

findItem(viewMenu, "Show/Hide Set List Panel").click();
findItem(fileMenu, "Print Active Set List…").click();
findItem(playMenu, "Stop").click();
loopSelection.click({ checked: true });
assert.deepEqual(actions, [
  "toggleSetList",
  "printSetList",
  "stopPlayback",
  { type: "toggleSelectionLoop", value: true },
]);

console.log("menu harness: all tests passed");
