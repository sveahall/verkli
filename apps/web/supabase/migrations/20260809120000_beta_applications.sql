-- Round-one beta applications.
--
-- Separate from `author_applications` (which is account-bound: its primary key
-- is auth.users.id). Applicants here come from the pre-launch waitlist and have
-- no account yet, by design — the invitation email promises a short set of
-- questions and nothing else.
--
-- Answers are stored as JSON rather than one column per question so the
-- questionnaire can change without a migration. The authoritative question set
-- lives in apps/web/src/lib/apply/questions.ts.

CREATE TABLE IF NOT EXISTS public.beta_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  round text NOT NULL DEFAULT 'round_one',
  source text,
  -- Set when the applicant's email matches a pre-launch waitlist row, so a
  -- reviewer can see at a glance who was actually invited.
  waitlist_id uuid REFERENCES public.waitlist(id) ON DELETE SET NULL,
  on_waitlist boolean NOT NULL DEFAULT false,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One application per email per round. A re-submission updates the existing row
-- rather than creating a duplicate for the reviewer to disambiguate.
CREATE UNIQUE INDEX IF NOT EXISTS beta_applications_email_round_uniq
  ON public.beta_applications (LOWER(TRIM(email)), round);

CREATE INDEX IF NOT EXISTS beta_applications_status_idx
  ON public.beta_applications (status, created_at DESC);

ALTER TABLE public.beta_applications ENABLE ROW LEVEL SECURITY;

-- No policies are defined on purpose: with RLS enabled and no policy, anon and
-- authenticated roles get no access at all. Both the public submit route and
-- the admin review list go through the service-role client, which bypasses RLS.
-- This matches how public.waitlist is handled.

COMMENT ON TABLE public.beta_applications IS
  'Round-one private beta applications from the pre-launch waitlist. Account-less; reviewed manually.';
