#!/usr/bin/env python3
"""
Local Qwen3 TTS synthesizer for audiobook worker.

Reads text from stdin and writes a WAV file to --output.
Prints one JSON line on stdout:
{"outputPath":"...","sampleRate":22050,"device":"mps|cpu","method":"custom|clone","chunks":N}
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable, List, Tuple

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


DEFAULT_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
DEFAULT_REF_TEXT = "This is a local reference voice clip for Qwen voice clone testing."

SUPPORTED_LANGUAGES = {
    "auto",
    "chinese",
    "english",
    "french",
    "german",
    "italian",
    "japanese",
    "korean",
    "portuguese",
    "russian",
    "spanish",
}

LANGUAGE_ALIASES = {
    "sv": "auto",
    "sv-se": "auto",
    "swedish": "auto",
    "svenska": "auto",
    "en": "english",
    "en-us": "english",
    "en-gb": "english",
    "english": "english",
    "de": "german",
    "german": "german",
    "fr": "french",
    "french": "french",
    "es": "spanish",
    "spanish": "spanish",
    "it": "italian",
    "italian": "italian",
    "pt": "portuguese",
    "portuguese": "portuguese",
    "ru": "russian",
    "russian": "russian",
    "ja": "japanese",
    "japanese": "japanese",
    "ko": "korean",
    "korean": "korean",
    "zh": "chinese",
    "zh-cn": "chinese",
    "chinese": "chinese",
    "auto": "auto",
}


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def normalize_language(raw: str) -> str:
    value = (raw or "").strip().lower()
    if not value:
        return "auto"

    mapped = LANGUAGE_ALIASES.get(value, value)
    if mapped not in SUPPORTED_LANGUAGES:
        return "auto"
    return mapped


def split_text(text: str, max_chars: int) -> List[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []

    if max_chars <= 0 or len(normalized) <= max_chars:
        return [normalized]

    chunks: List[str] = []
    rest = normalized
    while rest:
        if len(rest) <= max_chars:
            chunks.append(rest)
            break

        segment = rest[:max_chars]
        cut = max(
            segment.rfind(". "),
            segment.rfind("! "),
            segment.rfind("? "),
            segment.rfind("\n"),
        )
        if cut <= 0:
            cut = max_chars
        else:
            cut = cut + 1

        piece = rest[:cut].strip()
        if piece:
            chunks.append(piece)
            rest = rest[cut:].strip()
        else:
            chunks.append(rest[:max_chars])
            rest = rest[max_chars:].strip()

    return [c for c in chunks if c]


def ensure_ref_audio(ref_audio: str | None, ref_text: str | None) -> Tuple[str, str]:
    resolved_text = (ref_text or DEFAULT_REF_TEXT).strip() or DEFAULT_REF_TEXT
    if ref_audio:
        path = Path(ref_audio).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"Reference audio does not exist: {path}")
        return str(path), resolved_text

    auto_ref = Path(tempfile.gettempdir()) / "verkli-qwen-ref.aiff"
    if auto_ref.exists():
        return str(auto_ref), resolved_text

    try:
        subprocess.run(
            ["say", "-v", "Samantha", "-o", str(auto_ref), resolved_text],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except Exception as err:  # noqa: BLE001
        raise RuntimeError(
            "Qwen generate_voice_clone requires reference audio. "
            "Set QWEN_TTS_REF_AUDIO/QWEN_TTS_REF_TEXT in env."
        ) from err

    return str(auto_ref), resolved_text


def to_float_wav(wavs) -> np.ndarray:
    candidate = wavs[0] if isinstance(wavs, (list, tuple)) else wavs
    array = np.asarray(candidate, dtype=np.float32).reshape(-1)
    if array.size == 0:
        raise RuntimeError("Generated audio was empty")
    return array


def synthesize_chunk(
    model: Qwen3TTSModel,
    text: str,
    language: str,
    speaker: str,
    ref_audio: str | None,
    ref_text: str | None,
) -> Tuple[np.ndarray, int, str]:
    model_type = str(getattr(getattr(model, "model", None), "tts_model_type", "")).lower()

    if model_type != "base" and hasattr(model, "generate_custom_voice"):
        try:
            wavs, sr = model.generate_custom_voice(
                text=text,
                language=language,
                speaker=speaker,
            )
            return to_float_wav(wavs), int(sr), "custom"
        except Exception as err:  # noqa: BLE001
            # Some model wrappers expose generate_custom_voice but still reject it at runtime.
            if "generate_custom_voice" not in str(err):
                raise

    if hasattr(model, "generate_voice_clone"):
        resolved_ref_audio, resolved_ref_text = ensure_ref_audio(ref_audio, ref_text)
        wavs, sr = model.generate_voice_clone(
            text=text,
            language=language,
            ref_audio=resolved_ref_audio,
            ref_text=resolved_ref_text,
            non_streaming_mode=True,
            max_new_tokens=512,
        )
        return to_float_wav(wavs), int(sr), "clone"

    raise RuntimeError("Qwen model lacks generate_custom_voice and generate_voice_clone")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Qwen3 TTS synthesizer")
    parser.add_argument("--output", required=True, help="Output WAV path")
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID, help="HuggingFace model id")
    parser.add_argument("--language", default="auto", help="Language code/name")
    parser.add_argument("--speaker", default="Ryan", help="Speaker id for custom voice")
    parser.add_argument("--max-chars", type=int, default=1000, help="Chunk size for long text")
    parser.add_argument("--ref-audio", default=os.environ.get("QWEN_TTS_REF_AUDIO"), help="Reference audio path")
    parser.add_argument("--ref-text", default=os.environ.get("QWEN_TTS_REF_TEXT"), help="Reference transcript")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    text = sys.stdin.read().strip()
    if not text:
        print("Input text is empty.", file=sys.stderr)
        return 2

    device = pick_device()
    language = normalize_language(args.language)

    load_kwargs = {
        "device_map": "cpu",
        "dtype": torch.float32,
        "attn_implementation": "eager",
    }

    model = Qwen3TTSModel.from_pretrained(args.model_id, **load_kwargs)
    model.model.to(device)
    model.device = torch.device(device)

    chunks = split_text(text, args.max_chars)
    if not chunks:
        print("Input text is empty after normalization.", file=sys.stderr)
        return 2

    chunk_wavs: List[np.ndarray] = []
    sample_rate: int | None = None
    method = "unknown"

    for chunk in chunks:
        wav, sr, chunk_method = synthesize_chunk(
            model=model,
            text=chunk,
            language=language,
            speaker=args.speaker,
            ref_audio=args.ref_audio,
            ref_text=args.ref_text,
        )
        if sample_rate is None:
            sample_rate = sr
        elif sr != sample_rate:
            raise RuntimeError(f"Mismatched sample rates between chunks: {sample_rate} vs {sr}")
        chunk_wavs.append(wav)
        method = chunk_method

    assert sample_rate is not None
    final_wav = chunk_wavs[0] if len(chunk_wavs) == 1 else np.concatenate(chunk_wavs)

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), final_wav, sample_rate)

    print(
        json.dumps(
            {
                "outputPath": str(output_path),
                "sampleRate": int(sample_rate),
                "device": device,
                "method": method,
                "chunks": len(chunks),
            }
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as err:  # noqa: BLE001
        print(str(err), file=sys.stderr)
        raise SystemExit(1)
