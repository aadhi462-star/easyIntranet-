#!/bin/sh
# Builds the folder (and zip) to upload to Catalyst AppSail: one Node service that serves the
# API on /api and the built web app on every other path, exactly as `npm run server` does.
#   npm run build:appsail   →  appsail-build/  and  appsail-build.zip
# Startup command on AppSail: npm start   (seeds an empty database once, then starts the server)
set -e
cd "$(dirname "$0")/.."
OUT=appsail-build
rm -rf "$OUT" "$OUT.zip"
npx vite build
mkdir -p "$OUT"
# Server code, shared code, the built app and the manifest. Tests and local databases stay out.
rsync -a --exclude .data --exclude test server shared dist package.json package-lock.json "$OUT/"
# Production dependencies only (no Vite/Tailwind build tools).
rsync -a node_modules "$OUT/"
(cd "$OUT" && npm prune --omit=dev --no-audit --no-fund >/dev/null)
(cd "$OUT" && zip -qr "../$OUT.zip" .)
echo "built $OUT/ and $OUT.zip ($(du -sh "$OUT.zip" | cut -f1))"
