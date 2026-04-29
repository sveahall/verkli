# Perf — FK Index Migration

> Sprint 0.5 Task 1 deliverable.
> Migration file: `apps/web/supabase/migrations/20260429120000_fk_indexes.sql`.

This document captures the **before/after** measurement procedure for the
three hot paths the migration is intended to improve. The actual numbers
must be filled in once the migration is applied to a populated database
(see `docs/sprint-0.5-deferred.md` §D1 — the local Supabase stack was not
running in the session that wrote the migration).

---

## Hot-path queries

The three queries the original Sprint 0.5 brief named:

### 1. `recommendations.book_id` join

The reader-app recommendation rail issues this read on every `/reader/home`
visit:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT b.id, b.title, b.cover_image, r.reason
FROM public.recommendations r
JOIN public.books b ON b.id = r.book_id
WHERE r.user_id = '00000000-0000-0000-0000-000000000000'
ORDER BY r.created_at DESC
LIMIT 20;
```

Pre-fix: sequential scan on `recommendations` → seq scan on `books`.
Post-fix: index on `recommendations.book_id` (added) flips the inner side
to an index lookup.

### 2. `readings.book_id` aggregation

Author dashboard "readers per book" stat:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM public.readings
WHERE book_id IN (
  -- typically 5-50 ids for an active author
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
```

Pre-fix: seq scan on `readings`. Post-fix: bitmap index scan on
`readings_book_id_idx`.

### 3. `analytics_events.user_id` cohort scan

Cohort funnel admin endpoint at `app/api/admin/metrics/funnel`:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT event_type, count(*)
FROM public.analytics_events
WHERE user_id = '00000000-0000-0000-0000-000000000000'
  AND created_at >= now() - interval '30 days'
GROUP BY event_type;
```

Pre-fix: seq scan filtered by `user_id`. Post-fix: index on
`analytics_events.user_id`. (A composite `(user_id, created_at)` index
would be even better — leave that for the recommendations migration when
the table grows large enough to matter.)

---

## Procedure to capture before/after

```bash
# 0. Bring up local Supabase
supabase start

# 1. Capture BEFORE numbers (with the new migration files renamed away
#    so they aren't applied yet)
mv apps/web/supabase/migrations/20260429120000_fk_indexes.sql /tmp/

supabase db reset    # replays migrations
psql "$(supabase db url)" -f scripts/perf/fk-baseline.sql > /tmp/before.txt

# 2. Restore the migration and apply
mv /tmp/20260429120000_fk_indexes.sql apps/web/supabase/migrations/
supabase db push

psql "$(supabase db url)" -f scripts/perf/fk-baseline.sql > /tmp/after.txt

# 3. Diff
diff /tmp/before.txt /tmp/after.txt
```

`scripts/perf/fk-baseline.sql` should `\timing on` and run each of the
three EXPLAIN queries against a database seeded with realistic volumes.
The seed step is non-trivial (recommendations and analytics_events both
need 100k+ rows for the index choice to flip) — see the data-volume
estimates in `docs/audit.md` §6 P0 item 3.

---

## Expected outcomes

The point of this migration is **not** to win in microbenchmarks on a
small DB — at low cardinality the planner can pick a sequential scan and
be right. The win shows up at production volumes:

| Query | Volume threshold for index win |
|---|---|
| `recommendations.book_id` JOIN | ~10k rows in `recommendations` |
| `readings.book_id` aggregation | ~100k rows in `readings` |
| `analytics_events.user_id` filter | ~50k rows per user |

If you measure on a small local DB and see no improvement, that is
expected. The production impact lands on the next read after deploy.

---

## Status

| Step | Status |
|---|---|
| Migration written | ✅ |
| Migration applied locally | ⏸ blocked: `supabase` CLI not installed in autonomous-agent environment |
| Before/after numbers captured | ⏸ depends on apply |
| Staging PR | ⏸ depends on staging credentials |
| Production PR | ⏸ depends on staging review + sign-off |

See `docs/sprint-0.5-deferred.md` §D1 for the unblocker.
