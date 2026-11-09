#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { build } from "esbuild";
import {
  buildTransliteratedTune,
  collectLyricLines,
  hasArmenianLyrics,
  insertTuneAfterOffset,
  joinFileHeaderAndTune,
  prepareTransliteratedCopy,
  suggestTransliteratedFileName,
  transliterateAdditionalText,
  transliterateLyricLines,
} from "../../src/renderer/tools/lyrics_transliteration/lyrics_transliteration_model.mjs";

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("third_party/armenian-transliteration/index.global.js", "utf8"), context);
const api = context.armenianTransliteration;
assert.equal(typeof api?.transliterate, "function");

const source = `X:1
T:Նոր Ծաղիկ
L:1/8
M:4/4
K:Am
C2 D2 E2 F2 |
w:Նոր ծա- ղիկ
G2 A2 B2 c2 |
w:*ցու---ցաւ ա_յսօր
`;
const original = source;
assert.equal(hasArmenianLyrics(source), true);
assert.equal(collectLyricLines(source).length, 2);

const generated = transliterateLyricLines(source, {
  standard: "hubschmann-meillet",
  transliterate: api.transliterate,
});
assert.deepEqual(generated, [
  "w:Nor ca- łik",
  "w:*cʿu---cʿaw a_ysōr",
]);
assert.equal(source, original, "preview generation must not mutate the active tune");
assert.equal(generated.join("\n").replace(/[A-Za-z\s:ʿłō]/g, ""), "-*---_");

const both = buildTransliteratedTune(source, `${generated.join("\n")}\n`, {
  mode: "both",
  profileLabel: "Classical scholarly",
});
assert.match(both, /N:Lyrics transliterated from Armenian \(Classical scholarly, experimental\)\nK:Am/);
assert.match(both, /w:Նոր ծա- ղիկ\nw:Nor ca- łik/);
assert.equal(collectLyricLines(both).length, 4);

const transliteratedOnly = buildTransliteratedTune(source, generated.join("\n"), {
  mode: "transliterated",
  profileLabel: "Classical scholarly",
});
assert.equal(hasArmenianLyrics(transliteratedOnly), false);
assert.equal(collectLyricLines(transliteratedOnly).length, 2);
assert.match(joinFileHeaderAndTune("%%pagewidth 21cm\n", transliteratedOnly), /^%%pagewidth 21cm\n\nX:1/);
assert.equal(suggestTransliteratedFileName("/music/Շարականներ.abc"), "Շարականներ - transliterated.abc");
assert.equal(
  suggestTransliteratedFileName("/music/Շարականներ.abc", {
    xNumber: 1,
    title: "Նոր Ծաղիկ",
    profileId: "bgn-pcgn",
  }),
  "Շարականներ - X1 - Նոր Ծաղիկ - transliterated-bgn-pcgn.abc",
);
assert.match(
  suggestTransliteratedFileName("/music/very-long-source-name.abc", {
    xNumber: 123,
    title: "A".repeat(200),
    profileId: "bgn-pcgn",
  }),
  /transliterated-bgn-pcgn\.abc$/,
);

const extendedText = `X:1
T:Նոր Ծաղիկ
C:Սուրբ Ներսես Շնորհալի
W:Նոր ծաղիկ
K:C
"^Խաղաղ, զմայլանքով" C|
%%center Նոր Ծաղիկ
%%begintext
1. Նոր ծաղիկ
%%endtext`;
const extendedBoth = transliterateAdditionalText(extendedText, {
  mode: "both",
  standard: "bgn-pcgn",
  transliterate: api.transliterate,
});
assert.match(extendedBoth, /^X:1\nT:Nor Tsaghik\nC:Surb Nerses Shnorhali/m);
assert.match(extendedBoth, /W:Նոր ծաղիկ\nW:Nor tsaghik/);
assert.match(extendedBoth, /"\^Khaghagh, zmaylank’ov" C\|/);
assert.match(extendedBoth, /%%center Nor Tsaghik/);
assert.match(extendedBoth, /%%begintext\n1\. Նոր ծաղիկ\n\n1\. Nor tsaghik\n%%endtext/);
const extendedOnly = transliterateAdditionalText(extendedText, {
  mode: "transliterated",
  standard: "bgn-pcgn",
  transliterate: api.transliterate,
});
assert.equal(/[\u0531-\u058f]/u.test(extendedOnly), false);

const prepared = prepareTransliteratedCopy(extendedOnly, { xNumber: 7 });
assert.match(prepared, /^X:7\nT:Nor Tsaghik/);
const inserted = insertTuneAfterOffset(source, prepared, source.length);
assert.match(inserted, /w:\*ցու---ցաւ ա_յսօր\n\nX:7\nT:Nor Tsaghik/);

assert.throws(
  () => buildTransliteratedTune(source, generated[0], { mode: "both" }),
  /Expected 2 generated w: lines/,
);

async function importBundledFeature() {
  const result = await build({
    entryPoints: ["src/renderer/tools/lyrics_transliteration/lyrics_transliteration_feature.js"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const encoded = Buffer.from(result.outputFiles[0].text, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function fakeElement() {
  const listeners = new Map();
  return {
    value: "",
    disabled: false,
    textContent: "",
    innerHTML: "",
    children: [],
    ownerDocument: { createElement: () => fakeElement() },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    removeAttribute() {},
    append(child) { this.children.push(child); },
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatch(type) { listeners.get(type)?.({ target: this, key: "" }); },
    focus() {},
  };
}

const { createLyricsTransliterationFeature } = await importBundledFeature();
const elementKeys = [
  "modal", "closeButton", "profile", "mode", "original", "generated", "score",
  "message", "cancelButton", "saveButton", "insertButton",
];
const elements = Object.fromEntries(elementKeys.map((key) => [key, fakeElement()]));
elements.mode.value = "both";
let written = "";
let selectedTuneId = "";
let saveRuns = 0;
const feature = createLyricsTransliterationFeature({
  elements,
  getEditorText: () => source,
  getHeaderText: () => "",
  getActiveFilePath: () => "/music/Շարականներ.abc",
  getActiveTuneMeta: () => ({ xNumber: 1, title: "Նոր Ծաղիկ", startOffset: 0, endOffset: source.length }),
  getNextXNumber: () => 2,
  isCurrentDocumentDirty: () => true,
  confirmUnsavedChanges: async () => "save",
  performSaveFlow: async () => { saveRuns += 1; return true; },
  renderAbcToSvgMarkup: async () => ({ ok: true, svg: "<svg></svg>", errors: [] }),
  readFile: async () => ({ ok: true, data: source }),
  writeFile: async (_path, data, options) => {
    written = data;
    assert.equal(options.expectedData, source);
    return { ok: true };
  },
  refreshLibraryFile: async () => ({ tunes: [{ id: "original", xNumber: 1 }, { id: "copy", xNumber: 2 }] }),
  selectTune: async (tuneId) => { selectedTuneId = tuneId; return true; },
  transliterationApi: api,
});
await feature.open();
elements.profile.value = "bgn-pcgn";
elements.profile.dispatch("change");
assert.equal(await feature.insertAfterCurrentTune(), true);
assert.equal(saveRuns, 1, "dirty insertion must save before changing the file");
assert.equal(selectedTuneId, "copy", "inserted tune must become active");
assert.match(written, /\n\nX:2\nT:Nor Tsaghik/);
assert.doesNotMatch(written, /Transliterated: BGN\/PCGN/);
assert.match(written, /N:Lyrics transliterated from Armenian \(BGN\/PCGN, experimental\)/);
assert.match(written, /w:Nor tsa- ghik/);

console.log("lyrics transliteration harness: all tests passed");
