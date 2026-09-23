import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMarketingEnabled } from "@/lib/flags";
import MarketingPortalView from "@/features/author-workspaces/marketing/MarketingPortalView";

export default async function AuthorMarketingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawBookId = resolvedSearchParams.bookId;
  const initialBookId =
    typeof rawBookId === "string"
      ? rawBookId
      : Array.isArray(rawBookId)
        ? rawBookId[0] ?? null
        : null;

  const marketingEnabled = getMarketingEnabled();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/author/signin");

  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, language")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  type CampaignPlanListRow = {
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
    mode: string;
    created_at: string;
    updated_at: string;
  };

  const { data: planRowsRaw } = await supabase
    .from("marketing_campaign_plans")
    .select(
      `id, book_id, name, status, template, channels, languages, content_types,
       frequency, start_date, duration_weeks, mode, created_at, updated_at`
    )
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const planRows = (planRowsRaw ?? []) as CampaignPlanListRow[];
  const planIds = planRows.map((p) => p.id);

  type PostStatusRow = { campaign_plan_id: string; status: string };
  const postsByPlan = new Map<string, { total: number; ready: number; posted: number }>();

  if (planIds.length > 0) {
    const { data: postRows } = await supabase
      .from("marketing_posts")
      .select("campaign_plan_id, status")
      .in("campaign_plan_id", planIds);

    for (const row of (postRows ?? []) as unknown as PostStatusRow[]) {
      const bucket = postsByPlan.get(row.campaign_plan_id) ?? {
        total: 0,
        ready: 0,
        posted: 0,
      };
      bucket.total += 1;
      if (row.status === "ready" || row.status === "draft") bucket.ready += 1;
      if (row.status === "posted") bucket.posted += 1;
      postsByPlan.set(row.campaign_plan_id, bucket);
    }
  }

  const titleByBookId = new Map((books ?? []).map((b) => [b.id, b.title ?? null] as const));
  const coverByBookId = new Map((books ?? []).map((b) => [b.id, b.cover_image ?? null] as const));

  const campaigns = planRows.map((plan) => ({
    id: plan.id,
    bookId: plan.book_id,
    bookTitle: titleByBookId.get(plan.book_id) ?? null,
    bookCoverUrl: coverByBookId.get(plan.book_id) ?? null,
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
    counts: postsByPlan.get(plan.id) ?? { total: 0, ready: 0, posted: 0 },
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  }));

  return (
    <MarketingPortalView
      books={(books ?? []).map((book) => ({
        id: book.id,
        title: book.title ?? null,
        cover_image: book.cover_image ?? null,
        language: book.language ?? null,
      }))}
      campaigns={campaigns}
      initialBookId={initialBookId}
      marketingEnabled={marketingEnabled}
    />
  );
}
