-- A refunded or disputed book purchase kept its access forever.
--
-- `finalize_order_checkout_session` grants access by inserting into
-- `entitlements`, and nothing ever removed it. The Stripe webhook's switch has
-- no `charge.refunded` and no `charge.dispute.created` case, so both fall to
-- `default: { received: true, ignored: true }` — acknowledged with a 200 and
-- dropped. Refund the money in the Stripe dashboard and the buyer keeps the
-- book; the same holds after a chargeback, where the money is taken back
-- whether we agree or not.
--
-- Three things had to change to make revocation possible at all.
--
-- 1. There was no way to find the order from a refund event.
--    Orders store `stripe_session_id`. A `charge.refunded` event carries a
--    charge with a `payment_intent`, and metadata is set on the Checkout
--    Session only — `payment_intent_data[metadata]` is never passed — so the
--    charge arrives with nothing that identifies the order. Hence
--    `stripe_payment_intent_id`, written by the webhook when it finalizes.
--
-- 2. `orders.status` allowed only ('pending','paid','failed'), so there was no
--    value to record a refund as. 'refunded' is added rather than reusing
--    'failed', which means "the payment never succeeded" — a distinction that
--    matters for revenue reporting and for the author's payout ledger.
--
-- 3. Revocation has to be atomic with the status change. If the entitlement
--    delete and the status update can land separately, a crash between them
--    leaves either a refunded order that still grants access or a revoked
--    entitlement on an order that still reads as paid. Hence an RPC rather
--    than three calls from the handler.
--
-- Safe to add these columns and constraints with no backfill: orders,
-- entitlements, pod_orders and donations are all empty on this database
-- (verified 2026-09-07), so there is no historical row to reconcile.

alter table public.orders
  add column if not exists stripe_payment_intent_id text;

comment on column public.orders.stripe_payment_intent_id is
  'Stripe PaymentIntent for this order, recorded at finalize time. This is the ONLY link from a charge.refunded / charge.dispute.created event back to the order — those events carry no session id and no metadata.';

-- Partial: rows sit with it null until the webhook finalizes them, and a plain
-- unique index would collapse every unfinalized order into one.
create unique index if not exists orders_stripe_payment_intent_id_key
  on public.orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'refunded'));

/**
 * Revoke access for a refunded or disputed order, atomically.
 *
 * Returns true only when this call is the one that performed the revocation.
 * A Stripe retry, or a `charge.refunded` following a dispute on the same
 * charge, finds status='refunded' and returns false, so the audit row is
 * written exactly once.
 */
create or replace function public.revoke_order_for_refund(
  p_payment_intent_id text,
  p_kind text default 'refund'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_deleted integer;
begin
  if p_payment_intent_id is null or btrim(p_payment_intent_id) = '' then
    return false;
  end if;

  select * into v_order
  from public.orders
  where stripe_payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    return false;
  end if;

  if v_order.status = 'refunded' then
    return false;
  end if;

  update public.orders set status = 'refunded' where id = v_order.id;

  -- Deleted, not flagged. A `revoked_at` column would require every read path
  -- that checks access to also filter on it, and one missed filter silently
  -- keeps the book readable — the exact failure this migration exists to fix.
  -- A row that is not there cannot grant anything.
  --
  -- Scoped to source='purchase' so a refund cannot strip access that something
  -- else granted. The partial unique indexes on entitlements mean at most one
  -- row exists per (user, book[, chapter]), so if that row came from a
  -- subscription this deletes nothing — which is correct, the subscription
  -- still entitles them.
  if v_order.chapter_id is null then
    delete from public.entitlements
    where user_id = v_order.user_id
      and book_id = v_order.book_id
      and chapter_id is null
      and source = 'purchase';
  else
    delete from public.entitlements
    where user_id = v_order.user_id
      and book_id = v_order.book_id
      and chapter_id = v_order.chapter_id
      and source = 'purchase';
  end if;
  get diagnostics v_deleted = row_count;

  -- Column names are entity_type / entity_id / meta. The migration that
  -- created this table names target_type / metadata / occurred_at; the live
  -- table does not have those. Verified against the live schema.
  insert into public.audit_log (action, entity_type, entity_id, meta)
  values (
    'order.access_revoked',
    'order',
    v_order.id::text,
    jsonb_build_object(
      'kind', p_kind,
      'user_id', v_order.user_id,
      'book_id', v_order.book_id,
      'chapter_id', v_order.chapter_id,
      'amount', v_order.amount,
      'currency', v_order.currency,
      'payment_intent_id', p_payment_intent_id,
      'entitlements_deleted', v_deleted
    )
  );

  return true;
end;
$$;

revoke all on function public.revoke_order_for_refund(text, text) from public;
grant execute on function public.revoke_order_for_refund(text, text) to service_role;

comment on function public.revoke_order_for_refund(text, text) is
  'Called by the Stripe webhook on charge.refunded (full refunds only) and charge.dispute.created. Sets orders.status=refunded, deletes the purchase entitlement and writes an audit_log row, in one transaction. Idempotent: returns false if already refunded.';
