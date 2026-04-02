import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReadAccess } from "@/lib/books/access";
import FreemiumGate from "@/components/reader/FreemiumGate";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import PurchaseBookButton from "../../books/[id]/PurchaseBookButton";
import PurchaseChapterButton from "../../books/[id]/PurchaseChapterButton";
import CommentsSection from "../../books/[id]/CommentsSection";
import ReadingProgress from "./ReadingProgress";
import ReaderChapterClient, { type ReaderHighlight, type ReaderSettings } from "./ReaderChapterClient";
import ChapterTopNavigator from "./ChapterTopNavigator";
import ChapterAudiobookPlayer from "./ChapterAudiobookPlayer";
import ReadingView from "@/features/reader/reader-reading/ReadingView";

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
    .select("id, title, order, book_id, book_version_id, content")
    .eq("id", chapterId)
    .maybeSingle();

  if (!chapter) notFound();

  const [
    { data: book },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("books")
      .select("id, title, status, audiobook_status, author_id, price_amount, price_currency, pricing_model")
      .eq("id", chapter.book_id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!book) {
    notFound();
  }

  const isAuthorView = Boolean(user?.id && (book as { author_id?: string | null }).author_id === user.id);
  if (book.status !== "PUBLISHED" && !isAuthorView) {
    notFound();
  }

  const priceAmount = Math.max(0, Math.trunc(Number((book as { price_amount?: number | null }).price_amount ?? 0)));
  const priceCurrency = String((book as { price_currency?: string | null }).price_currency ?? "USD").trim().toUpperCase() || "USD";
  const bookPricingModel = String((book as { pricing_model?: string | null }).pricing_model ?? "book_only");
  const isPerChapter = bookPricingModel === "per_chapter";

  const readAccess = await getReadAccess({
    supabase,
    userId: user?.id ?? null,
    bookId: book.id,
    chapterId: chapter.id,
    bookVersionId: chapter.book_version_id,
    bookAuthorId: String((book as { author_id?: string | null }).author_id ?? ""),
    bookPriceAmount: priceAmount,
    bookPricingModel,
  });

  if (readAccess.access === "locked") {
    const gateSignInHref = `/reader/signin?next=${encodeURIComponent(`/reader/books/${book.id}`)}`;
    return (
      <main className="min-h-screen bg-[#F8F9FB] text-[#0F172A] dark:bg-[#030712] dark:text-white">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-[720px]">
            <header className="mb-8 flex items-center justify-between">
              <Link href={`/reader/books/${book.id}`} className="inline-flex items-center gap-2 text-sm text-[#64748B] transition-colors hover:text-[#0F172A] dark:text-white/50 dark:hover:text-white">
                <span aria-hidden>←</span> Back to book
              </Link>
              <span className="text-xs text-[#64748B] dark:text-white/40">Locked</span>
            </header>
            <div className="rounded-2xl border border-[#907AFF]/15 bg-[#907AFF]/[0.04] p-6">
              <h1 className="text-2xl font-semibold text-[#0F172A] dark:text-white">Chapter locked</h1>
              <p className="mt-2 text-sm text-[#64748B] dark:text-white/60">
                {isPerChapter
                  ? "Purchase this chapter or upgrade to Verkli Plus to read it."
                  : "Purchase the book or upgrade to Verkli Plus to read all chapters."}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                {user ? (
                  isPerChapter ? (
                    <PurchaseChapterButton bookId={book.id} chapterId={chapterId} amount={priceAmount} currency={priceCurrency} />
                  ) : (
                    <PurchaseBookButton bookId={book.id} amount={priceAmount} currency={priceCurrency} />
                  )
                ) : (
                  <Link
                    href={gateSignInHref}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#907AFF] px-6 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#7A66E0] active:scale-[0.97]"
                  >
                    Sign in to purchase
                  </Link>
                )}
                <Link
                  href="/reader/billing"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#907AFF]/25 px-6 text-sm font-semibold text-[#907AFF] transition-colors hover:bg-[#907AFF]/10 dark:text-[#B8A9FF]"
                >
                  Upgrade to Verkli Plus
                </Link>
              </div>
            </div>
          </div>
        </div>
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
    logAnalyticsEvent(supabase, {
      eventType: "start_reading",
      userId: user?.id ?? null,
      bookId: book.id,
      path: `/reader/read/${chapter.id}`,
      props: {
        chapterId: chapter.id,
        chapterOrder: chapter.order,
      },
    }).catch(() => {});
  }

  let profilePreferences: Record<string, unknown> | null = null;
  let initialHighlights: ReaderHighlight[] = [];

  const [{ data: chapters }, profileResult, chapterHighlightsResult] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, order")
      .eq("book_version_id", chapter.book_version_id)
      .order("order", { ascending: true }),
    user
      ? supabase
          .from("profiles")
          .select("preferences")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("highlights" as never)
          .select("id, start_offset, end_offset, snippet, color, note, created_at, updated_at")
          .eq("user_id", user.id)
          .eq("chapter_id", chapter.id)
          .order("start_offset", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  if (user) {
    profilePreferences = asRecord(profileResult?.data?.preferences);

    const rows = (Array.isArray(chapterHighlightsResult?.data) ? chapterHighlightsResult.data : []) as Array<Record<string, unknown>>;
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
  const progressLabel = `Chapter ${chapterIndex + 1} of ${totalChapters}${readAccess.access === "preview" ? " • Preview" : ""}`;
  const footerNavigation = (
    <section className="grid gap-4 sm:grid-cols-2">
      {previousChapterNav ? (
        <Link
          href={`/reader/read/${previousChapterNav.id}`}
          className="group rounded-xl border border-black/[0.06] bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03]"
        >
          <p className="text-xs text-[#64748B] dark:text-white/50">Previous chapter</p>
          <p className="mt-1 text-sm font-medium text-[#0F172A] transition-colors group-hover:text-[#907AFF] dark:text-white">
            {previousChapterNav.title}
          </p>
        </Link>
      ) : (
        <div className="rounded-xl border border-dashed border-black/[0.06] p-4 text-xs text-[#64748B] dark:border-white/10 dark:text-white/50">
          Start of book
        </div>
      )}

      {readAccess.access === "preview" && readAccess.isLastPreview ? (
        <div className="rounded-xl border border-dashed border-[#907AFF]/20 bg-[#907AFF]/5 p-4 text-right text-xs text-[#907AFF]">
          Purchase or upgrade to unlock the next chapter
        </div>
      ) : nextChapterNav ? (
        <Link
          href={`/reader/read/${nextChapterNav.id}`}
          className="group rounded-xl border border-black/[0.06] bg-white p-4 text-right shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03]"
        >
          <p className="text-xs text-[#64748B] dark:text-white/50">Next chapter</p>
          <p className="mt-1 text-sm font-medium text-[#0F172A] transition-colors group-hover:text-[#907AFF] dark:text-white">
            {nextChapterNav.title}
          </p>
        </Link>
      ) : (
        <div className="rounded-xl border border-dashed border-black/[0.06] p-4 text-right text-xs text-[#64748B] dark:border-white/10 dark:text-white/50">
          End of book
        </div>
      )}
    </section>
  );
  const commentsSection = (
    <CommentsSection
      bookId={book.id}
      bookAuthorId={bookAuthorId}
      currentUserId={user?.id ?? null}
      isSignedIn={Boolean(user)}
      signInHref={signInHref}
      chapterOptions={chapterOptions}
      fixedChapterId={chapter.id}
      title={`Comments: ${chapter.title}`}
    />
  );

  return (
    <>
      <ReadingProgress
        bookId={book.id}
        chapterId={chapter.id}
        progressPercent={progressPercent}
        currentChapter={chapterIndex + 1}
        userId={user?.id ?? null}
      />
      <ReadingView
        backHref={`/reader/books/${book.id}`}
        backLabel="Back to book"
        bookTitle={book.title}
        chapterLabel={chapter.title}
        progressLabel={progressLabel}
        chapterNavigator={
          <ChapterTopNavigator
            chapters={navChapters}
            currentChapterId={chapter.id}
            disableNext={readAccess.access === "preview" && readAccess.isLastPreview}
          />
        }
        chapterContent={
          <div>
            <ReaderChapterClient
              userId={user?.id ?? null}
              bookId={book.id}
              bookVersionId={chapter.book_version_id}
              chapterId={chapter.id}
              chapterTitle={chapter.title}
              chapterContent={chapter.content ?? null}
              initialHighlights={initialHighlights}
              initialPreferences={profilePreferences}
              initialSettings={initialReaderSettings}
            />
          </div>
        }
        audioPlayer={
          <ChapterAudiobookPlayer
            bookId={book.id}
            chapterId={chapter.id}
            audiobookStatus={typeof (book as { audiobook_status?: string | null }).audiobook_status === "string"
              ? (book as { audiobook_status?: string | null }).audiobook_status
              : null}
            isAuthorView={isAuthorView}
          />
        }
        gate={
          readAccess.access === "preview" && readAccess.isLastPreview ? (
            <FreemiumGate
              bookId={book.id}
              priceAmount={priceAmount}
              priceCurrency={priceCurrency}
              isSignedIn={Boolean(user)}
              signInHref={signInHref}
            />
          ) : undefined
        }
        footerNavigation={footerNavigation}
        commentsSection={commentsSection}
      />
    </>
  );
}
