-- audit_log: index for the table that actually exists.
--
-- 20260429122000_audit_log.sql designed a table with `occurred_at`,
-- `target_type`, `target_id`, `before`, `after`, `metadata` and a bigserial id,
-- plus a `record_audit()` SECURITY DEFINER function. None of that reached the
-- database. The live `audit_log` predates it and has a different shape
-- entirely: uuid id, `created_at`, `entity_type`, `entity_id`, `meta`,
-- `actor_user_id`, `request_id`.
--
-- The live table is the design of record: six admin routes insert into it with
-- those column names and work, and `types.ts` is generated from it. So the
-- April migration is superseded rather than pending — see the note at the top
-- of that file.
--
-- What it did get right is the read paths, and those are still unindexed here.
-- This migration adds them, translated to the columns that exist.

-- Serves the admin "what did this person do" view.
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_user_id, created_at desc);

-- Serves admin/users/[id]/page.tsx:136 — .eq("entity_type", "user")
-- .eq("entity_id", id).order("created_at"). Without this it is a seq scan on
-- every admin user page.
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

-- Serves "show me every role change" style filtering.
create index if not exists audit_log_action_idx
  on public.audit_log (action, created_at desc);

-- rollback:
--   drop index if exists public.audit_log_action_idx;
--   drop index if exists public.audit_log_entity_idx;
--   drop index if exists public.audit_log_actor_idx;
