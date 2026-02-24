#!/usr/bin/env python3
"""
Preprocess raw audio recordings into optimal reference clips for Qwen3 TTS voice cloning.

Converts to mono 24kHz PCM 16-bit WAV (matching the worker's ffmpeg pipeline),
trims silence, peak-normalizes, and prints a quality report.
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

FFMPEG = "/usr/local/bin/ffmpeg"
TARGET_SR = 24000
TARGET_PEAK_DB = -1.0


def warn(msg: str) -> None:
    print(f"[prepare-ref] {msg}", file=sys.stderr, flush=True)


def db_to_linear(db: float) -> float:
    return 10.0 ** (db / 20.0)


def linear_to_db(linear: float) -> float:
    if linear <= 0:
        return -120.0
    return 20.0 * np.log10(linear)


def convert_with_ffmpeg(input_path: str, output_path: str) -> None:
    """Convert any audio format to mono 24kHz PCM 16-bit WAV via ffmpeg."""
    cmd = [
        FFMPEG, "-y", "-i", input_path,
        "-ac", "1", "-ar", str(TARGET_SR), "-c:a", "pcm_s16le",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{result.stderr}")


def trim_silence(audio: np.ndarray, threshold_db: float) -> np.ndarray:
    """Trim leading and trailing silence below threshold."""
    threshold = db_to_linear(threshold_db)
    abs_audio = np.abs(audio)

    # Find first sample above threshold
    above = np.where(abs_audio > threshold)[0]
    if len(above) == 0:
        warn("Audio is entirely below silence threshold — returning as-is")
        return audio

    start = above[0]
    end = above[-1] + 1

    # Add a small margin (50ms) to avoid cutting speech onset/offset
    margin = int(0.05 * TARGET_SR)
    start = max(0, start - margin)
    end = min(len(audio), end + margin)

    return audio[start:end]


def peak_normalize(audio: np.ndarray, target_db: float) -> np.ndarray:
    """Normalize audio so peak hits target_db."""
    peak = np.max(np.abs(audio))
    if peak == 0:
        return audio
    target = db_to_linear(target_db)
    return audio * (target / peak)


def compute_rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(audio ** 2)))


def estimate_snr(audio: np.ndarray, sr: int, noise_duration: float = 0.5) -> float:
    """Estimate SNR by comparing overall RMS to the quietest segment."""
    noise_samples = int(noise_duration * sr)
    if len(audio) < noise_samples * 3:
        return float("nan")

    # Use a sliding window to find the quietest segment
    window = noise_samples
    step = window // 2
    min_rms = float("inf")
    for i in range(0, len(audio) - window, step):
        segment = audio[i : i + window]
        rms = float(np.sqrt(np.mean(segment ** 2)))
        if rms > 0 and rms < min_rms:
            min_rms = rms

    overall_rms = compute_rms(audio)
    if min_rms <= 0 or overall_rms <= 0:
        return float("nan")
    return 20.0 * np.log10(overall_rms / min_rms)


def print_report(audio: np.ndarray, sr: int, output_path: str) -> bool:
    """Print quality report and return True if audio passes all checks."""
    duration = len(audio) / sr
    peak = float(np.max(np.abs(audio)))
    peak_db = linear_to_db(peak)
    rms = compute_rms(audio)
    rms_db = linear_to_db(rms)
    snr = estimate_snr(audio, sr)

    print("\n" + "=" * 50)
    print("  Reference Audio Quality Report")
    print("=" * 50)
    print(f"  Output:      {output_path}")
    print(f"  Duration:    {duration:.2f}s")
    print(f"  Sample rate: {sr} Hz (mono)")
    print(f"  Peak level:  {peak_db:.1f} dB")
    print(f"  RMS level:   {rms_db:.1f} dB")
    if not np.isnan(snr):
        print(f"  Est. SNR:    {snr:.1f} dB")
    else:
        print(f"  Est. SNR:    (too short to estimate)")
    print("-" * 50)

    ok = True

    # Duration checks
    if duration < 3.0:
        print("  [FAIL] Duration < 3s — too short for reliable cloning")
        ok = False
    elif duration < 6.0:
        print("  [WARN] Duration < 6s — may produce inconsistent results")
    elif duration > 45.0:
        print("  [WARN] Duration > 45s — consider trimming for faster processing")
    else:
        print(f"  [ OK ] Duration {duration:.1f}s is in the optimal range (6-45s)")

    # Peak check
    if peak_db > -0.5:
        print("  [WARN] Peak very close to 0 dB — possible clipping")
    else:
        print(f"  [ OK ] Peak level {peak_db:.1f} dB")

    # RMS check
    if rms_db < -30.0:
        print("  [WARN] RMS level is very low — audio may be too quiet")
    else:
        print(f"  [ OK ] RMS level {rms_db:.1f} dB")

    # SNR check
    if not np.isnan(snr):
        if snr < 15.0:
            print("  [WARN] Estimated SNR < 15 dB — noisy audio may reduce clone quality")
        else:
            print(f"  [ OK ] Estimated SNR {snr:.1f} dB")

    print("=" * 50)
    if ok:
        print("  Result: PASS — ready for voice cloning")
    else:
        print("  Result: FAIL — see issues above")
    print("=" * 50 + "\n")

    return ok


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare reference audio for Qwen3 TTS voice cloning",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s recording.wav -o prepared.wav
  %(prog)s recording.m4a -o prepared.wav --trim-db -35
  %(prog)s interview.mp3 -o prepared.wav --no-trim
""",
    )
    parser.add_argument("input", help="Input audio file (any format ffmpeg supports)")
    parser.add_argument("-o", "--output", required=True, help="Output WAV path")
    parser.add_argument(
        "--trim-db", type=float, default=-40.0,
        help="Silence threshold in dB for trimming (default: -40)",
    )
    parser.add_argument(
        "--no-trim", action="store_true",
        help="Skip silence trimming",
    )
    parser.add_argument(
        "--no-normalize", action="store_true",
        help="Skip peak normalization",
    )
    parser.add_argument(
        "--target-db", type=float, default=TARGET_PEAK_DB,
        help=f"Target peak level in dB after normalization (default: {TARGET_PEAK_DB})",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        return 1

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Step 1: Convert to mono 24kHz PCM WAV via ffmpeg
    warn(f"Converting {input_path.name} to mono {TARGET_SR}Hz PCM WAV...")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        convert_with_ffmpeg(str(input_path), tmp_path)
        audio, sr = sf.read(tmp_path, dtype="float32")
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if sr != TARGET_SR:
        warn(f"Unexpected sample rate {sr} from ffmpeg (expected {TARGET_SR})")

    original_duration = len(audio) / sr
    warn(f"Loaded {original_duration:.2f}s of audio")

    # Step 2: Trim silence
    if not args.no_trim:
        audio = trim_silence(audio, args.trim_db)
        trimmed_duration = len(audio) / sr
        trimmed = original_duration - trimmed_duration
        if trimmed > 0.01:
            warn(f"Trimmed {trimmed:.2f}s of silence (threshold: {args.trim_db} dB)")

    # Step 3: Peak normalize
    if not args.no_normalize:
        audio = peak_normalize(audio, args.target_db)
        warn(f"Normalized to {args.target_db} dB peak")

    # Step 4: Validate duration
    duration = len(audio) / sr
    if duration < 3.0:
        print(
            f"Error: Audio is only {duration:.2f}s after processing — "
            "minimum 3s required for voice cloning.",
            file=sys.stderr,
        )
        return 1

    # Step 5: Write output
    sf.write(str(output_path), audio, sr, subtype="PCM_16")
    warn(f"Written to {output_path}")

    # Step 6: Quality report
    passed = print_report(audio, sr, str(output_path))
    return 0 if passed else 0  # warn but don't fail on quality issues


if __name__ == "__main__":
    raise SystemExit(main())
