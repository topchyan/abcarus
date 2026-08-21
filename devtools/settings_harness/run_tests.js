#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");

function fail(msg) {
  throw new Error(msg);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

function main() {
  const schemaPath = path.resolve(__dirname, "../../src/main/settings_schema.js");
  const normalizePath = path.resolve(__dirname, "../../src/main/settings_normalize.js");
  const propertiesPath = path.resolve(__dirname, "../../src/main/properties.js");
  const printLayoutPath = path.resolve(__dirname, "../../src/main/print_layout.js");
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { getSettingsSchema, getDefaultSettings } = require(schemaPath);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { normalizeMicrotonalSettings } = require(normalizePath);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { encodePropertiesFromSchema, parseSettingsPatchFromProperties } = require(propertiesPath);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const {
    applyPrintPageMargins,
    normalizePrintPageMargins,
    printPageBodyPadding,
    printPageMarginsUseChromiumDefaults,
    readPrintPageMargins,
  } = require(printLayoutPath);

  const schema = getSettingsSchema();
  assert(Array.isArray(schema) && schema.length > 0, "schema must be a non-empty array");

  const seen = new Set();
  for (const entry of schema) {
    assert(entry && entry.key, "schema entry missing key");
    assert(!seen.has(entry.key), `duplicate key: ${entry.key}`);
    seen.add(entry.key);
  }

  const defaults = getDefaultSettings();
  assert(defaults && typeof defaults === "object", "defaults must be an object");
  for (const entry of schema) {
    assert(Object.prototype.hasOwnProperty.call(defaults, entry.key), `default missing for key: ${entry.key}`);
  }

  // Guard new selection-playback controls to prevent silent schema drift.
  const requiredDefaults = {
    playbackSelectionLoopEnabled: false,
    playbackSelectionSuppressRepeats: true,
    playbackSelectionMuteGchords: false,
    playbackSelectionAllowMidiDrums: false,
    playbackSelectionMutedVoices: "",
    stripImportedMeasureComments: true,
    autoFormatImportedAbc: true,
    printPageMargins: "standard",
  };
  for (const [key, expected] of Object.entries(requiredDefaults)) {
    assert(seen.has(key), `missing schema key: ${key}`);
    assert(
      Object.prototype.hasOwnProperty.call(defaults, key),
      `missing default for key: ${key}`
    );
    const actual = defaults[key];
    assert(
      actual === expected,
      `unexpected default for ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }

  for (const key of ["uiFontFamily", "libraryUiFontFamily"]) {
    const entry = schema.find((item) => item && item.key === key);
    assert(entry && entry.ui && entry.ui.input === "select", `${key} must use a user-facing selector`);
    assert(entry.ui.options === "interfaceFonts", `${key} must use the shared interface font catalog`);
  }

  {
    const source = "<svg></svg>";
    const standard = applyPrintPageMargins(source, "standard");
    const narrow = applyPrintPageMargins(source, "narrow");
    const none = applyPrintPageMargins(source, "none");
    assert(readPrintPageMargins(standard) === "standard", "standard print margins must round-trip");
    assert(readPrintPageMargins(narrow) === "narrow", "narrow print margins must round-trip");
    assert(readPrintPageMargins(none) === "none", "no print margins must round-trip");
    assert(printPageMarginsUseChromiumDefaults(standard), "standard margins must retain Chromium defaults");
    assert(!printPageMarginsUseChromiumDefaults(narrow), "narrow margins must remove Chromium defaults");
    assert(!printPageMarginsUseChromiumDefaults(none), "no margins must remove Chromium defaults");
    assert(printPageBodyPadding(narrow) === "24px", "narrow margins must retain a controlled page inset");
    assert(printPageBodyPadding(none) === "0", "no margins must remove the page inset");
    assert(normalizePrintPageMargins("unknown") === "standard", "invalid margins must fall back safely");
  }

  {
    const next = {
      supportMicrotonalNotation: false,
      makamToolsEnabled: true,
      studyToolsEnabled: true,
    };
    normalizeMicrotonalSettings(next, { supportMicrotonalNotation: false });
    assert(next.supportMicrotonalNotation === false, "canonical microtonal OFF patch must override legacy aliases");
    assert(next.makamToolsEnabled === false, "legacy makam alias must sync to canonical OFF");
    assert(next.studyToolsEnabled === false, "legacy study alias must sync to canonical OFF");
  }

  {
    const source = {
      ...defaults,
      globalHeaderText: "%%gchordfont MuseJazz Text 20\n%%MIDI program 1",
    };
    const exported = encodePropertiesFromSchema(source, schema);
    assert(!exported.includes("globalHeaderText="), "new properties exports must not embed Global Header ABC text");

    const legacy = parseSettingsPatchFromProperties("globalHeaderText=%%gchordfont MuseJazz Text 20", schema);
    assert(legacy.globalHeaderText === "%%gchordfont MuseJazz Text 20", "plain Global Header values must remain readable");
  }

  {
    const next = {
      supportMicrotonalNotation: false,
      makamToolsEnabled: true,
      studyToolsEnabled: false,
    };
    normalizeMicrotonalSettings(next, {});
    assert(next.supportMicrotonalNotation === true, "legacy makam alias must enable canonical microtonal setting");
    assert(next.makamToolsEnabled === true, "legacy makam alias must remain synced ON");
    assert(next.studyToolsEnabled === true, "legacy study alias must sync ON when canonical is ON");
  }

  console.log("% PASS settings schema sanity");
}

try {
  main();
} catch (e) {
  console.log("% FAIL settings schema sanity");
  console.log("% " + String(e && e.message ? e.message : e));
  process.exitCode = 1;
}
