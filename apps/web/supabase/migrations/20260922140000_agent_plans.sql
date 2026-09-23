-- Plans an author approves before the assistant writes anything.
--
-- The client never writes here, and never posts a plan back. It receives a
-- render-only copy plus an id, and approval names the id. If the browser could
-- supply the steps, the approval would mean nothing: what the author read and
-- what ran would be two different things with devtools in between. Hence no
-- grants at all to `authenticated` — the routes reach this table with the
-- service role and check ownership themselves.
create table public.agent_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  version_id uuid not null references public.book_versions(id) on delete cascade,
  tool text not null check (tool in ('edit','cover','audiobook','translate','market','pricing','publish','review')),
  summary text not null default '' check (char_length(summary) <= 4000),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and pg_column_size(steps) < 1000000),
  created_at timestamptz not null default now(),
  -- A plan's positions are only valid against the text they were measured from.
  -- Fifteen minutes is long enough to read forty-seven changes and short enough
  -- that a plan left open overnight is refused rather than applied to new prose.
  expires_at timestamptz not null default now() + interval '15 minutes',
  applied_at timestamptz,
  outcome jsonb
);

create index agent_plans_owner_idx on public.agent_plans(owner_id, book_id, created_at desc);
create index agent_plans_expiry_idx on public.agent_plans(expires_at) where applied_at is null;

alter table public.agent_plans enable row level security;
revoke all on public.agent_plans from public, anon, authenticated;
grant all on public.agent_plans to service_role;

-- A plan is written once and then marked applied. Nothing else about it moves.
create function public.agent_plans_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
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
  -- Applying claims the plan by stamping applied_at, and the outcome is written
  -- once the steps have run. Both are one-way: a claimed plan cannot be claimed
  -- again, which is what stops a double submit from running it twice.
  if old.applied_at is not null and new.applied_at is distinct from old.applied_at then
    raise exception 'This plan has already been applied.' using errcode='23514';
  end if;
  if old.outcome is not null and new.outcome is distinct from old.outcome then
    raise exception 'This plan already has a result.' using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger agent_plans_immutable before update on public.agent_plans
  for each row execute function public.agent_plans_immutable();
