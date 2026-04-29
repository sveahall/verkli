# Verkli — Beta/Soft-Launch Roadmap

> **Status**: Active — Phase 0 (in planning).
> **Last updated**: 2026-04-29.
> **Owner**: @SveaHallinder.
> **Target**: Lean MVP + PRO, soft launch in 6–8 weeks.

This document is the single source of truth for what we're building toward beta/soft launch and what comes after. Replace any older roadmap-like docs with this one.

---

## How Claude Code uses this file

When you (Claude Code, or a fresh session) pick up work on Verkli:

1. **Read this file end-to-end first.** It contains the full audit, branch strategy, ordered phases, acceptance criteria, and idea bank. It is meant to survive across sessions.
2. **Find the next unchecked task** in the phase status tracker below and start there. Tasks are roughly ordered by dependency — don't skip ahead unless the user redirects.
3. **Work on branch `mvp-wip-2026-03-18`** (or a feature branch off it). The current `main` branch is the marketing/waitlist site only; the actual MVP code lives on `mvp-wip`. See "Branch strategy" below.
4. **Update the status tracker** when a phase task is completed (mark `[x]`). This is the heartbeat across sessions.
5. **Do not reinvent.** "Critical Files & Reuse Map" lists what already exists on `mvp-wip-2026-03-18`. Reuse Stripe wiring, BullMQ workers, TTS providers, etc. before adding new modules.
6. **Verify before claiming done.** Each phase has a Definition of Done — actually run the listed E2E checks; do not assume code-level success means feature-level success.
7. **When in doubt, stop and ask.** Especially before destructive ops (DB rewrite, breaking schema migration, removing tables, force-pushing).

---

## Branch strategy

```
main (c06f650)              ← Marketing/waitlist site only. Don't develop new MVP code here.
└─ mvp-wip-2026-03-18 (71a7b42)   ← Active MVP development. All audit findings live here.
   └─ feature/<phase>-<slug>      ← Branch each PR off mvp-wip
```

- `main`: Static landing page, waitlist signup, basic auth scaffolding. Stays minimal.
- `mvp-wip-2026-03-18`: Full MVP — billing, books, authors, audiobook workers, BullMQ queues, Supabase migrations, marketing pipeline, etc. **All roadmap work happens here.**
- Feature branches: One per Phase X.Y task. Open PR back to `mvp-wip`. After soft launch we plan a single big merge `mvp-wip → main` (or rename branches) once `main` is ready to host the live app.
- **Never force-push `mvp-wip-2026-03-18` or `main`.** Several humans + agent worktrees have it checked out.

---

## Scoping decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Launch scope | **Lean MVP + PRO** (6–8 weeks) | MVP polish + PRO tier visible at launch; ads/coin/affiliate/livestream/merch/collab deferred |
| Author monetization | **Hybrid: upfront one-offs OR Verkli PRO subscription with commitment for discount** | No author credits; credits are reader-side only |
| Reader credits/coin | **Verkli Coin (reader-side only)** | Earn via streaks/reviews/referrals/cashback; spend on books/chapters/POD/subs |
| Voice cloning provider | **ElevenLabs** (Multilingual v2 + Voice Cloning API) | Fastest to ship; provider already wired at `apps/web/src/lib/tts/elevenlabs-tts-provider.ts` |
| Platform cut | **30%** | Standard (Apple/Spotify parity) |
| Reader currency | **USD initially**, SEK via Stripe currency conversion later | |
| Beta cohort size | **50–100 authors** initial whitelist + gradient reader rollout (10% → 50% → 100%) | |

---

## Current state audit (snapshot)

Source: deep code-search of `mvp-wip-2026-03-18` on 2026-04-29.

| Area | Status | Where it lives |
|---|---|---|
| Reader signup/onboarding | Done | `apps/web/src/app/(auth)/reader/signup/page.tsx`, `OnboardingFlow.tsx` |
| Discover/browse | Done | `apps/web/src/app/(reader-browse)/reader/discover/page.tsx`, `/reader/{authors,genres,lists}` |
| Reader read page (font/theme/highlights/notes/bookmarks) | Done | `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/*` |
| Audio player (per chapter + manifest) | Done | `ChapterAudiobookPlayer.tsx`, `ManifestAudiobookPlayer.tsx` |
| Reading progress sync (cross-device, client_seq merge) | Done | `apps/web/src/lib/books/...` |
| Multi-language **reader switcher (UI)** | Partial | `book_translations` table exists; reader-side toggle missing |
| Per-book + per-chapter Stripe checkout | Done | `apps/web/src/app/api/billing/checkout` |
| Author subscriptions (OnlyFans-style) | Done | Migration `20260408100000_author_subscriptions.sql`, `SubscribeAuthorButton.tsx` |
| Print-on-demand (CPI partner) | Done | `apps/web/src/lib/print-on-demand/index.ts`, `pod_orders` table |
| Author application + admin approval | Done | `apps/web/src/lib/auth/author-approval.ts`, `apps/web/src/app/admin/author-applications/page.tsx` |
| Cover upload + AI generation | Done | `apps/web/src/app/api/books/[id]/cover/generate/route.ts` |
| Audiobook (TTS provider + worker) | Partial | Worker ready, gated by `NEXT_PUBLIC_AUDIOBOOK_ENABLED=false` |
| **Voice cloning** | Missing | ElevenLabs `/v1/voices/add` not wired |
| Translation pipeline | Done | `book_translations`, `apps/web/scripts/translation-worker` (in combined-worker?), `useTranslation` hook |
| Per-chapter scheduled release | Partial | No UI, no cron worker |
| **AI spell/grammar check** | Missing | Stub at `apps/web/src/lib/ai/writing-assistant.ts` |
| Marketing campaigns + AI trailer | Done | `apps/web/src/lib/ai/trailer-generation`, `marketing_campaigns` table, `marketing-worker.ts` |
| **Organic socials OAuth (IG/TikTok/X/FB)** | Missing | Placeholders only in `MarketPanel.tsx` |
| **Paid ads APIs (Meta/TikTok)** | Missing | — |
| Newsletters | Partial | Send routes wired, dashboard incomplete |
| Author<->reader DMs | Done | `InboxClient.tsx` + Supabase Realtime |
| Notifications (email/in-app/push) | Done | `apps/web/scripts/notifications-worker.ts` + `apps/web/src/lib/notifications` |
| Comments + reviews | Partial | Per-book ✅, per-chapter ❌, aggregate stars ❌ |
| Library/bookmarks/shelves | Done | `/reader/library`, `/reader/bookmarks` |
| **PRO tier (badge + quota)** | Missing | Stripe billing infra exists; no PRO products/SKUs |
| **Verkli Coin / streaks / reader rewards** | Missing | — |
| **Affiliate portal (10% influencer commission)** | Missing | — |
| **Author payouts (Stripe Connect)** | Partial | Reader checkout works; Connect/KYC/1099 not wired |
| **Content moderation / age gates / DMCA** | Partial | User-flagging exists; auto-flag, age gate, DMCA missing |
| **App-i18n (Swedish in author dashboard)** | Missing | No next-intl setup |
| **Search (FTS)** | Partial | DB filters only |
| Livestreams / Merch / Collab / Proofreader | Missing | All post-launch |
| Sentry + PostHog + Vercel Analytics | Done | `instrumentation.ts`, `qa:beta` gate |
| BullMQ workers (audiobook/translation/marketing/notifications/social-publish/recommendations/combined) | Done | `apps/web/scripts/*-worker.ts` |

---

## Phase status tracker

Tick each item as you complete it. Phases are roughly serial; sub-tasks within a phase can parallelize.

### Phase 0 — Pre-Launch Foundation (week 1)
- [ ] 0.1 Stripe Connect (author payouts, KYC, ledger, tax forms)
- [ ] 0.2 Multi-language reader switcher (10/10 UX blocker)
- [ ] 0.3 Content moderation + age gate + DMCA + auto-flagging + moderation queue
- [ ] 0.4 App-i18n with next-intl (Swedish for author dashboard only)
- [ ] 0.5 Postgres FTS search (books + authors + global topbar)

### Phase 1 — Author Toolkit Completion (weeks 2–3)
- [ ] 1.1 Audiobook ON + ElevenLabs Multilingual v2 + Voice Cloning
- [ ] 1.2 AI spell/grammar check (per-chapter proofread with diff/accept)
- [ ] 1.3 Per-chapter scheduled release (cron + cadence UI)
- [ ] 1.4 Per-chapter pricing UI in editor
- [ ] 1.5 Rich text editor evaluation (markdown vs Tiptap)

### Phase 2 — PRO Tier + Hybrid Monetization (weeks 3–4)
- [ ] 2.1 Stripe SKUs: Free / PRO / PRO+ (monthly + annual prepay)
- [ ] 2.2 Quota & metering (`author_usage_periods`)
- [ ] 2.3 Upfront one-off SKUs (audiobook hour, translation, proofread, trailer)
- [ ] 2.4 PRO badge in UI + reader filter
- [ ] 2.5 Pricing page revamp + ROI calculator

### Phase 3 — Marketing: Organic Socials (weeks 4–5)
- [ ] 3.1 OAuth + posting per platform (IG, TikTok, X, FB, YT Shorts, Threads, LinkedIn)
- [ ] 3.2 Bulk content generation (trailer/carousel/quote/audiogram/podcast, multi-language)
- [ ] 3.3 Content calendar + delayed-job scheduler
- [ ] 3.4 Performance tracking (UTM + post-back metrics)

### Phase 4 — Reader Experience Polish + Verkli Coin (weeks 5–6)
- [ ] 4.1 Verkli Coin (earn rules + spend in checkout + anti-abuse)
- [ ] 4.2 Streaks + achievements + badge gallery
- [ ] 4.3 Per-chapter comments + ratings (aggregate to book-level)
- [ ] 4.4 Reader library polish (shelves drag-drop, yearly goal, follow readers opt-in)
- [ ] 4.5 Push notifications (web push + email backup)

### Phase 5 — QA, Beta-gate, Soft Launch (weeks 6–8)
- [ ] 5.1 Extend `npm run qa:beta` (stripe-connect, moderation, age-gate, i18n coverage)
- [ ] 5.2 Synthetic E2E + load tests (50 audiobook gens, 100 checkouts concurrently)
- [ ] 5.3 Beta cohort whitelist + founders discount + reader gradient rollout
- [ ] 5.4 Status page (status.verkli.com)
- [ ] 5.5 Customer support (Intercom or Crisp, 12h SLA)
- [ ] 5.6 Author onboarding email drip (5 mails / 14 days)
- [ ] 5.7 Press kit + announce landing page

### Post-launch v1.1 — Affiliate Portal + Paid Ads (weeks 9–12)
- [ ] v1.1.1 Affiliate signup + tracking URLs + 10% commission + dashboard
- [ ] v1.1.2 Affiliate payouts via Stripe Connect Express
- [ ] v1.1.3 Meta Marketing API (boost organic posts, audience builder, ROAS)
- [ ] v1.1.4 TikTok Spark Ads
- [ ] v1.1.5 Pre-approved audiences + budget caps (PRO+ only)

### Post-launch v1.2 — Community Layer (weeks 13–16)
- [ ] v1.2.1 Author<->author collaboration (`book_collaborators`, revenue split via Stripe Connect splits)
- [ ] v1.2.2 Newsletter polish (segmentation, A/B, drip sequences, analytics)
- [ ] v1.2.3 Reading clubs polish (per-chapter discussion threads, AMA scheduling)
- [ ] v1.2.4 Author live text chat sessions (subscriber-only)

### Post-launch v1.3 — Premium Ecosystem (weeks 17–22)
- [ ] v1.3.1 Livestreams via Mux (paywalled or open, auto-recording)
- [ ] v1.3.2 Merch shop via Printful integration
- [ ] v1.3.3 Proofreader marketplace (vetted internal pool, Verkli takes 15%)
- [ ] v1.3.4 Verkli AI Reader Companion (RAG over book content via Supabase pgvector)

---

# Phase details

## Phase 0 — Pre-Launch Foundation

**Goal:** Close non-feature blockers — payments compliance, legal, accessibility, search, i18n.

### 0.1 Stripe Connect for author payouts
**Tasks:**
- Add `connect_account_id`, `payouts_enabled`, `kyc_status`, `payout_schedule` to `profiles` (or new `author_payout_accounts` table — recommend the latter for normalization)
- Onboard flow in `apps/web/src/app/(app-author)/author/billing` → call `accountLinks.create` with refresh + return URLs back to billing page
- Ledger view: per-book gross → platform cut (30%) → net author earnings; columns: pending / available / paid out
- Stripe webhook: `account.updated` → update `payouts_enabled`, `kyc_status`
- Tax form trigger: enable Stripe Tax Forms on platform; for SE authors collect personnummer + SE bank; for US authors W-9 + 1099-NEC
- Default payout schedule: monthly; PRO/PRO+ can choose weekly

**Acceptance criteria:**
- [ ] Test author can complete Stripe Connect onboarding in sandbox (KYC simulated)
- [ ] After purchase, ledger correctly shows pending → available → paid out transitions
- [ ] Webhook replay test passes for `account.updated` lifecycle
- [ ] Tax form generation surfaces for >$600 USD earnings
- [ ] Author cannot publish a paid book until `payouts_enabled = true`

**Files:**
- New: `apps/web/src/lib/payments/stripe-connect.ts`
- New: `apps/web/src/app/(app-author)/author/billing/payouts/page.tsx`
- New: `apps/web/src/app/api/billing/connect/{onboard,refresh,return}/route.ts`
- New migration: `supabase/migrations/{ts}_stripe_connect_payouts.sql`
- Modify: `apps/web/src/app/api/billing/webhook/route.ts` — handle `account.updated`

### 0.2 Multi-language reader switcher
**Tasks:**
- Inspect `book_translations` schema; ensure `(book_id, language_code, status)` unique constraint
- Reader page `/reader/read/[chapterId]` reads available languages and renders flag/code toggle in top right
- On switch: update text content + reload audio asset for that language; preserve scroll position
- Persist choice in `reader_preferences.preferred_language[bookId]`
- Fallback: if audio missing for chosen language, render text-only and toast "Audio not available in {lang}"
- E2E: book with EN/SV/ES translations → switch each → both text and audio update

**Acceptance criteria:**
- [ ] Switching language updates URL query param (so deep links preserve language)
- [ ] Audio stream changes within 500ms of switch
- [ ] Reading-progress sync still works (each language has its own progress slot)
- [ ] If author publishes new translation later, reader UI auto-detects without code change

**Files:**
- New: `apps/web/src/components/reader/LanguageSwitcher.tsx`
- Modify: reader page `/reader/read/[chapterId]/ReaderChapterClient.tsx`
- Modify: audio player to accept `languageCode` prop

### 0.3 Content moderation, age gates, DMCA
**Tasks:**
- Add `is_adult_content boolean` on `books` and `author_subscription_plans`
- Add `age_verified_at timestamptz` on `profiles`; modal on first adult-content access
- Verify Stripe policy: Stripe restricts adult content. If we want OnlyFans-style adult subs, may need separate Stripe account with `restricted_business_types`. Validate with Stripe before launch.
- DMCA page at `/legal/dmca` + endpoint `/api/legal/dmca-takedown` → emails legal@verkli + creates `content_reports` row with `type = 'dmca'`
- Refund policy + community guidelines pages under `(public-reader)/terms`
- Auto-flagging: keyword list + Perspective API toxicity score on comments, messages, reviews, book descriptions; threshold = 0.8 → auto-hide + queue
- Moderation queue in admin: filters (auto-flagged, user-reported, type), actions (hide / warn user / ban / dismiss)

**Acceptance criteria:**
- [ ] Adult book gated behind 18+ modal; "remember me" persists for 30 days
- [ ] DMCA form delivers email + creates report row; admin can mark content as removed
- [ ] Comment containing flagged keyword auto-hides within 5s of post
- [ ] Admin can ban user; banned user cannot login or comment
- [ ] Stripe-confirmed: adult content allowed under our merchant agreement (or separate account spun up)

**Files:**
- New: `apps/web/src/components/legal/DmcaForm.tsx`
- New: `apps/web/src/app/(public-reader)/legal/dmca/page.tsx`
- New: `apps/web/src/app/api/legal/dmca-takedown/route.ts`
- New: `apps/web/src/lib/moderation/auto-flag.ts`
- New: `apps/web/src/lib/moderation/perspective-api.ts`
- Modify: `apps/web/src/app/admin/reports/page.tsx`
- New migration: `supabase/migrations/{ts}_age_gates_dmca.sql`

### 0.4 App-i18n setup (next-intl)
**Tasks:**
- Install `next-intl`
- Create `apps/web/messages/en.json` and `apps/web/messages/sv.json`
- Wrap only the `(app-author)` route group with `NextIntlClientProvider`; reader/public stays English-only (per existing `check:english-default` CI rule)
- Migrate hardcoded Swedish strings in `(app-author)` to `t('...')` calls
- Extend `apps/web/scripts/check-english-default.ts` to whitelist `(app-author)/**` and fail on non-English elsewhere

**Acceptance criteria:**
- [ ] `npm run check:english-default` passes
- [ ] Toggling locale to `sv` changes author dashboard but reader stays in English
- [ ] No untranslated strings in author dashboard (lint-style check via missing-key script)

**Files:**
- New: `apps/web/src/lib/i18n/config.ts`
- New: `apps/web/messages/{en,sv}.json`
- Modify: `apps/web/src/app/(app-author)/layout.tsx` — wrap in provider

### 0.5 Postgres FTS search
**Tasks:**
- Add `tsvector` columns to `books.title`, `books.description`, `books.tags`, `profiles.display_name`, `profiles.bio`
- GIN indexes on each
- Trigger to keep tsvector synced on insert/update
- API `/api/search?q=<query>&type=<book|author>&filters=<...>` with ranking (`ts_rank_cd`)
- Reader topbar global search component with debounced autocomplete
- Author-search separate tab on `/reader/authors`

**Acceptance criteria:**
- [ ] Search "harry potter" returns relevant books before authors
- [ ] p95 query latency ≤ 200ms on a seeded 10k books / 5k authors dataset
- [ ] Filters compose with FTS (genre + language + format + query)
- [ ] Empty query returns top-trending fallback

**Files:**
- New migration: `supabase/migrations/{ts}_search_fts.sql`
- New: `apps/web/src/app/api/search/route.ts`
- New: `apps/web/src/components/search/GlobalSearchBar.tsx`

---

## Phase 1 — Author Toolkit Completion

### 1.1 Audiobook ON with ElevenLabs
**Setup:**
- Sign up ElevenLabs Creator plan ($22/mo) — gives Multilingual v2 + Instant Voice Cloning
- For PRO+ tier: upgrade to Pro plan ($99/mo) for Professional Voice Cloning (30+ min sample, higher quality)
- Add envs: `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_MODEL=eleven_multilingual_v2`

**Tasks:**
- Flip `NEXT_PUBLIC_AUDIOBOOK_ENABLED=true` in prod (after this phase passes QA)
- Enable Multilingual v2 per-language auto-detection
- Voice library UI: list ElevenLabs preset voices + author's cloned voices
- Clone-my-voice flow:
  - Author records 1–3 min sample in browser (MediaRecorder API) or uploads file
  - POST `/v1/voices/add` (Instant Voice Cloning) → store `elevenlabs_voice_id` on `author_voices` table
  - PRO+ option: upload 30+ min for Professional Voice Cloning
  - Required ToS checkbox: "This is my voice and I have rights to use it"
  - Consent record stored in `voice_consents` table for GDPR
- Multi-language: when book has translation, auto-generate audiobook on each language using same voice (Multilingual v2 supports cross-language with same voice)
- Per-chapter regenerate (e.g. typo fix → re-narrate just that chapter)
- Pronunciation dictionary editor (override how proper nouns are pronounced)

**Pricing (locked):**
- PRO: 25h/mo audiobook generation included
- PRO+: 100h/mo + Professional Voice Cloning
- Free: must buy upfront one-off audiobook hours

**Acceptance criteria:**
- [ ] Author can record sample → clone voice → generate test audiobook chapter end-to-end < 5 min
- [ ] Cloned voice generates audio in 3 languages with consistent timbre
- [ ] Pronunciation override applies and persists
- [ ] Voice deletion request removes voice from ElevenLabs and `author_voices`
- [ ] Hard-cap on monthly spend per author ($X) to prevent runaway costs

**Files:**
- New: `apps/web/src/lib/tts/elevenlabs-voice-cloning.ts`
- New: `apps/web/src/components/author/voice-library/VoiceLibrary.tsx`
- New: `apps/web/src/components/author/voice-library/VoiceCloneRecorder.tsx`
- Modify: `apps/web/scripts/audiobook-worker.ts` — accept `voice_id` from job payload
- New migration: `supabase/migrations/{ts}_author_voices.sql`

### 1.2 AI spell/grammar check
**Tasks:**
- Provider: Anthropic Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — fast, fiction-tone-aware, supports Swedish + most European languages
- Endpoint `/api/books/[id]/chapters/[id]/proofread` → batches 1500-token chunks; returns array of `{start, end, original, suggestion, reason}`
- UI in editor: "Proofread chapter" button → diff view with accept/reject per suggestion
- Multi-language: auto-detect chapter language from existing metadata, no user toggle needed
- Pricing: PRO includes 50 chapters/mo, upfront one-off $1.99/chapter for Free tier

**Acceptance criteria:**
- [ ] Free user blocked at quota; upfront purchase unblocks specific chapter
- [ ] Diff view accept-all / reject-all actions work
- [ ] Suggestions don't break inline formatting (bold, italics, links)
- [ ] Proofread on 5000-word chapter completes in < 30s

**Files:**
- New: `apps/web/src/lib/ai/proofreading/anthropic-proofread.ts`
- New: `apps/web/src/app/api/books/[id]/chapters/[id]/proofread/route.ts`
- New: `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/ProofreadPanel.tsx`

### 1.3 Per-chapter scheduled release
**Tasks:**
- Schema: `chapters.scheduled_publish_at timestamptz NULL`
- Worker `apps/web/scripts/scheduled-publish-worker.ts` runs every 5 min via BullMQ repeatable job; flips `is_published = true` for any row where `scheduled_publish_at <= now()` and `is_published = false`
- Editor UI: "Publish now" / "Schedule release" → cadence picker (one-time / weekly / biweekly / monthly), start date, day of week, time, starting from chapter N
- On publish: enqueue notifications to subscribers (existing pipeline)
- Reader: "Next chapter unlocks {date}" countdown on book page when chapters are scheduled

**Acceptance criteria:**
- [ ] Schedule chapter for "in 5 minutes" → worker publishes within 5–10 min window
- [ ] Subscribers receive notification within 1 min of publish
- [ ] Cancelling schedule before fire-time prevents publish
- [ ] Bulk schedule "publish chapters 5–20 weekly on Fridays" works correctly

**Files:**
- New: `apps/web/scripts/scheduled-publish-worker.ts`
- New: `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/ScheduleReleasePanel.tsx`
- Modify: `apps/web/scripts/combined-worker.ts` — register new worker

### 1.4 Per-chapter pricing UI
**Tasks:**
- `chapters.price_amount` (already in schema, verify) exposed in editor "Publishing" panel
- Bulk action: "Set all chapters to $X" + per-chapter override
- Reader: book detail page shows per-chapter price column when `pricing_model = 'per_chapter'`
- Default: chapter price = book price ÷ chapter count if not overridden

**Acceptance criteria:**
- [ ] Editor shows pricing column with inline edit
- [ ] Bulk-set action does not overwrite manually-overridden chapters (warn + confirm)
- [ ] Reader checkout for per-chapter purchase respects override price

### 1.5 Rich text editor evaluation
**Decision needed before starting:** Inspect the current editor at `apps/web/src/app/(app-author)/author/books/[id]/editor/`.

- If it's already markdown + preview and works for fiction → keep, just polish.
- If basic textarea → migrate to Tiptap with StarterKit, footnotes extension, image upload to Supabase Storage. Preserve markdown export so no data loss.

**Acceptance criteria (if migrating):**
- [ ] Existing chapters render identically after migration
- [ ] Image upload integrates with existing Supabase Storage bucket
- [ ] Author can still export chapter as markdown
- [ ] Editor undo/redo, autosave (every 5s), word count

---

## Phase 2 — PRO Tier + Hybrid Monetization

### 2.1 Stripe SKUs

**Author tier products** (recurring):
| Product Name | Stripe Product ID (sandbox) | Monthly Price | Annual Price (-2 months) |
|---|---|---|---|
| Verkli Free | `prod_free` | $0 | — |
| Verkli PRO | `prod_pro` | $29 | $290 |
| Verkli PRO+ | `prod_pro_plus` | $99 | $990 |

**Author one-off products** (non-PRO authors pay-as-go):
| Product | Price (placeholder, finalize before launch) |
|---|---|
| Audiobook (1 hour generated) | $5 |
| Translation (1 book to 1 language) | $20 |
| Proofread (1 chapter) | $1.99 |
| AI Trailer | $9 |
| Carousel post (5 slides) | $2.99 |

**Reader products** (already exist):
- Per-book purchase (variable, set by author)
- Per-chapter purchase (variable)
- Print-on-demand (CPI partner cost + author markup)
- Author subscription (variable monthly, set by author)

**Tasks:**
- Create products + prices in Stripe (sandbox first, then prod)
- Wire up via `apps/web/src/lib/payments/stripe-billing.ts` — extend with `getProTierProduct(tier)`, `createOneOffPriceForFeature(feature)`
- Annual prepay: 2 months free is built into the price; cancel-anytime but no prepay refund
- Founders discount coupon: 25% off lifetime, applied via promo code at checkout for first 100 authors

**Acceptance criteria:**
- [ ] Author can subscribe to PRO monthly → Stripe invoice generated → `profiles.pro_tier = 'pro'`
- [ ] Annual prepay shows correct 2-months-free pricing
- [ ] Cancel mid-period preserves PRO status until period end
- [ ] Founders coupon applies once per user

### 2.2 Quota & metering
**Tasks:**
- Table `author_usage_periods (author_id, period_start, period_end, audiobook_seconds_used, translations_used, proofread_chapters_used, ai_posts_used, trailers_used)`
- Cron worker `apps/web/scripts/usage-period-worker.ts` runs 1st of each month at 00:01 UTC → opens new period rows for active subscribers
- Each generation API checks quota → allow or block with "Upgrade or buy upfront" modal
- Author dashboard widget: "12 of 25 hours used" with progress bars per quota type

**Acceptance criteria:**
- [ ] PRO author reaches 25h audiobook quota → next generation blocks with clear CTA
- [ ] Upfront purchase unblocks the specific generation
- [ ] Period rolls over correctly on the 1st
- [ ] PRO+ has higher quotas applied automatically

### 2.3 Upfront one-offs
- Stripe one-time `Price` per feature (above table)
- Checkout in editor → on success, creates row in `author_one_off_purchases (author_id, feature, quantity, stripe_session_id, status)`
- Charge BEFORE generation (no surprise bills)
- Show one-off entitlement balance alongside PRO quota

### 2.4 PRO badge in UI
- `profiles.pro_tier` enum (`free | pro | pro_plus`)
- New component `<ProBadge tier={...} />` — Dribbble-style gradient badge
- Visible on: author profile, book cards, comment author, message sender, search results
- Reader filter "PRO authors only" toggle on `/reader/discover`

### 2.5 Pricing page
- Update `apps/web/src/app/(public-author)/pricing/page.tsx` with 3-column comparison
- ROI calculator: input "books per year + translations + audiobook hours" → outputs "PRO saves $X vs upfront"
- FAQ: cancel anytime, what counts as a chapter, refund policy, founders discount

---

## Phase 3 — Marketing: Organic Socials

### 3.1 OAuth + posting per platform

| Platform | API | What we ship at launch | App-review timeline |
|---|---|---|---|
| Instagram | Graph API (Business / Creator) | Reels (video) + Carousel (images) + Caption | 4–6 weeks |
| TikTok | Content Posting API | Video upload + caption + hashtags | 2–4 weeks |
| X (Twitter) | API v2 | Text + image + video (≤2:20) | Instant if Basic tier |
| Facebook Pages | Graph API | Same auth as IG | (covered by Meta review) |
| YouTube Shorts | Data API v3 | Vertical video upload | Instant |
| Threads | Threads API | Text-first | Instant if invited |
| LinkedIn | UGC API | Long-form text + image (non-fiction authors) | 1 week |

**Start app-review applications in week 1 of Phase 3** even though code lands in 3.x — review takes weeks.

**Schema:**
```sql
create table social_accounts (
  user_id uuid references profiles(id) on delete cascade,
  platform text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamptz,
  account_id text not null,
  handle text,
  target_locale text,  -- e.g. "sv-SE" if this account targets a specific country
  created_at timestamptz default now(),
  primary key (user_id, platform, account_id)
);
```

- Tokens encrypted with `pgsodium` or a Vault-managed key
- Refresh worker `apps/web/scripts/social-token-refresh-worker.ts` runs hourly
- Disconnect flow revokes upstream + clears row

### 3.2 Bulk content generation
- **Source picker:** book / chapter / paragraph / sentence (paste or select)
- **Output types:** Trailer (existing pipeline), Image carousel, Quote card, Audiogram, Podcast episode
- **Multi-language toggle:** generate one variant per `social_accounts.target_locale`
- **Bulk:** select 10 paragraphs → generate 10 posts → batch-edit captions → schedule or publish-all

### 3.3 Content calendar + scheduler
- Drag-drop calendar at `apps/web/src/app/(app-author)/author/marketing`
- BullMQ delayed jobs in existing `apps/web/scripts/social-publish-worker.ts`
- Failure handling: retry 3x exponential backoff → dead-letter → notify author + reconnect-CTA
- Optimal-time recommendation per platform (heuristic to start: IG 11am-1pm local, TikTok 6-9pm, etc. Refine with PostHog data after launch)

### 3.4 Performance tracking
- UTM links via new `utm_links` table (post → URL with `utm_source=ig&utm_campaign=<post_id>`)
- Pull-back metrics from each platform's API after 24h, 7d, 30d (delayed jobs)
- Conversion funnel: post impression → bok-detalj visit → purchase
- ROI display: "this trailer drove $X in sales"

---

## Phase 4 — Reader Experience Polish + Verkli Coin

### 4.1 Verkli Coin
**Schema:**
```sql
create table coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  delta integer not null,  -- positive earn, negative spend
  reason text not null,    -- 'streak', 'read', 'review', 'referral', 'cashback', 'spend_book', 'spend_pod', etc.
  ref_id uuid,             -- foreign key to source (book_id, review_id, etc.)
  created_at timestamptz default now()
);
create index on coin_transactions (user_id, created_at desc);
```

**Earn rules:**
| Action | Coins |
|---|---|
| Daily login (any read activity) | 1 / day, +5 at 7-day streak, +20 at 30-day, +50 at 90-day |
| Reading | 1 per chapter, max 5 / day (anti-cheese) |
| Review (>50 words) | 5 / review, max 10 / week |
| Referral converts to paying customer | 50 |
| Purchase cashback | 1 per $1 spent |

**Spend:** 100 coins = $1 off any purchase (book, chapter, POD, sub). Max 50% of cart in coins.

**Anti-abuse:**
- Server-side rate-limit per user/day
- Device + IP fingerprinting via PostHog
- Soft monthly cap: 500 coins earned per user
- Manual review trigger if user redeems >$50 coin-discount in a month

**UI:**
- Coin counter in reader topbar (next to avatar)
- Dedicated `/reader/coins` page: balance, recent transactions, "Earn more" tasks list
- Redeem modal in checkout: slider for coins to apply

### 4.2 Streaks & gamification
- `reading_streaks (user_id, current_streak, longest_streak, last_read_date)`
- Daily push/email reminder if streak at risk (streak ≥ 3 days, not read today by 8pm local time)
- Achievements: "First book finished", "10-day streak", "Read in 3 languages", "Reviewed 5 books", "Subscribed to your first author", "Bought print copy"
- Profile page badge gallery

### 4.3 Per-chapter comments + ratings
- `chapter_comments` table (mirrors existing `book_comments` schema)
- Per-chapter star rating (helps authors during serial release)
- Aggregate to book-level rating (weighted avg)
- Show reader avg rating + num ratings on book detail

### 4.4 Reader library polish
- Drag-drop shelves: Currently reading / Want to read / Finished / Custom
- Yearly reading goal (Goodreads-style): "Goal: 24 books / Progress: 11"
- Privacy toggle per shelf (private / friends-only / public)
- Follow other readers (opt-in profile visibility)

### 4.5 Push notifications
- Web Push (PWA already installable? Verify) + email backup
- Triggers:
  - New chapter from followed author or active subscription
  - Reply to your comment
  - Friend started a book you've read
  - Streak warning ("Read 1 more chapter to keep your 14-day streak")
  - Author goes live (when livestreams launch)

---

## Phase 5 — QA, Beta-gate, Soft Launch

### 5.1 Extend `npm run qa:beta`
Current stages (from MEMORY.md): env → tests → lint → english-default → no-placeholders → dead-code → build.

Add:
- `check:stripe-connect-live` — verifies all Stripe products + prices exist in prod, webhooks configured
- `check:moderation-policies` — ensures DMCA, ToS, privacy, refund pages render and link from footer
- `check:age-gate-coverage` — every adult book has age-gate enabled
- `check:i18n-coverage` — no missing translation keys in `(app-author)`

### 5.2 Synthetic E2E + load
- Playwright E2E suite for critical paths (already exists per MEMORY.md "E2E Testing Setup")
- Add: voice-clone roundtrip, scheduled-publish, PRO upgrade, coin redemption
- k6 or Artillery load test: 50 concurrent audiobook gens, 100 concurrent checkouts, 200 concurrent reads

### 5.3 Beta cohort + reader rollout
- Whitelist 50–100 authors via existing admin flow
- Founders discount coupon active for first 100 PRO signups
- Reader-side: feature flag `READER_OPEN_SIGNUP` with percentage rollout (10% → 50% → 100% over 7 days)

### 5.4 Status page
- BetterStack or UptimeRobot at `status.verkli.com`
- Monitors: app, API, Stripe webhook, ElevenLabs queue depth, BullMQ queue depth, DB latency
- Public incident timeline

### 5.5 Customer support
- Embed Crisp or Intercom on reader + author dashboards (not on marketing site)
- 12h SLA for first month
- Help center: 20 starter articles (signup, purchase, reader features, author features, billing, refunds)

### 5.6 Author onboarding email drip
Day 0: "Welcome — your first book in 4 steps"
Day 2: "Set up your cover & description"
Day 5: "Audiobook in your own voice — try voice cloning"
Day 9: "Connect socials & schedule your launch posts"
Day 14: "Your launch checklist"

### 5.7 Press kit + announce
- Landing page section "Featured in" (initially aspirational, fill in post-launch)
- Press kit at `/press`: logos, product shots, team bios, founder Q&A
- Announce blog post + author/reader explainer videos

---

# Cross-cutting concerns (apply to every phase)

## GDPR / data privacy
- [ ] Self-serve data export at `/reader/settings/data-export` and `/author/settings/data-export` — generates JSON + media zip via background job, emails download link
- [ ] Self-serve account delete with 30-day soft-delete, then hard purge
- [ ] Cookie consent banner (Cookiebot or homegrown) — only essential cookies until consent
- [ ] Delete-from-ElevenLabs flow when author deletes voice
- [ ] DPA with: Stripe, Supabase, ElevenLabs, OpenAI/Anthropic, Resend, PostHog, Sentry, Mux (later)

## SEO
- [ ] Sitemap at `/sitemap.xml` covering: home, all public author profiles, all published books
- [ ] `robots.txt` allowing public + disallowing auth/admin/api
- [ ] Open Graph + Twitter card meta on every public page (book cover for book pages, author photo for author pages)
- [ ] Structured data (JSON-LD): `Book` schema with author, isbn, offers; `Person` for author profiles
- [ ] Hreflang alt-tags when book detail page exists in multiple languages

## Observability
- [ ] Sentry alerts on critical paths: payment webhook errors, audiobook job failure rate >5%, signup error rate >1%
- [ ] PostHog dashboards: signup funnel, purchase funnel, author publish funnel
- [ ] BullMQ dashboard exposed at admin-only `/admin/queues` (Bull Board)
- [ ] Vercel Analytics + Speed Insights already wired
- [ ] On-call rotation (just you + co-founder initially); PagerDuty or Better Stack alerts

## Backup / DR
- [ ] Supabase daily backups (verify retention policy: 7d for free, 30d for pro tier)
- [ ] Manual DB snapshot before each migration in `mvp-wip → main` merge
- [ ] Stripe data is authoritative source of truth for billing — don't try to mirror it
- [ ] Audio + cover assets in Supabase Storage with versioning enabled
- [ ] Recovery drill before launch: simulate "DB lost, restore from yesterday" → time-to-recovery target ≤ 4 hours

## Email deliverability
- [ ] SPF, DKIM, DMARC for `verkli.com` and `mail.verkli.com` (Resend setup)
- [ ] Warmup new sending domain with low-volume drips first
- [ ] Bounce + complaint handling: pause sending to addresses with hard bounces or spam complaints
- [ ] Transactional vs marketing separation: separate IP / sub-domain for marketing (newsletters)

## App Store launch (post-launch v1.4+)
- [ ] React Native or Capacitor wrapping decision (likely Capacitor for fast launch given web-first)
- [ ] iOS: Apple in-app purchase compliance — Apple takes 30%, OR if "reader app" exemption applies we can link to web checkout (Reader app exemption granted to Spotify, Netflix, etc. — apply for it)
- [ ] Android: Google Play 30% or web-checkout link
- [ ] App Store Optimization (ASO) — keywords, screenshots, preview video
- [ ] Push notification certs (APNS, FCM)

## Marketing site updates (continuous)
- [ ] Replace "Coming soon" placeholders with live features as they ship
- [ ] Add "For Authors" / "For Readers" funnels
- [ ] Testimonial section populated from real beta users post-launch
- [ ] Case studies (post-launch, with first 3 successful authors)

---

# Critical Files & Reuse Map

(All paths on `mvp-wip-2026-03-18` branch unless noted.)

| Function | Files to reuse / extend |
|---|---|
| Stripe billing/checkout | `apps/web/src/lib/payments/stripe.ts`, `apps/web/src/lib/payments/stripe-billing.ts` |
| Stripe webhook | `apps/web/src/app/api/billing/webhook/route.ts` |
| Author subs (template for PRO) | `supabase/migrations/20260408100000_author_subscriptions.sql`, `apps/web/src/components/.../SubscribeAuthorButton.tsx` |
| TTS provider abstraction | `apps/web/src/lib/tts/elevenlabs-tts-provider.ts`, `apps/web/src/lib/tts/tts-provider.ts` |
| BullMQ workers (extend, don't replace) | `apps/web/scripts/{audiobook,translation,marketing,notifications,social-publish,recommendations,combined,import}-worker.ts` |
| Auth gating | `requireAuthorRoleForApi`, `apps/web/src/lib/auth/require-author.ts` |
| Admin auth | `checkAdmin`, `apps/web/src/lib/admin-auth.ts` |
| Feature flags | `apps/web/src/lib/flags.ts` |
| Rate limiting | `apps/web/src/lib/rate-limit/` |
| Trailer/AI content | `apps/web/src/lib/ai/trailer-generation/` (generalize to multiple content-types) |
| Reader read page | `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/` |
| Author dashboard | `apps/web/src/app/(app-author)/author/` |
| QA gate | `apps/web/scripts/qa-beta.mjs` (extend with new stages) |
| Email templates | `apps/web/src/lib/emails/` (Resend) |
| Notifications system | `apps/web/src/lib/notifications/` + `apps/web/scripts/notifications-worker.ts` |
| POD pricing pattern | `apps/web/src/lib/print-on-demand/index.ts` |
| Audit logging | `apps/web/src/lib/audit.ts` (`audit_log` table) |
| Content reports | `content_reports` table — extend with `type = 'dmca'` |

---

# Verification — End-to-end test plan per phase

## Phase 0
- [ ] E2E: Stripe Connect onboarding (testmode) → KYC complete → first simulated payout
- [ ] E2E: Book published in 3 languages → reader switches → text + audio both update
- [ ] E2E: Adult book → first access requires age gate → choice persists
- [ ] DMCA form submits → email arrives → admin sees report
- [ ] `/api/search?q=<...>` p95 ≤ 200ms with seeded dataset
- [ ] `npm run qa:beta` green (with new stages)

## Phase 1
- [ ] E2E: Voice cloning roundtrip (record sample → clone → generate audiobook chapter → play)
- [ ] E2E: Proofread chapter → diff view → accept-all → changes persist
- [ ] Cron test: schedule chapter for "in 5 min" → worker publishes within 5–10 min
- [ ] Quota: Free user attempts audiobook → blocked → upfront purchase → unblocked

## Phase 2
- [ ] E2E: Free → upgrade to PRO → quota visible → cancel → quota persists until period end
- [ ] PRO+ annual prepay → invoice correct → 12-month commitment locked
- [ ] Webhook replay: `customer.subscription.deleted` → tier downgraded → quota enforces

## Phase 3
- [ ] E2E per platform: connect IG → generate post → publish → poll for permalink URL
- [ ] Failure: revoke token externally → next post → graceful failure + "reconnect" CTA
- [ ] Bulk: 10 paragraphs → 10 carousels → schedule across 10 days → first publishes correctly

## Phase 4
- [ ] E2E: 7-day streak → +5 coin bonus → spend in checkout → discount applied
- [ ] Anti-abuse: 10 bot accounts spam reads → rate-limit triggers → coins denied
- [ ] Web push: notification fires → ServiceWorker handles → click opens correct URL

## Phase 5 — Soft launch
- [ ] Synthetic monitoring 24/7 on purchase + publish funnels
- [ ] Sentry error budget < 0.5% in week 1
- [ ] PostHog: ≥ 70% of new readers complete first read within 5 min of signup
- [ ] Status page UP, no incidents in week 1

---

# Dependencies, risks, assumptions

**External dependencies:**
- ElevenLabs Creator plan ($22/mo + use-based) — required Phase 1
- Stripe platform account + Stripe Connect approval — required Phase 0
- Meta + TikTok app-review — start Phase 3 week 1, code lands later
- Supabase Pro plan (for daily backups, larger DB) — required pre-launch
- Resend transactional + marketing — already wired
- Anthropic API key (Claude Haiku for proofreading) — Phase 1
- Perspective API key (Google) — Phase 0 moderation

**Risks:**
- **Voice cloning ToS + GDPR** — explicit consent; deletion request must remove voice from ElevenLabs within 30 days. Update ToS before Phase 1.
- **Adult content + Stripe** — Stripe restricts adult content. If we keep OnlyFans-style adult subs, may need separate Stripe account or specific merchant agreement. Validate before Phase 0.
- **Social app-review timelines** — IG/TikTok can take 4–6 weeks. Apply early; ship Phase 3 features behind feature flag if approval delayed.
- **ElevenLabs cost runaway** — set hard monthly cap per author; alert at 80% usage.
- **Mass-cancellation event** if PRO doesn't deliver value in month 1 — track activation metric (first PRO-feature use within 7d of signup); if <50%, double down on onboarding before scaling.
- **Audiobook storage cost** — ~5MB/min. 1000 authors × 10h × 5MB/min = 3TB. Plan Supabase Storage tier accordingly.
- **Migration `mvp-wip → main`** is a big merge. Consider rolling forward (rename `mvp-wip` to `main` after backing up old `main` to a tag) instead of merging.

**Assumptions:**
- 30% platform cut accepted (matches Apple, Spotify, Patreon)
- Reader currency USD initially; SEK/EUR later via Stripe currency conversion
- Beta cohort 50–100 authors enough for week-1 signal
- Soft-launch readers find us via author socials + waitlist (no paid acquisition until v1.1)
- Single-region (EU) Supabase deploy at launch; multi-region later

---

# Idea bank — beyond the user's list

Sorted by impact / effort. These are not committed scope — they're queued for prioritization after each phase ships.

### High impact, low effort
- **Pre-orders with early-bird pricing** — readers lock 20% discount before release; uses existing Stripe infra.
- **Gift books** — "send to a friend" → claim email link. Big referral driver.
- **Goodreads-style yearly reading goal** — gamification almost free; retention driver.
- **Dynamic cover A/B testing** — generate 3 variants, AI picks winner from CTR. We already have 4-cover generation.
- **Audiobook chapter bookmarking + sleep timer** — small UX wins people genuinely use.
- **Smart recommendations** — collaborative filtering off PostHog event data; bootstrap from beta.

### High impact, medium effort
- **AI narrator switching mid-book** — reader picks voice from author's voice library (when author opts in). Differentiator.
- **Audio-text sync (karaoke mode)** — highlight text as audiobook plays. ElevenLabs returns timestamps; we render. No competitor has this at our price.
- **Translation memory + glossary** — author builds termbank ("Char-name X = Xavier in EN"); pipeline learns. Big quality win for series.
- **Beta-reader early access tier** — between free and paid: subscribers get drafts in exchange for feedback. Builds community + improves the book.
- **Author bundles** — buy 3 books from same author for -20%. Auto-generated cross-sell.
- **Trailer remix marketplace** — authors license each other's music/voiceover for trailers (mini Splice/Artlist).

### Game-changers (medium-high effort)
- **AI ghostwriting assist** — "expand this paragraph", "write in chapter-2 style", "generate dialogue". Controversial but competitors will have it.
- **Interactive fiction / branching** — readers choose path. Editor-side complex but USP. Likely v2.
- **Verkli Reader Pass** — Spotify-style $14.99/mo unlimited reading on opt-in books. Authors get revenue share via reads. Big strategic call.
- **Story-shopping ads** — paid ads where the creative IS a book excerpt with "Continue reading →" CTA. Higher conversion than traditional creative.
- **Localization marketplace** — extend proofreader marketplace to "find a translator" for premium human translation.
- **Author cohort programs** — paid 6-week bootcamp for aspiring authors (PRO included). Own revenue stream + funnel.
- **API + SDK for 3rd party** — other reader apps integrate Verkli books. Distribution leverage.

### Speculative / future
- **AR book covers** — point phone at print copy, cover animates (Niantic SDK or WebAR).
- **Voice-driven discovery** — "Hey Verkli, recommend a thriller in Spanish".
- **Reader-funded book commissions** — Kickstarter-light: readers crowdfund a sequel; Verkli holds escrow.
- **Web3 ownership tier** — collectible signed editions with on-chain proof. Hype-cyclical; keep as experiment.

---

# Appendix A — Required environment variables

(Add to `.env.example`; document in README.)

```
# Existing (verify still set)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
NEXT_PUBLIC_AUDIOBOOK_ENABLED      # currently false; flip in Phase 1
NEXT_PUBLIC_TRANSLATIONS_ENABLED   # currently true
NEXT_PUBLIC_MARKETING_ENABLED      # currently true
NEXT_PUBLIC_DISCOVERY_ENABLED

# New for roadmap
ELEVENLABS_API_KEY                 # Phase 1
ELEVENLABS_DEFAULT_MODEL=eleven_multilingual_v2
ANTHROPIC_API_KEY                  # Phase 1 (proofreading)
PERSPECTIVE_API_KEY                # Phase 0 (moderation)
STRIPE_CONNECT_PLATFORM_ID         # Phase 0
STRIPE_PRO_MONTHLY_PRICE_ID        # Phase 2
STRIPE_PRO_ANNUAL_PRICE_ID         # Phase 2
STRIPE_PRO_PLUS_MONTHLY_PRICE_ID   # Phase 2
STRIPE_PRO_PLUS_ANNUAL_PRICE_ID    # Phase 2

# Social OAuth (Phase 3)
META_APP_ID
META_APP_SECRET
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
TWITTER_CLIENT_ID
TWITTER_CLIENT_SECRET
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET

# Push notifications (Phase 4)
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT=mailto:hello@verkli.com

# Status / support
INTERCOM_APP_ID                    # or CRISP_WEBSITE_ID
BETTERSTACK_STATUS_PAGE_ID
```

---

# Appendix B — Migration order (Phase 0–4)

Run in this order on `mvp-wip-2026-03-18`:

1. `{ts}_stripe_connect_payouts.sql` — `author_payout_accounts`, columns on `profiles`
2. `{ts}_age_gates_dmca.sql` — `is_adult_content`, `age_verified_at`, DMCA report type
3. `{ts}_search_fts.sql` — tsvector + GIN indexes + triggers
4. `{ts}_author_voices.sql` — voice library, voice consents
5. `{ts}_chapter_scheduled_publish.sql` — `chapters.scheduled_publish_at`
6. `{ts}_pro_tiers_quota.sql` — `pro_tier` enum, `author_usage_periods`, `author_one_off_purchases`
7. `{ts}_social_accounts.sql` — Phase 3 OAuth tokens
8. `{ts}_utm_links.sql` — Phase 3 attribution
9. `{ts}_verkli_coin_streaks.sql` — `coin_transactions`, `reading_streaks`, `achievements`
10. `{ts}_chapter_comments.sql` — Phase 4 per-chapter comments + ratings

Each migration must:
- Be idempotent (`if not exists`)
- Have RLS policies defined
- Have rollback documented in the same file (commented `-- rollback:` section)

---

# Appendix C — 8-week summary view

| Week | Phase | Major shippables |
|---|---|---|
| 1 | 0 | Stripe Connect, multi-lang switcher, age gates, DMCA, i18n, FTS |
| 2 | 1 | Audiobook ON, voice cloning, proofread, scheduled release, per-chapter pricing |
| 3 | 1 + 2 start | Editor polish; PRO Stripe SKUs |
| 4 | 2 + 3 start | Quota + badges; IG/TikTok OAuth |
| 5 | 3 + 4 start | Bulk content + calendar; Verkli Coin |
| 6 | 4 + 5 start | Streaks + per-chapter comments + push; QA stages |
| 7 | 5 | Beta cohort onboarding, founders discount, status page, support |
| 8 | 5 | Press, soft launch, monitoring |

Post-launch (parallel tracks):
- v1.1 (weeks 9–12): Affiliate + paid ads
- v1.2 (weeks 13–16): Collab + newsletter polish + reading clubs
- v1.3 (weeks 17–22): Livestreams + merch + proofreader marketplace + AI Reader Companion
