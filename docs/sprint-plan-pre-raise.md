# 6-Week Plan — Pre-Raise + Soft-Launch Capability

> **Owner:** @SveaHallinder · **Status:** Draft, 2026-04-29
> **Branch:** `mvp-wip-2026-03-18`
> **Companion docs:** `ROADMAP.md` (8-week roadmap), `audit.md`, `db-audit.md`, `sprint-0.5-deferred.md`

## Goal in one sentence

In 6 weeks, we can either run a 10-minute investor demo that proves the
**translate → voice-clone → karaoke-listen → marketing → sale → payout**
loop on at least three live showcase authors, **or** soft-launch a 50-author
cohort if the raise slips. Same code path; same gate.

---

## Why this plan diverges from ROADMAP

ROADMAP is an 8-week soft-launch plan optimised for cohort metrics. This is
a 6-week pre-raise plan optimised for **demo polish + minimal viable
breadth**. Differences:

| ROADMAP says | This plan says | Why |
|---|---|---|
| Phase 3: 7 social platforms | **One platform deep** (TikTok or X) | Investor demo needs *one* believable post-to-purchase loop, not 7 OAuth dashboards |
| Phase 4: Verkli Coin in 6 weeks | **Defer Coin to post-raise** | Engagement-driver, not pitch-driver. Won't move investor needle. |
| Phase 1.2: AI proofread | **Defer to post-raise** | Not on the demo path. |
| Phase 1.5: Editor evaluation | **Lock current editor** | Tangential to the loop being demo:ed. |
| Phase 2.2: Quota & metering | **Defer enforcement** | Stripe SKUs visible at signup is enough; quota policing is post-PMF. |
| Phase 0 in 1 week | **Phase 0 spread across 5 weeks** | Realistic — 0.1 alone is 2 days. |
| Karaoke audio-text sync in idea bank | **Promoted to Week 2** | THE wow moment of the demo. |

What we *don't* compromise on:
- Stripe Connect (no payouts → no platform)
- Voice cloning quality bar (the moat)
- Karaoke sync (the wow)
- Multi-language reader switcher (the table-stakes for "international")
- DMCA + age gate UX (legal must)

---

## Critical path dependencies

```
ElevenLabs Swedish validation  ─┐
                                ├─→ Voice cloning end-to-end  ─→ Karaoke sync  ─┐
Stripe Connect onboarding   ─→ Payout demo                                       ├─→ DEMO READY
Multi-lang switcher  ─→ Multi-language audiobook demo  ─────────────────────────┤
TikTok OAuth  ─→ Marketing-to-sale loop  ───────────────────────────────────────┘
```

~~Single biggest risk: ElevenLabs Swedish quality.~~ **Resolved 2026-04-29:**
the existing connected voice on the team's ElevenLabs account produces
high-quality Swedish. ElevenLabs is locked as the voice-cloning provider
for both EN and SE.

---

## Week-by-week

### Week 1 (now): Money, legal, and Swedish validation

**Theme:** Unblock revenue + answer the one open question that could pivot strategy.

| Day | Owner-task | Why now |
|---|---|---|
| Mon | Apply Sprint 0.5 FK indexes to staging; capture before/after `EXPLAIN ANALYZE` per `docs/perf-fk-indexes.md` | Foundation; FTS in week 5 needs this |
| Mon–Wed | **Stripe Connect onboarding flow** — `accountLinks.create`, return URL, ledger v0 (pending/available/paid_out), webhook `account.updated` | Largest single unblocker. Without this, no author can sell. |
| Wed–Thu | **Multi-lang reader switcher UI** — flag toggle on `/reader/read/[chapterId]`, persist in `reader_preferences.preferred_language[bookId]`, deep-link query param | Cheap and high-impact; needed for multilingual audiobook demo |
| Fri | DMCA scaffolding (`/legal/dmca` + `/api/legal/dmca-takedown` + `content_reports.type='dmca'`); age-gate modal scaffold | Legal table stakes; doesn't need to be polished yet |

**Definition of done — Week 1:**
- [ ] FK indexes live in staging, perf delta documented
- [ ] Test author completes Stripe Connect onboarding in sandbox; ledger row visible
- [ ] Reader can switch language on a multi-lang book; persists across sessions
- [ ] DMCA form delivers email + creates `content_reports` row; age-gate modal renders

---

### Week 2: The moat — voice cloning + karaoke

**Theme:** Build the demo wow-moment. Everything else is supporting.

| Day | Task |
|---|---|
| Mon–Tue | **ElevenLabs voice cloning end-to-end** — record 90s sample in browser via MediaRecorder, POST `/v1/voices/add` (Instant Voice Cloning), persist `elevenlabs_voice_id` on new `author_voices` table, ToS consent in `voice_consents` |
| Tue | New migration: `{ts}_author_voices.sql` (incl. RLS + delete-cascades to ElevenLabs via worker job) |
| Wed | Audiobook worker accepts `voice_id` from job payload; produces multilingual audiobook for any book version on the same voice |
| Wed–Thu | **Karaoke audio-text sync** — capture per-word timestamps from ElevenLabs response (already returned), persist alongside audio asset, render layer in reader page that highlights current word as audio plays |
| Fri | Demo-quality polish: smooth highlight transitions, scrolls when out of viewport, falls back gracefully when timestamps missing |

**Definition of done — Week 2:**
- [ ] Author records → clones → generates EN+SV+ES audiobook chapter in same voice in <5 min
- [ ] Reader opens chapter, hits play, watches words light up in sync — no audio drift after 30 min
- [ ] Voice deletion request removes from ElevenLabs (test in sandbox)

---

### Week 3: Monetization layer

**Theme:** Pricing that's visible, plausible, and converts.

| Day | Task |
|---|---|
| Mon | Stripe products + prices (sandbox first): Free / PRO ($29/mo, $290/yr) / PRO+ ($99/mo, $990/yr) |
| Mon–Tue | `profiles.pro_tier` enum + checkout integration + `customer.subscription.*` webhook handlers |
| Tue | One-off SKUs: Audiobook hour ($5), Translation per language ($20), Trailer ($9), Carousel ($2.99). `author_one_off_purchases` table |
| Wed | PRO badge component + visibility (book cards, profile, comments, search) + reader filter "PRO authors only" |
| Wed–Thu | Per-chapter pricing UI in editor (existing `chapters.price_amount` field) — bulk-set + override warning |
| Fri | Pricing page rebuild: 3-column comparison + lightweight ROI calc + founders-discount coupon |

**Definition of done — Week 3:**
- [ ] Author can subscribe to PRO monthly → `profiles.pro_tier='pro'` → PRO badge appears
- [ ] One-off Audiobook-hour purchase grants single audiobook generation
- [ ] Founders coupon (25% lifetime, 100 first authors) works once per user

---

### Week 4: Marketing — one platform, deep

**Theme:** Prove the post-to-sale attribution loop. One platform > seven half-built.

**Default choice:** TikTok (4-week app review average, viral upside, Verkli's natural distribution channel for fiction). Fallback: X (instant approval, lower viral but easier).

| Day | Task |
|---|---|
| Mon | TikTok app-review submitted with stub manifest URL (review takes weeks; submit while we build) |
| Mon–Tue | OAuth + token storage in `social_accounts` (encrypted via `pgsodium`); refresh worker scaffolding |
| Tue–Wed | Posting endpoint: video upload + caption, status polling, success → `marketing_posts.platform_post_url` |
| Wed | Bulk content generation panel: pick book/chapter/paragraph → trailer / carousel / audiogram (reuse existing `lib/ai/trailer-generation`) |
| Thu | Content calendar view (drag-drop placeholder OK) → BullMQ delayed jobs in `social-publish-worker.ts` |
| Fri | UTM links table + post-back metric pulls (24h/7d/30d) + dashboard widget "this trailer drove $X" |

**Definition of done — Week 4:**
- [ ] Author connects TikTok → publishes generated trailer → permalink lands in `marketing_posts`
- [ ] Reader clicks UTM link → completes purchase → attribution row links sale to post
- [ ] Author dashboard shows "ROI per post" widget

---

### Week 5: Foundation finish + i18n + search

**Theme:** Close the legal/compliance gaps and ship the search readers will use.

| Day | Task |
|---|---|
| Mon–Tue | next-intl setup: `messages/{en,sv}.json`, wrap `(app-author)` only, migrate hardcoded SV strings to `t('...')` |
| Tue | Extend `check:english-default` to whitelist author dashboard, fail elsewhere |
| Wed–Thu | Postgres FTS migration: tsvector on `books.title/description/tags` + `profiles.display_name/bio` + GIN indexes + sync trigger |
| Thu | Search route `/api/search?q=...&type=...` with `ts_rank_cd` |
| Thu–Fri | Reader topbar `<GlobalSearchBar>` with debounced autocomplete |
| Fri | Age-gate finish: `is_adult_content` on books, modal on first adult-flagged access, "remember 30 days" |

**Definition of done — Week 5:**
- [ ] `npm run check:english-default` green; toggling SV in author dashboard works; reader stays EN
- [ ] Search "harry potter" returns books before authors; p95 ≤ 200ms on seeded 10k books dataset
- [ ] Adult-flagged book gates first access; choice persists 30 days

---

### Week 6: Polish, prod-orchestrate, demo prep

**Theme:** Take the rough edges off, deploy workers properly, onboard the showcase authors.

| Day | Task |
|---|---|
| Mon | Worker production deploy (Fly.io per `docs/worker-deployment.md`): one Fly service per queue, restart on-failure, region pinned to Supabase |
| Mon–Tue | Pino logger rolled out to all 7 workers (Sprint 0.5 D5 finisher); correlation-id per job; Sentry multistream verified |
| Tue | CSP `Content-Security-Policy-Report-Only` shipped (report endpoint at `/api/csp-report`); start the soak |
| Wed | Status page setup (BetterStack at `status.verkli.com`) + monitors on app, Stripe webhook, ElevenLabs queue depth, BullMQ depth |
| Wed–Thu | **Showcase-author onboarding** — invite 5–10 authors (mix of EN + SV), help each publish 1 multilingual book + clone voice + auto-post one trailer |
| Fri | Demo dress rehearsal — full 10-minute investor flow run twice. Capture screen recording as backup. Patch any rough spot. |

**Definition of done — Week 6:**
- [ ] All 7 workers running on Fly.io with auto-restart; killed-machine test passes
- [ ] At least 3 showcase authors have a complete book with audiobook + karaoke + 1 social post live
- [ ] Demo runs end-to-end in <12 min on a clean account; rehearsed twice

---

## The 10-minute investor demo (script)

> Run on a clean account each time. Two browser windows side-by-side: author + reader.

1. **(0:00–1:00) Author signup** — pick role, complete onboarding, land in `/author/home`. Show how short this is.
2. **(1:00–3:30) Translate + clone** — paste manuscript, hit "Translate to English, Spanish, German" (use existing pipeline). While that runs, click "Clone my voice", record 90s sample, submit. Both jobs run in parallel; Show the queue dashboard at `/admin/queues`.
3. **(3:30–5:30) Audiobook + multilingual** — translation + voice clone complete. Click "Generate audiobook for all 3 languages with my voice". Show 3 audiobook jobs spin up. While generating, switch to reader window.
4. **(5:30–7:00) Reader experience** — open the same book on reader side, switch language to English. Hit play. **Karaoke sync lights up.** Switch to Spanish mid-way — text + audio swap, scroll position preserved. *This is the wow moment.*
5. **(7:00–8:30) Marketing portal** — back to author. Click "Generate trailer + post to TikTok". Show the TikTok post in a third window. Show the UTM-link sale come in (test purchase pre-staged).
6. **(8:30–10:00) Author dashboard** — close the loop: ledger shows the sale, 30% platform cut, net to author, payout pending. Show the per-language sales breakdown. End on the PRO upgrade nudge ("upgrade to skip per-feature pricing").

Total: 10 minutes. Every step uses real product, no mocks.

---

## Risk register (specific to this 6-week window)

| Risk | Mitigation | Trigger to act |
|---|---|---|
| Stripe Connect KYC slow in sandbox | Use Stripe's accelerated test fixtures; pre-populate test KYC docs | Week 1 Wednesday |
| TikTok app-review delays past week 6 | Switch to X (instant approval); demo on X instead | Week 4 Monday — submit TikTok review *and* prep X fallback |
| Karaoke timestamp drift on long chapters | Re-sync on every play event; cap chapter length for demo to 15 min | Week 2 Friday |
| Showcase authors don't show up | Pre-recruit during Weeks 1–4 (5h budget), don't wait until Week 6 | Week 4 |
| `mvp-wip → main` merge breaks marketing site | Use rolling-forward rename per ROADMAP recommendation; tag old `main` first | Week 5 Friday |
| Investor wants to see *current* metrics not just demo | Pre-build a small PostHog dashboard with real signup/purchase funnel from showcase authors | Week 6 |

---

## What's deferred to post-raise (and why it's OK)

| Item | Defer to | Why OK |
|---|---|---|
| Verkli Coin / streaks / achievements | Post-raise weeks 9–12 | Engagement, not acquisition; needs reader cohort to test |
| AI proofread | Post-raise | Author retention play; doesn't affect demo |
| Per-chapter scheduled release | Post-raise | Niche feature; can demo with manual publish |
| Affiliate portal | Post-raise (v1.1) | Acquisition channel only relevant after PMF |
| All non-TikTok socials | Post-raise (v1.1) | Demo doesn't need 7 platforms |
| Newsletters dashboard polish | Post-raise | Send works; dashboard is internal |
| Quota enforcement | Post-raise | PRO SKU is visible; metering follows |
| Rich text editor migration | Whenever | Existing editor good enough for demo |
| Account deletion automation | Post-raise (D3) | Soft-delete column + RLS already in; full erasure can be manual |
| Soft-delete SELECT-site rollout | Post-raise (D2) | RLS RESTRICTIVE policy is the backstop; correctness work staged |

---

## Definition of done — week 6

The plan succeeds if **all** of the following are true Friday of week 6:

1. A clean test account can complete the 10-min investor demo without any "let me just refresh" moments.
2. At least 3 showcase authors have shipped a real multilingual book and posted one trailer to TikTok (or X).
3. `npm run qa:beta` passes on `mvp-wip-2026-03-18`.
4. Workers run on Fly.io; killed-machine test recovers within 30s.
5. Stripe Connect end-to-end works in sandbox: KYC → first sale → payout simulation.
6. Sentry alerts are wired for: payment webhook errors, audiobook job failure rate >5%, login error rate >1%.
7. Status page is live at `status.verkli.com` (or subdomain).
8. Soft launch can be triggered with a single env-flag flip if the raise slips.

If any of these are red, the demo is delayed by a week — not weakened.
