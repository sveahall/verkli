-- ---------------------------------------------------------------------------
-- Abuse reporting surface.
--
-- Until now readers had no way to flag comments, reviews, or author content
-- for moderation — only delete (their own) or ignore. This table is the
-- minimum viable triage queue: one row per report, addressed by admins via
-- a future admin view.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (
    target_type IN ('comment', 'review', 'book', 'message', 'user', 'other')
  ),
  target_id text NOT NULL,
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'harassment',
      'spam',
      'hate_speech',
      'sexual_content',
      'copyright',
      'illegal',
      'other'
    )
  ),
  detail text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewing', 'actioned', 'dismissed')
  ),
  reviewed_by_user_id uuid REFERENCES public.profiles (user_id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_reports_status_created_idx
  ON public.content_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS content_reports_reporter_idx
  ON public.content_reports (reporter_user_id);

CREATE INDEX IF NOT EXISTS content_reports_target_idx
  ON public.content_reports (target_type, target_id);

-- One pending report per (reporter, target) pair — prevents a user from
-- flooding a queue with duplicate flags of the same content.
CREATE UNIQUE INDEX IF NOT EXISTS content_reports_unique_pending_idx
  ON public.content_reports (reporter_user_id, target_type, target_id)
  WHERE status = 'pending';

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own reports. They cannot read, update,
-- or delete reports (including their own) — reports are admin-only after
-- submission.
CREATE POLICY content_reports_insert_own ON public.content_reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);
