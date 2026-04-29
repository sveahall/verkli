import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMarketingEnabled, getNewslettersEnabled } from "@/lib/flags";
import { extractTextFromTiptapNode } from "@/lib/tiptap-content";
import AudienceWorkspace from "@/features/author-workspaces/audience/AudienceWorkspace";

export const dynamic = "force-dynamic";

function extractPlainText(content: unknown): string {
  if (typeof content === "string") {
    try {
      const parsed: unknown = JSON.parse(content);
      return extractTextFromTiptapNode(parsed).replace(/\s+/g, " ").trim();
    } catch {
      return content.trim();
    }
  }
  if (content && typeof content === "object") {
    return extractTextFromTiptapNode(content).replace(/\s+/g, " ").trim();
  }
  return "";
}

export default async function AuthorAudiencePage({
  searchParams,
}: {
  searchParams?: Promise<{
    book?: string;
    bookId?: string;
    surface?: string;
    intent?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialBookId =
    resolvedSearchParams?.bookId?.trim() ||
    resolvedSearchParams?.book?.trim() ||
    null;
  const initialSurface =
    resolvedSearchParams?.surface?.trim() ||
    (resolvedSearchParams?.intent?.trim() === "publish"
      ? "beta-readers"
      : resolvedSearchParams?.intent?.trim() === "campaign"
        ? "campaigns"
        : null);
  const marketingEnabled = getMarketingEnabled();
  const newslettersEnabled = getNewslettersEnabled();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, description, status, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  const bookIds = (books ?? []).map((book) => book.id);
  const chapterExcerptMap = new Map<string, string>();
  const publishedVisibilityByBookId = new Map<string, string | null>();

  type CampaignRow = {
    id: string;
    book_id: string;
    channel: string;
    status: string;
    headline: string | null;
    share_url: string | null;
    updated_at: string | null;
  };
  type NewsletterRow = {
    id: string;
    subject: string;
    status: string;
    sent_at: string | null;
    recipient_count: number;
    created_at: string;
  };

  const [chaptersResult, versionsResult, campaignsResult, newslettersResult, subscriberCountResult] =
    await Promise.all([
      bookIds.length > 0
        ? supabase
            .from("chapters")
            .select("book_id, content")
            .in("book_id", bookIds)
            .order("order", { ascending: true })
        : Promise.resolve({ data: [] as Array<{ book_id: string; content: unknown }> }),
      bookIds.length > 0
        ? supabase
            .from("book_versions")
            .select("book_id, visibility, published_at, updated_at")
            .in("book_id", bookIds)
            .not("published_at", "is", null)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [] as Array<{ book_id: string; visibility: string | null; published_at: string | null; updated_at: string | null }> }),
      bookIds.length > 0
        ? supabase
            .from("marketing_campaigns")
            .select("id, book_id, channel, status, headline, share_url, updated_at")
            .in("book_id", bookIds)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [] as CampaignRow[] }),
      newslettersEnabled
        ? supabase
            .from("newsletters" as never)
            .select("id, subject, status, sent_at, recipient_count, created_at")
            .eq("author_id", user.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as NewsletterRow[] }),
      newslettersEnabled
        ? supabase
            .from("newsletter_subscriptions" as never)
            .select("id", { count: "exact", head: true })
            .eq("author_id", user.id)
            .eq("status", "active")
        : Promise.resolve({ count: 0 }),
    ]);

  if (bookIds.length > 0) {
    for (const chapter of ((chaptersResult.data ?? []) as Array<{ book_id: string; content: unknown }>)) {
      if (chapterExcerptMap.has(chapter.book_id)) continue;
      const text = extractPlainText(chapter.content);
      if (text) chapterExcerptMap.set(chapter.book_id, text.slice(0, 2000));
    }

    for (const version of (versionsResult.data ?? [])) {
      if (publishedVisibilityByBookId.has(version.book_id)) continue;
      publishedVisibilityByBookId.set(version.book_id, version.visibility ?? null);
    }
  }

  const campaigns = campaignsResult.data as CampaignRow[] | null;
  const newsletters = newslettersResult.data as NewsletterRow[] | null;
  const subscriberCount = "count" in subscriberCountResult ? subscriberCountResult.count : 0;

  const bookTitleById = new Map(
    (books ?? []).map((book) => [book.id, book.title ?? "Untitled"] as const)
  );

  return (
    <AudienceWorkspace
      books={(books ?? []).map((book) => ({
        id: book.id,
        title: book.title ?? null,
        cover_image: book.cover_image ?? null,
        description: book.description ?? null,
        chapter_excerpt: chapterExcerptMap.get(book.id) ?? null,
        status: book.status ?? "DRAFT",
        publishedVisibility: publishedVisibilityByBookId.get(book.id) ?? null,
        updatedAt: book.updated_at ?? null,
      }))}
      campaigns={(campaigns ?? []).map((campaign) => ({
        id: campaign.id,
        bookId: campaign.book_id,
        bookTitle: bookTitleById.get(campaign.book_id) ?? "Untitled",
        channel: campaign.channel,
        status: campaign.status,
        headline: campaign.headline ?? null,
        updatedAt: campaign.updated_at ?? null,
        shareUrl: campaign.share_url ?? null,
      }))}
      newsletters={(newsletters as Array<{
        id: string;
        subject: string;
        status: string;
        sent_at: string | null;
        recipient_count: number;
        created_at: string;
      }> | null) ?? []}
      subscriberCount={subscriberCount ?? 0}
      initialBookId={initialBookId}
      initialSurface={initialSurface}
      marketingEnabled={marketingEnabled}
      newslettersEnabled={newslettersEnabled}
    />
  );
}
