export function createSettingsStore(api) {
  const listeners = new Set();

  const notify = (settings) => {
    for (const fn of listeners) {
      try { fn(settings); } catch {}
    }
  };

  if (api && typeof api.onSettingsChanged === "function") {
    api.onSettingsChanged((settings) => {
      notify(settings || null);
    });
  }

  return {
    async get() {
      if (!api || typeof api.getSettings !== "function") return null;
      return api.getSettings();
    },
    async getSchema() {
      if (!api || typeof api.getSettingsSchema !== "function") return null;
      return api.getSettingsSchema();
    },
    async update(patch) {
      if (!api || typeof api.updateSettings !== "function") return null;
      return api.updateSettings(patch || {});
    },
    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

