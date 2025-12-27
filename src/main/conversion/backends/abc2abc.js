const fs = require("fs");
const path = require("path");
const { ConversionError, runProcess, withTempDir } = require("../utils");

function buildArgs(options) {
  const args = [];
  if (options.measuresPerLine) args.push("-n", String(options.measuresPerLine));
  if (options.transposeSemitones != null) args.push("-t", String(options.transposeSemitones));
  if (options.doubleLengths) args.push("-d");
  if (options.halfLengths) args.push("-v");
  if (options.voice) args.push("-V", String(options.voice));
  if (options.renumberX != null) args.push("-X", String(options.renumberX));
  return args;
}

async function transformWithAbc2abc({ executable, abcText, options }) {
  if (!abcText || !String(abcText).trim()) {
    throw new ConversionError(
      "No ABC data to transform.",
      "Add notation to the editor before running abc2abc.",
      "EMPTY_INPUT"
    );
  }
  if (options.doubleLengths && options.halfLengths) {
    throw new ConversionError(
      "Invalid options.",
      "Choose either double or half note lengths, not both.",
      "INVALID_OPTIONS"
    );
  }

  return withTempDir(async (dir) => {
    const inputPath = path.join(dir, "input.abc");
    await fs.promises.writeFile(inputPath, abcText, "utf8");
    const args = [inputPath, ...buildArgs(options)];
    const { stdout, stderr } = await runProcess({
      command: executable,
      args,
      cwd: dir,
    });
    if (!stdout) {
      throw new ConversionError(
        "No output produced.",
        stderr || "abc2abc returned empty output.",
        "NO_OUTPUT"
      );
    }
    return { abcText: stdout, warnings: stderr || undefined };
  });
}

module.exports = { transformWithAbc2abc };
