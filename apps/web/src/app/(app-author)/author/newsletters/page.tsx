import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getNewslettersEnabled } from "@/lib/flags";
import { requireAuthorRole } from "@/lib/auth/require-author";
import NewslettersPageClient from "./NewslettersPageClient";

type NewsletterRow = {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
};

export default async function NewslettersPage() {
  if (!getNewslettersEnabled()) {
    redirect("/author/home");
  }

  const authResult = await requireAuthorRole();
  if (!authResult.ok) {
    redirect("/reader/signin");
  }
  const user = authResult.user;

  const supabase = await createClient();

  // Fetch newsletters
  const { data: newsletters } = await supabase
    .from("newsletters" as never)
    .select("id, subject, status, sent_at, recipient_count, created_at")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const typedNewsletters = (newsletters as NewsletterRow[] | null) ?? [];

  // Fetch active subscriber count
  const { count: subscriberCount } = await supabase
    .from("newsletter_subscriptions" as never)
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .eq("status", "active");

  return (
    <NewslettersPageClient
      newsletters={typedNewsletters}
      subscriberCount={subscriberCount ?? 0}
    />
  );
}
