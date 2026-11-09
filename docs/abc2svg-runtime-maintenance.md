# abc2svg Runtime Maintenance

ABCarus consumes a qualified, immutable abc2svg runtime. Upstream remains the
preferred home for fixes; the local patch queue is an exception mechanism for
release-blocking defects while an upstream correction is pending.

## Layout

- `config/abc2svg-runtime.json` pins the upstream release, check-in, archive
  hash, runtime hashes, and ordered patch queue.
- `patches/abc2svg/` contains reviewable source patches and exact generated
  runtime recipes. Recipes refuse to run when their input hash or replacement
  context differs.
- `third_party/abc2svg/runtime-manifest.json` is the generated provenance copy
  shipped with the desktop runtime.
- `third_party/abc2svg/runtime-files.json` locks every file copied from the
  official distribution archive, including dynamically loaded modules.
- `scripts/abc2svg_runtime.mjs` applies and verifies the pinned runtime.

## Upgrade Procedure

1. Download the candidate archive into the ignored `third_party/_upd/`
   directory. Retain each qualified archive locally for reproducible rollback;
   the manifest records its immutable SHA256 even if the upstream download URL
   later points to a newer release.
2. Run the abc2svg candidate gates and SoundFont A/B checks.
3. Update `config/abc2svg-runtime.json` with the candidate release, archive,
   and unpatched artifact hashes.
4. Remove patches already present upstream. Rebase any remaining recipes on
   the new exact input hashes.
5. Apply the candidate:

   ```sh
   npm run abc2svg:runtime:apply -- --archive /path/to/abc2svg.zip
   ```

6. Run `npm run abc2svg:runtime:verify`, the abc2svg harnesses, and the release
   preflight.
7. In `abcarus-mobile`, run `tool/sync_abc2svg.sh` and its Flutter tests. The
   mobile script rejects runtime files whose hashes differ from the desktop
   manifest.

## Upstream Preservation

Run `npm run abc2svg:mirror` periodically to maintain a complete Fossil mirror
under ignored `scripts/local/upstream-mirrors/`. This mirror is a continuity
backup, not the ABCarus development branch. Qualified releases still enter the
applications only through the archive, manifest, patch, and test procedure
above.

## Patch Admission

A downstream patch requires an automated regression test, an upstream ticket,
an exact upstream base, and a removal condition. Never edit generated files in
`third_party/abc2svg` or `assets/abc2svg` by hand. Regenerate them through the
runtime scripts so desktop and mobile remain byte-identical.

Keep the last qualified runtime available for rollback. Do not consume abc2svg
`tip` automatically.
