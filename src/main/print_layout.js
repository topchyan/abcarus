const PRINT_PAGE_MARGINS = new Set(["standard", "narrow", "none"]);
const PRINT_PAGE_MARGINS_MARKER = "abcarus:print-page-margins:";

function normalizePrintPageMargins(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PRINT_PAGE_MARGINS.has(normalized) ? normalized : "standard";
}

function applyPrintPageMargins(markup, value) {
  const profile = normalizePrintPageMargins(value);
  return `<!--${PRINT_PAGE_MARGINS_MARKER}${profile}-->\n${String(markup || "")}`;
}

function readPrintPageMargins(markup) {
  const match = String(markup || "").match(/<!--abcarus:print-page-margins:([a-z]+)-->/i);
  return normalizePrintPageMargins(match ? match[1] : "standard");
}

function printPageMarginsUseChromiumDefaults(markup) {
  return readPrintPageMargins(markup) === "standard";
}

function printPageBodyPadding(markup) {
  return readPrintPageMargins(markup) === "none" ? "0" : "24px";
}

module.exports = {
  applyPrintPageMargins,
  normalizePrintPageMargins,
  printPageBodyPadding,
  printPageMarginsUseChromiumDefaults,
  readPrintPageMargins,
};
