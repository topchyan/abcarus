import {
  buildHeaderPrefixFromLayers,
  buildHeaderPrefixWithLayerSpansFromLayers,
  normalizeHeaderLayer,
} from "../abc/header_prefix_model.js";

const INTERACTIVE_SCORE_LAYOUT = "%%leftmargin 0.5cm\n%%rightmargin 0.5cm";

function sanitizeFontAssetName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(bundled|user):(.*)$/);
  if (m) {
    const origin = m[1];
    let fileName = String(m[2] || "").trim();
    const nested = fileName.match(/^(bundled|user):(.*)$/);
    if (nested) fileName = String(nested[2] || "").trim();
    if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return "";
    if (/[\x00-\x1f]/.test(fileName)) return "";
    if (!/^[^/\\]+\.(otf|ttf|woff2?)$/i.test(fileName)) return "";
    return `${origin}:${fileName}`;
  }
  if (/^[^/\\]+\.(otf|ttf|woff2?)$/i.test(raw)) return `bundled:${raw}`;
  return "";
}

function filePathToFileUrl(filePath) {
  const raw = String(filePath || "");
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  return prefix + encodeURI(normalized);
}

function createHeaderLayersController({
  api,
  elements = {},
  readFile = async () => ({ ok: false }),
  getActiveFilePath = () => "",
  isMeasureCheckEnabled = () => false,
  scheduleRender = () => {},
  setButtonText = () => {},
} = {}) {
  let globalHeaderEnabled = true;
  let globalHeaderLocalText = "";
  let globalHeaderUserText = "";
  let globalHeaderGlobalText = "";
  let abc2svgNotationFontFile = "";
  let abc2svgTextFontFile = "";
  let fontDirs = { bundledDir: "", userDir: "" };

  function getSettingsSignature() {
    return `${globalHeaderEnabled}|${abc2svgNotationFontFile}|${abc2svgTextFontFile}`;
  }

  function isGlobalHeaderEnabled() {
    return globalHeaderEnabled;
  }

  function setFromSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    globalHeaderEnabled = settings.globalHeaderEnabled !== false;
    abc2svgNotationFontFile = sanitizeFontAssetName(settings.abc2svgNotationFontFile);
    abc2svgTextFontFile = sanitizeFontAssetName(settings.abc2svgTextFontFile);
  }

  function setFontDirs(nextDirs) {
    if (!nextDirs || typeof nextDirs !== "object") return;
    fontDirs = {
      bundledDir: String(nextDirs.bundledDir || ""),
      userDir: String(nextDirs.userDir || ""),
    };
  }

  function buildUserFontUrl(origin, fileName) {
    if (origin === "bundled") {
      return `../../assets/fonts/notation/${encodeURIComponent(String(fileName || "")).replace(/%2F/gi, "")}`;
    }
    if (!fontDirs || !fontDirs.userDir) return "";
    const joined = api && typeof api.pathJoin === "function"
      ? api.pathJoin(fontDirs.userDir, fileName)
      : `${fontDirs.userDir}/${fileName}`;
    return filePathToFileUrl(joined);
  }

  function buildAbc2svgFontHeaderLayer() {
    const lines = [];
    const comment = "% ABCarus: font overrides (auto)";

    if (abc2svgNotationFontFile) {
      const m = abc2svgNotationFontFile.match(/^(bundled|user):(.*)$/);
      if (m) {
        const url = buildUserFontUrl(m[1], m[2]);
        if (url) lines.push(`%%musicfont url(${url}) 24`);
      }
    }

    if (abc2svgTextFontFile) {
      const m = abc2svgTextFontFile.match(/^(bundled|user):(.*)$/);
      const url = m ? buildUserFontUrl(m[1], m[2]) : "";
      if (url) {
        const directives = [
          "annotationfont",
          "footerfont",
          "headerfont",
          "historyfont",
          "infofont",
          "titlefont",
          "subtitlefont",
          "composerfont",
          "partsfont",
          "textfont",
          "gchordfont",
          "tempofont",
          "tupletfont",
          "voicefont",
          "vocalfont",
          "wordsfont",
          "measurefont",
          "repeatfont",
        ];
        for (const d of directives) lines.push(`%%${d} url(${url}) *`);
      }
    }

    if (!lines.length) return "";
    return `${comment}\n${lines.join("\n")}`;
  }

  function updateToggle() {
    const button = elements.toggleButton;
    if (!button) return;
    button.classList.toggle("toggle-active", globalHeaderEnabled);
    setButtonText(button, "Globals");
    button.setAttribute("aria-pressed", globalHeaderEnabled ? "true" : "false");
  }

  async function loadHeaderLayer(path) {
    if (!path) return "";
    try {
      const res = await readFile(path);
      if (!res || !res.ok) return "";
      return normalizeHeaderLayer(res.data);
    } catch {
      return "";
    }
  }

  async function refreshHeaderLayers() {
    const prev = `${globalHeaderGlobalText}|${globalHeaderLocalText}|${globalHeaderUserText}`;
    let globalPath = "";
    let userPath = "";
    if (api && typeof api.getSettingsPaths === "function") {
      try {
        const res = await api.getSettingsPaths();
        globalPath = res && res.globalPath ? res.globalPath : "";
        userPath = res && res.userPath ? res.userPath : "";
      } catch {}
    }
    let localPath = "";
    const activeFilePath = String(getActiveFilePath() || "");
    if (activeFilePath && api && typeof api.pathDirname === "function") {
      const dir = api.pathDirname(activeFilePath);
      if (api.pathJoin) {
        localPath = api.pathJoin(dir, "local_settings.abc");
      } else if (dir) {
        localPath = dir.endsWith("/") || dir.endsWith("\\") ? `${dir}local_settings.abc` : `${dir}/local_settings.abc`;
      }
    }
    const [globalText, localText, userText] = await Promise.all([
      loadHeaderLayer(globalPath),
      loadHeaderLayer(localPath),
      loadHeaderLayer(userPath),
    ]);
    globalHeaderGlobalText = globalText;
    globalHeaderLocalText = localText;
    globalHeaderUserText = userText;
    const next = `${globalHeaderGlobalText}|${globalHeaderLocalText}|${globalHeaderUserText}`;
    if (next !== prev) scheduleRender();
  }

  function collectLayers(entryHeader, { withKinds = false, includeRuntimeFonts = true } = {}) {
    const layers = [];
    const push = (kind, text) => {
      const normalized = normalizeHeaderLayer(text);
      if (!normalized) return;
      layers.push(withKinds ? { kind, text: normalized } : normalized);
    };
    if (globalHeaderEnabled) {
      push("abcarus", globalHeaderGlobalText);
      push("abcarus", globalHeaderLocalText);
      push("abcarus", globalHeaderUserText);
    }
    if (includeRuntimeFonts) {
      const fontLayerRaw = buildAbc2svgFontHeaderLayer();
      if (fontLayerRaw) layers.push(withKinds ? { kind: "abcarus", text: fontLayerRaw } : fontLayerRaw);
    }
    const fileHeaderRaw = String(entryHeader || "");
    if (fileHeaderRaw.trim()) {
      const text = fileHeaderRaw.replace(/[\r\n]+$/, "");
      layers.push(withKinds ? { kind: "fileHeader", text } : text);
    }
    return layers;
  }

  function buildHeaderPrefix(entryHeader, includeCheckbars, tuneText) {
    return buildHeaderPrefixFromLayers({
      layers: collectLayers(entryHeader),
      includeCheckbars: Boolean(includeCheckbars && isMeasureCheckEnabled()),
      tuneText,
    });
  }

  function buildInteractiveHeaderPrefix(entryHeader, includeCheckbars, tuneText) {
    return buildHeaderPrefixFromLayers({
      layers: [INTERACTIVE_SCORE_LAYOUT, ...collectLayers(entryHeader)],
      includeCheckbars: Boolean(includeCheckbars && isMeasureCheckEnabled()),
      tuneText,
    });
  }

  function buildHeaderPrefixWithLayerSpans(entryHeader, includeCheckbars, tuneText) {
    return buildHeaderPrefixWithLayerSpansFromLayers({
      layers: collectLayers(entryHeader, { withKinds: true }),
      includeCheckbars: Boolean(includeCheckbars && isMeasureCheckEnabled()),
      tuneText,
    });
  }

  function buildConversionHeaderPrefix(entryHeader, tuneText) {
    return buildHeaderPrefixFromLayers({
      layers: collectLayers(entryHeader, { includeRuntimeFonts: false }),
      includeCheckbars: false,
      tuneText,
    });
  }

  return {
    buildHeaderPrefix,
    buildInteractiveHeaderPrefix,
    buildHeaderPrefixWithLayerSpans,
    buildConversionHeaderPrefix,
    getSettingsSignature,
    isGlobalHeaderEnabled,
    refreshHeaderLayers,
    setFontDirs,
    setFromSettings,
    updateToggle,
  };
}

export {
  createHeaderLayersController,
};
