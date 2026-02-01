import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TiptapRenderer from "@/components/editor/TiptapRenderer";
import ReadingProgress from "./ReadingProgress";

export default async function ReaderReadPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const { chapterId } = await params;

  const supabase = await createClient();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, content, order, book_id")
    .eq("id", chapterId)
    .maybeSingle();

  if (!chapter) notFound();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, status")
    .eq("id", chapter.book_id)
    .maybeSingle();

  if (!book || book.status !== "PUBLISHED") {
    notFound();
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_id", book.id)
    .order("order", { ascending: true });

  const chapterIndex = chapters?.findIndex((c) => c.id === chapterId) ?? 0;
  const totalChapters = chapters?.length ?? 1;
  const progressPercent = totalChapters > 0 ? Math.round(((chapterIndex + 1) / totalChapters) * 100) : 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050508] dark:text-white">
      <ReadingProgress
        bookId={book.id}
        chapterId={chapter.id}
        progressPercent={progressPercent}
      />
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-8">
        <Link href={`/reader/books/${book.id}`} className="text-[13px] text-slate-600 hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
          ← Back to book
        </Link>
        <span className="text-[13px] text-slate-500 dark:text-white/40">Reading mode</span>
      </header>

      <section className="mx-auto grid max-w-[1200px] gap-8 px-6 pb-16 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[24px] border border-black/10 bg-black/[0.04] p-6 dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-[16px] font-semibold">Chapters</h2>
          <div className="mt-4 space-y-3 text-[13px] text-slate-600 dark:text-white/60">
            {chapters && chapters.length > 0 ? (
              chapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/reader/read/${ch.id}`}
                  className={`block rounded-xl border px-3 py-2 transition dark:border-white/10 dark:bg-white/5 ${
                    ch.id === chapter.id
                      ? "border-[#907AFF]/50 bg-[#907AFF]/10 dark:border-[#907AFF]/40 dark:bg-[#907AFF]/15"
                      : "border-black/10 bg-black/[0.02] hover:border-black/20 dark:hover:border-white/20"
                  }`}
                >
                  {ch.order}. {ch.title}
                </Link>
              ))
            ) : (
              <div className="text-slate-500 dark:text-white/40">No chapters yet.</div>
            )}
          </div>
        </aside>

        <article className="rounded-[24px] border border-black/10 bg-black/[0.04] p-8 dark:border-white/10 dark:bg-white/[0.04]">
          <h1 className="text-[26px] font-semibold">{book.title}</h1>
          <h2 className="mt-6 text-[18px] font-semibold text-slate-800 dark:text-white/80">{chapter.title}</h2>
          <div className="mt-4 text-[15px] leading-relaxed text-slate-700 dark:text-white/70">
            {chapter.content ? (
              <TiptapRenderer content={chapter.content} />
            ) : (
              <p>No content yet.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
