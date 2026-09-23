-- The column the reader onboarding flow has always assumed exists.
--
-- api/reader/onboarding/route.ts WRITES `onboarding_completed_at` on the final
-- step, checks the error, and returns 500 — so completing reader onboarding has
-- been returning HTTP 500 against the live database, which has no such column.
-- reader/onboarding/page.tsx READS it to skip the flow for a returning reader,
-- and discards that error, so the redirect could never fire either: a reader who
-- somehow got through was sent back through onboarding on every visit.
--
-- Probed live 2026-09-05 before writing this: the column is absent from
-- `profiles`, and absent from every migration in this directory. It was never
-- added, not dropped.
--
-- Additive, nullable, no backfill. NULL means "has not finished onboarding",
-- which is the correct reading for every existing row: nobody can have completed
-- it, because completing it has never been possible.
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed_at is
  'When the reader finished onboarding. NULL means not finished. Read by reader/onboarding to skip the flow; written by api/reader/onboarding on the final step.';
