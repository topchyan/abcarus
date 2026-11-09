#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const directory = path.resolve(process.argv[2] || ".");

function readAt(fd, position, length) {
  const buffer = Buffer.alloc(length);
  const count = fs.readSync(fd, buffer, 0, length, position);
  if (count !== length) throw new Error(`Unexpected end of file at ${position}`);
  return buffer;
}

function chunks(fd, start, end) {
  const result = [];
  for (let position = start; position + 8 <= end;) {
    const header = readAt(fd, position, 8);
    const id = header.toString("ascii", 0, 4);
    const size = header.readUInt32LE(4);
    const data = position + 8;
    if (data + size > end) throw new Error(`Invalid ${id} chunk size`);
    const item = { id, size, data };
    if (id === "LIST" || id === "RIFF") item.type = readAt(fd, data, 4).toString("ascii");
    result.push(item);
    position = data + size + (size & 1);
  }
  return result;
}

function requireChunk(table, id) {
  const chunk = table.find((item) => item.id === id);
  if (!chunk) throw new Error(`Missing ${id} chunk`);
  return chunk;
}

function readChunk(fd, chunk) {
  return readAt(fd, chunk.data, chunk.size);
}

function parseGenerators(buffer, start, end) {
  const generators = {};
  for (let index = start; index < end; index += 1) {
    const offset = index * 4;
    const operator = buffer.readUInt16LE(offset);
    if (operator === 43 || operator === 44) {
      generators[operator] = { lo: buffer[offset + 2], hi: buffer[offset + 3] };
    } else {
      generators[operator] = buffer.readInt16LE(offset + 2);
    }
  }
  return generators;
}

function addRange(set, range, allowed) {
  if (!allowed) return;
  const lo = Math.max(0, range?.lo ?? 0);
  const hi = Math.min(127, range?.hi ?? 127);
  for (let key = lo; key <= hi; key += 1) {
    if (allowed.has(key)) set.add(key);
  }
}

function intersectionSize(left, right) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function keyRanges(keys) {
  const sorted = [...keys].sort((left, right) => left - right);
  const ranges = [];
  for (const key of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && key === last[1] + 1) last[1] = key;
    else ranges.push([key, key]);
  }
  return ranges.map(([lo, hi]) => lo === hi ? String(lo) : `${lo}-${hi}`);
}

function allKeys() {
  return new Set(Array.from({ length: 128 }, (_, index) => index));
}

function analyzeSf2(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(fd);
    const riff = readAt(fd, 0, 12);
    if (riff.toString("ascii", 0, 4) !== "RIFF" || riff.toString("ascii", 8, 12) !== "sfbk") {
      throw new Error("Not an SF2 RIFF/sfbk file");
    }
    const riffEnd = Math.min(stat.size, 8 + riff.readUInt32LE(4));
    const top = chunks(fd, 12, riffEnd);
    const pdta = top.find((item) => item.id === "LIST" && item.type === "pdta");
    if (!pdta) throw new Error("Missing LIST/pdta");
    const table = chunks(fd, pdta.data + 4, pdta.data + pdta.size);

    const phdr = readChunk(fd, requireChunk(table, "phdr"));
    const pbag = readChunk(fd, requireChunk(table, "pbag"));
    const pgen = readChunk(fd, requireChunk(table, "pgen"));
    const inst = readChunk(fd, requireChunk(table, "inst"));
    const ibag = readChunk(fd, requireChunk(table, "ibag"));
    const igen = readChunk(fd, requireChunk(table, "igen"));
    const shdr = readChunk(fd, requireChunk(table, "shdr"));

    const instrumentCount = Math.max(0, inst.length / 22 - 1);
    const instrumentCoverage = [];
    for (let instrument = 0; instrument < instrumentCount; instrument += 1) {
      const bagStart = inst.readUInt16LE(instrument * 22 + 20);
      const bagEnd = inst.readUInt16LE((instrument + 1) * 22 + 20);
      const coverage = new Set();
      for (let bag = bagStart; bag < bagEnd; bag += 1) {
        const genStart = ibag.readUInt16LE(bag * 4);
        const genEnd = ibag.readUInt16LE((bag + 1) * 4);
        const generators = parseGenerators(igen, genStart, genEnd);
        const sampleId = generators[53];
        if (sampleId == null || sampleId < 0 || (sampleId + 1) * 46 > shdr.length) continue;
        const sampleType = shdr.readUInt16LE(sampleId * 46 + 44);
        if (sampleType === 2) continue; // abc2svg deliberately ignores right-channel samples.
        addRange(coverage, generators[43], allKeys());
      }
      instrumentCoverage.push(coverage);
    }

    const presetCount = Math.max(0, phdr.length / 38 - 1);
    const presets = [];
    for (let preset = 0; preset < presetCount; preset += 1) {
      const offset = preset * 38;
      const nextOffset = (preset + 1) * 38;
      const name = phdr.toString("latin1", offset, offset + 20).replace(/\0.*$/, "").trim();
      const program = phdr.readUInt16LE(offset + 20);
      const bank = phdr.readUInt16LE(offset + 22);
      const bagStart = phdr.readUInt16LE(offset + 24);
      const bagEnd = phdr.readUInt16LE(nextOffset + 24);
      const total = new Set();
      const accepted = new Set();

      for (let bag = bagStart; bag < bagEnd; bag += 1) {
        const genStart = pbag.readUInt16LE(bag * 4);
        const genEnd = pbag.readUInt16LE((bag + 1) * 4);
        const generators = parseGenerators(pgen, genStart, genEnd);
        const instrument = generators[41];
        if (instrument == null || !instrumentCoverage[instrument]) continue;
        const presetKeys = new Set();
        addRange(presetKeys, generators[43], allKeys());
        for (const key of instrumentCoverage[instrument]) {
          if (!presetKeys.has(key)) continue;
          total.add(key);
          if (!generators[44] || generators[44].lo <= 1) accepted.add(key);
        }
      }

      const missingKeys = total.size - intersectionSize(total, accepted);
      const missing = new Set([...total].filter((key) => !accepted.has(key)));
      let status = "ok";
      if (total.size > 0 && accepted.size === 0) status = "silent";
      else if (missingKeys > 0) status = "partial";
      else if (total.size === 0) status = "empty";
      presets.push({
        bank, program, name, status, playableKeys: total.size, missingKeys,
        missingKeyRanges: keyRanges(missing),
      });
    }

    return { presets };
  } finally {
    fs.closeSync(fd);
  }
}

function summarize(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".sf3") {
    return { file: path.basename(filePath), category: "sf3-unsupported", presets: 0, affected: [] };
  }
  try {
    const analysis = analyzeSf2(filePath);
    const melodic = analysis.presets.filter((preset) => preset.bank !== 128 && preset.status !== "empty");
    const affected = melodic.filter((preset) => preset.status === "silent" || preset.status === "partial");
    const silent = affected.filter((preset) => preset.status === "silent").length;
    const partial = affected.length - silent;
    return {
      file: path.basename(filePath),
      category: silent ? "problematic" : partial ? "partially-problematic" : "no-velocity-layer-issue",
      presets: melodic.length,
      silent,
      partial,
      affected: affected.map(({ bank, program, name, status, missingKeys, missingKeyRanges }) => ({
        bank, program, name, status, missingKeys, missingKeyRanges,
      })),
    };
  } catch (error) {
    return { file: path.basename(filePath), category: "parse-error", error: error.message, presets: 0, affected: [] };
  }
}

const files = fs.readdirSync(directory)
  .filter((name) => /\.sf[23]$/i.test(name))
  .sort((left, right) => left.localeCompare(right))
  .map((name) => path.join(directory, name));

const results = files.map(summarize);
console.log(JSON.stringify({ directory, generatedAt: new Date().toISOString(), results }, null, 2));
