import {
  EditorView,
  EditorState,
  basicSetup,
  indentUnit,
} from "../../third_party/codemirror/cm.js";
import { createSettingsStore } from "./settings_store.js";

const ZOOM_STEP = 0.1;
const SETTINGS_UI_STATE_KEY = "abcarus.settings.uiState.v1";

const FALLBACK_SCHEMA = [
  { key: "renderZoom", type: "number", default: 1, section: "General", label: "Score zoom (%)", ui: { input: "percent", min: 50, max: 800, step: 5 } },
  { key: "editorZoom", type: "number", default: 1, section: "General", label: "Editor zoom (%)", ui: { input: "percent", min: 50, max: 800, step: 5 } },
  { key: "editorFontFamily", type: "string", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", section: "Editor", label: "Font family", ui: { input: "text" } },
  { key: "editorFontSize", type: "number", default: 13, section: "Editor", label: "Font size", ui: { input: "number", min: 8, max: 32, step: 1 } },
  { key: "editorNotesBold", type: "boolean", default: true, section: "Editor", label: "Bold notes", ui: { input: "checkbox" } },
  { key: "editorLyricsBold", type: "boolean", default: true, section: "Editor", label: "Bold inline lyrics", ui: { input: "checkbox" } },
  { key: "useNativeTranspose", type: "boolean", default: true, section: "Tools", label: "Use native transpose", ui: { input: "checkbox" } },
  { key: "autoAlignBarsAfterTransforms", type: "boolean", default: false, section: "Tools", label: "Auto-align bars after transforms", ui: { input: "checkbox" }, advanced: true },
  { key: "abc2xmlArgs", type: "string", default: "", section: "Import/Export", label: "abc2xml flags", ui: { input: "text", placeholder: "-x -y=value" }, advanced: true },
  { key: "xml2abcArgs", type: "string", default: "", section: "Import/Export", label: "xml2abc flags", ui: { input: "text", placeholder: "-x -y=value" }, advanced: true },
  { key: "globalHeaderEnabled", type: "boolean", default: true, section: "Header", label: "Enable global header", ui: { input: "checkbox" } },
  { key: "globalHeaderText", type: "string", default: "", section: "Header", label: "Global header", ui: { input: "code" } },
  { key: "usePortalFileDialogs", type: "boolean", default: true, section: "Dialogs", label: "Use portal file dialogs (Linux)", ui: { input: "checkbox" }, advanced: true },
  { key: "libraryAutoRenumberAfterMove", type: "boolean", default: false, section: "Library", label: "Auto-renumber X after move", ui: { input: "checkbox" } },
  { key: "followHighlightColor", type: "string", default: "#1e90ff", section: "Playback", label: "Follow highlight color", ui: { input: "color" } },
  { key: "followHighlightBarOpacity", type: "number", default: 0.12, section: "Playback", label: "Follow bar opacity (%)", ui: { input: "percent", min: 0, max: 60, step: 1 }, advanced: true },
  { key: "followPlayheadOpacity", type: "number", default: 0.7, section: "Playback", label: "Follow playhead opacity (%)", ui: { input: "percent", min: 0, max: 100, step: 1 }, advanced: true },
  { key: "followPlayheadWidth", type: "number", default: 2, section: "Playback", label: "Follow playhead width (px)", ui: { input: "number", min: 1, max: 6, step: 1 }, advanced: true },
  { key: "followPlayheadPad", type: "number", default: 8, section: "Playback", label: "Playhead extra height (px)", ui: { input: "number", min: 0, max: 24, step: 1 }, advanced: true },
  { key: "followPlayheadBetweenNotesWeight", type: "number", default: 1, section: "Playback", label: "Playhead between notes (%)", ui: { input: "percent", min: 0, max: 100, step: 5 }, advanced: true },
  { key: "followPlayheadShift", type: "number", default: 0, section: "Playback", label: "Playhead horizontal shift (px)", ui: { input: "number", min: -20, max: 20, step: 1 }, advanced: true },
  { key: "followPlayheadFirstBias", type: "number", default: 6, section: "Playback", label: "First-note bias (px)", ui: { input: "number", min: 0, max: 20, step: 1 }, advanced: true },
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
    entries.sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key)));
  }
  return bySection;
}

export function initSettings(api) {
  const store = createSettingsStore(api);

  const $settingsModal = document.getElementById("settingsModal");
  const $settingsClose = document.getElementById("settingsClose");
  const $settingsReset = document.getElementById("settingsReset");
  const $settingsFilter = document.getElementById("settingsFilter");
  const $settingsShowAdvanced = document.getElementById("settingsShowAdvanced");
  const $settingsTabsHost = document.getElementById("settingsTabs");
  const $settingsPanelsHost = document.getElementById("settingsPanels");
  const $renderPane = document.querySelector(".render-pane");
  const $editorPane = document.querySelector(".editor-pane");

  let schema = FALLBACK_SCHEMA;
  let defaultSettings = buildDefaults(schema);
  let currentSettings = { ...defaultSettings };
  let activePane = "render";
  let lastActiveTab = "general";
  let showAdvanced = false;
  let setActiveTab = null;
  let applySettingsFilter = null;
  let cachedFontLists = { notation: [], text: [] };
  let cachedFontDirs = { bundledDir: "", userDir: "" };

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

  function applySettings(settings) {
    currentSettings = { ...defaultSettings, ...(settings || {}) };

    const root = document.documentElement.style;
    root.setProperty("--editor-font-family", currentSettings.editorFontFamily);
    root.setProperty("--editor-font-size", `${currentSettings.editorFontSize}px`);
    root.setProperty("--editor-notes-weight", currentSettings.editorNotesBold ? "600" : "400");
    root.setProperty("--editor-lyrics-weight", currentSettings.editorLyricsBold ? "600" : "400");
    root.setProperty("--render-zoom", String(currentSettings.renderZoom));
    root.setProperty("--editor-zoom", String(currentSettings.editorZoom));

	    for (const [key, meta] of controlByKey.entries()) {
	      const entry = meta.entry;
	      if (!entry || !entry.ui) continue;
	      const kind = entry.ui.input;
	      const value = currentSettings[key];
	      if (kind === "checkbox" && meta.el) {
	        meta.el.checked = Boolean(value);
	      } else if (kind === "percent" && meta.el) {
	        meta.el.value = String(Math.round((Number(value) || 1) * 100));
	      } else if (kind === "color" && meta.el) {
	        meta.el.value = String(value || "#000000");
	      } else if (kind === "select" && meta.el) {
	        meta.el.value = String(value || "");
	      } else if ((kind === "number" || kind === "text") && meta.el) {
	        meta.el.value = String(value == null ? "" : value);
	      }
	    }

    if (globalHeaderView) {
      const nextText = String(currentSettings.globalHeaderText || "");
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
    $settingsModal.classList.add("open");
    $settingsModal.setAttribute("aria-hidden", "false");
    if (typeof setActiveTab === "function") setActiveTab(lastActiveTab);
    setTimeout(() => {
      if ($settingsFilter) {
        $settingsFilter.focus();
        $settingsFilter.select();
      }
    }, 0);
  }

  function closeSettings() {
    if (!$settingsModal) return;
    $settingsModal.classList.remove("open");
    $settingsModal.setAttribute("aria-hidden", "true");
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
        updateSettings({ [entry.key]: Boolean(input.checked) }).catch(() => {});
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
          updateSettings({ [entry.key]: raw / 100 }).catch(() => {});
        } else {
          updateSettings({ [entry.key]: raw }).catch(() => {});
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
        updateSettings({ [entry.key]: input.value || "" }).catch(() => {});
      });
      row.appendChild(input);
      controlByKey.set(entry.key, { entry, el: input });
	      return row;
	    }

    if (kind === "select") {
      const select = document.createElement("select");
      const optionsKey = entry.ui && entry.ui.options ? String(entry.ui.options) : "";
      const isFontSelect = optionsKey === "notationFonts" || optionsKey === "textFonts";

      if (isFontSelect) {
        populateFontSelect(select, optionsKey);
      } else if (Array.isArray(entry.ui && entry.ui.options)) {
        const optDefault = document.createElement("option");
        optDefault.value = "";
        optDefault.textContent = "Default";
        select.appendChild(optDefault);
        for (const name of entry.ui.options) {
          const option = document.createElement("option");
          option.value = String(name || "");
          option.textContent = String(name || "");
          select.appendChild(option);
        }
      }

      select.addEventListener("change", () => {
        updateSettings({ [entry.key]: select.value || "" }).catch(() => {});
      });

      if (!isFontSelect) {
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
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", async () => {
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
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const updateRemoveEnabled = () => {
        const current = String(select.value || "");
        removeBtn.disabled = !/^user:/.test(current);
        removeBtn.title = removeBtn.disabled ? "Only user-installed fonts can be removed." : "";
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
	        updateSettings({ [entry.key]: v }).catch(() => {});
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
      { key: "xml", label: "Import/Export", sections: ["Import/Export"] },
      { key: "header", label: "Header", sections: ["Header"] },
    ];
    const panelKeys = new Set(panels.map((p) => p.key));

    setActiveTab = (name) => {
      lastActiveTab = String(name || "general");
      writeUiState({ activeTab: lastActiveTab });
      const tabs = Array.from($settingsTabsHost.querySelectorAll("[data-settings-tab]"));
      const panels = Array.from($settingsPanelsHost.querySelectorAll("[data-settings-panel]"));
      tabs.forEach((tab) => {
        const active = tab.dataset.settingsTab === name;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.settingsPanel === name);
      });
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
        const normal = entries.filter((e) => !e.advanced && e.ui && e.ui.input !== "code");
        const advanced = entries.filter((e) => e.advanced && e.ui && e.ui.input !== "code");

        const hasCode = entries.some((e) => e.ui && e.ui.input === "code");

        if (normal.length || hasCode) {
          let groupHelp = null;
          if (sectionName === "Header") groupHelp = "Prepended before file headers and tunes during render/playback.";
          if (sectionName === "Playback") groupHelp = "Playback-related settings.";
          const group = createGroup(sectionName, groupHelp);
          for (const entry of normal) {
            const row = createRow(entry);
            if (!row) continue;
            const block = document.createElement("div");
            block.className = "settings-entry";
            block.dataset.settingsSearch = `${entry.key} ${entry.label || ""} ${sectionName}`.toLowerCase();
            block.appendChild(row);
            if (entry.help) {
              const help = document.createElement("div");
              help.className = "settings-help";
              help.textContent = String(entry.help);
              block.appendChild(help);
            }
            group.appendChild(block);
          }

          if (hasCode) {
            const enabledEntry = entries.find((e) => e.key === "globalHeaderEnabled");
            const textEntry = entries.find((e) => e.key === "globalHeaderText");
            if (enabledEntry) {
              const row = createRow(enabledEntry);
              if (row) group.appendChild(row);
            }
            if (textEntry) {
              const editorHost = document.createElement("div");
              editorHost.className = "settings-editor";
              editorHost.setAttribute("aria-label", "Global header");
              group.appendChild(editorHost);

              const updateListener = EditorView.updateListener.of((update) => {
                if (!update.docChanged || suppressGlobalUpdate) return;
                if (globalUpdateTimer) clearTimeout(globalUpdateTimer);
                globalUpdateTimer = setTimeout(() => {
                  if (!globalHeaderView) return;
                  const text = globalHeaderView.state.doc.toString();
                  updateSettings({ globalHeaderText: text }).catch(() => {});
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
            }
          }

          panelEl.appendChild(group);
        }

        if (advanced.length) {
          const details = document.createElement("details");
          details.className = "settings-advanced";
          const summary = document.createElement("summary");
          summary.textContent = `${sectionName} (Advanced)`;
          details.appendChild(summary);
          const inner = document.createElement("div");
          inner.className = "settings-group";
          for (const entry of advanced) {
            const row = createRow(entry);
            if (!row) continue;
            const block = document.createElement("div");
            block.className = "settings-entry";
            block.dataset.settingsSearch = `${entry.key} ${entry.label || ""} ${sectionName}`.toLowerCase();
            block.appendChild(row);
            if (entry.help) {
              const help = document.createElement("div");
              help.className = "settings-help";
              help.textContent = String(entry.help);
              block.appendChild(help);
            }
            inner.appendChild(block);
          }
          details.appendChild(inner);
          panelEl.appendChild(details);
        }
      }

      $settingsPanelsHost.appendChild(panelEl);
    }

    const uiState = readUiState();
    if (uiState && uiState.activeTab) {
      const rawTab = String(uiState.activeTab || "");
      const mapped = rawTab === "main" ? "general" : (rawTab === "globals" ? "header" : rawTab);
      if (panelKeys.has(mapped)) lastActiveTab = mapped;
    }
    setActiveTab(lastActiveTab);

    applySettingsFilter = (raw) => {
      const needle = String(raw || "").trim().toLowerCase();
      const blocks = Array.from($settingsPanelsHost.querySelectorAll(".settings-entry"));
      const groups = Array.from($settingsPanelsHost.querySelectorAll(".settings-group"));
      const advancedBlocks = Array.from($settingsPanelsHost.querySelectorAll(".settings-advanced"));

      const openAdvanced = Boolean(needle) || showAdvanced;
      for (const d of advancedBlocks) d.open = openAdvanced;

      for (const block of blocks) {
        const hay = String(block.dataset.settingsSearch || "");
        const ok = !needle || hay.includes(needle);
        block.style.display = ok ? "" : "none";
      }

      for (const group of groups) {
        const title = group.querySelector(".settings-title");
        const anyVisible = Boolean(group.querySelector(".settings-entry:not([style*='display: none'])"));
        if (title) title.style.display = anyVisible ? "" : "none";
      }

      for (const d of advancedBlocks) {
        if (!openAdvanced) {
          d.style.display = "none";
          continue;
        }
        if (!needle) {
          d.style.display = "";
          continue;
        }
        const anyVisible = Boolean(d.querySelector(".settings-entry:not([style*='display: none'])"));
        d.style.display = anyVisible ? "" : "none";
      }

      if (needle && typeof setActiveTab === "function") {
        const hasVisibleEntry = (panelKey) => {
          const key = String(panelKey || "");
          const panelEl = $settingsPanelsHost.querySelector(`[data-settings-panel="${key}"]`);
          if (!panelEl) return false;
          return Boolean(panelEl.querySelector(".settings-entry:not([style*='display: none'])"));
        };

        if (!hasVisibleEntry(lastActiveTab)) {
          const firstMatch = panels.find((p) => hasVisibleEntry(p.key));
          if (firstMatch && firstMatch.key && firstMatch.key !== lastActiveTab) {
            setActiveTab(firstMatch.key);
          }
        }
      }
    };
  }

  if ($settingsClose) {
    $settingsClose.addEventListener("click", () => closeSettings());
  }
  if ($settingsModal) {
    $settingsModal.addEventListener("click", (e) => {
      if (e.target === $settingsModal) closeSettings();
    });
    $settingsModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSettings();
      }
    });
  }
  if ($settingsFilter) {
    $settingsFilter.addEventListener("input", () => {
      if (applySettingsFilter) applySettingsFilter($settingsFilter.value);
    });
  }
  if ($settingsShowAdvanced) {
    const uiState = readUiState();
    showAdvanced = Boolean(uiState && uiState.showAdvanced);
    $settingsShowAdvanced.checked = showAdvanced;
    $settingsShowAdvanced.addEventListener("change", () => {
      showAdvanced = Boolean($settingsShowAdvanced.checked);
      writeUiState({ showAdvanced });
      if (applySettingsFilter) applySettingsFilter($settingsFilter ? $settingsFilter.value : "");
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

  store.subscribe((settings) => {
    if (settings) applySettings(settings);
  });

  if ($renderPane) {
    $renderPane.addEventListener("pointerdown", () => { activePane = "render"; });
  }
  if ($editorPane) {
    $editorPane.addEventListener("pointerdown", () => { activePane = "editor"; });
  }

  (async () => {
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
    defaultSettings = buildDefaults(schema);
    buildSettingsUi();
    const settings = await store.get().catch(() => null);
    if (settings) applySettings(settings);
    if (applySettingsFilter && $settingsFilter) applySettingsFilter($settingsFilter.value);
  })();

  return {
    openSettings,
    closeSettings,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    zoomReset,
    setActivePane: (pane) => { activePane = pane; },
  };
}
