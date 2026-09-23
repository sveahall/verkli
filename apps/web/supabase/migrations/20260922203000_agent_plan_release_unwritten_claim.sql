-- A claim with no outcome is a load that failed before any write was known.
-- The apply route clears applied_at so the author can retry. A plan that
-- already has an outcome, or a claim moved to a different timestamp, stays
-- one-way: that is what stops a double submit from running the steps twice.

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
    or new.expires_at is distinct from old.expires_at then
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
