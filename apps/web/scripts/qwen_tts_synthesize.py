#!/usr/bin/env python3
"""
Local Qwen3 TTS synthesizer for audiobook worker.

Reads text from stdin and writes a WAV file to --output.
Prints one JSON line on stdout:
{
  "outputPath":"...",
  "sampleRate":22050,
  "device":"cuda:0|mps|cpu",
  "method":"custom|clone",
  "chunks":N,
  "metrics":{"wallClockSec":...,"audioSec":...,"rtf":...}
}
"""

import argparse
from contextlib import nullcontext
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


DEFAULT_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
DEFAULT_REF_TEXT = "This is a local reference voice clip for Qwen voice clone testing."
DEFAULT_MAX_CHARS = 350
DEFAULT_MAX_NEW_TOKENS = 2048

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


def warn(msg: str) -> None:
    print(f"[qwen-tts] {msg}", file=sys.stderr, flush=True)


def pick_device() -> str:
    forced = (os.environ.get("QWEN_DEVICE") or os.environ.get("QWEN_TTS_DEVICE") or "").strip().lower()
    has_mps = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())

    if forced:
        if forced == "cpu":
            return "cpu"
        if forced == "mps":
            if has_mps:
                return "mps"
            warn("QWEN_TTS_DEVICE=mps is set but MPS is unavailable. Falling back.")
        elif forced == "cuda" or forced.startswith("cuda:"):
            if torch.cuda.is_available():
                return forced if ":" in forced else "cuda:0"
            warn("QWEN_TTS_DEVICE requests CUDA but CUDA is unavailable. Falling back.")
        else:
            warn(f"QWEN_TTS_DEVICE={forced!r} is invalid. Falling back.")

    if torch.cuda.is_available():
        return "cuda:0"
    # MPS is slower than CPU for small float32 models on Apple Silicon.
    # Use QWEN_DEVICE=mps to override.
    return "cpu"


def normalize_language(raw: str) -> str:
    value = (raw or "").strip().lower()
    if not value:
        return "auto"

    mapped = LANGUAGE_ALIASES.get(value, value)
    if mapped not in SUPPORTED_LANGUAGES:
        return "auto"
    return mapped


def clamp_int(value: int, min_value: int, max_value: int) -> int:
    return max(min_value, min(max_value, int(value)))


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    return value not in ("0", "false", "no", "off", "")


def device_type_for(device: str) -> str:
    return "cuda" if device.startswith("cuda") else device


def cuda_supports_bfloat16() -> bool:
    if not torch.cuda.is_available():
        return False

    is_bf16_supported = getattr(torch.cuda, "is_bf16_supported", None)
    if callable(is_bf16_supported):
        try:
            return bool(is_bf16_supported())
        except Exception:  # noqa: BLE001
            pass

    try:
        major, _minor = torch.cuda.get_device_capability(0)
        return int(major) >= 8
    except Exception:  # noqa: BLE001
        return False


def resolve_dtype(device: str) -> torch.dtype:
    requested = (os.environ.get("QWEN_DTYPE") or os.environ.get("TTS_DTYPE") or "auto").strip().lower()
    requested_map = {
        "bf16": torch.bfloat16,
        "bfloat16": torch.bfloat16,
        "fp16": torch.float16,
        "float16": torch.float16,
        "fp32": torch.float32,
        "float32": torch.float32,
    }

    if requested in requested_map:
        return requested_map[requested]

    if requested not in ("", "auto"):
        warn(f"TTS_DTYPE={requested!r} is unsupported. Using auto.")

    d_type = device_type_for(device)
    if d_type == "cuda":
        return torch.bfloat16 if cuda_supports_bfloat16() else torch.float16
    if d_type == "mps":
        return torch.float32
    return torch.float32


def resolve_attn_implementation(device: str) -> str:
    requested = (os.environ.get("TTS_ATTN_IMPL") or "").strip()
    if requested:
        return requested
    if device_type_for(device) == "cuda" and env_bool("TTS_FLASH_ATTN", True):
        return "flash_attention_2"
    return "eager"


def should_enable_autocast(device: str, dtype: torch.dtype) -> bool:
    if not env_bool("TTS_AUTOCAST", True):
        return False
    if device_type_for(device) != "cuda":
        return False
    return dtype in (torch.float16, torch.bfloat16)


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


def to_float_wav(candidate: Any) -> np.ndarray:
    array = np.asarray(candidate, dtype=np.float32).reshape(-1)
    if array.size == 0:
        raise RuntimeError("Generated audio was empty")
    return array


def to_float_wavs(wavs: Any) -> List[np.ndarray]:
    if isinstance(wavs, (list, tuple)):
        return [to_float_wav(item) for item in wavs]
    return [to_float_wav(wavs)]


def prepare_voice_clone_prompt(
    model: Qwen3TTSModel,
    ref_audio: str | None,
    ref_text: str | None,
    xvector_only: bool,
):
    resolved_ref_audio, resolved_ref_text = ensure_ref_audio(ref_audio, ref_text)
    return model.create_voice_clone_prompt(
        ref_audio=resolved_ref_audio,
        ref_text=None if xvector_only else resolved_ref_text,
        x_vector_only_mode=xvector_only,
    )


def maybe_autocast(device: str, dtype: torch.dtype, enabled: bool):
    if not enabled:
        return nullcontext()
    d_type = device_type_for(device)
    if d_type != "cuda":
        return nullcontext()
    return torch.autocast(device_type="cuda", dtype=dtype, enabled=True)


def to_batch_or_scalar(values: List[str]) -> str | List[str]:
    return values[0] if len(values) == 1 else values


def synthesize_batch(
    model: Qwen3TTSModel,
    texts: List[str],
    language: str,
    speaker: str,
    instruct: str | None,
    ref_audio: str | None,
    ref_text: str | None,
    max_new_tokens: int,
    clone_non_streaming_mode: bool,
    device: str,
    autocast_enabled: bool,
    autocast_dtype: torch.dtype,
    voice_clone_prompt: Any = None,
) -> Tuple[List[np.ndarray], int, str]:
    if not texts:
        raise RuntimeError("synthesize_batch received empty text batch")

    model_type = str(getattr(getattr(model, "model", None), "tts_model_type", "")).lower()
    batched_language = [language] * len(texts)

    if model_type != "base" and hasattr(model, "generate_custom_voice"):
        try:
            with torch.inference_mode():
                with maybe_autocast(device, autocast_dtype, autocast_enabled):
                    wavs, sr = model.generate_custom_voice(
                        text=to_batch_or_scalar(texts),
                        language=to_batch_or_scalar(batched_language),
                        speaker=speaker,
                        instruct=to_batch_or_scalar([instruct] * len(texts)) if instruct else None,
                        non_streaming_mode=True,
                        max_new_tokens=max_new_tokens,
                    )
            return to_float_wavs(wavs), int(sr), "custom"
        except Exception as err:  # noqa: BLE001
            # Some model wrappers expose generate_custom_voice but still reject it at runtime.
            if "generate_custom_voice" not in str(err):
                raise

    if hasattr(model, "generate_voice_clone"):
        clone_kwargs = dict(
            text=to_batch_or_scalar(texts),
            language=to_batch_or_scalar(batched_language),
            non_streaming_mode=clone_non_streaming_mode,
            max_new_tokens=max_new_tokens,
        )
        if voice_clone_prompt is not None:
            clone_kwargs["voice_clone_prompt"] = voice_clone_prompt
        else:
            resolved_ref_audio, resolved_ref_text = ensure_ref_audio(ref_audio, ref_text)
            clone_kwargs["ref_audio"] = resolved_ref_audio
            clone_kwargs["ref_text"] = resolved_ref_text
        with torch.inference_mode():
            with maybe_autocast(device, autocast_dtype, autocast_enabled):
                wavs, sr = model.generate_voice_clone(**clone_kwargs)
        return to_float_wavs(wavs), int(sr), "clone"

    raise RuntimeError("Qwen model lacks generate_custom_voice and generate_voice_clone")


def build_load_kwargs(
    device: str,
    dtype: torch.dtype,
    attn_implementation: str,
    use_int8: bool,
) -> Dict[str, Any]:
    d_type = device_type_for(device)
    kwargs: Dict[str, Any] = {}

    if d_type == "cuda":
        kwargs["device_map"] = device
    else:
        kwargs["device_map"] = "cpu"

    if use_int8:
        kwargs["load_in_8bit"] = True
    else:
        kwargs["dtype"] = dtype
        kwargs["attn_implementation"] = attn_implementation

    return kwargs


def _wrap_norm_forward(original_forward):
    """Wrap a norm layer's forward: cast input to float32, run norm, cast back."""
    def wrapper(*args, **kwargs):
        # Cast tensor args to float32
        new_args = tuple(
            a.float() if isinstance(a, torch.Tensor) and a.is_floating_point() and a.dtype != torch.float32 else a
            for a in args
        )
        out = original_forward(*new_args, **kwargs)
        # Cast output back to the original input dtype
        if isinstance(out, torch.Tensor) and len(args) > 0 and isinstance(args[0], torch.Tensor):
            out = out.to(dtype=args[0].dtype)
        return out
    return wrapper


def upcast_norm_layers(model: torch.nn.Module) -> int:
    """Patch all norm layers to run in float32 — required for MPS which lacks fp16 LayerNorm/RMSNorm."""
    count = 0
    for module in model.modules():
        name = type(module).__name__.lower()
        if isinstance(module, (torch.nn.LayerNorm, torch.nn.GroupNorm)) or "norm" in name:
            module.float()
            module.forward = _wrap_norm_forward(module.forward)
            count += 1
    return count


def load_model_with_fallbacks(
    model_id: str,
    device: str,
    requested_dtype: torch.dtype,
    requested_attn_implementation: str,
) -> Tuple[Qwen3TTSModel, torch.dtype, str, bool]:
    d_type = device_type_for(device)
    dtype = requested_dtype
    attn_implementation = requested_attn_implementation
    int8_requested = env_bool("TTS_INT8", False)
    int8_enabled = bool(int8_requested and d_type == "cuda")
    if int8_requested and not int8_enabled:
        warn("TTS_INT8=1 ignored because CUDA is unavailable.")

    while True:
        load_kwargs = build_load_kwargs(
            device=device,
            dtype=dtype,
            attn_implementation=attn_implementation,
            use_int8=int8_enabled,
        )
        try:
            model = Qwen3TTSModel.from_pretrained(model_id, **load_kwargs)
            model.model.eval()

            if d_type != "cuda" and not int8_enabled:
                model.model.to(device)
            model.device = torch.device(device)

            if d_type == "mps" and dtype == torch.float16:
                n = upcast_norm_layers(model.model)
                warn(f"MPS mixed-precision: upcasted {n} LayerNorm/GroupNorm layers to float32")

            return model, dtype, attn_implementation, int8_enabled
        except Exception as err:  # noqa: BLE001
            if int8_enabled:
                warn(f"TTS_INT8 load failed ({err}); retrying without INT8.")
                int8_enabled = False
                continue
            if attn_implementation != "eager":
                warn(f"attn_implementation={attn_implementation} failed ({err}); retrying with eager.")
                attn_implementation = "eager"
                continue
            if dtype != torch.float32:
                warn(f"dtype={dtype} load failed ({err}); retrying with float32.")
                dtype = torch.float32
                continue
            raise


def maybe_compile_model(model: Qwen3TTSModel, device: str) -> Tuple[bool, Any]:
    if not env_bool("TTS_TORCH_COMPILE", False):
        return False, None
    if device_type_for(device) != "cuda":
        warn("TTS_TORCH_COMPILE=1 ignored because CUDA is unavailable.")
        return False, None
    if not hasattr(torch, "compile"):
        warn("TTS_TORCH_COMPILE=1 ignored because torch.compile is unavailable.")
        return False, None

    original_model = model.model
    compile_mode = (os.environ.get("TTS_TORCH_COMPILE_MODE") or "reduce-overhead").strip() or "reduce-overhead"
    try:
        model.model = torch.compile(model.model, mode=compile_mode)
        return True, original_model
    except Exception as err:  # noqa: BLE001
        model.model = original_model
        warn(f"torch.compile failed ({err}); continuing without compile.")
        return False, None


def maybe_cuda_sync(device: str) -> None:
    if device_type_for(device) == "cuda":
        torch.cuda.synchronize(torch.device(device))


def parse_args() -> argparse.Namespace:
    default_xvector_only = 1 if env_bool("QWEN_TTS_XVECTOR_ONLY", True) else 0
    default_clone_non_streaming = 1 if env_bool("QWEN_TTS_CLONE_NON_STREAMING_MODE", False) else 0
    batch_size_raw = os.environ.get("QWEN_TTS_BATCH_SIZE", os.environ.get("TTS_BATCH_SIZE", "1"))
    try:
        default_batch_size = int(batch_size_raw)
    except Exception:  # noqa: BLE001
        default_batch_size = 1

    parser = argparse.ArgumentParser(description="Qwen3 TTS synthesizer")
    parser.add_argument("--output", required=True, help="Output WAV path")
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID, help="HuggingFace model id")
    parser.add_argument("--language", default="auto", help="Language code/name")
    parser.add_argument("--speaker", default="Ryan", help="Speaker id for custom voice")
    parser.add_argument(
        "--instruct",
        default=os.environ.get("QWEN_TTS_INSTRUCT"),
        help="Optional voice/style instruction text for custom-voice generation",
    )
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS, help="Chunk size for long text")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=default_batch_size,
        help="How many text chunks to synthesize per model call",
    )
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=int(os.environ.get("QWEN_TTS_MAX_NEW_TOKENS", DEFAULT_MAX_NEW_TOKENS)),
        help="Upper bound for generated codec tokens",
    )
    parser.add_argument(
        "--xvector-only",
        type=int,
        choices=(0, 1),
        default=default_xvector_only,
        help="Use x-vector only prompt mode for voice clone (faster, less strict ICL)",
    )
    parser.add_argument(
        "--clone-non-streaming-mode",
        type=int,
        choices=(0, 1),
        default=default_clone_non_streaming,
        help="Enable clone non_streaming_mode",
    )
    parser.add_argument("--ref-audio", default=os.environ.get("QWEN_TTS_REF_AUDIO"), help="Reference audio path")
    parser.add_argument("--ref-text", default=os.environ.get("QWEN_TTS_REF_TEXT"), help="Reference transcript")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    wall_start = time.monotonic()
    text = sys.stdin.read().strip()
    if not text:
        print("Input text is empty.", file=sys.stderr)
        return 2

    device = pick_device()
    requested_dtype = resolve_dtype(device)
    requested_attn_implementation = resolve_attn_implementation(device)
    language = normalize_language(args.language)
    max_chars = clamp_int(args.max_chars, 80, 500)
    batch_size = clamp_int(args.batch_size, 1, 8)
    max_new_tokens = clamp_int(args.max_new_tokens, 48, 4096)
    xvector_only = bool(args.xvector_only)
    clone_non_streaming_mode = bool(args.clone_non_streaming_mode)

    # --- startup banner ---
    warn(f"device={device}, dtype={requested_dtype}, attn={requested_attn_implementation}")

    load_start = time.monotonic()
    model, model_dtype, attn_implementation, int8_enabled = load_model_with_fallbacks(
        model_id=args.model_id,
        device=device,
        requested_dtype=requested_dtype,
        requested_attn_implementation=requested_attn_implementation,
    )
    load_wall = time.monotonic() - load_start
    compile_enabled, original_model = maybe_compile_model(model, device)

    autocast_enabled = should_enable_autocast(device, model_dtype)
    warn(f"model loaded in {load_wall:.1f}s — dtype={model_dtype}, autocast={autocast_enabled}, int8={int8_enabled}")
    d_type = device_type_for(device)
    if d_type == "cuda":
        try:
            torch.cuda.reset_peak_memory_stats(torch.device(device))
        except Exception:  # noqa: BLE001
            pass

    chunks = split_text(text, max_chars)
    if not chunks:
        print("Input text is empty after normalization.", file=sys.stderr)
        return 2

    model_type = str(getattr(getattr(model, "model", None), "tts_model_type", "")).lower()
    voice_clone_prompt = None
    if model_type == "base" and hasattr(model, "generate_voice_clone"):
        with torch.inference_mode():
            with maybe_autocast(device, model_dtype, autocast_enabled):
                voice_clone_prompt = prepare_voice_clone_prompt(
                    model=model,
                    ref_audio=args.ref_audio,
                    ref_text=args.ref_text,
                    xvector_only=xvector_only,
                )

    chunk_wavs: List[np.ndarray] = []
    sample_rate: int | None = None
    method = "unknown"
    synthesis_wall = 0.0
    processed_chunks = 0

    for i in range(0, len(chunks), batch_size):
        batch_chunks = chunks[i : i + batch_size]
        maybe_cuda_sync(device)
        t0 = time.monotonic()
        print(
            f"[qwen-tts] chunk-batch {i+1}-{i+len(batch_chunks)}/{len(chunks)} "
            f"({sum(len(c) for c in batch_chunks)} chars) ...",
            file=sys.stderr,
            flush=True,
        )

        try:
            wavs, sr, chunk_method = synthesize_batch(
                model=model,
                texts=batch_chunks,
                language=language,
                speaker=args.speaker,
                instruct=args.instruct,
                ref_audio=args.ref_audio,
                ref_text=args.ref_text,
                max_new_tokens=max_new_tokens,
                clone_non_streaming_mode=clone_non_streaming_mode,
                device=device,
                autocast_enabled=autocast_enabled,
                autocast_dtype=model_dtype,
                voice_clone_prompt=voice_clone_prompt,
            )
        except Exception as err:  # noqa: BLE001
            if compile_enabled and original_model is not None:
                warn(f"Compiled model failed ({err}); retrying current batch without compile.")
                model.model = original_model
                compile_enabled = False
                maybe_cuda_sync(device)
                wavs, sr, chunk_method = synthesize_batch(
                    model=model,
                    texts=batch_chunks,
                    language=language,
                    speaker=args.speaker,
                    instruct=args.instruct,
                    ref_audio=args.ref_audio,
                    ref_text=args.ref_text,
                    max_new_tokens=max_new_tokens,
                    clone_non_streaming_mode=clone_non_streaming_mode,
                    device=device,
                    autocast_enabled=autocast_enabled,
                    autocast_dtype=model_dtype,
                    voice_clone_prompt=voice_clone_prompt,
                )
            else:
                raise

        maybe_cuda_sync(device)
        elapsed = time.monotonic() - t0
        synthesis_wall += elapsed

        if len(wavs) != len(batch_chunks):
            raise RuntimeError(
                f"Chunk batch size mismatch: expected {len(batch_chunks)} outputs, got {len(wavs)}."
            )

        batch_audio_sec = sum((len(wav) / sr if sr else 0.0) for wav in wavs)
        print(
            f"[qwen-tts] chunk-batch {i+1}-{i+len(batch_chunks)}/{len(chunks)} "
            f"done in {elapsed:.1f}s ({batch_audio_sec:.1f}s audio)",
            file=sys.stderr,
            flush=True,
        )

        if sample_rate is None:
            sample_rate = sr
        elif sr != sample_rate:
            raise RuntimeError(f"Mismatched sample rates between chunks: {sample_rate} vs {sr}")

        chunk_wavs.extend(wavs)
        processed_chunks += len(wavs)
        method = chunk_method

    assert sample_rate is not None
    final_wav = chunk_wavs[0] if len(chunk_wavs) == 1 else np.concatenate(chunk_wavs)
    audio_seconds = len(final_wav) / sample_rate if sample_rate > 0 else 0.0

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), final_wav, sample_rate)

    total_wall = time.monotonic() - wall_start
    rtf = (total_wall / audio_seconds) if audio_seconds > 0 else None
    gen_rtf = (synthesis_wall / audio_seconds) if audio_seconds > 0 else None
    chars = len(text)
    chars_per_sec_total = (chars / total_wall) if total_wall > 0 else None
    chars_per_sec_generation = (chars / synthesis_wall) if synthesis_wall > 0 else None

    gpu_peak_mib = None
    if d_type == "cuda":
        try:
            gpu_peak_mib = float(
                torch.cuda.max_memory_allocated(torch.device(device)) / (1024.0 * 1024.0)
            )
        except Exception:  # noqa: BLE001
            gpu_peak_mib = None

    print(
        json.dumps(
            {
                "outputPath": str(output_path),
                "sampleRate": int(sample_rate),
                "device": device,
                "method": method,
                "chunks": len(chunks),
                "maxChars": max_chars,
                "batchSize": batch_size,
                "maxNewTokens": max_new_tokens,
                "xvectorOnly": xvector_only,
                "dtype": str(model_dtype),
                "attnImplementation": attn_implementation,
                "autocast": autocast_enabled,
                "torchCompile": compile_enabled,
                "int8": int8_enabled,
                "metrics": {
                    "wallClockSec": round(total_wall, 4),
                    "loadSec": round(load_wall, 4),
                    "synthesisSec": round(synthesis_wall, 4),
                    "audioSec": round(audio_seconds, 4),
                    "rtf": round(rtf, 4) if rtf is not None else None,
                    "generationRtf": round(gen_rtf, 4) if gen_rtf is not None else None,
                    "chars": chars,
                    "charsPerSecTotal": round(chars_per_sec_total, 2)
                    if chars_per_sec_total is not None
                    else None,
                    "charsPerSecGeneration": round(chars_per_sec_generation, 2)
                    if chars_per_sec_generation is not None
                    else None,
                    "gpuPeakMemoryMiB": round(gpu_peak_mib, 2) if gpu_peak_mib is not None else None,
                    "processedChunks": processed_chunks,
                },
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
