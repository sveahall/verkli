-- The waitlist has no memory of who has been invited, so an invitation run
-- cannot be repeated safely.
--
-- `public.waitlist` records only whether the *confirmation* email went out
-- (confirmation_email_status, which now reads 'sent' for all 104 rows). There
-- is no column for the beta invitation that follows it, so a second run of
-- scripts/send-beta-invitations.ts would mail 101 real people a duplicate.
-- That is the whole reason this column exists: it is the idempotency key.
--
-- `public.reader_waitlist` already has `invited_at` and is a different, smaller
-- list (35 reader rows). This is the author-side list the 104 signups landed
-- on. The two are deliberately not merged here — see lib/auth/beta.ts, which
-- reads both.
--
-- Additive and nullable: nothing existing reads or writes it, and every current
-- row keeps meaning exactly what it meant before (null = never invited).

alter table public.waitlist
  add column if not exists beta_invited_at timestamptz;

comment on column public.waitlist.beta_invited_at is
  'When the beta invitation email was sent to this address. Null means never invited. Written only by scripts/send-beta-invitations.ts, which skips any row where this is already set — removing it re-arms a duplicate send to everyone.';
