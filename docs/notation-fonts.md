# Notation fonts (abc2svg / SMuFL)

ABCarus renders notation via `third_party/abc2svg/abc2svg-1.js`.

abc2svg uses a “music” font for noteheads, clefs, accidentals, rests, etc.
In this repo, the default is abc2svg’s bundled SMuFL-compatible font:
- Source: `third_party/abc2svg/font/abc2svg.sfd`
- Built font: `third_party/abc2svg/abc2svg.ttf`
- Embedded at runtime: `third_party/abc2svg/abc2svg-1.js` defines `cfmt.musicfont` with a `data:` URL.

## Where the hook is

abc2svg treats any `%%...font` directive as a font selector (including `%%musicfont`).
This is implemented in `third_party/abc2svg/abc2svg-1.js`:
- Default format state: `cfmt.musicfont` (near the top-level `cfmt = {...}` init).
- Parser: `Abc.prototype.set_format()` routes `%%musicfont` through `param_set_font()`.
- Font loader: `use_font()` emits `@font-face` when the chosen font has a `src` (url/local/data).

## How to use a different notation font

In ABC, put a `%%musicfont` directive in a place that will affect rendering:
- File header (applies to all tunes in file)
- Tune header (applies to one tune)
- Or via ABCarus Settings → Header → “Global header” (prepended by the app)

Syntax (abc2svg):
```abc
%%musicfont url("../../assets/fonts/notation/Bravura.otf") 24
```

Notes:
- `url(...)` must be the *first* token in the directive (abc2svg checks this).
- The last token is the font size in px (`24` above).
- `local("Bravura") 24` is also supported, but it depends on system-installed fonts.

## How to “add fonts to the project”

1) Place SMuFL notation font files under:
   - `assets/fonts/notation/` (recommended)
2) Keep licensing in mind:
   - Prefer fonts under permissive licenses (e.g. SIL OFL for Bravura).
   - Track attribution in `NOTICE.md` if needed.
3) Use `%%musicfont url("../../assets/fonts/notation/<font-file>") <size>` in the global header or file/tune header.

Why this path works:
- `assets/**` is bundled into packaged builds (`package.json` → `build.files` includes `**/*`).
- abc2svg emits `@font-face` into the SVG style when `%%musicfont url(...)` is used.

## Current state in ABCarus

- UI sets up a CSS `@font-face` for `font-family: "music"` in `src/renderer/style.css`, pointing at `third_party/abc2svg/abc2svg.ttf`.
- However, abc2svg also embeds its own default font via `data:` URL unless overridden by `%%musicfont`.

## UI support (Settings)

ABCarus can optionally inject font directives automatically based on Settings:
- Settings → Header → `Notation font` (maps to `%%musicfont ...`)
- Settings → Header → `Text font` (maps to common `%%...font` directives like `%%textfont`, `%%titlefont`, etc.)

These overrides are:
- applied after the user/global header layers,
- but still overridable per file / per tune by placing the relevant directives in ABC headers.

If we later add a “Notation font” selector in Settings, the safest approach is:
- keep abc2svg upstream untouched,
- and implement selection by injecting an appropriate `%%musicfont ...` line via the existing global header mechanism.
