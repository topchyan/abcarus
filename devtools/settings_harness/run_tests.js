#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");

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
  const { normalizeConversionToolSettings, normalizeMicrotonalSettings } = require(normalizePath);
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
    abc2xmlArgs: "",
    xml2abcArgs: "",
    printPageMargins: "standard",
    mobileSetListFolder: "",
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

  {
    const entry = schema.find((item) => item && item.key === "mobileSetListFolder");
    assert(entry && entry.ui && entry.ui.input === "folder", "mobile Set List location must use a folder picker");
  }

  for (const key of ["uiFontFamily", "libraryUiFontFamily"]) {
    const entry = schema.find((item) => item && item.key === key);
    assert(entry && entry.ui && entry.ui.input === "select", `${key} must use a user-facing selector`);
    assert(entry.ui.options === "interfaceFonts", `${key} must use the shared interface font catalog`);
  }

  {
    const abc2xml = schema.find((item) => item && item.key === "abc2xmlArgs");
    const xml2abc = schema.find((item) => item && item.key === "xml2abcArgs");
    assert(abc2xml && abc2xml.ui && abc2xml.ui.placeholder === "e.g. -x -y <value>", "abc2xml placeholder must be an explicit example");
    assert(xml2abc && xml2abc.ui && xml2abc.ui.placeholder === "e.g. -x -b 3", "xml2abc placeholder must be an explicit example");
    assert(/Placeholder text is only an example/i.test(String(abc2xml.help || "")), "abc2xml help must distinguish placeholder from active flags");
    assert(/type -x -b 3/i.test(String(xml2abc.help || "")), "xml2abc help must explain that flags must be typed");
  }

  {
    const next = {
      abc2xmlArgs: "-x -y value",
      xml2abcArgs: "-x -b 3",
      midi2abcArgs: "--meter 4/4",
    };
    normalizeConversionToolSettings(next);
    assert(next.abc2xmlArgs === "-x -y value", "abc2xml flags must survive settings normalization");
    assert(next.xml2abcArgs === "-x -b 3", "xml2abc flags must survive settings normalization");
    assert(next.midi2abcArgs === "--meter 4/4", "midi2abc flags must survive settings normalization");
  }

  {
    const rendererSettingsSource = fs.readFileSync(
      path.resolve(__dirname, "../../src/renderer/settings.js"),
      "utf8"
    );
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, "../../src/main/index.js"), "utf8"
    );
    assert(
      /input\.addEventListener\("input", \(\) => \{\s*stageSetting\(entry\.key, input\.value \|\| ""\);/s.test(rendererSettingsSource),
      "text settings must stage their value while the user types"
    );
    assert(
      /async function updateSettings\(patch\) \{[\s\S]*?await saveState\(\);/s.test(mainSource),
      "settings:update must wait for profile persistence"
    );
  }

  {
    const exported = encodePropertiesFromSchema({
      ...defaults,
      abc2xmlArgs: "-x -y value",
      xml2abcArgs: "-x -b 3",
    }, schema);
    assert(exported.includes("abc2xmlArgs=-x -y value"), "abc2xml flags must export to properties");
    assert(exported.includes("xml2abcArgs=-x -b 3"), "xml2abc flags must export to properties");
    const parsed = parseSettingsPatchFromProperties(exported, schema);
    assert(parsed.abc2xmlArgs === "-x -y value", "abc2xml flags must import from properties");
    assert(parsed.xml2abcArgs === "-x -b 3", "xml2abc flags must import from properties");
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
