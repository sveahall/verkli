# Prompt Optimization Agent

## Goal
Improve the pass rate of `prompts/current.txt` using an eval-driven loop.
Current history is in `results/scores.json`.

## Each Cycle
1. Read `results/latest_run.json` — understand which test cases are failing and why
2. Write a brief failure analysis to `results/failure_analysis.txt`:
   - Which assertion fails most often?
   - What do failing inputs have in common?
   - What specific change would address the top failure pattern?
3. Generate exactly 3 prompt variants in `prompts/candidates/`
   named v[N]a.txt, v[N]b.txt, v[N]c.txt
4. For each variant, run: `python evals/runner.py prompts/candidates/[variant]`
5. Record all three scores in `results/scores.json`
6. If any variant beats the current best, copy it to `prompts/current.txt`
7. Archive the previous version to `prompts/history/` with its score in the filename
8. Proceed to the next cycle

## Constraints
- Change ONE thing per variant. Add a comment at the top stating the hypothesis.
- If pass rate doesn't improve after 3 consecutive cycles, try a structural change
  (not just wording tweaks)
- Stop when pass rate exceeds 85% or after 15 cycles
