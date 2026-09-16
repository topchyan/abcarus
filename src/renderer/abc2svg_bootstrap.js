(function initializeAbc2svgTextMeasurer(global, documentRef) {
  if (!global || !documentRef || !documentRef.body) return;

  const runtime = global.abc2svg || (global.abc2svg = {});
  if (runtime.el) return;

  const element = documentRef.createElement("span");
  element.setAttribute("aria-hidden", "true");
  element.style.position = "absolute";
  element.style.top = "0";
  element.style.padding = "0";
  element.style.visibility = "hidden";
  element.style.lineHeight = "1";
  documentRef.body.appendChild(element);
  runtime.el = element;
})(window, document);
