-- ---------------------------------------------------------------------------
-- Sprint 0.5 — Audit log foundation (Task 3).
--
-- CORRECTED 2026-08-31. This file previously designed a table that does not
-- exist anywhere:
--
--     was:  id bigserial, occurred_at, target_type, target_id, metadata,
--           before, after, actor_id, actor_role, action
--           + a record_audit() SECURITY DEFINER function
--     is:   id uuid, created_at, entity_type, entity_id, meta,
--           actor_user_id, actor_role, action, request_id
--
-- The second shape is what production has, what src/lib/supabase/types.ts is
-- generated from, and what seven call sites write to. The first shape reached
-- no database: this migration was never applied, and `CREATE TABLE IF NOT
-- EXISTS` no-ops against the table that was already there.
--
-- Rewriting an existing migration is normally off limits. It is right here for
-- one reason: leaving it alone made the migration history unable to reproduce
-- production. On a fresh database or `supabase db reset` the old body WOULD run
-- — there is no table for IF NOT EXISTS to skip — and would create the wrong
-- audit_log, after which 20260831130000 fails on the missing columns and every
-- audit write in the app targets columns that are not there. Marking the file
-- "do not apply" did not help, because nothing enforces a comment. Since the
-- file has never been applied anywhere, correcting it contradicts no
-- environment's history.
--
-- Faithfulness details, all read off the live database rather than assumed:
--   - `entity_id` is text, not uuid.
--   - `actor_user_id` carries no foreign key (types.ts reports
--     `Relationships: []`), so none is declared here.
--   - RLS is on with no permissive policy: anon sees 0 of the 1 live row while
--     the service role sees it. Reads and writes all go through
--     createAdminClient(), so service-role-only is the real contract.
--   - `action` has no CHECK constraint. The old body required
--     `<domain>.<verb>`, which the admin routes violate — they write bare
--     verbs like "approve" — so adding it would break working code.
--
-- The record_audit() function is deliberately not recreated. Every caller
-- passes the service-role client, so there is no privilege for SECURITY
-- DEFINER to elevate; lib/audit.ts inserts directly instead.
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  actor_user_id  uuid,
  actor_role     text,
  action         text        not null,
  entity_type    text        not null,
  entity_id      text,
  request_id     text,
  meta           jsonb       not null default '{}'::jsonb
);

-- Append-only by construction: no policy grants insert, update, delete or
-- select, so only the service role touches this table. Indexes live in
-- 20260831130000_audit_log_indexes.sql, which production needs separately
-- because it already had the table and skips this file.
alter table public.audit_log enable row level security;

-- rollback:
--   drop table if exists public.audit_log;
