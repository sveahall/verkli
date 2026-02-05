import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateBookEntry from "./CreateBookEntry";
import BooksListClient from "./BooksListClient";

export default async function AuthorBooksPage() {
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
      <div className="mx-auto max-w-[900px] px-6 py-12">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              My books
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
              {books && books.length > 0
                ? `${books.length} ${books.length === 1 ? "book" : "books"} in your library`
                : "Start writing your first book"}
            </p>
          </div>
          <CreateBookEntry />
        </div>

        {/* Books List with Search/Filter/Sort */}
        <BooksListClient books={books ?? []} />

        {/* Back link */}
        <p className="mt-10">
          <Link
            href="/author/home"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to overview
          </Link>
        </p>
      </div>
    </main>
  );
}
