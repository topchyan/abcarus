import { callAbc2svgSafely } from "../security/abc_security.js";

function createDrumPreviewController({
  transport,
  velocityToDynamic,
  ensureSoundfontLoaded,
  ensurePlayer,
  getAbcCtor,
  getSoundfontSource,
  stopPlaybackForRestart,
  updatePlayButton,
  logErr,
  windowRef,
} = {}) {
  async function playDrumPreview(pitch, velocity) {
    const midiPitch = Number.isFinite(Number(pitch)) ? Number(pitch) : 35;
    const dyn = velocityToDynamic(velocity);
    try {
      if (transport.isPlaying || transport.isPaused) {
        stopPlaybackForRestart();
        transport.stopForPreview();
        updatePlayButton();
      }
      transport.beginPreview();
      await ensureSoundfontLoaded();
      const p = ensurePlayer();
      if (typeof p.set_sfu === "function") p.set_sfu(getSoundfontSource() || "abc2svg.sf2");
      try { windowRef.sessionStorage.setItem("audio", "sf2"); } catch {}
      if (typeof p.clear === "function") p.clear();
      const AbcCtor = getAbcCtor();
      const user = {
        img_out: () => {},
        err: (m) => logErr(m),
        errmsg: (m) => logErr(m),
        abcplay: p,
      };
      const abc = new AbcCtor(user);
      const abcText = [
        "X:1",
        "L:1/4",
        "M:4/4",
        "K:C",
        "V:DRUM clef=perc name=\"Drums\"",
        "%%MIDI channel 10",
        `%%MIDI drummap C, ${midiPitch}`,
        `!${dyn}!C,`,
        "",
      ].join("\n");
      callAbc2svgSafely(abc, "drum_preview", abcText);
      const tunes = abc.tunes || [];
      if (!tunes.length) return;
      p.add(tunes[0][0], tunes[0][1], tunes[0][3]);
      p.play(tunes[0][0], null, 0);
    } catch (e) {
      logErr((e && e.stack) ? e.stack : String(e));
      transport.endPreview();
    }
  }

  return {
    playDrumPreview,
  };
}

export { createDrumPreviewController };
