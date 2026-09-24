# Marketing engine — closed beta

Branch: `codex/marketing-beta-engine`, integrated with `main` at `f3bcbb0c`.
Worktree: `/Users/admin/.codex/worktrees/marketing-beta-engine/verkli-web`.
Authenticated localhost acceptance passed for copy, draft persistence, campaign generation, audio, and a real campaign trailer including recovery after a long provider render. The separate multi-scene book trailer builder has not received full real-provider acceptance. This document does not certify a production deployment or complete beta acceptance. No dependency or schema changes.

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

Copied local credentials are not sufficient: the local OpenAI key returned 401 and local Redis had no marketing consumer. For acceptance, production web credentials and the public Redis connection were supplied only in process memory. No secrets were committed or printed. The existing Higgsfield credentials were staged on the Railway web service with `--skip-deploys`; no deployment was triggered. ElevenLabs quota-read permission was enabled by the account owner and verified with HTTP 200.

## Manual QA — seven steps

1. Sign in as a beta author; open Marketing with an unpublished book and description. Confirm the closed-beta message and absence of a publish-first gate.
2. Choose language, channel, goal and audience; generate a draft, edit it and check the preview. Cancel an internal link navigation; text remains. Use browser Back/Forward and verify recovery of text and brief.
3. Add a daily amount, currency and duration; save, reload and reopen. Confirm text and metadata match. A failed save must retain the current text. Open Ad drafts & budgets to verify the existing planner remains accessible.
4. Create a two-week campaign with all six channels and low frequency; the preview contains 12 text drafts. Confirm saved drafts arrive through the real marketing worker. Calendar dates do not schedule social delivery.
5. Edit and save a podcast script, generate audio, play it and approve it. Editing the script clears audio/approval. After a provider failure, retry without a full reload; a concurrent edit must still be protected.
6. Generate a campaign trailer using an uploaded cover. If it takes longer than the request window, use Check trailer status: it must resume the same signed provider job without another reservation or render. Verify playback, persistence after refresh, preserved caption and one usage event. Test the separate multi-scene book trailer builder before certifying that entire journey.
7. Check desktop and 390px mobile layouts. Verify no public Publish/Mark as posted action is exposed, API delivery remains blocked, and anonymous audio access returns 401.

## Verification — 2026-09-24

| Check | Evidence |
| --- | --- |
| Full Vitest suite | 476 files passed, one skipped; 4,851 tests passed, 29 skipped |
| Lint | No errors; one existing `_nx` unused-variable warning in `model-work-fence.test.ts` |
| TypeScript/dead-code | Passed; removed unused declarations that previously blocked the gate |
| Production build | Passed, with existing dynamic-file tracing warnings |
| Marketing Playwright | Five flows: copy/save/reopen and mobile; six-channel calendar; cancelled internal navigation; media failure/retry/save; Back/Forward recovery |
| Real copy acceptance | Swedish Facebook copy generated for an unpublished QA book, edited, persisted and reopened with matching text |
| Real campaign acceptance | Existing Railway marketing worker generated both podcast and trailer drafts for a private QA campaign after the queue-ID fix |
| Real audio acceptance | 19.41-second clip played in the authenticated UI; 276 characters recorded in usage with no fake job FK; anonymous GET denied with 401 |
| Real campaign video acceptance | Funded Higgsfield render returned 202 while pending, then the same provider job resumed with 200. Saved MP4 played in authenticated UI: duration 5.366667 seconds, currentTime >0.5. Caption preserved; one raw usage record for the resumed job |
| `qa:beta` | Stages 1–10 passed after ElevenLabs permission and beta-aware queue checks. Strict stage 11 stops because there is no published paid-book fixture for the paywall behavior probe. Policy shape passed. Build was run separately and passed |
| Remaining independent release diagnostics | Stripe catalog and webhook checks passed. Queue check recognizes centrally disabled social delivery, still fails if blocked social jobs are pending, and still requires the marketing consumer. RLS policy shape passed; strict paid-book behavior probe skipped because no published paid book exists. No public fixture was created |

## Outstanding deployment and acceptance

- Higgsfield account funding was completed by the user ($25 shown), and a real campaign trailer now works locally using those credentials. Staged Railway credentials activate on the next deployment.
- Initial funded acceptance exposed a timeout that discarded the provider job ID. That first render could not be recovered from app state. The second test saved its ID before polling, returned pending, and resumed without a new submission. No claim that the first render was free or usage-accounted.
- The known second QA asset was created before HMAC provenance validation was added; its signature was backfilled only after matching the exact asset/provider pair captured in the server log. New submissions persist the signature directly. Unit tests cover forged IDs, leases, missing IDs, and conflict-safe finalization.
- Provider job IDs are bound to author/book/asset by server HMAC. A bounded lease prevents concurrent polling requests; only the current post revision may attach media or mark a failure. Failed ID persistence produces an explicit recovery-required error, not a claim of ordinary resumability.
- The separate multi-scene book trailer builder remains unverified with real paid renders; the authenticated 5.37-second acceptance applies to campaign trailers.
- Strict paywall behavior acceptance requires an existing approved published paid-book fixture. No fixture was published or payment made to satisfy this gate.
- The PR must be reviewed/integrated and deployed before any claim that this UI is live. Verify the deployed SHA and repeat the authenticated acceptance on that SHA.
- Existing public video storage is unchanged. The requested beta boundary is enforced at social delivery; no campaign was posted publicly during QA.
