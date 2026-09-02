import { neutralizeUnsafeAbcBlocks } from "../security/abc_security.js";

function createAbc2svgLoader({
  windowRef = typeof window !== "undefined" ? window : null,
  documentRef = typeof document !== "undefined" ? document : null,
  actions = {},
} = {}) {
  const {
    scheduleRender = () => {},
    logError = () => {},
  } = actions;

  let midiGenLoadPromise = null;

  function getAbcCtor() {
    const w = windowRef;
    return (w && w.abc2svg && w.abc2svg.Abc) ? w.abc2svg.Abc : (w ? w.Abc : null);
  }

  function ensureAbc2svgLoader() {
    const w = windowRef;
    const d = documentRef;
    if (!w || !d || !w.abc2svg || w.abc2svg.__abcarusLoader) return;
    const base = new URL("../../third_party/abc2svg/", w.location.href).href;
    const loaded = new Set();
    w.abc2svg.loadjs = (fn, relay, onerror) => {
      if (loaded.has(fn)) {
        if (relay) relay();
        return;
      }
      const script = d.createElement("script");
      script.src = `${base}${fn}`;
      script.async = true;
      script.onload = () => {
        loaded.add(fn);
        if (relay) relay();
      };
      script.onerror = () => {
        if (onerror) onerror(fn);
      };
      d.head.appendChild(script);
    };
    w.abc2svg.__abcarusLoader = true;
  }

  function ensureAbc2svgModules(content) {
    const w = windowRef;
    if (!w || !w.abc2svg || !w.abc2svg.modules || typeof w.abc2svg.modules.load !== "function") {
      return true;
    }
    return w.abc2svg.modules.load(
      neutralizeUnsafeAbcBlocks(content),
      () => scheduleRender(),
      logError,
    );
  }

  function ensureAbc2svgModulesAsync(content) {
    const w = windowRef;
    if (!w || !w.abc2svg || !w.abc2svg.modules || typeof w.abc2svg.modules.load !== "function") {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const ok = w.abc2svg.modules.load(
        neutralizeUnsafeAbcBlocks(content),
        () => resolve(true),
        () => resolve(false)
      );
      if (ok) resolve(true);
    });
  }

  function ensureMidiGenLoaded() {
    const w = windowRef;
    if (w && typeof w.midigen === "function") return Promise.resolve();
    if (midiGenLoadPromise) return midiGenLoadPromise;
    ensureAbc2svgLoader();
    midiGenLoadPromise = new Promise((resolve, reject) => {
      if (!w || !w.abc2svg || typeof w.abc2svg.loadjs !== "function") {
        reject(new Error("abc2svg loader not available."));
        return;
      }
      w.abc2svg.loadjs("midigen.js", () => {
        if (typeof w.midigen === "function") resolve();
        else reject(new Error("midigen.js loaded but midigen() not found."));
      }, (fn) => reject(new Error(`Failed to load ${fn}`)));
    });
    return midiGenLoadPromise;
  }

  return {
    getAbcCtor,
    ensureAbc2svgLoader,
    ensureAbc2svgModules,
    ensureAbc2svgModulesAsync,
    ensureMidiGenLoaded,
  };
}

export {
  createAbc2svgLoader,
};
