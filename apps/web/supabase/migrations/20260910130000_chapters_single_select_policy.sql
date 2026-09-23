-- The entitlement fix did not take: anon still read a paid book's chapter.
--
-- 20260910120000 replaced "Chapters of published versions are viewable" with a
-- version that requires an entitlement, `db push` reported success, and the
-- anon key still returned the chapter body of a 49 kr book. Measured, not
-- assumed.
--
-- Why a correct policy changed nothing: PostgreSQL RLS policies are PERMISSIVE
-- by default and OR together. Tightening one of several SELECT policies grants
-- exactly nothing — any other permissive policy that says yes still says yes.
-- So there is at least one more SELECT policy on `public.chapters` that the
-- migrations do not define. `grep -rn "ON public.chapters" supabase/migrations`
-- finds exactly one SELECT policy, so the other was written by hand in the
-- dashboard and has never been in version control.
--
-- That is not a new phenomenon here: 20260909120000 found three book_clubs
-- tables whose policies existed only in the dashboard, and used this same
-- discover-at-runtime shape because the names could not be known in advance.
--
-- ── What this does ──────────────────────────────────────────────────────────
--
-- Drops EVERY SELECT policy on public.chapters, announcing each one first so
-- the push output is the only surviving record of what the hand-written ones
-- were called and what they allowed, then recreates the single correct one.
--
-- Scoped to cmd = 'SELECT' deliberately. The authors' INSERT/UPDATE/DELETE
-- policies from 20260203000000 are untouched — nothing is wrong with them, and
-- dropping write policies would lock authors out of their own manuscripts.
--
-- After this, `chapters` has exactly one SELECT policy, so "the policy is
-- correct" and "access is correct" mean the same thing again.

do $$
declare
  pol record;
  n int := 0;
begin
  for pol in
    select policyname, permissive, roles, qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chapters'
      and cmd = 'SELECT'
    order by policyname
  loop
    n := n + 1;
    raise notice 'dropping SELECT policy on chapters: % (permissive=%, roles=%)',
      pol.policyname, pol.permissive, pol.roles;
    raise notice '    USING: %', pol.qual;
    execute format('drop policy %I on public.chapters', pol.policyname);
  end loop;
  raise notice 'dropped % SELECT polic(y/ies) on public.chapters', n;
  if n < 2 then
    raise notice 'NOTE: fewer than 2 existed, so the OR-ing theory needs rechecking against the anon probe.';
  end if;
end $$;

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- The one SELECT policy. Same visibility and partial-release rules as
-- 20260219120000, plus the price check from 20260910120000.
CREATE POLICY "Chapters of published versions are viewable"
  ON public.chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.book_versions bv
      JOIN public.books b ON b.id = bv.book_id
      WHERE bv.id = chapters.book_version_id
        AND (
          b.author_id = auth.uid()
          OR (
            bv.published_at IS NOT NULL
            AND (
              bv.visibility = 'public'
              OR (
                bv.visibility = 'followers'
                AND EXISTS (
                  SELECT 1
                  FROM public.author_followers f
                  WHERE f.author_id = b.author_id
                    AND f.follower_id = auth.uid()
                )
              )
            )
            AND (
              bv.published_chapter_count IS NULL
              OR chapters."order" < bv.published_chapter_count
            )
            AND (
              b.is_free
              OR public.has_book_entitlement(b.id, chapters.id, auth.uid())
            )
          )
        )
    )
  );

COMMENT ON TABLE public.chapters IS
  'Manuscript text. Exactly ONE SELECT policy by design: RLS policies are permissive and OR together, so a second one silently reopens the paywall no matter how strict this one is. Add conditions here; never add a policy beside it.';
