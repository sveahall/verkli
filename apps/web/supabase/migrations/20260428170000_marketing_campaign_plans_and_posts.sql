-- Marketing portal v2: campaign plans + per-post rows
--
-- A campaign_plan stores the wizard config (start date, channels, languages,
-- content types, weekly schedule, posting frequency, template). The worker
-- expands a plan into N marketing_posts rows — one per scheduled day × channel
-- × language × content_type. Each post is the unit of work the author sees and
-- copies/posts. Designed to support both organic posting (mode='organic') and
-- future paid ads (mode='paid' with paid_config jsonb).

-- ─── marketing_campaign_plans ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_campaign_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'active', 'paused', 'finished', 'failed')),
  template text NOT NULL DEFAULT 'launch'
    CHECK (template IN ('custom', 'launch', 'engagement', 'awareness')),
  channels text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT ARRAY['en']::text[],
  content_types text[] NOT NULL DEFAULT ARRAY['text']::text[],
  frequency text NOT NULL DEFAULT '1-3'
    CHECK (frequency IN ('1-3', '4-5', '6+')),
  start_date date NOT NULL,
  duration_weeks int NOT NULL DEFAULT 4 CHECK (duration_weeks BETWEEN 1 AND 26),
  weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'organic' CHECK (mode IN ('organic', 'paid')),
  paid_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_campaign_plans_book_idx
  ON public.marketing_campaign_plans(book_id);
CREATE INDEX IF NOT EXISTS marketing_campaign_plans_author_idx
  ON public.marketing_campaign_plans(author_id);
CREATE INDEX IF NOT EXISTS marketing_campaign_plans_status_idx
  ON public.marketing_campaign_plans(status);

DROP TRIGGER IF EXISTS update_marketing_campaign_plans_updated_at
  ON public.marketing_campaign_plans;
CREATE TRIGGER update_marketing_campaign_plans_updated_at
  BEFORE UPDATE ON public.marketing_campaign_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.marketing_campaign_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_campaign_plans_select
  ON public.marketing_campaign_plans;
CREATE POLICY marketing_campaign_plans_select
  ON public.marketing_campaign_plans FOR SELECT
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS marketing_campaign_plans_insert
  ON public.marketing_campaign_plans;
CREATE POLICY marketing_campaign_plans_insert
  ON public.marketing_campaign_plans FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_id AND b.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_campaign_plans_update
  ON public.marketing_campaign_plans;
CREATE POLICY marketing_campaign_plans_update
  ON public.marketing_campaign_plans FOR UPDATE
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS marketing_campaign_plans_delete
  ON public.marketing_campaign_plans;
CREATE POLICY marketing_campaign_plans_delete
  ON public.marketing_campaign_plans FOR DELETE
  USING (author_id = auth.uid());

COMMENT ON TABLE public.marketing_campaign_plans IS
  'Wizard-level campaign config. Expanded into marketing_posts rows by worker.';
COMMENT ON COLUMN public.marketing_campaign_plans.weekly_schedule IS
  'JSONB: { mon: ["instagram", "tiktok"], tue: [...], ... } — channels active per weekday';
COMMENT ON COLUMN public.marketing_campaign_plans.paid_config IS
  'Reserved for paid ads: budget_usd, audience, objective, dates. Empty for organic.';

-- ─── marketing_posts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_plan_id uuid NOT NULL REFERENCES public.marketing_campaign_plans(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  channel text NOT NULL
    CHECK (channel IN ('instagram', 'tiktok', 'youtube', 'facebook', 'x', 'threads')),
  language text NOT NULL DEFAULT 'en',
  content_type text NOT NULL DEFAULT 'text'
    CHECK (content_type IN ('text', 'trailer', 'podcast')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'asset_pending', 'asset_failed', 'posted', 'skipped')),
  headline text,
  caption text,
  hashtags text,
  cta text,
  share_url text,
  media_asset_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  media_asset_url text,
  asset_error text,
  posted_at timestamptz,
  posted_url text,
  mode text NOT NULL DEFAULT 'organic' CHECK (mode IN ('organic', 'paid')),
  paid_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_posts_plan_idx
  ON public.marketing_posts(campaign_plan_id);
CREATE INDEX IF NOT EXISTS marketing_posts_book_idx
  ON public.marketing_posts(book_id);
CREATE INDEX IF NOT EXISTS marketing_posts_author_idx
  ON public.marketing_posts(author_id);
CREATE INDEX IF NOT EXISTS marketing_posts_scheduled_idx
  ON public.marketing_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS marketing_posts_status_idx
  ON public.marketing_posts(status);

DROP TRIGGER IF EXISTS update_marketing_posts_updated_at
  ON public.marketing_posts;
CREATE TRIGGER update_marketing_posts_updated_at
  BEFORE UPDATE ON public.marketing_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_posts_select ON public.marketing_posts;
CREATE POLICY marketing_posts_select
  ON public.marketing_posts FOR SELECT
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS marketing_posts_insert ON public.marketing_posts;
CREATE POLICY marketing_posts_insert
  ON public.marketing_posts FOR INSERT
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS marketing_posts_update ON public.marketing_posts;
CREATE POLICY marketing_posts_update
  ON public.marketing_posts FOR UPDATE
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS marketing_posts_delete ON public.marketing_posts;
CREATE POLICY marketing_posts_delete
  ON public.marketing_posts FOR DELETE
  USING (author_id = auth.uid());

COMMENT ON TABLE public.marketing_posts IS
  'Per-post rows expanded from a campaign plan: one per day × channel × language × content_type.';
COMMENT ON COLUMN public.marketing_posts.status IS
  'draft → ready (text done) → asset_pending (trailer/podcast generating) → posted (author marked it) | skipped';
COMMENT ON COLUMN public.marketing_posts.mode IS
  'organic = manual copy/paste post. paid = future ads spend.';
