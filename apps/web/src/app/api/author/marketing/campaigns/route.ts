import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { requireProBillingForApi } from "@/lib/billing/server";
import { enqueueMarketingJob } from "@/lib/marketing-queue";
import { createCampaignPlanBodySchema } from "@/lib/marketing/schemas";
import { normalizeLanguage } from "@/lib/languages";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_QUEUE_UNAVAILABLE,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

type CampaignPlanRow = {
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
  created_at: string;
  updated_at: string;
};

type CampaignPlanWithBook = CampaignPlanRow & {
  books: { id: string; title: string | null; cover_image: string | null } | null;
};

export async function GET(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const url = new URL(request.url);
  const bookId = url.searchParams.get("bookId");

  const supabase = await createClient();
  let query = supabase
    .from("marketing_campaign_plans")
    .select(
      `id, book_id, author_id, name, status, template, channels, languages,
       content_types, frequency, start_date, duration_weeks, weekly_schedule,
       mode, paid_config, created_at, updated_at,
       books!marketing_campaign_plans_book_id_fkey(id, title, cover_image)`
    )
    .eq("author_id", gate.user.id)
    .order("created_at", { ascending: false });

  if (bookId) query = query.eq("book_id", bookId);

  const { data: plans, error } = await query;

  if (error) {
    console.error("[campaigns list] db error:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const planRows = (plans ?? []) as unknown as CampaignPlanWithBook[];
  const planIds = planRows.map((p) => p.id);

  // Lookup post counts per plan
  let postsByPlan: Record<string, { total: number; ready: number; posted: number }> = {};
  if (planIds.length > 0) {
    const { data: postsRaw } = await supabase
      .from("marketing_posts")
      .select("campaign_plan_id, status")
      .in("campaign_plan_id", planIds);

    type PostCountRow = { campaign_plan_id: string; status: string };
    postsByPlan = ((postsRaw ?? []) as unknown as PostCountRow[]).reduce<
      Record<string, { total: number; ready: number; posted: number }>
    >((acc, row) => {
      const bucket = acc[row.campaign_plan_id] ?? { total: 0, ready: 0, posted: 0 };
      bucket.total += 1;
      if (row.status === "ready" || row.status === "draft") bucket.ready += 1;
      if (row.status === "posted") bucket.posted += 1;
      acc[row.campaign_plan_id] = bucket;
      return acc;
    }, {});
  }

  const campaigns = planRows.map((plan) => ({
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
    mode: plan.mode,
    counts: postsByPlan[plan.id] ?? { total: 0, ready: 0, posted: 0 },
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  }));

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const proGate = await requireProBillingForApi(gate.user.id);
  if (!proGate.ok) return proGate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = createCampaignPlanBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400, {
      detail: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("id, title, author_id, cover_image, language")
    .eq("id", input.bookId)
    .maybeSingle();

  if (bookErr) {
    console.error("[campaigns create] book lookup:", bookErr.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book || book.author_id !== gate.user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const normalizedLanguages = Array.from(
    new Set(input.languages.map((l) => normalizeLanguage(l)))
  );

  const { data: inserted, error: insertErr } = await supabase
    .from("marketing_campaign_plans")
    .insert({
      book_id: input.bookId,
      author_id: gate.user.id,
      name: input.name ?? `${book.title ?? "Campaign"} – ${input.startDate}`,
      status: "generating",
      template: input.template,
      channels: input.channels,
      languages: normalizedLanguages,
      content_types: input.contentTypes,
      frequency: input.frequency,
      start_date: input.startDate,
      duration_weeks: input.durationWeeks,
      weekly_schedule: input.weeklySchedule,
      mode: input.mode,
      paid_config: input.paidConfig ?? {},
    })
    .select(
      `id, book_id, author_id, name, status, template, channels, languages,
       content_types, frequency, start_date, duration_weeks, weekly_schedule,
       mode, paid_config, created_at, updated_at`
    )
    .single<CampaignPlanRow>();

  if (insertErr || !inserted) {
    console.error("[campaigns create] insert:", insertErr?.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const jobId = await enqueueMarketingJob({
    bookId: input.bookId,
    authorId: gate.user.id,
    channels: input.channels,
    language: normalizedLanguages[0] ?? "en",
    campaignPlanId: inserted.id,
  });

  if (!jobId) {
    // Mark plan as failed so the user sees a clear error
    await supabase
      .from("marketing_campaign_plans")
      .update({ status: "failed", generation_error: "queue_unavailable" })
      .eq("id", inserted.id);
    return apiError(E_QUEUE_UNAVAILABLE, 503);
  }

  return NextResponse.json({
    campaign: {
      id: inserted.id,
      bookId: inserted.book_id,
      status: inserted.status,
      jobId,
    },
  });
}
