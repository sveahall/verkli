import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookEditor from "./BookEditor";

export default async function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 16+: params is a Promise, must await
  const { id } = await params;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_image, author_id, status, language, original_source, original_url, is_translation, original_book_id, translation_status, audiobook_status")
    .eq("id", id)
    .maybeSingle();

  if (!book || book.author_id !== user.id) {
    notFound();
  }

  const { data: latestAudiobookAsset } = await supabase
    .from("audiobook_assets")
    .select("id, audio_url, status, created_at")
    .eq("book_id", book.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, content, order")
    .eq("book_id", book.id)
    .order("order", { ascending: true });

  const { data: marketingCampaigns } = await supabase
    .from("marketing_campaigns")
    .select("id, book_id, language, channel, status, headline, caption, cta, hashtags, share_url, created_at, updated_at")
    .eq("book_id", book.id);

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
        book={book}
        chapters={chapters ?? []}
        latestAudiobookAsset={latestAudiobookAsset ?? null}
        marketingCampaigns={marketingCampaigns ?? []}
      />
    </main>
  );
}
