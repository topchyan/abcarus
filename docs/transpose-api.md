# Portable ABC Transposition API

API identifier: `abcarus.abc-transpose.v1`

The canonical implementation lives in `src/shared/abc-transpose/`. It is a pure
ECMAScript module and does not depend on the DOM, Electron, Node file APIs, or
abc2svg. Desktop score rendering, playback, export, and Set List performance
views must all consume the ABC text returned by this module.

## Public call

```js
import { transposeAbc } from "./src/shared/abc-transpose/index.mjs";

const result = transposeAbc({
  sourceText: tuneAbc,
  headerText: fileHeaderAbc,
  semitones: -3,
  mode: "auto",
  prefer: "flat",
});
```

The call never mutates its input and reports expected validation or notation
failures as `{ ok: false, code, error }`. A successful result contains:

```js
{
  ok: true,
  apiVersion: "abcarus.abc-transpose.v1",
  text: "...derived ABC...",
  semitones: -3,
  edo: 53,
  strategy: "functional-key",
  sourceKey: "Am _1B",
  targetKey: "F#m ^3g"
}
```

`headerText` participates in temperament detection but is not inserted into the
returned tune. The consumer must apply its normal header/render pipeline after
transposition.

## Strategies

- `western`: ordinary 12/24-EDO major, minor, and `K:none` behavior.
- `functional-key`: EDO53 with an explicitly declared major/minor key. Scale
  degrees move into the target key and explicit microtonal deviations remain
  relative to those degrees. This is the performer-readable path.
- `exact-edo53`: EDO53 without an unambiguous Western mode. It retains the
  conservative absolute/profile behavior instead of guessing a tonal function.

## Set List contract

For an `abcarus.setlist.v2` occurrence, pass:

- `item.tune.embeddedAbc` (or the resolved current Library tune) as `sourceText`;
- `item.tune.embeddedHeaderAbc` as `headerText`;
- `item.performance.transposeSemitones` as `semitones`.

Use the returned `text` unchanged as the tune input for notation and playback.
Do not transpose separately in the renderer or player, and do not write the
derived text back to `embeddedAbc` unless the user explicitly replaces the
source tune.

## Cross-client verification

Portable golden cases are stored in
`src/shared/abc-transpose/fixtures/v1.json`. Desktop and mobile must run the same
fixtures. A client is compatible only when every `expectedText` matches exactly;
matching only rendered pitches is insufficient because readable spelling is part
of this contract.

Run the desktop contract check with:

```sh
npm run test:transpose-contract
```
