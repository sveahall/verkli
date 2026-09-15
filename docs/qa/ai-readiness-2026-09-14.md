# AI readiness — 14 September 2026

**Decision: the premium AI launch is not yet verified.** The launch plan targets 20 September. The work below is implemented and tested locally on `codex/translation-quality-20260914`; it has not been deployed. No dependency, database schema, customer account, production flag or customer manuscript was changed in this pass.

## Current position

| Area | Evidence | Remaining gap |
| --- | --- | --- |
| Translation generation and review | Local profile → translator → fidelity reviewer + style reviewer → at most one correction → re-review. Existing author UI shows reports and blocked outcomes. Earlier QA covered 1,930 tests plus a real short translation. | Real queue/database/author journey, long chapters, budget calibration, persistence/concurrency and bilingual editorial evaluation. |
| Reviewer evaluation added today | Ten original sv↔en cases, five clean/defective pairs. A real baseline and revised-rubric run each found all five seeded defects with no blocking findings on references. Both runs and actual findings are saved. | Provisional labels, not human-certified translations. One run per rubric on the same tiny corpus; no held-out or statistical quality claim. |
| Author voice protection improved today | Baseline reported four minor findings on acceptable references; revised instructions reported zero while retaining all five defect decisions. Production and evaluation use the same prompts and quote/coverage validators. | Some reviewer overlap and severity inflation remain. A plausible explanation can still include an unsupported inference even with valid verbatim quotes. Human review is necessary. |
| Writing assistant | Existing chapter/selection-aware Anthropic integration and NVIDIA fallback. | No equivalent independent fidelity/voice review of writing suggestions. Review fallback behavior, author control, and use a held-out writing corpus. |
| Audiobooks | Existing ElevenLabs generation, cache/storage, chapter manifests and playback code. | No semantic back-transcription comparison, pronunciation/voice continuity review, silence/clipping analysis or quality-gated selective regeneration. End-to-end production generation remains unverified. |
| Platform release | Prior launch QA fixed public-gate and payment-delivery defects and exercised negative access checks. Samuel's explicitly requested access was separately granted. | A fresh full author/reader journey, worker consumption, authorized payment + actual email delivery and rollback rehearsal. Account admission is not end-to-end platform QA. |

The text code currently selects `claude-sonnet-5`. An OpenAI API account is not evidence that the current text functions use OpenAI. Model comparison remains a measured experiment to run after representative cases and editorial acceptance criteria exist.

## What changed today

- Original source/candidate corpus: negation, missing causal agency, deliberate repetition/fragments, colloquial dialogue and recurring terms. Profiles are shared between each clean/defective pair. Labels and rationale never enter model requests.
- Review-only adapter: invokes the same two production roles on the fixed candidate; no profiling, translation or repair obscures a review miss. Existing translate/revise behavior remains available.
- Versioned JSON reports bind to the exact corpus fingerprint and record attempted model/rubric even on errors. Imported scores are recomputed. Missing, failed, duplicate, mismatched or ungrounded results cannot become a complete pass.
- CLI is offline by default; offline mode validates source, alignment, profile/glossary and balanced pairs. Explicit live mode makes at most 20 provider requests, with existing timeouts and zero retries. Output creation is exclusive; raw provider errors, keys and reasoning are not saved.
- Development workbench shows original/candidate, expected decision, observed findings, quote evidence, latency and usage. A button loads the committed recorded run; file import remains local to the browser. Both QA routes return 404 in the production build.

## Recorded model evidence

| Rubric | Blocking defects found | References with blocking findings | Minor findings on references | Reported input / output tokens |
| --- | ---: | ---: | ---: | ---: |
| `author-voice-v1` | 5/5 | 0/5 | 4 | 28,754 / 7,145 |
| `author-voice-v2` | 5/5 | 0/5 | 0 | 32,944 / 7,351 |

Reports: [baseline](fixtures/translation-review-baseline-2026-09-14.json), [revised rubric](fixtures/translation-review-v2-2026-09-14.json). Run-level baseline model/rubric fields were copied from its recorded per-case metadata when that report field was added; original results and timestamps were preserved. Revisions were informed by the baseline, so this comparison is development evidence, not an independent holdout benchmark. A matching blocking decision does not certify every diagnosis or a full book.

## Next work, in order

1. **Translation release rehearsal.** Run an original multi-chapter test book through real import → edit/save/reload → reviewed translation → reader view using a designated test account and isolated test data. Confirm worker consumption and failed-job recovery. Calibrate reservation/cost for realistic chapter counts; the unchanged 500,000-unit daily default currently blocks modest multi-chapter jobs. No silent production budget increase.
2. **Book-wide author memory and editorial benchmark.** Add author-approved terminology/style choices, corrections carried across chapters, held-out samples and bilingual editorial assessment. Use results to compare models. Decide persistence/schema before changes if needed.
3. **Audio quality vertical slice.** Show an author-facing quality report, generate a short test chapter, back-transcribe and compare to the exact source, check missing/repeated phrases and technical audio failures, then regenerate only failed parts. Pronunciation and listening checks are separate from transcript correctness.
4. **Writing-assistant review.** Ground suggestions in source/author intention, explicitly preserve deliberate style, review proposed changes, and keep final application under author control. Do not silently replace an unavailable model with prose presented as reviewed AI output.
5. **Launch gate.** Complete invited-account, payment/delivery, queue/retry and rollback checks. Ship only the scope demonstrated end to end; no claim that all AI features are premium-ready based on unit tests or this ten-case run.

## Continuation: preparing the book rehearsal

**Later operational fix, 14 September:** production import logs revealed a real Node 20 / Supabase native WebSocket crash. The runtime-only fix (`1293e720` on `platform`, incorporated into this branch as `61c833da`) is deployed for import and audiobook and pushed to Git. All worker Dockerfiles now use Node 22 with a build-time Supabase construction check. The identified stuck import was recovered through the corrected local worker into the production database: completed, 100%, three chapters saved. Import, translation and audiobook workers are now left running on local Redis `6379`. See [the incident record](../railway-deployment.md#14-september-2026--worker-runtime-incident). This does **not** deploy the translation quality pipeline or replace the pending full author/audio QA.

The earlier read-only checks found the configured QA author account has an existing private draft and active author billing, but no beta flag. Its admission remains awaiting explicit confirmation; no account, password or billing was changed. At that point, local Redis at `localhost:6379` had no translation/import/audio workers; the later operational fix above supersedes that local observation.

Fixed a rehearsal isolation defect in `scripts/load-dotenv.ts`: explicit process environment now takes precedence over `.env.local`. Previously a supplied test Redis/database address was silently replaced by the file's defaults. Three regression tests cover explicit overrides, loading missing defaults and deployment without a local file. The first test reproduced the overwrite before the fix.

The real translation worker then started against a temporary Redis at `127.0.0.1:6394`, with dummy provider/database credentials and Sentry disabled. BullMQ reported one translation worker, a fresh heartbeat and zero jobs. Both temporary processes were stopped afterwards. This verifies startup and queue isolation only; generation, database persistence, UI submission and recovery still require the book rehearsal.

Fresh verification after this fix: **185 test files / 1,947 tests passed**, ESLint and the Webpack production build including TypeScript passed. Logs: `/tmp/verkli-ai-continuation-{tests,lint,build}-20260914.log`; worker startup log: `/tmp/verkli-worker-startup-20260914.log`.

Recheck this slice:
1. Run `npm test -w @verkli/web -- scripts/load-dotenv.test.ts` from the worktree root; all three cases must pass without database/provider requests.
2. Open `http://127.0.0.1:3024/dev/translation-evaluation` and load the recorded model run; it remains the short-case review evidence, not a completed book job.
3. Before a book rehearsal, explicitly select a separate local Redis and confirm the worker startup log shows that exact host and port. Check a worker and fresh heartbeat exist before enqueueing.
4. With the designated QA account admitted, test a short original multi-chapter draft through save/reload, queue submission, review and persisted translated edition. Do not label this step passed until executed; do not increase production allowances merely to bypass a budget failure.

## Verification and localhost QA

Final verification: 184 test files / 1,944 tests passed, ESLint passed, Webpack production build passed including TypeScript. Chrome workbench QA passed for keyboard selection, recorded report, evidence, error/unrun states, malformed and mismatched imports, clearing old results, 390px layout and zero page errors. Production runtime returned 404 for both `/dev/translation-evaluation` and `/dev/translation-quality`. Existing translation-panel UI regression also passed.

1. Open http://127.0.0.1:3024/dev/translation-evaluation. Each case initially says **Not run**.
2. Click **Load recorded model run**. Select the altered unopened-letter case; inspect the source negation and the fidelity finding.
3. Select reference and altered repetition/dialogue cases. Compare the actual evidence; a matching decision alone is not certification.
4. Load the baseline JSON above to compare the older minor suggestions, then load malformed JSON. An explicit error must clear previous results.
5. At 390px width and by keyboard, verify all cases and findings remain accessible with no horizontal overflow.
6. Run `node apps/web/scripts/qa-translation-evaluation.cjs` from the worktree root. For an offline corpus check: `npm exec -w @verkli/web -- tsx scripts/evaluate-translation-quality.ts`. A deliberate paid rerun adds `--live --out=/absolute/new-report.json`; use a new path, and run it from the repo root with the workspace command. The web app's existing `.env.local` or process environment supplies the provider key.

Per-file changes are listed in the generated diff index supplied with this delivery. Local test/build logs and screenshots use `/tmp/verkli-ai-evaluation-*`.
