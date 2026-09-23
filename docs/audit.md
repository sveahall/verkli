# Sprint 0 — Foundation Audit

> Generated: 2026-04-29 · Branch: `mvp-wip-2026-03-18`
> Scope: `apps/web` (the production codebase). Read-only audit; no code changes.

This consolidates 30+ existing audit documents (`TECHNICAL_AUDIT_REPORT.md`,
`ARCHITECTURE_MAP.md`, `BASELINE_SYSTEM_STATE.md`, `DATABASE_ARCHITECTURE.md`,
`SCHEMA_GAPS.md`, `audit-2026-04-02-*.md`, `route-map.md`, `mvp.md`,
`beta-launch-plan.md`, etc.) into a single feature/route/table inventory with
status and tech-debt grading. Where a previously-written doc remains the source
of truth (e.g. queue topology in `BASELINE_SYSTEM_STATE.md`), that link is
preserved instead of duplicated.

---

## 0. TL;DR

- **Codebase is mature, not greenfield.** 75 DB tables, 81 migrations, 134 API
  route files, 94 page routes, 7 BullMQ queues, 7 worker processes, full
  Sentry + Stripe + Resend integration. The Sprint 0 task list assumes a
  greenfield; in reality most "infra to add" already exists. Genuine gaps:
  PostHog, soft deletes, audit logs, missing FK indexes, deliberate Sentry
  smoke test.
- **Working core flows:** auth (Supabase), import → translate → audiobook
  pipeline, billing (Stripe), Resend transactional mail, social publish,
  recommendations, marketing, notifications.
- **Soft-launch posture:** several major features (`audiobook`, `freemium gate`,
  `discovery`, `marketing`, `translations`) are env-flag-gated via
  `apps/web/src/lib/flags.ts`. Default-OFF semantics enforced.
- **Dominant risk:** drift between docs and code (called out in
  TECHNICAL_AUDIT_REPORT §1), no audit log of mutations, no soft delete
  anywhere, 34 FK columns lack a leading-column index — see `db-audit.md`.

---

## 1. Status legend

| Symbol | Meaning |
|---|---|
| ✅ Working | Feature works end-to-end; tests or runbook validate it |
| 🟡 Partial | Feature ships, but with known gaps, behind a flag, or not load-tested |
| 🔴 Broken | Code present but currently non-functional or known-failing |
| ⚫ Dead | Code present but no live entry point / behind a permanently-OFF flag / legacy redirect |

---

## 2. Feature inventory

| Feature | Status | Flag | Owner code | Notes |
|---|---|---|---|---|
| Auth (Supabase, role-aware redirect) | ✅ | — | `app/auth/callback/route.ts`, `lib/auth/*` | Active-role cookie + profile lookup |
| Author dashboard (My World) | ✅ | — | `app/(app-author)/author/*` | Swedish locale OK per author-locale policy |
| Reader app | ✅ | — | `app/(app-reader)/reader/*` | English-first (CI-enforced) |
| Public marketing pages | ✅ | — | `app/(public-author)/*`, `app/(public-reader)/*` | |
| Book editor (TipTap) | ✅ | — | `app/(app-author)/author/books/[id]/editor/*` | Currently undergoing UX redesign (per project memory) |
| Book import (epub/pdf/docx/txt) | ✅ | — | `lib/imports/*`, `scripts/import-worker.ts` | BullMQ `book-import-extract` |
| Translation pipeline (Opus MT) | ✅ | `NEXT_PUBLIC_TRANSLATIONS_ENABLED` | `lib/opus.ts`, `scripts/translation-worker.ts` | Local Python subprocess; env-heavy |
| Audiobook generation (Qwen3 / OpenAI TTS) | 🟡 | `NEXT_PUBLIC_AUDIOBOOK_ENABLED` (default OFF for cohort window) | `lib/tts/*`, `scripts/audiobook-worker.ts` | Deferred to P1 per soft-launch plan |
| Reader recommendations | ✅ | `NEXT_PUBLIC_RECOMMENDATIONS_ENABLED` | `lib/recommendations*`, `scripts/recommendations-worker.ts` | DB-scoring, no external model |
| Discovery (genres, lists, browse) | 🟡 | `NEXT_PUBLIC_DISCOVERY_ENABLED` | `app/(reader-browse)/*`, `lib/genres/*` | Route 404s when flag OFF — intentional |
| Marketing / trailer / social | 🟡 | `NEXT_PUBLIC_MARKETING_ENABLED` | `app/api/marketing/*`, `scripts/marketing-worker.ts`, `lib/higgsfield.ts` | Higgsfield + Runway dependencies |
| Social publish (X / IG / TikTok) | 🟡 | OAuth env required | `app/api/social/*`, `scripts/social-publish-worker.ts` | OAuth wiring exists, end-to-end not load-tested |
| Newsletters | 🟡 | `NEXT_PUBLIC_NEWSLETTERS_ENABLED` | `app/(app-author)/author/newsletters/*` | UI present; send-flow uses Resend |
| Polls | 🟡 | `NEXT_PUBLIC_POLLS_ENABLED` | `app/api/polls/*`, `app/(app-reader)/reader/polls/*` | |
| Book clubs | 🟡 | `NEXT_PUBLIC_BOOK_CLUBS_ENABLED` | `app/api/book-clubs/*` | |
| Direct messages | 🟡 | — | `app/api/messages/*`, realtime publication | DM rate-limit table exists |
| Comments / highlights / reviews | ✅ | — | `app/api/comments/*` | |
| Bookmarks / reading progress | ✅ | — | `app/api/bookmarks/*`, migration `20260427150000_reading_progress.sql` | |
| Offline reading | 🟡 | `NEXT_PUBLIC_OFFLINE_READING_ENABLED` | `lib/offline/*` | |
| Stripe billing (author + reader) | ✅ | — | `app/api/stripe/*`, `lib/billing/*` | Webhooks → `stripe_events`; redemption table 20260423130000 |
| Donations | 🟡 | mock-mode env | `app/api/donations/*` | Note: donation mock mode caveat in E2E memory |
| Referrals | 🟡 | — | `app/api/referrals/*`, `referral_codes`, `referral_redemptions` | |
| Print-on-demand | 🟡 | — | `lib/print-on-demand/*` | UI surface incomplete |
| Author waitlist | ✅ | — | `app/waitlist`, `app/api/waitlist/*` | |
| Reader waitlist | ✅ | — | `reader_waitlist` table, signup flow | |
| Beta access (admin grant) | ✅ | — | `app/admin/beta` | Cohort funnel emits `waitlist_signup`, `beta_granted`, `first_publish` |
| Author applications | ✅ | — | `app/(public-author)/author/apply`, `app/admin/author-applications` | |
| Content reports | ✅ | — | migration `20260423140000_content_reports.sql` | |
| Account deletion | 🟡 | — | migration `20260423150000_account_deletion_requests.sql` | Request table only; no automated cleanup yet |
| Notifications | ✅ | — | `app/api/notifications/*`, BullMQ `notifications` queue | |
| Cohort funnel observability | ✅ | — | `app/api/admin/metrics/funnel` | Recent commit `17df224 PR2` |
| AI chat (per-author) | ⚫ | `NEXT_PUBLIC_AI_CHAT_ENABLED` (default OFF, every call billable) | `lib/ai/*` | Stub returns deterministic templates when flag OFF |
| Legacy `/writer/*` routes | ⚫ | — | redirects to `/author/*` | |
| Generic `/signin`, `/signup` | ⚫ | — | redirects to author signin/signup | |
| Electron (desktop wrapper) | ⚫ | — | `electron-main.js`, `electron-preload.js`, `electron-tts-service.js` at repo root | Outside `apps/web`; build pipeline unclear |
| TTS lab (`/author/tts-lab`) | 🟡 | dev-only | author route | Internal QA tool |

---

## 3. Route inventory

The canonical IA list is `docs/route-map.md` (last updated 2026-03-04). The
status flags below are the audit overlay on top of that map.

### Reader (`apps/web/src/app/(app-reader)`, `(reader-browse)`, `(public-reader)`)

| Route | Status | Notes |
|---|---|---|
| `/reader/home` | ✅ | Continue-reading + recommended |
| `/reader/feed` | ⚫ | Legacy → `/reader/home` |
| `/reader/discover`, `/reader/genres`, `/reader/authors` | 🟡 | Flag-gated |
| `/reader/books/[id]`, `/reader/read/[chapterId]` | ✅ | |
| `/reader/lists/[slug]` | ✅ | Curated lists |
| `/reader/library`, `/reader/bookmarks` | ✅ | Library chapter-count batched per memory |
| `/reader/profile`, `/reader/settings` | ✅ | |
| `/reader/clubs`, `/reader/clubs/[id]` | 🟡 | Flag-gated |
| `/reader/polls` | 🟡 | Flag-gated |
| `/reader/inbox`, `/reader/notifications` | ✅ | |
| `/reader/billing` | ✅ | |
| `/reader/onboarding` | ✅ | Genre prefs + first signals |

### Author (`apps/web/src/app/(app-author)`)

| Route | Status | Notes |
|---|---|---|
| `/author/home` | ✅ | |
| `/author/dashboard`, `/writer/home` | ⚫ | Legacy redirects |
| `/author/books`, `/author/books/[id]` | ✅ | Editor; ongoing UX redesign |
| `/author/shelves/[id]`, `/author/library/[id]` | 🟡 | Curation surfaces incomplete |
| `/author/stats` | 🟡 | Implemented; chart fidelity TBD |
| `/author/profile`, `/author/settings` | ✅ | |
| `/author/marketing` | 🟡 | Flag-gated |
| `/author/newsletters`, `/author/newsletters/[id]` | 🟡 | Flag-gated |
| `/author/polls` | 🟡 | Flag-gated |
| `/author/inbox`, `/author/notifications` | ✅ | |
| `/author/billing` | ✅ | |
| `/author/tts-lab` | 🟡 | Dev/internal |
| `/account/feedback` | ✅ | |

### Auth (`apps/web/src/app/(auth)`)

| Route | Status | Notes |
|---|---|---|
| `/{author,reader}/signin`, `/{author,reader}/signup`, `/{author,reader}/forgot-password` | ✅ | |
| `/signin`, `/signup`, `/forgot-password` | ⚫ | Legacy → author variant |
| `/auth/callback`, `/auth/reset-password` | ✅ | |

### Admin

| Route | Status | Notes |
|---|---|---|
| `/admin/beta` | ✅ | Beta grant + funnel |
| `/admin/books`, `/admin/users`, `/admin/author-applications` | ✅ | Behind `checkAdmin()` |

### Public

| Route | Status |
|---|---|
| `/`, `/waitlist`, `/{author,reader}` marketing, `/pricing`, `/faq`, `/how-it-works`, `/product`, `/reader/{app,how-it-works,membership,faq}` | ✅ |

### Dev

| Route | Status | Notes |
|---|---|---|
| `/dev/social-mock` | 🟡 | Dev-only social OAuth mock |

---

## 4. API endpoint inventory (134 route files)

Grouped by directory under `apps/web/src/app/api`. Status here reflects whether
the endpoint is wired and reachable. Detailed runbooks live in
`docs/job-pipeline-regression-tests.md` and `docs/import-pipeline.md`.

| Group | Sample endpoints | Status | Notes |
|---|---|---|---|
| `account` | delete, email, role | ✅ | Account deletion records to request table; cleanup is manual |
| `admin` | beta, metrics/funnel, books, users | ✅ | Admin-auth via timing-safe compare |
| `ai` | chat, copy generation | 🟡 | LLM gated by `AI_CHAT_ENABLED` |
| `auth` | sync-role | ✅ | |
| `author` | marketing/campaigns, subscription-plan | ✅ | |
| `author-applications` | submit, approve | ✅ | |
| `authors` | follow, public profile | ✅ | |
| `billing` | webhook, redirect | ✅ | Stripe webhooks |
| `book-clubs` | clubs CRUD, members, messages | 🟡 | Flag-gated UI |
| `bookmarks` | toggle, list | ✅ | |
| `books` | CRUD, publish, translate, generate-audio | ✅ | publish has tests |
| `comments` | post, list | ✅ | |
| `credits` | grant, list | 🟡 | Reader-credit surface incomplete |
| `dev` | sentry-test (to be added in this sprint) | 🆕 | |
| `donations` | start, webhook | 🟡 | Mock-mode caveat |
| `feedback` | submit | ✅ | |
| `follows` | follow author | ✅ | |
| `genres` | list, follow | 🟡 | Flag-gated UI |
| `health` | k8s-style ping | ✅ | E2E test depends on it |
| `marketing` | trailer, copy, social | 🟡 | Flag-gated |
| `messages` | send, list, block | 🟡 | Realtime publication added |
| `newsletters` | subscribe, send | 🟡 | Flag-gated |
| `notifications` | list, mark-read, register | ✅ | |
| `offline` | manifest | 🟡 | Flag-gated |
| `polls` | create, vote | 🟡 | Flag-gated |
| `reader` | settings, recommendations, library | ✅ | |
| `recommendations` | server-side scoring trigger | ✅ | |
| `referrals` | redeem, codes | 🟡 | |
| `reports` | content-report | ✅ | |
| `social` | OAuth callbacks, schedule, post | 🟡 | OAuth wired, end-to-end not load-tested |
| `stripe` | session, webhook, redemption | ✅ | |
| `translation` | enqueue, status | 🟡 | Flag-gated |
| `tts` | preview, voice profile | 🟡 | Local subprocess deps |
| `waitlist` | author + reader signup | ✅ | |

---

## 5. Database table inventory

75 tables in 81 migrations. Full schema doc lives in `docs/DATABASE_ARCHITECTURE.md`.

### Core domain
`books`, `chapters`, `book_versions`, `book_translations`, `book_imports`,
`audiobook_assets`, `chapter_audio_cache`, `marketing_campaigns`,
`marketing_campaign_plans`, `marketing_posts`, `marketing_assets`,
`marketing_caption_cache`, `media_assets`, `content_assets`,
`reading_progress`, `readings`, `reviews`, `bookmarks`, `highlights`,
`shelves`, `shelf_books`, `shelf_sections`, `curated_lists`,
`curated_list_items`.

### Identity / auth
`profiles`, `author_followers`, `author_applications`, `author_subscriptions`,
`author_subscription_plans`, `follows`.

### Billing / monetisation
`billing_accounts`, `billing_plan_catalog`, `entitlements`, `orders`,
`stripe_events`, `stripe_session_redemptions`, `donations`, `credit_grants`,
`credit_topups`, `user_credits`, `user_usage_monthly`.

### Discovery / signals
`genres`, `book_genres`, `recommendations`, `reader_genre_preferences`,
`reader_book_signals`.

### Social / community
`book_clubs`, `book_club_members`, `book_club_messages`, `comments`,
`conversations`, `conversation_participants`, `messages`,
`message_user_blocks`, `dm_sender_rate_limits`, `social_connections`,
`polls`, `poll_options`, `poll_votes`, `newsletters`,
`newsletter_subscriptions`.

### Pipeline / system
`ai_jobs`, `analytics_events`, `notifications`, `feedback`, `user_flags`,
`waitlist`, `reader_waitlist`, `tts_preview_jobs`, `translations`,
`offline_manifests`, `content_reports`, `account_deletion_requests`,
`referral_codes`, `referral_redemptions`.

### Status
- Soft delete: **none of these tables** have a `deleted_at` column.
- Audit logs: **no `audit_log` table exists**. Mutations are not auditable.
- See `db-audit.md` for the gap analysis.

---

## 6. Tech debt

### P0 — soft-launch blockers

1. **No deliberate Sentry smoke test.** SDK is wired (`instrumentation.ts`,
   client, `withSentryConfig`, CSP allowlists `*.sentry.io`), but there is no
   route that proves errors actually arrive in the dashboard.
   *Fix in this sprint: add `/api/dev/sentry-test`.*
2. **No product analytics.** `analytics_events` is a server-side event sink,
   but there is no PostHog / Amplitude / Mixpanel layer for funnels, retention,
   or A/B. `@vercel/analytics` is page-view only.
   *Fix in this sprint: install PostHog and wire 4 events.*
3. **34 FK columns lack a leading-column index** (full list in `db-audit.md`).
   Some are on hot paths (`recommendations.book_id`, `readings.book_id`,
   `readings.chapter_id`, `reading_progress.user_id`, `analytics_events.user_id`).
4. **No soft delete on user-facing content** (`books`, `chapters`, `comments`,
   `messages`, `marketing_campaigns`). Account deletion logs a request but does
   not perform the actual erasure flow.
5. **No audit log for sensitive mutations** (`profiles.role` changes, billing
   state, payouts, content reports resolution, admin grants). Required for
   any compliance claim and for incident forensics.
6. **Doc/code drift** flagged in `TECHNICAL_AUDIT_REPORT §1`. Not all docs
   match runtime; the legacy `packages/db/supabase/migrations` was archived in
   `db/migration-consolidation` but several runbooks still reference it.

### P1 — should fix before GA

7. **No structured logger.** Workers use `console.log` / `console.error`. No
   correlation IDs, no JSON logs, no log-level config beyond Sentry breadcrumbs.
8. **Worker prod orchestration is unclear.** `start-workers.ts` exists but
   there is no Procfile / k8s deployment / Render service definition committed.
   `INFRASTRUCTURE.md` describes intent only.
9. **Donation flow has a mock-mode that affects E2E** (per `feedback_e2e_testing.md`).
10. **DM rate limit** stored in `dm_sender_rate_limits`, but no global IP
    rate-limit at the edge. `lib/rate-limit.ts` exists but coverage is partial.
11. **No queue dashboard.** BullMQ has Bull Board / Arena available but neither
    is mounted. Operators currently `redis-cli` to triage stuck jobs.
12. **Audiobook pipeline depends on a local Python subprocess (Qwen3).**
    There is no fallback when the local model is unavailable in production.
13. **Stripe webhook idempotency** uses `stripe_events`, but `stripe_session_redemptions`
    is a recent addition; the redemption logic should be re-tested for replay.
14. **TipTap content sanitisation** uses `dompurify` + `sanitize-html`. No
    test confirms a hostile EPUB upload can't introduce script tags during
    import → render.
15. **CSP allows `'unsafe-inline'` script-src** for analytics shims. Tighten
    once PostHog and Vercel Analytics nonces are in place.

### P2 — nice to have

16. Consolidate the existing audit docs (this file is the start; many of the
    older `docs/audit-2026-04-02-*` and `TECHNICAL_AUDIT_REPORT.md` overlap).
17. `packages/db/supabase/migrations_archived` can be deleted after a period.
18. `apps/worker` is a thin wrapper — could be inlined.
19. Remove dead `electron-*.js` files at repo root if desktop is not pursued.
20. Replace per-worker scripts with the unified `start-workers.ts` entry only.
21. `@/lib/flags.ts` is env-based; revisit when a runtime flag service
    (LaunchDarkly, Statsig, Unleash, GrowthBook) is justified — env flags are
    correct for current cohort-gating and require redeploy by design.
22. Add a typed event dispatcher that fans out to both `analytics_events`
    (Supabase) and PostHog from a single call site.
23. Tests for `chapter_audio_cache` cleanup ordering (book delete cascades).
24. ESLint: enforce React Compiler purity rules already configured.

---

## 7. Dependencies between features

```
auth (Supabase)
  ├── role-aware redirect → reader app, author app, admin
  ├── profiles → analytics_events, follows, billing_accounts, …
  └── waitlist → beta access → first publish

book editor
  ├── chapters / book_versions
  ├── import worker (BullMQ:book-import-extract) ← required to seed editor
  ├── translation worker (BullMQ:book-translation) ← needs published book
  └── audiobook worker (BullMQ:audiobook-generation) ← needs published chapters

reader experience
  ├── discovery (genres + curated_lists) ← flag-gated
  ├── recommendations (BullMQ:recommendations) ← seeded by reader_book_signals
  ├── reading_progress / readings ← drives /reader/home
  └── bookmarks / highlights

monetisation
  ├── stripe webhook → billing_accounts / entitlements
  ├── donations (separate flow, mock-mode in dev)
  ├── credits / user_credits
  └── referral_codes → referral_redemptions

marketing / social
  ├── marketing_campaigns ← author content
  ├── marketing_posts → social_publish worker
  └── higgsfield/runway external APIs

infra (cross-cutting)
  ├── Sentry (wired)
  ├── Resend (transactional mail)
  ├── BullMQ + Redis (queue backplane)
  ├── Supabase Storage (covers, audiobooks, imports)
  ├── feature flags (env-based, default-OFF)
  ├── analytics_events (server-side sink)
  └── PostHog (NEW in this sprint)
```

Notable cross-feature couplings:

- `books.audiobook_status` is mutated by *both* the audiobook worker and
  `app/api/books/[id]/publish/route.ts`. Coordination is via `ai_jobs` rows.
- `analytics_events` is the only shared funnel substrate between admin,
  cohort metrics, and product features. PostHog will sit alongside, not
  replace, this table during the soft-launch window.
- `@/lib/flags.ts` is consumed by both client (NEXT_PUBLIC_) and server
  (fallback to non-public env). Flag flips require redeploy by design.
- `stripe_events` is the canonical idempotency store; `stripe_session_redemptions`
  is the redemption-side join.

---

## 8. What was done in Sprint 0 vs skipped

| Task | Action | Reason |
|---|---|---|
| Audit doc | ✅ Written | This file. |
| DB audit doc | ✅ Written | See `db-audit.md`. |
| Feature flag infra | ✅ Already present, demo flag added | `apps/web/src/lib/flags.ts` is mature; added one demo flag wired to a small UI element instead of replacing it. |
| Sentry | ✅ Already present, smoke-test endpoint added | SDK + `instrumentation.ts` already exist; added `/api/dev/sentry-test` to prove the pipeline. |
| PostHog | ✅ Added | Genuine gap. `posthog-js` + `posthog-node` installed; 4 events wired. |
| Async job queue (Inngest/Trigger.dev) | ⏭ Skipped (decision documented) | BullMQ + Redis is the production queue backplane with 7 active queues / 7 workers and `start-workers.ts` runtime. Migrating during Sprint 0 is destructive and out of scope. See `docs/queue-decision.md`. |
| Welcome-email demo job | ✅ Stubbed via existing notifications queue | A welcome-email handler is added to the existing `notifications` BullMQ queue (no new infrastructure). |
| App-logic changes | ⏭ Avoided | Per the user's "infrastructure only" constraint. |
