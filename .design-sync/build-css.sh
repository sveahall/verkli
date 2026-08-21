#!/bin/sh
# Compile Tailwind v4 globals.css -> a real stylesheet for the converter's cfg.cssEntry.
# MUST run before every package-build.mjs / preview-rebuild.mjs run: Tailwind only
# emits utilities it finds in scanned content, and .design-sync/previews/*.tsx are
# scanned sources. Output lands inside apps/web because cfg.cssEntry is pkgRoot-bounded.
set -e
cd "$(dirname "$0")/.."
node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs \
  -i .design-sync/tailwind-entry.css \
  -o apps/web/.ds-css/ds-tailwind.css
