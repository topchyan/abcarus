#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/renderer/app/ui/zoom_mode_controller.js", "utf8");
const encoded = Buffer.from(source, "utf8").toString("base64");
const { createZoomModeController } = await import(`data:text/javascript;base64,${encoded}`);

const cssValues = {
  "--render-zoom": "0.72",
  "--editor-fit-zoom": "0.75",
};
globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => cssValues[name] || "" });

let activePane = "editor";
const settings = { autoScalePanes: true, renderZoom: 1, editorZoom: 1 };
const patches = [];
const controller = createZoomModeController({
  documentRef: { documentElement: {} },
  getSettings: () => settings,
  getActivePane: () => activePane,
  updateSettings: async (patch) => {
    patches.push(patch);
    Object.assign(settings, patch);
    return settings;
  },
});

await controller.zoomBy(0.1);
assert.deepEqual(patches.at(-1), {
  autoScalePanes: false,
  renderZoom: 0.72,
  editorZoom: 0.85,
}, "manual Editor zoom must continue from the visible fitted size and freeze the Score size");

activePane = "render";
cssValues["--render-zoom"] = "0.72";
cssValues["--editor-fit-zoom"] = "1";
await controller.zoomBy(-0.1);
assert.equal(patches.at(-1).renderZoom, 0.62, "manual Score zoom must continue from the visible size");
assert.equal(patches.at(-1).autoScalePanes, false);

await controller.resetAndEnableAutoScale();
assert.deepEqual(patches.at(-1), { autoScalePanes: true, renderZoom: 1, editorZoom: 1 });

console.log("zoom mode harness: auto/manual handoff preserves visible zoom");
