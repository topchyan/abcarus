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
assert.equal(labels(viewMenu).filter((label) => label.includes("Split Orientation")).length, 1);
assert(labels(fileMenu).includes("Print Active Set List…"));
assert(!labels(toolsMenu).includes("Set List"));
assert(labels(toolsMenu).includes("ABC Helpers…"));
assert(labels(toolsMenu).includes("Update YouTube Metadata (Active File)…"));
assert(!labels(editMenu).includes("ABC Helpers…"));
assert(labels(playMenu).includes("Stop"));
assert(labels(playMenu).includes("Reset View") === false);
assert(labels(viewMenu).includes("Reset View"));

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
