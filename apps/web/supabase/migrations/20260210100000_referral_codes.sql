-- Referral: one code per user; redemptions track who used which code (one redemption per redeemer).

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redeemer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(redeemer_id)
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_select_own ON public.referral_codes;
CREATE POLICY referral_codes_select_own ON public.referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS referral_codes_insert_own ON public.referral_codes;
CREATE POLICY referral_codes_insert_own ON public.referral_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Redemptions: users can only read their own (as referrer or redeemer)
DROP POLICY IF EXISTS referral_redemptions_select_own ON public.referral_redemptions;
CREATE POLICY referral_redemptions_select_own ON public.referral_redemptions
  FOR SELECT
  USING (auth.uid() = redeemer_id OR auth.uid() = referrer_id);

CREATE INDEX IF NOT EXISTS referral_codes_code_idx ON public.referral_codes (code);
CREATE INDEX IF NOT EXISTS referral_redemptions_redeemer_id_idx ON public.referral_redemptions (redeemer_id);
