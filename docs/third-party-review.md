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
