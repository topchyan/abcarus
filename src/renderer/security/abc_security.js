function neutralizeLinePreservingLength(line) {
  const source = String(line || "");
  if (!source.length) return source;
  return `%${" ".repeat(source.length - 1)}`;
}

function neutralizeUnsafeAbcBlocks(text) {
  const source = String(text || "");
  const parts = source.split(/(\r\n|\n|\r)/);
  let blockedType = "";

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index];
    const startsUnsafeBlock = line.match(/^\s*(?:%%|I:)begin(js|ml)(?:\s|$)/i);
    if (!blockedType && startsUnsafeBlock) blockedType = startsUnsafeBlock[1].toLowerCase();
    const endsBlockedType = blockedType
      && new RegExp(`^\\s*(?:%%|I:)end${blockedType}(?:\\s|$)`, "i").test(line);
    if (blockedType) parts[index] = neutralizeLinePreservingLength(line);
    if (endsBlockedType) blockedType = "";
  }

  return parts.join("");
}

function callAbc2svgSafely(abc, sourceName, text) {
  if (!abc || typeof abc.tosvg !== "function") {
    throw new TypeError("abc2svg renderer is unavailable.");
  }
  return abc.tosvg(sourceName, neutralizeUnsafeAbcBlocks(text));
}

export {
  callAbc2svgSafely,
  neutralizeUnsafeAbcBlocks,
};
