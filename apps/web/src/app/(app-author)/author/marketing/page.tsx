import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMarketingEnabled } from "@/lib/flags";
import { extractTextFromTiptapNode } from "@/lib/tiptap-content";
import MarketingPortalWizard from "@/components/marketing/MarketingPortalWizard";
import type { Book } from "@/lib/marketing/types";

type MarketingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

  const bookIds = (books ?? []).map((b) => b.id);

  // Fetch first chapter content for each book (for auto-description)
  const chapterExcerptMap = new Map<string, string>();
  if (bookIds.length > 0) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("book_id, content")
      .in("book_id", bookIds)
      .order("order", { ascending: true });

    for (const ch of (chapters ?? []) as Array<{ book_id: string; content: unknown }>) {
      if (chapterExcerptMap.has(ch.book_id)) continue;
      const text = extractPlainText(ch.content);
      if (text) chapterExcerptMap.set(ch.book_id, text.slice(0, 2000));
    }
  }

  const resolvedBooks: Book[] = (books ?? []).map((book) => ({
    id: book.id,
    title: book.title ?? null,
    cover_image: book.cover_image ?? null,
    description: book.description ?? null,
    chapter_excerpt: chapterExcerptMap.get(book.id) ?? null,
  }));
  const initialBookId =
    selectedBookId && resolvedBooks.some((book) => book.id === selectedBookId)
      ? selectedBookId
      : null;

  return <MarketingPortalWizard books={resolvedBooks} initialBookId={initialBookId} />;
}
