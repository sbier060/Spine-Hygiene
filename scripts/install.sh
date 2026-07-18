#!/bin/sh
# Spine-IQ installer. Run with:
#   curl -fsSL https://raw.githubusercontent.com/sbier060/Spine-Hygiene/main/scripts/install.sh | sh
#
# Downloads the latest release DMG with curl (so macOS applies no quarantine),
# copies Spine-IQ.app into /Applications, and opens it. After this one install,
# the app keeps itself up to date automatically.
set -e

REPO="sbier060/Spine-Hygiene"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Finding the latest Spine-IQ release…"
DMG_URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"browser_download_url": *"[^"]*\.dmg"' \
  | head -1 \
  | sed 's/.*"\(https[^"]*\)"/\1/')"

if [ -z "$DMG_URL" ]; then
  echo "Could not find a DMG in the latest release." >&2
  exit 1
fi

echo "Downloading $(basename "$DMG_URL")…"
curl -fL -o "$TMP/spine-iq.dmg" "$DMG_URL"

echo "Installing to /Applications…"
MOUNT="$(hdiutil attach -nobrowse -readonly "$TMP/spine-iq.dmg" | grep -o '/Volumes/.*' | head -1)"
osascript -e 'quit app "Spine-IQ"' 2>/dev/null || true
sleep 1
rm -rf "/Applications/Spine-IQ.app"
cp -R "$MOUNT/Spine-IQ.app" /Applications/
hdiutil detach "$MOUNT" -quiet

open "/Applications/Spine-IQ.app"
echo "Spine-IQ installed and running. It keeps itself up to date from now on."
