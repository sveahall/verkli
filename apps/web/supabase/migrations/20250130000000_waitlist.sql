-- Waitlist table for pre-launch signups
-- Run this in your Supabase project (Dashboard SQL Editor or CLI) if the table does not exist.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one signup per email
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_key ON public.waitlist (LOWER(TRIM(email)));

-- Optional: index for ordering / position queries
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON public.waitlist (created_at);

-- RLS: allow service role to bypass; optionally enable RLS and add no policies so only service role can write
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Policy: no direct anon/authenticated access; API uses service role
-- (Service role bypasses RLS. If you want to allow reads for your app, add a SELECT policy here.)
