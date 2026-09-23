# AI-01 next package and AI-02 integration handoff

14 September 2026. Read-only source investigation; only this handoff was written. No tests, provider requests, worker jobs, database actions, dependency installation, commits, push or deployment were performed.

## Recommendation

Integrate **AI-01 as two files after R0**: the two-line provider-factory fix and its hermetic regression test. Use a fresh isolated `codex/ai01-provider-parity-20260914` worktree based on R0's verified candidate SHA, which the release owner must supply. Do not cherry-pick the AI checkout's HEAD or copy its entire dirty tree. R0 separately owns the four QA commits.

Keep **AI-02's replacement-capable integration blocked by the P0 target-overwrite race** until target-edit/concurrent-job protection and persistence failure handling meet the launch contract. The current hash checks detect some stale results but do not preserve a target edit made while translation is running. They are not atomic publication. This does not block the independent R0 release or the bounded AI-01 factory fix.

Current handoff status: **AI-01 package definition complete; not integrated. R0 verified locally, not committed/pushed/deployed.** Its frozen tree `20d73d3665021c84fe88f8946f1c2a57ab65a043` has lint/TypeScript/normal Turbopack build, **176 files / 1,840 unit tests**, **10/10 unchanged launch E2E without skips/retries**, and **3/3 JavaScript-disabled page checks** passing. Last verified live baseline remains `26d02239`. Use R0's eventual verified commit rather than starting from the dirty root or assuming the base HEAD includes staged work. The integration owner plans to carry these four planning documents into that branch; this reviewer has not copied or committed them. [R0 review](/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/docs/qa/2026-09-14-r0-review.md), [R0 verification](/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/docs/qa/2026-09-14-r0-verification.md), and [Q0 preparation](2026-09-14-q0-test-preparation.md) carry the evidence and remaining environment/account/inbox prerequisites. External Claude/Cursor/Grok reviews have not started.

## Inspected state and sources

| Checkout | Observed HEAD / state | Consequence |
| --- | --- | --- |
| `/Users/admin/verkli-web` | `e49d3c40f3564b4a567d0218be051dded8a183bf`, extensive tracked and untracked work | Read-only; not an integration base. |
| `/Users/admin/verkli-web/.claude/worktrees/translation-quality-20260914` | `61c833da52948c253d5dc405832107152b222470`, eight modified tracked files plus untracked quality implementation/tests/docs | Source for selected hunks. No isolated AI commit currently exists. |
| `/Users/admin/verkli-web/.claude/worktrees/launch-command-20260914` | `26d02239cf57cac050ada410e197692878145270`; launch plan/task pack already added before this task | Only the new handoff file is this task's write. |
| Last verified production baseline, per launch plan | `26d02239cf57cac050ada410e197692878145270` | Used for source comparison; live deployment was not rechecked. |

Read `docs/plans/2026-09-14-launch-task-pack.md` in the launch checkout for ownership, AI-01→AI-02→AI-03 dependencies and the explicit source/target/concurrency acceptance criteria. Read the AI checkout's `docs/qa/ai-readiness-2026-09-14.md` and `docs/qa/translation-quality-2026-09-14.md` for prior local evidence and admitted limitations. Their reported tests and provider runs are historical evidence, not new results on R0 or an integrated candidate.

Key source files found and why (paths below are relative to the AI checkout):

- `apps/web/src/lib/translation-pairs.ts:89–107`: shared routing selects Anthropic for sv→en when Opus is not explicitly enabled; Riva retains en→fr.
- `apps/web/src/lib/ai/providers/server.ts:27–57`: missing baseline Anthropic mapping; complete fix is already present locally.
- `apps/web/src/app/api/books/[id]/translation-preview/route.ts:106–137`: a supported pair reaches the factory, but a null factory result is returned as `pairUnsupported: true`.
- Baseline `26d02239:apps/web/scripts/translation-worker.ts:137–143`: queued translation already calls `anthropicTranslator.translateBatch` for Anthropic pairs.
- `apps/web/src/lib/ai/providers/anthropic-translator.ts:27–29`: local translator hardening now imports the untracked quality pipeline; copying this file would expand AI-01's dependency graph.
- `apps/web/scripts/translation-worker.ts:539–584` and `apps/web/src/lib/translation-quality-report.ts:40–45`: source/target hashing and nontransactional persistence.
- `apps/web/scripts/translation-worker.test.ts:159–264`: existing preservation, source-change and interrupted-paid-run coverage; target-edit and interleaving coverage is absent.

## AI-01 exact minimal package

**File 1 — `apps/web/src/lib/ai/providers/server.ts`**: take only the two existing insertions. The factory file matches the production baseline before these changes.

```diff
@@ -26,6 +26,7 @@
 import { opusTranslator } from "./opus-translator";
 import { nvidiaRivaTranslator } from "./nvidia-riva-translator";
+import { anthropicTranslator } from "./anthropic-translator";
 import { ChainTranslator } from "./chain-translator";
@@ -52,6 +53,7 @@
   const provider = getProviderForPair(source, target);
   if (provider === "opus") return opusTranslator;
   if (provider === "nvidia-riva") return nvidiaRivaTranslator;
+  if (provider === "anthropic") return anthropicTranslator;
   if (provider === "chain") {
```

**File 2 — `apps/web/src/lib/ai/providers/server.test.ts`**: the existing untracked file has the four assertions below. For a stable integrated test, explicitly disable the environment-dependent Opus opt-in inside the test and restore it afterwards; otherwise a developer's inherited Opus configuration changes the expected result.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTranslatorForPair } from "./server";

beforeEach(() => { vi.stubEnv("OPUSMT_ENABLED", "false"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("getTranslatorForPair", () => {
  it("routes supported Swedish pairs to the Anthropic translator", () => {
    expect(getTranslatorForPair("sv", "en")?.name).toBe("anthropic");
    expect(getTranslatorForPair("en", "sv")?.name).toBe("anthropic");
  });

  it("retains Riva routing and rejects unsupported pairs", () => {
    expect(getTranslatorForPair("en", "fr")?.name).toBe("nvidia-riva");
    expect(getTranslatorForPair("unknown", "sv")).toBeNull();
  });
});
```

Run from the future isolated candidate root with Node 22:

```sh
npm test -w @verkli/web -- src/lib/ai/providers/server.test.ts
```

Expected red/green: test-only against the baseline fails because sv→en returns null; the two-line fix makes Swedish routing pass while Riva and unsupported-pair assertions remain unchanged. This command has **not** been run in this investigation. The test only chooses provider objects; it never invokes `translate` or constructs an Anthropic API client. Existing `apps/web/vitest.config.mts` supplies the `server-only` stub.

AI-01 requires **no new package, schema or model change**. `@anthropic-ai/sdk` already exists in baseline `apps/web/package.json`; baseline `anthropic-translator.ts` already uses `claude-sonnet-5` and reads `ANTHROPIC_API_KEY` lazily when translation runs. Package/lock/config/routing files have no AI-checkout diff versus `26d02239`. This is a code-configuration observation, not verification of present provider availability or billing permission.

Exclude from AI-01: `anthropic-translator.ts` and its new test; `translation-worker.ts`; all quality modules/UI/routes; `load-dotenv.ts`; model/budget settings. Also exclude the independent one-line `sourceVersionId` change in `translation-preview/route.ts`: it corrects preview source selection, not provider mapping.

After targeted verification, the release owner runs candidate lint, TypeScript/unit checks and the normal **Turbopack production build**: `npm run build -w @verkli/web`, using the existing Docker-parity optional-dependency preparation in `infra/docker/Dockerfile.web:57–82`. The [R0 verifier](/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/docs/qa/2026-09-14-r0-verification.md) records the exact reversible preparation used for the local bundle. Do not substitute webpack or a dev-server result for this production gate. This corrects the earlier handoff's webpack advice. No provider/UI success claim follows from the factory unit test.

## AI-02 split and dependencies

These are proposed review units, not permission to deploy incomplete dependencies. Keep one owner of `translation-worker.ts`; UI changes require coordination with F1/E1. Paths are relative to the AI checkout.

| Package | Exact existing files/hunks | Dependency and boundary |
| --- | --- | --- |
| Rehearsal environment isolation | `apps/web/scripts/load-dotenv.ts`; `apps/web/scripts/load-dotenv.test.ts` | Independent two-file change: `override: true`→`false` plus explanatory comment. Complete before an explicitly isolated worker rehearsal. Affects all importing scripts; do not mix with factory parity. |
| Quality core | `apps/web/src/lib/ai/translation-quality/types.ts`, `pipeline.ts`, `pipeline.test.ts`, `anthropic.ts`, `anthropic.test.ts`, `anthropic-worker.test.ts`, `review-only.test.ts` | Validation, shared prompts, bounded correction/re-review, Anthropic adapter, worker-compatible imports. Existing SDK/zod only. `anthropic.ts` includes the review-only export used by the later evaluation package. |
| Legacy translator validation | `apps/web/src/lib/ai/providers/anthropic-translator.ts`; `anthropic-translator.test.ts` | Requires quality core because of `assertTranslationSegments`. Guards empty/invalid segments, parse errors and unfinished responses; no model-ID change. Can be reviewed separately after core. |
| Chapter preparation and reservation helpers | `apps/web/src/lib/translation-quality-budget.ts`, `.test.ts`; `translation-quality-chapter.ts`, `.test.ts`; `translation-quality-report.ts` | Depends on core. Shared segmentation keeps execution and reservation aligned. Hashes/report payload use existing `ai_jobs` JSON; no migration. These helpers precede worker/API consumers. |
| Worker integration and persistence | `apps/web/scripts/translation-worker.ts`; `translation-worker.test.ts` | Depends on core/helpers. Current tracked diff is 204 added / 252 removed lines. Stages all reviewed chapters before writes, persists report/progress, enforces paid-run terminal behavior. **Blocked for replacement-capable release by the race below.** Do not stage this large worker replacement into AI-01. |
| Author API/UI vertical slice | `apps/web/src/app/api/books/[id]/translation-quality/route.ts`, `route.test.ts`; `translation-status/route.ts`; `translation-preview/route.ts`; `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/TranslationQualityCard.tsx`, `TranslatePanel.tsx`; `apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useTranslation.ts` | Depends on core/helpers; book completion/report behavior also requires reviewed worker. GET reports/queue status, POST sample review, source-version preview forwarding, visible status/error, terminal-job polling and report refresh must be integrated together. Preserve shared-file ownership. |
| UI rehearsal | `apps/web/src/app/dev/translation-quality/page.tsx`, `preview.tsx`; `apps/web/scripts/qa-translation-quality.cjs` | Depends on author UI. Fixture-only development route; production route returns 404. Verifies UI states, not database persistence. |
| Evaluation evidence / AI-03 preparation | `apps/web/src/lib/ai/translation-quality/evaluation-corpus.ts`, `evaluation.ts`, `evaluation.test.ts`; `apps/web/scripts/evaluate-translation-quality.ts`, `qa-translation-evaluation.cjs`; `apps/web/src/app/dev/translation-evaluation/page.tsx`, `workbench.tsx`; `docs/qa/fixtures/translation-review-baseline-2026-09-14.json`, `translation-review-v2-2026-09-14.json` | Depends on core and its review-only adapter. Not required to fix routing or execute reviewed translation. Offline by default; `--live` is a separate paid operation. Recorded 10-case development corpus is not the required independent holdout. |
| Delivery documentation | `docs/qa/translation-quality-2026-09-14.md`, `ai-readiness-2026-09-14.md`; `docs/superpowers/plans/2026-09-14-translation-quality.md`, `2026-09-14-ai-quality-evaluation.md` | Carry appropriate history with its package; label past local evidence and new candidate evidence separately. |

### Contracts that must be settled before AI-02 release

- **Persistence:** source revision, target revision, publication state, chapter replacement/deletion, report and terminal edition state must refer to one accepted operation. New transaction/RPC/schema requires the user's separate decision. A Redis lock or another reread alone does not serialize arbitrary author writes and publication.
- **Routing:** the new worker calls the quality Anthropic adapter for every supported pair (`translation-worker.ts:259–264, 409, 443, 478`), whereas quick preview retains `getTranslatorForPair` and therefore Riva for en→fr or Opus when enabled. AI-01 fixes baseline sv↔en parity; AI-02 introduces a broader provider-policy choice. Make that explicit rather than claiming universal provider parity from the factory test.
- **Cost:** current default is 500,000 internal daily translation units (`src/lib/workers/budget.ts:54–58`). Prior QA records 549,792 reserved units for three 4,000-character chapters. This is a conservative reservation, not an invoice. `translation-quality-budget.ts:86–114` caps work at one profile plus six calls per batch, up to 200 batches; calibration and an allocated Q0 budget are prerequisites for the three-chapter provider rehearsal. Do not silently raise allowances.
- **Retry:** reservation key includes queue ID and enqueue timestamp (`translation-quality-budget.ts:124–130`). New adapter requests have zero SDK retries and time bounds; interrupted paid runs are terminal. Baseline queue still advertises three attempts, so the worker's `UnrecoverableError` path and failed-handler refund classification must travel with the worker package. Timeout is not proof that a provider charged nothing.
- **Compatibility:** queue payload shape is unchanged; the reviewed worker adds `translation_quality` report JSON formatVersion 1. Rollback to an old worker loses the quality gate despite accepting the same queue payload, so stop/reconcile outstanding reviewed jobs as part of the release plan. Do not label a completed legacy job quality-approved merely because the queue is complete.

## P0 saving race: author target edits can be lost with checks passed

**Code-traced finding, not an executed reproduction.** The worker snapshots only source content. After all model work it rereads the source at lines 539–546, checks only target `published_at` at 551–554, and unconditionally upserts target chapters by `(book_version_id, order)` at 556. There is no expected target revision/hash predicate. Lines 565–577 compare the just-written target with the generated result and can save `checks_passed`, even if that write erased a newer author edit. Report GET's freshness hash at `translation-quality/route.ts:157–167` also sees the overwritten generated text and cannot recover or detect the lost edit.

Exact first regression to add in `apps/web/scripts/translation-worker.test.ts`, using its existing isolated database/model mocks:

1. Reuse the existing two-chapter target fixture and `payload` (`overwrite: true`). Snapshot the original target.
2. In `mocks.translate` while processing the second chapter (`input.texts[0] === "Två"`), replace `old-target-one.content` with `"Author edit made while translation is reviewing."`. Return the normal passing review for both chapters.
3. Assert `processJob(payload, "target-edit-run")` rejects with a conflict/`TranslationQualityStoppedError`; the author edit and the other old target chapter remain intact; no quality record or edition gets `checks_passed`/`done` for this replacement.
4. The current implementation is expected to fail this test: it resolves, overwrites the edit with `Reviewed Hon väntar.`, and saves a passing report. Establish red before implementation; this investigation did not run it.

Then add deterministic interleavings at the persistence boundary: source edit after final source read; target edit/publication after target check; chapter reconciliation failure after upsert; and a full-book plus chapter job writing the same target. The queue IDs differ by chapter suffix (`translation-queue.ts:97–101`), and worker concurrency is 2 (`translation-worker.ts:668`), so ordinary same-ID queue dedupe is not a per-target lock. A failing old job can also overwrite edition status belonging to a newer job because final status updates predicate only on target ID.

The current old-target test only verifies rejection **before** persistence (second chapter needs review). It does not prove rollback: upsert, surplus deletion, target reread, report update, edition completion and translation-state completion are separate operations at worker lines 556–592. Failure after upsert leaves changed target rows; a failed attempt to persist the subsequent error can also leave an earlier passing report. Blocking overwrite while a reviewed persistence design is decided is preferable to claiming these gaps are closed by hashes.

## Next-owner verification sequence (not executed here)

1. Receive R0 candidate SHA, create the isolated AI-01 worktree, inspect its baseline, and apply only the two files above. Run the factory regression with Opus explicitly controlled; verify test-only red and fix green.
2. Run candidate lint/unit/TypeScript/build gates; record the resulting SHA and per-file diff. Factory evidence remains separate from paid preview/worker evidence.
3. In AI-02's isolated package, add the target-edit regression first, agree the persistence design, then prove old text survives rejection, concurrent replacement and injected save failure. Run targeted mocked worker/route/core tests before any external work.
4. Exercise the development quality UI with fixtures on localhost at desktop/mobile widths: empty, loading, needs-review, checks-passed, unavailable and refreshed/stale reports. Production must return 404 for the two development routes.
5. Only after Q0 fixes named account/data/Redis/worker host and allocated provider spend, perform the real approved short-book save/reload → reviewed queue job → persisted edition journey. Record exact source/target hashes, queue/report IDs, request usage and failure/retry outcomes. Independent bilingual held-out evaluation remains AI-03.

Only this document was created by this task. The AI source checkout and dirty root were left untouched. R0 integration was not duplicated.
