import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUserReadBook } from "@/lib/books/access";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import PurchaseBookButton from "../../books/[id]/PurchaseBookButton";
import CommentsSection from "../../books/[id]/CommentsSection";
import ReadingProgress from "./ReadingProgress";
import ReaderChapterClient, { type ReaderHighlight, type ReaderSettings } from "./ReaderChapterClient";
import ChapterTopNavigator from "./ChapterTopNavigator";
import ChapterAudiobookPlayer from "./ChapterAudiobookPlayer";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseReaderSettings(preferences: Record<string, unknown> | null): ReaderSettings {
  const defaults: ReaderSettings = {
    fontSize: 16,
    lineHeight: 1.7,
    fontFamily: "serif" as const,
    textAlign: "left" as const,
    marginSize: "normal" as const,
    theme: "light" as const,
  };

  if (!preferences) return defaults;

  const reader = asRecord(preferences.reader);
  const settings = asRecord(reader?.settings);
  const fontSize = typeof settings?.fontSize === "number" ? settings.fontSize : defaults.fontSize;
  const lineHeight = typeof settings?.lineHeight === "number" ? settings.lineHeight : defaults.lineHeight;
  const fontFamily = settings?.fontFamily === "serif" || settings?.fontFamily === "sans" || settings?.fontFamily === "mono" ? settings.fontFamily : defaults.fontFamily;
  const textAlign = settings?.textAlign === "left" || settings?.textAlign === "justify" ? settings.textAlign : defaults.textAlign;
  const marginSize = settings?.marginSize === "narrow" || settings?.marginSize === "normal" || settings?.marginSize === "wide" ? settings.marginSize : defaults.marginSize;
  const theme =
    settings?.theme === "light" || settings?.theme === "sepia" || settings?.theme === "dark"
      ? settings.theme
      : defaults.theme;

  return {
    fontSize: Math.min(24, Math.max(13, fontSize)),
    lineHeight: Math.min(2.1, Math.max(1.4, lineHeight)),
    fontFamily,
    textAlign,
    marginSize,
    theme,
  };
}

function normalizeHighlightColor(value: unknown): "yellow" | "green" | "blue" | "rose" {
  if (value === "yellow" || value === "green" || value === "blue" || value === "rose") {
    return value;
  }
  return "yellow";
}

export default async function ReaderReadPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const { chapterId } = await params;

  const supabase = await createClient();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, order, book_id, book_version_id")
    .eq("id", chapterId)
    .maybeSingle();

  if (!chapter) notFound();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, status, audiobook_status, author_id, price_amount, price_currency")
    .eq("id", chapter.book_id)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!book) {
    notFound();
  }

  const isAuthorView = Boolean(user?.id && (book as { author_id?: string | null }).author_id === user.id);
  if (book.status !== "PUBLISHED" && !isAuthorView) {
    notFound();
  }

  const priceAmount = Math.max(0, Math.trunc(Number((book as { price_amount?: number | null }).price_amount ?? 0)));
  const priceCurrency = String((book as { price_currency?: string | null }).price_currency ?? "USD").trim().toUpperCase() || "USD";

  const hasReadAccess = await canUserReadBook({
    supabase,
    userId: user?.id ?? null,
    bookId: book.id,
    bookAuthorId: String((book as { author_id?: string | null }).author_id ?? ""),
    bookPriceAmount: priceAmount,
  });

  if (!hasReadAccess) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <header className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-8">
          <Link href={`/reader/books/${book.id}`} className="text-[13px] text-slate-600 hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
            ← Back to book
          </Link>
          <span className="text-[13px] text-slate-500 dark:text-white/40">Locked</span>
        </header>
        <section className="mx-auto max-w-[900px] px-6 pb-16">
          <div className="rounded-[24px] border border-amber-500/30 bg-amber-500/10 p-8">
            <h1 className="text-[24px] font-semibold">Reading is locked</h1>
            <p className="mt-3 text-[15px] text-slate-700 dark:text-white/80">
              Buy this book to unlock all chapters.
            </p>
            <div className="mt-6">
              {user ? (
                <PurchaseBookButton bookId={book.id} amount={priceAmount} currency={priceCurrency} />
              ) : (
                <Link
                  href={`/reader/signin?next=${encodeURIComponent(`/reader/books/${book.id}`)}`}
                  className="rounded-full bg-[#907AFF] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#8069EE]"
                >
                  Sign in to buy
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
    );
  }

  let shouldLogStartReading = false;

  if (user) {
    const { data: existingReading } = await supabase
      .from("readings")
      .select("chapter_id")
      .eq("user_id", user.id)
      .eq("book_id", book.id)
      .maybeSingle();
    shouldLogStartReading = !existingReading;
  } else {
    shouldLogStartReading = Number(chapter.order ?? 0) === 1;
  }

  if (shouldLogStartReading) {
    try {
      await logAnalyticsEvent(supabase, {
        eventType: "start_reading",
        userId: user?.id ?? null,
        bookId: book.id,
        path: `/reader/read/${chapter.id}`,
        props: {
          chapterId: chapter.id,
          chapterOrder: chapter.order,
        },
      });
    } catch {
      // Non-blocking for reader flow.
    }
  }

  const { data: chapterContent } = await supabase
    .from("chapters")
    .select("content")
    .eq("id", chapterId)
    .maybeSingle();

  let profilePreferences: Record<string, unknown> | null = null;
  let initialHighlights: ReaderHighlight[] = [];

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("user_id", user.id)
      .maybeSingle();

    profilePreferences = asRecord(profile?.preferences);

    const { data: chapterHighlights } = await supabase
      .from("highlights" as never)
      .select("id, start_offset, end_offset, snippet, color, note, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("chapter_id", chapter.id)
      .order("start_offset", { ascending: true });

    const rows = (Array.isArray(chapterHighlights) ? chapterHighlights : []) as Array<Record<string, unknown>>;
    initialHighlights = rows
      .map((row) => {
        const id = String(row.id ?? "").trim();
        const snippet = String(row.snippet ?? "").trim();
        const startOffset = Number(row.start_offset ?? NaN);
        const endOffset = Number(row.end_offset ?? NaN);
        if (!id || !snippet || !Number.isFinite(startOffset) || !Number.isFinite(endOffset) || endOffset <= startOffset) {
          return null;
        }

        return {
          id,
          startOffset,
          endOffset,
          snippet,
          color: normalizeHighlightColor(row.color),
          note: row.note == null ? null : String(row.note),
          createdAt: String(row.created_at ?? ""),
          updatedAt: String(row.updated_at ?? ""),
        } satisfies ReaderHighlight;
      })
      .filter((row): row is ReaderHighlight => row !== null);
  }

  const initialReaderSettings = parseReaderSettings(profilePreferences);

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_version_id", chapter.book_version_id)
    .order("order", { ascending: true });

  const chapterIndex = chapters?.findIndex((c) => c.id === chapterId) ?? 0;
  const totalChapters = chapters?.length ?? 1;
  const progressPercent = totalChapters > 0 ? Math.round(((chapterIndex + 1) / totalChapters) * 100) : 0;
  const bookAuthorId = String((book as { author_id?: string | null }).author_id ?? "");
  const signInHref = `/reader/signin?next=${encodeURIComponent(`/reader/read/${chapter.id}`)}`;
  const chapterOptions = (chapters ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    order: item.order,
  }));
  const navChapters = chapterOptions.map((item, index) => ({
    id: item.id,
    title: item.title,
    order: typeof item.order === "number" && Number.isFinite(item.order) ? item.order : index + 1,
  }));
  const previousChapterNav = chapterIndex > 0 ? navChapters[chapterIndex - 1] : null;
  const nextChapterNav =
    chapterIndex >= 0 && chapterIndex < navChapters.length - 1
      ? navChapters[chapterIndex + 1]
      : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <ReadingProgress
        bookId={book.id}
        chapterId={chapter.id}
        progressPercent={progressPercent}
        currentChapter={chapterIndex + 1}
      />
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-7">
        <Link href={`/reader/books/${book.id}`} className="text-[13px] text-slate-600 hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
          ← Back to book
        </Link>
        <span className="text-[13px] text-slate-500 dark:text-white/40">
          Chapter {chapterIndex + 1} of {totalChapters}
        </span>
      </header>

      <section className="mx-auto max-w-[1100px] px-6 pb-16">
        <ChapterTopNavigator chapters={navChapters} currentChapterId={chapter.id} />

        <article className="mt-8">
          <div className="text-[15px] leading-relaxed text-slate-700 dark:text-white/70">
            <ReaderChapterClient
              userId={user?.id ?? null}
              bookId={book.id}
              bookVersionId={chapter.book_version_id}
              chapterId={chapter.id}
              chapterTitle={chapter.title}
              chapterContent={chapterContent?.content ?? null}
              initialHighlights={initialHighlights}
              initialPreferences={profilePreferences}
              initialSettings={initialReaderSettings}
            />
          </div>

          <ChapterAudiobookPlayer
            bookId={book.id}
            chapterId={chapter.id}
            audiobookStatus={typeof (book as { audiobook_status?: string | null }).audiobook_status === "string"
              ? (book as { audiobook_status?: string | null }).audiobook_status
              : null}
            isAuthorView={isAuthorView}
          />

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {previousChapterNav ? (
              <Link
                href={`/reader/read/${previousChapterNav.id}`}
                className="rounded-[20px] border border-slate-200/90 bg-white/90 px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
              >
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-white/50">Previous</p>
                <p className="mt-1 text-[14px] font-medium text-slate-900 dark:text-white">
                  {previousChapterNav.title}
                </p>
              </Link>
            ) : (
                <div className="rounded-2xl border border-dashed border-black/10 px-4 py-3 text-[12px] text-slate-500 dark:border-white/10 dark:text-white/50">
                  Start of book
                </div>
              )}

            {nextChapterNav ? (
              <Link
                href={`/reader/read/${nextChapterNav.id}`}
                className="rounded-[20px] border border-slate-200/90 bg-white/90 px-4 py-3 text-right shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
              >
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-white/50">Next</p>
                <p className="mt-1 text-[14px] font-medium text-slate-900 dark:text-white">
                  {nextChapterNav.title}
                </p>
              </Link>
            ) : (
              <div className="rounded-2xl border border-dashed border-black/10 px-4 py-3 text-right text-[12px] text-slate-500 dark:border-white/10 dark:text-white/50">
                End of book
              </div>
            )}
          </div>
        </article>
      </section>
      <CommentsSection
        bookId={book.id}
        bookAuthorId={bookAuthorId}
        currentUserId={user?.id ?? null}
        isSignedIn={Boolean(user)}
        signInHref={signInHref}
        chapterOptions={chapterOptions}
        fixedChapterId={chapter.id}
        title={`Kommentarer: ${chapter.title}`}
      />
    </main>
  );
}
