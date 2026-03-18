-- Print on Demand orders table
create table if not exists public.pod_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  format text not null check (format in ('softcover', 'hardcover')),
  amount integer not null,
  currency text not null,
  provider text not null default 'stripe',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  stripe_session_id text,
  shipping_address jsonb,
  fulfillment_status text not null default 'unfulfilled'
    check (fulfillment_status in ('unfulfilled', 'submitted', 'printing', 'shipped', 'delivered')),
  fulfillment_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique index on stripe_session_id (where not null)
create unique index if not exists pod_orders_stripe_session_id_key
  on public.pod_orders (stripe_session_id)
  where stripe_session_id is not null;

-- Index for user lookups
create index if not exists pod_orders_user_id_idx on public.pod_orders (user_id);

-- Index for book lookups
create index if not exists pod_orders_book_id_idx on public.pod_orders (book_id);

-- Auto-update updated_at
create or replace function public.pod_orders_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger pod_orders_updated_at
  before update on public.pod_orders
  for each row execute function public.pod_orders_set_updated_at();

-- RLS
alter table public.pod_orders enable row level security;

create policy "Users can view their own pod orders"
  on public.pod_orders for select
  using (auth.uid() = user_id);

create policy "Users can insert their own pod orders"
  on public.pod_orders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own pod orders"
  on public.pod_orders for update
  using (auth.uid() = user_id);
