-- audit_log: index for the table that actually exists.
--
-- Production already had `audit_log` before 20260429122000 was written, so that
-- migration is recorded as applied there without its DDL ever running. It has
-- since been corrected to create the table that actually exists, which is what
-- makes a fresh database or `supabase db reset` match production.
--
-- These indexes therefore live in their own migration rather than in that file:
-- production skips it, and needs them anyway. On a fresh database the table
-- arrives from 20260429122000 first and this runs against it.
--
-- The columns are the live ones. The April migration named the same three read
-- paths against `occurred_at` / `target_type` / `actor_id`, none of which are
-- columns here.

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
