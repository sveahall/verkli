-- Reader waitlist table (separate from author waitlist)
-- Run in Supabase SQL Editor if the table does not exist.

CREATE TABLE IF NOT EXISTS public.reader_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'onboarded')),
  follow_author TEXT,
  source TEXT,
  priority INT NOT NULL DEFAULT 0,
  wave_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS reader_waitlist_email_uniq ON public.reader_waitlist ((LOWER(TRIM(email))));

CREATE INDEX IF NOT EXISTS reader_waitlist_created_at_idx ON public.reader_waitlist (created_at);

ALTER TABLE public.reader_waitlist ENABLE ROW LEVEL SECURITY;
