#!/usr/bin/env python3
"""
Generate custom voices using Qwen3-TTS VoiceDesign model.

Creates reference audio from a text description, then optionally
builds a reusable voice clone prompt for the Base model.

Pipeline: VoiceDesign -> reference WAV -> (optional) Base model clone prompt
"""

import argparse
import gc
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


VOICEDESIGN_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
BASE_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"

# Good sample texts for generating reference audio (varied phonemes)
SAMPLE_TEXTS = {
    "en": (
        "The morning sun cast golden rays across the quiet valley, "
        "where birds sang their familiar melodies among the ancient oak trees. "
        "She paused at the garden gate, breathing in the fresh spring air."
    ),
    "sv": (
        "Morgonsolen kastade gyllene strålar över den tysta dalen, "
        "där fåglar sjöng sina välbekanta melodier bland de gamla ekarna. "
        "Hon stannade vid grinden och andades in den friska vårluften."
    ),
}

# Preset voice descriptions for common use cases
VOICE_PRESETS = {
    "female-narrator-us": (
        "A warm, confident American female voice with clear enunciation. "
        "Smooth, professional narrator tone with natural California accent. "
        "Medium pitch, steady pace, suitable for audiobook narration."
    ),
    "female-narrator-uk": (
        "A refined British female voice with warm, inviting tone. "
        "Clear RP accent with natural expressiveness. "
        "Medium pitch, measured pace, perfect for storytelling."
    ),
    "female-young-us": (
        "A bright, energetic young American female voice. "
        "Clear and articulate with a friendly, approachable quality. "
        "Slightly higher pitch with natural enthusiasm."
    ),
    "male-narrator-us": (
        "A deep, resonant American male voice with authoritative warmth. "
        "Clear baritone suitable for audiobook narration. "
        "Steady, measured pace with natural gravitas."
    ),
    "male-narrator-uk": (
        "A rich British male voice with warm, commanding presence. "
        "Clear received pronunciation with natural storytelling cadence. "
        "Baritone range, confident and engaging."
    ),
}


def warn(msg: str) -> None:
    print(f"[voice-design] {msg}", file=sys.stderr, flush=True)


def pick_device() -> str:
    forced = os.environ.get("QWEN_DEVICE", "").strip().lower()
    if forced:
        return forced
    if torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


def pick_dtype(device: str) -> torch.dtype:
    d_type = "cuda" if device.startswith("cuda") else device
    if d_type == "cuda":
        return torch.bfloat16
    if d_type == "mps":
        return torch.float16
    return torch.float32


def load_model(model_id: str, device: str, dtype: torch.dtype) -> Qwen3TTSModel:
    """Load a Qwen3 TTS model with appropriate settings."""
    d_type = "cuda" if device.startswith("cuda") else device
    kwargs = {}

    if d_type == "cuda":
        kwargs["device_map"] = device
        kwargs["dtype"] = dtype
        kwargs["attn_implementation"] = "flash_attention_2"
    else:
        kwargs["device_map"] = "cpu"
        kwargs["dtype"] = torch.float32

    try:
        model = Qwen3TTSModel.from_pretrained(model_id, **kwargs)
    except Exception:
        # Fallback: try without flash attention
        kwargs.pop("attn_implementation", None)
        if dtype != torch.float32:
            kwargs["dtype"] = torch.float32
        model = Qwen3TTSModel.from_pretrained(model_id, **kwargs)

    model.model.eval()
    if d_type not in ("cuda",):
        model.model.to(device)
    model.device = torch.device(device)
    return model


def free_model(model: Qwen3TTSModel, device: str) -> None:
    """Free model memory."""
    del model
    gc.collect()
    if device.startswith("cuda"):
        torch.cuda.empty_cache()
    elif device == "mps":
        if hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()


def generate_voice_design(
    model: Qwen3TTSModel,
    text: str,
    language: str,
    instruct: str,
    device: str,
) -> tuple[np.ndarray, int]:
    """Generate audio with VoiceDesign model."""
    with torch.inference_mode():
        wavs, sr = model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
        )

    wav = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
    return wav, int(sr)


def test_clone(
    ref_audio_path: str,
    ref_text: str,
    test_text: str,
    language: str,
    output_path: str,
    device: str,
) -> dict:
    """Load Base model and test voice cloning with the reference audio."""
    warn(f"Loading Base model ({BASE_MODEL_ID}) for clone test...")
    dtype = pick_dtype(device)
    # Voice cloning on MPS needs float32
    if device == "mps":
        dtype = torch.float32

    model = load_model(BASE_MODEL_ID, device, dtype)
    load_done = time.monotonic()

    warn("Creating voice clone prompt...")
    with torch.inference_mode():
        voice_clone_prompt = model.create_voice_clone_prompt(
            ref_audio=ref_audio_path,
            ref_text=ref_text,
        )

    warn(f"Generating clone test: {test_text[:60]}...")
    t0 = time.monotonic()
    with torch.inference_mode():
        wavs, sr = model.generate_voice_clone(
            text=test_text,
            language=language,
            voice_clone_prompt=voice_clone_prompt,
        )

    elapsed = time.monotonic() - t0
    wav = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
    audio_sec = len(wav) / sr

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, wav, sr)

    free_model(model, device)

    return {
        "output": output_path,
        "audioDuration": round(audio_sec, 2),
        "wallClock": round(elapsed, 2),
        "sampleRate": sr,
    }


def parse_args() -> argparse.Namespace:
    preset_names = ", ".join(VOICE_PRESETS.keys())

    parser = argparse.ArgumentParser(
        description="Generate custom voices using Qwen3 TTS VoiceDesign",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Presets: {preset_names}

Examples:
  %(prog)s --preset female-narrator-us -o voice_ref.wav
  %(prog)s --instruct "Warm American female, 30s, audiobook narrator" -o ref.wav
  %(prog)s --preset female-narrator-us -o ref.wav --test-clone clone_test.wav
  %(prog)s --list-presets
""",
    )
    parser.add_argument("--list-presets", action="store_true", help="Show available voice presets")

    voice_group = parser.add_mutually_exclusive_group()
    voice_group.add_argument("--preset", help="Use a voice preset name")
    voice_group.add_argument("--instruct", help="Custom voice description text")

    parser.add_argument("-o", "--output", help="Output WAV path for reference audio")
    parser.add_argument("--language", default="English", help="Language (default: English)")
    parser.add_argument(
        "--text", help="Text to speak (default: built-in sample for language)",
    )
    parser.add_argument(
        "--model-id", default=VOICEDESIGN_MODEL_ID,
        help=f"VoiceDesign model ID (default: {VOICEDESIGN_MODEL_ID})",
    )

    # Clone test options
    parser.add_argument(
        "--test-clone", metavar="PATH",
        help="Also test voice cloning with the generated reference, save to PATH",
    )
    parser.add_argument(
        "--clone-text",
        help="Text for clone test (default: same as --text)",
    )

    # Multiple variations
    parser.add_argument(
        "--variations", type=int, default=1,
        help="Generate N variations of the same voice (default: 1)",
    )

    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.list_presets:
        print("\nAvailable voice presets:\n")
        for name, desc in VOICE_PRESETS.items():
            print(f"  {name}:")
            print(f"    {desc}\n")
        return 0

    if not args.preset and not args.instruct:
        print("Error: Provide --preset or --instruct (or use --list-presets)", file=sys.stderr)
        return 1

    if not args.output:
        print("Error: --output is required", file=sys.stderr)
        return 1

    # Resolve voice description
    if args.preset:
        if args.preset not in VOICE_PRESETS:
            print(f"Error: Unknown preset '{args.preset}'. Use --list-presets.", file=sys.stderr)
            return 1
        instruct = VOICE_PRESETS[args.preset]
        warn(f"Using preset: {args.preset}")
    else:
        instruct = args.instruct

    # Resolve text
    lang_key = args.language.lower()[:2]
    text = args.text or SAMPLE_TEXTS.get(lang_key, SAMPLE_TEXTS["en"])

    device = pick_device()
    dtype = pick_dtype(device)
    warn(f"Device: {device}, dtype: {dtype}")

    # Load VoiceDesign model
    warn(f"Loading VoiceDesign model ({args.model_id})...")
    t_load = time.monotonic()
    model = load_model(args.model_id, device, dtype)
    warn(f"Model loaded in {time.monotonic() - t_load:.1f}s")

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    results = []

    for i in range(args.variations):
        suffix = f"_v{i+1}" if args.variations > 1 else ""
        if args.variations > 1:
            out = output_path.parent / f"{output_path.stem}{suffix}{output_path.suffix}"
        else:
            out = output_path

        warn(f"Generating{suffix}: {instruct[:60]}...")
        t0 = time.monotonic()
        wav, sr = generate_voice_design(model, text, args.language, instruct, device)
        elapsed = time.monotonic() - t0
        audio_sec = len(wav) / sr

        sf.write(str(out), wav, sr)
        warn(f"Saved {out.name} ({audio_sec:.1f}s audio, {elapsed:.1f}s wall)")

        results.append({
            "file": str(out),
            "audioDuration": round(audio_sec, 2),
            "wallClock": round(elapsed, 2),
            "sampleRate": sr,
        })

    # Free VoiceDesign model before loading Base for clone test
    free_model(model, device)

    # Optional: test cloning with the generated reference
    if args.test_clone:
        ref_path = str(results[0]["file"])  # Use first variation as reference
        clone_text = args.clone_text or text
        clone_result = test_clone(
            ref_audio_path=ref_path,
            ref_text=text,
            test_text=clone_text,
            language=args.language,
            output_path=args.test_clone,
            device=device,
        )
        warn(f"Clone test saved to {args.test_clone} "
             f"({clone_result['audioDuration']}s audio, {clone_result['wallClock']}s wall)")
        results.append({"clone_test": clone_result})

    # Print results as JSON
    print(json.dumps({"results": results}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as err:
        print(str(err), file=sys.stderr)
        raise SystemExit(1)
