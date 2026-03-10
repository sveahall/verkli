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
    batch_mode = '--batch' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--batch']

    if len(args) != 3:
        sys.stderr.write("Usage: opus_translate.py <model_dir> <source_language> <target_language> [--batch]\n")
        sys.stderr.write("Single mode: reads text from stdin, writes translation to stdout.\n")
        sys.stderr.write("Batch mode (--batch): reads JSON array from stdin, writes JSON array to stdout.\n")
        sys.exit(1)

    model_dir = args[0].strip()
    source_language = args[1].strip().lower()
    target_language = args[2].strip().lower()

    if (source_language, target_language) not in SUPPORTED_PAIRS:
        supported = ", ".join("{} -> {}".format(s, t) for s, t in SUPPORTED_PAIRS)
        sys.stderr.write("Unsupported language pair: {} -> {}. Supported: {}\n".format(
            source_language, target_language, supported))
        sys.exit(1)

    if not os.path.isdir(model_dir):
        sys.stderr.write("Model dir does not exist: {}\n".format(model_dir))
        sys.exit(1)

    raw_input = sys.stdin.read()

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

    if batch_mode:
        import json
        try:
            texts = json.loads(raw_input)
            if not isinstance(texts, list):
                sys.stderr.write("Batch mode expects a JSON array of strings\n")
                sys.exit(1)
        except json.JSONDecodeError as e:
            sys.stderr.write("Invalid JSON input for batch mode: {}\n".format(e))
            sys.exit(1)

        try:
            # Separate empty/non-empty for efficient batching
            non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]

            if non_empty:
                tokenized = [sp.encode(t, out_type=str) for _, t in non_empty]
                results = translator.translate_batch(tokenized)
                outputs = list(texts)  # start with originals (preserves empty strings)
                for (i, _orig), result in zip(non_empty, results):
                    outputs[i] = sp.decode(result.hypotheses[0])
            else:
                outputs = list(texts)
        except Exception as e:
            sys.stderr.write("Batch translation failed: {}\n".format(e))
            sys.exit(1)

        json.dump(outputs, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        sys.stdout.flush()
    else:
        try:
            source_tokens = sp.encode(raw_input, out_type=str)
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
