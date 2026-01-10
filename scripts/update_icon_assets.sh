#!/usr/bin/env bash
set -euo pipefail

APPDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$APPDIR/assets/icons"

APP_SRC_DEFAULT="$APPDIR/scripts/local/_kitchen/brand/brand/_drafts/abcarus-icon-clef-with-wings.png"
MASK_SRC_DEFAULT="$APPDIR/scripts/local/_kitchen/brand/brand/_drafts/abcarus-icon-clef-with-wings_bw.png"
NEW_ICON_SRC_DEFAULT="$APPDIR/scripts/local/_kitchen/brand/brand/_drafts/abcarus-icon-new.png"

APP_SRC="${APP_SRC_DEFAULT}"
MASK_SRC="${MASK_SRC_DEFAULT}"
PADDING="0.86"
PRESET="legacy"
NEW_ICON_PADDING="0.92"

usage() {
  cat <<EOF
Usage:
  bash scripts/update_icon_assets.sh [--preset <legacy|new-icon>] [--app-src <png>] [--mask-src <png>] [--padding <0..1>] [--new-icon-src <png>] [--new-icon-padding <0..1>]

Defaults:
  --preset   legacy
  --app-src  $APP_SRC_DEFAULT
  --mask-src $MASK_SRC_DEFAULT
  --new-icon-src $NEW_ICON_SRC_DEFAULT
  --new-icon-padding 0.92

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
    --preset) PRESET="${2:-}"; shift 2;;
    --app-src) APP_SRC="${2:-}"; shift 2;;
    --mask-src) MASK_SRC="${2:-}"; shift 2;;
    --padding) PADDING="${2:-}"; shift 2;;
    --new-icon-src) NEW_ICON_SRC="${2:-}"; shift 2;;
    --new-icon-padding) NEW_ICON_PADDING="${2:-}"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2;;
  esac
done

if ! command -v convert >/dev/null 2>&1; then
  echo "ERROR: ImageMagick 'convert' is required." >&2
  exit 1
fi

sizes=(16 24 32 48 64 96 128 256 512 1024)

mkdir -p "$OUT_DIR"

make_new_icon_set() {
  local new_src="${1}"
  local pad="${2}"

  if [[ ! -f "$new_src" ]]; then
    echo "ERROR: New icon source not found: $new_src" >&2
    exit 1
  fi

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  local src_w src_h src_x src_y
  src_w="$(identify -format '%w' "$new_src" 2>/dev/null || true)"
  src_h="$(identify -format '%h' "$new_src" 2>/dev/null || true)"
  if [[ -z "$src_w" || -z "$src_h" ]]; then
    echo "ERROR: Unable to read image dimensions: $new_src" >&2
    exit 1
  fi
  src_x="$((src_w - 1))"
  src_y="$((src_h - 1))"

  # 1) Make outside background transparent (corner floodfill), then trim to the icon tile.
  #
  # Important: do NOT re-extent here; we want the trimmed icon to fill the target size
  # (controlled by --new-icon-padding) without adding accidental transparent margins.
  convert "$new_src" \
    -alpha set -fuzz 8% -fill none \
    -draw 'matte 0,0 floodfill' \
    -draw "matte 0,${src_y} floodfill" \
    -draw "matte ${src_x},0 floodfill" \
    -draw "matte ${src_x},${src_y} floodfill" \
    -trim +repage \
    "$tmpdir/tile_dark.png"

  convert "$tmpdir/tile_dark.png" -resize 1024x1024 \
    "$tmpdir/full_dark_1024.png"

  # 2) Light variant is an RGB invert (keeps alpha).
  convert "$tmpdir/full_dark_1024.png" -alpha set -channel RGB -negate +channel \
    "$tmpdir/full_light_1024.png"

  # Ensure a stable square canvas (trim may yield slight aspect drift).
  convert "$tmpdir/full_dark_1024.png" \
    -background none -gravity center -extent 1024x1024 \
    "$tmpdir/full_dark_1024.png"
  convert "$tmpdir/full_light_1024.png" \
    -background none -gravity center -extent 1024x1024 \
    "$tmpdir/full_light_1024.png"

  echo "Generating app icons from new-icon preset:"
  echo "  $new_src"
  echo "  padding: $pad"

  # Hybrid policy:
  # - Main app icon set (abcarus_<size>.png, icon.png, abcarus.ico) uses the DARK variant.
  # - Window icon variants keep both:
  #   - abcarus_window_dark.png  -> dark
  #   - abcarus_window_light.png -> light
  for s in "${sizes[@]}"; do
    local target
    target="$(awk -v size="$s" -v pad="$pad" 'BEGIN{
      if (pad < 0) pad = 0;
      if (pad > 1) pad = 1;
      v = size * pad;
      t = int(v + 0.5);
      if (t < 1) t = 1;
      print t;
    }')"
    # For small sizes we intentionally keep the original design as-is (no content removal),
    # just scale and pad it into the canvas.
    convert "$tmpdir/full_dark_1024.png" -background none -gravity center -resize "${target}x${target}" -extent "${s}x${s}" \
      -depth 8 -define png:color-type=6 \
      "$OUT_DIR/abcarus_${s}.png"
  done

  cp "$OUT_DIR/abcarus_512.png" "$OUT_DIR/icon.png"

  echo "Generating Windows ICO..."
  #
  # Windows often uses 16/24/32/48px frames in taskbar/list views; the full icon
  # (with "ABC" text) can look noisy at those sizes. For ICO only, generate
  # text-free small frames by cropping the top portion of the tile and re-centering.
  local tile_bg ico_crop_h
  tile_bg="$(convert "$tmpdir/full_dark_1024.png" -format '%[pixel:p{900,900}]' info:)"
  ico_crop_h="620"
  convert "$tmpdir/full_dark_1024.png" \
    -crop "1024x${ico_crop_h}+0+0" +repage \
    -background "$tile_bg" -gravity center -extent 1024x1024 \
    "$tmpdir/ico_small_base_1024.png"

  make_ico_frame() {
    local src="$1"
    local out="$2"
    local size="$3"
    local pad="$4"
    local target
    target="$(awk -v size="$size" -v pad="$pad" 'BEGIN{
      if (pad < 0) pad = 0;
      if (pad > 1) pad = 1;
      v = size * pad;
      t = int(v + 0.5);
      if (t < 1) t = 1;
      print t;
    }')"
    # For tiny frames, add a light unsharp to avoid "muddy" downscales.
    local sharpen
    sharpen=()
    if [[ "$size" -le 48 ]]; then
      sharpen=(-unsharp 0x0.75+0.75+0.0)
    fi
    convert "$src" -background none -gravity center -filter Mitchell -resize "${target}x${target}" "${sharpen[@]}" -extent "${size}x${size}" \
      -depth 8 -define png:color-type=6 \
      "$out"
  }

  make_ico_frame "$tmpdir/ico_small_base_1024.png" "$tmpdir/ico_16.png" 16 "$pad"
  make_ico_frame "$tmpdir/ico_small_base_1024.png" "$tmpdir/ico_24.png" 24 "$pad"
  make_ico_frame "$tmpdir/ico_small_base_1024.png" "$tmpdir/ico_32.png" 32 "$pad"
  make_ico_frame "$tmpdir/ico_small_base_1024.png" "$tmpdir/ico_48.png" 48 "$pad"

  # Put the largest frame first so naive viewers show a crisp preview.
  convert \
    "$OUT_DIR/abcarus_256.png" \
    "$OUT_DIR/abcarus_128.png" \
    "$OUT_DIR/abcarus_96.png" \
    "$OUT_DIR/abcarus_64.png" \
    "$tmpdir/ico_48.png" \
    "$tmpdir/ico_32.png" \
    "$tmpdir/ico_24.png" \
    "$tmpdir/ico_16.png" \
    "$OUT_DIR/abcarus.ico"

  # Window icons: keep only the mark (no tile background, no "ABC" text).
  #
  # Use the same cropped base we already use for small ICO frames, because it:
  # - removes the "ABC" text (crop top part)
  # - has a uniform background (safe to key out)
  local window_bg_fuzz
  window_bg_fuzz="10%"
  convert "$tmpdir/ico_small_base_1024.png" \
    -alpha set -fuzz "$window_bg_fuzz" -transparent "$tile_bg" \
    "$tmpdir/window_mark_1024.png"

  convert "$tmpdir/window_mark_1024.png" \
    -background none -gravity center -resize 256x256 -extent 256x256 \
    -depth 8 -define png:color-type=6 \
    "$OUT_DIR/abcarus_window_dark.png"

  # Light titlebar -> dark (navy) mark, preserving alpha.
  convert \
    -size 256x256 xc:'#0b1220' \
    \( "$OUT_DIR/abcarus_window_dark.png" -alpha extract \) \
    -compose CopyOpacity -composite \
    -depth 8 -define png:color-type=6 \
    "$OUT_DIR/abcarus_window_light.png"

  echo "Done."
}

make_one() {
  local src="$1"
  local mask_src="$2"
  local out="$3"
  local size="$4"
  local pad="$5"
  local target
  local alpha_boost="1.0"
  local tmp
  local alpha_cutoff="6%"
  target="$(awk -v size="$size" -v pad="$pad" 'BEGIN{
    if (pad < 0) pad = 0;
    if (pad > 1) pad = 1;
    v = size * pad;
    # round to nearest integer
    target = int(v + 0.5);
    if (target < 1) target = 1;
    print target;
  }')"

  if [[ "$size" -le 16 ]]; then alpha_boost="2.2"
  elif [[ "$size" -le 24 ]]; then alpha_boost="1.9"
  elif [[ "$size" -le 32 ]]; then alpha_boost="1.6"
  elif [[ "$size" -le 48 ]]; then alpha_boost="1.35"
  else alpha_boost="1.15"
  fi

  if [[ "$size" -le 24 ]]; then alpha_cutoff="10%"
  elif [[ "$size" -le 48 ]]; then alpha_cutoff="8%"
  else alpha_cutoff="6%"
  fi

  tmp="$(mktemp)"

  # Generate a transparent icon by applying the alpha mask from the BW silhouette,
  # while preserving the source RGB colors.
  #
  # Apply the mask at the original resolution first, then scale down, to avoid
  # washed-out alpha at tiny sizes.
  convert \
    "$src" \
    \( "$mask_src" -alpha extract \) \
    -compose CopyOpacity -composite \
    -resize "${target}x${target}" \
    -channel A -evaluate multiply "${alpha_boost}" -level "${alpha_cutoff}",100% +channel \
    -depth 8 -define png:color-type=6 \
    "$tmp"

  convert \
    -size "${size}x${size}" xc:none \
    "$tmp" -gravity center -composite \
    -depth 8 -define png:color-type=6 \
    "$out"

  rm -f "$tmp"
}

case "$PRESET" in
  new-icon)
    NEW_ICON_SRC="${NEW_ICON_SRC:-$NEW_ICON_SRC_DEFAULT}"
    make_new_icon_set "$NEW_ICON_SRC" "$NEW_ICON_PADDING"
    ;;
  legacy)
    if [[ ! -f "$APP_SRC" ]]; then
      echo "ERROR: App icon source not found: $APP_SRC" >&2
      exit 1
    fi

    if [[ ! -f "$MASK_SRC" ]]; then
      echo "ERROR: Mask icon source not found: $MASK_SRC" >&2
      exit 1
    fi

    echo "Generating transparent app icons from:"
    echo "  $APP_SRC"
    for s in "${sizes[@]}"; do
      make_one "$APP_SRC" "$MASK_SRC" "$OUT_DIR/abcarus_${s}.png" "$s" "$PADDING"
    done

    cp "$OUT_DIR/abcarus_512.png" "$OUT_DIR/icon.png"

    echo "Generating Windows ICO..."
    convert \
      "$OUT_DIR/abcarus_256.png" \
      "$OUT_DIR/abcarus_128.png" \
      "$OUT_DIR/abcarus_96.png" \
      "$OUT_DIR/abcarus_64.png" \
      "$OUT_DIR/abcarus_48.png" \
      "$OUT_DIR/abcarus_32.png" \
      "$OUT_DIR/abcarus_24.png" \
      "$OUT_DIR/abcarus_16.png" \
      "$OUT_DIR/abcarus.ico"

    echo "Generating window icons (flat silhouettes)..."
    convert "$MASK_SRC" \
      -alpha extract -trim +repage -resize 240x240 \
      -write mpr:mask +delete \
      -size 256x256 xc:"#111827" mpr:mask -compose CopyOpacity -composite \
      -define png:color-type=6 "$OUT_DIR/abcarus_window_light.png"

    # For dark titlebars, use the full-color transparent app icon (gold) for better branding,
    # while keeping the silhouette variant above for light themes where contrast matters more.
    cp "$OUT_DIR/abcarus_256.png" "$OUT_DIR/abcarus_window_dark.png"

    echo "Done."
    ;;
  *)
    echo "ERROR: Unknown --preset '$PRESET' (expected legacy|new-icon)" >&2
    exit 2
    ;;
esac
