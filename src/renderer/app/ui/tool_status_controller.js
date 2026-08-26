function createToolStatusController({
  element = null,
  api = null,
  showToast = () => {},
} = {}) {
  let toolHealth = null;
  let toolHealthError = "";
  let toolWarningShown = false;

  function render() {
    if (!element) return;
    const warnings = [];
    const details = [];
    if (toolHealth) {
      const entries = [
        ["abc2xml", "abc2xml"],
        ["xml2abc", "xml2abc"],
        // midi2xml/music21 is optional; Auto import falls back to bundled midi2abc.
        ["midi2abc", "midi2abc"],
        ["python", "Python"],
      ];
      for (const [key, label] of entries) {
        const info = toolHealth[key];
        if (!info || info.ok) continue;
        const msg = info.error || info.detail || "Unavailable";
        warnings.push(label);
        details.push(`${label}: ${msg}`);
      }
    }

    let text = "";
    let title = "";
    let shouldWarn = false;

    if (toolHealthError) {
      text = "Tool check failed";
      title = toolHealthError;
      shouldWarn = true;
    } else if (warnings.length) {
      text = `Missing tools: ${warnings.join(", ")}`;
      title = details.join("\n");
      shouldWarn = true;
    }

    if (!shouldWarn) {
      element.textContent = "";
      element.title = "";
      element.classList.remove("warn");
      element.style.display = "none";
      return;
    }

    element.textContent = text;
    element.title = title;
    element.classList.add("warn");
    element.style.display = "";
    if (warnings.length && !toolWarningShown) {
      showToast(text);
      toolWarningShown = true;
    }
  }

  async function check() {
    if (!api || typeof api.checkConversionTools !== "function") return;
    try {
      const res = await api.checkConversionTools();
      if (!res) {
        toolHealthError = "Tool check failed.";
        toolHealth = null;
        render();
        return;
      }
      if (!res.ok) {
        toolHealthError = res.error || "Tool check failed.";
        toolHealth = null;
        render();
        return;
      }
      toolHealthError = "";
      toolHealth = res.tools || null;
    } catch (e) {
      toolHealth = null;
      toolHealthError = (e && e.message) ? e.message : String(e);
    }
    render();
  }

  return {
    check,
    render,
  };
}

export {
  createToolStatusController,
};
