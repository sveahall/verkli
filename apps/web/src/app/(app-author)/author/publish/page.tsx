import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AuthorPublishPicker({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string; book?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const bookId = resolvedSearchParams?.id ?? resolvedSearchParams?.book;

  if (bookId) {
    redirect(`/author/books/${bookId}?panel=publish`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, status, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[800px] px-6 py-12">
        <Link
          href="/author/books"
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to books
        </Link>

        <div className="mt-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Choose a book to publish
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
            Publishing happens in the book detail view. Select a book to open the publishing panel.
          </p>
        </div>

        {!books || books.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/50 p-10 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-slate-600 dark:text-white/60">
              No books yet. Create a draft first, then publish from the book detail view.
            </p>
            <Link
              href="/author/books"
              className="mt-4 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
            >
              Go to books
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-2">
            {books.map((book) => (
              <li key={book.id}>
                <Link
                  href={`/author/books/${book.id}?panel=publish`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <span className="font-medium text-slate-900 dark:text-white">
                    {book.title || "Untitled"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      book.status === "PUBLISHED"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60"
                    }`}
                  >
                    {book.status === "PUBLISHED" ? "Published" : "Draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
