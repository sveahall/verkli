#!/usr/bin/env python3
"""
Eval runner — tests a prompt against test cases using binary assertions.

Usage:
    python evals/runner.py prompts/current.txt
    python evals/runner.py prompts/candidates/v1a.txt
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


def load_test_cases() -> list[dict]:
    cases = []
    with open(TEST_CASES_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))
    return cases


def call_llm(system_prompt: str, user_input: str) -> str:
    """Call Claude API with the system prompt and user input."""
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
        print("Usage: python evals/runner.py <prompt_file>")
        sys.exit(1)

    prompt_path = Path(sys.argv[1])
    if not prompt_path.exists():
        print(f"ERROR: {prompt_path} not found")
        sys.exit(1)

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
