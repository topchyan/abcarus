const DEFAULT_SOUNDFONT_NAME = "TimGM6mb.sf2";
const DEFAULT_SOUNDFONT_SOURCE = "abc2svg.sf2";
const MAX_EXTERNAL_SOUNDFONT_BYTES = 384 * 1024 * 1024;
const STREAMING_SF2 = new Set();

function withTimeout(promise, ms, label) {
  const timeoutMs = Number(ms) > 0 ? Number(ms) : 0;
  if (!timeoutMs) return promise;
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`${label || "Operation"} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    Promise.resolve(promise).then((value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    }, (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

function createSoundfontController({
  windowRef = typeof window !== "undefined" ? window : null,
  api = null,
  elements = {},
  state = {},
  actions = {},
} = {}) {
  const { label = null } = elements;
  const {
    isPlaying = () => false,
    isPaused = () => false,
    isWaitingForFirstNote = () => false,
  } = state;
  const {
    ensurePlayer = () => null,
    setBufferStatus = () => {},
    setStatus = () => {},
    showToast = () => {},
    stopPlayback = () => {},
  } = actions;

  let soundfontName = DEFAULT_SOUNDFONT_NAME;
  let soundfontSource = DEFAULT_SOUNDFONT_SOURCE;
  let soundfontReadyName = null;
  let soundfontLoadPromise = null;
  let soundfontLoadTarget = null;
  let soundfontStatusTimer = null;
  let lastSoundfontApplied = null;
  let lastLoadError = null;
  let fallbackForName = null;
  let loadGeneration = 0;
  let runtimeErrorHandlerInstalled = false;

  function isIncompatibleLoopPointError(message) {
    const text = String(message || "");
    return /AudioBufferSourceNode/i.test(text)
      && /loop(?:Start|End)/i.test(text)
      && /non-finite/i.test(text);
  }

  function installRuntimeErrorHandler() {
    if (
      runtimeErrorHandlerInstalled
      || !windowRef
      || typeof windowRef.addEventListener !== "function"
    ) return;
    runtimeErrorHandlerInstalled = true;
    windowRef.addEventListener("error", (event) => {
      const message = event && event.message ? String(event.message) : "";
      const isExternal = /^(?:file:\/\/|\/|[A-Za-z]:\\)/.test(soundfontName);
      if (!isExternal || !isIncompatibleLoopPointError(message)) return;
      const notice = "Selected SoundFont is incompatible with abc2svg (invalid sample loop points). Choose another SF2.";
      lastLoadError = { name: soundfontName, message };
      setStatus("Soundfont error");
      setStatusText("Soundfont incompatible", 8000);
      stopPlayback(notice);
      showToast(notice, 8000);
    });
  }

  function setStatusText(text, autoClearMs) {
    setBufferStatus(text || "");
    if (soundfontStatusTimer) clearTimeout(soundfontStatusTimer);
    soundfontStatusTimer = null;
    if (text && autoClearMs) {
      soundfontStatusTimer = setTimeout(() => {
        setBufferStatus("");
        soundfontStatusTimer = null;
      }, autoClearMs);
    }
  }

  function setCaption(text) {
    if (!label) return;
    const next = text || "Soundfont:";
    label.textContent = next;
    const isLoading = String(next).toLowerCase().includes("loading");
    label.classList.toggle("loading", isLoading);
  }

  async function updateLoadingStatus(name) {
    if (soundfontLoadTarget !== name) return;
    setCaption("Loading...");
  }

  async function loadSoundfont(name, generation) {
    const w = windowRef;
    if (!w) throw new Error("window is unavailable.");
    const isPath = name.startsWith("/") || /^[a-zA-Z]:\\/.test(name) || name.startsWith("file://");
    let sf2Url = "";
    if (isPath) {
      if (api && typeof api.getSoundfontInfo === "function") {
        const info = await withTimeout(
          api.getSoundfontInfo(name),
          15000,
          "External soundfont inspection",
        );
        const size = Number(info && info.size);
        if (Number.isFinite(size) && size > MAX_EXTERNAL_SOUNDFONT_BYTES) {
          const error = new Error(
            `SoundFont exceeds the ${Math.round(MAX_EXTERNAL_SOUNDFONT_BYTES / 1024 / 1024)} MiB safe loading limit.`,
          );
          error.code = "SOUNDFONT_TOO_LARGE";
          throw error;
        }
      }
      if (!api || typeof api.getSoundfontStreamUrl !== "function") {
        throw new Error("preload API missing: window.api.getSoundfontStreamUrl");
      }
      sf2Url = await withTimeout(
        api.getSoundfontStreamUrl(name),
        15000,
        "External soundfont registration",
      );
      if (!String(sf2Url || "").startsWith("abcarus-sf2://")) {
        throw new Error("External soundfont URL is invalid.");
      }
    } else {
      sf2Url = new URL(`../../third_party/sf2/${name}`, w.location.href).href;
    }
    if (generation !== loadGeneration) return false;
    if (!w.abc2svg) w.abc2svg = {};
    if (isPath || STREAMING_SF2.has(name)) {
      w.abc2svg.sf2 = null;
      soundfontSource = sf2Url;
      soundfontReadyName = name;
      return true;
    }
    if (!api || typeof api.readFileBase64 !== "function") {
      throw new Error("preload API missing: window.api.readFileBase64");
    }
    let b64 = "";
    try {
      b64 = await withTimeout(api.readFileBase64(sf2Url), 15000, "Soundfont load");
    } catch {
      if (generation !== loadGeneration) return false;
      w.abc2svg.sf2 = null;
      soundfontSource = sf2Url;
      soundfontReadyName = name;
      return true;
    }
    if (generation !== loadGeneration) return false;
    if (!b64 || !b64.length) throw new Error("SF2 base64 is empty");
    w.abc2svg.sf2 = b64;
    soundfontSource = DEFAULT_SOUNDFONT_SOURCE;
    soundfontReadyName = name;
    return true;
  }

  async function ensureLoaded() {
    const w = windowRef;
    if (!w) return;
    const desired = soundfontName || DEFAULT_SOUNDFONT_NAME;
    if (
      soundfontReadyName === desired
      && (soundfontSource !== DEFAULT_SOUNDFONT_SOURCE || (w.abc2svg && w.abc2svg.sf2))
    ) return;
    if (
      fallbackForName === desired
      && soundfontReadyName === DEFAULT_SOUNDFONT_NAME
      && w.abc2svg
      && w.abc2svg.sf2
    ) return;
    if (soundfontLoadPromise && soundfontLoadTarget === desired) return soundfontLoadPromise;

    if (!w.abc2svg) w.abc2svg = {};
    const generation = ++loadGeneration;
    soundfontLoadTarget = desired;
    setCaption("Loading...");
    updateLoadingStatus(desired);
    const currentPromise = (async () => {
      let ok = false;
      try {
        ok = await loadSoundfont(desired, generation);
        if (!ok) return;
        lastLoadError = null;
        fallbackForName = null;
      } catch (e) {
        if (generation !== loadGeneration) return;
        lastLoadError = {
          name: desired,
          message: e && e.message ? String(e.message) : String(e),
        };
        if (desired === DEFAULT_SOUNDFONT_NAME) throw e;
        ok = await loadSoundfont(DEFAULT_SOUNDFONT_NAME, generation);
        if (ok) {
          fallbackForName = desired;
          const shortName = desired.split(/[\\/]/).pop() || desired;
          const reason = e && e.message ? String(e.message) : "The file could not be loaded.";
          showToast(`Could not load SoundFont "${shortName}": ${reason} Using ${DEFAULT_SOUNDFONT_NAME}.`, 9000);
        }
      } finally {
        if (soundfontLoadPromise === currentPromise) {
          soundfontLoadPromise = null;
          soundfontLoadTarget = null;
        }
        if (generation !== loadGeneration) return;
        if (ok) setStatusText("", 0);
        if (!isWaitingForFirstNote()) setCaption();
        if (ok && !isPlaying() && !isPaused() && !isWaitingForFirstNote()) setStatus("OK");
      }
    })();
    soundfontLoadPromise = currentPromise;
    return currentPromise;
  }

  async function ensureReady() {
    await ensureLoaded();
    const desired = soundfontSource || DEFAULT_SOUNDFONT_SOURCE;
    const player = ensurePlayer();
    if (player && typeof player.set_sfu === "function" && desired !== lastSoundfontApplied) {
      player.set_sfu(desired);
      lastSoundfontApplied = desired;
    }
  }

  function setFromSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    const next = String(settings.soundfontName || "");
    soundfontName = next || DEFAULT_SOUNDFONT_NAME;
  }

  function resetCache() {
    loadGeneration += 1;
    const w = windowRef;
    if (w && w.abc2svg) w.abc2svg.sf2 = null;
    if (w && w.abcsf2 && Array.isArray(w.abcsf2)) w.abcsf2.length = 0;
    soundfontSource = DEFAULT_SOUNDFONT_SOURCE;
    soundfontReadyName = null;
    soundfontLoadPromise = null;
    soundfontLoadTarget = null;
    lastSoundfontApplied = null;
    lastLoadError = null;
    fallbackForName = null;
  }

  return {
    ensureLoaded,
    ensureReady,
    installRuntimeErrorHandler,
    resetCache,
    setCaption,
    setFromSettings,
    setStatus: setStatusText,
    getName: () => soundfontName,
    getSource: () => soundfontSource,
    getReadyName: () => soundfontReadyName,
    getLastApplied: () => lastSoundfontApplied,
    getLastLoadError: () => lastLoadError,
  };
}

export {
  DEFAULT_SOUNDFONT_NAME,
  DEFAULT_SOUNDFONT_SOURCE,
  createSoundfontController,
};
