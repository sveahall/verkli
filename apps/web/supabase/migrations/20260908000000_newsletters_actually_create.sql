-- newsletters and newsletter_subscriptions: the two tables the whole newsletter
-- feature is built on, neither of which existed.
--
-- Fifth migration found recorded-but-never-run.
-- `20260304000000_consolidate_foundation_from_packages_db.sql` is applied in
-- both the local and remote ledger and contains
-- `CREATE TABLE IF NOT EXISTS public.newsletters` and
-- `public.newsletter_subscriptions`; `to_regclass` returns null for both on the
-- live database. Four of the six tables that migration declares do exist —
-- profiles, shelves, shelf_sections, shelf_books — so it either ran partially
-- or those four came from elsewhere. Either way `db push` will never replay it.
--
-- What was broken: nine `.from("newsletters")` calls and seven
-- `.from("newsletter_subscriptions")` calls across seven API routes,
-- src/lib/newsletters/send.ts and the /author/newsletters pages. Every one
-- reached PostgREST, got a 404 for an unknown relation, and the caller logged
-- and carried on — so an author could open the newsletter composer, write a
-- newsletter, press send, and have nothing happen. Behind
-- `isNewslettersEnabled()`, which is why nobody hit it.
--
-- Found by typing the Supabase clients with `Database`: with the generic
-- applied, `.from("newsletters")` is not a valid table name and the overload
-- simply does not match. That is the entire argument for the generic — this
-- had been invisible for six months behind `as never`.
--
-- DDL copied verbatim from the section that never ran, policies included. No
-- later migration drops or modifies these policies (unlike pod_orders, where
-- a later hardening pass had removed the user INSERT/UPDATE grants), so this
-- is a faithful replay rather than a reconstruction.

CREATE TABLE IF NOT EXISTS public.newsletter_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subscriber_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  UNIQUE (author_id, subscriber_user_id)
);

ALTER TABLE public.newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

-- An author sees their own subscriber rows; a subscriber sees their own
-- subscriptions; only the subscriber may create or change one. Note there is
-- deliberately no author INSERT/UPDATE: an author must not be able to
-- subscribe someone else or resurrect an unsubscribe.
DROP POLICY IF EXISTS "newsletter_subscriptions_select_author" ON public.newsletter_subscriptions;
CREATE POLICY "newsletter_subscriptions_select_author"
  ON public.newsletter_subscriptions FOR SELECT USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "newsletter_subscriptions_select_subscriber" ON public.newsletter_subscriptions;
CREATE POLICY "newsletter_subscriptions_select_subscriber"
  ON public.newsletter_subscriptions FOR SELECT USING (auth.uid() = subscriber_user_id);

DROP POLICY IF EXISTS "newsletter_subscriptions_insert" ON public.newsletter_subscriptions;
CREATE POLICY "newsletter_subscriptions_insert"
  ON public.newsletter_subscriptions FOR INSERT WITH CHECK (auth.uid() = subscriber_user_id);

DROP POLICY IF EXISTS "newsletter_subscriptions_update" ON public.newsletter_subscriptions;
CREATE POLICY "newsletter_subscriptions_update"
  ON public.newsletter_subscriptions FOR UPDATE USING (auth.uid() = subscriber_user_id);

CREATE TABLE IF NOT EXISTS public.newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  sent_at TIMESTAMPTZ,
  recipient_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletters_select" ON public.newsletters;
CREATE POLICY "newsletters_select"
  ON public.newsletters FOR SELECT USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "newsletters_insert" ON public.newsletters;
CREATE POLICY "newsletters_insert"
  ON public.newsletters FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "newsletters_update" ON public.newsletters;
CREATE POLICY "newsletters_update"
  ON public.newsletters FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "newsletters_delete" ON public.newsletters;
CREATE POLICY "newsletters_delete"
  ON public.newsletters FOR DELETE USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_subs_author
  ON public.newsletter_subscriptions (author_id, status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_subscriber
  ON public.newsletter_subscriptions (subscriber_user_id);
CREATE INDEX IF NOT EXISTS idx_newsletters_author
  ON public.newsletters (author_id, created_at DESC);
