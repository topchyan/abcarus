#!/usr/bin/env node
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const RENDERER_COMPOSITION_ROOT_MAX_LINES = 5000;
const RENDERER_MODULE_MAX_LINES = 2000;
const LEGACY_RENDERER_MODULE_MAX_LINES = new Map([
  ["src/renderer/transpose.mjs", 2568],
]);

async function collectRendererModules(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectRendererModules(fullPath));
    } else if (entry.isFile() && /\.(?:m?js)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function importBundledModule(filePath) {
  const result = await build({
    entryPoints: [resolve(filePath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const source = result.outputFiles[0].text;
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const rendererSource = await readFile("src/renderer/renderer.js", "utf8");
const rendererLines = rendererSource.split(/\r\n|\n|\r/).length;
assert.ok(
  rendererLines <= RENDERER_COMPOSITION_ROOT_MAX_LINES,
  `renderer.js exceeds the ${RENDERER_COMPOSITION_ROOT_MAX_LINES}-line composition-root ceiling: ${rendererLines}`,
);

const oversizedRendererModules = [];
for (const filePath of await collectRendererModules("src/renderer")) {
  if (resolve(filePath) === resolve("src/renderer/renderer.js")) continue;
  const source = await readFile(filePath, "utf8");
  const lines = source.split(/\r\n|\n|\r/).length;
  const projectPath = relative(".", filePath);
  const maxLines = LEGACY_RENDERER_MODULE_MAX_LINES.get(projectPath)
    || RENDERER_MODULE_MAX_LINES;
  if (lines > maxLines) {
    oversizedRendererModules.push(`${projectPath} (${lines} lines; max ${maxLines})`);
  }
}
assert.deepEqual(
  oversizedRendererModules,
  [],
  `renderer modules exceed their anti-monolith ceilings:\n${oversizedRendererModules.join("\n")}`,
);

for (const required of [
  /createEditorRuntime\s*\(/,
  /createRenderRuntime\s*\(/,
  /createPlaybackDomain\s*\(/,
  /createLibraryUiDomain\s*\(/,
  /createDisclaimerController\s*\(/,
]) {
  assert.match(rendererSource, required);
}

for (const forbidden of [
  /\blet\s+editorView\b/,
  /\blet\s+suppressDirty\b/,
  /\bcreateMainEditorFeature\s*\(/,
  /function\s+getPlaybackPayload\s*\(/,
  /function\s+startPlaybackFromRange\s*\(/,
  /function\s+getScopedPlaybackSettingsForOrigin\s*\(/,
  /playbackTransport\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/,
  /from\s+["']\.\/playback\/playback_state_model\.js["']/,
  /from\s+["']\.\/playback\/(?:ab_loop_runtime|ab_marker_extension|ab_selection_playback_controller|drum_preview_controller|focus_mode_controller|follow_highlight_settings|playback_autoscroll_controller|playback_follow_controller|playback_payload_controller|playback_player_controller|playback_prepare_controller|playback_start_controller|playback_transport_controller|playback_transport_state|selection_playback_runtime|soundfont_controller)\.js["']/,
  /\b(?:playbackTransport|selectionPlaybackRuntime|abLoopRuntime|soundfontController|focusModeController|playbackUiController)\b/,
  /createPlaybackDomain\s*\([^)]*\)[\s\S]*?\.attach\s*\(/,
  /function\s+findHeaderEndOffset\s*\(/,
  /function\s+splitFileIntoHeaderAndBody\s*\(/,
  /function\s+getTextIndexFromLoc\s*\(/,
  /function\s+ensureToolPanelDefaultLeftPosition\s*\(/,
  /function\s+showDisclaimerIfNeeded\s*\(/,
  /\blet\s+isNewTuneDraft\b/,
  /\blet\s+libraryIndex\b/,
  /\blet\s+isLibraryVisible\b/,
  /\blet\s+latestSettingsSnapshot\b/,
  /\blet\s+suppressRecentEntries\b/,
  /\blet\s+followPlayback\b/,
  /ViewPlugin\.fromClass\s*\(\s*class\s*\{[\s\S]*?getMarkerVersion/,
  /\bFOLLOW_PIPELINE_VERSION\b/,
  /function\s+computeFocusPlaybackPlanFromCurrentState\s*\(/,
  /function\s+normalizeFocusLoopBoundsForPlayback\s*\(/,
  /function\s+setFocusModeEnabled\s*\(/,
  /function\s+toggleFocusMode\s*\(/,
  /function\s+stopPlaybackFromGuard\s*\(/,
  /function\s+setSoundfont(?:Status|Caption)\s*\(/,
  /function\s+persistLoopSettingsPatch\s*\(/,
  /\brecordNavFilePath\b/,
  /\bnavFileHistory\b/,
  /function\s+clearErrorsFeatureState\s*\(/,
  /function\s+showErrorsVisible\s*\(/,
  /\bconst\s+(?:NEW_FILE_MINIMAL_ABC|TEMPLATE_ABC)\b/,
  /\b(?:intonationExplorerFeature|microtonalToolsFeature|intonationRendererBridge|perdeService)\b/,
  /function\s+isMicrotonalNotationSupported\s*\(/,
  /getElementById\s*\(\s*["']makamDna/,
  /from\s+["']\.\/tools\/(?:microtonal|intonation_explorer)\//,
  /from\s+["']\.\/microtonal\/perde_service\.js["']/,
]) {
  assert.doesNotMatch(rendererSource, forbidden);
}
assert.match(rendererSource, /playbackDomain\.initialize\s*\(/);

const defaultDocuments = await importBundledModule(
  "src/renderer/abc/default_documents.js",
);
assert.match(defaultDocuments.NEW_FILE_MINIMAL_ABC, /^X:1\nT:Untitled\nK:none\n$/);
assert.match(defaultDocuments.NEW_FILE_TEMPLATE_ABC, /^X:1\n/);
assert.match(defaultDocuments.NEW_FILE_TEMPLATE_ABC, /T:Humoresque Dance/);

const { createLibraryRuntimeStore } = await importBundledModule(
  "src/renderer/library/library_runtime_store.js",
);
const libraryRuntime = createLibraryRuntimeStore();
assert.equal(libraryRuntime.getIndex(), null);
assert.equal(libraryRuntime.isVisible(), true);
libraryRuntime.setIndex({ root: "/music", files: [{ path: "/music/a.abc" }] });
libraryRuntime.setVisible(false);
libraryRuntime.setRecentEntriesSuppressed(true);
assert.equal(libraryRuntime.getRoot(), "/music");
assert.equal(libraryRuntime.getFiles().length, 1);
assert.equal(libraryRuntime.isVisible(), false);
assert.equal(libraryRuntime.areRecentEntriesSuppressed(), true);

const { createSettingsSnapshotStore } = await importBundledModule(
  "src/renderer/app/ui/settings_snapshot_store.js",
);
const settingsUpdates = [];
const settingsSnapshot = createSettingsSnapshotStore({
  api: { updateSettings: async (patch) => settingsUpdates.push(patch) },
});
assert.equal(settingsSnapshot.get(), null);
settingsSnapshot.set({ followPlayback: true });
settingsSnapshot.patch({ payloadModeEnabled: false });
assert.deepEqual(settingsSnapshot.get(), {
  followPlayback: true,
  payloadModeEnabled: false,
});
await settingsSnapshot.persistPatch({ playbackLoopEnabled: true });
assert.deepEqual(settingsUpdates, [{ playbackLoopEnabled: true }]);

const { createStatusController } = await importBundledModule(
  "src/renderer/app/ui/status_controller.js",
);
const statusClasses = new Set();
const statusElement = {
  textContent: "",
  classList: {
    toggle(name, enabled) {
      if (enabled) statusClasses.add(name);
      else statusClasses.delete(name);
    },
  },
};
let statusDocument = { path: "/music/tunes.abc", dirty: false };
const statusController = createStatusController({
  statusElement,
  getCurrentDoc: () => statusDocument,
  getActiveTuneMeta: () => ({ path: statusDocument?.path || "" }),
});
statusController.markStartupSettingsApplied();
assert.equal(statusElement.textContent, "Saved");
assert.equal(statusClasses.has("status-saved"), true);
statusDocument.dirty = true;
statusController.renderUnifiedStatus();
assert.equal(statusElement.textContent, "Unsaved changes");
assert.equal(statusClasses.has("status-dirty"), true);
statusDocument = null;
statusController.setStatus("Ready");
assert.equal(statusElement.textContent, "Ready");

const headerModel = await importBundledModule(
  "src/renderer/app/document/file_header_model.js",
);
assert.equal(headerModel.findHeaderEndOffset("%%abc\n\nX:1\nK:C\n"), 7);
assert.deepEqual(
  headerModel.splitFileIntoHeaderAndBody("%%abc\n\nX:1\nK:C\n"),
  { headerText: "%%abc\n\n", bodyText: "X:1\nK:C\n" },
);
assert.equal(headerModel.countLinesForPrefix("a\nb\n"), 2);
assert.equal(headerModel.countLinesForPrefix(" \n "), 0);

const errorsModel = await importBundledModule(
  "src/renderer/editor/errors_model.js",
);
assert.equal(errorsModel.isMeasureCheckEnabledForText("M:4/4\nK:C\n"), true);
assert.equal(errorsModel.isMeasureCheckEnabledForText("M:none\nK:C\n"), false);
assert.equal(
  errorsModel.getClampedTextIndexFromLoc("abc\ndef", { line: 9, col: 9 }),
  7,
);

const { createDisclaimerController } = await importBundledModule(
  "src/renderer/app/ui/disclaimer_controller.js",
);
const classes = new Set();
const listeners = new Map();
const updates = [];
const modal = {
  classList: {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
  },
  setAttribute: () => {},
  addEventListener: (type, handler) => listeners.set(type, handler),
};
const confirmButton = {
  addEventListener: (type, handler) => listeners.set(`confirm:${type}`, handler),
};
const disclaimer = createDisclaimerController({
  modal,
  confirmButton,
  api: { updateSettings: async (patch) => updates.push(patch) },
});
disclaimer.wire();
assert.equal(disclaimer.showIfNeeded({ disclaimerSeen: false }), true);
assert.equal(disclaimer.showIfNeeded({ disclaimerSeen: false }), false);
assert.equal(classes.has("open"), true);
await disclaimer.dismiss();
assert.equal(classes.has("open"), false);
assert.deepEqual(updates, [{ disclaimerSeen: true }]);

console.log(`renderer boundaries harness: all tests passed (${rendererLines} lines)`);
