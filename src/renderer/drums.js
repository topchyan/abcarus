const DEFAULT_DRUM_VELOCITY = 80;

const DRUM_INSTRUMENTS = [
  { pitch: 35, name: "Acoustic Bass Drum" },
  { pitch: 36, name: "Bass Drum 1" },
  { pitch: 37, name: "Side Stick" },
  { pitch: 38, name: "Acoustic Snare" },
  { pitch: 39, name: "Hand Clap" },
  { pitch: 40, name: "Electric Snare" },
  { pitch: 41, name: "Low Floor Tom" },
  { pitch: 42, name: "Closed Hi-Hat" },
  { pitch: 43, name: "High Floor Tom" },
  { pitch: 44, name: "Pedal Hi-Hat" },
  { pitch: 45, name: "Low Tom" },
  { pitch: 46, name: "Open Hi-Hat" },
  { pitch: 47, name: "Low-Mid Tom" },
  { pitch: 48, name: "Hi-Mid Tom" },
  { pitch: 49, name: "Crash Cymbal 1" },
  { pitch: 50, name: "High Tom" },
  { pitch: 51, name: "Ride Cymbal 1" },
  { pitch: 52, name: "Chinese Cymbal" },
  { pitch: 53, name: "Ride Bell" },
  { pitch: 54, name: "Tambourine" },
  { pitch: 55, name: "Splash Cymbal" },
  { pitch: 56, name: "Cowbell" },
  { pitch: 57, name: "Crash Cymbal 2" },
  { pitch: 58, name: "Vibraslap" },
  { pitch: 59, name: "Ride Cymbal 2" },
  { pitch: 60, name: "Hi Bongo" },
  { pitch: 61, name: "Low Bongo" },
  { pitch: 62, name: "Mute Hi Conga" },
  { pitch: 63, name: "Open Hi Conga" },
  { pitch: 64, name: "Low Conga" },
  { pitch: 65, name: "High Timbale" },
  { pitch: 66, name: "Low Timbale" },
  { pitch: 67, name: "High Agogo" },
  { pitch: 68, name: "Low Agogo" },
  { pitch: 69, name: "Cabasa" },
  { pitch: 70, name: "Maracas" },
  { pitch: 71, name: "Short Whistle" },
  { pitch: 72, name: "Long Whistle" },
  { pitch: 73, name: "Short Guiro" },
  { pitch: 74, name: "Long Guiro" },
  { pitch: 75, name: "Claves" },
  { pitch: 76, name: "Hi Wood Block" },
  { pitch: 77, name: "Low Wood Block" },
  { pitch: 78, name: "Mute Cuica" },
  { pitch: 79, name: "Open Cuica" },
  { pitch: 80, name: "Mute Triangle" },
  { pitch: 81, name: "Open Triangle" },
];

function buildDefaultDrumVelocityMap(defaultValue = DEFAULT_DRUM_VELOCITY) {
  const map = {};
  for (const item of DRUM_INSTRUMENTS) {
    map[item.pitch] = defaultValue;
  }
  return map;
}

function clampVelocity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DRUM_VELOCITY;
  return Math.max(0, Math.min(127, Math.round(n)));
}

function velocityToDynamic(value) {
  const v = clampVelocity(value);
  if (v <= 20) return "ppp";
  if (v <= 35) return "pp";
  if (v <= 50) return "p";
  if (v <= 65) return "mp";
  if (v <= 80) return "mf";
  if (v <= 95) return "f";
  if (v <= 110) return "ff";
  return "fff";
}

export {
  DEFAULT_DRUM_VELOCITY,
  DRUM_INSTRUMENTS,
  buildDefaultDrumVelocityMap,
  clampVelocity,
  velocityToDynamic,
};
