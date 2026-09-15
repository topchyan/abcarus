#!/usr/bin/env node
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const bundled = await build({
  entryPoints: [resolve("src/renderer/app/ui/layout_controller.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");

let renderZoom = 0.4;
const classNames = new Set();
const classList = {
  add: (...names) => names.forEach((name) => classNames.add(name)),
  remove: (...names) => names.forEach((name) => classNames.delete(name)),
  toggle: (name, force) => {
    if (force) classNames.add(name);
    else classNames.delete(name);
  },
  contains: (name) => classNames.has(name),
};
const root = {
  style: {
    setProperty(name, value) {
      if (name === "--render-zoom") renderZoom = Number(value);
    },
  },
};
globalThis.document = { body: { classList }, documentElement: root };
globalThis.window = {
  addEventListener() {},
  requestAnimationFrame(callback) {
    callback();
    return 1;
  },
};

const scoreSvg = {
  getBoundingClientRect: () => ({ width: 800 * renderZoom }),
};
const output = {
  querySelectorAll: (selector) => selector === "svg" ? [scoreSvg] : [],
};
globalThis.getComputedStyle = (element) => {
  if (element === root) {
    return { getPropertyValue: (name) => name === "--render-zoom" ? String(renderZoom) : "" };
  }
  if (element === output) return { paddingLeft: "12px", paddingRight: "12px", zoom: String(renderZoom) };
  return {};
};

const {
  createLayoutController,
  defaultFirstPaneRatioForMode,
  firstPaneRoleForMode,
} = await import(`data:text/javascript;base64,${encoded}`);
assert.equal(firstPaneRoleForMode("horizontal-score-top"), "score");
assert.equal(firstPaneRoleForMode("horizontal-editor-top"), "editor");
assert.equal(firstPaneRoleForMode("vertical-score-left"), "score");
assert.equal(firstPaneRoleForMode("vertical-editor-left"), "editor");
assert.equal(defaultFirstPaneRatioForMode("horizontal-score-top"), 0.62);
assert.equal(defaultFirstPaneRatioForMode("horizontal-editor-top"), 0.38);
assert.equal(defaultFirstPaneRatioForMode("vertical-score-left"), 0.56);
assert.equal(defaultFirstPaneRatioForMode("vertical-editor-left"), 0.44);
const rightSplit = { clientWidth: 1000, clientHeight: 700, style: {} };
const splitDivider = { offsetWidth: 6, offsetHeight: 6, setAttribute() {} };
const renderPane = { clientWidth: 500, scrollTo() {} };
const settings = {
  layoutSplitOrientation: "horizontal",
  layoutSplitRatioVertical: 0.7,
  layoutSplitRatioHorizontal: 0.6,
  layoutRenderZoomVertical: 0.4,
  layoutRenderZoomHorizontal: 0.4,
  renderZoom: 0.4,
};
const controller = createLayoutController({
  rightSplit,
  splitDivider,
  editorPane: {},
  renderPane,
  output,
  getLatestSettings: () => settings,
  saveLayoutPrefs: async (patch) => Object.assign(settings, patch),
});

controller.setFromSettings(settings);
assert.equal(controller.getRightSplitOrientation(), "horizontal");
assert.equal(controller.setSplitOrientation("vertical", { userAction: true }), true);

const expectedFit = 500 / (800 + 24);
assert.ok(Math.abs(renderZoom - expectedFit) < 0.000001, `expected fitted zoom ${expectedFit}, got ${renderZoom}`);
assert.match(rightSplit.style.gridTemplateColumns, /^437px 6px 1fr$/, "Auto Fit orientation change must use the target mode's role-based ratio");
await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));

renderZoom = 0.25;
settings.renderZoom = 0.25;
settings.layoutRenderZoomVertical = 0.25;
controller.fitScoreToCurrentPane({ resetScroll: false, persist: false });
assert.ok(Math.abs(renderZoom - expectedFit) < 0.000001, "transient Focus fit must resize the Score");
await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
assert.equal(settings.renderZoom, 0.25, "transient Focus fit must not overwrite the normal saved zoom");
assert.equal(settings.layoutRenderZoomVertical, 0.25, "transient Focus fit must not overwrite orientation zoom");

controller.setSplitMode("horizontal-editor-top", { persist: false });
controller.resetView({ fitScore: false, resetScroll: false });
assert.match(rightSplit.style.gridTemplateRows, /^264px 6px 1fr$/, "Editor top Auto Fit must reserve the larger lower area for the Score");
controller.setSplitMode("horizontal-score-top", { persist: false });
assert.match(rightSplit.style.gridTemplateRows, /^430px 6px 1fr$/, "reversing horizontal panes must preserve their role-based heights");
controller.setSplitMode("vertical-editor-left", { persist: false });
controller.setSplitMode("horizontal-editor-top", { persist: false });
assert.match(rightSplit.style.gridTemplateRows, /^264px 6px 1fr$/, "entering Editor top with Auto Fit must immediately use the role-based height");

scoreSvg.getBBox = () => ({ x: 20, width: 600 });
scoreSvg.viewBox = { baseVal: { width: 800 } };
const pageFit = controller.computeFocusFitZoom({ currentZoom: renderZoom, fitMode: "page" });
const contentFit = controller.computeFocusFitZoom({ currentZoom: renderZoom, fitMode: "content" });
assert.ok(contentFit > pageFit, "notation-width fitting must use otherwise empty page space");
delete scoreSvg.getBBox;
delete scoreSvg.viewBox;

let editorFitZoom = 1;
let renderZoomWrites = 0;
let resizeCallback = null;
const observed = [];
const editorContent = {};
const editorScroller = { clientWidth: 828 };
const editorGutters = { getBoundingClientRect: () => ({ width: 40 }) };
const adaptiveEditorPane = {
  querySelector(selector) {
    if (selector === ".cm-content") return editorContent;
    if (selector === ".cm-scroller") return editorScroller;
    if (selector === ".cm-gutters") return editorGutters;
    return null;
  },
};
root.style.setProperty = (name, value) => {
  if (name === "--render-zoom") {
    renderZoom = Number(value);
    renderZoomWrites += 1;
  }
  if (name === "--editor-fit-zoom") editorFitZoom = Number(value);
};
document.createElement = (tag) => tag === "canvas" ? {
  getContext: () => ({
    font: "",
    measureText: (value) => ({ width: String(value).length * 10 * editorFitZoom }),
  }),
} : {};
globalThis.ResizeObserver = class ResizeObserver {
  constructor(callback) { resizeCallback = callback; }
  observe(element) { observed.push(element); }
};
globalThis.getComputedStyle = (element) => {
  if (element === root) {
    return {
      getPropertyValue: (name) => {
        if (name === "--render-zoom") return String(renderZoom);
        if (name === "--editor-fit-zoom") return String(editorFitZoom);
        return "";
      },
    };
  }
  if (element === output) return { paddingLeft: "12px", paddingRight: "12px", zoom: String(renderZoom) };
  if (element === editorContent) return { fontStyle: "normal", fontWeight: "400", fontSize: `${13 * editorFitZoom}px`, fontFamily: "monospace" };
  return {};
};

const adaptiveSettings = { autoScalePanes: true, scoreFitMode: "content", renderZoom: 1 };
const adaptiveController = createLayoutController({
  editorPane: adaptiveEditorPane,
  renderPane,
  output,
  getEditorText: () => `${"A".repeat(100)}\nshort`,
  getLatestSettings: () => adaptiveSettings,
});
assert.equal(adaptiveController.fitEditorToCurrentPane(), 768 / 1008, "Editor fit must shrink a long line to the available text width");
assert.equal(adaptiveController.initAdaptiveFit(), true, "adaptive fit must use ResizeObserver when available");
assert.deepEqual(observed, [adaptiveEditorPane, renderPane], "adaptive fit must observe both workspace panes");
resizeCallback([
  { target: adaptiveEditorPane, contentRect: { width: editorScroller.clientWidth } },
  { target: renderPane, contentRect: { width: renderPane.clientWidth } },
]);
renderPane.clientWidth = 400;
resizeCallback([{ target: renderPane, contentRect: { width: 400, height: 300 } }]);
assert.equal(renderZoom, 0.5, "pane resize must refit the Score automatically within its readable zoom limit");
const writesAfterResize = renderZoomWrites;
resizeCallback([{ target: renderPane, contentRect: { width: 400, height: 200 } }]);
assert.equal(renderZoomWrites, writesAfterResize, "height-only resize must not refit or jitter the Score");
renderPane.clientWidth = (800 + 24) * renderZoom * 1.001;
resizeCallback([{ target: renderPane, contentRect: { width: renderPane.clientWidth } }]);
assert.equal(renderZoomWrites, writesAfterResize, "subpixel fit differences must not rewrite zoom and jitter the Score");

adaptiveSettings.autoScalePanes = false;
adaptiveController.scheduleAdaptiveFit();
assert.equal(editorFitZoom, 1, "disabling adaptive fit must restore the user's Editor zoom");

console.log("layout controller harness: split, Focus, and adaptive fits preserve layout state");
