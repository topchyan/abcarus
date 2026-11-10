# Active third-party patches

## abc2svg SoundFont velocity-layer ordering

- Component: `third_party/abc2svg/snd-1.js`
- Upstream base: abc2svg v1.23.7, check-in `e035e7f60c152376e24975fe427f8f4ec132393f`
- Reason: the velocity-zone sort callback uses a block body without returning the comparison, so `sort()` receives `undefined` and leaves zones in source order
- Patch: `patches/abc2svg/0001-sf2-velocity-sort-return.patch`; the generated-runtime recipe is applied only to the exact upstream `snd-1.js` hash
- Upstream: [ticket e10d681c67](https://chiselapp.com/user/moinejf/repository/abc2svg/tktview/e10d681c675827c2effa16cf1c4db5ef1ba9bf38), initially submitted 2026-11-03
- Removal: remove the recipe after an upstream release returns the comparator result and the unpatched runtime passes the SoundFont gate

## abc2svg SoundFont envelope note-off

- Component: `third_party/abc2svg/snd-1.js`
- Upstream base: abc2svg v1.23.7, check-in `e035e7f60c152376e24975fe427f8f4ec132393f`
- Reason: attack, hold, or decay automation may extend beyond a short note; abc2svg then schedules release without cancelling those later events, allowing the gain to rise again after note-off and producing an audible echo
- Patch: `patches/abc2svg/0002-sf2-envelope-noteoff.patch`; the generated-runtime recipe is chained after patch 0001 and applies only to its exact output hash
- Patch: `patches/abc2svg/0003-sf2-release-scale.patch`; exposes the bounded per-SoundFont Note fade control (`100%` preserves the SoundFont value)
- Verification: the playback harness runs a short note through bundled `TimGM6mb.sf2` and requires the gain envelope to be held at note-off before release
- Upstream: not submitted yet
- Removal: remove the recipe after upstream truncates SF2 gain automation at note-off and the unpatched runtime passes the SoundFont envelope gate

## Resolved upstream

- Multivoice `%%multicol` symbol unlinking was fixed by check-in `e871e07473` and is included in v1.23.7.
- Guitar-diagram finger spacing was fixed by check-in `cecc0ec042` and is included in v1.23.7.
