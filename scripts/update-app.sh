#!/bin/sh
# One-command updater for the installed Spine-IQ app.
#
#   sh scripts/update-app.sh
#
# Pulls the latest code, builds ONLY the .app bundle (no DMG), swaps it into
# /Applications, then deletes the entire build directory so the ~4 GB of Rust
# build artifacts never stay on disk. The build needs that space temporarily,
# but nothing is left behind afterwards.
set -e
cd "$(dirname "$0")/.."

# `tauri icon` (below) regenerates tracked icon files; discard those local
# regenerations before pulling or git refuses to merge over them.
git checkout -- src-tauri/icons 2>/dev/null || true

git pull

# Start clean: a partial/corrupt target from an earlier failed (disk-full)
# build can poison the new one with permission errors.
rm -rf src-tauri/target

# Regenerate the .icns/.ico set from the branded app icon.
npm run tauri icon ./app-icon.png

npm run tauri build -- --bundles app

# Replace the installed app (quit it first so the copy isn't busy).
osascript -e 'quit app "Spine-IQ"' 2>/dev/null || true
sleep 1
rm -rf /Applications/Spine-IQ.app
cp -R src-tauri/target/release/bundle/macos/Spine-IQ.app /Applications/

# Reclaim all build space.
rm -rf src-tauri/target

open /Applications/Spine-IQ.app
echo "Spine-IQ updated and running. Build space reclaimed."
