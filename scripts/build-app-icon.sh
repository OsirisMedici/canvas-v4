#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT_DIR/assets/osiris-vault-icon.svg"
WORK="$ROOT_DIR/dist/icon-build"
ICONSET="$WORK/OsirisVault.iconset"
OUTPUT="$ROOT_DIR/dist/OsirisVault.icns"

rm -rf "$WORK"
mkdir -p "$ICONSET"
qlmanage -t -s 1024 -o "$WORK" "$SOURCE" >/dev/null 2>&1
MASTER="$WORK/osiris-vault-icon.svg.png"

sips -z 16 16 "$MASTER" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$MASTER" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$MASTER" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$MASTER" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$MASTER" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$MASTER" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$MASTER" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$MASTER" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$MASTER" --out "$ICONSET/icon_512x512.png" >/dev/null
cp "$MASTER" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$OUTPUT"
echo "$OUTPUT"
