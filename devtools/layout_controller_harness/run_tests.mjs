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

const output = {
  querySelectorAll: (selector) => selector === "svg" ? [{
    getBoundingClientRect: () => ({ width: 800 * renderZoom }),
  }] : [],
};
globalThis.getComputedStyle = (element) => {
  if (element === root) {
    return { getPropertyValue: (name) => name === "--render-zoom" ? String(renderZoom) : "" };
  }
  if (element === output) return { paddingLeft: "12px", paddingRight: "12px", zoom: String(renderZoom) };
  return {};
};

const { createLayoutController } = await import(`data:text/javascript;base64,${encoded}`);
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
assert.match(rightSplit.style.gridTemplateColumns, /^696px 6px 1fr$/, "orientation change must preserve its saved split ratio");
await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));

renderZoom = 0.25;
settings.renderZoom = 0.25;
settings.layoutRenderZoomVertical = 0.25;
controller.fitScoreToCurrentPane({ resetScroll: false, persist: false });
assert.ok(Math.abs(renderZoom - expectedFit) < 0.000001, "transient Focus fit must resize the Score");
await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
assert.equal(settings.renderZoom, 0.25, "transient Focus fit must not overwrite the normal saved zoom");
assert.equal(settings.layoutRenderZoomVertical, 0.25, "transient Focus fit must not overwrite orientation zoom");

console.log("layout controller harness: split and Focus fits preserve layout state");
