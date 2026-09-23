#!/usr/bin/env python3
"""
Eval runner — tests a prompt against test cases using binary assertions.

Backends (set via EVAL_BACKEND env var):
  nvidia:     NVIDIA NIM API (default) — uses NVIDIA_API_KEY from .env
  anthropic:  Anthropic API — uses ANTHROPIC_API_KEY
  openai:     Any OpenAI-compatible API — uses OPENAI_API_KEY + OPENAI_BASE_URL
  local:      --responses responses.json (pre-generated, no API needed)

Usage:
  python evals/runner.py prompts/current.txt                         # nvidia (default)
  EVAL_BACKEND=anthropic python evals/runner.py prompts/current.txt  # anthropic
  python evals/runner.py prompts/current.txt --responses resp.json   # local
"""

import json
import os
import sys
import time
from pathlib import Path

# Add parent dir so we can import assertions
sys.path.insert(0, str(Path(__file__).parent))
from assertions import ASSERTIONS

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
TEST_CASES_PATH = SCRIPT_DIR / "test_cases.jsonl"
RESULTS_PATH = PROJECT_DIR / "results" / "latest_run.json"

# Load .env from project dir
_env_path = PROJECT_DIR / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _val = _line.partition("=")
                os.environ.setdefault(_key.strip(), _val.strip())


def load_test_cases() -> list[dict]:
    cases = []
    with open(TEST_CASES_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))
    return cases


def call_llm(system_prompt: str, user_input: str) -> str:
    """Call LLM with the system prompt and user input. Backend chosen by EVAL_BACKEND env var."""
    backend = os.environ.get("EVAL_BACKEND", "nvidia")

    if backend == "nvidia":
        return _call_nvidia(system_prompt, user_input)
    elif backend == "openai":
        return _call_openai(system_prompt, user_input)
    else:
        return _call_anthropic(system_prompt, user_input)


def _call_nvidia(system_prompt: str, user_input: str) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        print("ERROR: pip install openai")
        sys.exit(1)

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        print("ERROR: Set NVIDIA_API_KEY in scripts/autoresearch/.env")
        sys.exit(1)

    client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=api_key,
    )
    # Gemma 2 doesn't support system role on NIM — prepend to user message
    combined = f"[INSTRUCTIONS]\n{system_prompt}\n[/INSTRUCTIONS]\n\n{user_input}"
    response = client.chat.completions.create(
        model=os.environ.get("EVAL_MODEL", "google/gemma-2-27b-it"),
        max_tokens=1024,
        messages=[
            {"role": "user", "content": combined},
        ],
    )
    return response.choices[0].message.content


def _call_anthropic(system_prompt: str, user_input: str) -> str:
    try:
        import anthropic
    except ImportError:
        print("ERROR: pip install anthropic")
        sys.exit(1)

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=os.environ.get("EVAL_MODEL", "claude-haiku-4-5-20251001"),
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_input}],
    )
    return response.content[0].text


def _call_openai(system_prompt: str, user_input: str) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        print("ERROR: pip install openai")
        sys.exit(1)

    kwargs = {}
    base_url = os.environ.get("OPENAI_BASE_URL")
    if base_url:
        kwargs["base_url"] = base_url

    api_key = os.environ.get("OPENAI_API_KEY", "not-needed")
    kwargs["api_key"] = api_key

    client = OpenAI(**kwargs)
    response = client.chat.completions.create(
        model=os.environ.get("EVAL_MODEL", "gpt-4o-mini"),
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ],
    )
    return response.choices[0].message.content


def run_assertions(response: str, test_case: dict) -> list[dict]:
    results = []
    for assertion_fn in ASSERTIONS:
        name = assertion_fn.__name__
        try:
            passed = assertion_fn(response, test_case)
            results.append({"name": name, "passed": bool(passed), "error": None})
        except Exception as e:
            results.append({"name": name, "passed": False, "error": str(e)})
    return results


def main():
    if len(sys.argv) < 2:
        print("Usage: python evals/runner.py <prompt_file> [--responses <file>]")
        sys.exit(1)

    prompt_path = Path(sys.argv[1])
    if not prompt_path.exists():
        print(f"ERROR: {prompt_path} not found")
        sys.exit(1)

    # Check for local responses mode
    responses_map = None
    if "--responses" in sys.argv:
        idx = sys.argv.index("--responses")
        if idx + 1 < len(sys.argv):
            resp_path = Path(sys.argv[idx + 1])
            if not resp_path.exists():
                print(f"ERROR: responses file {resp_path} not found")
                sys.exit(1)
            with open(resp_path) as f:
                responses_map = json.load(f)
            print(f"[LOCAL MODE] Using pre-generated responses from {resp_path.name}")

    system_prompt = prompt_path.read_text().strip()
    test_cases = load_test_cases()

    if not test_cases:
        print("ERROR: No test cases in evals/test_cases.jsonl")
        sys.exit(1)

    print(f"Running {len(test_cases)} test cases against {prompt_path.name}...")

    results = []
    total_pass = 0
    total_assertions = 0

    for tc in test_cases:
        tc_id = tc.get("id", "unknown")
        user_input = tc.get("input", "")

        # Get response: from file or API
        if responses_map is not None:
            response = responses_map.get(tc_id)
            if response is None:
                results.append({
                    "id": tc_id,
                    "input": user_input,
                    "response": None,
                    "error": f"No response found for {tc_id} in responses file",
                    "assertions": [],
                    "passed": False,
                })
                continue
        else:
            try:
                response = call_llm(system_prompt, user_input)
            except Exception as e:
                results.append({
                    "id": tc_id,
                    "input": user_input,
                    "response": None,
                    "error": str(e),
                    "assertions": [],
                    "passed": False,
                })
                continue

        assertion_results = run_assertions(response, tc)
        all_passed = all(a["passed"] for a in assertion_results)
        pass_count = sum(1 for a in assertion_results if a["passed"])
        total_pass += pass_count
        total_assertions += len(assertion_results)

        results.append({
            "id": tc_id,
            "input": user_input[:200],
            "response": response[:500],
            "assertions": assertion_results,
            "passed": all_passed,
        })

        status = "PASS" if all_passed else "FAIL"
        failed = [a["name"] for a in assertion_results if not a["passed"]]
        detail = f" (failed: {', '.join(failed)})" if failed else ""
        print(f"  [{status}] {tc_id}{detail}")

    # Calculate pass rate
    cases_passed = sum(1 for r in results if r["passed"])
    pass_rate = (cases_passed / len(results) * 100) if results else 0

    # Write results
    run_data = {
        "prompt_file": str(prompt_path),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total_cases": len(results),
        "cases_passed": cases_passed,
        "pass_rate": round(pass_rate, 1),
        "assertion_pass_rate": round(
            (total_pass / total_assertions * 100) if total_assertions else 0, 1
        ),
        "results": results,
    }

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_PATH, "w") as f:
        json.dump(run_data, f, indent=2)

    print(f"\nPass rate: {pass_rate:.1f}% ({cases_passed}/{len(results)})")
    print(f"Results written to {RESULTS_PATH}")

    return pass_rate


if __name__ == "__main__":
    rate = main()
    sys.exit(0 if rate >= 85 else 1)
