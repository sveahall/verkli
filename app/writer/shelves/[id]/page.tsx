import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WriterTopNav from "@/components/writer/WriterTopNav";

const fallbackGradient = "linear-gradient(135deg, #907AFF 0%, #E29ED5 50%, #FCC997 100%)";

const resolveCover = (coverType?: string | null, coverUrl?: string | null, coverGradient?: string | null) => {
  if (coverType === "image" && coverUrl) {
    return `url(${coverUrl})`;
  }
  if (coverType === "gradient" && coverGradient) {
    if (coverGradient.includes("gradient")) {
      return coverGradient;
    }
    try {
      const parsed = JSON.parse(coverGradient);
      if (parsed?.from && parsed?.to) {
        return `linear-gradient(${parsed.angle ?? 135}deg, ${parsed.from}, ${parsed.to})`;
      }
    } catch (error) {}
  }
  return fallbackGradient;
};

export default async function PublicShelfPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: shelf, error } = await supabase
    .from("shelves")
    .select(
      `
      id,
      user_id,
      name,
      subtitle,
      cover_url,
      cover_type,
      cover_gradient,
      shelf_books(
        id,
        book_id,
        sort_index,
        book:books(id, title, cover_url, status)
      )
    `
    )
    .eq("id", params.id)
    .single();

  if (error || !shelf) {
    notFound();
  }

  if (!user || user.id !== shelf.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_public")
      .eq("user_id", shelf.user_id)
      .maybeSingle();

    if (!profile?.is_public) {
      notFound();
    }
  }

  const cover = resolveCover(shelf.cover_type, shelf.cover_url, shelf.cover_gradient);
  const books = (shelf.shelf_books ?? [])
    .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
    .map((item) => item.book)
    .filter(Boolean);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WriterTopNav active="Profile" />
      <div className="mx-auto w-full max-w-[1200px] px-6 pb-20 pt-12">
        <div className="overflow-hidden rounded-[32px] border border-black/10 bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div
            className="h-[260px] w-full bg-cover bg-center"
            style={{ backgroundImage: cover }}
          />
          <div className="space-y-3 px-8 py-6">
            <Link href="/writer/profile" className="text-[13px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-white/40">
              Back to profile
            </Link>
            <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white">
              {shelf.name}
            </h1>
            <p className="text-[15px] text-slate-600 dark:text-white/50">
              {shelf.subtitle || "A curated shelf"}
            </p>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white">Books in this shelf</h2>
          {books.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/20 bg-black/5 p-10 text-center text-[14px] text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">
              No books have been added yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <Link
                  key={book.id}
                  href={`/writer/books/${book.id}`}
                  className="group overflow-hidden rounded-[24px] border border-black/10 bg-black/[0.02] transition-all hover:-translate-y-1 hover:border-black/20 hover:shadow-xl dark:border-white/[0.08] dark:bg-white/[0.02]"
                >
                  <div
                    className="h-[200px] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{
                      backgroundImage: book.cover_url
                        ? `url(${book.cover_url})`
                        : "linear-gradient(135deg, #2B2B3A 0%, #111118 100%)",
                    }}
                  />
                  <div className="space-y-1.5 p-5">
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      {book.title}
                    </h3>
                    <p className="text-[12px] text-slate-500 dark:text-white/40">{book.status}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
