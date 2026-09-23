-- Book Clubs feature tables
-- book_clubs, book_club_members, book_club_messages

-- book_clubs
CREATE TABLE IF NOT EXISTS public.book_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  description text CHECK (char_length(description) <= 2000),
  cover_url text,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  max_members integer NOT NULL DEFAULT 50 CHECK (max_members BETWEEN 2 AND 500),
  current_book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- book_club_members (composite PK)
CREATE TABLE IF NOT EXISTS public.book_club_members (
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

-- book_club_messages
CREATE TABLE IF NOT EXISTS public.book_club_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX book_clubs_creator_id_idx ON public.book_clubs(creator_id);
CREATE INDEX book_clubs_is_public_idx ON public.book_clubs(is_public) WHERE is_public = true;
CREATE INDEX book_club_members_user_id_idx ON public.book_club_members(user_id);
CREATE INDEX book_club_messages_club_id_created_idx ON public.book_club_messages(club_id, created_at DESC);

-- RLS
ALTER TABLE public.book_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_club_messages ENABLE ROW LEVEL SECURITY;

-- book_clubs: public clubs visible to all authenticated, private only to members
CREATE POLICY book_clubs_select ON public.book_clubs FOR SELECT USING (
  is_public = true
  OR EXISTS (SELECT 1 FROM public.book_club_members m WHERE m.club_id = id AND m.user_id = auth.uid())
);
CREATE POLICY book_clubs_insert ON public.book_clubs FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY book_clubs_update ON public.book_clubs FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY book_clubs_delete ON public.book_clubs FOR DELETE USING (auth.uid() = creator_id);

-- book_club_members: members see fellow members, public clubs visible to all
CREATE POLICY bcm_select ON public.book_club_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.book_club_members m2 WHERE m2.club_id = club_id AND m2.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.book_clubs c WHERE c.id = club_id AND c.is_public = true)
);
CREATE POLICY bcm_insert ON public.book_club_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY bcm_delete ON public.book_club_members FOR DELETE USING (auth.uid() = user_id);

-- book_club_messages: only members read/write
CREATE POLICY bcmsg_select ON public.book_club_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.book_club_members m WHERE m.club_id = club_id AND m.user_id = auth.uid())
);
CREATE POLICY bcmsg_insert ON public.book_club_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.book_club_members m WHERE m.club_id = club_id AND m.user_id = auth.uid())
  AND auth.uid() = user_id
);
