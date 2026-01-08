#!/usr/bin/env bash
set -euo pipefail

APPDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICONDIR="$APPDIR/assets/icons"
DEST_ROOT="${XDG_DATA_HOME:-"$HOME/.local/share"}/icons/hicolor"

sizes=(16 24 32 48 64 96 128 256 512)

for size in "${sizes[@]}"; do
  dir="$DEST_ROOT/${size}x${size}/apps"
  mkdir -p "$dir"
  install -m 0644 "$ICONDIR/abcarus_${size}.png" "$dir/abcarus.png"
done

gtk-update-icon-cache -f "$DEST_ROOT" 2>/dev/null || true
