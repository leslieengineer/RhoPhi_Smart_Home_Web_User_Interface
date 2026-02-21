#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy_webui.sh
# Build the Vue 3 WebUI and copy the output into the ESP32 firmware project's
# SPIFFS image folder so `idf.py build` will pick it up and flash it.
#
# Usage:
#   ./deploy_webui.sh              # build + copy only
#   ./deploy_webui.sh --flash      # build + copy + idf.py build + flash
#   PORT=/dev/ttyUSB1 ./deploy_webui.sh --flash
# ─────────────────────────────────────────────────────────────────────────────
set -e

WEBUI_DIR="$(cd "$(dirname "$0")" && pwd)"
FW_DIR="/home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW"
SPIFFS_DIR="$FW_DIR/middleware/services/webserver_5.2/spiffs_image"
PORT="${PORT:-/dev/ttyUSB0}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  RhoPhi WebUI Deploy Script                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Build WebUI ───────────────────────────────────────────────────────
echo "▶ [1/3] Building Vue3 WebUI..."
cd "$WEBUI_DIR"
npm run build
echo "  ✓ Build complete"

# ── Step 2: Copy dist → SPIFFS image folder ───────────────────────────────────
echo ""
echo "▶ [2/3] Copying dist/ → $SPIFFS_DIR"
rm -rf "$SPIFFS_DIR"
mkdir -p "$SPIFFS_DIR"
cp -r "$WEBUI_DIR/dist/"* "$SPIFFS_DIR/"
echo "  ✓ Copied files:"
find "$SPIFFS_DIR" -type f | while read f; do
    size=$(du -h "$f" | cut -f1)
    echo "      $size  ${f#$SPIFFS_DIR/}"
done

# ── Step 3 (optional): Build firmware + flash ─────────────────────────────────
if [ "$1" = "--flash" ]; then
    echo ""
    echo "▶ [3/3] Building ESP32 firmware..."
    cd "$FW_DIR"

    if [ -z "$IDF_PATH" ]; then
        echo "  ERROR: IDF_PATH not set. Source esp-idf/export.sh first."
        exit 1
    fi

    idf.py build
    echo "  ✓ Firmware built"

    echo ""
    echo "  Flashing to $PORT..."
    idf.py -p "$PORT" flash
    echo "  ✓ Flash complete"
    echo ""
    echo "  Open http://192.168.4.1 in your browser (connect to ESP32 AP first)"
else
    echo ""
    echo "▶ [3/3] Skipped flash (run with --flash to build & flash firmware)"
    echo ""
    echo "  To build & flash manually:"
    echo "    cd $FW_DIR"
    echo "    idf.py build"
    echo "    idf.py -p $PORT flash"
fi

echo ""
echo "✅ Done!"
