import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMarketingEnabled } from "@/lib/flags";
import MarketingPortalWizard from "@/components/marketing/MarketingPortalWizard";
import type { Book } from "@/lib/marketing/types";

type MarketingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthorMarketingPage({ searchParams }: MarketingPageProps) {
  if (!getMarketingEnabled()) {
    redirect("/author/home");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawSelectedBookId = resolvedSearchParams.bookId;
  const selectedBookId =
    typeof rawSelectedBookId === "string"
      ? rawSelectedBookId
      : Array.isArray(rawSelectedBookId)
        ? rawSelectedBookId[0] ?? null
        : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, description")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  const resolvedBooks: Book[] = (books ?? []).map((book) => ({
    id: book.id,
    title: book.title ?? null,
    cover_image: book.cover_image ?? null,
    description: book.description ?? null,
  }));
  const initialBookId =
    selectedBookId && resolvedBooks.some((book) => book.id === selectedBookId)
      ? selectedBookId
      : null;

  return <MarketingPortalWizard books={resolvedBooks} initialBookId={initialBookId} />;
}
