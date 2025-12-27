const fs = require("fs");
const path = require("path");
const {
  ConversionError,
  runPythonScript,
  withTempDir,
  findFirstFileByExt,
} = require("../utils");

async function convertAbcToMusicXml({ python, scriptPath, abcText, extraArgs = [] }) {
  if (!abcText || !String(abcText).trim()) {
    throw new ConversionError(
      "No ABC data to export.",
      "Add notation to the editor before exporting.",
      "EMPTY_INPUT"
    );
  }

  return withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.abc");
    await fs.promises.writeFile(inputPath, abcText, "utf8");

    const { stdout, stderr } = await runPythonScript({
      pythonPath: python,
      scriptPath,
      args: [...extraArgs, inputPath],
      cwd: path.dirname(scriptPath),
    });

    let xmlText = stdout;
    if (!xmlText) {
      const xmlPath = await findFirstFileByExt(dir, [".xml", ".musicxml"]);
      if (xmlPath) xmlText = await fs.promises.readFile(xmlPath, "utf8");
    }

    if (!xmlText) {
      throw new ConversionError(
        "No MusicXML output produced.",
        "The converter did not return XML output.",
        "NO_OUTPUT"
      );
    }

    return { xmlText, warnings: stderr || undefined };
  });
}

module.exports = { convertAbcToMusicXml };
