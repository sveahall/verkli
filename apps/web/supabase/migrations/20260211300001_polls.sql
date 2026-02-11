-- Polls feature tables
-- polls, poll_options, poll_votes

-- polls
CREATE TABLE IF NOT EXISTS public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  question text NOT NULL CHECK (char_length(trim(question)) BETWEEN 1 AND 500),
  is_active boolean NOT NULL DEFAULT true,
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- poll_options
CREATE TABLE IF NOT EXISTS public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(trim(text)) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0
);

-- poll_votes (composite PK — one vote per user per poll)
CREATE TABLE IF NOT EXISTS public.poll_votes (
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

-- Indexes
CREATE INDEX polls_author_id_idx ON public.polls(author_id);
CREATE INDEX polls_book_id_idx ON public.polls(book_id) WHERE book_id IS NOT NULL;
CREATE INDEX polls_active_idx ON public.polls(is_active, created_at DESC) WHERE is_active = true;
CREATE INDEX poll_options_poll_id_idx ON public.poll_options(poll_id, sort_order);
CREATE INDEX poll_votes_option_id_idx ON public.poll_votes(option_id);

-- RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- polls: anyone authenticated can read active polls, author manages own
CREATE POLICY polls_select ON public.polls FOR SELECT USING (
  is_active = true OR auth.uid() = author_id
);
CREATE POLICY polls_insert ON public.polls FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY polls_update ON public.polls FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY polls_delete ON public.polls FOR DELETE USING (auth.uid() = author_id);

-- poll_options: visible when poll is visible
CREATE POLICY poll_options_select ON public.poll_options FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND (p.is_active = true OR p.author_id = auth.uid()))
);
CREATE POLICY poll_options_insert ON public.poll_options FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND p.author_id = auth.uid())
);

-- poll_votes: anyone authenticated can vote, read own votes
CREATE POLICY poll_votes_select ON public.poll_votes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY poll_votes_insert ON public.poll_votes FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND p.is_active = true)
);
