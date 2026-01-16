// Shorthand decorations supported by the bundled abc2svg parser.
// Source: `third_party/abc2svg/core/parse.js` (`char_tb` mapping).
//
// This is intended as seed data for editor helpers (pickers, tooltips, etc.).
// Keep it simple and extend locally as needed (don’t import from `third_party/` at runtime).
export const ABC2SVG_CHAR_DECORATION_SHORTHANDS = [
  { char: ".", abc: "!dot!", name: "dot" },
  { char: "H", abc: "!fermata!", name: "fermata" },
  { char: "L", abc: "!emphasis!", name: "emphasis" },
  { char: "M", abc: "!lowermordent!", name: "lowermordent" },
  { char: "O", abc: "!coda!", name: "coda" },
  { char: "P", abc: "!uppermordent!", name: "uppermordent" },
  { char: "S", abc: "!segno!", name: "segno" },
  { char: "T", abc: "!trill!", name: "trill" },
  { char: "u", abc: "!upbow!", name: "upbow" },
  { char: "v", abc: "!downbow!", name: "downbow" },
  { char: "~", abc: "!gmark!", name: "gmark" },
];

export const ABC2SVG_CHAR_DECORATION_BY_CHAR = Object.fromEntries(
  ABC2SVG_CHAR_DECORATION_SHORTHANDS.map((x) => [x.char, x])
);
