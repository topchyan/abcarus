export function createLibraryActions({ openTuneFromSelection }) {
  async function openTune(selection) {
    if (typeof openTuneFromSelection !== "function") {
      return { ok: false, error: "Open handler not available." };
    }
    return openTuneFromSelection(selection);
  }

  return {
    openTune,
  };
}

