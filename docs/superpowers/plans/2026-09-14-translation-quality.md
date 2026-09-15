# Translation quality: first implementation

> Execution: subagent-driven-development. The user approved the specialist review workflow after the architecture audit. No dependency, schema or production configuration changes.

**Goal:** Generate translations with source-grounded fidelity and author-voice checks, one bounded correction round, and an honest, inspectable result in the author UI.

**Architecture:** Existing Anthropic SDK supplies separate profile, translator, fidelity reviewer, style reviewer and targeted reviser calls. Deterministic segment checks run before any review. The worker derives one profile from representative source passages per job, keeps document structure, records reports in the existing `ai_jobs.input/output` JSON columns, and blocks completion when substantive issues remain. A manually requested sample review uses the same engine. Both reviewers use the same model initially; this is not independent-model validation or a human quality certification.

**Tech stack:** Next.js, TypeScript, React, Zod, Anthropic SDK, Supabase and Vitest already installed.

## Task 1 — Quality engine and provider routing
- [x] Add failing tests for the real Swedish provider registry and empty/misaligned segments.
- [x] Add `src/lib/ai/translation-quality/{types,pipeline,anthropic}.ts` and focused tests.
- [x] Define a source-based author profile and anchored fidelity/style issues. Protect intentional repetition, rhythm, dialogue, unusual syntax and proper names; do not use an AI-text detector.
- [x] Translate, run two independent review calls, revise once only if needed, re-run both reviews. Missing/malformed/truncated reviews fail closed. Validate source and target quotes and every reviewed segment.
- [x] Bound input/output, calls, timeout and retry count. Record model, rubric, usage and revision count. Never log manuscript text.
- [x] Repair Anthropic registry selection and strict response validation.

## Task 2 — Author UI and sample endpoint
- [x] Add owner-authorized, rate-limited POST `api/books/[id]/translation-quality` using actual stored source text and the same engine. Read reports through owner-authorized GET.
- [x] Add `TranslationQualityCard.tsx` to `TranslatePanel.tsx`: explicit review button, optional voice guidance, loading/error/empty/needs-review states, profile, findings and resulting sample. Changing target or source invalidates the sample.
- [x] Explain that sample checks are not a whole-book review. Show persistent full-job reports separately.
- [x] Test unauthorized access, missing source, rate limit, malformed input, source ownership and provider failure.

## Task 3 — Worker gate and reports
- [x] Use shared strict validation; never replace an empty translation with the source and mark success.
- [x] Derive a profile from bounded beginning/middle/end source samples, then use it throughout the job.
- [x] Persist version-bound review provenance and findings in `ai_jobs`, including failed checks. Check DB writes. Smoke outputs remain explicitly unreviewed.
- [x] Block `done` on unresolved major/critical issues or unavailable review; bound retries so semantic failures do not restart a paid book indefinitely. Account for review overhead in job budget.
- [x] Preserve existing text-node structure and expose worker errors in translation status.

## Task 4 — Verification and handoff
- [x] Spec review, then code-quality review; fix concrete issues found.
- [x] Run targeted tests, app lint, typecheck and production build. Report baseline failures distinctly.
- [x] Inspect the real UI on localhost, including loading, findings, unavailable and mobile layouts.
- [x] Add a 3–7 step QA script and precise limitations. Provide diffs per changed file. Do not claim production rollout or literary-quality certification from mocked tests.

## Deferred deliberately
OpenAI migration/model comparison, durable author-editable book-wide terminology management, human-calibrated bilingual benchmark, cross-chapter semantic consistency beyond the shared profile, audiobook transcript/audio QC, and writing-assistant review. These remain required work before a premium-quality launch claim.

## Delivered / operational follow-up

Implementation and local QA are documented in [the QA report](../../qa/translation-quality-2026-09-14.md). The working branch is `codex/translation-quality-20260914`; no production rollout was performed. End-to-end staging with a real queue/database and bilingual human evaluation remain launch requirements. The conservative reservation blocks longer book jobs under the unchanged default daily allowance; calibrate capacity and cost before rollout.
