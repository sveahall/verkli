import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_SOCIAL_CAMPAIGN_NOT_FOUND,
  isValidUuid,
} from "@/lib/api-errors";

export const runtime = "nodejs";

type CampaignPlanFull = {
  id: string;
  book_id: string;
  author_id: string;
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
  books: { id: string; title: string | null; cover_image: string | null } | null;
};

type PostRow = {
  id: string;
  campaign_plan_id: string;
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
  created_at: string;
  updated_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const { id } = await params;
  if (!isValidUuid(id)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();

  const { data: plan, error: planErr } = await supabase
    .from("marketing_campaign_plans")
    .select(
      `id, book_id, author_id, name, status, template, channels, languages,
       content_types, frequency, start_date, duration_weeks, weekly_schedule,
       mode, paid_config, generation_error, created_at, updated_at,
       books!marketing_campaign_plans_book_id_fkey(id, title, cover_image)`
    )
    .eq("id", id)
    .eq("author_id", gate.user.id)
    .maybeSingle<CampaignPlanFull>();

  if (planErr) {
    console.error("[campaign get] plan:", planErr.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!plan) return apiError(E_SOCIAL_CAMPAIGN_NOT_FOUND, 404);

  const { data: postsRaw, error: postsErr } = await supabase
    .from("marketing_posts")
    .select(
      `id, campaign_plan_id, scheduled_for, channel, language, content_type,
       status, headline, caption, hashtags, cta, share_url, media_asset_id,
       media_asset_url, asset_error, posted_at, posted_url, mode, metadata,
       created_at, updated_at`
    )
    .eq("campaign_plan_id", id)
    .order("scheduled_for", { ascending: true });

  if (postsErr) {
    console.error("[campaign get] posts:", postsErr.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

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
    metadata: p.metadata,
  }));

  return NextResponse.json({
    campaign: {
      id: plan.id,
      bookId: plan.book_id,
      bookTitle: plan.books?.title ?? null,
      bookCoverUrl: plan.books?.cover_image ?? null,
      name: plan.name,
      status: plan.status,
      template: plan.template,
      channels: plan.channels,
      languages: plan.languages,
      contentTypes: plan.content_types,
      frequency: plan.frequency,
      startDate: plan.start_date,
      durationWeeks: plan.duration_weeks,
      weeklySchedule: plan.weekly_schedule,
      mode: plan.mode,
      paidConfig: plan.paid_config,
      generationError: plan.generation_error,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
    },
    posts,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const { id } = await params;
  if (!isValidUuid(id)) return apiError(E_INVALID_BOOK_ID, 400);

  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_campaign_plans")
    .delete()
    .eq("id", id)
    .eq("author_id", gate.user.id);

  if (error) {
    console.error("[campaign delete]:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ ok: true });
}
