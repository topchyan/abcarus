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

module.exports = {
  convertFileToAbc,
  convertAbcToMusicXml,
  transformAbcWithAbc2abc,
  resolveThirdPartyRoot,
  ConversionError,
};
