#!/usr/bin/env python3
"""
Generate the same test text with multiple TTS parameter combinations
for A/B comparison. Invokes qwen_tts_synthesize.py via subprocess
(same path as production).
"""

import argparse
import json
import sys
import time
from pathlib import Path
from itertools import product
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
SYNTH_SCRIPT = SCRIPT_DIR / "qwen_tts_synthesize.py"

# Find python in the venv (venvs live at repo root, two levels up from scripts/)
_REPO_ROOT = SCRIPT_DIR.parent.parent.parent
VENV_PYTHON_CANDIDATES = [
    _REPO_ROOT / "qwen3tts-env311c" / "bin" / "python3",
    _REPO_ROOT / "qwen3tts-env" / "bin" / "python3.12",
    _REPO_ROOT / "qwen3tts-env311" / "bin" / "python3",
]

DEFAULT_TEXT = (
    "Hej, detta är ett test av röstkloning. "
    "Varje mening bör låta naturlig och tydlig, "
    "med rätt betoning och intonation."
)

DEFAULT_SPEAKERS = ["Ryan"]
DEFAULT_MAX_TOKENS = [512, 1024, 2048]
DEFAULT_XVECTOR_MODES = [0, 1]


def find_python() -> str:
    """Find the venv python to use."""
    for candidate in VENV_PYTHON_CANDIDATES:
        if candidate.exists():
            return str(candidate)
    # Fall back to system python
    return sys.executable


def run_synthesis(
    python: str,
    text: str,
    output_path: str,
    speaker: str,
    max_new_tokens: int,
    xvector_only: int,
    ref_audio: str | None = None,
    ref_text: str | None = None,
    instruct: str | None = None,
    language: str = "auto",
) -> dict[str, Any] | None:
    """Run the synthesis script and return its JSON output, or None on failure."""
    import subprocess

    cmd = [
        python, str(SYNTH_SCRIPT),
        "--output", output_path,
        "--speaker", speaker,
        "--max-new-tokens", str(max_new_tokens),
        "--xvector-only", str(xvector_only),
        "--language", language,
    ]
    if ref_audio:
        cmd.extend(["--ref-audio", ref_audio])
    if ref_text:
        cmd.extend(["--ref-text", ref_text])
    if instruct:
        cmd.extend(["--instruct", instruct])

    try:
        result = subprocess.run(
            cmd,
            input=text,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.TimeoutExpired:
        print(f"  TIMEOUT after 600s", file=sys.stderr)
        return None

    if result.returncode != 0:
        print(f"  FAILED (exit {result.returncode})", file=sys.stderr)
        if result.stderr:
            # Show last few lines of stderr for diagnostics
            lines = result.stderr.strip().split("\n")
            for line in lines[-5:]:
                print(f"    {line}", file=sys.stderr)
        return None

    # Parse JSON from stdout (synthesis script prints one JSON line)
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

    print("  WARNING: No JSON output found", file=sys.stderr)
    return None


def build_combinations(
    speakers: list[str],
    max_tokens_list: list[int],
    xvector_modes: list[int],
    instructs: list[str | None],
    has_ref_audio: bool,
) -> list[dict[str, Any]]:
    """Build the parameter sweep matrix."""
    combos = []

    for speaker, tokens, xvec, instruct in product(
        speakers, max_tokens_list, xvector_modes, instructs,
    ):
        label_parts = [speaker, f"xvec{xvec}", f"tok{tokens}"]
        if instruct:
            # Sanitize instruct for filename
            tag = instruct[:20].replace(" ", "_").replace("/", "-")
            label_parts.append(tag)
        if has_ref_audio:
            label_parts.append("clone")

        combos.append({
            "speaker": speaker,
            "max_new_tokens": tokens,
            "xvector_only": xvec,
            "instruct": instruct,
            "label": "_".join(label_parts),
        })

    return combos


def write_results_md(
    output_dir: Path,
    results: list[dict[str, Any]],
    text: str,
    ref_audio: str | None,
) -> None:
    """Write a markdown summary table."""
    md_path = output_dir / "results.md"
    lines = [
        "# TTS Quality Sweep Results\n",
        f"**Text:** {text[:100]}{'...' if len(text) > 100 else ''}\n",
        f"**Reference audio:** {ref_audio or 'none'}\n",
        "",
        "| # | File | Speaker | XVec | Tokens | Instruct | Wall (s) | Audio (s) | RTF | Method |",
        "|---|------|---------|------|--------|----------|----------|-----------|-----|--------|",
    ]

    for i, r in enumerate(results, 1):
        params = r["params"]
        metrics = r.get("metrics", {})
        status = r.get("status", "fail")

        if status == "ok":
            wall = metrics.get("wallClockSec", "?")
            audio = metrics.get("audioSec", "?")
            rtf = metrics.get("generationRtf") or metrics.get("rtf", "?")
            method = r.get("method", "?")
            if isinstance(wall, (int, float)):
                wall = f"{wall:.1f}"
            if isinstance(audio, (int, float)):
                audio = f"{audio:.1f}"
            if isinstance(rtf, (int, float)):
                rtf = f"{rtf:.2f}"
        else:
            wall = audio = rtf = method = "FAIL"

        instruct_col = params.get("instruct") or "-"
        if len(instruct_col) > 30:
            instruct_col = instruct_col[:27] + "..."

        lines.append(
            f"| {i} | {r['filename']} | {params['speaker']} | "
            f"{params['xvector_only']} | {params['max_new_tokens']} | "
            f"{instruct_col} | {wall} | {audio} | {rtf} | {method} |"
        )

    lines.append("")
    lines.append(f"Generated {len(results)} combinations.")
    lines.append("")

    md_path.write_text("\n".join(lines))
    print(f"\nResults written to {md_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sweep TTS parameters to find optimal voice settings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --text "Hej, detta är ett test." -o sweep_results/
  %(prog)s --text-file test.txt --ref-audio prepared.wav -o sweep_results/
  %(prog)s --text "Hej!" --ref-audio ref.wav --ref-text "Hello world" -o out/
  %(prog)s --text "Test" --speakers Ryan,Aria --tokens 512,2048 -o out/
""",
    )
    text_group = parser.add_mutually_exclusive_group()
    text_group.add_argument("--text", help="Text to synthesize")
    text_group.add_argument("--text-file", help="File containing text to synthesize")

    parser.add_argument("-o", "--output-dir", required=True, help="Output directory for WAV files")
    parser.add_argument("--ref-audio", help="Reference audio for voice cloning")
    parser.add_argument("--ref-text", help="Transcript of reference audio")
    parser.add_argument("--language", default="auto", help="Language code (default: auto)")

    parser.add_argument(
        "--speakers", default=",".join(DEFAULT_SPEAKERS),
        help=f"Comma-separated speaker names (default: {','.join(DEFAULT_SPEAKERS)})",
    )
    parser.add_argument(
        "--tokens", default=",".join(str(t) for t in DEFAULT_MAX_TOKENS),
        help=f"Comma-separated max_new_tokens values (default: {','.join(str(t) for t in DEFAULT_MAX_TOKENS)})",
    )
    parser.add_argument(
        "--xvector-modes", default=",".join(str(x) for x in DEFAULT_XVECTOR_MODES),
        help=f"Comma-separated xvector_only values (default: {','.join(str(x) for x in DEFAULT_XVECTOR_MODES)})",
    )
    parser.add_argument(
        "--instructs",
        help="Comma-separated voice instructions to try (optional)",
    )

    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # Resolve text
    if args.text_file:
        text_path = Path(args.text_file).expanduser().resolve()
        if not text_path.exists():
            print(f"Error: Text file not found: {text_path}", file=sys.stderr)
            return 1
        text = text_path.read_text().strip()
    elif args.text:
        text = args.text.strip()
    else:
        text = DEFAULT_TEXT

    if not text:
        print("Error: No text to synthesize", file=sys.stderr)
        return 1

    # Resolve ref audio
    ref_audio = None
    if args.ref_audio:
        ref_path = Path(args.ref_audio).expanduser().resolve()
        if not ref_path.exists():
            print(f"Error: Reference audio not found: {ref_path}", file=sys.stderr)
            return 1
        ref_audio = str(ref_path)

    # Parse parameter lists
    speakers = [s.strip() for s in args.speakers.split(",") if s.strip()]
    tokens = [int(t.strip()) for t in args.tokens.split(",") if t.strip()]
    xvector_modes = [int(x.strip()) for x in args.xvector_modes.split(",") if x.strip()]
    instructs: list[str | None] = [None]
    if args.instructs:
        instructs = [i.strip() for i in args.instructs.split(",") if i.strip()]

    # Build combinations
    combos = build_combinations(
        speakers=speakers,
        max_tokens_list=tokens,
        xvector_modes=xvector_modes,
        instructs=instructs,
        has_ref_audio=bool(ref_audio),
    )

    if not combos:
        print("Error: No parameter combinations generated", file=sys.stderr)
        return 1

    # Setup output
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    python = find_python()
    print(f"Python: {python}")
    print(f"Synth script: {SYNTH_SCRIPT}")
    print(f"Text: {text[:80]}{'...' if len(text) > 80 else ''}")
    print(f"Reference audio: {ref_audio or 'none'}")
    print(f"Output: {output_dir}")
    print(f"Combinations: {len(combos)}")
    print("=" * 60)

    results: list[dict[str, Any]] = []
    total_start = time.monotonic()

    for i, combo in enumerate(combos, 1):
        filename = f"{combo['label']}.wav"
        output_path = output_dir / filename

        print(f"\n[{i}/{len(combos)}] {combo['label']}")
        print(f"  speaker={combo['speaker']} xvector_only={combo['xvector_only']} "
              f"max_tokens={combo['max_new_tokens']}"
              f"{' instruct=' + repr(combo['instruct']) if combo['instruct'] else ''}")

        t0 = time.monotonic()
        result_json = run_synthesis(
            python=python,
            text=text,
            output_path=str(output_path),
            speaker=combo["speaker"],
            max_new_tokens=combo["max_new_tokens"],
            xvector_only=combo["xvector_only"],
            ref_audio=ref_audio,
            ref_text=args.ref_text,
            instruct=combo.get("instruct"),
            language=args.language,
        )
        elapsed = time.monotonic() - t0

        entry: dict[str, Any] = {
            "filename": filename,
            "params": combo,
        }

        if result_json:
            entry["status"] = "ok"
            entry["metrics"] = result_json.get("metrics", {})
            entry["method"] = result_json.get("method", "unknown")
            audio_sec = entry["metrics"].get("audioSec", 0)
            print(f"  OK — {elapsed:.1f}s wall, {audio_sec:.1f}s audio, "
                  f"method={entry['method']}")
        else:
            entry["status"] = "fail"
            entry["metrics"] = {}
            print(f"  FAILED after {elapsed:.1f}s")

        results.append(entry)

    total_elapsed = time.monotonic() - total_start

    # Summary
    ok_count = sum(1 for r in results if r["status"] == "ok")
    fail_count = len(results) - ok_count

    print("\n" + "=" * 60)
    print(f"  Sweep complete: {ok_count} OK, {fail_count} failed, {total_elapsed:.1f}s total")
    print("=" * 60)

    if ok_count > 0:
        print("\nResults by generation speed:")
        ok_results = [r for r in results if r["status"] == "ok"]
        ok_results.sort(key=lambda r: r["metrics"].get("generationRtf") or r["metrics"].get("rtf") or 999)
        for r in ok_results:
            m = r["metrics"]
            rtf = m.get("generationRtf") or m.get("rtf", "?")
            if isinstance(rtf, (int, float)):
                rtf = f"{rtf:.2f}"
            print(f"  {r['filename']:40s}  RTF={rtf}  audio={m.get('audioSec', '?')}s")

    # Write results markdown
    write_results_md(output_dir, results, text, ref_audio)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
