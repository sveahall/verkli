---
name: autoresearch
description: Self-improving prompt optimization via eval-driven loop. Generates variants, tests them, promotes winners.
user_invocable: true
---

# Prompt Optimization Agent

Follow the AGENT_INSTRUCTIONS.md in this skill directory and run the full optimization loop.

## Quick Start

1. Edit `prompts/current.txt` with your baseline prompt
2. Edit `evals/test_cases.jsonl` with your test cases (JSONL, one per line)
3. Edit `evals/assertions.py` with your binary assertion functions
4. Run: `/autoresearch`

The agent will autonomously iterate until pass rate > 85% or 15 cycles complete.

## Directory Structure

```
scripts/autoresearch/
  AGENT_INSTRUCTIONS.md    — Full agent loop specification
  prompts/
    current.txt            — Active best prompt
    candidates/            — Generated variants per cycle
    history/               — Archived versions with scores
  evals/
    runner.py              — Eval runner (calls Claude API)
    assertions.py          — Binary assertion functions
    test_cases.jsonl       — Test cases
  results/
    scores.json            — Score history across cycles
    latest_run.json        — Detailed results from last eval
    failure_analysis.txt   — Agent's failure pattern analysis
```

## To install as a Claude Code skill

```bash
cp -r scripts/autoresearch .claude/skills/autoresearch
```
