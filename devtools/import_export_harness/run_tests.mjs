import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/renderer/tools/import_export/import_export_feature.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
const { createImportExportFeature, hasXml2abcBarsPerLineFlag } = await import(`data:text/javascript;base64,${encoded}`);

async function runImportWithArgs(xml2abcArgs) {
  let capturedText = "";
  let transformCalled = false;
  let normalizeCalled = false;
  let alignCalled = false;
  const feature = createImportExportFeature({
    api: {
      pickMusicXmlFiles: async () => ({ ok: true, paths: ["/tmp/example.xml"] }),
      convertMusicXmlFile: async () => ({
        ok: true,
        abcText: [
          "X:1",
          "T:Example",
          "M:4/4",
          "L:1/4",
          "K:C",
          "C D E F | G A B c | c B A G | F E D C |",
          "",
        ].join("\n"),
        sourcePath: "/tmp/example.xml",
      }),
    },
    windowRef: null,
    getSettings: () => ({
      xml2abcArgs,
      autoFormatImportedAbc: true,
      stripImportedMeasureComments: true,
    }),
    getCurrentDoc: () => ({ path: "/tmp/target.abc" }),
    ensureSafeToAbandonCurrentDoc: async () => true,
    requireCleanForFileOp: async () => true,
    confirmImportTarget: async () => "current_file",
    readFile: async () => ({ ok: true, data: "" }),
    writeFile: async () => ({ ok: true }),
    normalizeMeasuresLineBreaks: (text) => {
      normalizeCalled = true;
      return text;
    },
    transformMeasuresPerLine: (text, measuresPerLine) => {
      transformCalled = true;
      return `${text}\n% transformed ${measuresPerLine}`;
    },
    alignBarsInText: (text) => {
      alignCalled = true;
      return text;
    },
    refreshLibraryFile: async () => null,
    withFileLock: async (_filePath, operation) => operation(),
    setActiveTuneText: (text) => {
      capturedText = text;
    },
  });
  await feature.importMusicXml();
  return { capturedText, transformCalled, normalizeCalled, alignCalled };
}

assert.equal(hasXml2abcBarsPerLineFlag("-x -b 3"), true);
assert.equal(hasXml2abcBarsPerLineFlag("-x -b3"), true);
assert.equal(hasXml2abcBarsPerLineFlag("-x -b=3"), true);
assert.equal(hasXml2abcBarsPerLineFlag("-x"), false);

{
  const result = await runImportWithArgs("-x");
  assert.equal(result.transformCalled, true);
  assert.equal(result.normalizeCalled, true);
  assert.equal(result.alignCalled, true);
  assert.match(result.capturedText, /% transformed 4/);
}

{
  const result = await runImportWithArgs("-x -b 3");
  assert.equal(result.transformCalled, false);
  assert.equal(result.normalizeCalled, false);
  assert.equal(result.alignCalled, false);
  assert.doesNotMatch(result.capturedText, /% transformed 4/);
}

console.log("import/export harness: passed");
