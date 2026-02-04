#!/usr/bin/env python3
"""
Opus MT translation via local CTranslate2 model.
Args: model_dir, source_language, target_language. Reads text from stdin. Writes translated text to stdout.
Errors to stderr, exit 1 on failure.
Supports: sv -> en, en -> sv
"""

import sys
import os

# Supported language pairs
SUPPORTED_PAIRS = {
    ("sv", "en"),
    ("en", "sv"),
}


def main() -> None:
    if len(sys.argv) != 4:
        sys.stderr.write("Usage: opus_translate.py <model_dir> <source_language> <target_language>\n")
        sys.stderr.write("Reads text from stdin, writes translation to stdout.\n")
        sys.exit(1)

    model_dir = sys.argv[1].strip()
    source_language = sys.argv[2].strip().lower()
    target_language = sys.argv[3].strip().lower()

    if (source_language, target_language) not in SUPPORTED_PAIRS:
        supported = ", ".join("{} -> {}".format(s, t) for s, t in SUPPORTED_PAIRS)
        sys.stderr.write("Unsupported language pair: {} -> {}. Supported: {}\n".format(
            source_language, target_language, supported))
        sys.exit(1)

    if not os.path.isdir(model_dir):
        sys.stderr.write("Model dir does not exist: {}\n".format(model_dir))
        sys.exit(1)

    text = sys.stdin.read()

    try:
        import sentencepiece as spm
        import ctranslate2
    except ImportError as e:
        sys.stderr.write("Missing dependency: {}\n".format(e))
        sys.exit(1)

    spm_path = os.path.join(model_dir, "source.spm")
    if not os.path.isfile(spm_path):
        sys.stderr.write("SentencePiece model not found: {}\n".format(spm_path))
        sys.exit(1)

    try:
        sp = spm.SentencePieceProcessor()
        sp.load(spm_path)
    except Exception as e:
        sys.stderr.write("Failed to load SentencePiece: {}\n".format(e))
        sys.exit(1)

    try:
        translator = ctranslate2.Translator(model_dir)
    except Exception as e:
        sys.stderr.write("Failed to load CTranslate2 model: {}\n".format(e))
        sys.exit(1)

    try:
        source_tokens = sp.encode(text, out_type=str)
        results = translator.translate_batch([source_tokens])
        output_tokens = results[0].hypotheses[0]
        output = sp.decode(output_tokens)
    except Exception as e:
        sys.stderr.write("Translation failed: {}\n".format(e))
        sys.exit(1)

    sys.stdout.write(output)
    if not output.endswith("\n"):
        sys.stdout.write("\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
