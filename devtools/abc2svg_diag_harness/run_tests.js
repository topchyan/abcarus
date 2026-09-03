#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const ABC2SVG_PATH = path.join(ROOT, "third_party", "abc2svg", "abc2svg-1.js");
const DIAG_PATH = path.join(ROOT, "third_party", "abc2svg", "diag-1.js");

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

try {
  const { markup, errors } = render(SAMPLE);
  assert(errors.length === 0, `diagram sample reported errors: ${errors.join("; ")}`);
  const match = markup.match(/<text x="-12,-8,-4,0,4,8" y="-26" class="fng">([\s\S]*?)<\/text>/);
  assert(match, "custom diagram finger labels were not rendered");
  assert(match[1] === "\u00a032\u00a01\u00a0", `finger placeholders are not preserved: ${JSON.stringify(match[1])}`);
  assert(!match[1].includes(" "), "collapsible ASCII spaces remain in finger labels");
  console.log("% PASS abc2svg diagram harness: unused finger positions use non-breaking spaces");
} catch (error) {
  console.error("% FAIL abc2svg diagram harness:", error && error.message ? error.message : String(error));
  process.exit(1);
}
