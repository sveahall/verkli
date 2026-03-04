-- Newsletter tables
-- Migration: 00010_newsletters.sql

-- ─── newsletter_subscriptions ───────────────────────────────────────────────
create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users on delete cascade,
  subscriber_user_id uuid not null references auth.users on delete cascade,
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unique (author_id, subscriber_user_id)
);

alter table public.newsletter_subscriptions enable row level security;

-- Authors can see their own subscribers
create policy "newsletter_subscriptions_select_author" on public.newsletter_subscriptions
  for select using (auth.uid() = author_id);

-- Users can see their own subscriptions
create policy "newsletter_subscriptions_select_subscriber" on public.newsletter_subscriptions
  for select using (auth.uid() = subscriber_user_id);

-- Users can subscribe (insert)
create policy "newsletter_subscriptions_insert" on public.newsletter_subscriptions
  for insert with check (auth.uid() = subscriber_user_id);

-- Users can manage their own subscriptions (update status)
create policy "newsletter_subscriptions_update" on public.newsletter_subscriptions
  for update using (auth.uid() = subscriber_user_id);

-- ─── newsletters ────────────────────────────────────────────────────────────
create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users on delete cascade,
  subject text not null,
  body_html text not null default '',
  body_text text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.newsletters enable row level security;

-- Authors manage their own newsletters
create policy "newsletters_select" on public.newsletters
  for select using (auth.uid() = author_id);

create policy "newsletters_insert" on public.newsletters
  for insert with check (auth.uid() = author_id);

create policy "newsletters_update" on public.newsletters
  for update using (auth.uid() = author_id);

create policy "newsletters_delete" on public.newsletters
  for delete using (auth.uid() = author_id);

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_newsletter_subs_author on public.newsletter_subscriptions (author_id, status);
create index if not exists idx_newsletter_subs_subscriber on public.newsletter_subscriptions (subscriber_user_id);
create index if not exists idx_newsletters_author on public.newsletters (author_id, created_at desc);
