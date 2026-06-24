-- Add richer questionnaire fields to author_applications so admins have enough
-- context to judge an applicant (motivation, writing background, work samples).
-- All columns are nullable and idempotent; RLS is unchanged.
ALTER TABLE author_applications
  ADD COLUMN IF NOT EXISTS motivation text,
  ADD COLUMN IF NOT EXISTS writing_background text,
  ADD COLUMN IF NOT EXISTS work_samples text;
