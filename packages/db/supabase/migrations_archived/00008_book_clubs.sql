-- Book Clubs tables
-- Migration: 00008_book_clubs.sql

-- ─── book_clubs ─────────────────────────────────────────────────────────────
create table if not exists public.book_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cover_url text,
  creator_id uuid not null references auth.users on delete cascade,
  is_public boolean not null default true,
  max_members int not null default 50,
  current_book_id uuid references public.books on delete set null,
  created_at timestamptz not null default now()
);

alter table public.book_clubs enable row level security;

-- Public clubs visible to all authenticated users
create policy "book_clubs_select_public" on public.book_clubs
  for select using (is_public = true);

-- Members can see their own clubs (including private)
create policy "book_clubs_select_member" on public.book_clubs
  for select using (
    exists (
      select 1 from public.book_club_members
      where book_club_members.club_id = book_clubs.id
        and book_club_members.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a club
create policy "book_clubs_insert" on public.book_clubs
  for insert with check (auth.uid() = creator_id);

-- Creator can update their club
create policy "book_clubs_update" on public.book_clubs
  for update using (auth.uid() = creator_id);

-- Creator can delete their club
create policy "book_clubs_delete" on public.book_clubs
  for delete using (auth.uid() = creator_id);

-- ─── book_club_members ──────────────────────────────────────────────────────
create table if not exists public.book_club_members (
  club_id uuid not null references public.book_clubs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

alter table public.book_club_members enable row level security;

-- Members can see other members of their clubs
create policy "book_club_members_select" on public.book_club_members
  for select using (
    exists (
      select 1 from public.book_club_members as m
      where m.club_id = book_club_members.club_id
        and m.user_id = auth.uid()
    )
  );

-- Users can join clubs (insert themselves)
create policy "book_club_members_insert" on public.book_club_members
  for insert with check (auth.uid() = user_id);

-- Users can leave clubs (delete themselves) or owners can remove members
create policy "book_club_members_delete" on public.book_club_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.book_club_members as m
      where m.club_id = book_club_members.club_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- ─── book_club_messages ─────────────────────────────────────────────────────
create table if not exists public.book_club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.book_clubs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  content text not null check (char_length(content) >= 1 and char_length(content) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.book_club_messages enable row level security;

-- Members can see messages in their clubs
create policy "book_club_messages_select" on public.book_club_messages
  for select using (
    exists (
      select 1 from public.book_club_members
      where book_club_members.club_id = book_club_messages.club_id
        and book_club_members.user_id = auth.uid()
    )
  );

-- Members can post messages in their clubs
create policy "book_club_messages_insert" on public.book_club_messages
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.book_club_members
      where book_club_members.club_id = book_club_messages.club_id
        and book_club_members.user_id = auth.uid()
    )
  );

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_book_clubs_creator on public.book_clubs (creator_id);
create index if not exists idx_book_clubs_public on public.book_clubs (is_public) where is_public = true;
create index if not exists idx_book_club_members_user on public.book_club_members (user_id);
create index if not exists idx_book_club_messages_club_created on public.book_club_messages (club_id, created_at desc);
