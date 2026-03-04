create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb default '{}',
  read boolean not null default false,
  actor_id uuid references auth.users(id) on delete set null,
  entity_id text,
  entity_type text,
  created_at timestamptz not null default now()
);
create index idx_notifications_user_unread on notifications(user_id, read, created_at desc);
alter table notifications enable row level security;
create policy "Users see own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users update own notifications" on notifications for update using (auth.uid() = user_id);
