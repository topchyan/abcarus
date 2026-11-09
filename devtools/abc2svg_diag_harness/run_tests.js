#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const ABC2SVG_DIR = process.env.ABC2SVG_CANDIDATE_DIR
  ? path.resolve(process.env.ABC2SVG_CANDIDATE_DIR)
  : path.join(ROOT, "third_party", "abc2svg");
const ABC2SVG_PATH = path.join(ABC2SVG_DIR, "abc2svg-1.js");
const DIAG_PATH = path.join(ABC2SVG_DIR, "diag-1.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function render(source) {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(ABC2SVG_PATH, "utf8"), sandbox, { filename: "abc2svg-1.js" });
  vm.runInContext(fs.readFileSync(DIAG_PATH, "utf8"), sandbox, { filename: "diag-1.js" });

  const output = [];
  const errors = [];
  const abc = new sandbox.abc2svg.Abc({
    img_out(value) { output.push(value); },
    err(value) { errors.push(String(value || "")); },
    errmsg(value) { errors.push(String(value || "")); },
    anno_start() {},
    anno_stop() {},
  });
  abc.tosvg("test", source);
  return { markup: output.join(""), errors };
}

const SAMPLE = `%%diagram 6
%%setdiag Do 032010 ,0 032010
X:1
M:4/4
L:1/4
K:C
"Do"C x |
`;

const LYRIC_HYPHEN_DIRECTIVE = process.env.ABC2SVG_CANDIDATE_DIR ? "%%hyphens 1" : "%%minhyphen 999";
const LYRIC_FONT_CHANGE_SAMPLE = `%%setfont-1 sans 22
${LYRIC_HYPHEN_DIRECTIVE}
X:1
T:abc2svg Lyrics Fix Test
M:4/4
L:1/4
K:C
C D E F | G A B c |
w:Hel-$1lo world a- gain now done end
`;

const MULTIVOICE_MULTICOL_SAMPLE = `X:1
M:3/4
L:1/16
%%score { (S A) | (T B) }
V:S clef=treble
V:A clef=treble
V:T clef=bass
V:B clef=bass
K:Gmin
[V:S] B3 A G4 G4 |]
[V:A] D3 C B,4 D4 |]
[V:T] G,3 G, G,4 G,4 |]
[V:B] G,,3 G,, G,,4 B,,4 |]
%%vskip 20
%%multicol start
%%begintext
Column one
%%endtext
%%multicol new
%%begintext
Column two
%%endtext
%%multicol end
`;

try {
  const { markup, errors } = render(SAMPLE);
  assert(errors.length === 0, `diagram sample reported errors: ${errors.join("; ")}`);
  const match = markup.match(/<text x="-12,-8,-4,0,4,8" y="-26" class="fng">([\s\S]*?)<\/text>/);
  assert(match, "custom diagram finger labels were not rendered");
  assert(match[1] === "\u00a032\u00a01\u00a0", `finger placeholders are not preserved: ${JSON.stringify(match[1])}`);
  assert(!match[1].includes(" "), "collapsible ASCII spaces remain in finger labels");
  console.log("% PASS abc2svg diagram harness: unused finger positions use non-breaking spaces");

  const lyricRender = render(LYRIC_FONT_CHANGE_SAMPLE);
  assert(lyricRender.errors.length === 0, `lyric sample reported errors: ${lyricRender.errors.join("; ")}`);
  assert(!lyricRender.markup.includes("&lt;tspan"), "lyric font markup leaked into visible text");
  assert(!lyricRender.markup.includes("&lt;/tspan&gt;"), "closing lyric font markup leaked into visible text");
  assert(
    />Hel<\/text>/.test(lyricRender.markup) && /<tspan\b[^>]*>lo<\/tspan>/.test(lyricRender.markup),
    `mixed-font lyric was not rendered as SVG text spans: ${lyricRender.markup.match(/<text[^>]*>[^<]*Hel[\s\S]{0,240}/)?.[0] || "lyric SVG not found"}`
  );
  assert(/>a<\/(?:text|tspan)>/.test(lyricRender.markup), "lyric lost the first hyphenated syllable");
  assert(/>gain<\/(?:text|tspan)>/.test(lyricRender.markup), "lyric lost the second hyphenated syllable");
  console.log("% PASS abc2svg lyric harness: font changes and hyphens do not leak SVG markup");

  const multicolRender = render(MULTIVOICE_MULTICOL_SAMPLE);
  assert(multicolRender.errors.length === 0, `multivoice multicol sample reported errors: ${multicolRender.errors.join("; ")}`);
  assert(multicolRender.markup.includes("Column one"), "first multicol text block was not rendered");
  assert(multicolRender.markup.includes("Column two"), "second multicol text block was not rendered");
  console.log("% PASS abc2svg multivoice harness: vskip before multicol does not crash symbol unlinking");
} catch (error) {
  console.error("% FAIL abc2svg diagram harness:", error && error.message ? error.message : String(error));
  process.exit(1);
}
