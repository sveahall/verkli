import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ReaderBookDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_url, status, author_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!book || (book.status && book.status !== "PUBLISHED")) {
    notFound();
  }

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", book.author_id)
    .maybeSingle();

  const { count: chaptersCount } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("book_id", book.id);

  return (
    <main className="min-h-screen bg-[#050508] text-white">
      <header className="mx-auto max-w-[1100px] px-6 pt-10">
        <Link href="/reader" className="text-[13px] text-white/50 hover:text-white/70">
          ← Back to discover
        </Link>
      </header>

      <section className="mx-auto grid max-w-[1100px] gap-10 px-6 py-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-[360px] w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
              <span className="text-[18px] font-semibold text-white/70">No cover</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div>
          <h1 className="text-[36px] font-semibold tracking-tight text-white md:text-[44px]">
            {book.title}
          </h1>
          <p className="mt-2 text-[15px] text-white/60">
            {authorProfile?.display_name || authorProfile?.username || "Author"}
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-[12px] text-white/60">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {chaptersCount ?? 0} chapters
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Published</span>
          </div>

          <p className="mt-6 text-[15px] leading-relaxed text-white/60">
            {book.description || "No description yet."}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href={`/reader/read/${book.id}`}
              className="rounded-full bg-[#907AFF] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#8069EE]"
            >
              Start reading
            </Link>
            <button className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-[14px] font-semibold text-white/70 hover:bg-white/10">
              Add to library
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
