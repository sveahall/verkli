import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MarketingDashboard from "@/components/marketing/MarketingDashboard";
import type { Campaign } from "@/lib/marketing/types";

export default async function authorMarketingRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title")
    .eq("author_id", user.id);

  const bookIds = (books ?? []).map((b) => b.id);
  const bookTitleById = new Map((books ?? []).map((b) => [b.id, b.title ?? ""]));

  let campaigns: Campaign[] = [];
  if (bookIds.length > 0) {
    const { data: rows } = await supabase
      .from("marketing_campaigns")
      .select("id, book_id, status, channel, headline, updated_at")
      .in("book_id", bookIds)
      .order("updated_at", { ascending: false });

    campaigns = (rows ?? []).map((row) => ({
      id: row.id,
      name: (row.headline ?? bookTitleById.get(row.book_id) ?? "Campaign") + ` (${row.channel})`,
      objective: "",
      status: row.status === "published" ? "active" : row.status === "scheduled" ? "scheduled" : "draft",
      updatedAt: row.updated_at ?? new Date().toISOString(),
      channels: [row.channel],
    }));
  }

  const bookOptions = (books ?? []).map((b) => ({ id: b.id, title: b.title ?? "" }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingDashboard initialCampaigns={campaigns} initialBooks={bookOptions} />
    </div>
  );
}
