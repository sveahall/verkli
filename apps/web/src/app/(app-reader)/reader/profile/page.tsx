import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import { getDiscoverHref } from "@/lib/flags";
import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";
import EmptyState from "@/components/reader/EmptyState";
import ProfileCreditsSection from "@/components/reader/ProfileCreditsSection";

function normalizeColor(value: unknown): "yellow" | "green" | "blue" | "rose" {
  if (value === "yellow" || value === "green" || value === "blue" || value === "rose") {
    return value;
  }
  return "yellow";
}

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ReaderProfilePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const creditCheckout =
    typeof params.credits === "string" ? params.credits : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName = String(profile?.display_name || profile?.username || "Reader");

  type FollowRow = {
    followee_id: string;
    created_at: string;
  };

  type FollowingAuthor = {
    userId: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    followedAt: string;
  };

  const { data: followRowsRaw } = await supabase
    .from("follows")
    .select("followee_id, created_at")
    .eq("follower_id", user.id)
    .order("created_at", { ascending: false })
    .limit(24);

  const followRows = (followRowsRaw ?? []) as FollowRow[];
  const followeeIds = [...new Set(followRows.map((row) => row.followee_id))];

  let followingAuthors: FollowingAuthor[] = [];
  if (followeeIds.length > 0) {
    const { data: authorProfiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url")
      .in("user_id", followeeIds)
      .eq("role", "author")
      .eq("is_public", true);

    const profileById = new Map(
      (authorProfiles ?? []).map((profile) => [profile.user_id, profile] as const)
    );

    followingAuthors = (
      await Promise.all(
        followRows.map(async (row) => {
          const profileRow = profileById.get(row.followee_id);
          if (!profileRow) return null;

          return {
            userId: row.followee_id,
            name: profileRow.display_name || profileRow.username || "Author",
            username: profileRow.username ?? null,
            avatarUrl: await getAvatarUrlFromPathServer(profileRow.avatar_url),
            followedAt: row.created_at,
          } satisfies FollowingAuthor;
        })
      )
    ).filter((row): row is FollowingAuthor => row !== null);
  }

  const { data: readingsRows } = await supabase
    .from("readings")
    .select("book_id, progress_percent, chapter_id, last_read_at")
    .eq("user_id", user.id)
    .order("last_read_at", { ascending: false })
    .limit(20);

  const readings = readingsRows ?? [];
  const booksStartedCount = new Set(readings.map((r) => r.book_id)).size;
  const booksFinishedCount = readings.filter((r) => (r.progress_percent ?? 0) >= 100).length;

  const bookIds = [...new Set(readings.map((r) => r.book_id))];
  let recentReads: { id: string; title: string; author: string; cover: string | null; progress: number }[] = [];

  if (bookIds.length > 0) {
    const { data: books } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id")
      .in("id", bookIds)
      .eq("status", "PUBLISHED");

    if (books && books.length > 0) {
      const bookMap = new Map(books.map((b) => [b.id, b]));
      const authorIds = [...new Set(books.map((b) => b.author_id))];
      const { data: authorProfiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", authorIds);
      const authorMap = new Map(
        (authorProfiles ?? []).map((p) => [p.user_id, p.display_name || p.username || "Author"])
      );
      const progressByBook = new Map(readings.map((r) => [r.book_id, r.progress_percent ?? 0]));
      recentReads = readings
        .map((r) => {
          const book = bookMap.get(r.book_id);
          if (!book) return null;
          return {
            id: book.id,
            title: book.title,
            author: authorMap.get(book.author_id) ?? "Author",
            cover: book.cover_image,
            progress: progressByBook.get(book.id) ?? 0,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
      const seen = new Set<string>();
      recentReads = recentReads.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
      recentReads = recentReads.slice(0, 8);
    }
  }

  type HighlightSummary = {
    id: string;
    chapterId: string;
    bookId: string;
    bookTitle: string;
    chapterTitle: string;
    snippet: string;
    note: string | null;
    color: "yellow" | "green" | "blue" | "rose";
  };

  const { count: highlightsTotalCount } = await supabase
    .from("highlights" as never)
    .select("id", { head: true, count: "exact" })
    .eq("user_id", user.id);

  const { data: rawHighlightRows } = await supabase
    .from("highlights" as never)
    .select("id, chapter_id, book_id, snippet, note, color, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(24);

  const highlightRows = (Array.isArray(rawHighlightRows) ? rawHighlightRows : []) as Array<Record<string, unknown>>;
  const chapterIds = [...new Set(highlightRows.map((row) => String(row.chapter_id ?? "")).filter(Boolean))];
  const highlightBookIds = [...new Set(highlightRows.map((row) => String(row.book_id ?? "")).filter(Boolean))];

  let chapterTitleMap = new Map<string, string>();
  let bookTitleMap = new Map<string, string>();

  if (chapterIds.length > 0) {
    const { data: chapterRows } = await supabase
      .from("chapters")
      .select("id, title")
      .in("id", chapterIds);
    chapterTitleMap = new Map((chapterRows ?? []).map((row) => [row.id, row.title]));
  }

  if (highlightBookIds.length > 0) {
    const { data: bookRows } = await supabase
      .from("books")
      .select("id, title")
      .in("id", highlightBookIds);
    bookTitleMap = new Map((bookRows ?? []).map((row) => [row.id, row.title]));
  }

  const highlights: HighlightSummary[] = highlightRows
    .map((row) => {
      const id = String(row.id ?? "").trim();
      const chapterId = String(row.chapter_id ?? "").trim();
      const bookId = String(row.book_id ?? "").trim();
      const snippet = String(row.snippet ?? "").trim();
      if (!id || !chapterId || !bookId || !snippet) return null;

      return {
        id,
        chapterId,
        bookId,
        bookTitle: bookTitleMap.get(bookId) ?? "Book",
        chapterTitle: chapterTitleMap.get(chapterId) ?? "Chapter",
        snippet,
        note: row.note == null ? null : String(row.note),
        color: normalizeColor(row.color),
      } satisfies HighlightSummary;
    })
    .filter((row): row is HighlightSummary => row !== null)
    .slice(0, 12);

  const stats: { label: string; value: string }[] = [
    { label: "Books started", value: String(booksStartedCount) },
    { label: "Books finished", value: String(booksFinishedCount) },
    { label: "Highlights", value: String(highlightsTotalCount ?? highlights.length) },
    { label: "Following authors", value: String(followingAuthors.length) },
  ];

  const initials = displayName
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const discoverHref = getDiscoverHref();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Profile"
        title="Your reader space"
        subtitle="Track your reading rhythm, manage lists, and tailor your experience."
        actions={
          <Link
            href="/reader/library"
            className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            My library
          </Link>
        }
      />

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-[20px] font-semibold text-white dark:bg-white dark:text-slate-900">
              {initials}
            </div>
            <div>
              <p className="text-[18px] font-semibold text-slate-900 dark:text-white">{displayName}</p>
              <p className="text-[13px] text-slate-500 dark:text-white/60">Reader</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/reader/bookmarks"
              className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
            >
              Bookmarks
            </Link>
            {discoverHref && (
              <Link
                href={discoverHref}
                className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
              >
                Discover
              </Link>
            )}
          </div>
        </div>

        {stats.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-4 text-left dark:border-white/10 dark:bg-white/5"
              >
                <p className="text-[12px] text-slate-500 dark:text-white/60">{stat.label}</p>
                <p className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <ProfileCreditsSection creditCheckout={creditCheckout} />

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Following authors</h2>
          <span className="text-[12px] text-slate-500 dark:text-white/60">
            {followingAuthors.length === 1 ? "1 author" : `${followingAuthors.length} authors`}
          </span>
        </div>

        {followingAuthors.length === 0 ? (
          <p className="mt-4 text-[14px] text-slate-600 dark:text-white/60">
            You are not following any authors yet. Open an author profile and click Follow.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {followingAuthors.map((author) => (
              <Link
                key={author.userId}
                href={`/reader/authors/${author.userId}`}
                className="rounded-2xl border border-slate-200/70 bg-white/85 p-4 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-slate-100 text-[12px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-white/70">
                    {author.avatarUrl ? (
                      <Image src={author.avatarUrl} alt={author.name} fill sizes="44px" className="object-cover" />
                    ) : (
                      author.name
                        .split(" ")
                        .map((word) => word[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                      {author.name}
                    </p>
                    <p className="truncate text-[12px] text-slate-500 dark:text-white/60">
                      {author.username ? `@${author.username}` : "Author"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-white/45">
                      Followed {new Date(author.followedAt).toLocaleDateString("en-US")}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Rail
        title="Recently opened"
        subtitle="Jump back into your latest reads"
        isEmpty={recentReads.length === 0}
        emptyState={
          <EmptyState
            title="No reads yet"
            description={
              discoverHref
                ? "Start a book from Discover and it will appear here."
                : "Open a book and it will appear here."
            }
            action={
              discoverHref ? (
                <Link
                  href={discoverHref}
                  className="btn-primary rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95"
                >
                  Explore stories
                </Link>
              ) : undefined
            }
          />
        }
      >
        {recentReads.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover={book.cover}
            progress={book.progress}
            size="lg"
          />
        ))}
      </Rail>

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">My highlights</h2>
          <span className="text-[12px] text-slate-500 dark:text-white/60">
            {highlights.length === 1 ? "1 item" : `${highlights.length} items`}
          </span>
        </div>

        {highlights.length === 0 ? (
          <p className="mt-4 text-[14px] text-slate-600 dark:text-white/60">
            You do not have any highlights yet. Open a chapter and select text to save one.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {highlights.map((highlight) => (
              <Link
                key={highlight.id}
                href={`/reader/read/${highlight.chapterId}`}
                className="block rounded-2xl border border-slate-200/70 bg-white/85 p-4 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-white/50">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        highlight.color === "green"
                          ? "#86efac"
                          : highlight.color === "blue"
                            ? "#93c5fd"
                            : highlight.color === "rose"
                              ? "#fda4af"
                              : "#facc15",
                    }}
                  />
                  {highlight.bookTitle}
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-800 dark:text-white/85">
                  &quot;{highlight.snippet}&quot;
                </p>
                {highlight.note && (
                  <p className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/65">
                    {highlight.note}
                  </p>
                )}
                <p className="mt-3 text-[12px] text-slate-500 dark:text-white/55">
                  {highlight.chapterTitle}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
