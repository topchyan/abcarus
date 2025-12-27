const fs = require("fs");
const path = require("path");
const {
  ConversionError,
  runPythonScript,
  withTempDir,
  findFirstFileByExt,
} = require("../utils");

async function extractMxlToXml({ python, inputPath, workDir }) {
  const scriptPath = path.join(workDir, "extract_mxl.py");
  const script = `import os
import sys
import zipfile
import xml.etree.ElementTree as ET

mxl_path = sys.argv[1]
out_dir = sys.argv[2]

def pick_rootfile(zf):
    try:
        data = zf.read("META-INF/container.xml")
        tree = ET.fromstring(data)
        for elem in tree.iter():
            if elem.tag.endswith("rootfile") and "full-path" in elem.attrib:
                return elem.attrib["full-path"]
    except Exception:
        return None
    return None

with zipfile.ZipFile(mxl_path) as zf:
    target = pick_rootfile(zf)
    if not target:
        xml_candidates = [n for n in zf.namelist() if n.lower().endswith(".xml")]
        for name in xml_candidates:
            if not name.lower().startswith("meta-inf/"):
                target = name
                break
        if not target and xml_candidates:
            target = xml_candidates[0]
    if not target:
        sys.exit(2)
    zf.extract(target, out_dir)
    print(os.path.join(out_dir, target))
`;
  await fs.promises.writeFile(scriptPath, script, "utf8");
  const { stdout, stderr } = await runPythonScript({
    pythonPath: python,
    scriptPath,
    args: [inputPath, workDir],
    cwd: workDir,
  });
  const xmlPath = stdout.split(/\r?\n/).pop();
  if (!xmlPath) {
    throw new ConversionError(
      "Unable to extract .mxl file.",
      stderr || "No MusicXML found inside the archive.",
      "MXL_EXTRACT_FAILED"
    );
  }
  return xmlPath;
}

async function convertMusicXmlToAbc({ python, scriptPath, inputPath, extraArgs = [] }) {
  if (!inputPath) {
    throw new ConversionError(
      "No input file selected.",
      "Choose a MusicXML file to import.",
      "NO_INPUT"
    );
  }

  return withTempDir(async (dir) => {
    const ext = path.extname(inputPath) || ".xml";
    const tempInput = path.join(dir, `input${ext}`);
    await fs.promises.copyFile(inputPath, tempInput);
    let xmlInputPath = tempInput;
    if (ext.toLowerCase() === ".mxl") {
      xmlInputPath = await extractMxlToXml({ python, inputPath: tempInput, workDir: dir });
    }

    const { stdout, stderr } = await runPythonScript({
      pythonPath: python,
      scriptPath,
      args: [...extraArgs, xmlInputPath],
      cwd: path.dirname(scriptPath),
    });

    let abcText = stdout;
    if (!abcText) {
      const abcPath = await findFirstFileByExt(dir, [".abc"]);
      if (abcPath) abcText = await fs.promises.readFile(abcPath, "utf8");
    }

    if (!abcText) {
      throw new ConversionError(
        "No ABC output produced.",
        "The converter did not return ABC output.",
        "NO_OUTPUT"
      );
    }

    return { abcText, warnings: stderr || undefined };
  });
}

module.exports = { convertMusicXmlToAbc };
