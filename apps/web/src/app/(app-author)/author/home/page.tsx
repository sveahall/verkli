import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeWorkspace from "@/features/author-workspaces/home/HomeWorkspace";

type EventRow = {
  event_name: string;
  path: string | null;
};

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
      bookTitle: bookTitleById.get(campaign.book_id) ?? "Untitled",
      channel: campaign.channel,
      status: campaign.status,
      headline: campaign.headline ?? null,
      updatedAt: campaign.updated_at ?? null,
    }));
  }

  let views = 0;
  let reads = 0;
  if (bookIds.length > 0) {
    const { data: events } = await supabase
      .from("analytics_events")
      .select("event_name, path")
      .limit(5000);

    for (const event of (events ?? []) as EventRow[]) {
      const path = event.path ?? "";
      if (!bookIds.some((bookId) => path.includes(bookId))) continue;
      const eventName = event.event_name.toLowerCase();
      if (eventName.includes("read") || eventName.includes("chapter_read")) {
        reads += 1;
      } else {
        views += 1;
      }
    }
  }

  const { count: bookmarkCount } =
    bookIds.length > 0
      ? await supabase
          .from("bookmarks")
          .select("id", { count: "exact", head: true })
          .in("book_id", bookIds)
      : { count: 0 };

  const { count: subscriberCount } = await supabase
    .from("newsletter_subscriptions" as never)
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .eq("status", "active");

  return (
    <HomeWorkspace
      drafts={drafts}
      campaigns={campaigns}
      readerActivity={{
        views,
        reads,
        bookmarks: bookmarkCount ?? 0,
        subscribers: subscriberCount ?? 0,
      }}
    />
  );
}
