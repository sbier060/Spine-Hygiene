#!/bin/sh
# Cut a release: bump the version everywhere, commit, tag, and push. GitHub
# Actions builds/signs/publishes it, and every installed app self-updates.
#
#   sh scripts/release.sh 0.3.0
set -e
cd "$(dirname "$0")/.."

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "usage: sh scripts/release.sh <version>  (e.g. 0.3.0)" >&2
  exit 1
fi

perl -pi -e "s/\"version\": \"[0-9.]+\"/\"version\": \"$VERSION\"/ if \$. < 5" package.json
perl -pi -e "s/\"version\": \"[0-9.]+\"/\"version\": \"$VERSION\"/ if \$. < 5" src-tauri/tauri.conf.json
perl -pi -e "s/^version = \"[0-9.]+\"/version = \"$VERSION\"/ if \$. < 5" src-tauri/Cargo.toml

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push origin main "v$VERSION"
echo "v$VERSION pushed — GitHub Actions is building the release."
echo "Watch it: gh run watch -R sbier060/Spine-Hygiene"
