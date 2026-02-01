import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAudiobookEnabled, getMarketingEnabled, getTranslationsEnabled } from "@/lib/flags";
import { getLanguageLabel, normalizeLanguage } from "@/lib/languages";

function hasChapterContent(content: string | null): boolean {
  if (!content || typeof content !== "string") return false;
  const trimmed = content.trim();
  if (trimmed.length <= 2) return false;
  if (trimmed === "{}" || trimmed === "null") return false;
  return true;
}

export default async function WriterDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/writer/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, status, language, cover_image, is_translation, translation_status, audiobook_status, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  if (!books?.length) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-[1000px] px-6 py-12">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="mt-4 text-slate-600 dark:text-white/60">No books yet. Create a book to see your dashboard.</p>
          <Link
            href="/writer/books"
            className="mt-4 inline-block text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Create book →
          </Link>
        </div>
      </main>
    );
  }

  const bookIds = books.map((b) => b.id);

  const [chaptersByBook, marketingByBook, audiobookExistsByBook] = await Promise.all([
    supabase
      .from("chapters")
      .select("book_id, content")
      .in("book_id", bookIds)
      .then((r) => {
        const map = new Map<string, boolean>();
        (r.data ?? []).forEach((ch) => {
          if (hasChapterContent(ch.content)) map.set(ch.book_id, true);
        });
        return map;
      }),
    supabase
      .from("marketing_campaigns")
      .select("book_id, status, channel, language")
      .in("book_id", bookIds)
      .then((r) => {
        const map = new Map<string, { status: string; channel: string; language: string }[]>();
        (r.data ?? []).forEach((c) => {
          const list = map.get(c.book_id) ?? [];
          list.push({ status: c.status, channel: c.channel, language: c.language });
          map.set(c.book_id, list);
        });
        return map;
      }),
    supabase
      .from("audiobook_assets")
      .select("book_id")
      .in("book_id", bookIds)
      .then((r) => new Set((r.data ?? []).map((a) => a.book_id))),
  ]);

  const rows = books.map((book) => {
    const has_cover = Boolean(book.cover_image);
    const has_content = chaptersByBook.get(book.id) ?? false;
    const is_published = book.status === "PUBLISHED";
    const campaigns = marketingByBook.get(book.id) ?? [];
    const latestMarketing = campaigns.length > 0 ? campaigns[campaigns.length - 1] : null;
    const marketingStatus = latestMarketing?.status ?? "—";
    const has_audiobook_asset = audiobookExistsByBook.has(book.id);
    const langLabel = getLanguageLabel(normalizeLanguage(book.language));

    return {
      id: book.id,
      title: book.title || "Untitled",
      status: book.status,
      language: langLabel,
      is_translation: Boolean(book.is_translation),
      translation_status: book.translation_status ?? "—",
      audiobook_status: book.audiobook_status ?? "not_started",
      has_cover,
      has_content,
      is_published,
      marketingStatus,
      campaignsCount: campaigns.length,
      has_audiobook_asset,
    };
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1000px] px-6 py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
          <Link
            href="/writer/books"
            className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
          >
            All books →
          </Link>
        </div>

        <p className="mb-6 text-sm text-slate-600 dark:text-white/60">
          Overview of each book: publish status, language, translation/audiobook/marketing status, and quick actions.
        </p>

        <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{row.title}</h2>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    row.is_published
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {row.status}
                </span>
              </div>

              <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500 dark:text-white/50">Language</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{row.language}</dd>

                {getTranslationsEnabled() && row.is_translation && (
                  <>
                    <dt className="text-slate-500 dark:text-white/50">Translation</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">{row.translation_status}</dd>
                  </>
                )}

                {getAudiobookEnabled() && (
                  <>
                    <dt className="text-slate-500 dark:text-white/50">Audiobook</dt>
                    <dd>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.audiobook_status === "published"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : row.audiobook_status === "generating"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                              : row.audiobook_status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {row.audiobook_status}
                      </span>
                    </dd>
                  </>
                )}

                {getMarketingEnabled() && (
                  <>
                    <dt className="text-slate-500 dark:text-white/50">Marketing</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {row.campaignsCount > 0 ? `${row.marketingStatus} (${row.campaignsCount})` : "—"}
                    </dd>
                  </>
                )}

                <dt className="text-slate-500 dark:text-white/50">Cover</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{row.has_cover ? "Yes" : "No"}</dd>

                <dt className="text-slate-500 dark:text-white/50">Content</dt>
                <dd className="font-medium text-slate-900 dark:text-white">{row.has_content ? "Yes" : "No"}</dd>
              </dl>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/writer/books/${row.id}`}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  Edit
                </Link>
                {row.is_published && (
                  <Link
                    href={`/reader/books/${row.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                  >
                    View reader
                  </Link>
                )}
                {getMarketingEnabled() && (
                  <Link
                    href={`/writer/books/${row.id}#marketing`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                  >
                    Generate marketing
                  </Link>
                )}
                {getAudiobookEnabled() && (
                  <Link
                    href={`/writer/books/${row.id}#audiobook`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                  >
                    Generate audiobook
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8">
          <Link
            href="/writer/home"
            className="text-sm text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
          >
            ← Back to overview
          </Link>
        </p>
      </div>
    </main>
  );
}
