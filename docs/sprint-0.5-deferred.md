# Sprint 0.5 — Deferred Work

Sprint 0.5 was scoped against the original task list as written. Several items
were deferred because doing them well requires either credentials this
session does not have, or scope larger than fits in a single autonomous run.
Each deferral below names the unblocker so the next sprint can pick it up
cleanly.

---

## D1. FK index migration — apply to staging + production

**Status:** Migration file written (`apps/web/supabase/migrations/20260429120000_fk_indexes.sql`).
Applied locally: **no** (Supabase CLI not installed in this environment;
`supabase start` is required to bring up the local stack).

**Why deferred:** The "apply to staging, then prod (as a separate PR)" step
requires production database credentials and a deploy environment, neither of
which are available to an autonomous coding agent. Measuring `EXPLAIN ANALYZE`
before/after on the three hot paths (`recommendations.book_id`,
`readings.book_id`, `analytics_events.user_id`) requires a populated database
— local dev typically has very little data.

**To unblock:**
1. Run `supabase start` locally to get a running Postgres.
2. Apply migrations: `supabase db push` (or `supabase db reset` to replay
   the full migration chain).
3. Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on the three queries
   from `docs/perf-fk-indexes.md`, before and after applying the migration.
4. Open the staging PR; capture the same numbers there.
5. After review, open the prod PR.

**Estimated effort:** 30 min to apply + measure locally; the staging/prod PRs
are the existing release process.

---

## D2. Soft-delete SELECT-site rollout

**Status:** Migration applied a `deleted_at TIMESTAMPTZ` column to 11 tables
plus a RESTRICTIVE RLS policy that hides soft-deleted rows from
`authenticated` and `anon`. `lib/db/soft-delete.ts` provides the
`applyActiveFilter`, `softDelete`, and `restoreSoftDeleted` helpers, with
unit tests.

**Why partial:** The original task said "grep-audit all SELECT sites; require
either a typed helper or explicit `.is('deleted_at', null)`". That refactor
touches every query that reads from the 11 soft-delete tables — easily 60-100
sites across 134 API routes, 94 page routes, and 7 worker scripts. Doing
this in a single PR would be unreviewable and risk regressions in
unrelated areas.

The RESTRICTIVE RLS policy added in `20260429121000_soft_delete_columns.sql`
is the **security backstop**: every `authenticated` and `anon` SELECT is
filtered server-side regardless of whether the calling code remembers. The
remaining work is correctness (counts, ordering) for queries that use the
service-role client (which bypasses RLS).

**To unblock:** Stage the SELECT-site rollout one table at a time:

| Wave | Tables | Notes |
|---|---|---|
| 1 | `comments`, `messages` | High volume, low blast radius |
| 2 | `reviews`, `marketing_*` | Author-facing surfaces |
| 3 | `book_clubs`, `book_club_messages`, `polls`, `poll_options` | Flag-gated features |
| 4 | `books`, `chapters` | Highest blast radius — touches reader app, library, search, recommendations |

For each table:
1. Grep for `from("<table>"` and `from('<table>'`.
2. Add `applyActiveFilter(...)` to every admin-client query.
3. Add a regression test in `<area>/__tests__/active-filter.test.ts`.

**Estimated effort:** 2-3 days for the full rollout.

---

## D3. Account-deletion automation (Sprint 0.5 Task 4)

**Status:** Not started.

**Why deferred:** This task hides several decisions that should not be made
autonomously:

1. **Where do OAuth tokens live?** The schema has `social_connections` but
   the token-storage column is referenced inconsistently across the codebase.
   A "remove OAuth tokens" step needs a definitive list per provider.
2. **Stripe subscription cancellation policy.** Should we cancel at-period-end
   (preserve paid access until the term expires) or immediately (return a
   prorated refund)? The current product position is unclear; the codebase
   has both patterns.
3. **30-day grace period mechanics.** Stored in `profiles.deletion_requested_at`
   already, but the "execute after 30 days" job needs a scheduling anchor —
   BullMQ delayed jobs vs. cron polling. Both work; the choice affects how
   we cancel a deletion in flight.
4. **Audit-trail before/after payloads.** What data goes into the `before`
   field? The full profile? Only PII? This is a privacy-policy question.

**To unblock:** A 30-min product/legal alignment session producing a 1-page
spec. Then 1-2 days of implementation: the `account-deletion` BullMQ queue +
processor, 5 tests (happy path, partial-failure recovery, idempotency,
stripe-cancel-failure, user-already-deleted).

The `audit_log` table created in Sprint 0.5 (`20260429122000_audit_log.sql`)
is the substrate for the `account.deletion_*` audit entries.

---

## D4. Worker production orchestration (Sprint 0.5 Task 5)

**Status:** Not started. A platform recommendation requires reading
`infra/docker/docker-compose.yml`, `vercel.json`, and current deployment
configs that this session did not finish surveying.

**Why deferred:** The original task asks to "Build the deployment for the
recommended option" and "Verify: all 7 queues start, jobs picked up, killed
worker auto-restarts." The verification step requires actually deploying
to a cloud platform (Render / Railway / Fly / k8s) — credentials, account
selection, billing implications. This is a decision the team should make
together.

**Recommendation, ahead of that meeting:** Fly.io for Verkli's stack:

- Already using Vercel for the web app — Fly is operationally similar (CLI
  + git push) without the cold-start tax of Vercel functions.
- Workers need long-running Node processes; Vercel functions don't fit.
- Fly's `restart_policy = "on-failure"` solves the auto-restart requirement.
- Single Dockerfile already exists for `apps/web` (per `docker-compose.yml`).
- Per-worker scaling: each queue can be a separate Fly service.

Render is the cheap-and-cheerful alternative; k8s is overkill at this stage.

**To unblock:** Create a Fly account (or pick another platform), align on
budget, then 1 day of work: Dockerfile per worker + `fly.toml` per service +
GitHub Actions deploy workflow + verification runbook in
`docs/worker-deployment.md`.

---

## D5. Pino logger — full worker rollout (Sprint 0.5 Task 7 finisher)

**Status:** `apps/web/src/lib/logger.ts` written, with Pino + Sentry
multistream + `loggerForJob`/`withCorrelationId` helpers. **Workers still
use `console.log` / `console.error`.** Replacing them was descoped to keep
the diff reviewable.

**Why deferred:** Wholesale `console.*` → logger replacement across 7 worker
scripts in a single PR would be a 200+ line diff with no behavioural change.
That diff is at risk of accidentally muting a useful log line or introducing
async ordering bugs (Pino is synchronous-by-default but its async transport
has subtle differences).

**To unblock:** Migrate one worker at a time. Suggested order:

| Worker | Reason for ordering |
|---|---|
| `notifications-worker.ts` | Smallest surface; easy validation |
| `recommendations-worker.ts` | Self-contained; no external deps |
| `social-publish-worker.ts` | Already has structured-ish logs |
| `marketing-worker.ts` | Higher complexity but well-tested |
| `audiobook-worker.ts` | Long-running jobs; correlation id per chapter |
| `translation-worker.ts` | Subprocess-heavy; correlate child logs |
| `import-worker.ts` | Most complex; do last |

Per worker: replace top-level `console.*` with `getLogger().<level>(...)`,
inject `loggerForJob({ queue, jobName, jobId })` at the top of every
processor function, and update the log-shape regression tests.

---

## D6. CSP — remove `'unsafe-inline'` via nonces (Sprint 0.5 Task 10)

**Status:** Researched; not applied. Mozilla Observatory grading deferred
(requires deployed URL).

**Why deferred:** Removing `'unsafe-inline'` from `script-src` requires:

1. A request-scoped nonce generated in `middleware.ts`.
2. Every inline script in `app/layout.tsx` (theme script, suppressAbort
   script) gets `nonce={nonce}`.
3. Every third-party script (Vercel Analytics, Speed Insights, PostHog) has
   to be audited — most embed inline shims that need either `nonce` support
   or replacement with a hashed snippet.
4. Next.js's own framework scripts must be allowed via `'strict-dynamic'`
   or hashed.

Doing this without a staging deploy to verify is reckless: the failure mode
is "site won't render" rather than a benign degradation. The Observatory
grade can't be measured locally — it requires a public URL.

**Mitigation now:** A `Content-Security-Policy-Report-Only` header can be
added alongside the existing CSP to gather violation reports for the strict
policy without enforcing it. That's a one-PR follow-up that lets the team
see the impact before the cutover.

**To unblock:** 1 day of work after a staging deploy is available. See
`docs/csp-report.md` for the strict policy and the report-only test plan.

---

## D7. Mozilla Observatory grade verification

Tied to D6. Cannot be run locally. Once D6 is shipped to staging, run
`https://observatory.mozilla.org/analyze/<staging-host>`.

---

## Tracking

This list lives next to `docs/audit.md`, `docs/db-audit.md`, and the Sprint
0.5 deliverables. Each deferral has a clear unblocker; sweep this in the
Sprint 1 planning doc.
