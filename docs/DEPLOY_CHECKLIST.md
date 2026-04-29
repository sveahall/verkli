# Deploy Checklist — Manual Steps

> Single artefact for everything that **only the founder** can do. Run from
> top to bottom when you're ready to ship the pre-raise demo / soft launch.
> Estimated total time: **3–6 hours** depending on Stripe + DNS turnaround.
>
> Generated: 2026-04-29 · Branch: `mvp-wip-2026-03-18`

---

## Order of operations

1. Vendor accounts + plans (5–15 min)
2. Stripe Dashboard (30–60 min)
3. ElevenLabs (5 min — already mostly done)
4. Resend domain + DNS (15 min + DNS propagation)
5. Supabase migration apply (10 min staging + 10 min prod)
6. Vercel env vars (15 min)
7. Status page + observability (30 min)
8. Verify (60 min smoke test)

You can skip §1 and §3 if accounts already exist.

---

## 1. Vendor accounts + plans

| Vendor | Plan | Reason |
|---|---|---|
| Stripe | Standard + Connect Express enabled | Author payouts |
| Supabase | Pro tier | Daily backups + larger DB |
| Upstash Redis | Pro (or stay on free during demo) | BullMQ durability |
| ElevenLabs | Creator ($22/mo) — already on this | Voice cloning + Multilingual v2 |
| Anthropic | API access | Phase 1.2 proofread (deferred — needed once that ships) |
| Resend | Custom domain enabled | Transactional + DMCA emails |
| BetterStack (or UptimeRobot) | Free | Status page + monitors |
| Sentry | Already wired (`@sentry/nextjs`) | Already in env |
| PostHog | Already wired | Already in env |

**DPAs to sign:** Stripe, Supabase, Upstash, ElevenLabs, Anthropic, Resend, PostHog, Sentry. Most have one-click DPAs in their dashboard.

---

## 2. Stripe Dashboard

> Most-blocking step — Stripe Connect needs platform-level config that has to be done by hand.

### 2.1 Enable Connect

- [ ] Stripe Dashboard → Connect → Settings → Enable Connect
- [ ] Choose **Express** as the default account type
- [ ] Platform branding: name, support email, logo
- [ ] Statement descriptor: `VERKLI` (or your preference; max 22 chars)
- [ ] Privacy URL: `https://verkli.com/legal/privacy`
- [ ] Terms URL: `https://verkli.com/legal/terms`
- [ ] DMCA / contact: `legal@verkli.com`

### 2.2 Webhook for `account.updated`

- [ ] Stripe Dashboard → Developers → Webhooks → Add endpoint
- [ ] Endpoint URL: `https://<your-domain>/api/stripe/webhook`
- [ ] Events to send: `account.updated` (in addition to anything you already listen for: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`)
- [ ] Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in Vercel
  > **Note:** if you already have a webhook for the main events, just check that the same signing secret is reused. Verkli only has one webhook handler at `/api/stripe/webhook`.

### 2.3 Tax forms

- [ ] Stripe Dashboard → Connect → Tax Forms → Enable for platform
- [ ] Configure 1099-NEC threshold ($600 USD) for US authors
- [ ] Configure SE-equivalent (`KU 10 / Kontrolluppgift`) for Swedish authors

### 2.4 Adult content (per your earlier note)

- [ ] No special config needed. Verkli does *not* host pornographic content;
      sex scenes in fiction are within Stripe's standard merchant agreement.
      Document the position in `docs/legal/stripe-content-policy.md` (one
      paragraph) so you have a paper trail if Stripe support asks.

### 2.5 Phase 2 — PRO products (when Phase 2 lands)

These don't exist yet in code; you'll add them once `Phase 2 Stripe SKUs` ships:

- [ ] Stripe Dashboard → Products → Add new product
- [ ] Verkli Free / PRO / PRO+ — monthly + annual prices each
- [ ] Copy price IDs into Vercel: `STRIPE_PRO_MONTHLY_PRICE_ID`, etc.
- [ ] Founders coupon: 25% off, max 100 redemptions

---

## 3. ElevenLabs

- [ ] Confirm API key is in `.env.local` (you said it's connected)
- [ ] If launching Professional Voice Cloning: upgrade Creator → Pro plan
- [ ] **Hard monthly cost cap:** Set in Vercel env: `ELEVENLABS_MONTHLY_BUDGET_USD` (e.g. `500`) — code path lands when audiobook worker is rolled out to authors
- [ ] Per-author hard cap also recommended via `ELEVENLABS_PER_AUTHOR_MONTHLY_BUDGET_USD`

---

## 4. Resend + DNS

- [ ] Resend Dashboard → Domains → Add `verkli.com`
- [ ] Add SPF, DKIM, DMARC records to your DNS provider per Resend's guide
- [ ] Verify domain
- [ ] Set `RESEND_FROM_EMAIL=hello@verkli.com` in Vercel
- [ ] Set `LEGAL_EMAIL=legal@verkli.com` in Vercel (DMCA notices route here)
- [ ] Optional: separate sub-domain for marketing emails (`mail.verkli.com`)
      with its own SPF/DKIM/DMARC and *separate Resend audience* — keeps
      transactional reputation isolated from newsletter blasts

---

## 5. Supabase migration apply

> Run all pending migrations in one batch when the code branch is reviewed.

Migrations added since last apply:

| File | Purpose |
|---|---|
| `20260429120000_fk_indexes.sql` | 34 missing FK indexes (Sprint 0.5) |
| `20260429121000_soft_delete_columns.sql` | Soft-delete on 11 tables + RLS backstop |
| `20260429122000_audit_log.sql` | Audit log + `record_audit` RPC |
| `20260429130000_stripe_connect_payouts.sql` | `author_payout_accounts` |
| `20260429140000_dmca_age_gate.sql` | DMCA reason code, `is_adult_content`, `age_verified_at` |
| `20260429150000_search_fts.sql` | tsvector + GIN on books + profiles |
| `20260429160000_voice_cloning_and_karaoke.sql` | `author_voices`, `voice_consents`, `chapter_audio_timestamps` |

Apply order:

```bash
# 1. Staging first
cd apps/web
supabase db push --db-url "$STAGING_DB_URL"

# 2. Capture before/after on hot paths (per docs/perf-fk-indexes.md)
psql "$STAGING_DB_URL" -f scripts/perf/fk-baseline.sql > /tmp/staging-after.txt
diff scripts/perf/fk-baseline-expected.txt /tmp/staging-after.txt

# 3. Smoke test on staging (see §8 below)

# 4. Production
supabase db push --db-url "$PROD_DB_URL"
```

> Each migration has `IF NOT EXISTS` / `DROP POLICY IF EXISTS` patterns so
> they're replay-safe. Each ends with a `-- rollback:` comment block if you
> need to back one out.

---

## 6. Vercel env vars

Set in Vercel Dashboard → Project → Settings → Environment Variables.
Apply to **Production** and **Preview** (staging) separately.

### Existing — verify still set

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
SENTRY_DSN
NEXT_PUBLIC_SENTRY_DSN
ELEVENLABS_API_KEY
NEXT_PUBLIC_SITE_URL
REDIS_URL
```

### New from Sprint 0 + 0.5 + Week 1

```
# PostHog (Sprint 0)
POSTHOG_API_KEY=...
POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Stripe Connect (Week 1)
STRIPE_CONNECT_DEFAULT_COUNTRY=SE          # or US — pick primary cohort

# Sprint 0 demo flag — leave OFF in prod
NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED=false

# Donations gate (Sprint 0.5) — set to true ONLY when donations are ready
NEXT_PUBLIC_DONATIONS_ENABLED=false

# Legal email (Week 1)
LEGAL_EMAIL=legal@verkli.com

# Phase 1 — voice cloning hard caps
ELEVENLABS_MONTHLY_BUDGET_USD=500
ELEVENLABS_PER_AUTHOR_MONTHLY_BUDGET_USD=50
```

### When Phase 2 / Phase 3 lands (later)

```
# Phase 2 — PRO Stripe SKUs
STRIPE_PRO_MONTHLY_PRICE_ID=...
STRIPE_PRO_ANNUAL_PRICE_ID=...
STRIPE_PRO_PLUS_MONTHLY_PRICE_ID=...
STRIPE_PRO_PLUS_ANNUAL_PRICE_ID=...

# Phase 1.2 proofread
ANTHROPIC_API_KEY=...

# Phase 0.3 moderation
PERSPECTIVE_API_KEY=...

# Phase 3 social OAuth (start app reviews early!)
META_APP_ID=...
META_APP_SECRET=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...

# Phase 4 push notifications
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:hello@verkli.com
```

---

## 7. Status page + observability

- [ ] Sign up at BetterStack or UptimeRobot
- [ ] DNS: CNAME `status.verkli.com` → BetterStack-provided host
- [ ] Add monitors:
  - `https://verkli.com` (200 every 60s)
  - `https://verkli.com/api/health` (200 every 60s)
  - `https://verkli.com/api/health/queue` (with `x-ops-health-token`)
  - Stripe webhook (synthetic ping)
- [ ] Sentry alerts (in Sentry Dashboard → Alerts):
  - Payment webhook errors → page on-call
  - Audiobook job failure rate >5% over 1h → email
  - Login error rate >1% over 15m → email
- [ ] PostHog dashboard at `app.posthog.com`:
  - Signup funnel (new visitor → reader signup → first read)
  - Author funnel (author signup → first book → first publish)

---

## 8. Verification — smoke test before announcing

Run on **staging** first, then on prod after deploy:

### Critical paths

- [ ] **Author flow:** sign up → onboard Stripe Connect (sandbox) → simulated KYC → see "Payouts active" badge
- [ ] **Reader flow:** sign up → discover → buy a book → read first chapter
- [ ] **Multi-lang:** open a multi-lang book → switch language → text + audio (when present) update; URL `?lang=` preserved
- [ ] **Audiobook:** play chapter audio → audio plays without error
- [ ] **Karaoke:** if a chapter has timestamps in `chapter_audio_timestamps`, words highlight in sync (Phase 1.1 wow-moment)
- [ ] **DMCA:** submit form at `/legal/dmca` → email arrives at `legal@verkli.com` → row appears in `content_reports` with `reason_code='dmca'`
- [ ] **Age gate:** open an `is_adult_content=true` book as anonymous → modal shows → "I am 18+" persists → can read
- [ ] **Search:** `/api/search?q=test` returns books + authors; topbar autocomplete works on `/reader/discover`
- [ ] **i18n:** set `verkli-locale` cookie to `sv` → author dashboard renders Swedish strings (e.g. payouts page)

### Monitoring

- [ ] Sentry: throw a test error via `/api/dev/sentry-test` (gated to non-prod) — confirm it lands
- [ ] PostHog: sign-up + book-opened events visible in event feed
- [ ] BullMQ dashboard at `/admin/queues` — every queue listed with counts
- [ ] Stripe webhook receipts: open Stripe Dashboard → Webhooks → recent events showing 200 OK

### Performance baselines (capture before announcing)

- [ ] Run `EXPLAIN ANALYZE` on the three queries in `docs/perf-fk-indexes.md` → numbers added to `docs/perf-fk-indexes.md`
- [ ] Lighthouse on `/reader/home` and `/author/home` → CLS <0.1, LCP <2.5s

---

## 9. Optional but recommended before announce

- [ ] **CSP report-only soak:** add `Content-Security-Policy-Report-Only` header per `docs/csp-report.md` and watch Sentry for violations for 7 days. Then flip to enforcing.
- [ ] **Mozilla Observatory:** run against staging URL → target grade A
- [ ] **Pino logger rollout:** migrate one or two workers from `console.*` to the logger in `lib/logger.ts` (per `docs/sprint-0.5-deferred.md` §D5)
- [ ] **Worker production deploy:** Fly.io setup per `docs/worker-deployment.md`. The current dev stack (workers running locally on your laptop) won't survive a real demo.
- [ ] **TikTok / Meta app reviews:** submit early — they take 4–6 weeks. Phase 3 code lands later but the review is the bottleneck

---

## 10. Branch + release

> When all of §1–§9 are done.

ROADMAP §"Branch strategy" recommends **rolling-forward rename** instead of a big merge:

```bash
# 1. Tag the current main (marketing site) before changing anything
git tag main-marketing-v1 main
git push origin main-marketing-v1

# 2. Rename mvp-wip → main on the remote
# (do this when you're ready for the cutover, NOT before the demo)
git push origin :main                     # delete remote main
git push origin mvp-wip-2026-03-18:main   # promote mvp-wip
git fetch origin
git checkout -B main origin/main          # local checkout

# 3. Vercel: detach old main deploy, attach new main
```

> ⚠️ This is a one-shot operation. Have a rollback plan: keep `main-marketing-v1` tag and the old DNS recorded.

---

## Reference index

| Topic | Doc |
|---|---|
| Sprint 0 audit | `docs/audit.md` |
| Sprint 0 DB audit | `docs/db-audit.md` |
| Sprint 0.5 deferrals | `docs/sprint-0.5-deferred.md` |
| Pre-raise plan | `docs/sprint-plan-pre-raise.md` |
| Worker deployment recipe | `docs/worker-deployment.md` |
| CSP target | `docs/csp-report.md` |
| FK perf doc | `docs/perf-fk-indexes.md` |
| Queue decision (BullMQ vs Inngest) | `docs/queue-decision.md` |
| Roadmap | `ROADMAP.md` |
| Worker runbook | `docs/workers-runbook.md` |
| Dev runbook | `docs/dev-runbook.md` |
