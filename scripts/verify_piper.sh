#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PIPER_BIN="${PIPER_BIN:-"$REPO_ROOT/vendor/tts/piper/piper/piper"}"
VOICE_MODEL="${VOICE_MODEL:-"$REPO_ROOT/vendor/tts/voices/sv_SE-nst-medium.onnx"}"
VOICE_CONFIG="${VOICE_CONFIG:-"$REPO_ROOT/vendor/tts/voices/sv_SE-nst-medium.onnx.json"}"
VOICE_DATA_DIR="${VOICE_DATA_DIR:-"$REPO_ROOT/vendor/tts/voices"}"

LIB_DIR="$REPO_ROOT/vendor/tts/piper/piper"

echo "Using Piper binary: $PIPER_BIN"
echo "Using model:        $VOICE_MODEL"
echo "Using config:       $VOICE_CONFIG"
echo "Using data dir:     $VOICE_DATA_DIR"
echo "Using lib dir:      $LIB_DIR"
echo

if ! command -v otool >/dev/null 2>&1; then
  echo "otool not found on PATH (macOS developer tools required)" >&2
else
  echo "otool -L \"$PIPER_BIN\":"
  otool -L "$PIPER_BIN" || true
  echo
fi

export DYLD_LIBRARY_PATH="${LIB_DIR}${DYLD_LIBRARY_PATH+:${DYLD_LIBRARY_PATH}}"

TMP_WAV="${TMP_WAV:-/tmp/piper-test.wav}"
echo "Writing test audio to: $TMP_WAV"
echo "Hej" | "$PIPER_BIN" \
  -m "$VOICE_MODEL" \
  -c "$VOICE_CONFIG" \
  --data-dir "$VOICE_DATA_DIR" \
  -f "$TMP_WAV"

echo
echo "file \"$TMP_WAV\":"
file "$TMP_WAV" || true

