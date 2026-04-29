import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMarketingEnabled } from "@/lib/flags";
import CampaignDetailView from "@/features/author-workspaces/marketing/CampaignDetailView";

export default async function MarketingCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const marketingEnabled = getMarketingEnabled();
  if (!marketingEnabled) redirect("/author/marketing");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/author/signin");

  type CampaignPlanFull = {
    id: string;
    book_id: string;
    name: string | null;
    status: string;
    template: string;
    channels: string[];
    languages: string[];
    content_types: string[];
    frequency: string;
    start_date: string;
    duration_weeks: number;
    weekly_schedule: Record<string, string[]>;
    mode: string;
    paid_config: Record<string, unknown>;
    generation_error: string | null;
    created_at: string;
    updated_at: string;
  };

  const { data: planRaw } = await supabase
    .from("marketing_campaign_plans")
    .select(
      `id, book_id, name, status, template, channels, languages, content_types,
       frequency, start_date, duration_weeks, weekly_schedule, mode, paid_config,
       generation_error, created_at, updated_at`
    )
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle<CampaignPlanFull>();

  if (!planRaw) notFound();
  const plan: CampaignPlanFull = planRaw;

  const { data: bookRaw } = await supabase
    .from("books")
    .select("id, title, cover_image")
    .eq("id", plan.book_id)
    .maybeSingle();

  type PostRow = {
    id: string;
    scheduled_for: string;
    channel: string;
    language: string;
    content_type: string;
    status: string;
    headline: string | null;
    caption: string | null;
    hashtags: string | null;
    cta: string | null;
    share_url: string | null;
    media_asset_id: string | null;
    media_asset_url: string | null;
    asset_error: string | null;
    posted_at: string | null;
    posted_url: string | null;
    mode: string;
    metadata: Record<string, unknown>;
  };

  const { data: postsRaw } = await supabase
    .from("marketing_posts")
    .select(
      `id, scheduled_for, channel, language, content_type, status, headline,
       caption, hashtags, cta, share_url, media_asset_id, media_asset_url,
       asset_error, posted_at, posted_url, mode, metadata`
    )
    .eq("campaign_plan_id", id)
    .order("scheduled_for", { ascending: true });

  const posts = ((postsRaw ?? []) as unknown as PostRow[]).map((p) => ({
    id: p.id,
    scheduledFor: p.scheduled_for,
    channel: p.channel,
    language: p.language,
    contentType: p.content_type,
    status: p.status,
    headline: p.headline,
    caption: p.caption,
    hashtags: p.hashtags,
    cta: p.cta,
    shareUrl: p.share_url,
    mediaAssetId: p.media_asset_id,
    mediaAssetUrl: p.media_asset_url,
    assetError: p.asset_error,
    postedAt: p.posted_at,
    postedUrl: p.posted_url,
    mode: p.mode,
  }));

  return (
    <CampaignDetailView
      campaign={{
        id: plan.id,
        bookId: plan.book_id,
        bookTitle: bookRaw?.title ?? null,
        bookCoverUrl: bookRaw?.cover_image ?? null,
        name: plan.name,
        status: plan.status,
        template: plan.template,
        channels: plan.channels,
        languages: plan.languages,
        contentTypes: plan.content_types,
        frequency: plan.frequency,
        startDate: plan.start_date,
        durationWeeks: plan.duration_weeks,
        mode: plan.mode,
        generationError: plan.generation_error,
      }}
      posts={posts}
    />
  );
}
