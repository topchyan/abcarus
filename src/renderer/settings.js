/*
PLAN (Architect prompts 1→7) — Settings dialog redesign (desktop-grade)

Scope for this prompt: plan only. Do NOT implement yet.
Allowed files for the full sequence: `src/renderer/index.html`, `src/renderer/style.css`, `src/renderer/settings.js`
(and `src/renderer/settings_store.js` only if section reset needs a helper).

Current state (audit notes, high-level):
- Markup: Settings modal lives in `src/renderer/index.html` under `#settingsModal` with left-nav containing
  Search (`#settingsFilter`) and “Show advanced” checkbox (`#settingsShowAdvanced`), tabs container `#settingsTabs`,
  panels container `#settingsPanels`, footer buttons `#settingsReset` + `#settingsClose`.
- CSS: `.modal-card.settings-card` is resizable and there are responsive rules that reflow to 1-column; multiple scroll
  containers can cause “jumping”.
- JS: `settings.js` builds tabs/panels from schema, uses `details.settings-advanced` per section, search currently
  filters across all panels and can change active tab; settings apply immediately via `store.update`.

Target layout (DOM changes in `index.html`):
1) Header:
   - Keep title “Settings”.
   - Add header controls: segmented mode switch (buttons `#settingsModeBasic`, `#settingsModeAdvanced`, aria-pressed)
     and Search input moved here (keep id `#settingsFilter`, accessible label/aria-label).
2) Left pane:
   - Navigation only: keep `#settingsTabs` list.
   - Remove Search and remove “Show advanced” checkbox from visible UI (no `#settingsShowAdvanced` in UI).
3) Right pane:
   - Add section header bar above content: `#settingsSectionTitle` and optional `#settingsSectionHint`.
   - Keep `#settingsNoResults` and `#settingsPanels`.
4) Footer:
   - Left: `#settingsResetSection` (“Reset Section…”).
   - Right: `#settingsCancel`, `#settingsApply`, `#settingsOk`.
   - Remove/stop using old ids `#settingsReset` / `#settingsClose` (updated in JS in later prompts).

Desktop styling changes in `style.css`:
- Remove free resize on settings modal (`resize: both`).
- Stable geometry: set a default size (e.g. ~960×600) with min/max constraints; no responsive 1-column collapse.
- Single-scroll rule: only right pane content scrolls (`.settings-panels`); left nav is fixed-width and stable.
- Left nav: strong selected state, clean list.
- Right pane: section header bar typography; groups as “cards” (`.settings-group`), consistent spacing.
- Rows: predictable 2-column alignment; avoid far-right floating checkboxes; inputs not overly wide.
- Advanced: disclosure (`details.settings-advanced`) styled like desktop preferences.

Behavior changes in `settings.js`:
1) Modes:
   - Introduce `settingsMode = 'basic'|'advanced'` persisted in localStorage (UI state only).
   - Basic mode shows only non-advanced settings; Advanced mode shows all settings, with advanced entries inside
     per-group disclosure “Advanced options” (collapsed by default).
2) Sections:
   - Keep an `activeSectionId` persisted in localStorage; update `#settingsSectionTitle/#settingsSectionHint` on change.
3) Rendering:
   - Render entries exactly once (fix duplication risks, e.g. global header enable appearing twice).
   - Group entries into `.settings-group` cards; within each group place an “Advanced options” disclosure as needed.
4) Search:
   - Search applies to the active section only; does not change left nav selection.
   - When query is empty: normal view; when non-empty: hide non-matching entries; show `#settingsNoResults` if none.
   - Search query is NOT persisted across restarts.
5) Footer semantics:
   - Switch to staged edits so Cancel has no side effects:
     - Maintain `draftSettingsPatch` (in-memory) while dialog is open; controls update draft only.
     - Apply/OK: send the accumulated patch via `store.update`, then clear draft; OK closes.
     - Cancel: discard draft and close; reload persisted settings next open.
   - Reset Section…:
     - Confirm.
     - Reset only keys belonging to active section (based on schema entries rendered in that section).
     - Apply reset via `store.update`, keep dialog open.
6) Safety checks (QA prompt 6+):
   - After editing this file, run: `node --experimental-default-type=module --check src/renderer/settings.js`.

Minimal touch-points:
- `index.html`: only `#settingsModal` subtree changes (header/nav/content/footer), keep ids required by JS.
- `style.css`: only settings-related selectors (.settings-*, .modal-card.settings-card) and override media query behavior.
- `settings.js`: rewrite UI wiring to new ids and staged apply model; avoid reflow/jumping; keep store API unchanged.
*/

/*
SETTINGS UX (maintainer summary)
- Basic/Advanced mode is UI-only and persisted in localStorage.
- Changes are staged while Settings is open; `Apply`/`OK` commits via `store.update`, `Cancel` discards.
- Search filters within the active section only and never changes the active section.
- Advanced settings render only in Advanced mode inside per-group “Advanced options” disclosures.
- “Reset Section…” resets only the active section keys to schema defaults.
*/

import {
  EditorView,
  EditorState,
  basicSetup,
  indentUnit,
} from "../../third_party/codemirror/cm.js";
import { createSettingsStore } from "./settings_store.js";

const ZOOM_STEP = 0.1;
const SETTINGS_UI_STATE_KEY = "abcarus.settings.uiState.v1";
const SETTINGS_SECTION_HINTS = {
  general: "General application settings.",
  editor: "Editor appearance and behavior.",
  playback: "Playback behavior and visuals.",
  tools: "Tools and transformations.",
  library: "Library and catalog behavior.",
  dialogs: "Dialog behavior and defaults.",
  fonts: "Fonts and soundfonts used for rendering and playback.",
  header: "Global ABC directives prepended during render/playback.",
};

const FALLBACK_SCHEMA = [
  { key: "renderZoom", type: "number", default: 1, section: "General", label: "Score zoom (%)", ui: { input: "percent", min: 50, max: 800, step: 5 } },
  { key: "editorZoom", type: "number", default: 1, section: "General", label: "Editor zoom (%)", ui: { input: "percent", min: 50, max: 800, step: 5 } },
  { key: "editorFontFamily", type: "string", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", section: "Editor", label: "Font family", ui: { input: "text" } },
  { key: "editorFontSize", type: "number", default: 13, section: "Editor", label: "Font size", ui: { input: "number", min: 8, max: 32, step: 1 } },
  { key: "editorNotesBold", type: "boolean", default: true, section: "Editor", label: "Bold notes", ui: { input: "checkbox" } },
  { key: "editorLyricsBold", type: "boolean", default: true, section: "Editor", label: "Bold inline lyrics", ui: { input: "checkbox" } },
  { key: "useNativeTranspose", type: "boolean", default: true, section: "Tools", label: "Use native transpose", ui: { input: "checkbox" } },
  { key: "autoAlignBarsAfterTransforms", type: "boolean", default: false, section: "Tools", label: "Auto-align bars after transforms", ui: { input: "checkbox" }, advanced: true },
  { key: "abc2xmlArgs", type: "string", default: "", section: "Tools", group: "Import/Export", groupOrder: 20, label: "abc2xml flags", ui: { input: "text", placeholder: "-x -y=value" }, advanced: true },
  { key: "xml2abcArgs", type: "string", default: "", section: "Tools", group: "Import/Export", groupOrder: 20, label: "xml2abc flags", ui: { input: "text", placeholder: "-x -y=value" }, advanced: true },
  { key: "globalHeaderEnabled", type: "boolean", default: true, section: "Header", label: "Enable global header", ui: { input: "checkbox" } },
  { key: "globalHeaderText", type: "string", default: "", section: "Header", label: "Global header", ui: { input: "code" } },
  { key: "usePortalFileDialogs", type: "boolean", default: true, section: "Dialogs", label: "Use portal file dialogs (Linux)", ui: { input: "checkbox" }, advanced: true },
  { key: "libraryAutoRenumberAfterMove", type: "boolean", default: false, section: "Library", label: "Auto-renumber X after move", ui: { input: "checkbox" } },
	  { key: "followHighlightColor", type: "string", default: "#1e90ff", section: "Playback", label: "Follow highlight color", ui: { input: "color" } },
	  { key: "followMeasureColor", type: "string", default: "", section: "Playback", label: "Follow staff color", ui: { input: "color" }, advanced: true },
	  { key: "followHighlightBarOpacity", type: "number", default: 0.12, section: "Playback", label: "Follow bar opacity (%)", ui: { input: "percent", min: 0, max: 60, step: 1 }, advanced: true },
	  { key: "followMeasureOpacity", type: "number", default: 0.08, section: "Playback", label: "Follow staff opacity (%)", ui: { input: "percent", min: 0, max: 30, step: 1 }, advanced: true },
	  { key: "followPlayheadOpacity", type: "number", default: 0.7, section: "Playback", label: "Follow playhead opacity (%)", ui: { input: "percent", min: 0, max: 100, step: 1 }, advanced: true },
	  { key: "followPlayheadWidth", type: "number", default: 2, section: "Playback", label: "Follow playhead width (px)", ui: { input: "number", min: 1, max: 6, step: 1 }, advanced: true },
	  { key: "followPlayheadPad", type: "number", default: 8, section: "Playback", label: "Playhead extra height (px)", ui: { input: "number", min: 0, max: 24, step: 1 }, advanced: true },
  { key: "followPlayheadBetweenNotesWeight", type: "number", default: 1, section: "Playback", label: "Playhead between notes (%)", ui: { input: "percent", min: 0, max: 100, step: 5 }, advanced: true },
  { key: "followPlayheadShift", type: "number", default: 0, section: "Playback", label: "Playhead horizontal shift (px)", ui: { input: "number", min: -20, max: 20, step: 1 }, advanced: true },
  { key: "followPlayheadFirstBias", type: "number", default: 6, section: "Playback", label: "First-note bias (px)", ui: { input: "number", min: 0, max: 20, step: 1 }, advanced: true },
  { key: "playbackNativeMidiDrums", type: "boolean", default: false, section: "Playback", label: "Use native abc2svg %%MIDI drum* (experimental)", ui: { input: "checkbox" }, advanced: true },
		  {
		    key: "playbackAutoScrollMode",
		    type: "string",
		    default: "Keep Visible",
	    section: "Playback",
	    label: "Playback auto-scroll",
	    ui: {
	      input: "select",
	      options: [
	        { value: "Off", label: "Off" },
	        { value: "Keep Visible", label: "Keep Cursor Visible" },
	        { value: "Page Turn", label: "Smooth Follow" },
	        { value: "Centered", label: "Center Cursor" },
	      ],
	    },
	  },
  { key: "playbackAutoScrollHorizontal", type: "boolean", default: true, section: "Playback", label: "Allow horizontal auto-scroll", ui: { input: "checkbox" }, advanced: true },
  { key: "playbackAutoScrollPauseMs", type: "number", default: 1800, section: "Playback", label: "Auto-scroll pause after manual scroll (ms)", ui: { input: "number", min: 0, max: 5000, step: 100 }, advanced: true },
  { key: "soundfontName", type: "string", default: "TimGM6mb.sf2", section: "Fonts", label: "Soundfont (SF2)", ui: { input: "select", options: "soundfonts" } },
  { key: "abc2svgNotationFontFile", type: "string", default: "", section: "Fonts", label: "Notation font", ui: { input: "select", options: "notationFonts" } },
  { key: "abc2svgTextFontFile", type: "string", default: "", section: "Fonts", label: "Text font", ui: { input: "select", options: "textFonts" } },
];

function buildDefaults(schema) {
  const out = {};
  for (const entry of schema) {
    if (!entry || !entry.key) continue;
    out[entry.key] = entry.default;
  }
  return out;
}

function groupSchemaForModal(schema) {
  const uiEntries = (schema || []).filter((e) => e && e.ui && e.ui.input && !e.legacy);
  const bySection = new Map();
  for (const entry of uiEntries) {
    const section = String(entry.section || "Other");
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(entry);
  }
  for (const entries of bySection.values()) {
    entries.sort((a, b) => {
      const sectionName = String((a && a.section) || (b && b.section) || "");
      if (sectionName === "Fonts") {
        const order = new Map([
          ["abc2svgNotationFontFile", 0],
          ["abc2svgTextFontFile", 1],
          ["soundfontName", 2],
        ]);
        const ak = order.has(a.key) ? order.get(a.key) : 999;
        const bk = order.has(b.key) ? order.get(b.key) : 999;
        if (ak !== bk) return ak - bk;
      }
      return String(a.label || a.key).localeCompare(String(b.label || b.key));
    });
  }
  return bySection;
}

export function initSettings(api) {
  const store = createSettingsStore(api);

  const $settingsModal = document.getElementById("settingsModal");
  const $settingsCard = $settingsModal ? $settingsModal.querySelector(".modal-card") : null;
  const $settingsHeader = $settingsModal ? $settingsModal.querySelector(".modal-header") : null;
  const $settingsFilter = document.getElementById("settingsFilter");
  const $settingsModeBasic = document.getElementById("settingsModeBasic");
  const $settingsModeAdvanced = document.getElementById("settingsModeAdvanced");
  const $settingsSectionTitle = document.getElementById("settingsSectionTitle");
  const $settingsSectionHint = document.getElementById("settingsSectionHint");
  const $settingsNoResults = document.getElementById("settingsNoResults");
  const $settingsTabsHost = document.getElementById("settingsTabs");
  const $settingsPanelsHost = document.getElementById("settingsPanels");
  const $settingsExport = document.getElementById("settingsExport");
  const $settingsImport = document.getElementById("settingsImport");
  const $settingsResetSection = document.getElementById("settingsResetSection");
  const $settingsCancel = document.getElementById("settingsCancel");
  const $settingsApply = document.getElementById("settingsApply");
  const $settingsOk = document.getElementById("settingsOk");

  // Legacy controls kept in HTML for compatibility.
  const $settingsClose = document.getElementById("settingsClose");
  const $settingsReset = document.getElementById("settingsReset");
  const $settingsShowAdvanced = document.getElementById("settingsShowAdvanced");
  const $renderPane = document.querySelector(".render-pane");
  const $editorPane = document.querySelector(".editor-pane");

  let schema = FALLBACK_SCHEMA;
  let defaultSettings = buildDefaults(schema);
  let currentSettings = { ...defaultSettings };
  let activePane = "render";
  let lastActiveTab = "general";
  let settingsMode = "basic"; // "basic" | "advanced" (UI state only)
  let setActiveTab = null;
  let applySettingsFilter = null;
  let cachedFontLists = { notation: [], text: [] };
  let cachedFontDirs = { bundledDir: "", userDir: "" };
  let cachedSoundfonts = [];
  const knownTabs = new Set(["general", "editor", "playback", "tools", "library", "dialogs", "fonts", "header"]);
  let dragState = null;
  let draftPatch = {};
  let isSettingsOpen = false;
  let advancedOpenState = new Set(); // session-only: "tab|group"
  let settingsPanelsByKey = new Map();

  function formatFontOptionLabel(ref) {
    const raw = String(ref || "");
    const m = raw.match(/^(bundled|user):(.*)$/);
    if (!m) return raw;
    const origin = m[1] === "user" ? "User" : "Bundled";
    const name = String(m[2] || "").replace(/\.(otf|ttf|woff2?)$/i, "");
    return `${name} (${origin})`;
  }

  function populateFontSelect(selectEl, optionsKey) {
    if (!selectEl) return;
    const prev = String(selectEl.value || "");
    selectEl.textContent = "";

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = "Default";
    selectEl.appendChild(optDefault);

    const pushOptions = (refs) => {
      for (const ref of refs) {
        const option = document.createElement("option");
        option.value = String(ref || "");
        option.textContent = formatFontOptionLabel(option.value);
        selectEl.appendChild(option);
      }
    };

    if (optionsKey === "notationFonts") pushOptions(cachedFontLists.notation || []);
    else if (optionsKey === "textFonts") pushOptions(cachedFontLists.text || []);

    // Restore selection if possible.
    selectEl.value = prev;
    if (selectEl.value !== prev) selectEl.value = "";
  }

  function safeBasename(value) {
    const s = String(value || "");
    if (!s) return "";
    const normalized = s.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || s;
  }

  function isSoundfontPath(value) {
    const s = String(value || "");
    return s.startsWith("file://") || /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith("/");
  }

  function populateSoundfontSelect(selectEl) {
    if (!selectEl) return;
    const prev = String(selectEl.value || "");
    selectEl.textContent = "";

    const fallback = "TimGM6mb.sf2";
    const defaultName = String(defaultSettings.soundfontName || fallback);
    const current = String(currentSettings.soundfontName || fallback);
    const entries = Array.isArray(cachedSoundfonts) ? cachedSoundfonts : [];
    const normalized = [];

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = `Default (${safeBasename(defaultName).replace(/\\.sf2$/i, "")})`;
    selectEl.appendChild(optDefault);

    for (const item of entries) {
      if (!item) continue;
      if (typeof item === "string") {
        normalized.push({ name: item, source: isSoundfontPath(item) ? "user" : "bundled" });
      } else if (typeof item === "object" && item.name) {
        normalized.push({ name: String(item.name), source: item.source === "user" ? "user" : "bundled" });
      }
    }

    if (current && !normalized.some((x) => x.name === current)) {
      normalized.unshift({ name: current, source: isSoundfontPath(current) ? "user" : "bundled" });
    }
    if (defaultName && !normalized.some((x) => x.name === defaultName)) {
      normalized.unshift({ name: defaultName, source: isSoundfontPath(defaultName) ? "user" : "bundled" });
    }

    const seen = new Set();
    for (const item of normalized) {
      if (!item || !item.name || seen.has(item.name)) continue;
      seen.add(item.name);
      const option = document.createElement("option");
      option.value = item.name;
      const label = safeBasename(item.name).replace(/\.sf2$/i, "");
      option.textContent = `${label}${item.source === "user" ? " (user)" : " (bundled)"}`;
      selectEl.appendChild(option);
    }

    selectEl.value = prev;
    if (selectEl.value !== prev) {
      selectEl.value = String(current) === String(defaultName) ? "" : current;
    }
  }

  const controlByKey = new Map(); // key -> { entry, el, kind }
  let globalHeaderView = null;
  let suppressGlobalUpdate = false;
  let globalUpdateTimer = null;

  function readUiState() {
    try {
      const raw = localStorage.getItem(SETTINGS_UI_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeUiState(patch) {
    try {
      const prev = readUiState() || {};
      const next = { ...prev, ...(patch || {}) };
      localStorage.setItem(SETTINGS_UI_STATE_KEY, JSON.stringify(next));
    } catch {}
  }

  async function updateSettings(patch) {
    const next = await store.update(patch);
    if (next) applySettings(next);
  }

  function getEffectiveSettings() {
    return { ...defaultSettings, ...currentSettings, ...(draftPatch || {}) };
  }

  function setDraftPatch(next) {
    draftPatch = next && typeof next === "object" ? next : {};
    if ($settingsApply) $settingsApply.disabled = Object.keys(draftPatch).length === 0;
  }

  function discardDraftPatch() {
    setDraftPatch({});
    applySettings(currentSettings);
  }

  async function applyDraftPatch() {
    const patch = draftPatch || {};
    if (!patch || Object.keys(patch).length === 0) return true;
    const next = await store.update(patch).catch(() => null);
    if (!next) return false;
    setDraftPatch({});
    applySettings(next);
    return true;
  }

  function stageSetting(key, value) {
    if (!key) return;
    const effective = getEffectiveSettings();
    if (Object.is(effective[key], value)) return;
    const next = { ...(draftPatch || {}) };
    next[key] = value;
    setDraftPatch(next);
    applySettings(currentSettings);
  }

  function setSettingsMode(nextMode) {
    const next = nextMode === "advanced" ? "advanced" : "basic";
    if (settingsMode === next) return;
    settingsMode = next;
    writeUiState({ settingsMode });
    if ($settingsModeBasic) $settingsModeBasic.setAttribute("aria-pressed", settingsMode === "basic" ? "true" : "false");
    if ($settingsModeAdvanced) $settingsModeAdvanced.setAttribute("aria-pressed", settingsMode === "advanced" ? "true" : "false");
    buildSettingsUi();
    applySettings(currentSettings);
    if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
  }

  function applySettings(settings) {
    currentSettings = { ...defaultSettings, ...(settings || {}) };
    const effectiveSettings = getEffectiveSettings();

    const root = document.documentElement.style;
    root.setProperty("--editor-font-family", effectiveSettings.editorFontFamily);
    root.setProperty("--editor-font-size", `${effectiveSettings.editorFontSize}px`);
    root.setProperty("--editor-notes-weight", effectiveSettings.editorNotesBold ? "600" : "400");
    root.setProperty("--editor-lyrics-weight", effectiveSettings.editorLyricsBold ? "600" : "400");
    if (!(document.body && document.body.classList.contains("focus-mode"))) {
      root.setProperty("--render-zoom", String(effectiveSettings.renderZoom));
    }
    root.setProperty("--editor-zoom", String(effectiveSettings.editorZoom));

    for (const [key, meta] of controlByKey.entries()) {
      const entry = meta.entry;
      if (!entry || !entry.ui) continue;
      const kind = entry.ui.input;
      const value = effectiveSettings[key];
      if (kind === "checkbox" && meta.el) {
        meta.el.checked = Boolean(value);
      } else if (kind === "percent" && meta.el) {
        meta.el.value = String(Math.round((Number(value) || 1) * 100));
      } else if (kind === "color" && meta.el) {
        meta.el.value = String(value || "#000000");
      } else if (kind === "select" && meta.el) {
        if (key === "soundfontName") {
          const fallback = "TimGM6mb.sf2";
          const defaultName = String(defaultSettings.soundfontName || fallback);
          meta.el.value = String(value || "") === defaultName ? "" : String(value || "");
        } else {
          meta.el.value = String(value || "");
        }
      } else if ((kind === "number" || kind === "text") && meta.el) {
        meta.el.value = String(value == null ? "" : value);
      }
    }

    if (globalHeaderView) {
      const nextText = String(effectiveSettings.globalHeaderText || "");
      const doc = globalHeaderView.state.doc.toString();
      if (doc !== nextText) {
        suppressGlobalUpdate = true;
        globalHeaderView.dispatch({
          changes: { from: 0, to: globalHeaderView.state.doc.length, insert: nextText },
        });
        suppressGlobalUpdate = false;
      }
    }

  }

  function openSettings() {
    if (!$settingsModal) return;
    isSettingsOpen = true;
    $settingsModal.classList.add("open");
    $settingsModal.setAttribute("aria-hidden", "false");
    if ($settingsFilter) $settingsFilter.value = "";
    if (typeof setActiveTab === "function") setActiveTab(lastActiveTab);
    if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
    scheduleClampModalPosition();
    setTimeout(() => {
      if ($settingsFilter) {
        $settingsFilter.focus();
        $settingsFilter.select();
      }
    }, 0);
  }

  function closeSettings({ discardDraft = false } = {}) {
    if (!$settingsModal) return;
    isSettingsOpen = false;
    if (discardDraft) discardDraftPatch();
    if ($settingsFilter) $settingsFilter.value = "";
    if (applySettingsFilter && $settingsFilter) applySettingsFilter("");
    $settingsModal.classList.remove("open");
    $settingsModal.setAttribute("aria-hidden", "true");
  }

  function readModalPosition() {
    const ui = readUiState();
    if (!ui || !ui.settingsModalPos) return null;
    const pos = ui.settingsModalPos;
    if (!pos || typeof pos !== "object") return null;
    const x = Number(pos.x);
    const y = Number(pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function applyModalPosition(pos) {
    if (!$settingsCard) return;
    if (!pos) {
      $settingsCard.style.transform = "";
      return;
    }
    const x = Math.round(Number(pos.x) || 0);
    const y = Math.round(Number(pos.y) || 0);
    $settingsCard.style.transform = `translate(${x}px, ${y}px)`;
  }

  function readModalPositionFromTransform() {
    if (!$settingsCard) return null;
    const current = String($settingsCard.style.transform || "");
    const m = current.match(/translate\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
    if (!m) return null;
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function clampModalPosition(pos) {
    if (!$settingsCard) return pos;
    const x = Number(pos && pos.x);
    const y = Number(pos && pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
    const rect = $settingsCard.getBoundingClientRect();
    const pad = 12;
    const baseLeft = (window.innerWidth - rect.width) / 2;
    const baseTop = (window.innerHeight - rect.height) / 2;

    let minX = pad - baseLeft;
    let maxX = (window.innerWidth - pad - rect.width) - baseLeft;
    let minY = pad - baseTop;
    let maxY = (window.innerHeight - pad - rect.height) - baseTop;

    // If the modal is larger than the viewport, prefer keeping the top-left visible.
    if (minX > maxX) {
      maxX = minX;
    }
    if (minY > maxY) {
      maxY = minY;
    }

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }

  function clampAndPersistModalPosition() {
    if (!$settingsCard) return;
    const pos = readModalPositionFromTransform() || readModalPosition() || { x: 0, y: 0 };
    const clamped = clampModalPosition(pos);
    applyModalPosition(clamped);
    writeUiState({ settingsModalPos: clamped });
  }

  function scheduleClampModalPosition() {
    if (!$settingsModal || !$settingsCard) return;
    if (!$settingsModal.classList.contains("open")) return;
    // Let layout settle (tab changes / advanced toggles can change height).
    requestAnimationFrame(() => requestAnimationFrame(() => clampAndPersistModalPosition()));
  }

  function initSettingsDrag() {
    if (!$settingsCard || !$settingsHeader) return;

    const applyFromUi = () => {
      const pos = readModalPosition();
      applyModalPosition(pos ? clampModalPosition(pos) : null);
    };
    applyFromUi();

    $settingsHeader.addEventListener("pointerdown", (event) => {
      if (!event || event.button !== 0) return;
      const target = event.target;
      if (target && (target.closest("button") || target.closest("input") || target.closest("select") || target.closest("textarea"))) {
        return;
      }
      if (!$settingsModal.classList.contains("open")) return;

      const start = readModalPosition() || { x: 0, y: 0 };
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: start.x,
        originY: start.y,
      };
      $settingsCard.classList.add("dragging");
      try { $settingsHeader.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });

    $settingsHeader.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const next = clampModalPosition({ x: dragState.originX + dx, y: dragState.originY + dy });
      applyModalPosition(next);
    });

    const endDrag = (event) => {
      if (!dragState) return;
      if (event && dragState.pointerId != null && event.pointerId !== dragState.pointerId) return;
      const current = $settingsCard.style.transform || "";
      const m = current.match(/translate\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
      const pos = m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
      writeUiState({ settingsModalPos: clampModalPosition(pos) });
      dragState = null;
      $settingsCard.classList.remove("dragging");
      try { if (event) $settingsHeader.releasePointerCapture(event.pointerId); } catch {}
    };

    $settingsHeader.addEventListener("pointerup", endDrag);
    $settingsHeader.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", () => {
      const pos = readModalPosition();
      if (!pos) return;
      const clamped = clampModalPosition(pos);
      applyModalPosition(clamped);
      writeUiState({ settingsModalPos: clamped });
    });
  }

  function zoomBy(delta) {
    if (activePane === "editor") {
      const nextZoom = (currentSettings.editorZoom || 1) + delta;
      updateSettings({ editorZoom: nextZoom }).catch(() => {});
    } else {
      const nextZoom = (currentSettings.renderZoom || 1) + delta;
      updateSettings({ renderZoom: nextZoom }).catch(() => {});
    }
  }

  function zoomReset() {
    updateSettings({ renderZoom: 1, editorZoom: 1 }).catch(() => {});
  }

  function createRow(entry) {
    const row = document.createElement("label");
    row.className = "settings-row";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = String(entry.label || entry.key);
    row.appendChild(labelSpan);

    const kind = entry.ui.input;
    let input = null;
    if (kind === "checkbox") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => {
        stageSetting(entry.key, Boolean(input.checked));
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    if (kind === "number" || kind === "percent") {
      input = document.createElement("input");
      input.type = "number";
      if (entry.ui.min != null) input.min = String(entry.ui.min);
      if (entry.ui.max != null) input.max = String(entry.ui.max);
      if (entry.ui.step != null) input.step = String(entry.ui.step);
      input.addEventListener("change", () => {
        const raw = Number(input.value);
        if (kind === "percent") {
          stageSetting(entry.key, raw / 100);
        } else {
          stageSetting(entry.key, raw);
        }
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    if (kind === "text") {
      input = document.createElement("input");
      input.type = "text";
      if (entry.ui.placeholder) input.placeholder = String(entry.ui.placeholder);
      input.addEventListener("change", () => {
        stageSetting(entry.key, input.value || "");
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    if (kind === "select") {
      const select = document.createElement("select");
      const optionsKey = entry.ui && entry.ui.options ? String(entry.ui.options) : "";
      const isFontSelect = optionsKey === "notationFonts" || optionsKey === "textFonts";
      const isSoundfontSelect = optionsKey === "soundfonts";

      if (isFontSelect) {
        populateFontSelect(select, optionsKey);
      } else if (isSoundfontSelect) {
        populateSoundfontSelect(select);
      } else if (Array.isArray(entry.ui && entry.ui.options)) {
        const optDefault = document.createElement("option");
        optDefault.value = "";
        optDefault.textContent = "Default";
        select.appendChild(optDefault);
        for (const rawOpt of entry.ui.options) {
          const isObj = rawOpt && typeof rawOpt === "object";
          const value = isObj ? rawOpt.value : rawOpt;
          const label = isObj ? (rawOpt.label != null ? rawOpt.label : rawOpt.value) : rawOpt;
          const option = document.createElement("option");
          option.value = String(value || "");
          option.textContent = String(label || "");
          select.appendChild(option);
        }
      }

      select.addEventListener("change", () => {
        if (entry.key === "soundfontName") {
          const fallback = "TimGM6mb.sf2";
          const defaultName = String(defaultSettings.soundfontName || fallback);
          stageSetting(entry.key, select.value ? select.value : defaultName);
          return;
        }
        stageSetting(entry.key, select.value || "");
      });

      if (!isFontSelect && !isSoundfontSelect) {
        row.appendChild(select);
        controlByKey.set(entry.key, { entry, el: select });
        return row;
      }

      const wrap = document.createElement("div");
      wrap.className = "settings-select-row";
      wrap.appendChild(select);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "Add…";
      addBtn.addEventListener("click", async () => {
        if (isSoundfontSelect) {
          if (!api || typeof api.pickSoundfont !== "function") return;
          const picked = await api.pickSoundfont().catch(() => null);
          if (!picked) return;
          if (!/\.sf2$/i.test(String(picked))) {
            alert("Soundfont must be a .sf2 file.");
            return;
          }
          if (api.fileExists) {
            const exists = await api.fileExists(picked).catch(() => false);
            if (!exists) {
              alert("Soundfont file not found.");
              return;
            }
          }
          const existing = Array.isArray(currentSettings.soundfontPaths) ? currentSettings.soundfontPaths : [];
          const nextPaths = existing.includes(picked) ? existing : [...existing, picked];
          await updateSettings({ soundfontPaths: nextPaths, soundfontName: picked }).catch(() => {});
          const list = await api.listSoundfonts().catch(() => []);
          cachedSoundfonts = Array.isArray(list) ? list : [];
          populateSoundfontSelect(select);
          select.value = picked;
          stageSetting(entry.key, picked);
          return;
        }

        if (!api || typeof api.pickFont !== "function" || typeof api.installFont !== "function") return;
        const pick = await api.pickFont().catch(() => null);
        if (!pick || !pick.ok || !pick.path) return;
        const res = await api.installFont(pick.path).catch(() => null);
        if (!res || !res.ok) {
          alert(res && res.error ? res.error : "Failed to add font.");
          return;
        }
        const list = await api.listFonts().catch(() => null);
        if (list && list.ok) {
          cachedFontLists = {
            notation: [
              ...(list.bundled && list.bundled.notation ? list.bundled.notation.map((n) => `bundled:${n}`) : []),
              ...(list.user && list.user.notation ? list.user.notation.map((n) => `user:${n}`) : []),
            ],
            text: [
              ...(list.bundled && list.bundled.text ? list.bundled.text.map((n) => `bundled:${n}`) : []),
              ...(list.user && list.user.text ? list.user.text.map((n) => `user:${n}`) : []),
            ],
          };
        }
        populateFontSelect(select, optionsKey);
        const newRef = `user:${String(res.name || "")}`;
        select.value = newRef;
        stageSetting(entry.key, newRef);
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", async () => {
        if (isSoundfontSelect) {
          const current = String(select.value || "");
          if (!current) return;
          if (!isSoundfontPath(current)) {
            alert("Bundled soundfonts cannot be removed.");
            return;
          }
          const label = safeBasename(current).replace(/\.sf2$/i, "");
          if (api && typeof api.confirmRemoveSoundfont === "function") {
            const ok = await api.confirmRemoveSoundfont(label).catch(() => false);
            if (!ok) return;
          } else if (!confirm(`Remove "${label}" from the list?`)) {
            return;
          }
          const existing = Array.isArray(currentSettings.soundfontPaths) ? currentSettings.soundfontPaths : [];
          const nextPaths = existing.filter((item) => item !== current);
          const fallback = "TimGM6mb.sf2";
          const nextName = current === String(currentSettings.soundfontName || "") ? fallback : String(currentSettings.soundfontName || fallback);
          await updateSettings({ soundfontPaths: nextPaths, soundfontName: nextName }).catch(() => {});
          const list = await api.listSoundfonts().catch(() => []);
          cachedSoundfonts = Array.isArray(list) ? list : [];
          populateSoundfontSelect(select);
          select.value = nextName;
          stageSetting(entry.key, nextName);
          return;
        }

        const current = String(select.value || "");
        const m = current.match(/^user:(.+)$/);
        if (!m) return;
        const fileName = String(m[1] || "");
        if (!fileName) return;
        const ok = confirm(`Remove user font "${fileName}"?`);
        if (!ok) return;
        if (!api || typeof api.removeFont !== "function") return;
        const res = await api.removeFont(fileName).catch(() => null);
        if (!res || !res.ok) {
          alert(res && res.error ? res.error : "Failed to remove font.");
          return;
        }
        const list = await api.listFonts().catch(() => null);
        if (list && list.ok) {
          cachedFontLists = {
            notation: [
              ...(list.bundled && list.bundled.notation ? list.bundled.notation.map((n) => `bundled:${n}`) : []),
              ...(list.user && list.user.notation ? list.user.notation.map((n) => `user:${n}`) : []),
            ],
            text: [
              ...(list.bundled && list.bundled.text ? list.bundled.text.map((n) => `bundled:${n}`) : []),
              ...(list.user && list.user.text ? list.user.text.map((n) => `user:${n}`) : []),
            ],
          };
        }
        populateFontSelect(select, optionsKey);
        select.value = "";
        stageSetting(entry.key, "");
      });

      const updateRemoveEnabled = () => {
        const current = String(select.value || "");
        if (isSoundfontSelect) {
          removeBtn.disabled = !isSoundfontPath(current);
          removeBtn.title = removeBtn.disabled ? "Bundled soundfonts cannot be removed." : "";
        } else {
          removeBtn.disabled = !/^user:/.test(current);
          removeBtn.title = removeBtn.disabled ? "Only user-installed fonts can be removed." : "";
        }
      };
      select.addEventListener("change", updateRemoveEnabled);
      updateRemoveEnabled();

      wrap.appendChild(addBtn);
      wrap.appendChild(removeBtn);
      row.appendChild(wrap);
      controlByKey.set(entry.key, { entry, el: select });
      return row;
    }

    if (kind === "color") {
      input = document.createElement("input");
      input.type = "color";
      input.addEventListener("change", () => {
        const v = String(input.value || "").trim();
        stageSetting(entry.key, v);
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
      return row;
    }

    // Other inputs are handled as custom sections.
    return null;
  }

  function createGroup(title, help) {
    const group = document.createElement("div");
    group.className = "settings-group";
    const head = document.createElement("div");
    head.className = "settings-title";
    head.textContent = title;
    group.appendChild(head);
    if (help) {
      const p = document.createElement("div");
      p.className = "settings-help";
      p.textContent = help;
      group.appendChild(p);
    }
    return group;
  }

  function buildSettingsUi() {
    if (!$settingsTabsHost || !$settingsPanelsHost) return;
    $settingsTabsHost.textContent = "";
    $settingsPanelsHost.textContent = "";
    controlByKey.clear();
    if (globalHeaderView) {
      try { globalHeaderView.destroy(); } catch {}
      globalHeaderView = null;
    }

    const bySectionRaw = groupSchemaForModal(schema);
    const bySection = new Map();
    for (const [sectionName, entries] of bySectionRaw.entries()) {
      const filtered = (entries || []).filter((entry) => {
        // Hide the Drums mixer from Settings for now; users can control velocities per tune.
        if (!entry) return false;
        if (entry.key === "drumVelocityMap") return false;
        if (String(entry.section || "").toLowerCase() === "drums") return false;
        return true;
      });
      if (filtered.length) bySection.set(sectionName, filtered);
    }

    const panels = [
      { key: "general", label: "General", sections: ["General"] },
      { key: "editor", label: "Editor", sections: ["Editor"] },
      { key: "playback", label: "Playback", sections: ["Playback"] },
      { key: "tools", label: "Tools", sections: ["Tools"] },
      { key: "library", label: "Library", sections: ["Library"] },
      { key: "dialogs", label: "Dialogs", sections: ["Dialogs"] },
      { key: "fonts", label: "Fonts", sections: ["Fonts"] },
      { key: "header", label: "Header", sections: ["Header"] },
    ];
    const panelKeys = new Set(panels.map((p) => p.key));
    settingsPanelsByKey = new Map(panels.map((p) => [p.key, p]));

    const uiState = readUiState();
    if (uiState && (uiState.settingsMode === "basic" || uiState.settingsMode === "advanced")) {
      settingsMode = uiState.settingsMode;
    }
    if (uiState && uiState.activeTab) {
      const rawTab = normalizeTabKey(uiState.activeTab);
      if (panelKeys.has(rawTab)) lastActiveTab = rawTab;
    }
    writeUiState({ activeTab: lastActiveTab, settingsMode });
    if ($settingsModeBasic) $settingsModeBasic.setAttribute("aria-pressed", settingsMode === "basic" ? "true" : "false");
    if ($settingsModeAdvanced) $settingsModeAdvanced.setAttribute("aria-pressed", settingsMode === "advanced" ? "true" : "false");

    setActiveTab = (name) => {
      lastActiveTab = normalizeTabKey(name || "general");
      writeUiState({ activeTab: lastActiveTab });
      const tabs = Array.from($settingsTabsHost.querySelectorAll("[data-settings-tab]"));
      const panels = Array.from($settingsPanelsHost.querySelectorAll("[data-settings-panel]"));
      tabs.forEach((tab) => {
        const active = tab.dataset.settingsTab === lastActiveTab;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.settingsPanel === lastActiveTab);
      });
      const meta = settingsPanelsByKey.get(lastActiveTab);
      if ($settingsSectionTitle) $settingsSectionTitle.textContent = meta ? meta.label : "";
      if ($settingsSectionHint) {
        const hint = SETTINGS_SECTION_HINTS[lastActiveTab] || "";
        $settingsSectionHint.textContent = hint;
        $settingsSectionHint.style.display = hint ? "" : "none";
      }
      if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
      scheduleClampModalPosition();
    };

    for (const panel of panels) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "settings-tab";
      tab.dataset.settingsTab = panel.key;
      tab.setAttribute("role", "tab");
      tab.textContent = panel.label;
      tab.addEventListener("click", () => setActiveTab(panel.key));
      $settingsTabsHost.appendChild(tab);

      const panelEl = document.createElement("div");
      panelEl.className = "settings-panel";
      panelEl.dataset.settingsPanel = panel.key;
      panelEl.setAttribute("role", "tabpanel");

      for (const sectionName of panel.sections) {
        const entries = bySection.get(sectionName) || [];
        const groups = new Map(); // groupTitle -> entries[]
        for (const entry of entries) {
          const title = entry && entry.group ? String(entry.group) : sectionName;
          if (!groups.has(title)) groups.set(title, []);
          groups.get(title).push(entry);
        }

        const getGroupOrder = (groupEntries) => {
          let best = Infinity;
          for (const entry of groupEntries) {
            const n = Number(entry && entry.groupOrder);
            if (Number.isFinite(n)) best = Math.min(best, n);
          }
          return best === Infinity ? 999 : best;
        };

        const orderedGroups = Array.from(groups.entries())
          .map(([title, groupEntries]) => ({ title, order: getGroupOrder(groupEntries), entries: groupEntries }))
          .sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));

        for (const g of orderedGroups) {
          const groupEntries = g.entries || [];
          const normal = groupEntries.filter((e) => !e.advanced && e.ui && e.ui.input && e.ui.input !== "code");
          const advanced = groupEntries.filter((e) => e.advanced && e.ui && e.ui.input && e.ui.input !== "code");
          const codeEntry = groupEntries.find((e) => e.ui && e.ui.input === "code");

          if (!normal.length && !(settingsMode === "advanced" && advanced.length) && !codeEntry) continue;

          const group = createGroup(g.title, null);

          const appendEntryBlock = (entry, host) => {
            const row = createRow(entry);
            if (!row) return;
            const block = document.createElement("div");
            block.className = "settings-entry";
            block.dataset.settingsSearch = `${entry.key} ${entry.label || ""} ${entry.help || ""} ${sectionName} ${g.title}`.toLowerCase();
            block.appendChild(row);
            if (entry.help) {
              const help = document.createElement("div");
              help.className = "settings-help";
              help.textContent = String(entry.help);
              block.appendChild(help);
            }
            host.appendChild(block);
          };

          for (const entry of normal) appendEntryBlock(entry, group);

          if (codeEntry) {
            const editorBlock = document.createElement("div");
            editorBlock.className = "settings-entry";
            editorBlock.dataset.settingsSearch = `${codeEntry.key} ${codeEntry.label || ""} ${codeEntry.help || ""} ${sectionName} ${g.title}`.toLowerCase();

            const editorHost = document.createElement("div");
            editorHost.className = "settings-editor";
            editorHost.setAttribute("aria-label", String(codeEntry.label || "Settings editor"));
            editorBlock.appendChild(editorHost);

            if (codeEntry.help) {
              const help = document.createElement("div");
              help.className = "settings-help";
              help.textContent = String(codeEntry.help);
              editorBlock.appendChild(help);
            }

            const updateListener = EditorView.updateListener.of((update) => {
              if (!update.docChanged || suppressGlobalUpdate) return;
              if (globalUpdateTimer) clearTimeout(globalUpdateTimer);
              globalUpdateTimer = setTimeout(() => {
                if (!globalHeaderView) return;
                stageSetting(codeEntry.key, globalHeaderView.state.doc.toString());
              }, 400);
            });
            const state = EditorState.create({
              doc: "",
              extensions: [
                basicSetup,
                updateListener,
                EditorState.tabSize.of(2),
                indentUnit.of("  "),
              ],
            });
            globalHeaderView = new EditorView({ state, parent: editorHost });
            group.appendChild(editorBlock);
          }

          if (settingsMode === "advanced" && advanced.length) {
            const divider = document.createElement("div");
            divider.className = "settings-advanced-divider";
            group.appendChild(divider);

            const label = document.createElement("div");
            label.className = "settings-advanced-label";
            label.textContent = "Advanced";
            group.appendChild(label);

            for (const entry of advanced) appendEntryBlock(entry, group);
          }

          panelEl.appendChild(group);
        }
      }

      $settingsPanelsHost.appendChild(panelEl);
    }

    // Rehydrate control values after rebuilding the UI (e.g. mode switch).
    applySettings(currentSettings);
    setActiveTab(lastActiveTab);

    applySettingsFilter = (raw) => {
      const needle = String(raw || "").trim().toLowerCase();
      const panelEl = $settingsPanelsHost.querySelector(`[data-settings-panel="${lastActiveTab}"]`);
      if (!panelEl) return;

      const blocks = Array.from(panelEl.querySelectorAll(".settings-entry"));
      const groups = Array.from(panelEl.querySelectorAll(".settings-group"));

      const anyQuery = Boolean(needle);
      for (const block of blocks) {
        const hay = String(block.dataset.settingsSearch || "");
        block.style.display = !anyQuery || hay.includes(needle) ? "" : "none";
      }

      let anyVisible = false;
      for (const group of groups) {
        const visible = Boolean(group.querySelector(".settings-entry:not([style*='display: none'])"));
        group.style.display = visible ? "" : "none";
        if (visible) anyVisible = true;
      }

      if ($settingsNoResults) {
        if (!anyQuery) {
          $settingsNoResults.classList.add("hidden");
          $settingsNoResults.textContent = "";
        } else if (!anyVisible) {
          $settingsNoResults.classList.remove("hidden");
          $settingsNoResults.textContent =
            settingsMode === "basic"
              ? "No matches in this section (Basic mode). Try Advanced."
              : "No matches in this section.";
        } else {
          $settingsNoResults.classList.add("hidden");
          $settingsNoResults.textContent = "";
        }
      }
      scheduleClampModalPosition();
    };
  }

  if ($settingsClose) {
    $settingsClose.addEventListener("click", () => closeSettings({ discardDraft: true }));
  }
  if ($settingsModal) {
    $settingsModal.addEventListener("click", (e) => {
      if (e.target === $settingsModal) closeSettings({ discardDraft: true });
    });
    $settingsModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSettings({ discardDraft: true });
      }
    });
  }
  if ($settingsFilter) {
    $settingsFilter.addEventListener("input", () => {
      if (applySettingsFilter) applySettingsFilter($settingsFilter.value);
    });
  }
  if ($settingsReset) {
    $settingsReset.addEventListener("click", () => {
      // Preserve previous behavior: reset only what the Settings modal owns.
      const patch = {};
      for (const entry of schema) {
        if (!entry || !entry.key || !entry.ui || !entry.ui.input || entry.legacy) continue;
        if (entry.key === "drumVelocityMap") continue;
        if (String(entry.section || "").toLowerCase() === "drums") continue;
        patch[entry.key] = entry.default;
      }
      updateSettings(patch).catch(() => {});
    });
  }
  if ($settingsModeBasic) $settingsModeBasic.addEventListener("click", () => setSettingsMode("basic"));
  if ($settingsModeAdvanced) $settingsModeAdvanced.addEventListener("click", () => setSettingsMode("advanced"));
  if ($settingsCancel) $settingsCancel.addEventListener("click", () => closeSettings({ discardDraft: true }));
  if ($settingsApply) {
    $settingsApply.disabled = true;
    $settingsApply.addEventListener("click", async () => {
      await applyDraftPatch().catch(() => {});
      if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
    });
  }
  if ($settingsOk) {
    $settingsOk.addEventListener("click", async () => {
      await applyDraftPatch().catch(() => {});
      closeSettings({ discardDraft: false });
    });
  }
  if ($settingsResetSection) {
    $settingsResetSection.addEventListener("click", async () => {
      const meta = settingsPanelsByKey.get(lastActiveTab);
      const sectionLabel = meta ? meta.label : "this section";
      if (!confirm(`Restore defaults for this section?\n\n(${sectionLabel})`)) return;

      const patch = {};
      for (const entry of schema) {
        if (!entry || !entry.key || !entry.ui || !entry.ui.input || entry.legacy) continue;
        if (entry.key === "drumVelocityMap") continue;
        if (String(entry.section || "").toLowerCase() === "drums") continue;
        if (!meta || !meta.sections.includes(String(entry.section || ""))) continue;
        patch[entry.key] = entry.default;
      }

      const nextDraft = { ...(draftPatch || {}) };
      for (const key of Object.keys(patch)) delete nextDraft[key];
      setDraftPatch(nextDraft);

      await updateSettings(patch).catch(() => {});
      buildSettingsUi();
      if (typeof setActiveTab === "function") setActiveTab(lastActiveTab);
    });
  }

  if ($settingsExport) {
    $settingsExport.addEventListener("click", async () => {
      if (!api || typeof api.exportSettings !== "function") return;
      const res = await api.exportSettings().catch(() => null);
      if (!res || !res.ok || !res.path) {
        alert((res && res.error) ? res.error : "Failed to export settings.");
        return;
      }
      const note = res.exportedHeader ? "\n(incl. user_settings.abc)" : "";
      alert(`Settings exported:\n${res.path}${note}`);
    });
  }

  if ($settingsImport) {
    $settingsImport.addEventListener("click", async () => {
      if (!api || typeof api.importSettings !== "function") return;
      const res = await api.importSettings().catch(() => null);
      if (!res || !res.ok) {
        alert((res && res.error) ? res.error : "Failed to import settings.");
        return;
      }
      if (res.settings) applySettings(res.settings);
      buildSettingsUi();
      if (typeof setActiveTab === "function") setActiveTab(lastActiveTab);
      const note = res.importedHeader ? " (incl. user_settings.abc)" : "";
      alert(`Settings imported${note}.\nSome changes apply immediately; others may require a restart.`);
    });
  }

  store.subscribe((settings) => {
    if (settings) applySettings(settings);
  });

  if ($renderPane) {
    $renderPane.addEventListener("pointerdown", () => { activePane = "render"; });
  }
  if ($editorPane) {
    $editorPane.addEventListener("pointerdown", () => { activePane = "editor"; });
  }

  const initPromise = (async () => {
    const schemaRes = await store.getSchema().catch(() => null);
    if (schemaRes && schemaRes.ok && Array.isArray(schemaRes.schema)) schema = schemaRes.schema;
    if (api && typeof api.getFontDirs === "function") {
      const res = await api.getFontDirs().catch(() => null);
      if (res && res.ok) {
        cachedFontDirs = { bundledDir: String(res.bundledDir || ""), userDir: String(res.userDir || "") };
      }
    }
    if (api && typeof api.listFonts === "function") {
      const res = await api.listFonts().catch(() => null);
      if (res && res.ok) {
        cachedFontLists = {
          notation: [
            ...(res.bundled && Array.isArray(res.bundled.notation) ? res.bundled.notation.map((n) => `bundled:${n}`) : []),
            ...(res.user && Array.isArray(res.user.notation) ? res.user.notation.map((n) => `user:${n}`) : []),
          ],
          text: [
            ...(res.bundled && Array.isArray(res.bundled.text) ? res.bundled.text.map((n) => `bundled:${n}`) : []),
            ...(res.user && Array.isArray(res.user.text) ? res.user.text.map((n) => `user:${n}`) : []),
          ],
        };
      }
    }
    if (api && typeof api.listSoundfonts === "function") {
      const list = await api.listSoundfonts().catch(() => []);
      cachedSoundfonts = Array.isArray(list) ? list : [];
    }
    defaultSettings = buildDefaults(schema);
    buildSettingsUi();
    initSettingsDrag();
    const settings = await store.get().catch(() => null);
    if (settings) applySettings(settings);
    if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
  })();

  function normalizeTabKey(raw) {
    const key = String(raw || "").trim().toLowerCase();
    if (!key) return "general";
    if (key === "main") return "general";
    if (key === "import" || key === "importexport" || key === "import/export" || key === "xml") return "tools";
    if (knownTabs.has(key)) return key;
    return "general";
  }

  async function openTab(tabKey) {
    await initPromise.catch(() => {});
    lastActiveTab = normalizeTabKey(tabKey);
    openSettings();
  }

  return {
    openSettings,
    openTab,
    closeSettings,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    zoomReset,
    setActivePane: (pane) => { activePane = pane; },
  };
}
