#!/usr/bin/env bash
set -euo pipefail

APPDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$APPDIR/assets/icons"

APP_SRC_DEFAULT="$APPDIR/scripts/local/_kitchen/brand/brand/_drafts/abcarus-icon-clef-with-wings.png"
MASK_SRC_DEFAULT="$APPDIR/scripts/local/_kitchen/brand/brand/_drafts/abcarus-icon-clef-with-wings_bw.png"

APP_SRC="${APP_SRC_DEFAULT}"
MASK_SRC="${MASK_SRC_DEFAULT}"
PADDING="0.86"

usage() {
  cat <<EOF
Usage:
  bash scripts/update_icon_assets.sh [--app-src <png>] [--mask-src <png>] [--padding <0..1>]

Defaults:
  --app-src  $APP_SRC_DEFAULT
  --mask-src $MASK_SRC_DEFAULT

Outputs:
  - assets/icons/abcarus_<size>.png (transparent app icon, sizes 16..1024)
  - assets/icons/icon.png (512x512, used by electron-builder)
  - assets/icons/abcarus.ico (Windows .ico multi-size)
  - assets/icons/abcarus_window_light.png (256x256, flat silhouette)
  - assets/icons/abcarus_window_dark.png  (256x256, flat silhouette)

Requirements:
  - ImageMagick \`convert\` on PATH
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-src) APP_SRC="${2:-}"; shift 2;;
    --mask-src) MASK_SRC="${2:-}"; shift 2;;
    --padding) PADDING="${2:-}"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2;;
  esac
done

if ! command -v convert >/dev/null 2>&1; then
  echo "ERROR: ImageMagick 'convert' is required." >&2
  exit 1
fi

if [[ ! -f "$APP_SRC" ]]; then
  echo "ERROR: App icon source not found: $APP_SRC" >&2
  exit 1
fi

if [[ ! -f "$MASK_SRC" ]]; then
  echo "ERROR: Mask icon source not found: $MASK_SRC" >&2
  exit 1
fi

sizes=(16 24 32 48 64 96 128 256 512 1024)

mkdir -p "$OUT_DIR"

make_one() {
  local src="$1"
  local mask_src="$2"
  local out="$3"
  local size="$4"
  local pad="$5"
  local target
  local alpha_boost="1.0"
  target="$(python3 - <<PY
import math
size=int("$size")
pad=float("$pad")
pad=max(0.0, min(1.0, pad))
print(max(1, int(round(size*pad))))
PY
)"

  if [[ "$size" -le 16 ]]; then alpha_boost="2.2"
  elif [[ "$size" -le 24 ]]; then alpha_boost="1.9"
  elif [[ "$size" -le 32 ]]; then alpha_boost="1.6"
  elif [[ "$size" -le 48 ]]; then alpha_boost="1.35"
  else alpha_boost="1.15"
  fi

  # Generate a transparent icon by applying the alpha mask from the BW silhouette.
  # We intentionally do NOT trim either input: keeping the original alignment avoids drift between src/mask.
  # Apply the mask at the original resolution first, then scale down, to avoid washed-out alpha at tiny sizes.
  convert \
    -size "${size}x${size}" xc:none \
    \( "$src" \( "$mask_src" -alpha extract \) -compose CopyOpacity -composite -resize "${target}x${target}" -channel A -evaluate multiply "${alpha_boost}" +channel \) \
    -gravity center -composite \
    -depth 8 -define png:color-type=6 \
    "$out"
}

echo "Generating transparent app icons from:"
echo "  $APP_SRC"
for s in "${sizes[@]}"; do
  make_one "$APP_SRC" "$MASK_SRC" "$OUT_DIR/abcarus_${s}.png" "$s" "$PADDING"
done

cp "$OUT_DIR/abcarus_512.png" "$OUT_DIR/icon.png"

echo "Generating Windows ICO..."
convert \
  "$OUT_DIR/abcarus_16.png" \
  "$OUT_DIR/abcarus_24.png" \
  "$OUT_DIR/abcarus_32.png" \
  "$OUT_DIR/abcarus_48.png" \
  "$OUT_DIR/abcarus_64.png" \
  "$OUT_DIR/abcarus_96.png" \
  "$OUT_DIR/abcarus_128.png" \
  "$OUT_DIR/abcarus_256.png" \
  "$OUT_DIR/abcarus.ico"

echo "Generating window icons (flat silhouettes)..."
convert "$MASK_SRC" \
  -alpha extract -trim +repage -resize 240x240 \
  -write mpr:mask +delete \
  -size 256x256 xc:"#111827" mpr:mask -compose CopyOpacity -composite \
  -define png:color-type=6 "$OUT_DIR/abcarus_window_light.png"

convert "$MASK_SRC" \
  -alpha extract -trim +repage -resize 240x240 \
  -write mpr:mask +delete \
  -size 256x256 xc:"#E6EAF2" mpr:mask -compose CopyOpacity -composite \
  -define png:color-type=6 "$OUT_DIR/abcarus_window_dark.png"

echo "Done."
