# Active third-party patches

## abc2svg guitar diagram finger spacing

- Component: `third_party/abc2svg/modules/diag.js` and generated `diag-1.js`
- Upstream fix: Fossil check-in `cecc0ec042` (2026-02-07), included in abc2svg v1.23.5
- Reason: preserve unused `%%setdiag` finger positions as non-breaking spaces so Chromium does not collapse them and shift later finger labels to the left (ABCarus #49)
- Removal: drop this backport when the complete vendored abc2svg snapshot is upgraded to v1.23.5 or newer
