"use strict";

function hasOwn(obj, key) {
  return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function normalizeMicrotonalSettings(next, patch) {
  if (!next || typeof next !== "object") return next;
  const hasCanonicalPatch = hasOwn(patch, "supportMicrotonalNotation");
  next.supportMicrotonalNotation = hasCanonicalPatch
    ? Boolean(next.supportMicrotonalNotation)
    : Boolean(next.supportMicrotonalNotation || next.makamToolsEnabled || next.studyToolsEnabled);
  next.makamToolsEnabled = Boolean(next.supportMicrotonalNotation);
  next.studyToolsEnabled = Boolean(next.supportMicrotonalNotation);
  return next;
}

function normalizeConversionToolSettings(next) {
  if (!next || typeof next !== "object") return next;
  for (const key of ["abc2xmlArgs", "xml2abcArgs", "midi2abcArgs"]) {
    next[key] = String(next[key] == null ? "" : next[key]);
  }
  return next;
}

module.exports = {
  normalizeConversionToolSettings,
  normalizeMicrotonalSettings,
};
