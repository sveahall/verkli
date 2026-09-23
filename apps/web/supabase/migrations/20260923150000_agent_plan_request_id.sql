-- Replay must find the plan this request stored, not the newest plan that
-- happens to share its summary.

alter table public.agent_plans
  add column if not exists request_id uuid;

create unique index if not exists agent_plans_request_idx
  on public.agent_plans (owner_id, request_id)
  where request_id is not null;

create or replace function public.agent_plans_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.book_id is distinct from old.book_id
    or new.version_id is distinct from old.version_id
    or new.tool is distinct from old.tool
    or new.steps is distinct from old.steps
    or new.summary is distinct from old.summary
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
    or new.stopped_because is distinct from old.stopped_because
    or new.request_id is distinct from old.request_id then
    raise exception 'An approved plan cannot be rewritten.' using errcode='23514';
  end if;
  if old.applied_at is not null and new.applied_at is distinct from old.applied_at then
    if old.outcome is not null or new.outcome is not null or new.applied_at is not null then
      raise exception 'This plan has already been applied.' using errcode='23514';
    end if;
  end if;
  if old.outcome is not null and new.outcome is distinct from old.outcome then
    raise exception 'This plan already has a result.' using errcode='23514';
  end if;
  return new;
end;
$$;
