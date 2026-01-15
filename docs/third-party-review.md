# Third-party upgrade review (repeatable process)

ABCarus vendors a small set of third-party components under `third_party/`.
Some of them are executed at runtime (e.g. MusicXML converters), so upgrades must be reviewed carefully.

This document defines a lightweight, repeatable upgrade workflow that produces a clear **SAFE / NEEDS PATCH / HOLD**
verdict before updating `third_party/`.

## Scope

Regularly used script/tool components:
- `third_party/abc2svg/` (renderer + playback engine)
- `third_party/abc2xml/abc2xml.py` (ABC → MusicXML)
- `third_party/xml2abc/xml2abc.py` (MusicXML → ABC)

Other vendored assets (CodeMirror, Tabulator, SF2, fonts) should still be reviewed, but they are typically lower risk.

## Workflow

For abc2svg specifically, follow the dedicated “pipeline” playbook:
- `docs/abc2svg-upgrade-playbook.md`

### 1) Collect the candidate upstream package

- Put the upstream archive in `third_party/_upd/` (not committed).
- Keep the original filename and also record the upstream commit/tag in your notes.

Note for `abc2svg`:
- Some upstream archives are **source trees** and do not include the prebuilt runtime files used by ABCarus
  (`abc2svg-1.js`, `snd-1.js`, `MIDI-1.js`, ...). In that case, build the scripts from the source tree
  using its own `./build` script (POSIX shell) or `ninja/samu` as described in the upstream README.
  You do **not** need `samu` if you use `./build`.

### 2) Generate an upgrade report (no changes to `third_party/`)

Run:
- `node scripts/third_party-review.mjs`

To include a specific candidate archive:
- `node scripts/third_party-review.mjs --candidate third_party/_upd/<file>.zip`

If the candidate is an `abc2svg` **source** archive (no `abc2svg-1.js` / `snd-1.js`), you can also build the dist
files from the archive and compare them to the currently vendored runtime files:
- `node scripts/third_party-review.mjs --candidate third_party/_upd/<abc2svg>.zip --abc2svg-build`

To apply a vetted upgrade into `third_party/abc2svg/` (Linux/macOS only; requires `bash`):
- Dry-run: `node scripts/upgrade_abc2svg_from_source_zip.mjs --zip third_party/_upd/<abc2svg>.zip`
- Apply: `node scripts/upgrade_abc2svg_from_source_zip.mjs --zip third_party/_upd/<abc2svg>.zip --apply`

Outputs are written to `scripts/local/third-party-reviews/` by default (not committed).

### 3) Review checklist (what to look for)

For each component:
- Version/ID change (release tag, commit hash, or `VERSION = ...` value).
- Changes in the areas that affect ABCarus behavior:
  - parsing (meter, repeats, inline headers)
  - playback timing, MIDI generation
  - drums/chords handling
  - error reporting format (messages used by our parser)
- Any new files or removed files that might break our integration assumptions.

### 4) Apply the upgrade in a dedicated commit

- Update only the relevant `third_party/<component>/` directory.
- Keep upgrades atomic and easy to revert (one component per commit whenever feasible).

### 5) Run local regression checks

Minimum:
- Open a known-heavy ABC file and confirm render/playback works.
- Confirm the default soundfont loads (no infinite "Loading…") and playback produces audible notes.
- Re-run the known problematic debug dumps for repeats/meter changes.
- Import/export via MusicXML using the bundled Python runtime (PBS).

Harnesses:
- `npm run test:transpose`
- `npm run test:measures`
- `npm run test:settings`

### 6) Verdict

Record a short verdict (SAFE / NEEDS PATCH / HOLD) in the generated report:
- SAFE: upgrade is compatible and regressions are not observed.
- NEEDS PATCH: upgrade is ok but requires a local workaround or upstream fix.
- HOLD: upgrade breaks important scenarios or introduces regressions; keep the current pinned version.

### 7) Upstream feedback (optional but encouraged)

When reporting bugs upstream, include:
- Minimal reproduction tune (or a minimal excerpt).
- Expected vs actual behavior.
- abc2svg version (`third_party/abc2svg/version.txt`) and OS/runtime details.

#### Known upstream behavior (abc2svg): `K:` must be last before music

We have observed that `abc2svg` playback may fail (e.g. “Playback start failed … reading 'time'”) when a tune has
header fields/directives after `K:` before the first music line, e.g.:

```abc
K:Dm
%%MIDI drum ...
|: ...
```

Real-world files often place `%%MIDI ...` after `K:`. ABCarus therefore:
- Shows a warning in **Scan for Errors** when it detects this pattern.
- Applies a **playback-only** normalization that moves `K:` below subsequent header lines (file is not modified).

Suggested upstream report text:
- “abc2svg playback appears to treat `K:` as the header/body boundary and rejects subsequent header lines (e.g. `%%MIDI`).”
- “Could abc2svg accept header directives after `K:` or emit a clearer error?”

## Playback-focused upgrade smoke tests (abc2svg)

These tests are designed to catch the exact regressions we've seen after abc2svg upgrades:

- **Play starts**: click Play on a real-world file and ensure audio starts within ~1–2 seconds.
- **No unhandled errors**: open a debug dump and ensure `debugLog` has no `unhandledrejection` entries from `third_party/abc2svg/*.js`.
- **Soundfont load**: the default bundled SF2 should not get stuck in "Loading…" forever.
- **Microtonal accidentals**: playback should tolerate common notations (e.g. `^3/4` / `_3/4` are normalized in compat mode).
- **Drums**: if the tune uses `%%MIDI drum...`, confirm drums do not crash playback and are either audible or intentionally disabled by config.
