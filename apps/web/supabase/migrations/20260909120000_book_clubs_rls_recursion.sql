-- Book clubs answer HTTP 500 to every client that is not the service role.
--
--   GET /rest/v1/book_clubs?select=id         -> 500
--   GET /rest/v1/book_club_members?select=... -> 500
--   GET /rest/v1/book_club_messages?select=id -> 500
--   {"code":"42P17","message":"infinite recursion detected in policy for relation ..."}
--
-- 42P17 is Postgres refusing a cycle between policies: reading `book_clubs`
-- evaluates a policy that reads `book_club_members`, whose own policy reads
-- `book_clubs`, and so on. Neither table can be read by anyone the policies
-- apply to.
--
-- These three tables are among the six that exist in production with NO
-- migration defining them — `grep -r book_club supabase/migrations` finds
-- nothing. The policies were written by hand in the dashboard and have never
-- been under version control, which is why a cycle could be introduced without
-- review and why nothing could be replaced without first discovering the policy
-- names. The DO block below drops whatever is actually there, by name, and
-- RAISE NOTICEs each one first so `db push` output records what was replaced.
--
-- Not urgent, and worth saying so: NEXT_PUBLIC_BOOK_CLUBS_ENABLED is unset in
-- production, so `isBookClubsEnabled()` is false and every route returns
-- E_CLUBS_FEATURE_DISABLED before touching the database. This is a latent
-- failure that would surface the moment the flag is turned on, not an outage.
--
-- ── How the cycle is broken ──────────────────────────────────────────────────
--
-- `is_book_club_member()` is SECURITY DEFINER, so evaluating it does not apply
-- RLS to `book_club_members`. A policy on `book_clubs` may therefore ask about
-- membership without re-entering the member table's policies. The one remaining
-- cross-reference — the member policy asking whether a club is public —
-- terminates, because `book_clubs`' policy only calls the DEFINER function.
--
-- ── The rules, taken from the routes rather than invented ────────────────────
--
--   book_clubs        SELECT  public, or mine, or one I belong to
--                             (api/book-clubs/route.ts:55 selects with NO
--                             filter and relies entirely on RLS to scope it)
--                     INSERT  creator_id must be me
--                     UPDATE  creator only  ([id]/route.ts:208 -> 403)
--                     DELETE  creator only  ([id]/route.ts:283 -> 403)
--   book_club_members SELECT  signed in, and: my own row, or a club I belong
--                             to, or any public club. The public case is load
--                             bearing: [id]/join/route.ts counts members with
--                             the USER client to enforce max_members, so a
--                             prospective joiner who cannot see the existing
--                             members would compute a count of 0 and walk past
--                             the limit.
--                     INSERT  only myself (the creator's own row is written
--                             this way at route.ts:130)
--                     DELETE  myself (leave), or the club creator (remove)
--   book_club_messages SELECT/INSERT  members only, even in a public club
--                             ([id]/messages/route.ts:40 checks membership)
--                     DELETE  author, or the club creator
--
-- Anonymous access is allowed for public club ROWS only. Member lists and
-- messages require a session: `is_public` defaults to true, so without that
-- condition an anonymous caller could enumerate every club's member user_ids.

-- ── Tables ───────────────────────────────────────────────────────────────────
-- Transcribed from the live schema so a fresh environment can run the app at
-- all. `IF NOT EXISTS` means this changes nothing on production; it exists to
-- stop these three from being invisible to version control a sixth month.

create table if not exists public.book_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cover_url text,
  creator_id uuid not null references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  max_members integer not null default 50,
  current_book_id uuid references public.books(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Vestigial: the DELETE route does a hard `.delete()`, so nothing ever writes
  -- this. The policies below still exclude non-null rows, so adding a real soft
  -- delete later does not also require remembering to change RLS.
  deleted_at timestamptz
);

create table if not exists public.book_club_members (
  club_id uuid not null references public.book_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists public.book_club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.book_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists book_club_members_user_idx on public.book_club_members (user_id);
create index if not exists book_club_messages_club_created_idx
  on public.book_club_messages (club_id, created_at desc);

-- ── The cycle breaker ────────────────────────────────────────────────────────

-- Parameters are `p_`-prefixed deliberately. A parameter named `club_id` would
-- be shadowed by the column of the same name inside the WHERE clause, making
-- the comparison `club_id = club_id` — always true. That exact bug shipped in
-- `can_view_book` and made one publish expose every draft.
create or replace function public.is_book_club_member(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id is not null and exists (
    select 1
    from public.book_club_members m
    where m.club_id = p_club_id
      and m.user_id = p_user_id
  );
$$;

revoke all on function public.is_book_club_member(uuid, uuid) from public;
grant execute on function public.is_book_club_member(uuid, uuid) to anon, authenticated, service_role;

comment on function public.is_book_club_member(uuid, uuid) is
  'SECURITY DEFINER so a policy on book_clubs can ask about membership without applying RLS to book_club_members. Removing SECURITY DEFINER reintroduces the 42P17 recursion.';

-- ── Replace every existing policy on the three tables ────────────────────────
-- By name, discovered at run time, because the names were never recorded
-- anywhere. Each is announced before it is dropped so the push output is the
-- only record of what the hand-written policies were called.

do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('book_clubs', 'book_club_members', 'book_club_messages')
    order by tablename, policyname
  loop
    raise notice 'dropping pre-existing policy %.% (was not in version control)',
      pol.tablename, pol.policyname;
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table public.book_clubs enable row level security;
alter table public.book_club_members enable row level security;
alter table public.book_club_messages enable row level security;

-- book_clubs
create policy book_clubs_select on public.book_clubs
  for select using (
    deleted_at is null
    and (
      is_public
      or creator_id = auth.uid()
      or public.is_book_club_member(id, auth.uid())
    )
  );

create policy book_clubs_insert on public.book_clubs
  for insert to authenticated with check (creator_id = auth.uid());

create policy book_clubs_update on public.book_clubs
  for update to authenticated using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

create policy book_clubs_delete on public.book_clubs
  for delete to authenticated using (creator_id = auth.uid());

-- book_club_members
create policy book_club_members_select on public.book_club_members
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_book_club_member(club_id, auth.uid())
    or exists (
      select 1
      from public.book_clubs c
      where c.id = club_id
        and c.deleted_at is null
        and c.is_public
    )
  );

create policy book_club_members_insert on public.book_club_members
  for insert to authenticated with check (user_id = auth.uid());

create policy book_club_members_delete on public.book_club_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.book_clubs c
      where c.id = club_id and c.creator_id = auth.uid()
    )
  );

-- book_club_messages
create policy book_club_messages_select on public.book_club_messages
  for select to authenticated using (
    deleted_at is null
    and public.is_book_club_member(club_id, auth.uid())
  );

create policy book_club_messages_insert on public.book_club_messages
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_book_club_member(club_id, auth.uid())
  );

create policy book_club_messages_delete on public.book_club_messages
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.book_clubs c
      where c.id = club_id and c.creator_id = auth.uid()
    )
  );
