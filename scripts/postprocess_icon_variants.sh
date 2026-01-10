#!/usr/bin/env bash
set -euo pipefail

APPDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$APPDIR/assets/icons"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/postprocess_icon_variants.sh

What it does:
  - Adds "stars" overlay to:
      assets/icons/abcarus_256.png
      assets/icons/abcarus_512.png
  - Adds "stars" + "ABC" text to:
      assets/icons/abcarus_1024.png
  - Rebuilds:
      assets/icons/icon.png (copied from abcarus_512.png)
      assets/icons/abcarus.ico (multi-size, includes updated 256)

Notes:
  - Requires ImageMagick `convert`.
  - Assumes `bash scripts/update_icon_assets.sh` was run first.
  - Small sizes (<=128) remain untouched (no stars, no text).
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v convert >/dev/null 2>&1; then
  echo "ERROR: ImageMagick 'convert' is required." >&2
  exit 1
fi

need() {
  local p="$1"
  if [[ ! -f "$p" ]]; then
    echo "ERROR: Missing file: $p" >&2
    exit 1
  fi
}

need "$OUT_DIR/abcarus_256.png"
need "$OUT_DIR/abcarus_512.png"
need "$OUT_DIR/abcarus_1024.png"

draw_star_points() {
  # Prints a polygon point list for a 4-point sparkle star (8-point polygon).
  # Args: cx cy outer inner
  awk -v cx="$1" -v cy="$2" -v R="$3" -v r="$4" 'BEGIN{
    # 4-point star (N,E,S,W) with diagonals as inner points.
    # Points: top, top-right, right, bottom-right, bottom, bottom-left, left, top-left
    printf "%.3f,%.3f ", cx, cy-R;
    printf "%.3f,%.3f ", cx+r, cy-r;
    printf "%.3f,%.3f ", cx+R, cy;
    printf "%.3f,%.3f ", cx+r, cy+r;
    printf "%.3f,%.3f ", cx, cy+R;
    printf "%.3f,%.3f ", cx-r, cy+r;
    printf "%.3f,%.3f ", cx-R, cy;
    printf "%.3f,%.3f",   cx-r, cy-r;
  }'
}

overlay_stars() {
  # Args: input output
  local in="$1"
  local out="$2"
  local size
  size="$(identify -format '%w' "$in" 2>/dev/null || true)"
  if [[ -z "$size" ]]; then
    # Fallback: infer from filename (abcarus_256.png etc)
    size="$(basename "$in" | sed -E 's/[^0-9]+//g')"
  fi
  if [[ -z "$size" ]]; then
    echo "ERROR: Unable to infer size for: $in" >&2
    exit 1
  fi

  # Star sizing (relative).
  local R r
  R="$(awk -v s="$size" 'BEGIN{ printf "%.3f", s*0.030 }')"
  r="$(awk -v s="$size" 'BEGIN{ printf "%.3f", s*0.014 }')"

  # Placement.
  local cy cx mid left right
  cy="$(awk -v s="$size" 'BEGIN{ printf "%.3f", s*0.18 }')"
  mid="$(awk -v s="$size" 'BEGIN{ printf "%.3f", s*0.50 }')"
  left="$(awk -v s="$size" 'BEGIN{ printf "%.3f", s*0.42 }')"
  right="$(awk -v s="$size" 'BEGIN{ printf "%.3f", s*0.58 }')"

  local p1 p2 p3
  p1="$(draw_star_points "$left" "$cy" "$R" "$r")"
  p2="$(draw_star_points "$mid" "$cy" "$R" "$r")"
  p3="$(draw_star_points "$right" "$cy" "$R" "$r")"

  convert "$in" \
    \( -size "${size}x${size}" xc:none \
      -fill "#ffffff" -stroke none \
      -draw "polygon $p1" \
      -draw "polygon $p2" \
      -draw "polygon $p3" \
    \) -compose over -composite \
    -depth 8 -define png:color-type=6 \
    "$out"
}

overlay_stars_with_abc() {
  # Args: input output
  local in="$1"
  local out="$2"
  local size
  size="$(identify -format '%w' "$in" 2>/dev/null || true)"
  if [[ -z "$size" ]]; then
    echo "ERROR: Unable to infer size for: $in" >&2
    exit 1
  fi

  # Move the existing artwork slightly up to make room for "ABC".
  # We do this by compositing the original onto a fresh transparent canvas.
  local yShift
  yShift="$(awk -v s="$size" 'BEGIN{ printf "%.0f", s*0.06 }')"

  local tmp tmp_png
  tmp="$(mktemp)"
  tmp_png="${tmp}.png"
  convert -size "${size}x${size}" xc:none \
    "$in" -geometry "+0-${yShift}" -compose over -composite \
    "$tmp_png"

  overlay_stars "$tmp_png" "$tmp_png"

  # Add "ABC" near the bottom.
  # Font is best-effort: ImageMagick will use an available sans-serif if the requested font isn't present.
  local point
  point="$(awk -v s="$size" 'BEGIN{ printf "%.0f", s*0.16 }')"

  convert "$tmp_png" \
    -gravity south -fill "#ffffff" -stroke none \
    -font "DejaVu-Sans-Bold" -pointsize "$point" \
    -annotate +0+70 "ABC" \
    -depth 8 -define png:color-type=6 \
    "$out"

  rm -f "$tmp" "$tmp_png"
}

echo "Post-processing: stars on 256/512, stars+ABC on 1024..."
overlay_stars "$OUT_DIR/abcarus_256.png" "$OUT_DIR/abcarus_256.png"
overlay_stars "$OUT_DIR/abcarus_512.png" "$OUT_DIR/abcarus_512.png"
overlay_stars_with_abc "$OUT_DIR/abcarus_1024.png" "$OUT_DIR/abcarus_1024.png"

echo "Rebuilding icon.png and abcarus.ico..."
cp "$OUT_DIR/abcarus_512.png" "$OUT_DIR/icon.png"

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

echo "Done."
