import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUserReadBook } from "@/lib/books/access";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import PurchaseBookButton from "../../books/[id]/PurchaseBookButton";
import CommentsSection from "../../books/[id]/CommentsSection";
import ReadingProgress from "./ReadingProgress";
import ReaderChapterClient, { type ReaderHighlight, type ReaderSettings } from "./ReaderChapterClient";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseReaderSettings(preferences: Record<string, unknown> | null): ReaderSettings {
  const defaults: ReaderSettings = {
    fontSize: 16,
    lineHeight: 1.7,
  };

  if (!preferences) return defaults;

  const reader = asRecord(preferences.reader);
  const settings = asRecord(reader?.settings);
  const fontSize = typeof settings?.fontSize === "number" ? settings.fontSize : defaults.fontSize;
  const lineHeight = typeof settings?.lineHeight === "number" ? settings.lineHeight : defaults.lineHeight;

  return {
    fontSize: Math.min(24, Math.max(13, fontSize)),
    lineHeight: Math.min(2.1, Math.max(1.4, lineHeight)),
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
    .select("id, title, status, author_id, price_amount, price_currency")
    .eq("id", chapter.book_id)
    .maybeSingle();

  if (!book || book.status !== "PUBLISHED") {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050508] dark:text-white">
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
    .eq("book_id", book.id)
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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050508] dark:text-white">
      <ReadingProgress
        bookId={book.id}
        chapterId={chapter.id}
        progressPercent={progressPercent}
      />
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-8">
        <Link href={`/reader/books/${book.id}`} className="text-[13px] text-slate-600 hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
          ← Back to book
        </Link>
        <span className="text-[13px] text-slate-500 dark:text-white/40">Reading mode</span>
      </header>

      <section className="mx-auto grid max-w-[1200px] gap-8 px-6 pb-16 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[24px] border border-black/10 bg-black/[0.04] p-6 dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-[16px] font-semibold">Chapters</h2>
          <div className="mt-4 space-y-3 text-[13px] text-slate-600 dark:text-white/60">
            {chapters && chapters.length > 0 ? (
              chapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/reader/read/${ch.id}`}
                  className={`block rounded-xl border px-3 py-2 transition dark:border-white/10 dark:bg-white/5 ${
                    ch.id === chapter.id
                      ? "border-[#907AFF]/50 bg-[#907AFF]/10 dark:border-[#907AFF]/40 dark:bg-[#907AFF]/15"
                      : "border-black/10 bg-black/[0.02] hover:border-black/20 dark:hover:border-white/20"
                  }`}
                >
                  {ch.order}. {ch.title}
                </Link>
              ))
            ) : (
              <div className="text-slate-500 dark:text-white/40">No chapters yet.</div>
            )}
          </div>
        </aside>

        <article className="rounded-[24px] border border-black/10 bg-black/[0.04] p-8 dark:border-white/10 dark:bg-white/[0.04]">
          <h1 className="text-[26px] font-semibold">{book.title}</h1>
          <div className="mt-6 text-[15px] leading-relaxed text-slate-700 dark:text-white/70">
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
