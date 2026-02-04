#!/bin/bash
# Laddar ner och konverterar Opus MT sv→en-modellen till CTranslate2-format.
# Kör från apps/web: ./scripts/setup-opus-models.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODELS_DIR="$WEB_DIR/models"
SV_EN_DIR="$MODELS_DIR/sv_en"
TMP_DIR="$WEB_DIR/.tmp-opus-setup"
ZIP_URL="https://object.pouta.csc.fi/OPUS-MT-models/sv-en/opus-2020-02-26.zip"
ZIP_FILE="$TMP_DIR/opus-2020-02-26.zip"
EXTRACT_DIR="$TMP_DIR/opus-sv-en"

echo "[opus setup] Skapar modellkatalog: $SV_EN_DIR"
mkdir -p "$SV_EN_DIR"
mkdir -p "$TMP_DIR"

echo "[opus setup] Laddar ner OPUS-MT sv-en (~100 MB)..."
curl -L -o "$ZIP_FILE" "$ZIP_URL"

echo "[opus setup] Packar upp..."
rm -rf "$EXTRACT_DIR"
unzip -o -q "$ZIP_FILE" -d "$TMP_DIR"
# Hitta mappen med decoder.yml (zip-struktur varierar)
EXTRACT_DIR=$(find "$TMP_DIR" -name "decoder.yml" -exec dirname {} \; 2>/dev/null | head -1)
if [ -z "$EXTRACT_DIR" ]; then
  echo "[opus setup] Fel: decoder.yml hittades inte i $TMP_DIR"
  find "$TMP_DIR" -type f
  exit 1
fi
echo "[opus setup] Modellmapp: $EXTRACT_DIR"

echo "[opus setup] Konverterar till CTranslate2-format..."
VENV_DIR="$WEB_DIR/.venv-opus"
if [ ! -d "$VENV_DIR" ]; then
  echo "[opus setup] Skapar Python-venv för konvertering..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install -q ctranslate2 sentencepiece
fi
"$VENV_DIR/bin/python" -m ctranslate2.converters.opus_mt --model_dir "$EXTRACT_DIR" --output_dir "$SV_EN_DIR" --force

echo "[opus setup] Kopierar source.spm och target.spm..."
cp "$EXTRACT_DIR/source.spm" "$SV_EN_DIR/"
cp "$EXTRACT_DIR/target.spm" "$SV_EN_DIR/"

echo "[opus setup] Rensar temporära filer..."
rm -rf "$TMP_DIR"

echo "[opus setup] Klart! Modellerna finns i: $SV_EN_DIR"
ls -la "$SV_EN_DIR"
