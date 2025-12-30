const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const {
  ConversionError,
  resolvePythonExecutable,
  resolveNodeExecutable,
  parseArgString,
  resolveExecutable,
} = require("./utils");
const { convertAbcToMusicXml: runAbcToMusicXml } = require("./backends/abc2xml");
const { convertMusicXmlToAbc } = require("./backends/xml2abc");
const { transformWithAbc2abc } = require("./backends/abc2abc");

const TOOL_SCRIPTS = {
  abc2xml: ["abc2xml.py"],
  xml2abc: ["xml2abc.py"],
};

function resolveThirdPartyRoot() {
  const devRoot = path.join(app.getAppPath(), "third_party");
  const unpacked = path.join(process.resourcesPath || "", "app.asar.unpacked", "third_party");
  if (app.isPackaged && fs.existsSync(unpacked)) return unpacked;
  if (fs.existsSync(devRoot)) return devRoot;
  return devRoot;
}

function resolveScriptPath(toolKey) {
  const candidates = TOOL_SCRIPTS[toolKey] || [];
  const root = resolveThirdPartyRoot();
  for (const filename of candidates) {
    const scriptPath = path.join(root, toolKey, filename);
    if (fs.existsSync(scriptPath)) return scriptPath;
  }
  const tried = candidates.length
    ? candidates.map((name) => path.join(root, toolKey, name)).join(", ")
    : path.join(root, toolKey);
  throw new ConversionError(
    "Converter not found.",
    `Missing ${toolKey} at ${tried}`,
    "CONVERTER_MISSING"
  );
}

async function convertFileToAbc({ kind, inputPath, args }) {
  const python = await resolvePythonExecutable();
  const extraArgs = parseArgString(args);
  if (kind === "musicxml" || kind === "mxl") {
    const scriptPath = resolveScriptPath("xml2abc");
    return convertMusicXmlToAbc({ python, scriptPath, inputPath, extraArgs });
  }
  throw new ConversionError(
    "Unsupported import format.",
    `Unknown import kind: ${kind}`,
    "UNSUPPORTED_KIND"
  );
}

async function convertAbcToMusicXml({ abcText, args }) {
  const python = await resolvePythonExecutable();
  const scriptPath = resolveScriptPath("abc2xml");
  const extraArgs = parseArgString(args);
  return runAbcToMusicXml({ python, scriptPath, abcText, extraArgs });
}

async function transformAbcWithAbc2abc({ abcText, options }) {
  const thirdPartyRoot = resolveThirdPartyRoot();
  const bundledCandidates = process.platform === "win32"
    ? [path.join(thirdPartyRoot, "abcMIDI", "bin", "abc2abc.exe")]
    : [path.join(thirdPartyRoot, "abcMIDI", "bin", "abc2abc")];
  const systemCandidates = process.platform === "win32" ? ["abc2abc.exe", "abc2abc"] : ["abc2abc"];
  const candidates = [...bundledCandidates, ...systemCandidates];
  const executable = await resolveExecutable(candidates);
  return transformWithAbc2abc({ executable, abcText, options });
}

async function checkConversionTools() {
  const result = {
    python: { ok: false, path: null, error: "", detail: "", code: "" },
    abc2abc: { ok: false, path: null, error: "", detail: "", code: "" },
    abc2xml: { ok: false, path: null, error: "", detail: "", code: "" },
    xml2abc: { ok: false, path: null, error: "", detail: "", code: "" },
  };

  const thirdPartyRoot = resolveThirdPartyRoot();
  const bundledAbc2abc = process.platform === "win32"
    ? [path.join(thirdPartyRoot, "abcMIDI", "bin", "abc2abc.exe")]
    : [path.join(thirdPartyRoot, "abcMIDI", "bin", "abc2abc")];
  const systemAbc2abc = process.platform === "win32" ? ["abc2abc.exe", "abc2abc"] : ["abc2abc"];
  const abc2abcCandidates = [...bundledAbc2abc, ...systemAbc2abc];

  try {
    const python = await resolvePythonExecutable();
    result.python = { ok: true, path: python };
  } catch (e) {
    result.python = {
      ok: false,
      path: null,
      error: e && e.message ? e.message : "Python not found.",
      detail: e && e.detail ? e.detail : "",
      code: e && e.code ? e.code : "",
    };
  }

  try {
    const exe = await resolveExecutable(abc2abcCandidates);
    result.abc2abc = { ok: true, path: exe };
  } catch (e) {
    result.abc2abc = {
      ok: false,
      path: null,
      error: e && e.message ? e.message : "abc2abc not found.",
      detail: e && e.detail ? e.detail : "",
      code: e && e.code ? e.code : "",
    };
  }

  try {
    const scriptPath = resolveScriptPath("abc2xml");
    result.abc2xml = { ok: true, path: scriptPath };
  } catch (e) {
    result.abc2xml = {
      ok: false,
      path: null,
      error: e && e.message ? e.message : "abc2xml not found.",
      detail: e && e.detail ? e.detail : "",
      code: e && e.code ? e.code : "",
    };
  }

  try {
    const scriptPath = resolveScriptPath("xml2abc");
    result.xml2abc = { ok: true, path: scriptPath };
  } catch (e) {
    result.xml2abc = {
      ok: false,
      path: null,
      error: e && e.message ? e.message : "xml2abc not found.",
      detail: e && e.detail ? e.detail : "",
      code: e && e.code ? e.code : "",
    };
  }

  return result;
}

module.exports = {
  convertFileToAbc,
  convertAbcToMusicXml,
  transformAbcWithAbc2abc,
  resolveThirdPartyRoot,
  ConversionError,
  checkConversionTools,
};
