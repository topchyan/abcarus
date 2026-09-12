import {
  NOTE_BASES,
  baseId53ForNaturalLetter,
  buildEffectiveKeyMicroMap53FromKBody,
  computeOctave,
  parseAccidentalPrefix53,
  parseNoteTokenAt53,
  transposeChordText,
} from "../../transpose.mjs";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const KEY_DISPLAY_LETTERS = {
  A: "A",
  B: "B",
  C: "c",
  D: "d",
  E: "e",
  F: "f",
  G: "g",
};

function mod(value, modulus) {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
}

function microPrefix(micro) {
  const value = Number(micro) || 0;
  if (value === 0) return "=";
  if (value === 2) return "^/";
  if (value === -2) return "_/";
  return value > 0 ? `^${value}` : `_${-value}`;
}

function shiftLetter(letter, shift) {
  const index = LETTERS.indexOf(String(letter || "").toUpperCase());
  return index < 0 ? String(letter || "").toUpperCase() : LETTERS[mod(index + shift, 7)];
}

function transformedKeyMap(sourceMap, deltaCommas, letterShift) {
  const target = {};
  for (let index = 0; index < LETTERS.length; index += 1) {
    const sourceLetter = LETTERS[index];
    const sourceOctave = 5;
    const targetDiatonic = (sourceOctave * 7) + index + letterShift;
    const targetOctave = Math.floor(targetDiatonic / 7);
    const targetLetter = LETTERS[mod(targetDiatonic, 7)];
    const sourceAbsolute = (sourceOctave * 53)
      + baseId53ForNaturalLetter(sourceLetter)
      + Number(sourceMap[sourceLetter] || 0);
    const targetNatural = (targetOctave * 53) + baseId53ForNaturalLetter(targetLetter);
    const micro = sourceAbsolute + deltaCommas - targetNatural;
    if (micro !== 0) target[targetLetter] = micro;
  }
  return target;
}

function splitComment(text) {
  const source = String(text || "");
  const index = source.indexOf("%");
  return index < 0
    ? { head: source, comment: "" }
    : { head: source.slice(0, index), comment: source.slice(index) };
}

function isKeyAccidentalToken(token) {
  return /^(?:(?:\^\^|__|\^\/|_\/|\^-?\d+(?:\/\d+)?|_-?\d+(?:\/\d+)?|\^|_|=)[A-Ga-g])+$/.test(token);
}

function rewriteKeyBody(body, deltaCommas, letterShift) {
  const source = String(body || "");
  const { head, comment } = splitComment(source);
  const leading = (head.match(/^\s*/) || [""])[0];
  const trailing = (head.match(/\s*$/) || [""])[0];
  const tokens = head.trim().split(/\s+/).filter(Boolean);
  const first = tokens.shift() || "none";
  if (/^[A-Za-z][\w-]*=/.test(first)) return null;

  const sourceMap = buildEffectiveKeyMicroMap53FromKBody(head);
  const targetMap = transformedKeyMap(sourceMap, deltaCommas, letterShift);
  const preserved = tokens.filter((token) => (
    !isKeyAccidentalToken(token)
    && !/^(?:major|minor|maj|min|m)$/i.test(token)
  ));
  const accidentals = LETTERS
    .filter((letter) => Number(targetMap[letter] || 0) !== 0)
    .map((letter) => `${microPrefix(targetMap[letter])}${KEY_DISPLAY_LETTERS[letter]}`);
  const outputTokens = ["none", ...accidentals, ...preserved];
  return {
    text: `${leading}${outputTokens.join(" ")}${trailing}${comment}`,
    sourceMap,
    targetMap,
  };
}

function serializeNote(letter, octave, prefix, duration) {
  let outputLetter = letter;
  let marks = "";
  if (octave >= 6) {
    outputLetter = outputLetter.toLowerCase();
    marks = "'".repeat(Math.max(0, octave - 6));
  } else {
    marks = ",".repeat(Math.max(0, 5 - octave));
  }
  return `${prefix}${outputLetter}${marks}${duration || ""}`;
}

function voiceState(context) {
  const id = context.voiceId || "";
  if (!context.voiceBars.has(id)) context.voiceBars.set(id, { read: {}, write: {} });
  return context.voiceBars.get(id);
}

function resetCurrentBar(context) {
  context.voiceBars.set(context.voiceId || "", { read: {}, write: {} });
}

function transformMusicSegment(segment, context, semitones) {
  const source = String(segment || "");
  const state = voiceState(context);
  let output = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] === "\"") {
      const close = source.indexOf("\"", index + 1);
      if (close >= 0) {
        const annotation = source.slice(index + 1, close);
        output += `\"${transposeChordText(annotation, semitones, "flat")}\"`;
        index = close + 1;
        continue;
      }
    }
    if (source[index] === "!") {
      const close = source.indexOf("!", index + 1);
      if (close >= 0) {
        output += source.slice(index, close + 1);
        index = close + 1;
        continue;
      }
    }
    const note = parseNoteTokenAt53(source, index);
    if (!note) {
      output += source[index];
      index += 1;
      continue;
    }

    const sourceLetter = note.letter.toUpperCase();
    const sourceOctave = computeOctave(note.letter, note.octaveMarks);
    const sourceBarKey = `${sourceLetter}:${sourceOctave}`;
    const explicit = parseAccidentalPrefix53(note.accPrefix, NOTE_BASES[sourceLetter]);
    let sourceMicro = Number(context.sourceKeyMap[sourceLetter] || 0);
    if (Object.prototype.hasOwnProperty.call(state.read, sourceBarKey)) sourceMicro = state.read[sourceBarKey];
    if (explicit.explicit) {
      sourceMicro = explicit.micro;
      state.read[sourceBarKey] = sourceMicro;
    }

    const sourceDiatonic = (sourceOctave * 7) + LETTERS.indexOf(sourceLetter);
    const targetDiatonic = sourceDiatonic + context.letterShift;
    const targetOctave = Math.floor(targetDiatonic / 7);
    const targetLetter = shiftLetter(sourceLetter, context.letterShift);
    const sourceAbsolute = (sourceOctave * 53) + baseId53ForNaturalLetter(sourceLetter) + sourceMicro;
    const targetNatural = (targetOctave * 53) + baseId53ForNaturalLetter(targetLetter);
    const targetMicro = sourceAbsolute + context.deltaCommas - targetNatural;
    const targetBarKey = `${targetLetter}:${targetOctave}`;
    const currentTargetMicro = Object.prototype.hasOwnProperty.call(state.write, targetBarKey)
      ? state.write[targetBarKey]
      : Number(context.targetKeyMap[targetLetter] || 0);
    const needsAccidental = targetMicro !== currentTargetMicro;
    const prefix = needsAccidental ? microPrefix(targetMicro) : "";
    if (needsAccidental) state.write[targetBarKey] = targetMicro;
    output += serializeNote(targetLetter, targetOctave, prefix, note.duration);
    index = note.end;
  }
  return output;
}

function updateVoiceFromField(body, context) {
  const voice = String(body || "").trim().split(/\s+/)[0];
  if (voice) context.voiceId = voice;
}

function transformMusicLine(line, context, semitones) {
  const source = String(line || "");
  let output = "";
  let segmentStart = 0;
  let index = 0;
  const flush = (end) => {
    if (end > segmentStart) output += transformMusicSegment(source.slice(segmentStart, end), context, semitones);
    segmentStart = end;
  };

  while (index < source.length) {
    if (source[index] === "%") {
      flush(index);
      output += source.slice(index);
      return output;
    }
    if (source[index] === "[" && /[A-Za-z]:/.test(source.slice(index + 1, index + 3))) {
      const close = source.indexOf("]", index + 3);
      if (close >= 0) {
        flush(index);
        const tag = source[index + 1].toUpperCase();
        const body = source.slice(index + 3, close);
        if (tag === "K") {
          const rewritten = rewriteKeyBody(body, context.deltaCommas, context.letterShift);
          if (rewritten) {
            context.sourceKeyMap = rewritten.sourceMap;
            context.targetKeyMap = rewritten.targetMap;
            context.voiceBars.clear();
            output += `[K:${rewritten.text}]`;
          } else {
            output += source.slice(index, close + 1);
          }
        } else {
          output += source.slice(index, close + 1);
          if (tag === "V") updateVoiceFromField(body, context);
        }
        index = close + 1;
        segmentStart = index;
        continue;
      }
    }
    if (source[index] === "|") {
      flush(index);
      output += "|";
      index += 1;
      segmentStart = index;
      resetCurrentBar(context);
      continue;
    }
    index += 1;
  }
  flush(source.length);
  return output;
}

export function transformTurkishNotation53(text, direction, options = {}) {
  const mode = String(direction || "");
  if (mode !== "toConcert" && mode !== "toBolahenk") {
    throw new Error(`Unknown Turkish notation conversion direction: ${mode || "(empty)"}`);
  }
  const source = String(text || "");
  const inherited = String(options.headerText || "");
  const edoText = `${inherited}\n${source}`;
  if (!/^\s*%%\s*MIDI\s+temperamentequal\s+53\s*$/mi.test(edoText)) {
    throw new Error("Bolahenk/concert conversion requires %%MIDI temperamentequal 53.");
  }

  const toConcert = mode === "toConcert";
  const context = {
    deltaCommas: toConcert ? -22 : 22,
    letterShift: toConcert ? -3 : 3,
    sourceKeyMap: {},
    targetKeyMap: {},
    voiceId: "",
    voiceBars: new Map(),
  };
  const semitones = toConcert ? -5 : 5;
  return source.split(/(\r\n|\n|\r)/).map((line) => {
    if (/^(?:\r\n|\n|\r)$/.test(line)) return line;
    const field = line.match(/^\s*([A-Za-z]):([\s\S]*)$/);
    if (field) {
      const tag = field[1].toUpperCase();
      if (tag === "K") {
        const rewritten = rewriteKeyBody(field[2], context.deltaCommas, context.letterShift);
        if (!rewritten) return line;
        context.sourceKeyMap = rewritten.sourceMap;
        context.targetKeyMap = rewritten.targetMap;
        context.voiceBars.clear();
        return line.slice(0, line.indexOf(":") + 1) + rewritten.text;
      }
      if (tag === "V") updateVoiceFromField(field[2], context);
      return line;
    }
    if (/^\s*%/.test(line)) return line;
    return transformMusicLine(line, context, semitones);
  }).join("");
}
