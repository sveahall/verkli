#!/bin/sh
# Compile Tailwind v4 globals.css -> a real stylesheet for the converter's cfg.cssEntry.
# MUST run before every package-build.mjs / preview-rebuild.mjs run: Tailwind only
# emits utilities it finds in scanned content, and .design-sync/previews/*.tsx are
# scanned sources. Output lands inside apps/web because cfg.cssEntry is pkgRoot-bounded.
#
# Self-bootstrapping on purpose. The CLI lives in .ds-sync/node_modules, which is
# gitignored staging, so on a fresh clone this script used to die with
# MODULE_NOT_FOUND and take the documented CSS build with it. It now installs the
# CLI if it is missing.
#
# The version is PINNED to the repo's own tailwindcss. @tailwindcss/cli@4 floats
# (it resolved to 4.3.3 against a 4.1.18 repo), and a skewed compiler means the
# design system ships CSS the app never renders.
set -e
cd "$(dirname "$0")/.."

CLI="./.ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs"

if [ ! -f "$CLI" ]; then
  TW_VERSION=$(node -p "require('./node_modules/tailwindcss/package.json').version" 2>/dev/null || echo "")
  if [ -z "$TW_VERSION" ]; then
    echo "build-css: cannot read tailwindcss version from ./node_modules — run the repo install first (npm ci)." >&2
    exit 1
  fi
  echo "build-css: @tailwindcss/cli missing, installing ${TW_VERSION} into .ds-sync/ ..." >&2
  mkdir -p .ds-sync
  [ -f .ds-sync/package.json ] || echo '{"name":"ds-sync-deps","private":true}' > .ds-sync/package.json
  (cd .ds-sync && npm install --no-audit --no-fund "@tailwindcss/cli@${TW_VERSION}" >&2)
fi

node "$CLI" \
  -i .design-sync/tailwind-entry.css \
  -o apps/web/.ds-css/ds-tailwind.css
