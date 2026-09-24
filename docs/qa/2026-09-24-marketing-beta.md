# Marketing engine — closed beta

Implemented locally on `codex/marketing-beta-engine`, based on `917ee1fc`.
Worktree: `/Users/admin/.codex/worktrees/marketing-beta-engine/verkli-web`.
Not merged, deployed or verified end-to-end against paid production providers.
No dependencies or database schema changes.

## Result

- One marketing workspace per book: write or generate copy, edit, preview, save versions, reopen them, and attach an optional ad budget plan.
- Draft books can prepare marketing without publishing the book. Legacy marketing entry points lead to the same workspace.
- AI copy uses the selected channel, language, goal and audience. Studio generation does not overwrite existing saved copy; Save draft persists a version.
- Campaign plans retain every selected channel, show the actual number of drafts, and support one, two or four weeks. Approval counts exclude unreviewed drafts.
- Podcast entries can generate narrated audio from reviewed copy and play it through an authenticated endpoint. Editing the script invalidates its previous audio and approval.
- Trailer generation checks the saved revision, claims the job before paid work, preserves reviewed text, and reports persistence failures. Generation failures retain the user's script.
- Social delivery is blocked in the API, queue admission and worker, including old queued jobs. Only the existing isolated local simulation can bypass this for tests. Approval, copying and downloading remain available for private review.

## Local UI

The task's dev server is running at `http://localhost:3114`.

- Real author workspace: `http://localhost:3114/author/marketing` (sign in with an existing approved beta author).
- Layout preview: `http://localhost:3114/dev/marketing-studio`. This uses sample books and is development-only. It does not bypass API authentication or book ownership; sample saving/generation is only mocked in automated tests.

To restart, use Node >=22.12 and run from this worktree:

```sh
NEXT_PUBLIC_MARKETING_ENABLED=true npm run dev -w @verkli/web -- --port 3114
```

Use existing approved environment configuration. Local copied configuration lacks `MARKETING_DAILY_BUDGET` and `MARKETING_JOB_CAP_UNITS`; real generation must not be claimed as working until those existing operational settings are configured. Do not invent user-facing beta usage limits.

## Manual QA — seven steps

1. Sign in at localhost as a beta author. Open Marketing with an unpublished book containing a description. Confirm there is no publish-first gate and the closed-beta message is visible.
2. Select a channel, language, goal and audience. Generate a draft; edit its wording and confirm the preview follows the changes. A provider configuration failure must leave existing text intact.
3. Expand the ad budget plan, enter an amount, currency and duration, then save. Reload and reopen the saved version. Confirm text, channel, language, audience and budget are restored; no ad is launched.
4. Create a campaign plan with all six channels, low frequency and two weeks. Confirm the summary contains 12 text drafts and all selected channels appear in the calendar. Submit only against a configured marketing worker and inspect the resulting saved drafts.
5. In a campaign, edit and save a podcast script, generate audio, play it, and approve it. Edit the script again: approval and the old audio must be cleared until regeneration. Reload after an uncertain generation failure.
6. With a valid uploaded cover and configured video provider, generate a trailer. Verify the saved caption is preserved, the video plays, and refreshing retains the asset. Duplicate/stale requests must not start another paid generation.
7. Check desktop and a 390px mobile viewport. Confirm save failures keep text, book switching warns about unsaved work, and no public social delivery or Mark as posted action is available in the marketing workspace.

## Verification on 2026-09-24

All commands used the existing bundled Node 24 runtime; the shell's Node 22.11 is below the repository requirement.

| Check | Result |
| --- | --- |
| `npm test -w @verkli/web` | 420 files passed, one skipped; 4,260 tests passed, 17 skipped |
| `npm run lint -w @verkli/web` | Passed; zero errors, two existing unused-variable warnings |
| `NEXT_PUBLIC_MARKETING_ENABLED=true npm run build -w @verkli/web` | Passed, including TypeScript and page generation; nine existing dynamic-filesystem tracing warnings |
| Marketing Studio Playwright spec | Both tests passed; generated/edit/save/reopen, failed-save retention, Facebook brief, budget persistence, six-channel plan, and mobile overflow checks |
| `git diff --check` | Passed |
| `npm run qa:beta -w @verkli/web` | Blocked at stage 6/12 by three existing unused declarations in unrelated files; later stages were not reached |

Playwright intercepts API responses. These UI tests do not prove a production database write, worker execution or a paid provider call. Route tests cover ownership, stale revisions, duplicate claims, persistence failures, private audio access and the social publishing block.

The unrelated `qa:beta` failures are unused `React` imports in `SavedTranslationComparison.test.tsx` and `TranslationLanguages.test.tsx`, plus unused `srcDir` in `src/lib/usage/paid-call-coverage.test.ts`. They were left unchanged.

## Deployment prerequisites still outstanding

Read-only Railway inspection found marketing budget settings, the text-provider key, and ElevenLabs key/voice configured on the web service. It did **not** find `HF_CREDENTIALS`, which the existing Higgsfield video implementation requires. Video generation remains a concrete production blocker until that credential is configured through the normal secret-management process.

No Railway environment values were changed. Worker availability, paid text/audio/video generation, and private production persistence still require an authenticated acceptance run after integration and configuration. Existing public media-storage behavior was not redesigned; this change specifically prevents social posting during the closed beta.
