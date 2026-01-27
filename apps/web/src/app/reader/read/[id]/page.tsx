import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ReaderReadPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!book || (book.status && book.status !== "PUBLISHED")) {
    notFound();
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, content, order")
    .eq("book_id", book.id)
    .order("order", { ascending: true });

  const firstChapter = chapters?.[0];

  return (
    <main className="min-h-screen bg-[#050508] text-white">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-8">
        <Link href={`/reader/books/${book.id}`} className="text-[13px] text-white/50 hover:text-white/70">
          ← Back to book
        </Link>
        <span className="text-[13px] text-white/40">Reading mode</span>
      </header>

      <section className="mx-auto grid max-w-[1200px] gap-8 px-6 pb-16 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-[16px] font-semibold">Chapters</h2>
          <div className="mt-4 space-y-3 text-[13px] text-white/60">
            {chapters && chapters.length > 0 ? (
              chapters.map((chapter) => (
                <div key={chapter.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  {chapter.order}. {chapter.title}
                </div>
              ))
            ) : (
              <div className="text-white/40">No chapters yet.</div>
            )}
          </div>
        </aside>

        <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-8">
          <h1 className="text-[26px] font-semibold">{book.title}</h1>
          {firstChapter ? (
            <>
              <h2 className="mt-6 text-[18px] font-semibold text-white/80">{firstChapter.title}</h2>
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-white/70">
                {firstChapter.content ? (
                  firstChapter.content.split("\n").map((line, index) => (
                    <p key={`${firstChapter.id}-${index}`}>{line}</p>
                  ))
                ) : (
                  <p>No content yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-6 text-white/50">Content coming soon.</p>
          )}
        </article>
      </section>
    </main>
  );
}
