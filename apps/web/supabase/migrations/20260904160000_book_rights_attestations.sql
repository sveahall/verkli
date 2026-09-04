-- Rights attestation for uploaded manuscripts.
--
-- Records that an author asserted, at a specific moment and against specific
-- wording, that they hold the rights to a manuscript they uploaded. The point of
-- the table is the RECORD: a gate that collects an attestation and does not
-- durably store it is worse than no gate, because it manufactures the
-- appearance of diligence without the substance.
--
-- Purely additive. One CREATE TABLE, no ALTER on anything existing, no backfill.
-- This repo has five confirmed live-vs-migration drifts, so apply it
-- deliberately: `npx supabase migration list` first, never a blind `db push`.
--
-- ── Two shape decisions that look like omissions and are not ──────────────────
--
-- NO FOREIGN KEYS, on purpose.
--   `books` is hard-deleted by the admin tooling (api/admin/books/route.ts:138
--   does `admin.from("books").delete().eq("id", bookId)`). A cascading FK would
--   therefore mean that *enforcing* the policy destroys the evidence that
--   justified enforcing it — the attestation would vanish at the exact moment it
--   became the reason for the takedown. `audit_log` made the same call for the
--   same reason. The cost is that book_id can go stale; that is the right trade
--   for a legal record.
--
-- NO INSERT, UPDATE OR DELETE POLICY, on purpose.
--   Writes are service-role only, from the API route. An author must not be able
--   to create, alter or remove their own attestation. This matters concretely:
--   `books` UPDATE is ownership-only with no column restriction, and the browser
--   already writes it directly with the anon key
--   (editor/panels/PublishPanel.tsx:155 updates `books.description`), so a
--   column on `books` or `profiles` would be rewritable from devtools. The
--   existing age-verification flow does exactly that and is the pattern NOT to
--   follow. Only SELECT-own is granted here, so an author can see what they
--   signed.

create table if not exists public.book_rights_attestations (
  id uuid primary key default gen_random_uuid(),

  -- Identity comes from the authenticated session server-side, never the body.
  user_id uuid not null,

  -- Null on the legacy import path, where the worker creates the book after the
  -- attestation is already recorded. Deliberately not an FK; see the header.
  book_id uuid,
  book_import_id uuid,

  -- What was actually shown, not just a pointer to it. A version alone is a
  -- reference into a git history nobody will reconstruct during a dispute.
  wording_version text not null,
  shown_wording jsonb not null default '{}'::jsonb,

  -- The assertions. Each must be explicitly true; an absent value is not "no".
  holds_rights boolean not null,
  is_own_work boolean not null,
  consequences_acknowledged boolean not null,

  -- An unverified claim about the world. Nothing in this product can check it —
  -- there is no ISBN or registry lookup anywhere — so it must never be rendered
  -- as though it were verified, and it must not silently gate publishing.
  previously_published boolean not null,
  prior_publication_detail text,

  file_name text,

  -- Server-set. Never accept a client-supplied timestamp on a legal record.
  accepted_at timestamptz not null default now(),

  -- Collection of these is already disclosed by the privacy policy under
  -- security/abuse-prevention. RETENTION is the open question: the policy
  -- promises removal within 30 days of account deletion except where legally
  -- required, and an attestation kept for our own liability defence is not
  -- obviously that. Left nullable so the decision can be a later migration
  -- rather than a blocker now.
  ip text,
  user_agent text,
  request_id text,

  -- A withdrawal must never be a DELETE. Unused in v1, present so that the
  -- first person who needs it is not tempted to remove the row.
  withdrawn_at timestamptz
);

create index if not exists book_rights_attestations_book_idx
  on public.book_rights_attestations (book_id, accepted_at desc);

create index if not exists book_rights_attestations_user_idx
  on public.book_rights_attestations (user_id, accepted_at desc);

alter table public.book_rights_attestations enable row level security;

-- SELECT-own only. See the header for why there is deliberately nothing else.
drop policy if exists "Author reads own rights attestations" on public.book_rights_attestations;
create policy "Author reads own rights attestations"
  on public.book_rights_attestations
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.book_rights_attestations is
  'Append-only record of an author asserting rights over an uploaded manuscript. Service-role writes only; no FKs so that deleting the book does not destroy the evidence. See the migration header before changing the policy set.';
