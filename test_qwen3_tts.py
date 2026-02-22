#!/usr/bin/env python3
import os
import subprocess
from pathlib import Path

# Needed for unsupported MPS ops to fall back to CPU kernels.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import soundfile as sf
import torch

from qwen_tts import Qwen3TTSModel


MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
OUTPUT_WAV = "output_test.wav"
TEST_TEXT = "Hello. This is a local Qwen test."
REF_AUDIO = "ref_prompt.aiff"
REF_TEXT = (
    "This is a local reference voice clip for Qwen voice clone testing."
)


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def ensure_local_ref_audio() -> str:
    ref_path = Path(REF_AUDIO)
    if ref_path.exists():
        return str(ref_path)

    subprocess.run(
        ["say", "-v", "Samantha", "-o", str(ref_path), REF_TEXT],
        check=True,
    )
    return str(ref_path)


def main() -> None:
    # Make sure CUDA is not used.
    os.environ["CUDA_VISIBLE_DEVICES"] = ""

    device = pick_device()
    print(f"vald device: {device}")

    # Keep load path CUDA/flash-attn free.
    load_kwargs = {
        "device_map": "cpu",
        "dtype": torch.float32,
        "attn_implementation": "eager",
    }

    model = Qwen3TTSModel.from_pretrained(MODEL_ID, **load_kwargs)
    model.model.to(device)
    model.device = torch.device(device)
    print("modell laddad")

    model_type = str(getattr(model.model, "tts_model_type", "")).lower()
    if model_type == "base" and hasattr(model, "generate_voice_clone"):
        ref_audio_path = ensure_local_ref_audio()
        wavs, sr = model.generate_voice_clone(
            text=TEST_TEXT,
            language="English",
            ref_audio=ref_audio_path,
            ref_text=REF_TEXT,
            non_streaming_mode=True,
            max_new_tokens=512,
        )
    elif hasattr(model, "generate_custom_voice"):
        wavs, sr = model.generate_custom_voice(
            text=TEST_TEXT,
            language="English",
            speaker="Ryan",
        )
    else:
        raise RuntimeError("Ingen kompatibel generate_* metod hittades.")

    print("inference klar")
    sf.write(OUTPUT_WAV, wavs[0], sr)
    print(f"wav sparad: {OUTPUT_WAV}")


if __name__ == "__main__":
    main()
