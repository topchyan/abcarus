# Active third-party patches

## abc2svg SoundFont velocity-layer ordering

- Component: `third_party/abc2svg/snd-1.js`
- Upstream base: abc2svg v1.23.7, check-in `e035e7f60c152376e24975fe427f8f4ec132393f`
- Reason: the velocity-zone sort callback uses a block body without returning the comparison, so `sort()` receives `undefined` and leaves zones in source order
- Patch: `patches/abc2svg/0001-sf2-velocity-sort-return.patch`; the generated-runtime recipe is applied only to the exact upstream `snd-1.js` hash
- Upstream: [ticket e10d681c67](https://chiselapp.com/user/moinejf/repository/abc2svg/tktview/e10d681c675827c2effa16cf1c4db5ef1ba9bf38), initially submitted 2026-11-03
- Removal: remove the recipe after an upstream release returns the comparator result and the unpatched runtime passes the SoundFont gate

## Resolved upstream

- Multivoice `%%multicol` symbol unlinking was fixed by check-in `e871e07473` and is included in v1.23.7.
- Guitar-diagram finger spacing was fixed by check-in `cecc0ec042` and is included in v1.23.7.
