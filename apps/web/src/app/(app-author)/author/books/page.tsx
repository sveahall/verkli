<<<<<<< HEAD
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateBookForm from "./CreateBookForm";
import DeleteBookButton from "@/components/books/DeleteBookButton";

export default async function authorBooksPage() {
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
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            My books
          </h1>
          <CreateBookForm />
        </div>

        {!books || books.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-12 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-slate-600 dark:text-white/60">
              No books yet. Create your first book to get started.
            </p>
            <div className="mt-4">
              <CreateBookForm />
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {books.map((book) => (
              <li key={book.id} className="flex items-center gap-3">
                <Link
                  href={`/author/books/${book.id}`}
                  className="flex flex-1 items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
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
                    {book.status}
                  </span>
                </Link>
                <DeleteBookButton
                  bookId={book.id}
                  bookTitle={book.title}
                  label="Delete"
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-white/10 dark:text-red-200 dark:hover:bg-red-950/30"
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8">
          <Link
            href="/author/home"
            className="text-sm text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
          >
            ← Back to overview
          </Link>
        </p>
      </div>
    </main>
=======
import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function Page() {
  return (
    <PlaceholderPage
      title="Books"
      variantLabel="Author"
      links={NAV_CONFIG.APP_AUTHOR.links}
      showAuthStatus={true}
    />
>>>>>>> main
  );
}
