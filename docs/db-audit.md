# Sprint 0 — Database Audit

> Generated: 2026-04-29 from `apps/web/supabase/migrations/` (81 migrations, 75 tables).
> Methodology: parsed every `CREATE TABLE`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`,
> and `CREATE INDEX` statement; cross-referenced FK columns against indexes whose
> *leading column* matches.

This complements `docs/SCHEMA_GAPS.md` (which is now a closed reconciliation
record) and `docs/DATABASE_ARCHITECTURE.md` (the canonical schema doc).

---

## 1. Missing FK indexes

Postgres does **not** automatically index foreign-key columns. 122 FK
relationships were detected; **34** lack any index whose leading column is the
FK column. These cause sequential scans on `JOIN`s and on parent-side `DELETE`
cascade checks.

### Severity classification

- **High**: hot read paths or large parent tables — index now.
- **Medium**: moderate volume, used by background workers — index in P1.
- **Low**: small or admin-side tables — index opportunistically.

| FK | Severity | Why |
|---|---|---|
| `analytics_events.user_id` → `users` | **High** | Cohort-funnel scans by user; table grows monotonically |
| `recommendations.book_id` → `books` | **High** | Joined for every recommended-books render |
| `readings.book_id` → `books` | **High** | Hot reader-app path |
| `readings.chapter_id` → `chapters` | **High** | Hot reader-app path |
| `reading_progress.user_id` → `users` | **High** | Hit on `/reader/home` continue-reading |
| `reading_progress.chapter_id` → `chapters` | **High** | Hit on `/reader/home` continue-reading |
| `reading_progress.book_version_id` → `book_versions` | **High** | Cascade on book delete |
| `bookmarks` already indexed (composite) | — | OK |
| `notifications.actor_id` → `users` | **High** | Inbox + admin triage |
| `highlights.book_id` → `books` | **High** | Reader render |
| `curated_list_items.book_id` → `books` | **High** | List-page render (already has `(list_id, rank)` but not a `book_id` lookup) |
| `books.book_version_id` → `book_versions` | Medium | Self-join for current version |
| `book_clubs.current_book_id` → `books` | Medium | Clubs landing page |
| `book_club_members.club_id` → `book_clubs` | Medium | Membership lookup |
| `book_club_messages.user_id` → `users` | Medium | |
| `conversation_participants.conversation_id` → `conversations` | Medium | DM thread fan-out |
| `conversations.created_by` → `users` | Medium | |
| `conversations.participant_two_id` → `users` | Medium | |
| `conversations.blocked_by` → `users` | Medium | |
| `dm_sender_rate_limits.sender_id` → `users` | Medium | |
| `message_user_blocks.blocker_id` → `users` | Medium | |
| `marketing_posts.media_asset_id` → `media_assets` | Medium | |
| `poll_votes.poll_id` → `polls` | Medium | Aggregations |
| `poll_votes.user_id` → `users` | Medium | |
| `reader_genre_preferences.genre_id` → `genres` | Medium | Onboarding |
| `referral_codes.user_id` → `users` | Medium | |
| `referral_redemptions.referrer_id` → `users` | Medium | |
| `reviews.user_id` → `users` | Medium | |
| `user_credits.user_id` → `users` | Medium | Reader-billing render |
| `user_flags.user_id` → `users` | Medium | |
| `user_usage_monthly.user_id` → `users` | Medium | |
| `billing_accounts.user_id` → `users` | Medium | One-row-per-user but checked on every billing render |
| `author_subscription_plans.author_id` → `users` | Medium | |
| `author_applications.user_id` → `users` | Low | Admin-only |
| `content_reports.reviewed_by_user_id` → `profiles` | Low | Admin-only |

### Recommended migration

```sql
-- 20260429120000_fk_indexes_p0.sql
-- Sprint 0 FK-index gap fix. CREATE INDEX CONCURRENTLY where possible.
-- (Supabase migrations run in a transaction by default — drop CONCURRENTLY
--  if you keep them in the same migration.)

CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx        ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS recommendations_book_id_idx         ON public.recommendations(book_id);
CREATE INDEX IF NOT EXISTS readings_book_id_idx                ON public.readings(book_id);
CREATE INDEX IF NOT EXISTS readings_chapter_id_idx             ON public.readings(chapter_id);
CREATE INDEX IF NOT EXISTS reading_progress_user_id_idx        ON public.reading_progress(user_id);
CREATE INDEX IF NOT EXISTS reading_progress_chapter_id_idx     ON public.reading_progress(chapter_id);
CREATE INDEX IF NOT EXISTS reading_progress_book_version_idx   ON public.reading_progress(book_version_id);
CREATE INDEX IF NOT EXISTS notifications_actor_id_idx          ON public.notifications(actor_id);
CREATE INDEX IF NOT EXISTS highlights_book_id_idx              ON public.highlights(book_id);
CREATE INDEX IF NOT EXISTS curated_list_items_book_id_idx      ON public.curated_list_items(book_id);
-- Medium-severity batch (P1 migration):
CREATE INDEX IF NOT EXISTS books_book_version_id_idx           ON public.books(book_version_id);
CREATE INDEX IF NOT EXISTS book_clubs_current_book_id_idx      ON public.book_clubs(current_book_id);
CREATE INDEX IF NOT EXISTS book_club_members_club_id_idx       ON public.book_club_members(club_id);
CREATE INDEX IF NOT EXISTS book_club_messages_user_id_idx      ON public.book_club_messages(user_id);
CREATE INDEX IF NOT EXISTS conversation_participants_conv_idx  ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS conversations_created_by_idx        ON public.conversations(created_by);
CREATE INDEX IF NOT EXISTS conversations_participant_two_idx   ON public.conversations(participant_two_id);
CREATE INDEX IF NOT EXISTS conversations_blocked_by_idx        ON public.conversations(blocked_by);
CREATE INDEX IF NOT EXISTS dm_sender_rate_limits_sender_idx    ON public.dm_sender_rate_limits(sender_id);
CREATE INDEX IF NOT EXISTS message_user_blocks_blocker_idx     ON public.message_user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS marketing_posts_media_asset_idx     ON public.marketing_posts(media_asset_id);
CREATE INDEX IF NOT EXISTS poll_votes_poll_id_idx              ON public.poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS poll_votes_user_id_idx              ON public.poll_votes(user_id);
CREATE INDEX IF NOT EXISTS reader_genre_pref_genre_id_idx      ON public.reader_genre_preferences(genre_id);
CREATE INDEX IF NOT EXISTS referral_codes_user_id_idx          ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS referral_redemptions_referrer_idx   ON public.referral_redemptions(referrer_id);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx                 ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS user_credits_user_id_idx            ON public.user_credits(user_id);
CREATE INDEX IF NOT EXISTS user_flags_user_id_idx              ON public.user_flags(user_id);
CREATE INDEX IF NOT EXISTS user_usage_monthly_user_id_idx      ON public.user_usage_monthly(user_id);
CREATE INDEX IF NOT EXISTS billing_accounts_user_id_idx        ON public.billing_accounts(user_id);
CREATE INDEX IF NOT EXISTS author_sub_plans_author_id_idx      ON public.author_subscription_plans(author_id);
CREATE INDEX IF NOT EXISTS author_applications_user_id_idx     ON public.author_applications(user_id);
CREATE INDEX IF NOT EXISTS content_reports_reviewed_by_idx     ON public.content_reports(reviewed_by_user_id);
```

The migration is **not applied in this sprint** — Sprint 0 is read-only on the
DB. The file above is a copy-paste-ready artifact for the next sprint.

> ⚠️ Verification step: before applying, run
> `EXPLAIN (ANALYZE, BUFFERS) <hot-query>` against staging for at least the High
> entries; FK-index choice is sometimes superseded by a partial / covering
> index that the parser missed.

---

## 2. Tables that should have soft deletes

The codebase currently has **no `deleted_at` column anywhere** and **no
`is_deleted` flag**. `account_deletion_requests` (added 2026-04-23) records
intent only; no row anywhere is ever flagged as soft-deleted.

For a SaaS that hosts user-generated content with monetisation, the following
should adopt a soft-delete pattern (RLS + indexed `WHERE deleted_at IS NULL`).

| Table | Rationale | Severity |
|---|---|---|
| `books` | Author may delete & undo; hard delete cascades 5+ tables | **High** |
| `chapters` | Cascades from `books`; needed for chapter-level recovery | **High** |
| `book_versions` | Translation/version recovery on author error | **High** |
| `profiles` | GDPR right-to-be-forgotten requires staged deletion; also drives `account_deletion_requests` close-out | **High** |
| `comments` | Moderation: hide vs purge | **High** |
| `messages` | DM unsend / report flow needs hide-not-purge | **High** |
| `reviews` | Author dispute / moderation | Medium |
| `marketing_campaigns` | Author may want to retire without losing analytics | Medium |
| `book_clubs`, `book_club_messages` | Moderation | Medium |
| `polls`, `poll_options` | Author mistake recovery | Medium |
| `newsletters` | Drafts / unsent recovery | Medium |
| `shelves`, `shelf_books`, `shelf_sections` | Curation undo | Low |
| `bookmarks`, `highlights` | User undo flow (currently hard-deleted) | Low |

**Tables that should remain hard-delete:** `analytics_events`,
`stripe_events`, `tts_preview_jobs`, `ai_jobs`, `chapter_audio_cache`,
worker-side state tables. These are operational ledgers; soft delete adds
storage cost without recovery value.

### Suggested column convention

```sql
ALTER TABLE public.<t> ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX <t>_active_idx ON public.<t> (id) WHERE deleted_at IS NULL;
-- And for every existing index used for active reads, recreate as a partial
-- index with the same predicate so the planner stays on it.
```

RLS policies must be updated to filter `deleted_at IS NULL` on `SELECT`. This is
a non-trivial change — call it out in the next sprint.

---

## 3. Tables that need audit logs

Required for compliance, billing forensics, and incident triage. There is
**no `audit_log` table today**. Mutations leave no trail beyond Postgres WAL
and Sentry breadcrumbs.

### Recommended pattern

A single denormalised `audit_log` table with structured payloads is cheaper to
maintain than per-table shadow tables. Schema:

```sql
CREATE TABLE public.audit_log (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id     UUID NULL,                    -- auth.uid() or null for system
  actor_role   TEXT NULL,                    -- 'author' | 'reader' | 'admin' | 'system'
  action       TEXT NOT NULL,                -- e.g. 'book.publish', 'profile.role_change'
  target_type  TEXT NOT NULL,                -- 'book', 'profile', 'billing_account', …
  target_id    UUID NULL,
  before       JSONB NULL,
  after        JSONB NULL,
  metadata     JSONB NULL,                   -- ip, user_agent, request_id
  CONSTRAINT audit_log_action_check CHECK (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);
CREATE INDEX audit_log_actor_idx       ON public.audit_log(actor_id, occurred_at DESC);
CREATE INDEX audit_log_target_idx      ON public.audit_log(target_type, target_id, occurred_at DESC);
CREATE INDEX audit_log_action_idx      ON public.audit_log(action, occurred_at DESC);
-- Partition by month if/when volume justifies it.
```

### Tables whose mutations must produce audit rows

| Table / domain | Triggers that must audit | Why |
|---|---|---|
| `profiles` | role change, email change, status change | Privilege escalation forensics |
| `books` | publish, unpublish, status, visibility, price | "Who changed the price?" |
| `chapters` | content version update, deletion | Author dispute / reader-paid-for-this proof |
| `billing_accounts`, `author_subscriptions`, `author_subscription_plans` | plan change, status change, cancellation | Billing disputes |
| `entitlements`, `credit_grants`, `credit_topups`, `user_credits` | grants, debits | Credit forensics |
| `orders`, `donations`, `stripe_events`, `stripe_session_redemptions` | success/refund/replay | Money trail |
| `author_applications` | approve / reject | Compliance trail |
| `content_reports` | resolve / dismiss / escalate | Trust & Safety record |
| `account_deletion_requests` | submit / fulfil / cancel | GDPR proof-of-deletion |
| `feedback` | admin triage | Optional but cheap |
| Admin grants (`/admin/beta`, role assignments) | grant / revoke | Whose hand pulled the lever |

### Application-side hook

A single `recordAudit({ action, target_type, target_id, before, after, metadata })`
helper invoked from every mutation API route is preferable to DB triggers — it
preserves the actor ID (`auth.uid()`) reliably and runs inside the same
transaction with `SECURITY DEFINER` for RLS.

The implementation lives in P1 (out of Sprint 0 scope per the "no logic change"
constraint), but the `audit_log` table itself can be created in the same
migration as the FK-index fix above.

### Things to *not* audit

Page views, analytics events, recommendation scoring, queue heartbeats. Those
already have purpose-built sinks (`analytics_events`, BullMQ logs, worker
metrics) and would 100x the volume of the audit table.

---

## 4. Other findings

- **No `updated_at` triggers on `profiles`, `marketing_*`, `book_clubs`,
  `messages`.** Several tables have an `updated_at` column but rely on the
  application to set it. Mixed convention.
- **`stripe_events` lacks a `received_at` index** — replay debugging today
  requires a full scan.
- **`ai_jobs.input` is JSONB-keyed by `bookId`** (per CLAUDE.md memory). A
  GIN index `(input jsonb_path_ops)` would help admin triage queries that
  filter by book.
- **No retention policy** on `analytics_events`, `notifications`, `tts_preview_jobs`.
  Volume will grow without bound; add a monthly partition + drop policy in P1.
- **RLS coverage** appears thorough on user-facing tables, but `audit_log` (when
  added) must be `SELECT` only for service role and admins, and `INSERT`-only
  via `SECURITY DEFINER` helper.

---

## 5. Action plan

| Sprint | Action |
|---|---|
| 0 (this) | Document only. No DB changes. |
| 1 | Apply `20260429120000_fk_indexes_p0.sql` (High severity FKs only); create `audit_log` table; pick 3–5 mutation paths to instrument first. |
| 2 | Soft-delete migration on `books`, `chapters`, `profiles`, `comments`, `messages` with RLS + partial indexes. |
| 3 | Remaining FK indexes (Medium); finish audit-log instrumentation; introduce retention partitions on `analytics_events`. |
