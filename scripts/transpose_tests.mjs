import assert from "assert";
import {
  transformTranspose,
  parseABCToPitchEvents,
  getDefaultTransposeSupport,
  getNativeTransposeSupport,
  detectKnownMakamKeyProfile53,
  buildEffectiveKeyMicroMap53FromKBody,
  parseNoteTokenAt53,
  parseAccidentalPrefix53,
  computeOctave,
  baseId53ForNaturalLetter,
  NOTE_BASES,
} from "../src/renderer/transpose.mjs";

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function parseAbsolute53Pitches(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/);
  let keyMap = {};
  let barMap = {};
  const out = [];
  for (const line of lines) {
    const km = line.match(/^\s*K:(.*)$/);
    if (km) {
      keyMap = buildEffectiveKeyMicroMap53FromKBody(km[1]);
      barMap = {};
      continue;
    }
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "%") break;
      if (ch === "|") {
        barMap = {};
        i += 1;
        continue;
      }
      const note = parseNoteTokenAt53(line, i);
      if (!note) {
        i += 1;
        continue;
      }
      const upper = note.letter.toUpperCase();
      const pc = NOTE_BASES[upper];
      const explicit = parseAccidentalPrefix53(note.accPrefix, pc);
      const octave = computeOctave(note.letter, note.octaveMarks);
      const barKey = `${upper}:${octave}`;
      let micro = 0;
      if (explicit.explicit) {
        micro = explicit.micro;
        barMap[barKey] = micro;
      } else if (Object.prototype.hasOwnProperty.call(barMap, barKey)) {
        micro = barMap[barKey];
      } else if (Object.prototype.hasOwnProperty.call(keyMap, upper)) {
        micro = keyMap[upper];
      }
      out.push(octave * 53 + baseId53ForNaturalLetter(upper) + micro);
      i = note.end;
    }
  }
  return out;
}

run("parses pitch events", () => {
  const events = parseABCToPitchEvents("K:none\nCDE\n");
  assert.strictEqual(events.length, 3);
});

run("chromatic transpose K:none (+1, flat)", () => {
  const input = "X:1\nK:none\nCDEFGABc\n";
  const expected = "X:1\nK:none\n_D_EF_G_A_Bc_d\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("tonal transpose K:C (+1 -> Db)", () => {
  const input = "X:1\nK:C\nCDEFGABc\n";
  const expected = "X:1\nK:Db\nDEFGABcd\n";
  const output = transformTranspose(input, 1, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("tonal transpose keeps implied key accidental suppressed in target major key", () => {
  const input = "X:1\nK:G\nF G A B|F\n";
  const expected = "X:1\nK:Ab\nG A B c|G\n";
  const output = transformTranspose(input, 1, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("tonal transpose keeps implied key accidental suppressed in target minor key", () => {
  const input = "X:1\nK:Em\nF G A B|F\n";
  const expected = "X:1\nK:Fm\nG A B c|G\n";
  const output = transformTranspose(input, 1, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("tonal transpose preserves explicit sharp sevenths in separated minor keys", () => {
  const input = "X:1\nK:G Minor\n^F G ^f g ^C C\n";
  const expected = "X:1\nK:A Minor\n^G A ^g a ^D D\n";
  const output = transformTranspose(input, 2, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("tonal transpose emits natural when source accidental becomes covered by target key", () => {
  const input = "X:1\nK:C\n^C D E F\n";
  const expected = "X:1\nK:Db\n=D E F G\n";
  const output = transformTranspose(input, 1, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("tonal transpose rewrites inline key changes with key-aware spelling", () => {
  const input = "X:1\nK:C\nC D [K:G] F G A |\n";
  const expected = "X:1\nK:Db\nD E [K:Ab] G A B |\n";
  const output = transformTranspose(input, 1, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("default transpose support allows 12-EDO major/minor and K:none", () => {
  assert.deepStrictEqual(
    getDefaultTransposeSupport("X:1\nK:C\nCDE\n"),
    { ok: true, edo: 12 }
  );
  assert.deepStrictEqual(
    getDefaultTransposeSupport("X:1\nK:Am\nABC\n"),
    { ok: true, edo: 12 }
  );
  assert.deepStrictEqual(
    getDefaultTransposeSupport("X:1\nK:none\nABC\n"),
    { ok: true, edo: 12 }
  );
});

run("default transpose support rejects modal keys", () => {
  const out = getDefaultTransposeSupport("X:1\nK:Ddor\nF C F C\n");
  assert.strictEqual(out.ok, false);
  assert.match(out.reason, /major, minor, or K:none/i);
});

run("default transpose support rejects microtonal temperament", () => {
  const out = getDefaultTransposeSupport("X:1\n%%MIDI temperamentequal 24\nK:C\nCDE\n");
  assert.strictEqual(out.ok, false);
  assert.match(out.reason, /12-EDO/i);
});

run("native transpose support inherits 53-TET from file header for microtonal tune", () => {
  const out = getNativeTransposeSupport("X:1\nK:C _4B^4f^4c\nA B c d\n", {
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.deepStrictEqual(out, { ok: true, edo: 53 });
});

run("native transpose support treats western tune in 53-TET file as 12-EDO", () => {
  const out = getNativeTransposeSupport("X:53\nT:Tico-Tico No Fuba\nK:DMinor\nA^GA | BA2d |\n", {
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.deepStrictEqual(out, { ok: true, edo: 12 });
});

run("native transpose support allows local 12-EDO override inside 53-TET file", () => {
  const out = getNativeTransposeSupport("X:1\n%%MIDI temperamentequal 12\nK:C\nCDE\n", {
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.deepStrictEqual(out, { ok: true, edo: 12 });
});

run("53-TET detects Hicaz key profile from canonical key signature", () => {
  const profile = detectKnownMakamKeyProfile53("C _4B^4f^4c");
  assert(profile);
  assert.strictEqual(profile.id, "hicaz");
});

run("53-TET detects Hicaz key profile after transposition", () => {
  const profile = detectKnownMakamKeyProfile53("D ^5B ^4g ^4d");
  assert(profile);
  assert.strictEqual(profile.id, "hicaz");
});

run("53-TET preserves the transposed base key instead of inferring a surrogate key", () => {
  const input = [
    "X:4",
    "G:[makam] Hüseyni",
    "%%MIDI temperamentequal 53",
    "K:Am _1B",
    "e3 f/e/d/ e6 eA fede | d12 | c2d2e2 g2g^f f2=fe | A16 |",
    "",
  ].join("\n");
  const output = transformTranspose(input, -5, { mode: "tonal", prefer: "flat" });
  assert.match(output, /^K:Em \^4f$/m);
  assert.doesNotMatch(output, /^K:none\b/m);
});

run("53-TET prefers target-key spelling and preserves diatonic contour", () => {
  const input = [
    "X:4",
    "%%MIDI temperamentequal 53",
    "L:1/8",
    "K:Am _1B",
    '"Am" e3(3f/e/d/   e6 eA fede |',
    "",
  ].join("\n");
  const output = transformTranspose(input, -2, { mode: "tonal", prefer: "flat" });
  assert.match(output, /^K:Gm _1A$/m);
  assert.match(output, /^"Gm" d3\(3e\/d\/c\/   d6 dG edcd \|$/m);
  assert.doesNotMatch(output, /\^4d|=d/);
});

run("53-TET chooses the simpler enharmonic key and omits redundant modifiers", () => {
  const input = [
    "X:4",
    "%%MIDI temperamentequal 53",
    "L:1/8",
    "K:Am _1B",
    '"Am" e3(3f/e/d/   e6 eA fede |',
    "",
  ].join("\n");
  const output = transformTranspose(input, -3, { mode: "tonal", prefer: "flat" });
  assert.match(output, /^K:F#m \^3g$/m);
  assert.match(output, /^"F#m" c3\(3d\/c\/B\/   c6 cF dcBc \|$/m);
  assert.doesNotMatch(output, /(?:^|\s)[_^=][0-9/]*[dDcCbB](?:[0-9/]|\s|$)/m);
});

run("53-TET transpose uses file header inheritance", () => {
  const input = "X:1\nK:C _4B^4f^4c\nA d ^3f\n";
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
    simplifyDisplayKey53: true,
  });
  assert.match(output, /^K:none$/m);
  assert.match(output, /^_5B _5e _\/g$/m);
});

run("53-TET local 12-EDO override wins over file header", () => {
  const input = "X:1\n%%MIDI temperamentequal 12\nK:C\nCDE\n";
  const expected = "X:1\n%%MIDI temperamentequal 12\nK:Db\nDEF\n";
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.strictEqual(output, expected);
});

run("western tune in inherited 53-TET file uses 12-EDO transpose", () => {
  const input = "X:53\nT:Tico-Tico No Fuba\nK:DMinor\nA^GA | BA2d |\n";
  const expected = "X:53\nT:Tico-Tico No Fuba\nK:EbMinor\nB=AB | cB2e |\n";
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.strictEqual(output, expected);
});

run("53-TET round-trip preserves effective key signature semantics", () => {
  const input = "X:1\nK:C _4B^4f^4c\nA d ^3f\n";
  const up = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  const back = transformTranspose(up, -1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.deepStrictEqual(parseAbsolute53Pitches(back), parseAbsolute53Pitches(input));
});

run("53-TET hicaz excerpt round-trip preserves absolute pitches", () => {
  const input = [
    "X:1",
    "K:C _4B^4f^4c",
    "A d3ed/c/ d2|c/d/e2d/c/ c/B/B/A/ A2|de2g ^3fd ec|d3e/^3f/ a/g/^2f/e/ d2|",
    "ga2=b ag ^2fe|^3fg2a ^1f3/e/ d2|cd2e cB AG|d3/ c/ c/B/B/A/ A4|",
    "",
  ].join("\n");
  const up = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  const back = transformTranspose(up, -1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.deepStrictEqual(parseAbsolute53Pitches(back), parseAbsolute53Pitches(input));
});

run("53-TET hicaz bar 2 keeps transposed B notes out of western C# major defaults", () => {
  const input = [
    "X:1",
    "K:C _4B^4f^4c",
    "A d3ed/c/ d2|c/d/e2d/c/ c/B/B/A/ A2|",
    "",
  ].join("\n");
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
    simplifyDisplayKey53: true,
  });
  assert.match(output, /^K:none _5e _1d$/m);
  assert.match(output, /d\/B\/B\/\^4A\/ A2\|/);
  assert.doesNotMatch(output, /d\/\^4C\/\^4C\/\^4A\//);
  assert.doesNotMatch(output, /_4c/);
  const keyBody = output.match(/^K:(.*)$/m)?.[1] || "";
  assert.deepStrictEqual(buildEffectiveKeyMicroMap53FromKBody(keyBody), { E: -5, D: -1 });
});

run("53-TET surrogate key uses standard signature ordering", () => {
  const input = [
    "X:1",
    "K:C _4B^4f^4c",
    "A d3ed/c/ d2|c/d/e2d/c/ c/B/B/A/ A2|",
    "de2g ^3fd ec|d3e/^3f/ a/g/^2f/e/ d2|",
    "ga2=b ag ^2fe|^3fg2a ^1f3/e/ d2|",
    "cd2e cB AG|d3/ c/ c/B/B/A/ A4|",
    "",
  ].join("\n");
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
    simplifyDisplayKey53: true,
  });
  assert.match(output, /^K:none _5e _1d$/m);
  assert.doesNotMatch(output, /^K:.*_4c/m);
});

run("53-TET prefers non-micro enharmonic spelling for key-derived notes", () => {
  const input = "X:1\nK:C _4B^4f^4c\nB B B|B\n";
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  const musicLine = output.match(/^B B B\|B$/m)?.[0] || "";
  assert.strictEqual(musicLine, "B B B|B");
  assert.doesNotMatch(musicLine, /_4c/i);
});

run("53-TET semitone size follows finalis anchor", () => {
  const input = "X:1\n%%MIDI temperamentequal 53\nK:C\n^C\n";
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
    simplifyDisplayKey53: true,
  });
  assert.match(output, /^D$/m);
  assert.doesNotMatch(output, /_1D/);
});

run("53-TET keeps named perde enharmonic family when useful", () => {
  const input = "X:1\nK:C ^4f\n^4f\n";
  const output = transformTranspose(input, 0, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.match(output, /\^4f/);
  assert.doesNotMatch(output, /_4A|_4a/);
});

run("53-TET +2 round-trip preserves absolute pitches", () => {
  const input = "X:1\nK:C _4B^4f^4c\nA d ^3f\n";
  const options = {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  };
  const direct = transformTranspose(input, 2, options);
  const back = transformTranspose(direct, -2, options);
  assert.deepStrictEqual(parseAbsolute53Pitches(back), parseAbsolute53Pitches(input));
});

run("53-TET bar selector preserves Evic melodic contour across barline", () => {
  const input = [
    "X:1",
    "T:Eviç Seyir",
    "M:4/4",
    "L:1/8",
    "Q:1/4=60",
    "K:C _1B^4f^4c",
    "z2ff      f2f2           | ga/b/  ag    f3/^4e/ d2     |",
    "z=c'  ba       a3/g/ a/g/g/f/ | f3^4e     de        f2   |",
    "z2e^3f g2fe                 | a3g   ^3f3/e/  d2             |",
    "zd2d      d2=cd          | e=f/g/ f/e/d =c/d/c/_2B/ A2 |",
    "zA2A  d4                      | d/=f/e/d/ =c/B/A/G/ F2B2 |",
    "zA2B   =c2BA                | A3/G/ A/G/G/F/ F4             |",
    "",
  ].join("\n");
  const output = transformTranspose(input, -1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.match(output, /\| _4g_4a\/_5b\/  ag/);
  assert.doesNotMatch(output, /\| \^5fg\/a\/  gf/);
});

run("53-TET direct +2 matches two canonical +1 steps", () => {
  const input = [
    "X:1",
    "T:Eviç Seyir",
    "M:4/4",
    "L:1/8",
    "Q:1/4=60",
    "K:C _1B^4f^4c",
    "z2ff      f2f2           | ga/b/  ag    f3/^4e/ d2     |",
    "z=c'  ba       a3/g/ a/g/g/f/ | f3^4e     de        f2   |",
    "z2e^3f g2fe                 | a3g   ^3f3/e/  d2             |",
    "zd2d      d2=cd          | e=f/g/ f/e/d =c/d/c/_2B/ A2 |",
    "zA2A  d4                      | d/=f/e/d/ =c/B/A/G/ F2B2 |",
    "zA2B   =c2BA                | A3/G/ A/G/G/F/ F4             |",
    "",
  ].join("\n");
  const options = {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  };
  const sequential = transformTranspose(transformTranspose(input, 1, options), 1, options);
  const direct = transformTranspose(input, 2, options);
  assert.strictEqual(direct, sequential);
});

run("53-TET bar accidentals are octave-specific", () => {
  const input = [
    "X:1",
    "K:C _1B^4f^4c",
    "d/=f/e/d/ =c/B/A/G/ F2B2 |",
    "",
  ].join("\n");
  const output = transformTranspose(input, 2, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
    simplifyDisplayKey53: true,
  });
  assert.match(output, /\/A\/ \^4G2c2 \|/);
  assert.doesNotMatch(output, /\/A\/ G2c2 \|/);
});

run("53-TET leaves voice field parameters untouched", () => {
  const input = [
    "X:1",
    "K:C _1B^4f^4c",
    "V:1 clef=treble transpose=-17",
    "A B c |",
    "",
  ].join("\n");
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
    headerText: "%%MIDI temperamentequal 53",
  });
  assert.match(output, /^V:1 clef=treble transpose=-17$/m);
  assert.doesNotMatch(output, /=cl\^4e=f=treble/);
});

run("53-TET transposes chord symbols in rest-only bars", () => {
  const input = [
    "X:1",
    "%%MIDI temperamentequal 53",
    "K:F _2B",
    '"Am7" z4 z"Dsus4/G" z4 z |',
    "",
  ].join("\n");
  const output = transformTranspose(input, 1, {
    mode: "tonal",
    prefer: "flat",
  });
  assert.match(output, /"A#m7" z4 z"D#sus4\/G#" z4 z \|/);
  assert.doesNotMatch(output, /"Am7" z4 z"Dsus4\/G" z4 z \|/);
});

run("bar accidentals reset", () => {
  const input = "X:1\nK:C\n^F F F|F\n";
  const expected = "X:1\nK:C\n_G G G|F\n";
  const output = transformTranspose(input, 0, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("key signature accidental defaults", () => {
  const input = "X:1\nK:G\nF F|F\n";
  const expected = "X:1\nK:G\nF F|F\n";
  const output = transformTranspose(input, 0, { mode: "tonal", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("12-EDO extra key accidental suppresses matching transposed note accidentals", () => {
  const input = "X:1\nK:none ^g\nG ^G | A\n";
  const expected = "X:1\nK:none ^d\nD D | E\n";
  const output = transformTranspose(input, -5, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("12-EDO keeps inferred accidentals in the notes instead of changing the key", () => {
  const input = "X:1\nK:none ^g\nB B B B G A F\n";
  const expected = "X:1\nK:none ^d\n^F F F F D E C\n";
  const output = transformTranspose(input, -5, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
  const before = parseABCToPitchEvents(input).map((event) => event.absolutePitch - 10);
  const after = parseABCToPitchEvents(output).map((event) => event.absolutePitch);
  assert.deepStrictEqual(after, before);
});

run("12-EDO omits transposed key accidentals already supplied by the new base key", () => {
  const input = [
    "X:1",
    "K:Gm ^F",
    "|: zd2d cde2 | zc2c cBd2 | zBAG FGA2 | ABce d4 :|",
    "|: zd2A (BG)A2 | zF2G (FE)D2 | zB2B B-BB2 | zA2B (^c2d2) :|",
    "|: zd2d (cd)e2 | zA2B (c=B) c2 | zD2E (FG)A2 | (FG)FE D2-D2 :|",
    "",
  ].join("\n");
  const output = transformTranspose(input, -3, { mode: "tonal", prefer: "flat" });
  assert.match(output, /^K:Em \^D$/m);
  assert.doesNotMatch(output, /^K:.*(?:^|\s)\^F(?:\s|$)/m);

  const before = parseABCToPitchEvents(input).map((event) => event.absolutePitch - 6);
  const after = parseABCToPitchEvents(output).map((event) => event.absolutePitch);
  assert.deepStrictEqual(after, before);
});

run("12-EDO retains a transposed natural that overrides the new base key", () => {
  const input = "X:1\nK:D =F\nF A |\n";
  const output = transformTranspose(input, 2, { mode: "tonal", prefer: "sharp" });
  assert.match(output, /^K:E =G$/m);

  const before = parseABCToPitchEvents(input).map((event) => event.absolutePitch + 4);
  const after = parseABCToPitchEvents(output).map((event) => event.absolutePitch);
  assert.deepStrictEqual(after, before);
});

run("12-EDO repeated transpose does not accumulate redundant key accidentals", () => {
  const input = "X:1\nK:Gm ^F\nF G A B |\n";
  const options = { mode: "tonal", prefer: "flat" };
  const direct = transformTranspose(input, -3, options);
  const repeated = transformTranspose(
    transformTranspose(transformTranspose(input, -1, options), -1, options),
    -1,
    options
  );
  assert.match(direct, /^K:Em \^D$/m);
  assert.ok(!/^K:.*(?:^|\s)\^F(?:\s|$)/m.test(repeated));

  const directPitches = parseABCToPitchEvents(direct).map((event) => event.absolutePitch);
  const repeatedPitches = parseABCToPitchEvents(repeated).map((event) => event.absolutePitch);
  assert.deepStrictEqual(repeatedPitches, directPitches);
});

run("quarter-tone transpose K:none", () => {
  const input = "X:1\nK:none\n^/D _/D | D\n";
  const expected = "X:1\nK:none\n_/E ^/D | _E\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("quarter-tone respell flat preference", () => {
  const input = "X:1\nK:none\n^/C\n";
  const expected = "X:1\nK:none\n^/C\n";
  const output = transformTranspose(input, 0, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("quoted text untouched", () => {
  const input = "X:1\nK:none\n\"CDE\" CDE\n";
  const expected = "X:1\nK:none\n\"CDE\" _D_EF\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("inline directives untouched", () => {
  const input = "X:1\nK:none\n[I:some CDE] CDE\n";
  const expected = "X:1\nK:none\n[I:some CDE] _D_EF\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("bang directives untouched", () => {
  const input = "X:1\nK:none\n!fine! CDE !D.S.alfine!\n";
  const expected = "X:1\nK:none\n!fine! _D_EF !D.S.alfine!\n";
  const output = transformTranspose(input, 1, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});

run("key signature microtonal accidental transposed", () => {
  const input = "X:1\nK:none ^/f clef=treble\nf\n";
  const expected = "X:1\nK:none ^/g clef=treble\ng\n";
  const output = transformTranspose(input, 2, { mode: "chromatic", prefer: "flat" });
  assert.strictEqual(output, expected);
});
