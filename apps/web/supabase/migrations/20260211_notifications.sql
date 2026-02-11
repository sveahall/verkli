-- Notifications feed: user-scoped inbox items with read state.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN (
      'comment_reply',
      'new_follower',
      'book_published',
      'purchase',
      'review',
      'newsletter',
      'poll',
      'club_event',
      'system'
    )
  ),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_id text,
  entity_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_at_idx
  ON public.notifications(user_id, read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_authenticated ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR auth.uid() = actor_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.notifications IS 'User notification inbox items with read state and lightweight metadata.';
