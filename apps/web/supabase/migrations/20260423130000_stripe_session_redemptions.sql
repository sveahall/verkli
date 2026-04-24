-- ---------------------------------------------------------------------------
-- One-time redemption tracking for Stripe checkout sessions used as a
-- client-side bypass to the Pro/Plus billing gate on translate/audiobook.
--
-- Before this table, `books/[id]/translate` and `books/[id]/audiobook/generate`
-- accepted a `stripeSessionId` from the client and only checked that the
-- session's payment_status was "paid" and the metadata matched the caller.
-- Nothing prevented the same session id from being replayed, so a single
-- purchase could unlock unlimited translations/audiobooks.
--
-- This table holds an INSERT-to-claim row per (session_id, kind). An
-- application attempting to redeem a session INSERTs before doing the
-- expensive work; on 23505 the session was already consumed and we fall
-- back to the subscription gate.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_session_redemptions (
  stripe_session_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('translation', 'audiobook')),
  user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  book_id uuid,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stripe_session_id, kind)
);

CREATE INDEX IF NOT EXISTS stripe_session_redemptions_user_idx
  ON public.stripe_session_redemptions (user_id);

CREATE INDEX IF NOT EXISTS stripe_session_redemptions_book_idx
  ON public.stripe_session_redemptions (book_id)
  WHERE book_id IS NOT NULL;

-- Lock the table down: only the service role should write redemptions.
ALTER TABLE public.stripe_session_redemptions ENABLE ROW LEVEL SECURITY;

-- No user-facing policies: callers interact via the service-role admin
-- client. Any user-facing read would leak purchase history between users.
