import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function assertSaveIntentGuards() {
  const rendererPath = "src/renderer/renderer.js";
  const src = await readFile(rendererPath, "utf8");
  const documentSessionPath = "src/renderer/app/document/document_session_controller.js";
  const documentSession = await readFile(documentSessionPath, "utf8").catch(() => "");
  const selectionPlaybackModelPath = "src/renderer/playback/selection_playback_model.js";
  const selectionPlaybackModel = await readFile(selectionPlaybackModelPath, "utf8").catch(() => "");
  const focusPlaybackModelPath = "src/renderer/playback/focus_playback_model.js";
  const focusPlaybackModel = await readFile(focusPlaybackModelPath, "utf8").catch(() => "");
  const focusModeControllerPath = "src/renderer/playback/focus_mode_controller.js";
  const focusModeController = await readFile(focusModeControllerPath, "utf8").catch(() => "");
  const selectionPlaybackRuntimePath = "src/renderer/playback/selection_playback_runtime.js";
  const selectionPlaybackRuntime = await readFile(selectionPlaybackRuntimePath, "utf8").catch(() => "");
  const playbackStartControllerPath = "src/renderer/playback/playback_start_controller.js";
  const playbackStartController = await readFile(playbackStartControllerPath, "utf8").catch(() => "");
  const playbackTransportControllerPath = "src/renderer/playback/playback_transport_controller.js";
  const playbackTransportController = await readFile(playbackTransportControllerPath, "utf8").catch(() => "");
  const abSelectionPlaybackControllerPath = "src/renderer/playback/ab_selection_playback_controller.js";
  const abSelectionPlaybackController = await readFile(abSelectionPlaybackControllerPath, "utf8").catch(() => "");
  const libraryLifecyclePath = "src/renderer/library/library_lifecycle_controller.js";
  const libraryLifecycle = await readFile(libraryLifecyclePath, "utf8").catch(() => "");
  const saveFlowPath = "src/renderer/app/document/save_flow_controller.js";
  const saveFlow = await readFile(saveFlowPath, "utf8").catch(() => "");
  const playbackUiPath = "src/renderer/app/ui/playback_ui_controller.js";
  const playbackUi = await readFile(playbackUiPath, "utf8").catch(() => "");
  const layoutControllerPath = "src/renderer/app/ui/layout_controller.js";
  const layoutController = await readFile(layoutControllerPath, "utf8").catch(() => "");
  const rawModeFeaturePath = "src/renderer/tools/raw_mode/raw_mode_feature.js";
  const rawModeFeature = await readFile(rawModeFeaturePath, "utf8").catch(() => "");
  const editorCommandsPath = "src/renderer/editor/editor_commands.js";
  const editorCommands = await readFile(editorCommandsPath, "utf8").catch(() => "");
  const fileContextPath = "src/renderer/app/document/file_context_controller.js";
  const fileContext = await readFile(fileContextPath, "utf8").catch(() => "");
  const libraryTreePath = "src/renderer/library/tree_view.js";
  const libraryTree = await readFile(libraryTreePath, "utf8").catch(() => "");
  const renderRuntimePath = "src/renderer/render/render_runtime.js";
  const renderRuntime = await readFile(renderRuntimePath, "utf8").catch(() => "");
  const scoreInteractionPath = "src/renderer/render/score_interaction_controller.js";
  const scoreInteraction = await readFile(scoreInteractionPath, "utf8").catch(() => "");

  if (!src.includes("const activeContext = createActiveTuneContextStore();")) {
    throw new Error("Renderer must construct the active tune context store.");
  }
  for (const legacyName of [
    "activeFilePath",
    "activeTuneId",
    "activeTuneUid",
    "activeTuneIndex",
    "activeTuneMeta",
  ]) {
    const declaration = new RegExp(`\\b(?:let|var)\\s+${legacyName}\\b`);
    if (declaration.test(src)) {
      throw new Error(`Active tune context must not return to renderer globals: ${legacyName}`);
    }
  }
  if (/activeContext\.(?:filePath|tuneId|tuneUid|tuneIndex|tuneMeta)\b/.test(src)) {
    throw new Error("Active tune context must be accessed through its explicit API.");
  }
  if (!src.includes("const renderRuntime = createRenderRuntime(")) {
    throw new Error("Renderer must construct the render runtime facade.");
  }
  if (
    src.includes('from "./render/render_payload_controller.js"')
    || src.includes('from "./render/render_pipeline_controller.js"')
    || src.includes('from "./render/render_payload_model.js"')
  ) {
    throw new Error("Renderer must access payload, pipeline, and offset mapping through render_runtime.");
  }
  for (const legacyRenderFunction of [
    "assertCleanAbcText",
    "centerRenderPaneOnCurrentAnchor",
    "getRenderCompatMap",
    "getLastRenderPayload",
    "getRenderPayload",
    "mapEditorOffsetToRenderIdx",
    "mapRenderIdxToEditorOffset",
    "normalizeAccThreeQuarterToneForAbc2svg",
    "scheduleRenderNow",
  ]) {
    const declaration = new RegExp(`\\bfunction\\s+${legacyRenderFunction}\\s*\\(`);
    if (declaration.test(src)) {
      throw new Error(`Render domain logic must not return to renderer.js: ${legacyRenderFunction}`);
    }
  }
  if (!renderRuntime.includes("function initializePipeline(") || !renderRuntime.includes("function getRenderCompatMap(")) {
    throw new Error("Render runtime must own pipeline initialization and offset compatibility mapping.");
  }
  if (
    !scoreInteraction.includes("function centerCurrentAnchor(")
    || !scoreInteraction.includes("function wireOutputSelection(")
    || !src.includes("scoreInteractionController.wireOutputSelection();")
  ) {
    throw new Error("Score interaction controller must own render centering and SVG selection wiring.");
  }

  if (!documentSession.includes("const SAVE_INTENT = Object.freeze(")) {
    throw new Error("Missing SAVE_INTENT model in document session controller.");
  }
  if (!src.includes("function resolveSaveIntent()") || !documentSession.includes("function resolveSaveIntent()")) {
    throw new Error("Missing resolveSaveIntent() document-session boundary.");
  }
  const saveOwner = saveFlow.includes("async function performSaveFlow()") ? saveFlow : src;
  const saveStart = saveOwner.indexOf("async function performSaveFlow()");
  const saveEnd = saveOwner.indexOf("async function performSaveAsFlow()", saveStart);
  if (saveStart < 0 || saveEnd < 0) throw new Error("Unable to isolate performSaveFlow().");
  const saveBody = saveOwner.slice(saveStart, saveEnd);
  if (!saveBody.includes("const session = resolveSaveIntent();")) {
    throw new Error("performSaveFlow() must route by resolveSaveIntent().");
  }
  if (!saveBody.includes("session.intent === SAVE_INTENT.APPEND_TO_FILE")) {
    throw new Error("performSaveFlow() must handle explicit append intent.");
  }
  if (
    !src.includes("function hasIntentionalSelectionPlaybackSpan(text, start, end)")
    && !selectionPlaybackModel.includes("function hasIntentionalSelectionPlaybackSpan(text, start, end)")
  ) {
    throw new Error("Missing selection intent gate helper.");
  }
  if (
    !src.includes("if (!hasIntentionalSelectionPlaybackSpan(text, start, end)) return false;")
    && !abSelectionPlaybackController.includes("!hasIntentionalSelectionPlaybackSpan(text, start, end)")
  ) {
    throw new Error("playSelectionOnce() must gate accidental selections.");
  }
  if (
    !src.includes("buildSelectionPlaybackToast(selectionSettings)")
    && !abSelectionPlaybackController.includes("buildSelectionPlaybackToast(selectionSettings)")
  ) {
    throw new Error("Selection playback must show active flags toast.");
  }
  if (
    !src.includes("function resolveMeasureStartRenderIdxSequential(measureIndex, n, { minBound, minStartRenderIdx } = {})")
    && !focusPlaybackModel.includes("function getFocusMeasureStartCandidates(byNumber, measureNumber)")
  ) {
    throw new Error("Missing measure resolver for focus loop bounds.");
  }
  if (!focusPlaybackModel.includes("function resolveFocusSegmentBarsByNumber(barMap, byNumber, from, to)")) {
    throw new Error("Missing Focus bar-number resolver for segment mode.");
  }
  if (!focusPlaybackModel.includes("byNumberRange = resolveFocusSegmentBarsByNumber(bars, byNumber, from, to);")) {
    throw new Error("Focus segment mode must resolve From/To via abc2svg bar numbering.");
  }
  if (
    !src.includes("const firstMeasureOffset = findMeasureStartOffsetByNumberInPrimaryVoice(tuneText, 1);")
    && !focusModeController.includes("const firstMeasureOffset = findMeasureStartOffsetByNumber(tuneText, 1);")
  ) {
    throw new Error("Focus plan must compute first measure fallback offset.");
  }
  if (!focusPlaybackModel.includes("mode === \"segment\"") || !focusPlaybackModel.includes("Number(state.fromMeasure) === 1")) {
    throw new Error("Focus segment mode must guard the From=1 fallback path.");
  }
  if (!focusPlaybackModel.includes("startOffset = firstMeasureOffset;")) {
    throw new Error("Focus segment mode must apply first-measure fallback start.");
  }
  for (const rendererTail of [
    "function updatePlaybackRangeFromSelection(",
    "function getEditorMeasureStartOffset(",
    "function getEditorPlayStartOffset(",
    "function getEditorSelectionSignature(",
    "function buildFocusBarIndexMap(",
    "function getVisibleFocusRenderRange(",
    "function getFocusPlaybackState(",
  ]) {
    if (src.includes(rendererTail)) {
      throw new Error(`Playback runtime tail must not remain in renderer: ${rendererTail}`);
    }
  }
  if (!playbackTransportController.includes("function updatePlaybackRangeFromSelection(")) {
    throw new Error("Playback transport controller must own editor selection range synchronization.");
  }
  if (!focusModeController.includes("function computePlaybackPlan()")) {
    throw new Error("Focus mode controller must own Focus playback plan assembly.");
  }
  if (src.includes("const result = playbackTransport.resetAfterGuardStop(message);")) {
    throw new Error("Playback guard-stop behavior must not remain in renderer.");
  }
  if (!playbackUi.includes("function handlePlaybackGuardStop(message)")) {
    throw new Error("Playback UI controller must own guard-stop UI reconciliation.");
  }
  if (!playbackUi.includes("function updateFollowToggle()")) {
    throw new Error("Playback UI controller must own Follow toggle rendering.");
  }
  if (!layoutController.includes("const getRenderZoomFactor = () => {")) {
    throw new Error("Layout controller must own render zoom resolution.");
  }
  if (src.includes("async function confirmRawModeLeave(")) {
    throw new Error("Raw mode dirty confirmation must not remain in renderer.");
  }
  if (!rawModeFeature.includes("async function confirmLeave(")) {
    throw new Error("Raw mode feature must own dirty exit confirmation.");
  }
  if (!editorCommands.includes("function scrollEditorToPos(")) {
    throw new Error("Shared editor commands must own editor position scrolling.");
  }
  if (src.includes("function selectTuneInRaw(")) {
    throw new Error("Renderer must not retain live Raw tune navigation.");
  }
  if (!fileContext.includes("tuneSelect.disabled = rawMode;")) {
    throw new Error("Tune dropdown must be disabled while Raw mode owns the full file.");
  }
  if (!libraryTree.includes('showToast("Raw mode: save or exit before selecting another tune."')) {
    throw new Error("Library tune selection must be guarded while Raw mode owns the full file.");
  }
  if (
    !src.includes("let playbackScopedOptions = null;")
    && !selectionPlaybackRuntime.includes("let scopedOptions = null;")
  ) {
    throw new Error("Missing scoped playback options state.");
  }
  if (
    !src.includes("rangeOrigin === \"selection\" || rangeOrigin === \"ab\" || rangeOrigin === \"focus\"")
    && !playbackStartController.includes("rangeOrigin === \"selection\" || rangeOrigin === \"ab\" || rangeOrigin === \"focus\"")
  ) {
    throw new Error("Range-origin routing for scoped playback options is missing.");
  }
  if (!src.includes("!scopedMode") && !playbackStartController.includes("!scopedMode")) {
    throw new Error("Playback reuse must be disabled for scoped (selection/ab/focus) modes.");
  }
  if (!libraryLifecycle.includes("const shouldForceReload = Boolean(entry && entry.forceReload);")) {
    throw new Error("openRecentFile() must support forceReload flag.");
  }
  if (!libraryLifecycle.includes("await refreshLibraryFile(targetPath, { force: true });")) {
    throw new Error("openRecentFile() must force-refresh library metadata on same-file reopen.");
  }

  if (!saveFlow.includes("async function performSimpleTuneSave(filePath")) {
    throw new Error("Save flow controller must own the simple tune save path.");
  }
  if (!saveBody.includes("const ok = await performSimpleTuneSave(activeTuneMeta.path")) {
    throw new Error("performSaveFlow() must use the simple full-file tune save path for active ABC tunes.");
  }
  const simpleSaveStart = saveFlow.indexOf("async function performSimpleTuneSave(filePath");
  const simpleSaveEnd = saveFlow.indexOf("async function performSaveFlow()", simpleSaveStart);
  if (simpleSaveStart < 0 || simpleSaveEnd < 0) throw new Error("Unable to isolate performSimpleTuneSave().");
  const simpleSaveBody = saveFlow.slice(simpleSaveStart, simpleSaveEnd);
  if (!simpleSaveBody.includes("activeTuneMeta.documentParts")) {
    throw new Error("performSimpleTuneSave() must use the loaded four-part tune document.");
  }
  if (!simpleSaveBody.includes("writeFile(p, nextText, {});")) {
    throw new Error("performSimpleTuneSave() must write the composed document without a stale expected-data guard.");
  }
  if (!simpleSaveBody.includes("const nextParts =")) {
    throw new Error("performSimpleTuneSave() must update the loaded four-part document after editing.");
  }

  const textTransformsSrc = await readFile("src/renderer/abc/text_transforms.js", "utf8");
  const textTransformsModule = { exports: {} };
  const textTransformsCode = textTransformsSrc.replace(
    /export\s+\{[\s\S]*?\};\s*$/,
    "module.exports = { ensureXNumberInAbc };",
  );
  new Function("module", "exports", textTransformsCode)(textTransformsModule, textTransformsModule.exports);
  const { ensureXNumberInAbc } = textTransformsModule.exports;

  const input = [
    "%Rude Mechanicals tune library: www.rudemex.co.uk",
    "%Chords and arrangements by the Rude Mechanicals unless otherwise acknowledged",
    "X:1",
    "T: Example",
    "K:C",
    "C2 C2 |",
  ].join("\n");
  const out = String(ensureXNumberInAbc(input, 16) || "");
  if (!out.startsWith("X:16\n%Rude Mechanicals tune library: www.rudemex.co.uk")) {
    throw new Error("ensureXNumberInAbc() must normalize pre-X banner lines.");
  }
  if (out.includes("\nX:1\n")) {
    throw new Error("ensureXNumberInAbc() must replace existing X line.");
  }
}

async function assertInlineToolbarIconsCompatibility() {
  const indexPath = "src/renderer/index.html";
  const stylePath = "src/renderer/style.css";
  const html = await readFile(indexPath, "utf8");
  const css = await readFile(stylePath, "utf8");

  if (!html.includes("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"0\" height=\"0\"")) {
    throw new Error("Missing inline SVG sprite in renderer HTML.");
  }
  if (!html.includes("<use href=\"#ui-library\"></use>")) {
    throw new Error("Toolbar icons must use inline sprite references.");
  }
  if (css.includes("background-image: url(\"../../assets/icons/ui/")) {
    throw new Error("Toolbar icons must not use external SVG files.");
  }
  if (!css.includes("stroke: currentColor;") || !css.includes("fill: none;")) {
    throw new Error(".btn-icon must use stroke/fill inline-SVG styling.");
  }

  const requiredSymbols = [
    "ui-settings",
    "ui-focus",
    "ui-split",
    "ui-alert",
    "ui-follow",
    "ui-globe",
    "ui-clear",
  ];
  for (const symbol of requiredSymbols) {
    if (!html.includes(`<symbol id="${symbol}"`)) {
      throw new Error(`Missing toolbar SVG symbol: ${symbol}`);
    }
  }
}

async function assertPlaybackPauseResumeUsesPausedOffset() {
  const bundled = await build({
    stdin: {
      contents: [
        "import { createPlaybackTransportController } from './src/renderer/playback/playback_transport_controller.js';",
        "export { createPlaybackTransportController };",
      ].join("\n"),
      resolveDir: ".",
      sourcefile: "playback-pause-resume-check.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    splitting: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  const load = new Function("module", "exports", bundled.outputFiles[0].text);
  load(module, module.exports);
  const { createPlaybackTransportController } = module.exports;
  if (typeof createPlaybackTransportController !== "function") {
    throw new Error("Unable to load playback transport controller.");
  }

  const calls = [];
  const transport = {
    isPlaying: false,
    isPaused: true,
    pausedSelectionSignature: "0:0",
    resumeStartIdx: 260,
    playbackIndexOffset: 100,
    playbackRange: { startOffset: 0, endOffset: null, origin: "cursor", loop: false },
    pendingPlaybackPlan: null,
    desiredPlayerSpeed: 1,
    cloneRange: (range) => ({ ...(range || {}) }),
    setRange: (range) => { transport.playbackRange = { ...(range || {}) }; },
  };
  const controller = createPlaybackTransportController({
    transport,
    getEditorView: () => ({ state: { doc: { length: 1000 }, selection: { main: { anchor: 0, head: 0 } } } }),
    getFocusModeEnabled: () => false,
    normalizeFocusLoopBoundsForPlayback: () => {},
    computeFocusPlaybackPlanFromCurrentState: () => ({ ok: false }),
    startPlaybackFromRange: async (range) => { calls.push(range); },
    startPlaybackAtIndex: async () => {},
    pausePlayback: () => {},
    playSelectionOnce: async () => false,
    setPracticeBarHighlight: () => {},
    clearSvgPracticeBarHighlight: () => {},
    playbackGuardError: () => {},
    stopPlaybackFromGuard: () => {},
    setStatus: () => {},
    updatePlayButton: () => {},
    clearNoteSelection: () => {},
    resetPlaybackUiState: () => {},
    setSoundfontCaption: () => {},
    showToast: () => {},
  });
  await controller.togglePlayPauseEffective();
  if (!calls.length || calls[0].startOffset !== 160) {
    throw new Error(`Paused Play must resume from converted paused offset 160, got ${calls[0] && calls[0].startOffset}.`);
  }

  calls.length = 0;
  transport.isPaused = true;
  transport.resumeStartIdx = 260;
  transport.playbackIndexOffset = 100;
  const focusController = createPlaybackTransportController({
    transport,
    getEditorView: () => ({ state: { doc: { length: 1000 }, selection: { main: { anchor: 0, head: 0 } } } }),
    getFocusModeEnabled: () => true,
    normalizeFocusLoopBoundsForPlayback: () => {},
    computeFocusPlaybackPlanFromCurrentState: () => ({
      ok: true,
      plan: { startOffset: 0, endOffset: null, loop: false },
    }),
    startPlaybackFromRange: async (range) => { calls.push(range); },
    startPlaybackAtIndex: async () => {},
    pausePlayback: () => {},
    playSelectionOnce: async () => false,
    setPracticeBarHighlight: () => {},
    clearSvgPracticeBarHighlight: () => {},
    playbackGuardError: () => {},
    stopPlaybackFromGuard: () => {},
    setStatus: () => {},
    updatePlayButton: () => {},
    clearNoteSelection: () => {},
    resetPlaybackUiState: () => {},
    setSoundfontCaption: () => {},
    showToast: () => {},
  });
  await focusController.togglePlayPauseEffective();
  if (!calls.length || calls[0].startOffset !== 160 || calls[0].origin !== "focus") {
    throw new Error(`Paused Focus Play must resume from offset 160 with open range end, got ${JSON.stringify(calls[0] || null)}.`);
  }

  calls.length = 0;
  transport.isPlaying = false;
  transport.isPaused = false;
  transport.waitingForFirstNote = false;
  transport.transportJumpHighlightActive = true;
  transport.transportPlayheadOffset = 240;
  const focusJumpController = createPlaybackTransportController({
    transport,
    getEditorView: () => ({ state: { doc: { length: 1000 }, selection: { main: { anchor: 0, head: 0 } } } }),
    getFocusModeEnabled: () => true,
    normalizeFocusLoopBoundsForPlayback: () => {},
    computeFocusPlaybackPlanFromCurrentState: () => ({
      ok: true,
      plan: { startOffset: 10, endOffset: 500, loop: false },
    }),
    startPlaybackFromRange: async (range) => { calls.push(range); },
    startPlaybackAtIndex: async () => {},
    pausePlayback: () => {},
    playSelectionOnce: async () => false,
    setPracticeBarHighlight: () => {},
    clearSvgPracticeBarHighlight: () => {},
    playbackGuardError: () => {},
    stopPlaybackFromGuard: () => {},
    setStatus: () => {},
    updatePlayButton: () => {},
    clearNoteSelection: () => {},
    resetPlaybackUiState: () => {},
    setSoundfontCaption: () => {},
    showToast: () => {},
  });
  await focusJumpController.transportPlay();
  if (!calls.length || calls[0].startOffset !== 240 || calls[0].origin !== "focus") {
    throw new Error(`Focus Play after measure jump must start at highlighted offset 240, got ${JSON.stringify(calls[0] || null)}.`);
  }

  calls.length = 0;
  transport.transportJumpHighlightActive = false;
  transport.transportPlayheadOffset = 240;
  await focusJumpController.transportPlay();
  if (!calls.length || calls[0].startOffset !== 10 || calls[0].origin !== "focus") {
    throw new Error(`Focus Play without active measure jump must start at focus plan offset 10, got ${JSON.stringify(calls[0] || null)}.`);
  }
}

async function assertAlignBarsDoesNotCrossSectionFields() {
  const barMetricsSrc = await readFile("src/renderer/abc/bar_metrics.js", "utf8");
  const alignBarsSrc = await readFile("src/renderer/abc/align_bars.js", "utf8");

  const metricsModule = { exports: {} };
  const metricsHelpers = barMetricsSrc.replace(
    /export\s+\{[\s\S]*?\};\s*$/,
    "module.exports = { BAR_SEP_NO_SPACE, getDefaultLen, getMetre, isLikelyAnacrusis, splitLineIntoParts };",
  );
  new Function("module", "exports", metricsHelpers)(metricsModule, metricsModule.exports);
  const {
    BAR_SEP_NO_SPACE,
    getDefaultLen,
    getMetre,
    isLikelyAnacrusis,
    splitLineIntoParts,
  } = metricsModule.exports;

  const module = { exports: {} };
  const helpers = alignBarsSrc
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+"\.\/bar_metrics\.js";\s*/, "")
    .replace(
      /export\s+\{[\s\S]*?\};\s*$/,
      "module.exports = { alignBarsInText, getBarSeparatorColumns };",
    );
  const load = new Function(
    "module",
    "exports",
    "BAR_SEP_NO_SPACE",
    "getDefaultLen",
    "getMetre",
    "isLikelyAnacrusis",
    "splitLineIntoParts",
    helpers,
  );
  load(
    module,
    module.exports,
    BAR_SEP_NO_SPACE,
    getDefaultLen,
    getMetre,
    isLikelyAnacrusis,
    splitLineIntoParts,
  );
  const { alignBarsInText, getBarSeparatorColumns } = module.exports;
  if (typeof alignBarsInText !== "function") throw new Error("alignBarsInText() is unavailable.");
  if (typeof getBarSeparatorColumns !== "function") throw new Error("getBarSeparatorColumns() is unavailable.");

  const input = [
    "X:1",
    "M:10/8",
    "L:1/16",
    "K:C",
    "[P:A] A4 G2A2 GA Bcde d4Bc |",
    "d4 e2 d2 cB A2 Bd c4 z2 |",
    "[P:E]",
    "[L:1/8]",
    "[M:6/4]",
    "Ec/B/A A^GA (B/d/)(c/B/)(A/B/) ^GFE |",
    "zBd d>cB de{/g}f e3 |",
  ].join("\n");

  const out = alignBarsInText(input);
  const lines = String(out || "").split(/\r\n|\n|\r/);
  const aLine = lines.find((line) => line.includes("[P:A]"));
  const eLine = lines.find((line) => line.startsWith("Ec/B/A"));
  if (!aLine || !eLine) throw new Error("Align Bars regression fixture did not produce expected lines.");
  if (/^\s/.test(aLine)) {
    throw new Error("Align Bars inserted a leading empty column before the first section.");
  }
  if (/^\s/.test(eLine)) {
    throw new Error("Align Bars inserted a leading empty column after inline M:/L: section fields.");
  }

  const lyricInterleaved = [
    "X:2",
    "M:6/8",
    "L:1/16",
    "K:G",
    "z6 z (B,C^DEF) | Gz2<(!>!A2G) (ABAGFE) |",
    "w:",
    "^DzEDC2 E6 | E2^D2C2 D2 TE4 |",
    "w: lyric | text",
    "z4 (E^D) E2 F4 | (FG) (F/2G/2F/2E/2-)E2 F6- |",
  ].join("\n");
  const lyricOut = alignBarsInText(lyricInterleaved);
  if (lyricOut === lyricInterleaved) {
    throw new Error("Align Bars did not align music lines separated by w: lyric lines.");
  }
  const lyricLines = String(lyricOut || "").split(/\r\n|\n|\r/);
  const lyricMusicLine = lyricLines.find((line) => line.startsWith("^DzEDC2"));
  const alignedLyricLine = lyricLines.find((line) => line.startsWith("w: lyric"));
  if (!/^w:\s*$/m.test(lyricOut) || !lyricMusicLine || !alignedLyricLine) {
    throw new Error("Align Bars lost w: lyric lines while aligning interleaved music.");
  }
  if (lyricMusicLine.indexOf("|") !== alignedLyricLine.indexOf("|")) {
    throw new Error("Align Bars did not align compatible w: separators to the preceding music line.");
  }

  const lyricLeadingRepeat = [
    "X:3",
    "M:2/4",
    "L:1/4",
    "K:C",
    "|: C D E F G A B c | d e f g a b c d |",
    "w:first words | second words |",
  ].join("\n");
  const leadingRepeatOut = alignBarsInText(lyricLeadingRepeat);
  const leadingRepeatLines = String(leadingRepeatOut || "").split(/\r\n|\n|\r/);
  const leadingRepeatMusic = leadingRepeatLines.find((line) => line.includes("|: C"));
  const leadingRepeatLyric = leadingRepeatLines.find((line) => line.startsWith("w:first"));
  if (!leadingRepeatMusic || !leadingRepeatLyric) {
    throw new Error("Align Bars lost leading-repeat lyric regression lines.");
  }
  const musicSepCols = getBarSeparatorColumns(leadingRepeatMusic);
  const lyricSepCols = getBarSeparatorColumns(leadingRepeatLyric);
  if (musicSepCols.length !== 3 || lyricSepCols.length !== 2) {
    throw new Error("Align Bars leading-repeat lyric regression fixture has unexpected separator counts.");
  }
  if (lyricSepCols[0] !== musicSepCols[1] || lyricSepCols[1] !== musicSepCols[2]) {
    throw new Error("Align Bars did not skip the leading repeat separator when aligning w: separators.");
  }
}

async function assertBareContinuationDirectiveHighlight() {
  const decorationsPath = "src/renderer/editor/abc_decorations.js";
  const src = await readFile(decorationsPath, "utf8");
  const markerStart = src.indexOf("// Field/directive continuation marker");
  const markerEnd = src.indexOf("if (text.trim().length)", markerStart);
  if (markerStart < 0 || markerEnd < 0) {
    throw new Error("Unable to isolate bare +: highlighting block.");
  }
  const block = src.slice(markerStart, markerEnd);
  if (!block.includes('/^\\s*\\+:\\s*/.test(text)')) {
    throw new Error("Bare +: continuation lines must be recognized by the ABC highlighter.");
  }
  if (!block.includes('lastNonEmptyKind === "directive" ? "cm-abc-directive" : "cm-abc-header"')) {
    throw new Error("Bare +: continuation lines must inherit directive/header styling from the previous info field.");
  }
  if (block.includes('lastNonEmptyKind = "directive"')) {
    throw new Error("Bare +: continuation lines must not force following continuations into directive styling.");
  }
}

async function assertDirectiveErrorsDoNotGetMeasureStats() {
  const measureStatsPath = "src/renderer/abc/measure_stats.js";
  const src = await readFile(measureStatsPath, "utf8");
  const start = src.indexOf("function shouldComputeMeasureStatsAt(editorText, anchorOffset)");
  const end = src.indexOf("function computeMeasureStatsAt", start);
  if (start < 0 || end < 0) throw new Error("Unable to isolate measure-stats eligibility helper.");

  const module = { exports: {} };
  const load = new Function("module", "exports", `${src.slice(start, end)}\nmodule.exports = { shouldComputeMeasureStatsAt };\n`);
  load(module, module.exports);
  const { shouldComputeMeasureStatsAt } = module.exports;
  if (typeof shouldComputeMeasureStatsAt !== "function") {
    throw new Error("shouldComputeMeasureStatsAt() is unavailable.");
  }

  const input = [
    "X:27",
    "T:Some Saz Semai",
    "M:10/8",
    "L:1/16",
    "K:Am",
    "V:1",
    "%%MIDI drum d2dd2d2d2d",
    "%%MIDI drum +: 64 62 62 64 62 62",
    "C2D2E2F2G2 |",
  ].join("\n");
  const directiveOffset = input.indexOf("%%MIDI drum +:");
  const musicOffset = input.indexOf("C2D2");
  if (shouldComputeMeasureStatsAt(input, directiveOffset)) {
    throw new Error("Directive errors must not get synthetic Beats measure stats.");
  }
  if (!shouldComputeMeasureStatsAt(input, musicOffset)) {
    throw new Error("Music-line errors must still be eligible for Beats measure stats.");
  }
}

async function assertSepIsPrestrippedForRender() {
  const rendererPath = "src/renderer/renderer.js";
  const src = await readFile(rendererPath, "utf8");
  const renderPipelinePath = "src/renderer/render/render_pipeline_controller.js";
  const renderPipelineSrc = await readFile(renderPipelinePath, "utf8");
  const markupRenderPath = "src/renderer/render/abc_to_svg_markup.js";
  const markupRenderSrc = await readFile(markupRenderPath, "utf8");
  const renderPayloadModelPath = "src/renderer/render/render_payload_model.js";
  const modelSrc = await readFile(renderPayloadModelPath, "utf8");
  const start = modelSrc.indexOf("export function stripSepForRender(text)");
  const end = modelSrc.length;
  if (start < 0 || end < 0) throw new Error("Unable to isolate %%sep render helper.");

  const module = { exports: {} };
  const helperSrc = modelSrc.slice(start, end).replace(/export\s+function\s+stripSepForRender/, "function stripSepForRender");
  const load = new Function("module", "exports", `${helperSrc}\nmodule.exports = { stripSepForRender };\n`);
  load(module, module.exports);
  const { stripSepForRender } = module.exports;
  const input = "X:1\nK:C\nC |]\n%%sep 20 20 100\nW:words\n";
  const out = stripSepForRender(input);
  if (!out || !out.replaced) throw new Error("stripSepForRender() must detect %%sep lines.");
  if (out.text.length !== input.length) throw new Error("stripSepForRender() must preserve source length.");
  if (/^%%sep/m.test(out.text)) throw new Error("stripSepForRender() must neutralize %%sep before rendering.");

  const prestripCount = (`${src}\n${renderPipelineSrc}\n${markupRenderSrc}`.match(/const sepStripInitial = stripSepForRender/g) || []).length;
  if (prestripCount < 2) {
    throw new Error("Live and print render paths must pre-strip %%sep before calling abc2svg.");
  }
}

async function assertPrintSuggestedBaseNameIncludesKey() {
  const bundled = await build({
    stdin: {
      contents: [
        "import { buildSuggestedTuneBaseName } from './src/renderer/print/print_helpers.js';",
        "export { buildSuggestedTuneBaseName };",
      ].join("\n"),
      resolveDir: ".",
      sourcefile: "print-filename-check.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    splitting: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  const load = new Function("module", "exports", bundled.outputFiles[0].text);
  load(module, module.exports);
  const { buildSuggestedTuneBaseName } = module.exports;
  if (typeof buildSuggestedTuneBaseName !== "function") {
    throw new Error("Unable to load print suggested filename helper.");
  }
  const textWithKey = [
    "X:1",
    "T:Զով Գիշեր Է",
    "T:Zov Gisher E",
    "C:Komitas",
    "M:6/8",
    "K:Gmaj",
    "GABc |]",
  ].join("\n");
  if (buildSuggestedTuneBaseName({ editorText: textWithKey }) !== "Zov Gisher E - Komitas") {
    throw new Error("Default suggested filename should keep title/composer without key.");
  }
  if (buildSuggestedTuneBaseName({ editorText: textWithKey, includeKey: true }) !== "Zov Gisher E - Komitas - Gmaj") {
    throw new Error("Print/PDF suggested filename should include title, composer, and key.");
  }
  if (buildSuggestedTuneBaseName({ editorText: "X:2\nT:Untitled Keyless\nK:none\nCDEF |]\n", includeKey: true }) !== "Untitled Keyless") {
    throw new Error("Print/PDF suggested filename must omit K:none.");
  }
}

async function assertPrintSvgFragmentsAreNamespaced() {
  const mainSrc = await readFile("src/main/index.js", "utf8");
  if (!mainSrc.includes("function namespaceSvgFragmentIds()")) {
    throw new Error("Print HTML must namespace repeated SVG fragment ids.");
  }
  const namespacePos = mainSrc.indexOf("namespaceSvgFragmentIds();");
  const normalizePos = mainSrc.indexOf("normalizeSvgBounds();", namespacePos);
  if (namespacePos < 0 || normalizePos < 0 || namespacePos > normalizePos) {
    throw new Error("SVG fragment ids must be isolated before print bounds normalization.");
  }
  if (!mainSrc.includes('svg.querySelectorAll("[id]")')) {
    throw new Error("Print SVG namespace pass must rename SVG definition ids.");
  }
  if (!mainSrc.includes('attribute.name === "id"')) {
    throw new Error("Print SVG namespace pass must preserve renamed id attributes.");
  }
}

async function assertAbc2svgFontHeaderUrls() {
  const bundled = await build({
    entryPoints: ["src/renderer/render/header_layers_controller.js"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
  const module = { exports: {} };
  const load = new Function("module", "exports", bundled.outputFiles[0].text);
  load(module, module.exports);
  const { createHeaderLayersController } = module.exports;
  if (typeof createHeaderLayersController !== "function") {
    throw new Error("Unable to load header layers controller for font smoke.");
  }
  const controller = createHeaderLayersController({
    api: { pathJoin: (a, b) => `${String(a || "").replace(/[\\/]+$/, "")}/${String(b || "")}` },
    isMeasureCheckEnabled: () => false,
  });
  controller.setFromSettings({
    abc2svgNotationFontFile: "bundled:Leland.otf",
    abc2svgTextFontFile: "bundled:LelandText.otf",
  });
  const tune = "X:1\nT:Font Test\nM:4/4\nL:1/4\nK:C\nC D E F |]\n";
  const prefix = controller.buildHeaderPrefix("", false, tune);
  const text = `${prefix.text || ""}${tune}`;

  if (text.includes('url("') || text.includes("url('")) {
    throw new Error("abc2svg font URLs must be unquoted; quoted url(...) breaks custom music fonts.");
  }
  if (!text.includes("%%musicfont url(../../assets/fonts/notation/Leland.otf) 24")) {
    throw new Error("Missing bundled Leland musicfont header.");
  }
  if (!text.includes("%%titlefont url(../../assets/fonts/notation/LelandText.otf) *")) {
    throw new Error("Missing bundled Leland text font header.");
  }

  const abc2svgSource = await readFile("third_party/abc2svg/abc2svg-1.js", "utf8");
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(abc2svgSource, sandbox, { filename: "abc2svg-1.js" });
  const parts = [];
  const errors = [];
  const AbcCtor = sandbox.abc2svg && sandbox.abc2svg.Abc;
  if (typeof AbcCtor !== "function") throw new Error("abc2svg constructor unavailable for font header smoke.");
  const abc = new AbcCtor({
    img_out: (s) => parts.push(s),
    err: (msg) => errors.push(String(msg || "")),
    errmsg: (msg, line, col) => errors.push(`${line}:${col}:${msg}`),
  });
  abc.tosvg("out", text);
  const svg = parts.join("");
  if (errors.length) throw new Error(`abc2svg font header smoke produced errors: ${errors.join("; ")}`);
  const fontFaces = [...svg.matchAll(/@font-face\s*\{[^}]*font-family:([^;\s]+)[^}]*src:url\(([^)]+)\)[^}]*\}/g)];
  const hasNotationFont = fontFaces.some(([, , url]) => /(?:^|\/)Leland\.otf$/.test(String(url || "")));
  const hasTextFont = fontFaces.some(([, , url]) => /(?:^|\/)LelandText\.otf$/.test(String(url || "")));
  if (!hasNotationFont || !hasTextFont) {
    throw new Error("abc2svg output did not include selected Leland font URLs.");
  }
}

async function assertHeaderDirectivesArePreserved() {
  const bundled = await build({
    entryPoints: ["src/renderer/abc/header_prefix_model.js"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
  const module = { exports: {} };
  const load = new Function("module", "exports", bundled.outputFiles[0].text);
  load(module, module.exports);
  const { sanitizeFileHeaderForInteractiveRender, sanitizeFileHeaderForPerTuneRender } = module.exports;
  const source = [
    "%%titleformat TT,<R<Q<P>C>C",
    "%%leftmargin .5cm",
    "%%rightmargin .5cm",
    "%%MIDI temperamentequal 53",
    "%%begintext",
    "Preview and print note",
    "%%endtext",
    "% comment",
    "unexpected plain text",
  ].join("\n");
  for (const sanitize of [sanitizeFileHeaderForInteractiveRender, sanitizeFileHeaderForPerTuneRender]) {
    const result = sanitize(source);
    for (const expected of [
      "%%titleformat TT,<R<Q<P>C>C",
      "%%leftmargin .5cm",
      "%%rightmargin .5cm",
      "%%MIDI temperamentequal 53",
      "%%begintext",
      "Preview and print note",
      "%%endtext",
    ]) {
      if (!result.includes(expected)) throw new Error(`Header sanitizer dropped valid directive or text: ${expected}`);
    }
    if (result.includes("unexpected plain text")) {
      throw new Error("Header sanitizer accepted non-ABC text outside a text block.");
    }
  }
}

async function assertSettingsPanelStructure() {
  const source = await readFile("src/renderer/settings.js", "utf8");
  for (const label of [
    "Editor & Notation",
    "Library",
    "Print",
    "Import & Export",
    "Microtonal",
    "Diagnostics & Advanced",
  ]) {
    if (!source.includes(`label: "${label}"`)) {
      throw new Error(`Settings UI is missing the ${label} panel.`);
    }
  }
  if (!source.includes("stripImportedMeasureComments") || !source.includes("autoFormatImportedAbc")) {
    throw new Error("Settings UI must expose imported ABC cleanup and formatting controls.");
  }
  if (!source.includes('{ key: "importexport", label: "Import & Export"')) {
    throw new Error("Import & Export must use the normalized lowercase panel key.");
  }
  if (!source.includes('if (key === "options") return "general";')) {
    throw new Error("Legacy Options tab state must migrate to a valid Settings panel.");
  }
}

async function assertIntonationTonalBaseUses53Map() {
  const bundled = await build({
    stdin: {
      contents: [
        "import { resolveTonalBaseInput } from './src/renderer/tools/intonation_explorer/intonation_model.js';",
        "import { baseId53ForNaturalLetter } from './src/renderer/transpose.mjs';",
        "export { resolveTonalBaseInput, baseId53ForNaturalLetter };",
      ].join("\n"),
      resolveDir: ".",
      sourcefile: "intonation-tonal-base-check.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    splitting: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  const load = new Function("module", "exports", bundled.outputFiles[0].text);
  load(module, module.exports);
  const { baseId53ForNaturalLetter, resolveTonalBaseInput } = module.exports;
  if (typeof baseId53ForNaturalLetter !== "function" || typeof resolveTonalBaseInput !== "function") {
    throw new Error("Unable to load intonation tonal base helpers.");
  }
  for (const letter of ["C", "D", "E", "F", "G", "A", "B"]) {
    const resolved = resolveTonalBaseInput(letter);
    const expected = baseId53ForNaturalLetter(letter);
    if (!resolved || !resolved.ok || resolved.base !== expected) {
      throw new Error(`Tonal base ${letter} must use the 53-EDO natural-letter map (${expected}), got ${resolved && resolved.base}.`);
    }
  }
}

async function assertIntonationPinnedCandidates() {
  const bundled = await build({
    stdin: {
      contents: [
        "import { suggestMakamCandidates } from './src/renderer/makam_suggestion.mjs';",
        "export { suggestMakamCandidates };",
      ].join("\n"),
      resolveDir: ".",
      sourcefile: "intonation-candidates-check.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    splitting: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  const load = new Function("module", "exports", bundled.outputFiles[0].text);
  load(module, module.exports);
  const { suggestMakamCandidates } = module.exports;
  if (typeof suggestMakamCandidates !== "function") {
    throw new Error("Unable to load makam candidate helper.");
  }

  const candidates = suggestMakamCandidates({
    makamEntries: [
      { makam: "Beyati", durak: "A", guclu: "A", yeden: "A" },
      { makam: "Uşşak", durak: "A" },
    ],
    noteEvents: [
      { pc53: 0, abs53: 53, durationWeight: 1 },
      { pc53: 0, abs53: 53, durationWeight: 1 },
      { pc53: 0, abs53: 53, durationWeight: 1 },
      { pc53: 0, abs53: 53, durationWeight: 1 },
    ],
    resolvePerdePc53: (name) => (name === "A" ? [0] : []),
    maxCandidates: 1,
    pinnedMakamNames: ["Uşşak"],
  });
  if (candidates.length !== 2 || candidates[0].makam !== "Beyati") {
    throw new Error("Intonation candidates smoke must keep top scoring makam first.");
  }
  const pinned = candidates.find((candidate) => candidate && candidate.makam === "Uşşak");
  if (!pinned || pinned.pinned !== true) {
    throw new Error("Selected/overlay makam must remain visible when it falls outside the candidate limit.");
  }
}

async function main() {
  const res = await build({
    entryPoints: ["src/renderer/renderer.js"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    logLevel: "silent",
  });

  if (!res || !Array.isArray(res.outputFiles) || res.outputFiles.length === 0) {
    throw new Error("Renderer build produced no output.");
  }

  await assertSaveIntentGuards();
  await assertInlineToolbarIconsCompatibility();
  await assertPlaybackPauseResumeUsesPausedOffset();
  await assertAlignBarsDoesNotCrossSectionFields();
  await assertBareContinuationDirectiveHighlight();
  await assertDirectiveErrorsDoNotGetMeasureStats();
  await assertSepIsPrestrippedForRender();
  await assertPrintSuggestedBaseNameIncludesKey();
  await assertPrintSvgFragmentsAreNamespaced();
  await assertAbc2svgFontHeaderUrls();
  await assertHeaderDirectivesArePreserved();
  await assertSettingsPanelStructure();
  await assertIntonationTonalBaseUses53Map();
  await assertIntonationPinnedCandidates();
}

main().catch((err) => {
  process.stderr.write(`Renderer build check failed: ${err?.stack || err}\n`);
  process.exitCode = 1;
});
