import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookEditor from "./BookEditor";

type BookRow = {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  author_id: string;
  status: string;
  language: string | null;
  original_source: string | null;
  original_url: string | null;
  is_translation: boolean | null;
  original_book_id: string | null;
  translation_status: string | null;
  audiobook_status: string | null;
};

export default async function BookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const { lang: langParam } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: bookById } = await supabase
    .from("books")
    .select("id, title, description, cover_image, author_id, status, language, original_source, original_url, is_translation, original_book_id, translation_status, audiobook_status")
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (!bookById) {
    notFound();
  }

  const groupId = (bookById as BookRow).original_book_id ?? id;
  const { data: groupBooks } = await supabase
    .from("books")
    .select("id, title, description, cover_image, author_id, status, language, original_source, original_url, is_translation, original_book_id, translation_status, audiobook_status")
    .eq("author_id", user.id)
    .or(`id.eq.${groupId},original_book_id.eq.${groupId}`)
    .order("id");

  const books = (groupBooks ?? []) as BookRow[];
  if (books.length === 0) {
    notFound();
  }

  const defaultBookId =
    langParam && langParam !== "original"
      ? books.find((b) => b.is_translation && String(b.language).toLowerCase() === langParam.toLowerCase())?.id ??
        books.find((b) => b.id === groupId)?.id ??
        books[0].id
      : books.find((b) => b.id === groupId)?.id ?? books[0].id;

  const bookIds = books.map((b) => b.id);
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, book_id, title, content, order")
    .in("book_id", bookIds)
    .order("order", { ascending: true });

  const chaptersByBookId = new Map<string, { id: string; title: string; content: string | null; order: number }[]>();
  for (const ch of allChapters ?? []) {
    const list = chaptersByBookId.get(ch.book_id) ?? [];
    list.push({ id: ch.id, title: ch.title, content: ch.content, order: ch.order });
    chaptersByBookId.set(ch.book_id, list);
  }

  const defaultBook = books.find((b) => b.id === defaultBookId) ?? books[0];
  const { data: latestAudiobookAsset } = await supabase
    .from("audiobook_assets")
    .select("id, audio_url, status, created_at")
    .eq("book_id", defaultBook.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: marketingCampaigns } = await supabase
    .from("marketing_campaigns")
    .select("id, book_id, language, channel, status, headline, caption, cta, hashtags, share_url, created_at, updated_at")
    .eq("book_id", defaultBook.id);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-[1200px] px-6 pt-10">
        <Link
          href="/author/books"
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to books
        </Link>
      </header>

      <BookEditor
        groupId={groupId}
        groupBooks={books}
        defaultBookId={defaultBookId}
        book={defaultBook}
        chapters={chaptersByBookId.get(defaultBook.id) ?? []}
        chaptersByBookId={Object.fromEntries(
          [...chaptersByBookId.entries()].map(([bid, chs]) => [bid, chs])
        )}
        latestAudiobookAsset={latestAudiobookAsset ?? null}
        marketingCampaigns={marketingCampaigns ?? []}
      />
    </main>
  );
}
