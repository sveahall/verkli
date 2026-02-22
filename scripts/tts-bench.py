#!/usr/bin/env python3
"""
Small benchmark CLI for the local Qwen3 TTS pipeline.

Runs short/medium/long synthesis cases through qwen_tts_synthesize.py and prints:
- wall-clock seconds
- generated audio seconds
- RTF (wall / audio)
- chars per second
- GPU peak memory (if reported by synthesizer)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List


DEFAULT_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"

CASE_TEXTS = {
    "short": (
        "Hej! Detta ar ett kort test for att mata snabbhet och realtidsfaktor i var Qwen3 TTS-kedja."
    ),
    "medium": (
        "Detta ar ett medellangt benchmark-avsnitt. "
        "Syftet ar att mata hur snabbt systemet producerar ljud nar texten ar langre an ett vanligt kort meddelande. "
        "Vi vill se stabil throughput, lag latens per chunk och en tydlig realtidsfaktor utan horbar kvalitetsforlust."
    ),
    "long": (
        "Detta ar ett langt benchmark-avsnitt for att stressa hela pipelinen under mer realistisk belastning. "
        "Vi skickar flera meningar i foljd for att skapa ett tillrackligt langt ljudsegment och observera hur modellen beter sig over tid. "
        "Malet ar att halla GPU:n varm, undvika onodiga kopior mellan CPU och GPU och samtidigt behalla samma upplevda ljudkvalitet som tidigare. "
        "Benchmark-resultatet ska ge tydliga nyckeltal, inklusive total wall clock, producerad ljudlangd, realtidsfaktor och eventuellt GPU-minne."
    ),
}


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    default_python = os.environ.get("QWEN_TTS_PYTHON") or str(
        repo_root / "qwen3tts-env" / "bin" / "python3.12"
    )
    default_script = os.environ.get("QWEN_TTS_SCRIPT") or str(
        repo_root / "apps" / "web" / "scripts" / "qwen_tts_synthesize.py"
    )
    default_model = (
        os.environ.get("QWEN_TTS_MODEL")
        or os.environ.get("AI_NARRATOR_MODEL")
        or DEFAULT_MODEL_ID
    )
    default_voice = os.environ.get("QWEN_TTS_VOICE_ID") or "Ryan"

    parser = argparse.ArgumentParser(description="Benchmark Qwen3 TTS pipeline")
    parser.add_argument("--python", default=default_python, help="Python executable for Qwen env")
    parser.add_argument("--script", default=default_script, help="Path to qwen_tts_synthesize.py")
    parser.add_argument("--model-id", default=default_model, help="Model id/path")
    parser.add_argument("--language", default="auto", help="Language")
    parser.add_argument("--speaker", default=default_voice, help="Speaker id for custom voice models")
    parser.add_argument("--max-chars", type=int, default=int(os.environ.get("TTS_MAX_CHARS", "350")))
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=int(os.environ.get("QWEN_TTS_MAX_NEW_TOKENS", "2048")),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=int(os.environ.get("QWEN_TTS_BATCH_SIZE", os.environ.get("TTS_BATCH_SIZE", "1"))),
    )
    parser.add_argument(
        "--cases",
        default="short,medium,long",
        help="Comma-separated subset: short,medium,long",
    )
    parser.add_argument("--runs", type=int, default=1, help="Runs per case")
    return parser.parse_args()


def parse_json_line(stdout: str) -> Dict[str, Any]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        if not line.startswith("{"):
            continue
        try:
            parsed = json.loads(line)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue
    raise RuntimeError("No valid JSON metadata found in synthesizer stdout.")


def wav_duration_seconds(path: Path) -> float:
    # Minimal WAV duration parser (supports PCM headers used in this pipeline).
    data = path.read_bytes()
    if len(data) < 44:
        return 0.0
    byte_rate = int.from_bytes(data[28:32], "little", signed=False)
    if byte_rate <= 0:
        return 0.0
    payload = max(0, len(data) - 44)
    return float(payload) / float(byte_rate)


def run_case(
    *,
    name: str,
    text: str,
    args: argparse.Namespace,
    run_idx: int,
) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f"tts-bench-{name}-") as tmp:
        out_wav = Path(tmp) / f"{name}-{run_idx}.wav"
        cmd = [
            args.python,
            args.script,
            "--output",
            str(out_wav),
            "--model-id",
            args.model_id,
            "--language",
            args.language,
            "--speaker",
            args.speaker,
            "--max-chars",
            str(args.max_chars),
            "--batch-size",
            str(args.batch_size),
            "--max-new-tokens",
            str(args.max_new_tokens),
            "--xvector-only",
            "1",
            "--clone-non-streaming-mode",
            "0",
        ]

        t0 = time.monotonic()
        proc = subprocess.run(
            cmd,
            input=text,
            text=True,
            capture_output=True,
            check=False,
        )
        wall = time.monotonic() - t0

        if proc.returncode != 0:
            stderr_tail = proc.stderr[-1000:]
            raise RuntimeError(
                f"Case {name} failed (exit={proc.returncode}):\n{stderr_tail}"
            )

        meta = parse_json_line(proc.stdout)
        metrics = meta.get("metrics") if isinstance(meta.get("metrics"), dict) else {}
        audio_sec = metrics.get("audioSec") if isinstance(metrics.get("audioSec"), (int, float)) else None
        if not isinstance(audio_sec, (int, float)) or audio_sec <= 0:
            audio_path = Path(meta.get("outputPath") or out_wav)
            audio_sec = wav_duration_seconds(audio_path)

        audio_sec = float(audio_sec) if audio_sec else 0.0
        rtf = (wall / audio_sec) if audio_sec > 0 else None
        chars = len(text)
        chars_per_sec = (chars / wall) if wall > 0 else None

        return {
            "case": name,
            "run": run_idx,
            "chars": chars,
            "wallSec": wall,
            "audioSec": audio_sec,
            "rtf": rtf,
            "charsPerSec": chars_per_sec,
            "device": meta.get("device"),
            "dtype": meta.get("dtype"),
            "batchSize": meta.get("batchSize"),
            "gpuPeakMemoryMiB": metrics.get("gpuPeakMemoryMiB"),
            "generationRtf": metrics.get("generationRtf"),
            "synthesisSec": metrics.get("synthesisSec"),
            "torchCompile": meta.get("torchCompile"),
            "int8": meta.get("int8"),
        }


def fnum(value: Any, digits: int = 2) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.{digits}f}"
    return "-"


def main() -> int:
    args = parse_args()
    cases = [c.strip().lower() for c in args.cases.split(",") if c.strip()]
    unknown = [c for c in cases if c not in CASE_TEXTS]
    if unknown:
        raise SystemExit(f"Unknown case(s): {', '.join(unknown)}")

    script_path = Path(args.script)
    if not script_path.exists():
        raise SystemExit(f"Synth script not found: {script_path}")

    print(
        "[tts-bench] config:",
        json.dumps(
            {
                "python": args.python,
                "script": str(script_path),
                "modelId": args.model_id,
                "language": args.language,
                "speaker": args.speaker,
                "maxChars": args.max_chars,
                "batchSize": args.batch_size,
                "maxNewTokens": args.max_new_tokens,
                "runs": args.runs,
                "cases": cases,
            }
        ),
    )

    results: List[Dict[str, Any]] = []
    for case_name in cases:
        text = CASE_TEXTS[case_name]
        for run_idx in range(1, max(1, args.runs) + 1):
            result = run_case(name=case_name, text=text, args=args, run_idx=run_idx)
            results.append(result)
            print(
                "[tts-bench] case={case} run={run} chars={chars} wall={wall}s audio={audio}s "
                "rtf={rtf} chars/s={cps} gpuPeakMiB={gpu} device={device} dtype={dtype} "
                "batch={batch} compile={compile} int8={int8}".format(
                    case=result["case"],
                    run=result["run"],
                    chars=result["chars"],
                    wall=fnum(result["wallSec"], 2),
                    audio=fnum(result["audioSec"], 2),
                    rtf=fnum(result["rtf"], 3),
                    cps=fnum(result["charsPerSec"], 1),
                    gpu=fnum(result.get("gpuPeakMemoryMiB"), 0),
                    device=result.get("device") or "-",
                    dtype=result.get("dtype") or "-",
                    batch=result.get("batchSize") or "-",
                    compile=result.get("torchCompile"),
                    int8=result.get("int8"),
                )
            )

    if not results:
        print("[tts-bench] no results")
        return 1

    avg_wall = sum(r["wallSec"] for r in results) / len(results)
    avg_audio = sum(r["audioSec"] for r in results) / len(results)
    avg_rtf = (sum((r["rtf"] or 0.0) for r in results) / len(results)) if results else None
    avg_cps = (sum((r["charsPerSec"] or 0.0) for r in results) / len(results)) if results else None

    print(
        "[tts-bench] summary:",
        json.dumps(
            {
                "runs": len(results),
                "avgWallSec": round(avg_wall, 4),
                "avgAudioSec": round(avg_audio, 4),
                "avgRtf": round(avg_rtf, 4) if avg_rtf is not None else None,
                "avgCharsPerSec": round(avg_cps, 2) if avg_cps is not None else None,
            }
        ),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

