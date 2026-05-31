#!/usr/bin/env bash
# Downloads Playfair Display and Raleway TTFs from Google Fonts
set -e

FONTS_DIR="$(dirname "$0")/../src/assets/fonts"
mkdir -p "$FONTS_DIR"

echo "Downloading Playfair Display..."
curl -L "https://fonts.google.com/download?family=Playfair+Display" -o /tmp/playfair.zip
unzip -o /tmp/playfair.zip "*.ttf" -d /tmp/playfair_raw/
cp /tmp/playfair_raw/static/*.ttf "$FONTS_DIR/" 2>/dev/null || cp /tmp/playfair_raw/*.ttf "$FONTS_DIR/"

echo "Downloading Raleway..."
curl -L "https://fonts.google.com/download?family=Raleway" -o /tmp/raleway.zip
unzip -o /tmp/raleway.zip "*.ttf" -d /tmp/raleway_raw/
cp /tmp/raleway_raw/static/*.ttf "$FONTS_DIR/" 2>/dev/null || cp /tmp/raleway_raw/*.ttf "$FONTS_DIR/"

# Clean up
rm -rf /tmp/playfair.zip /tmp/playfair_raw /tmp/raleway.zip /tmp/raleway_raw

echo "Fonts installed to $FONTS_DIR:"
ls "$FONTS_DIR"
