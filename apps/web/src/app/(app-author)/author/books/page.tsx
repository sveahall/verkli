import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateBookForm from "./CreateBookForm";
import { buildBookGroups, getLanguageChipLabels } from "@/lib/book-groups";

export default async function authorBooksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, status, updated_at, cover_image, language, is_translation, original_book_id")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  const groups = books?.length ? buildBookGroups(books as Parameters<typeof buildBookGroups>[0]) : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[800px] px-6 py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            My books
          </h1>
          <CreateBookForm />
        </div>

        {groups.length === 0 ? (
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
            {groups.map((group) => {
              const chips = getLanguageChipLabels(group);
              const status = group.defaultBook.status ?? "DRAFT";
              return (
                <li key={group.groupId}>
                  <Link
                    href={`/author/books/${group.groupId}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span className="min-w-0 flex-1 font-medium text-slate-900 dark:text-white">
                      {group.title || "Untitled"}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {chips.length > 0 && (
                        <span className="flex gap-1">
                          {chips.slice(0, 4).map((code) => (
                            <span
                              key={code}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-white/60"
                            >
                              {code}
                            </span>
                          ))}
                          {chips.length > 4 && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-white/10 dark:text-white/50">
                              +{chips.length - 4}
                            </span>
                          )}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          status === "PUBLISHED"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
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
  );
}
