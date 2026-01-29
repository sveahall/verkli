import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GlassSurface from "@/components/GlassSurface";

export default async function BookDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/writer/signin");
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_image, author_id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!book || book.author_id !== user.id) {
    notFound();
  }

  const { count: chaptersCount } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("book_id", book.id);

  let readsCount: number | null = null;
  const { count, error } = await supabase
    .from("readings" as never)
    .select("id", { count: "exact", head: true })
    .eq("book_id", book.id);

  if (!error) readsCount = count ?? null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-[1200px] px-6 pt-10">
        <Link
          href="/writer"
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to library
        </Link>
      </header>

      <section className="mx-auto grid max-w-[1200px] gap-12 px-6 py-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="relative">
          <div className="relative overflow-hidden rounded-[32px]">
            {(book as { cover_image?: string | null }).cover_image ? (
              <img src={(book as { cover_image?: string | null }).cover_image!} alt={book.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-[420px] w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                <span className="text-sm text-white/70">No cover</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-white/60">
            <span className="rounded-full border border-black/10 bg-black/2 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {(readsCount ?? 0).toLocaleString()} readers
            </span>
            <span className="rounded-full border border-black/10 bg-black/2 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {chaptersCount ?? 0} chapters
            </span>
            <span className="rounded-full border border-black/10 bg-black/2 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {book.status ?? "DRAFT"}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-5xl">
            {book.title}
          </h1>
          <p className="mt-2 text-lg text-slate-600 dark:text-white/60">by you</p>

          <div className="mt-8 flex flex-wrap gap-4">
            <GlassSurface width="auto" height="auto" borderRadius={999} className="glass-button border border-[#907AFF]/30">
              <button className="px-6 py-3 text-sm font-semibold text-slate-900 dark:text-white">
                Continue editing
              </button>
            </GlassSurface>
            <button className="rounded-full border border-black/10 bg-black/2 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-black/20 hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10">
              View public page
            </button>
          </div>

          <div className="mt-10 rounded-[24px] border border-black/10 bg-black/2 p-6 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-white/70">
              <span>Chapters</span>
              <span>{chaptersCount ?? 0}</span>
            </div>
            <div className="mt-3 text-xs text-slate-500 dark:text-white/50">
              Keep writing to grow your catalog.
            </div>
          </div>

          <div className="mt-10">
            <h2 className="text-xl font-semibold leading-[1.3] text-slate-900 dark:text-white">About the book</h2>
            <p className="mt-3 text-base leading-[1.7] text-slate-600 dark:text-white/60">
              {book.description || "No description yet."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
