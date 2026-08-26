#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve("src/renderer/app/ui/tool_status_controller.js"), "utf8");
const encoded = Buffer.from(source, "utf8").toString("base64");
const { createToolStatusController } = await import(`data:text/javascript;base64,${encoded}`);

function createElement() {
  const classes = new Set();
  return {
    textContent: "",
    title: "",
    style: { display: "" },
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
}

function healthyTools(overrides = {}) {
  return {
    abc2xml: { ok: true },
    xml2abc: { ok: true },
    midi2xml: { ok: true },
    midi2abc: { ok: true },
    python: { ok: true },
    ...overrides,
  };
}

{
  const element = createElement();
  const toasts = [];
  const controller = createToolStatusController({
    element,
    api: {
      checkConversionTools: async () => ({
        ok: true,
        tools: healthyTools({
          midi2xml: { ok: false, error: "midi2xml runtime check failed." },
        }),
      }),
    },
    showToast: (message) => toasts.push(message),
  });

  await controller.check();
  assert.equal(element.style.display, "none", "optional midi2xml failure must not show a global warning");
  assert.equal(element.textContent, "");
  assert.deepEqual(toasts, []);
}

{
  const element = createElement();
  const controller = createToolStatusController({
    element,
    api: {
      checkConversionTools: async () => ({
        ok: true,
        tools: healthyTools({
          midi2abc: { ok: false, error: "Bundled midi2abc not found." },
        }),
      }),
    },
  });

  await controller.check();
  assert.equal(element.style.display, "");
  assert.equal(element.textContent, "Missing tools: midi2abc");
  assert.match(element.title, /Bundled midi2abc not found/);
}

console.log("tool status harness: all tests passed");
