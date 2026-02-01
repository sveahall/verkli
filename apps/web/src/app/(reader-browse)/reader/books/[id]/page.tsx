import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StartReadingLink from "./StartReadingLink";

export default async function ReaderBookDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id")
    .eq("id", id)
    .maybeSingle();

  if (!book || (book.status && book.status !== "PUBLISHED")) {
    notFound();
  }

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
            href={`/reader/writers/${book.author_id}`}
            className="mt-2 block text-[15px] text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/80"
          >
            {authorName}
          </Link>

          <div className="mt-6 flex flex-wrap gap-3 text-[12px] text-slate-600 dark:text-white/60">
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {chaptersCount ?? 0} chapters
            </span>
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">Published</span>
          </div>

          <p className="mt-6 text-[15px] leading-relaxed text-slate-600 dark:text-white/60">
            {book.description || "No description yet."}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <StartReadingLink
              bookId={book.id}
              firstChapterId={firstChapter?.id ?? null}
              serverChapterId={user ? lastChapterId : null}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
