# Microtonal Transposition Research

Date: 2026-09-11
Status: Accepted direction; reference validation required before implementation

This direction supersedes the future-development decision in ADR-0014. Existing
behavior remains in place only until a reference-backed replacement is ready.

## User Goal

Let a musician transpose a tune in a known makam to a practical target pitch or
Ahenk while:

- preserving the makam's audible interval relationships as far as the selected
  tuning model permits;
- preserving durak, guclu, yeden, seyir-sensitive spellings, and explicit local
  alterations;
- producing a compact, conventional `K:` signature;
- avoiding a mechanically correct but unreadable forest of inline accidentals;
- keeping rendered notation and playback derived from the same pitch model.

The normal user operation should be `Transpose to...`, expressed as a target
tonic/perde or a conventional Ahenk. Raw EDO-step shifting belongs in an advanced
diagnostic control.

## Mode Detection and Routing

ABCarus must classify the active tune before offering a transpose operation. A
single universal algorithm is unsafe: ordinary 12-EDO transposition destroys
microtonal pitch relationships, while makam-aware respelling adds meaningless
complexity to ordinary tonal music.

The classifier should return evidence and confidence, not only a Boolean:

```text
standard-12       ordinary major/minor/modal ABC
quartertone-24    explicit 24-EDO or unambiguous quarter-tone notation
makam-53          explicit 53-EDO plus a declared/recognized makam profile
generic-edo       explicit EDO, but no culturally specific profile
ambiguous         conflicting or insufficient pitch information
```

Evidence includes:

- effective local and inherited `%%MIDI temperamentequal` directives;
- numeric/fractional microtonal accidentals in notes and `K:`;
- declared makam metadata and a recognized key-signature profile;
- inline `[K:]` changes and mixed tuning contexts;
- unsupported glyph-only or imported notation whose sounding alteration is
  unknown.

Do not infer 12-EDO merely because a tune contains no visible microtonal
accidentals: under an effective 53-EDO directive, natural notes and ordinary
sharp/flat semantics still belong to the 53-EDO playback model. Conversely, do
not infer a specific makam solely from a 53-EDO directive.

### User-facing routing

Use `Auto` as the default and display the detected route near the transpose
controls:

```text
Transpose: Auto (Standard 12-EDO)
Transpose: Auto (53-EDO, Ussak)
Transpose: Needs confirmation
```

- `standard-12`: show the existing simple semitone/key workflow. Do not expose
  makam/Ahenk controls by default.
- `quartertone-24`: preserve quarter-tone offsets and offer target key plus exact
  24-EDO steps in advanced options.
- `makam-53`: default to target durak/perde/Ahenk and a conventional profile.
- `generic-edo`: offer exact EDO-step shift and a target-spelling preview, but do
  not claim makam correctness.
- `ambiguous`: do not mutate the score until the user chooses the tuning model,
  source tonic, and (when relevant) makam.

An explicit mode override may be available, but choosing `Standard 12-EDO` for a
tune containing microtonal evidence must produce a destructive-conversion
warning and require a separate conversion action. It must not be presented as a
normal transpose. Choosing the makam route for an ordinary tune should be hidden
or require the user first to assign a makam/tuning profile.

The preview should state the consequences before applying:

```text
Detected: 53-EDO / Ussak, durak Dugah (A)
Target: Rast (G), bir ses
Exact shift: -9/53 octave (-203.77 cents)
Key signature: K: ...
Inline accidental changes: 3
Pitch loss: none
```

Classification and selection are separate. Automatic detection may suggest the
route, but the user remains authoritative where the evidence is incomplete. A
confirmed choice should be retained for the tune's working session; persistent
storage should use existing portable ABC metadata where possible rather than a
hidden application-only flag.

## Core Finding

An exact transposition always exists inside a complete EDO grid: add one integer
offset to every pitch modulo the number of divisions. What is not unique in
53-EDO is the instruction "transpose by a Western semitone". A 100-cent semitone
is 4.4167 steps of 53-EDO, while the distinct Pythagorean spellings use 4- and
5-comma intervals. For example, relative to C:

```text
C -> Db = 4 steps (90.57 cents)
C -> C# = 5 steps (113.21 cents)
C -> D  = 9 steps (203.77 cents)
```

Therefore a target spelling is part of the requested interval. `C#` and `Db`
must not be reduced to one 12-EDO pitch class before choosing the 53-EDO shift.

The natural-note backbone used by abc2svg's 53-EDO temperament is:

```text
C  D  E  F  G  A  B  C
0  9 18 22 31 40 49 53
```

Its diatonic interval pattern is `9, 9, 4, 9, 9, 9, 4`. Enharmonic black-key
spellings occupy different steps: the sharp-side positions are
`C#=5, D#=14, F#=27, G#=36, A#=45`; the flat-side positions are
`Db=4, Eb=13, Gb=26, Ab=35, Bb=44`.

## Current ABCarus Conflict

Production and diagnostic code currently encode incompatible 53-EDO chromatic
maps:

- `src/renderer/transpose.mjs` constructs the flat-side positions
  `[0,4,9,13,18,22,27,31,35,40,44,49]`, but may subsequently label them with
  sharp tonic names when transposing upward.
- `devtools/truth_scale_53_harness/truth_scale_53.js` uses the sharp-side
  positions `[0,5,9,14,18,22,27,31,36,40,45,49]`.
- Both harnesses pass because each tests its own model. They do not cross-check
  production against one shared reference or abc2svg playback pitches.

The existing finalis-anchored sequence of 4/5-comma "European semitones" is a
useful experiment, but it is not a sufficiently explicit user or domain model.
It can preserve interval vectors while producing the wrong enharmonic tonic and
an unnecessarily complex key signature.

## Required Domain Model

Keep these values separate for every note:

1. Exact sounding pitch: EDO step plus octave, or a rational offset for ABC
   fractional accidentals that do not land on the EDO grid.
2. Written pitch: diatonic letter, octave, and explicit accidental spelling.
3. Effective accidental source: `K:`, inline `[K:]`, bar memory, or explicit note.
4. Optional makam identity: named perde and functional role.

Do not infer sounding pitch from the displayed glyph alone. MusicXML similarly
separates numeric `<alter>` from visual `<accidental>`; imported `sharp-down` or
`flat-up` is a glyph choice unless a usable numeric alteration accompanies it.

## Transposition Operations

### 1. Transpose to tonic/perde (default)

Input:

- declared or confirmed makam;
- source durak pitch and spelling;
- target tonic/perde or Ahenk.

Derive one exact EDO delta from source durak to target durak. Apply that same
delta to every sounding pitch. Derive target diatonic letters from the written
interval/function mapping, then calculate each accidental as the remaining EDO
offset from that letter's natural pitch.

### 2. Exact EDO shift (advanced)

Add an explicitly selected number of EDO steps. Preserve pitch exactly, but warn
that there may be no conventional makam spelling for the result.

### 3. Written musical interval (advanced)

Specify both diatonic displacement and EDO size, for example `major second =
next letter + 9/53`. This is useful when no makam profile is available.

The ambiguous operation `Western semitones +/-N` should not be the primary UI
for 53-EDO. It may remain as a compatibility operation only when its resulting
target tonic and exact comma shift are shown before applying it.

## Makam-Aware Writing

For a recognized makam, transpose a profile rather than guessing each output
note independently. A profile should contain:

- durak, guclu, yeden and expected perde roles;
- relative 53-step positions for stable degrees;
- ascending/descending alternatives where the notation or intonation changes;
- conventional target signatures for supported Ahenk;
- allowed inline deviations and preferred accidental glyph/token for each role.

Build the target `K:` from the transposed profile. Then write ordinary scale
degrees using the key signature and retain only local or seyir-dependent changes
inline. A sequence-level spelling pass may minimize repeated accidentals, but it
must not change exact pitches or makam roles merely to make the page prettier.

If the makam or source durak is uncertain, ask for confirmation or offer only an
exact EDO shift. Do not silently infer a musically authoritative makam from `K:`
or the last note.

## Playback Levels

Separate two promises:

1. **Theoretical 53-EDO:** deterministic and exactly transposable. This is the
   first reliable implementation target and matches abc2svg's equal-temperament
   mechanism.
2. **Performance-informed intonation:** optional tuning profiles learned from or
   selected by recording/makam context. The score spelling remains stable while
   playback applies per-perde deviations from the theoretical grid.

The second level should not block correct 53-EDO transposition. Published pitch
measurements show that performance can vary by makam, phrase, region, and player;
it cannot be reconstructed from an AEU key signature alone.

## EDO-36 Is Not Yarman-36

In true 36-EDO, a 12-EDO semitone is exactly three steps, so equal-temperament
transposition is straightforward. Yarman-36 is a separate, irregular 36-pitch
system made from three tailored twelve-tone layers. It needs a named tuning
profile and lookup table; it must not be implemented as
`%%MIDI temperamentequal 36`.

## Assessment of the Gemini Note

Useful parts:

- uniform modular addition correctly describes transposition inside full 53-EDO;
- representing a makam as relative pitch positions is directionally correct;
- preserving the interval vector is a necessary invariant.

Unsafe or incorrect parts:

- the Rast vector `[9,7,6,9,9,7,6]` is taken from an Arabic-maqam source and is
  presented as if it were the Turkish AEU Rast model. The project data describes
  Turkish Rast using `T,K,S`; in the conventional 53-comma reading this is
  `9,8,5` for the lower tetrachord, not `9,7,6`;
- its "Rast on A to Rast on C" example confuses pitch labels/perde roles and is
  not an attested score pair;
- its Bayati section describes modulation to another maqam, not transposition of
  the same tune;
- claims about exactness "to a cent" and absence of wolf intervals are not
  established by the cited material;
- most citations are forums, Reddit, Wikipedia, or an Arabic-maqam page rather
  than authoritative Turkish transposition examples.

Treat that note as brainstorming, not test data.

## Reference Corpus Plan

Use attested paired examples rather than synthetic scales alone:

1. Turkish Ministry of Education Kanun material: Cargah moved from Kaba Cargah
   to Yegah, with source and target perde sequences stated explicitly.
2. Turkish Ministry of Education Tambur material: Usşak examples in `yerinden`,
   `bir ses`, `dort ses`, and `bes ses` positions on the following textbook
   pages.
3. Yarman-36 paper, Figures 5 and 6: corresponding makam tetrachords and
   pentachords across Supurde, Bolahenk, Davud, Mansur, and Kiz Ahenk. These test
   a different tuning profile and must not be mixed with 53-EDO expected values.
4. SymbTr/CompMusic scores plus linked recordings for Hicaz, Nihavent, Ussak,
   Rast, and Huzzam. Use score pairs for notation checks and recording-derived
   tuning profiles only for optional playback evaluation.
5. A small ABCarus-owned hand-verified corpus: one short phrase and one complete
   tune per makam/Ahenk pair, reviewed aurally by a knowledgeable performer.

Evaluate each pair on independent axes:

- exact interval-vector preservation in the selected tuning;
- correct target durak/guclu/yeden positions;
- conventional target `K:` and accidental count;
- stable melodic contour and readable spelling;
- round trip and composition (`A -> B -> A`, `T(a)+T(b)=T(a+b)`);
- rendered pitch equals playback pitch;
- optional perceptual rating against a reference performance.

## Concrete Attested Examples Found

### Written pedagogical pairs

The Turkish Ministry of Education viola material prints Ussak scales in three
positions on the same page:

- `Yerinden Ussak Dizisi` with E as the Western-pitch tonic used by the exercise;
- `Bir Ses Ussak Dizisi` with D as tonic;
- `Dort Ses Ussak Dizisi` with B as tonic.

This is a useful engraving/spelling reference because the three staves are
explicitly presented as corresponding transpositions. The accompanying text
also notes a pedagogical approximation: comma pitches are moved to their nearest
tempered pitches. That approximation makes this source suitable for checking
letter movement and layout, but not sufficient as the sole 53-EDO sounding-pitch
authority.

The Ministry's Kanun curriculum gives a textual pitch-role pair for Cargah:

```text
source on Kaba Cargah:
Kaba Cargah, Yegah, Huseyni Asiran, Acem Asiran,
Rast, Dugah, Buselik, Cargah

target on Yegah:
Yegah, Huseyni Asiran, Irak, Rast,
Dugah, Buselik, Nim Hicaz, Neva
```

It explicitly requires preserving comma pitches, characteristic intervals,
durak, guclu, and seyir. This is a strong initial role-mapping fixture.

### Real performances in different Ahenk

The open MTG Ottoman-Turkish composition-identification dataset contains one
machine-readable SymbTr score associated with multiple recordings in different
Ahenk, with an independently annotated tonic frequency. Concrete Kiz/Mansur
pairs include:

| Composition | Makam | Mansur tonic | Kiz tonic | Measured shift |
| --- | --- | ---: | ---: | ---: |
| Giriftzen Asim Bey, Pesrev | Rast | 393.0 Hz | 440.0 Hz | 195.57 cents |
| Neyzen Aziz Dede, Saz Semai | Saba | 441.0 Hz | 496.0 Hz | 203.47 cents |
| Buyuk Osman Bey, Pesrev | Saba | 440.0 Hz | 495.0 Hz | 203.91 cents |
| Dede Salih Efendi, Saz Semai | Ussak | 442.0 Hz | 496.0 Hz | 199.55 cents |
| Nikolaki, Pesrev | Buselik | 451.6 Hz | 507.6 Hz | 202.38 cents |
| Kanuni Omer Efendi, Saz Semai | Beyati | 443.8 Hz | 498.9 Hz | 202.61 cents |
| Rauf Yekta, Pesrev | Mahur | 392.0 Hz | 440.0 Hz | 199.98 cents |

The theoretical 9-step 53-EDO shift is 203.77 cents. The recordings cluster near
that value but are not identical to it; this is evidence for separating exact
theoretical transposition from performance tuning rather than changing the
notated interval vector to fit every recording.

These pairs are strong listening references because they are the same work and
same score performed at two tonal levels. They are not written source/target
score pairs: that distinction reflects the traditional workflow rather than a
dataset omission.

## Experimental Validation Before Product Integration

Makam-aware notation transposition must remain an offline experiment until its
musical and notational rules are supported by enough attested examples. It must
not initially replace or extend the production transpose command.

Build a versioned corpus containing three distinct kinds of evidence:

1. **Score-to-score pairs**: the same piece written at two pitch levels by a
   credible editor. These are the primary fixtures for note spelling, key
   signatures, accidentals, durak, guclu, and yeden.
2. **Pedagogical scale and seyir pairs**: explicit source and target forms from
   teaching material. These test individual makam rules but do not by
   themselves validate a complete composition.
3. **Score-to-audio Ahenk pairs**: one canonical score with performances at
   different pitch levels. These validate sounding intervals and tonic shift,
   but must not be treated as proof of a rewritten notation.

For each candidate transformation, retain the source, expected target,
provenance, tuning model, makam, source and target durak, and any editorial
compromises. Compare the generated result on separate axes:

- exact pitch displacement in EDO steps;
- preservation of the makam interval vector and seyir landmarks;
- agreement of durak, guclu, and yeden with the reference;
- note names, glyphs, key signature, and accidental burden;
- round-trip stability, while recognizing that enharmonic spelling may require
  a canonicalization rule;
- listening comparison where an Ahenk recording is available;
- expert review for cases where sources or conventions disagree.

Classify each rule as `observed`, `provisional`, or `confirmed`. A rule should
be considered for production only after it works across multiple compositions,
not merely multiple scales, and has no unexplained pitch or spelling changes.
Until that threshold is reached, expose results only through a diagnostic
report or a developer-side corpus runner, never as a silent editor rewrite.

### Local case study: Tatyos Efendi, Rast Pesrev

The following two independently maintained ABC tunes represent the same work:

- `/home/avetik/Projects/ABC/abc/makams.abc`, `X:1566`, generated from SymbTr
  and written in the file's Bolahenk convention;
- `/home/avetik/Projects/ABC/abc/Ara_Dinkjian_etc.abc`, `X:52`, an Ara Dinkjian
  working version written in concert notation.

The opening maps regularly by a diatonic fourth downward: `D -> A, G -> D,
A -> E, B -> F, c -> G`. The first four bars preserve the same melodic and
rhythmic content; some durations merely use equivalent ABC spellings such as
`F3/E/` and `F>E`.

This is therefore specifically a Bolahenk-to-concert-notation correspondence,
not merely two arbitrary key versions. The regular fourth-down letter mapping
belongs to the notation-system conversion; editorial differences must be
measured only after that conversion has been applied.

A preliminary note-letter comparison, excluding grace-note bodies, maps 606
events through that diatonic shift. This covers 94.7% of the 640 source events
and 91.1% of the 665 target events. LCS matching can overstate agreement in
repetitive passages, so these figures are evidence for detailed alignment, not
a musical correctness score.

The remaining differences include ornamentation, rhythmic spelling, labels,
section representation, and accidental policy. Therefore this pair supports
two different experimental goals:

- generating a pitch- and form-preserving transposed skeleton is plausibly
  deterministic;
- reproducing the particular edited interpretation is not invertible and must
  remain an assisted comparison or editorial operation.

The next analysis must compare resolved 53-EDO pitch events bar by bar, including
key-signature defaults and accidental carry, rather than comparing note letters
alone.

### Additional local correspondence candidates

The `makams.abc` collection is consistently written in Bolahenk notation and
the `Ara_Dinkjian_etc.abc` collection is consistently written in concert
notation. Files in `wip.abc` and `Various.abc` need individual provenance
classification; their written pitch level can still be compared with the two
known conventions.

Preliminary note-letter alignment, excluding grace-note bodies and ignoring
accidental values and duration spelling, gives:

| Work and sources | Best diatonic shift | LCS coverage | Initial use |
| --- | ---: | ---: | --- |
| Andon, Huseyni Pesrev: `Various X:49` -> `makams X:770` | 0 | 98.3% / 95.0% | Same written level; encoding/editorial comparison, not a Bolahenk-to-concert pair |
| Andon, Huseyni Saz Semai: `wip X:77` -> `Ara X:163` | -3 letters | 100% / 100% (314 events) | Manually derived tracing; useful mechanical fixture, not independent validation |
| Andon, Huseyni Saz Semai: `makams X:799` -> `Ara X:163` | -3 letters | 99.3% / 85.7% | Bolahenk-to-concert conversion with additional target material |
| Udi Hrant, Hastayim Yasiyorum: `makams X:584` -> `Ara X:33` | -3 letters | 79.4% / 41.6% | Difficult edition/form alignment case |
| Bimen Sen, Beni Terk Eyledin: `wip X:109` -> `Ara X:184` | -3 letters | 63.2% / 75.4% | Difficult song/ornamentation alignment case |

Here `-3 letters` means a diatonic fourth downward (`A -> E`, `G -> D`, and so
on), not three EDO steps. LCS percentages can overstate similarity in repeated
passages. These results select fixtures for deeper analysis; they do not yet
validate accidentals or sounding pitch.

The `wip X:77` version was manually derived from Ara's concert text. Its exact
agreement is therefore circular evidence: it can test parsing, mapping, and
round trips, but cannot establish that the mapping is musically correct.

The independently created, less literal correspondences are more important for
product acceptance. Their disagreement reflects the actual task: musicians may
need a usable concert-notation part from a large legacy corpus whose Bolahenk
source and target performing edition do not share every ornament, rhythm, or
phrase boundary. Evaluate these pairs by preservation of the makam skeleton and
playable concert result, not by byte-for-byte or note-for-note identity.

Use the manually derived Huseyni Saz Semai pair first as a low-level regression
fixture. Use the Tatyos Rast Pesrev and the independent song/score
correspondences as the musically meaningful acceptance corpus.

### Product priority from the corpus

The primary practical operation is **Convert Bolahenk Notation to Concert
Notation** for existing scanned or digital Turkish repertoire. For ABC input,
this should:

1. resolve the source key signature and carried accidentals into sounding
   pitches under an explicit Bolahenk/53-EDO profile;
2. apply the fixed Bolahenk-to-concert reference mapping without changing the
   makam interval vector;
3. respell the result in a declared concert-notation profile;
4. preserve source form and rhythm rather than inventing an interpretation;
5. produce a conversion report and round-trip comparison.

Optical recognition of scanned notation is a separate upstream problem; the
converter should accept reviewed symbolic input rather than hiding recognition
errors as transposition decisions.

Instrument parts, such as concert-to-written B-flat clarinet, should be a second
explicit mapping after concert conversion. General transposition to another
tonic is a third operation and should be offered only where the tuning and
notation profile can represent the result safely.

### Audit and replacement of the ABCarus Turkish Notation command

The current menu command is a reversible legacy macro, not a semantic
Bolahenk/concert converter. Its implementation:

- scales `M:`, `L:`, and the beat unit in `Q:` by two;
- temporarily changes `%%MIDI temperamentequal 53` to 12;
- invokes the Western transposer by five semitones;
- performs the hard-coded key fragment replacement `_2B <-> ^2f`;
- removes or adds `V: ... transpose=-17`.

That workflow is useful only for the narrow source format for which it was
introduced. Applied to real SymbTr tunes, it changes durations that should stay
unchanged, derives `K:` from the technical ABC key token rather than makam
durak, and does not preserve one exact 53-EDO offset for every note.

A resolved-pitch audit of current `To Concert` output found:

| SymbTr tune | Correct `-22` events | Other pitch deltas |
| --- | ---: | ---: |
| Tatyos Rast Pesrev, `makams X:1566` | 541 / 636 | 95 |
| Andon Huseyni Saz Semai, `makams X:799` | 233 / 271 | 38 |
| Andon Huseyni Pesrev, `makams X:770` | 441 / 483 | 42 |

The command also refuses `makams X:584` because the Western transpose path
mistakes inline `[K:scale=.8]` rendering parameters for a musical key token.
The existing harness passes because it asserts exact text round-trip on one
synthetic legacy-format sample; it does not assert preservation of resolved
53-EDO pitches or compatibility with the Bolahenk corpus.

The legacy macro has now been replaced by a separate fixed-frame 53-EDO
converter. It is available only when **Support microtonal notation** is enabled
and is labelled experimental. The replacement preserves rhythm and voice
attributes, resolves source key/bar accidentals, applies exactly `-22` EDO53
steps from Bolahenk to concert (`+22` in reverse), and emits a target key map
with only necessary body accidentals. It also accepts inline rendering-only
fields such as `[K:scale=.8]` without treating them as key changes.

A resolved-pitch regression run on `makams X:1566`, `X:799`, `X:770`, and
`X:584` found zero events outside the required `-22` offset while preserving
all `M:`, `L:`, `Q:`, and `V:` lines. The checked-in harness includes the
joined SymbTr key-accidental syntax (`_2B^3f`), exact pitch spelling cases,
rhythm preservation, voice-attribute preservation, reverse conversion, and
the experimental feature gate.

The converter remains deliberately narrow: it does not claim to choose a new
makam tonic, adapt Turkish notation to Arabic 24-EDO practice, or validate a
musician's preferred edition. Those remain separate research tasks.

### Rhythmic values are a separate `mertebe` decision

The earlier macro also changed the denominators in `M:`, `L:`, and the beat
unit in `Q:` by a factor of two. Doing all three together is a valid lossless
ABC engraving transform: it changes quarter-shaped values to eighth-shaped
values (or the reverse) without changing relative rhythm or playback time.
It is not, however, an inherent part of Bolahenk/concert pitch conversion.

Turkish teaching material describes 16th-, 8th-, quarter-, and half-note
levels as **mertebe**, selected according to the speed of the piece. Aksak, for
example, may use both `9/8` and `9/4`; the `9/4` level is called Ağır Aksak.
Likewise, descriptions of usul state that the numerator identifies the cycle
while the denominator/mertebe may vary with tempo. Ahenk, by contrast, is
described in the SymbTr literature as a pitch level analogous to Western
transposing instruments.

The local comparison corpus confirms that no single duration factor follows
from the notation frame:

- Tatyos Rast Peşrev is `4/4`, `L:1/8` in both the SymbTr/Bolahenk and Ara
  concert versions;
- Hrant's Hastayım Yaşıyorum is `9/8` in SymbTr and `9/4` in Ara's edition;
- Andon's Hüseyni Saz Semai changes `10/8` to `10/4` in its main section, but
  its fourth section is `6/4` in SymbTr and `6/8` in the manually derived Ara
  transcription.

Therefore the literal Bolahenk/concert converter must preserve rhythmic
values. If ABCarus later exposes notation-value augmentation/diminution, it
should be an explicit independent option, ideally informed by `R:`, usul, and
section-level tempo rather than silently applied to the entire tune.

Sources:

- Turkish Ministry of Education theory text on mertebe:
  https://ogmmateryal.eba.gov.tr/kitap/guzel-sanatlar-lisesi/muzik/9/turk-muzigi-teori/files/basic-html/page58.html
- CompMusic, usul examples and denominator/mertebe:
  https://compmusic.upf.edu/zh-hans/examples-usul-mmt
- Karaosmanoğlu, SymbTr and ahenk pitch levels:
  https://ismir2012.ismir.net/event/papers/223_ISMIR_2012.pdf
- Yurdagül, warnings about identifying usul during notation transfer:
  https://doi.org/10.31722/ejmd.1335979

### Coordinate-system guard fixture: Rast in Bolahenk

A proposed worked example for Bolahenk incorrectly subtracted the Ahenk offset
from a scale degree expressed relative to the tonic, then interpreted the
result as an absolute note name. Keep this as a regression case: relative makam
steps and absolute 53-EDO pitch classes must never be mixed.

Using the AEU Rast interval vector `[9, 7, 6, 9, 9, 7, 6]`, its cumulative
degrees are `[0, 9, 16, 22, 31, 40, 47, 53]`. If concert `C = 0` and concert
`D = 9`, a Bolahenk realization with Rast sounding on D is:

```text
D      E      F+3    G      A      B      C+3    D
9      18     25     31     40     49     56     62
```

Consequently, the third degree is an altered F, not an E half-flat. A target
tradition may choose a different glyph or retune that degree, but that is a
separate notation/tuning adaptation and must not be hidden inside the Ahenk
offset. A written B-flat clarinet part adds the instrument's defined sounding-
to-written interval after the concert-pitch realization; it does not alter the
makam interval vector.

## Product Consequence: Two Different Commands

For makam repertoire, the safest default operation is often playback
transposition without rewriting the notation:

### Set Play Ahenk / Play Key

- retain the canonical ABC notes and `K:` exactly;
- apply one exact EDO offset during playback;
- label the selected Ahenk and resulting concert durak;
- allow instant comparison with the original;
- avoid all respelling and key-signature damage.

This corresponds to the attested corpus, where one score is performed in Kiz and
Mansur positions.

### Create Transposed Notation Copy

- explicitly create a new written/concert-pitch version;
- require a recognized makam profile and target durak/perde;
- rewrite notes and `K:` using the target profile;
- preview accidental complexity and refuse unsupported mappings.

This operation is useful for musicians who need concert-pitch parts, but it is
more invasive and should not be conflated with Play Key. The non-destructive
playback operation can be delivered and validated before full makam-aware
respelling is considered reliable.

## Sources

- abcMIDI temperament and accidental semantics:
  https://abcmidi.sourceforge.io/
- ABC 2.2 draft, pitch, accidentals, and transposition:
  https://abcnotation.com/wiki/abc:standard:v2.2
- Turkish Ministry of Education Kanun transposition lesson:
  https://tymm.meb.gov.tr/muzik-okullari-bireysel-calgi-egitimi-dersi-kanun-modulu/unite/1284
- Turkish Ministry of Education Tambur transposition lesson:
  https://ogmmateryal.eba.gov.tr/kitap/guzel-sanatlar-lisesi/muzik/12/tambur/files/basic-html/page84.html
- Yarman et al., Yarman-36 Makam Tone-System:
  https://www.ozanyarman.com/files/Yarman36.pdf
- Atli et al., Synthesis of Turkish Makam Music Scores Using an Adaptive Tuning Approach:
  https://www.researchgate.net/publication/318573060_Synthesis_of_Turkish_Makam_Music_Scores_Using_An_Adaptive_Tuning_Approach
- Bozkurt et al., comparison of theoretical models with pitch measurements:
  https://www.tandfonline.com/doi/full/10.1080/09298210903147673
- MusicXML accidental and numeric alteration definitions:
  https://www.musicxml.com/for-developers/alphabetical-index/
