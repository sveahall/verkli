-- FAS 5: Beta gating (user_flags) + Feedback system

-- ─────────────────────────────────────────────────────────────────────────────
-- public.user_flags
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_flags (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  beta_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_flags_select_own ON public.user_flags;
CREATE POLICY user_flags_select_own ON public.user_flags
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE: only service role

COMMENT ON TABLE public.user_flags IS 'Feature flags per user; beta gating; writes via service role only';

-- ─────────────────────────────────────────────────────────────────────────────
-- public.feedback
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('bug', 'idea', 'other')),
  message text NOT NULL CHECK (char_length(message) <= 2000),
  url text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'done'))
);

CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback(created_at);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON public.feedback(status);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- User can INSERT (own or anonymous when user_id null)
DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert ON public.feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- User can SELECT own rows only
DROP POLICY IF EXISTS feedback_select_own ON public.feedback;
CREATE POLICY feedback_select_own ON public.feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- UPDATE/DELETE: only service role (admin triage)

COMMENT ON TABLE public.feedback IS 'User feedback; user insert + select own; admin via service role';
