# Soundfonts

ABCarus uses a General MIDI `.sf2` soundfont for abc2svg playback.

## Bundled soundfont
- The repo bundles `third_party/sf2/TimGM6mb.sf2`.
- Default selection is controlled by settings (`soundfontName`).

## Optional local soundfonts
You can add additional soundfonts locally without committing them to the repo:
- Add the `.sf2` file path to settings (`soundfontPaths`).
- Select the active soundfont via `soundfontName`.

Settings are persisted under `app.getPath("userData")` in `state.json` (see `src/main/index.js`).

## Notes
- Not all soundfonts include good (or any) drum mappings. If drums seem missing, first verify the chosen soundfont supports drums.

