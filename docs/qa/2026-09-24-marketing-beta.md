# Marketing engine — closed beta

Branch: `codex/marketing-beta-engine`, integrated with `main` at `f3bcbb0c`.
Worktree: `/Users/admin/.codex/worktrees/marketing-beta-engine/verkli-web`.
Implementation and authenticated localhost acceptance are complete for copy, draft persistence, campaign generation and audio. Video rendering is blocked by the provider account balance. This document does not certify a production deployment or complete beta acceptance. No dependency or schema changes.

## Result

- One workspace per book: choose a brief, write or generate copy, edit, preview, save versions, reopen them, and attach an optional ad budget plan.
- Unpublished books can prepare marketing. The former publish-first gate is removed. Legacy campaign entry points lead to the workspace; the existing ad planner and channel connection page remain accessible.
- Studio generation uses the selected channel, language, goal and audience without overwriting saved copy. Explicit Save persists a new version. Link navigation warns about unsaved work; session-only recovery covers browser Back/Forward.
- Campaign plans retain all selected channels, show the actual draft count, and support one, two or four weeks. Approval counts exclude drafts. BullMQ job IDs now satisfy its colon restriction while still recognizing active legacy IDs.
- Podcast posts generate narrated audio from saved copy and play through an authenticated endpoint. Editing the script clears its old audio and approval. Usage records no longer reference a nonexistent synchronous job.
- Media generation checks revisions and claims each post before spending. Trailer generation preserves reviewed copy. Failed attempts refresh the saved revision so authors can retry without reloading the page; concurrent copy edits still conflict safely.
- Higgsfield now uses the installed SDK's v1 params/job-set contract and its supported `dop-turbo` model. Missing credentials are rejected before reserving a render. Unknown model costs remain null, with raw usage recorded for later pricing.
- Public social delivery is blocked in the API, queue and worker, including old queued jobs, independently of connection flags. The existing isolated development simulation remains available. Copy/download and approval are for private review.

## Local UI

- Author workspace: `http://localhost:3114/author/marketing` (existing beta author login).
- Development-only layout: `http://localhost:3114/dev/marketing-studio`.
- Development-only campaign/drawer fixture: `http://localhost:3114/dev/marketing-studio?view=campaign`.

The fixture pages do not bypass API authentication or ownership. Automated fixture tests intercept API responses. The real author acceptance runs below used actual authenticated services separately.

Restart using Node >=22.12 and approved environment configuration:

```sh
NEXT_PUBLIC_MARKETING_ENABLED=true npm run dev -w @verkli/web -- --port 3114
```

Copied local credentials are not sufficient: the local OpenAI key returned 401 and local Redis had no marketing consumer. For acceptance, production web credentials and the public Redis connection were supplied only in process memory. No secrets were committed or printed. No Railway environment changes were made.

## Manual QA — seven steps

1. Sign in as a beta author; open Marketing with an unpublished book and description. Confirm the closed-beta message and absence of a publish-first gate.
2. Choose language, channel, goal and audience; generate a draft, edit it and check the preview. Cancel an internal link navigation; text remains. Use browser Back/Forward and verify recovery of text and brief.
3. Add a daily amount, currency and duration; save, reload and reopen. Confirm text and metadata match. A failed save must retain the current text. Open Ad drafts & budgets to verify the existing planner remains accessible.
4. Create a two-week campaign with all six channels and low frequency; the preview contains 12 text drafts. Confirm saved drafts arrive through the real marketing worker. Calendar dates do not schedule social delivery.
5. Edit and save a podcast script, generate audio, play it and approve it. Editing the script clears audio/approval. After a provider failure, retry without a full reload; a concurrent edit must still be protected.
6. After Higgsfield credits and production credentials are configured, generate a trailer using an uploaded cover. Verify playback, persistence after refresh, preserved caption and recorded provider usage. This is an outstanding acceptance step, not a claimed pass.
7. Check desktop and 390px mobile layouts. Verify no public Publish/Mark as posted action is exposed, API delivery remains blocked, and anonymous audio access returns 401.

## Verification — 2026-09-24

| Check | Evidence |
| --- | --- |
| Full Vitest suite | 476 files passed, one skipped; 4,838 tests passed, 29 skipped |
| Lint | No errors; one existing `_nx` unused-variable warning in `model-work-fence.test.ts` |
| TypeScript/dead-code | Passed; removed unused declarations that previously blocked the gate |
| Production build | Passed, with existing dynamic-file tracing warnings |
| Marketing Playwright | Five flows: copy/save/reopen and mobile; six-channel calendar; cancelled internal navigation; media failure/retry/save; Back/Forward recovery |
| Real copy acceptance | Swedish Facebook copy generated for an unpublished QA book, edited, persisted and reopened with matching text |
| Real campaign acceptance | Existing Railway marketing worker generated both podcast and trailer drafts for a private QA campaign after the queue-ID fix |
| Real audio acceptance | 19.41-second clip played in the authenticated UI; 276 characters recorded in usage with no fake job FK; anonymous GET denied with 401 |
| Real video attempt | Corrected request reached Higgsfield; provider rejected it with `Not enough credits`. No finished render/playback claimed |
| `qa:beta` | Stages 1–6 passed; strict stage 7 failed because the existing ElevenLabs key lacks `user_read` for audiobook quota checks |
| Remaining independent release diagnostics | Stripe catalog and webhook checks passed. Queue check reported missing social-publish consumer (publishing intentionally blocked here). RLS policy shape passed; strict paid-book behavior probe skipped because no published paid book exists. No public fixture was created |

## Outstanding deployment and acceptance

- Production web does not currently have `HF_CREDENTIALS`. Configure through the existing secret-management process; never put its value in a PR or log.
- The locally available Higgsfield account has insufficient API credits. The user must arrange the account funding; no purchase was made.
- Production ElevenLabs synthesis works, but its key lacks `user_read`. Full release-gate acceptance requires that permission for audiobook quota verification; marketing audio playback does not prove that separate flow.
- The PR must be reviewed/integrated and deployed before any claim that this UI is live. Verify the deployed SHA and repeat the authenticated acceptance on that SHA.
- Existing public video storage is unchanged. The requested beta boundary is enforced at social delivery; no campaign was posted publicly during QA.
