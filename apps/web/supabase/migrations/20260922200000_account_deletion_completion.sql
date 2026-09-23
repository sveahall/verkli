-- Records that a deletion request was carried out, so the nightly sweep is
-- idempotent and an admin can tell "asked and done" from "asked and waiting".
--
-- `deletion_requested_at` is cleared by the sweep, exactly as a withdrawal
-- clears it; this column is what distinguishes the two afterwards.
alter table public.profiles
  add column deletion_completed_at timestamptz;

-- No index needed: 20260423150000 already created the partial
-- `profiles_deletion_requested_idx` on `deletion_requested_at` alongside the
-- column, which is exactly what the sweep scans.

comment on column public.profiles.deletion_requested_at is 'When the account holder asked us to close the account. Cleared both by withdrawal and by the sweep that carries it out.';
comment on column public.profiles.deletion_completed_at is 'When the teardown ran. Personal data is erased and sign-in disabled; orders and pod_orders are retained for bookkeeping, and books are left untouched because unpublishing would revoke access readers paid for.';
