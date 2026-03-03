-- Polls tables
-- Migration: 00009_polls.sql

-- ─── polls ──────────────────────────────────────────────────────────────────
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users on delete cascade,
  book_id uuid references public.books on delete set null,
  question text not null,
  is_active boolean not null default true,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.polls enable row level security;

-- Polls are visible to all authenticated users
create policy "polls_select" on public.polls
  for select using (true);

-- Authors manage their own polls
create policy "polls_insert" on public.polls
  for insert with check (auth.uid() = author_id);

create policy "polls_update" on public.polls
  for update using (auth.uid() = author_id);

create policy "polls_delete" on public.polls
  for delete using (auth.uid() = author_id);

-- ─── poll_options ───────────────────────────────────────────────────────────
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls on delete cascade,
  text text not null,
  sort_order int not null default 0
);

alter table public.poll_options enable row level security;

-- Options visible to all
create policy "poll_options_select" on public.poll_options
  for select using (true);

-- Author of the poll manages options
create policy "poll_options_insert" on public.poll_options
  for insert with check (
    exists (
      select 1 from public.polls
      where polls.id = poll_options.poll_id
        and polls.author_id = auth.uid()
    )
  );

create policy "poll_options_update" on public.poll_options
  for update using (
    exists (
      select 1 from public.polls
      where polls.id = poll_options.poll_id
        and polls.author_id = auth.uid()
    )
  );

create policy "poll_options_delete" on public.poll_options
  for delete using (
    exists (
      select 1 from public.polls
      where polls.id = poll_options.poll_id
        and polls.author_id = auth.uid()
    )
  );

-- ─── poll_votes ─────────────────────────────────────────────────────────────
create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls on delete cascade,
  option_id uuid not null references public.poll_options on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.poll_votes enable row level security;

-- Votes visible to all
create policy "poll_votes_select" on public.poll_votes
  for select using (true);

-- Users can insert their own votes
create policy "poll_votes_insert" on public.poll_votes
  for insert with check (auth.uid() = user_id);

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_polls_author on public.polls (author_id);
create index if not exists idx_polls_book on public.polls (book_id) where book_id is not null;
create index if not exists idx_polls_active on public.polls (is_active, created_at desc) where is_active = true;
create index if not exists idx_poll_options_poll on public.poll_options (poll_id, sort_order);
create index if not exists idx_poll_votes_option on public.poll_votes (option_id);
