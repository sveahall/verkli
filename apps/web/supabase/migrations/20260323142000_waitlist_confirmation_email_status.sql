-- Track confirmation email delivery status for author and reader waitlists.

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS confirmation_email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (confirmation_email_status IN ('pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS confirmation_email_error TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_email_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

ALTER TABLE public.reader_waitlist
  ADD COLUMN IF NOT EXISTS confirmation_email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (confirmation_email_status IN ('pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS confirmation_email_error TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_email_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;
