#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadModule(entryPoint) {
  const bundled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function createElement() {
  const classes = new Set();
  const listeners = new Map();
  let text = "";
  return {
    children: [],
    className: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    dataset: {},
    style: {},
    set textContent(value) {
      text = String(value || "");
      if (!text) this.children = [];
    },
    get textContent() { return text; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    appendChild(child) { this.children.push(child); },
    contains() { return false; },
    getBoundingClientRect() { return { right: 0, bottom: 0, width: 0, height: 0 }; },
    setAttribute() {},
    _listeners: listeners,
  };
}

const { createLibraryContextMenu } = await loadModule("src/renderer/library/context_menu.js");
const body = createElement();
const documentRef = {
  body,
  createElement,
  addEventListener() {},
};
const windowRef = {
  innerWidth: 1200,
  innerHeight: 800,
  addEventListener() {},
};
let expandCalls = 0;
let collapseCalls = 0;
const contextMenu = createLibraryContextMenu({
  documentRef,
  windowRef,
  expandAllLibrary: () => { expandCalls += 1; },
  collapseAllLibrary: () => { collapseCalls += 1; },
});
contextMenu.init();
const menuElement = body.children[0];

for (const target of [
  { type: "library" },
  { type: "file", filePath: "/music/a.abc" },
  { type: "category", categoryType: "composer", value: "A" },
  { type: "tune", tuneId: "/music/a.abc::1" },
]) {
  contextMenu.show(10, 10, target);
  const labels = menuElement.children.map((item) => item.textContent).filter(Boolean);
  assert.ok(labels.includes("Expand All"), `Expand All missing for ${target.type}`);
  assert.ok(labels.includes("Collapse All"), `Collapse All missing for ${target.type}`);
}

contextMenu.show(10, 10, { type: "editor" });
assert.ok(!menuElement.children.some((item) => item.textContent === "Expand All"));
contextMenu.show(10, 10, { type: "library" });

async function clickAction(action) {
  const item = menuElement.children.find((child) => child.dataset.action === action);
  assert.ok(item, `Missing menu action ${action}`);
  await menuElement._listeners.get("click")({ target: { closest: () => item } });
}

await clickAction("expandAllLibrary");
await clickAction("collapseAllLibrary");
assert.equal(expandCalls, 1);
assert.equal(collapseCalls, 1);

const { createLibraryUiStateController } = await loadModule("src/renderer/library/ui_state_controller.js");
const files = [
  { path: "/music/a.abc", tunes: [] },
  { path: "/music/b.abc", tunes: [] },
];
let renders = 0;
const controller = createLibraryUiStateController({
  getLibraryIndex: () => ({ root: "/music", files }),
  getLibraryFilter: () => null,
  getLibraryTextFilter: () => "",
  getActiveFilePath: () => "",
  getActiveTuneId: () => "",
  getActiveTuneMeta: () => null,
  safeBasename: (value) => String(value || "").split("/").pop(),
  pathsEqual: (left, right) => left === right,
  renderLibraryTree: () => { renders += 1; },
  buildGroupEntries: () => [{ id: "group:a" }, { id: "group:b" }],
});

controller.collapseAll();
assert.deepEqual([...controller.getCollapsedFiles()], files.map((file) => file.path));
controller.expandAll();
assert.equal(controller.getCollapsedFiles().size, 0);

controller.handleGroupModeChange("composer");
controller.expandAll();
controller.collapseAll();
assert.deepEqual([...controller.getCollapsedGroups()], ["group:a", "group:b"]);
assert.equal(renders, 5);

console.log("library context menu harness: all tests passed");
