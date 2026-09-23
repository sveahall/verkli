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
    redirect(`/author/audience?bookId=${bookId}&surface=beta-readers`);
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
          href="/author/audience"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
        >
          <span aria-hidden="true">←</span>
          Go to audience workspace
        </Link>

        <div className="mt-6">
          <h1 className="author-page-title text-foreground">
            Choose a book to publish
          </h1>
          <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
            Audience is now the canonical publishing workspace.
          </p>
        </div>

        {!books || books.length === 0 ? (
          <div className="mt-8 rounded-xl border border-border bg-background/50 p-10 text-center dark:border-border dark:bg-card">
            <p className="text-muted-foreground dark:text-muted-foreground">
              No books yet. Create a draft first, then publish from Audience.
            </p>
            <Link
              href="/author/library"
              className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Open library
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-2">
            {books.map((book) => (
              <li key={book.id}>
                <Link
                  href={`/author/audience?bookId=${book.id}&surface=beta-readers`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition hover:bg-background dark:border-border dark:bg-card dark:hover:bg-accent"
                >
                  <span className="font-medium text-foreground dark:text-foreground">
                    {book.title || "Untitled"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      book.status === "PUBLISHED"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground"
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
