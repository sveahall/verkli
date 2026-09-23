-- pod_orders: the table six source files write to, which does not exist.
--
-- `20260317120000_pod_orders.sql` is recorded as applied in BOTH the local and
-- remote ledger, and `to_regclass('public.pod_orders')` is still null on the
-- live database. That is the fourth migration found in this state — the DDL
-- never ran, the row was written by `migration repair --status applied`, and
-- `db push` will never re-run it. Hence a fresh timestamp replaying the DDL
-- rather than an edit to the original file.
--
-- What this broke: physical-book checkout, end to end and silently. Every
-- caller reaches the table through `.from("pod_orders" as never)`, so the cast
-- suppressed the type error, PostgREST answered 404, and the callers logged and
-- moved on. /reader/orders rendered an empty physical-orders list, and
-- api/books/[id]/pod/checkout failed at its first insert — while the book page
-- advertised the option.
--
-- ── The part that is not a copy ──────────────────────────────────────────────
--
-- The original migration granted users INSERT and UPDATE on their own rows.
-- `20260402120000_security_hardening_round3.sql` dropped both as M1
-- ("pod_orders payment bypass — same vulnerability class as orders/
-- entitlements"), because a policy letting a user write their own row lets them
-- insert one with status='paid' and receive a physical book for free.
--
-- That hardening was wrapped in `IF to_regclass('public.pod_orders') IS NOT
-- NULL`, so on this database it did nothing at all. Replaying the original DDL
-- verbatim would therefore create the table WITH the payment bypass, six months
-- after it was supposedly fixed. Only the SELECT policy is created here.
--
-- Verified safe: every write goes through createAdminClient() (service role,
-- bypasses RLS) — api/books/[id]/pod/checkout, lib/payments/pod.ts and
-- stripeWebhook.handlers.ts. The only user-scoped client touching this table is
-- the SELECT in /reader/orders, which the remaining policy covers.

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

-- Partial unique: the webhook writes stripe_session_id on payment, so rows sit
-- with it null until then and a plain unique index would collapse them.
create unique index if not exists pod_orders_stripe_session_id_key
  on public.pod_orders (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists pod_orders_user_id_idx on public.pod_orders (user_id);
create index if not exists pod_orders_book_id_idx on public.pod_orders (book_id);

create or replace function public.pod_orders_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- `create trigger` has no IF NOT EXISTS before PG 14 syntax we can rely on
-- here, so drop first to keep this migration re-runnable.
drop trigger if exists pod_orders_updated_at on public.pod_orders;
create trigger pod_orders_updated_at
  before update on public.pod_orders
  for each row execute function public.pod_orders_set_updated_at();

alter table public.pod_orders enable row level security;

-- SELECT only. See the note above: INSERT and UPDATE for users are the M1
-- payment bypass and are deliberately absent. Do not add them back; add a
-- server route using createAdminClient() instead.
drop policy if exists "Users can view their own pod orders" on public.pod_orders;
create policy "Users can view their own pod orders"
  on public.pod_orders for select
  using (auth.uid() = user_id);

-- Belt and braces: if the original migration ever does run on some other
-- database, these two get removed again rather than silently reinstating the
-- bypass.
drop policy if exists "Users can insert their own pod orders" on public.pod_orders;
drop policy if exists "Users can update their own pod orders" on public.pod_orders;
