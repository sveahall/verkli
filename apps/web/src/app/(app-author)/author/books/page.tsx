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
    .select("id, title, status, updated_at, cover_image")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <main className="min-h-screen bg-white text-foreground dark:bg-[#0A0A0B]">
      <div className="mx-auto max-w-[1200px] px-6 pt-10 pb-24">
        {/* Header */}
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h1 className="text-[32px] font-semibold tracking-[-0.04em] text-[#1a1a1a] dark:text-[#ededed]">
              Your books
            </h1>
            <p className="mt-1 text-[14px] text-[#8a8a8a] dark:text-[#555]">
              {books && books.length > 0
                ? `${books.length} ${books.length === 1 ? "book" : "books"} in your library`
                : "Start writing your first book"}
            </p>
          </div>
          <CreateBookEntry />
        </div>

        {/* Thin gradient accent line */}
        <div className="mb-10 h-px bg-gradient-to-r from-[#907AFF]/20 via-[#E29ED5]/20 to-[#FCC997]/20" />

        {/* Books List with Search/Filter/Sort */}
        <BooksListClient books={books ?? []} />

        {/* Back link */}
        <p className="mt-10">
          <Link
            href="/author/home"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#8a8a8a] transition hover:text-[#1a1a1a] dark:text-[#555] dark:hover:text-[#ededed]"
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
