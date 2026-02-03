#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Defaults match backend env variable defaults
: "${TTS_BIN:=piper}"
: "${TTS_MODEL_PATH:=${REPO_ROOT}/vendor/tts/voices/sv_SE-nst-medium.onnx}"
: "${TTS_CONFIG_PATH:=${REPO_ROOT}/vendor/tts/voices/sv_SE-nst-medium.onnx.json}"
: "${TTS_DATA_DIR:=${REPO_ROOT}/vendor/tts/voices}"

echo "[tts-smoke] Using:"
echo "  TTS_BIN=${TTS_BIN}"
echo "  TTS_MODEL_PATH=${TTS_MODEL_PATH}"
echo "  TTS_CONFIG_PATH=${TTS_CONFIG_PATH}"
echo "  TTS_DATA_DIR=${TTS_DATA_DIR}"

if ! command -v "${TTS_BIN}" >/dev/null 2>&1; then
  echo "[tts-smoke] ERROR: TTS_BIN '${TTS_BIN}' not found in PATH." >&2
  echo "  Hint: on macOS you can add '${REPO_ROOT}/vendor/tts/piper/piper' to PATH," >&2
  echo "  e.g. export PATH=\"${REPO_ROOT}/vendor/tts/piper/piper:\$PATH\"" >&2
  exit 1
fi

if [ ! -f "${TTS_MODEL_PATH}" ] || [ ! -f "${TTS_CONFIG_PATH}" ]; then
  echo "[tts-smoke] ERROR: Model or config file missing." >&2
  echo "  MODEL:  ${TTS_MODEL_PATH}" >&2
  echo "  CONFIG: ${TTS_CONFIG_PATH}" >&2
  exit 1
fi

TMP_WAV="$(mktemp /tmp/verkli-tts-smoke-XXXXXX.wav)"
trap 'rm -f "${TMP_WAV}"' EXIT

echo "[tts-smoke] Synthesizing short Swedish phrase to ${TMP_WAV} ..."

echo "Hej, detta är ett TTS-smoke-test från Verkli." | "${TTS_BIN}" \
  -m "${TTS_MODEL_PATH}" \
  -c "${TTS_CONFIG_PATH}" \
  --data-dir "${TTS_DATA_DIR}" \
  -f "${TMP_WAV}"

if [ ! -s "${TMP_WAV}" ]; then
  echo "[tts-smoke] ERROR: Output file not created or empty." >&2
  exit 1
fi

# Verify simple WAV header: first 4 bytes should be "RIFF"
HEADER_HEX="$(head -c 4 "${TMP_WAV}" | xxd -p -u || true)"
if [ "${HEADER_HEX}" != "52494646" ]; then
  echo "[tts-smoke] ERROR: Output does not look like a RIFF/WAV file (header=${HEADER_HEX})." >&2
  exit 1
fi

echo "[tts-smoke] WAV header OK (RIFF)."

# On macOS, try to play the file if 'afplay' is available.
if [[ "$(uname)" == "Darwin" ]] && command -v afplay >/dev/null 2>&1; then
  echo "[tts-smoke] Playing result via afplay ..."
  afplay "${TMP_WAV}" || echo "[tts-smoke] Warning: afplay failed (non-fatal)." >&2
else
  echo "[tts-smoke] Not playing audio (afplay not available or not macOS)."
fi

echo "[tts-smoke] OK."

