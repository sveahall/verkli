import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeWorkspace from "@/features/author-workspaces/home/HomeWorkspace";

export default async function AuthorHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, status, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(8);

  const drafts = (books ?? []).map((book) => ({
    id: book.id,
    title: book.title ?? "Untitled",
    status: book.status ?? "DRAFT",
    updatedAt: book.updated_at ?? null,
  }));
  const bookIds = drafts.map((book) => book.id);
  const bookTitleById = new Map(drafts.map((book) => [book.id, book.title] as const));

  let campaigns: Array<{
    id: string;
    bookId: string;
    bookTitle: string;
    channel: string;
    status: string;
    headline: string | null;
    updatedAt: string | null;
  }> = [];

  if (bookIds.length > 0) {
    const { data: campaignRows } = await supabase
      .from("marketing_campaigns")
      .select("id, book_id, channel, status, headline, updated_at")
      .in("book_id", bookIds)
      .order("updated_at", { ascending: false })
      .limit(8);

    campaigns = (campaignRows ?? []).map((campaign) => ({
      id: campaign.id,
      bookId: campaign.book_id,
      bookTitle: bookTitleById.get(campaign.book_id) ?? "Untitled",
      channel: campaign.channel,
      status: campaign.status,
      headline: campaign.headline ?? null,
      updatedAt: campaign.updated_at ?? null,
    }));
  }

  const { count: subscriberCount } = await supabase
    .from("newsletter_subscriptions" as never)
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .eq("status", "active");

  // ── Growth signals ──
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // Readers today: distinct readers across author's books
  let readersToday = 0;
  if (bookIds.length > 0) {
    const { count } = await supabase
      .from("readings")
      .select("id", { count: "exact", head: true })
      .in("book_id", bookIds)
      .gte("last_read_at", todayISO);
    readersToday = count ?? 0;
  }

  return (
    <HomeWorkspace
      drafts={drafts}
      campaigns={campaigns}
      subscriberCount={subscriberCount ?? 0}
      readersToday={readersToday}
    />
  );
}
