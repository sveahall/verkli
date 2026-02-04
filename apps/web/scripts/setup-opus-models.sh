#!/bin/bash
# Laddar ner och konverterar Opus MT-modeller till CTranslate2-format.
# Kör från apps/web: ./scripts/setup-opus-models.sh
# Stödjer: sv→en och en→sv

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODELS_DIR="$WEB_DIR/models"
TMP_DIR="$WEB_DIR/.tmp-opus-setup"
VENV_DIR="$WEB_DIR/.venv-opus"

# Skapa venv om det inte finns
setup_venv() {
  if [ ! -d "$VENV_DIR" ]; then
    echo "[opus setup] Skapar Python-venv för konvertering..."
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install -q ctranslate2 sentencepiece
  fi
}

# Ladda ner och konvertera en modell
# $1 = språkpar (t.ex. "sv-en")
# $2 = URL till zip
# $3 = output-katalog (t.ex. "sv_en")
download_model() {
  local PAIR="$1"
  local ZIP_URL="$2"
  local OUTPUT_NAME="$3"
  local OUTPUT_DIR="$MODELS_DIR/$OUTPUT_NAME"
  local ZIP_FILE="$TMP_DIR/$OUTPUT_NAME.zip"

  # Kolla om modellen redan finns
  if [ -f "$OUTPUT_DIR/model.bin" ] && [ -f "$OUTPUT_DIR/source.spm" ] && [ -f "$OUTPUT_DIR/target.spm" ]; then
    echo "[opus setup] Modell $PAIR finns redan i $OUTPUT_DIR, hoppar över."
    return 0
  fi

  echo ""
  echo "================================================"
  echo "[opus setup] Laddar ner OPUS-MT $PAIR..."
  echo "================================================"

  mkdir -p "$OUTPUT_DIR"
  mkdir -p "$TMP_DIR"

  echo "[opus setup] Laddar ner från $ZIP_URL..."
  curl -L -o "$ZIP_FILE" "$ZIP_URL"

  echo "[opus setup] Packar upp..."
  rm -rf "$TMP_DIR/extract-$OUTPUT_NAME"
  unzip -o -q "$ZIP_FILE" -d "$TMP_DIR/extract-$OUTPUT_NAME"

  # Hitta mappen med decoder.yml (zip-struktur varierar)
  EXTRACT_DIR=$(find "$TMP_DIR/extract-$OUTPUT_NAME" -name "decoder.yml" -exec dirname {} \; 2>/dev/null | head -1)
  if [ -z "$EXTRACT_DIR" ]; then
    echo "[opus setup] Fel: decoder.yml hittades inte"
    find "$TMP_DIR/extract-$OUTPUT_NAME" -type f
    exit 1
  fi
  echo "[opus setup] Modellmapp: $EXTRACT_DIR"

  echo "[opus setup] Konverterar till CTranslate2-format..."
  "$VENV_DIR/bin/python" -m ctranslate2.converters.opus_mt --model_dir "$EXTRACT_DIR" --output_dir "$OUTPUT_DIR" --force

  echo "[opus setup] Kopierar source.spm och target.spm..."
  cp "$EXTRACT_DIR/source.spm" "$OUTPUT_DIR/"
  cp "$EXTRACT_DIR/target.spm" "$OUTPUT_DIR/"

  echo "[opus setup] $PAIR klar!"
  ls -la "$OUTPUT_DIR"
}

# Huvudprogram
echo "[opus setup] Opus MT Model Setup"
echo "[opus setup] Modellkatalog: $MODELS_DIR"

setup_venv

# Svenska → Engelska
download_model "sv-en" \
  "https://object.pouta.csc.fi/OPUS-MT-models/sv-en/opus-2020-02-26.zip" \
  "sv_en"

# Engelska → Svenska
download_model "en-sv" \
  "https://object.pouta.csc.fi/OPUS-MT-models/en-sv/opus-2020-02-26.zip" \
  "en_sv"

# Städa upp
echo ""
echo "[opus setup] Rensar temporära filer..."
rm -rf "$TMP_DIR"

echo ""
echo "================================================"
echo "[opus setup] Alla modeller installerade!"
echo "================================================"
echo "Tillgängliga modeller:"
ls -d "$MODELS_DIR"/*/ 2>/dev/null | while read dir; do
  echo "  - $(basename "$dir")"
done
