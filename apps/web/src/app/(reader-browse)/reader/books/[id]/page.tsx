import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLanguageLabel, getSeoLanguageLabel, normalizeLanguage } from "@/lib/languages";
import type { Metadata } from "next";
import StartReadingLink from "./StartReadingLink";

async function getBook(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id, language, original_url, is_translation, original_book_id, audiobook_status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  if (!book || (book.status && book.status !== "PUBLISHED")) {
    return { title: "Book not found | Verkli" };
  }
  const lang = normalizeLanguage((book as { language?: string | null }).language);
  const title = `${book.title} ${getSeoLanguageLabel(lang)}`;
  const descSuffix = `Read ${book.title} in ${getLanguageLabel(lang)} on Verkli.`;
  const description =
    `${descSuffix} ${(book.description ?? "").slice(0, 120)}${(book.description ?? "").length > 120 ? "…" : ""}`.trim();
  return {
    title: `${title} | Verkli`,
    description: description || descSuffix,
  };
}

export default async function ReaderBookDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id, language, original_url, is_translation, original_book_id, audiobook_status")
    .eq("id", id)
    .maybeSingle();

  if (!book || (book.status && book.status !== "PUBLISHED")) {
    notFound();
  }

  const { data: audiobookAsset } = await supabase
    .from("audiobook_assets")
    .select("id")
    .eq("book_id", book.id)
    .limit(1)
    .maybeSingle();

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", book.author_id)
    .maybeSingle();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_id", book.id)
    .order("order", { ascending: true });

  const chaptersCount = chapters?.length ?? 0;
  const firstChapter = chapters?.[0];

  const { data: { user } } = await supabase.auth.getUser();
  let lastChapterId: string | null = firstChapter?.id ?? null;
  if (user) {
    const { data: reading } = await supabase
      .from("readings")
      .select("chapter_id")
      .eq("user_id", user.id)
      .eq("book_id", book.id)
      .maybeSingle();
    if (reading?.chapter_id) lastChapterId = reading.chapter_id;
  }

  const authorName = authorProfile?.display_name || authorProfile?.username || "Author";
  const lang = normalizeLanguage((book as { language?: string | null }).language);
  const languageName = getLanguageLabel(lang);
  const originalUrl = (book as { original_url?: string | null }).original_url;
  const isTranslation = Boolean((book as { is_translation?: boolean | null }).is_translation);
  const originalBookId = (book as { original_book_id?: string | null }).original_book_id;
  const audiobookStatus = (book as { audiobook_status?: string | null }).audiobook_status;
  const audiobookAvailable = audiobookStatus === "published" && audiobookAsset != null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050508] dark:text-white">
      <header className="mx-auto max-w-[1100px] px-6 pt-10">
        <Link href="/reader/discover" className="text-[13px] text-slate-600 hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
          ← Back to discover
        </Link>
      </header>

      <section className="mx-auto grid max-w-[1100px] gap-10 px-6 py-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative overflow-hidden rounded-[28px] border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/5">
          {(book as { cover_image?: string | null }).cover_image ? (
            <img src={(book as { cover_image?: string | null }).cover_image!} alt={book.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-[360px] w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
              <span className="text-[18px] font-semibold text-slate-700 dark:text-white/70">No cover</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div>
          <h1 className="text-[36px] font-semibold tracking-tight text-slate-900 dark:text-white md:text-[44px]">
            {book.title}
          </h1>
          <Link
            href={`/reader/authors/${book.author_id}`}
            className="mt-2 block text-[15px] text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/80"
          >
            {authorName}
          </Link>

          <div className="mt-6 flex flex-wrap gap-3 text-[12px] text-slate-600 dark:text-white/60">
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {chaptersCount ?? 0} chapters
            </span>
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">Published</span>
            <span className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300" aria-label={`Language: ${languageName}`}>
              {languageName}
            </span>
          </div>

          <p className="mt-4 text-[14px] font-medium text-slate-700 dark:text-white/80">
            Read in {languageName} on Verkli
          </p>

          {audiobookAvailable && (
            <p className="mt-2 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
              Audiobook available
            </p>
          )}

          <p className="mt-6 text-[15px] leading-relaxed text-slate-600 dark:text-white/60">
            {book.description || "No description yet."}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <StartReadingLink
              bookId={book.id}
              firstChapterId={firstChapter?.id ?? null}
              serverChapterId={user ? lastChapterId : null}
            />
            {isTranslation && originalUrl && (
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                Original on Amazon
                <span aria-hidden>↗</span>
              </a>
            )}
            {isTranslation && originalBookId && (
              <Link
                href={`/reader/books/${originalBookId}`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                Original on Verkli
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
