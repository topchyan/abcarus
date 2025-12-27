const NOTE_BASES = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const STEPS_PER_SEMITONE = 2;
const STEPS_PER_OCTAVE = 24;

const SHARP_MAP = [
  { letter: "C", acc: 0 },
  { letter: "C", acc: 1 },
  { letter: "D", acc: 0 },
  { letter: "D", acc: 1 },
  { letter: "E", acc: 0 },
  { letter: "F", acc: 0 },
  { letter: "F", acc: 1 },
  { letter: "G", acc: 0 },
  { letter: "G", acc: 1 },
  { letter: "A", acc: 0 },
  { letter: "A", acc: 1 },
  { letter: "B", acc: 0 },
];

const FLAT_MAP = [
  { letter: "C", acc: 0 },
  { letter: "D", acc: -1 },
  { letter: "D", acc: 0 },
  { letter: "E", acc: -1 },
  { letter: "E", acc: 0 },
  { letter: "F", acc: 0 },
  { letter: "G", acc: -1 },
  { letter: "G", acc: 0 },
  { letter: "A", acc: -1 },
  { letter: "A", acc: 0 },
  { letter: "B", acc: -1 },
  { letter: "B", acc: 0 },
];

const MAJOR_KEYS = [
  { pc: 0, name: "C", acc: 0, pref: "natural" },
  { pc: 7, name: "G", acc: 1, pref: "sharp" },
  { pc: 2, name: "D", acc: 2, pref: "sharp" },
  { pc: 9, name: "A", acc: 3, pref: "sharp" },
  { pc: 4, name: "E", acc: 4, pref: "sharp" },
  { pc: 11, name: "B", acc: 5, pref: "sharp" },
  { pc: 6, name: "F#", acc: 6, pref: "sharp" },
  { pc: 1, name: "C#", acc: 7, pref: "sharp" },
  { pc: 5, name: "F", acc: 1, pref: "flat" },
  { pc: 10, name: "Bb", acc: 2, pref: "flat" },
  { pc: 3, name: "Eb", acc: 3, pref: "flat" },
  { pc: 8, name: "Ab", acc: 4, pref: "flat" },
  { pc: 1, name: "Db", acc: 5, pref: "flat" },
  { pc: 6, name: "Gb", acc: 6, pref: "flat" },
  { pc: 11, name: "Cb", acc: 7, pref: "flat" },
];

const MINOR_KEYS = [
  { pc: 9, name: "A", acc: 0, pref: "natural" },
  { pc: 4, name: "E", acc: 1, pref: "sharp" },
  { pc: 11, name: "B", acc: 2, pref: "sharp" },
  { pc: 6, name: "F#", acc: 3, pref: "sharp" },
  { pc: 1, name: "C#", acc: 4, pref: "sharp" },
  { pc: 8, name: "G#", acc: 5, pref: "sharp" },
  { pc: 3, name: "D#", acc: 6, pref: "sharp" },
  { pc: 10, name: "A#", acc: 7, pref: "sharp" },
  { pc: 2, name: "D", acc: 1, pref: "flat" },
  { pc: 7, name: "G", acc: 2, pref: "flat" },
  { pc: 0, name: "C", acc: 3, pref: "flat" },
  { pc: 5, name: "F", acc: 4, pref: "flat" },
  { pc: 10, name: "Bb", acc: 5, pref: "flat" },
  { pc: 3, name: "Eb", acc: 6, pref: "flat" },
  { pc: 8, name: "Ab", acc: 7, pref: "flat" },
];

function normalizeKeyPreference(token) {
  if (!token) return "flat";
  if (token.includes("b")) return "flat";
  if (token.includes("#")) return "sharp";
  return "flat";
}

function buildKeySignature(accCount, pref) {
  const map = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  if (pref === "sharp") {
    const order = ["F", "C", "G", "D", "A", "E", "B"];
    for (let i = 0; i < accCount; i += 1) map[order[i]] = 1;
  } else if (pref === "flat") {
    const order = ["B", "E", "A", "D", "G", "C", "F"];
    for (let i = 0; i < accCount; i += 1) map[order[i]] = -1;
  }
  return map;
}

function parseKeyToken(token) {
  if (!token) return null;
  const raw = String(token).trim();
  if (!raw) return null;
  if (/^none$/i.test(raw)) {
    return {
      raw,
      name: "none",
      pc: null,
      acc: 0,
      pref: "flat",
      isMinor: false,
      isNone: true,
      modeSuffix: "",
    };
  }
  const match = raw.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] || "";
  const modeSuffix = match[3] || "";
  const modeLower = modeSuffix.toLowerCase();
  const isMinor = modeLower.startsWith("m") && !modeLower.startsWith("maj");
  const base = NOTE_BASES[letter];
  const acc = accidental === "#" ? 1 : (accidental === "b" ? -1 : 0);
  const pc = (base + acc + 120) % 12;
  const pref = normalizeKeyPreference(accidental || modeSuffix);
  const table = isMinor ? MINOR_KEYS : MAJOR_KEYS;
  const entry = table.find((k) => k.name === `${letter}${accidental}`) || null;
  return {
    raw,
    name: `${letter}${accidental}`,
    pc,
    accCount: entry ? entry.acc : 0,
    pref: entry ? entry.pref : pref,
    isMinor,
    isNone: false,
    modeSuffix,
  };
}

function chooseKeyName(pitchClass, isMinor, prefer) {
  const table = isMinor ? MINOR_KEYS : MAJOR_KEYS;
  const candidates = table.filter((k) => k.pc === pitchClass);
  if (!candidates.length) return { name: "C", accCount: 0, pref: "flat" };
  let best = candidates[0];
  for (const c of candidates) {
    if (c.acc < best.acc) best = c;
    else if (c.acc === best.acc) {
      if (prefer === "flat" && c.pref === "flat") best = c;
      else if (prefer === "sharp" && c.pref === "sharp") best = c;
    }
  }
  return { name: best.name, accCount: best.acc, pref: best.pref };
}

function parseNoteToken(line, index) {
  const accMatch = line.slice(index).match(/^(\^\/|_\/|\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)([0-9/]*\.?[<>]?)/);
  if (!accMatch) return null;
  const token = accMatch[0];
  const accidentalToken = accMatch[1] || "";
  const letter = accMatch[2];
  const octaveMarks = accMatch[3] || "";
  const durationToken = accMatch[4] || "";
  return {
    token,
    accidentalToken,
    letter,
    octaveMarks,
    durationToken,
  };
}

function accidentalToSteps(accidentalToken) {
  if (!accidentalToken) return null;
  if (accidentalToken === "=") return 0;
  if (accidentalToken === "^/") return 1;
  if (accidentalToken === "_/") return -1;
  if (accidentalToken === "^") return 2;
  if (accidentalToken === "^^") return 4;
  if (accidentalToken === "_") return -2;
  if (accidentalToken === "__") return -4;
  return null;
}

function computeOctave(letter, octaveMarks) {
  let octave = letter === letter.toUpperCase() ? 5 : 6;
  for (const mark of octaveMarks) {
    if (mark === ",") octave -= 1;
    else if (mark === "'") octave += 1;
  }
  return octave;
}

function buildKeySigSteps(keySig) {
  const steps = {};
  for (const [letter, semis] of Object.entries(keySig || {})) {
    steps[letter] = semis * STEPS_PER_SEMITONE;
  }
  return steps;
}

function mergeKeyAccidentals(baseSteps, extraSteps) {
  const merged = { ...baseSteps };
  if (extraSteps) {
    for (const [letter, steps] of Object.entries(extraSteps)) {
      merged[letter] = steps;
    }
  }
  return merged;
}

function candidatePenalty(letter, accSteps, prefer) {
  let penalty = 0;
  if (prefer === "flat" && accSteps > 0) penalty += 0.5;
  if (prefer === "sharp" && accSteps < 0) penalty += 0.5;
  if ((letter === "E" || letter === "B") && accSteps === 2) penalty += 2;
  if ((letter === "C" || letter === "F") && accSteps === -2) penalty += 2;
  return penalty;
}

function buildPitchToken(absoluteSteps, prefer, keySig, barAccidentals) {
  const stepInOctave = ((absoluteSteps % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
  const keySigSteps = buildKeySigSteps(keySig);
  const candidates = [];

  for (const letter of Object.keys(NOTE_BASES)) {
    const naturalSteps = NOTE_BASES[letter] * STEPS_PER_SEMITONE;
    for (const accSteps of [-2, -1, 0, 1, 2]) {
      const step = (naturalSteps + accSteps + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
      if (step !== stepInOctave) continue;
      const baseSteps = naturalSteps + accSteps;
      let octave = Math.floor((absoluteSteps - baseSteps) / STEPS_PER_OCTAVE);
      if (!Number.isFinite(octave)) octave = 5;
      const letterKey = `${letter}:${octave}`;
      const keyAcc = keySigSteps[letter] || 0;
      let delta = accSteps - keyAcc;
      if (barAccidentals && barAccidentals.has(letterKey)) {
        delta = accSteps - barAccidentals.get(letterKey);
      }
      const score = Math.abs(delta) * 10 + candidatePenalty(letter, accSteps, prefer);
      candidates.push({
        letter,
        accSteps,
        keyAcc,
        delta,
        score,
        octave,
        letterKey,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  const chosen = candidates[0] || {
    letter: "C",
    accSteps: 0,
    keyAcc: 0,
    delta: 0,
    octave: 5,
    letterKey: "C:5",
  };

  const desiredAcc = chosen.accSteps;

  let accidentalOut = "";
  const barAcc = barAccidentals && barAccidentals.has(chosen.letterKey)
    ? barAccidentals.get(chosen.letterKey)
    : null;
  if (barAcc != null) {
    if (barAcc !== desiredAcc) {
      if (desiredAcc === 0) accidentalOut = "=";
      else if (desiredAcc === 1) accidentalOut = "^/";
      else if (desiredAcc === -1) accidentalOut = "_/";
      else if (desiredAcc > 0) accidentalOut = "^";
      else accidentalOut = "_";
    }
  } else if (desiredAcc !== chosen.keyAcc) {
    if (desiredAcc === 0) accidentalOut = "=";
    else if (desiredAcc === 1) accidentalOut = "^/";
    else if (desiredAcc === -1) accidentalOut = "_/";
    else if (desiredAcc > 0) accidentalOut = "^";
    else accidentalOut = "_";
  }

  let outLetter = chosen.letter;
  let outMarks = "";
  if (chosen.octave >= 6) {
    outLetter = outLetter.toLowerCase();
    outMarks = "'".repeat(chosen.octave - 6);
  } else {
    outMarks = ",".repeat(Math.max(0, 5 - chosen.octave));
  }

  return {
    token: `${accidentalOut}${outLetter}${outMarks}`,
    letterKey: chosen.letterKey,
    desiredAcc,
  };
}

function pickKeyAccidental(stepInOctave, prefer) {
  const candidates = [];
  for (const letter of Object.keys(NOTE_BASES)) {
    const naturalSteps = NOTE_BASES[letter] * STEPS_PER_SEMITONE;
    for (const accSteps of [-2, -1, 0, 1, 2]) {
      const step = (naturalSteps + accSteps + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
      if (step !== stepInOctave) continue;
      const score = Math.abs(accSteps) * 10 + candidatePenalty(letter, accSteps, prefer);
      candidates.push({ letter, accSteps, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || { letter: "C", accSteps: 0, score: 0 };
}

function formatKeyAccidentalToken(accSteps, letter, lowerCase) {
  let accidentalOut = "";
  if (accSteps === 1) accidentalOut = "^/";
  else if (accSteps === -1) accidentalOut = "_/";
  else if (accSteps === 0) accidentalOut = "=";
  else if (accSteps > 0) accidentalOut = "^";
  else if (accSteps < 0) accidentalOut = "_";
  const outLetter = lowerCase ? letter.toLowerCase() : letter.toUpperCase();
  return `${accidentalOut}${outLetter}`;
}

function parseKeyAccidentals(tail, baseOffset) {
  const events = [];
  if (!tail) return events;
  const regex = /(\^\/|_\/|\^{1,2}|_{1,2}|=)([A-Ga-g])/g;
  let match;
  while ((match = regex.exec(tail)) !== null) {
    const accidentalToken = match[1];
    const letter = match[2];
    const accSteps = accidentalToSteps(accidentalToken);
    if (accSteps == null) continue;
    const start = baseOffset + match.index;
    const end = start + match[0].length;
    events.push({
      start,
      end,
      accidentalToken,
      letter,
      accSteps,
      lowerCase: letter === letter.toLowerCase(),
    });
  }
  return events;
}

function transposeKeyAccidentals(keyAccEvents, semitones, keyInfos, preferDefault) {
  const replacements = [];
  const extraAccByKey = new Map();
  for (const event of keyAccEvents || []) {
    const keyInfo = keyInfos[event.keyIndex] || {};
    const prefer = keyInfo.pref === "natural"
      ? preferDefault
      : (keyInfo.pref || preferDefault);
    const baseSteps = NOTE_BASES[event.letter.toUpperCase()] * STEPS_PER_SEMITONE + event.accSteps;
    const transposedSteps = baseSteps + semitones * STEPS_PER_SEMITONE;
    const stepInOctave = ((transposedSteps % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE;
    const chosen = pickKeyAccidental(stepInOctave, prefer);
    const text = formatKeyAccidentalToken(chosen.accSteps, chosen.letter, event.lowerCase);
    replacements.push({
      start: event.start,
      end: event.end,
      text,
    });
    const current = extraAccByKey.get(event.keyIndex) || {};
    current[chosen.letter.toUpperCase()] = chosen.accSteps;
    extraAccByKey.set(event.keyIndex, current);
  }
  return { replacements, extraAccByKey };
}

function parseABCWithMeta(text) {
  const events = [];
  const keyEvents = [];
  const keyAccEvents = [];
  const keyInfos = [];
  let currentKey = parseKeyToken("none");
  let currentKeyIndex = 0;
  keyInfos.push(currentKey);

  let inTextBlock = false;
  let barIndex = 0;
  let barAccidentals = new Map();
  let offset = 0;

  const lines = String(text || "").split(/\r\n|\n|\r/);
  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    const line = lines[lineNo];
    if (/^\s*%%\s*begintext\b/i.test(line)) inTextBlock = true;
    if (inTextBlock) {
      if (/^\s*%%\s*endtext\b/i.test(line)) inTextBlock = false;
      offset += line.length + 1;
      continue;
    }
    if (/^\s*%/.test(line)) {
      offset += line.length + 1;
      continue;
    }
    if (/^\s*[wW]:/.test(line)) {
      offset += line.length + 1;
      continue;
    }

    const headerMatch = line.match(/^\s*([A-Za-z]):/);
    if (headerMatch && headerMatch[1].toUpperCase() !== "K") {
      offset += line.length + 1;
      continue;
    }

    if (/^\s*K:/.test(line)) {
      const match = line.match(/^(\s*K:\s*)(\S+)(.*)$/);
      if (match) {
        const keyToken = match[2];
        const start = offset + match[1].length;
        const end = start + keyToken.length;
        const tail = match[3] || "";
        const accEvents = parseKeyAccidentals(tail, offset + match[1].length + keyToken.length);
        keyEvents.push({
          start,
          end,
          keyIndex: currentKeyIndex + 1,
          raw: keyToken,
        });
        currentKey = parseKeyToken(keyToken) || currentKey;
        const extraAccSteps = {};
        for (const accEvent of accEvents) {
          extraAccSteps[accEvent.letter.toUpperCase()] = accEvent.accSteps;
          keyAccEvents.push({
            ...accEvent,
            keyIndex: currentKeyIndex + 1,
          });
        }
        currentKey = { ...currentKey, extraAccSteps };
        currentKeyIndex += 1;
        keyInfos.push(currentKey);
      }
      offset += line.length + 1;
      continue;
    }

    let i = 0;
    let inQuote = false;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "\"") {
        inQuote = !inQuote;
        i += 1;
        continue;
      }
      if (inQuote) {
        i += 1;
        continue;
      }
      if (!inQuote && ch === "%") break;
      if (!inQuote && ch === "!") {
        const closeIdx = line.indexOf("!", i + 1);
        if (closeIdx > i) {
          i = closeIdx + 1;
          continue;
        }
      }

      if (!inQuote && ch === "[" && /[A-Za-z]:/.test(line.slice(i + 1, i + 3))) {
        const closeIdx = line.indexOf("]", i);
        if (closeIdx > i) {
          const tag = line[i + 1].toUpperCase();
          if (tag === "K") {
            const tokenPart = line.slice(i + 3, closeIdx);
            const token = tokenPart.trim().split(/\s+/)[0] || "";
            const tail = tokenPart.slice(token.length);
            const tokenStart = offset + i + 3;
            const tokenEnd = tokenStart + token.length;
            if (token) {
              keyEvents.push({
                start: tokenStart,
                end: tokenEnd,
                keyIndex: currentKeyIndex + 1,
                raw: token,
                inline: true,
              });
              currentKey = parseKeyToken(token) || currentKey;
              const accEvents = parseKeyAccidentals(tail, tokenEnd);
              const extraAccSteps = {};
              for (const accEvent of accEvents) {
                extraAccSteps[accEvent.letter.toUpperCase()] = accEvent.accSteps;
                keyAccEvents.push({
                  ...accEvent,
                  keyIndex: currentKeyIndex + 1,
                  inline: true,
                });
              }
              currentKey = { ...currentKey, extraAccSteps };
              currentKeyIndex += 1;
              keyInfos.push(currentKey);
            }
          }
          i = closeIdx + 1;
          continue;
        }
      }

      if (!inQuote && ch === "|") {
        barIndex += 1;
        barAccidentals.clear();
        i += 1;
        continue;
      }

      const note = parseNoteToken(line, i);
      if (note) {
        const accDelta = accidentalToSteps(note.accidentalToken);
        const letter = note.letter.toUpperCase();
        const octave = computeOctave(note.letter, note.octaveMarks);
        const keyAccSemi = currentKey && currentKey.isNone ? 0 : buildKeySignature(
          currentKey.accCount || 0,
          currentKey.pref || "flat"
        )[letter];
        const extraKeyAcc = currentKey && currentKey.extraAccSteps
          ? currentKey.extraAccSteps[letter]
          : null;
        const keyAcc = extraKeyAcc != null
          ? extraKeyAcc
          : (keyAccSemi || 0) * STEPS_PER_SEMITONE;
        const barKey = `${letter}:${octave}`;
        let appliedAcc = keyAcc;
        if (accDelta != null) {
          appliedAcc = accDelta;
          barAccidentals.set(barKey, accDelta);
        } else if (barAccidentals.has(barKey)) {
          appliedAcc = barAccidentals.get(barKey);
        }
        const base = NOTE_BASES[letter] * STEPS_PER_SEMITONE;
        const absolutePitch = octave * STEPS_PER_OCTAVE + base + appliedAcc;

        events.push({
          start: offset + i,
          end: offset + i + note.token.length,
          letter: note.letter,
          accidentalToken: note.accidentalToken,
          octaveMarks: note.octaveMarks,
          durationToken: note.durationToken,
          absolutePitch,
          barIndex,
          keyIndex: currentKeyIndex,
        });
        i += note.token.length;
        continue;
      }
      i += 1;
    }
    offset += line.length + 1;
  }

  return { events, keyEvents, keyInfos, keyAccEvents };
}

export function parseABCToPitchEvents(text) {
  return parseABCWithMeta(text).events;
}

export function transposePitchEvents(events, semitones) {
  return events.map((event) => ({
    ...event,
    absolutePitch: event.absolutePitch + semitones * STEPS_PER_SEMITONE,
  }));
}

export function respellPitchEvents(events, options) {
  const replacements = [];
  const keyInfos = options && options.keyInfos ? options.keyInfos : [];
  const mode = options && options.mode ? options.mode : "chromatic";
  const preferDefault = options && options.prefer ? options.prefer : "flat";

  let currentBar = -1;
  let barAccidentals = new Map();

  for (const event of events) {
    if (event.barIndex !== currentBar) {
      currentBar = event.barIndex;
      barAccidentals = new Map();
    }

    const keyInfo = keyInfos[event.keyIndex] || { isNone: true, pref: preferDefault, accCount: 0 };
    const prefer = mode === "chromatic"
      ? preferDefault
      : (keyInfo.pref === "natural" ? preferDefault : keyInfo.pref);
    const baseSig = mode === "chromatic" || keyInfo.isNone
      ? buildKeySignature(0, "flat")
      : buildKeySignature(keyInfo.accCount || 0, keyInfo.pref || "flat");
    const keySig = mergeKeyAccidentals(baseSig, keyInfo.extraAccSteps);

    const base = buildPitchToken(event.absolutePitch, prefer, keySig, barAccidentals);
    if (base.token.startsWith("=") || base.token.startsWith("^") || base.token.startsWith("_")) {
      barAccidentals.set(base.letterKey, base.desiredAcc);
    }
    replacements.push({
      start: event.start,
      end: event.end,
      text: `${base.token}${event.durationToken || ""}`,
    });
  }

  return replacements;
}

function applyReplacements(text, replacements) {
  if (!replacements.length) return text;
  const sorted = replacements.slice().sort((a, b) => b.start - a.start);
  let out = text;
  for (const rep of sorted) {
    out = out.slice(0, rep.start) + rep.text + out.slice(rep.end);
  }
  return out;
}

export function transformTranspose(text, semitones, options = {}) {
  const parsed = parseABCWithMeta(text);
  const prefer = options.prefer || "flat";
  const baseMode = options.mode || "auto";

  const keyInfos = parsed.keyInfos.map((info) => {
    if (!info || info.isNone || /^none$/i.test(info.raw || "")) {
      return { ...info, isNone: true, accCount: 0, pref: prefer, name: "none" };
    }
    return info;
  });

  const outKeyInfos = keyInfos.map((info) => {
    if (!info || info.isNone) return info;
    const mode = info.isMinor ? "minor" : "major";
    const targetPc = (info.pc + semitones + 120) % 12;
    const chosen = chooseKeyName(targetPc, info.isMinor, info.pref || prefer);
    return {
      ...info,
      name: chosen.name,
      accCount: chosen.accCount,
      pref: chosen.pref,
      mode,
      extraAccSteps: info.extraAccSteps,
    };
  });

  const mode = baseMode === "auto"
    ? (outKeyInfos.some((k) => k && !k.isNone) ? "tonal" : "chromatic")
    : baseMode;

  const { replacements: keyAccReplacements, extraAccByKey } = transposeKeyAccidentals(
    parsed.keyAccEvents || [],
    semitones,
    outKeyInfos,
    prefer
  );
  const outKeyInfosWithAcc = outKeyInfos.map((info, index) => {
    if (!info) return info;
    const extraAccSteps = extraAccByKey.get(index) || info.extraAccSteps || {};
    return { ...info, extraAccSteps };
  });

  const transposedEvents = transposePitchEvents(parsed.events, semitones);
  const replacements = respellPitchEvents(transposedEvents, {
    mode,
    prefer,
    keyInfos: outKeyInfosWithAcc,
  });

  const keyReplacements = parsed.keyEvents.map((event) => {
    const info = outKeyInfosWithAcc[event.keyIndex];
    if (!info || info.isNone || /^none$/i.test(info.raw || "")) {
      return { start: event.start, end: event.end, text: "none" };
    }
    const suffix = info.modeSuffix || "";
    return { start: event.start, end: event.end, text: `${info.name}${suffix}` };
  });

  const allReplacements = replacements.concat(keyReplacements, keyAccReplacements);
  return applyReplacements(text, allReplacements);
}
