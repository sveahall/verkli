import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    } catch {}
  }
  return fallbackGradient;
};

export default async function PublicShelfPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 16+: params is a Promise, must await
  const { id } = await params;
  
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
        book:books(id, title, cover_image)
      )
    `
    )
    .eq("id", id)
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
  type BookSummary = {
    id: string;
    title: string;
    cover_image: string | null;
  };

  const books: BookSummary[] = (shelf.shelf_books ?? [])
    .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
    .flatMap((item) => {
      const book = item.book as BookSummary | BookSummary[] | null | undefined;
      if (!book) return [];
      return Array.isArray(book) ? book : [book];
    });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="page-content mx-auto w-full max-w-[1200px] pb-20 pt-10 sm:pt-12">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <div
            className="h-[240px] sm:h-[280px] w-full bg-cover bg-center"
            style={{ backgroundImage: cover }}
          />
          <div className="space-y-3 px-6 py-6 sm:px-8 sm:py-8">
            <Link href="/author/profile" className="text-eyebrow text-[11px] inline-block hover:text-slate-600 dark:hover:text-white/60">
              Back to profile
            </Link>
            <h1 className="text-page-title">{shelf.name}</h1>
            <p className="text-body max-w-2xl">
              {shelf.subtitle || "A curated shelf"}
            </p>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-section-title mb-6">Books in this shelf</h2>
          {books.length === 0 ? (
            <div className="empty-state-base py-10 text-center">
              <p className="text-helper">No books have been added yet.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <Link
                  key={book.id}
                  href={`/author/books/${book.id}`}
                  className="card-base-subtle group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)] dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
                >
                  <div
                    className="h-[200px] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{
                      backgroundImage: book.cover_image
                        ? `url(${book.cover_image})`
                        : "linear-gradient(135deg, #2B2B3A 0%, #111118 100%)",
                    }}
                  />
                  <div className="space-y-1.5 p-5">
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      {book.title}
                    </h3>
                    <p className="text-[12px] text-slate-500 dark:text-white/40">Book</p>
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
