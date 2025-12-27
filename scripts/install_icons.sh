APPDIR="$(cd "$(dirname "$0")/.." && pwd)"
ICONDIR="$APPDIR/assets/icons"

mkdir -p ~/.local/share/icons/hicolor/{16x16,24x24,32x32,48x48,64x64,96x96,128x128,256x256,512x512}/apps
cp "$ICONDIR/abcarus_16.png"  ~/.local/share/icons/hicolor/16x16/apps/abcarus.png
cp "$ICONDIR/abcarus_24.png"  ~/.local/share/icons/hicolor/24x24/apps/abcarus.png
cp "$ICONDIR/abcarus_32.png"  ~/.local/share/icons/hicolor/32x32/apps/abcarus.png
cp "$ICONDIR/abcarus_48.png"  ~/.local/share/icons/hicolor/48x48/apps/abcarus.png
cp "$ICONDIR/abcarus_64.png"  ~/.local/share/icons/hicolor/64x64/apps/abcarus.png
cp "$ICONDIR/abcarus_96.png"  ~/.local/share/icons/hicolor/96x96/apps/abcarus.png
cp "$ICONDIR/abcarus_128.png" ~/.local/share/icons/hicolor/128x128/apps/abcarus.png
cp "$ICONDIR/abcarus_256.png" ~/.local/share/icons/hicolor/256x256/apps/abcarus.png
cp "$ICONDIR/abcarus_512.png" ~/.local/share/icons/hicolor/512x512/apps/abcarus.png

gtk-update-icon-cache -f ~/.local/share/icons/hicolor 2>/dev/null || true
