import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLanguageLabel, getSeoLanguageLabel, normalizeLanguage } from "@/lib/languages";
import { canUserReadBook } from "@/lib/books/access";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import type { Metadata } from "next";
import StartReadingLink from "./StartReadingLink";
import BookmarkButton from "./BookmarkButton";
import OfflineSaveButton from "./OfflineSaveButton";
import PurchaseBookButton from "./PurchaseBookButton";
import PurchaseChapterButton from "./PurchaseChapterButton";
import PurchaseSuccessRefresh from "./PurchaseSuccessRefresh";
import BookReviewsSection from "./BookReviewsSection";
import CommentsSection from "./CommentsSection";
import SimilarBooksRail from "@/components/reader/SimilarBooksRail";
import { Skeleton } from "@/components/ui/Skeleton";

function SimilarBooksRailSkeleton() {
  return (
    <section className="mx-auto max-w-[1100px] px-6 py-8">
      <Skeleton height={20} width={180} className="mb-4" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[180px] flex-shrink-0">
            <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-white/10" />
            <div className="mt-3 space-y-2">
              <Skeleton height={16} className="w-3/4" />
              <Skeleton height={12} className="w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function getBook(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id, language, original_language, original_url, audiobook_status, price_amount, price_currency, pricing_model")
    .eq("id", id)
    .maybeSingle();
  return data;
}

function formatMoney(amount: number, currency: string): string {
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lang?: string; purchase?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  if (!book || (book.status && book.status !== "PUBLISHED")) {
    return { title: "Book not found" };
  }
  const supabase = await createClient();
  const { data: versions } = await supabase
    .from("book_versions")
    .select("id, language_code, published_at")
    .eq("book_id", id)
    .order("created_at", { ascending: true });

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLang = resolvedSearchParams?.lang ? normalizeLanguage(resolvedSearchParams.lang) : null;
  const originalLang = normalizeLanguage((book as { original_language?: string | null }).original_language ?? book.language);
  const version =
    (requestedLang ? (versions ?? []).find((v) => normalizeLanguage(v.language_code) === requestedLang) : null) ??
    (versions ?? []).find((v) => normalizeLanguage(v.language_code) === originalLang) ??
    (versions ?? [])[0];

  if (!version || !version.published_at) {
    return { title: "Book not found" };
  }

  const lang = normalizeLanguage(version.language_code);
  const title = `${book.title} ${getSeoLanguageLabel(lang)}`;
  const descSuffix = `Read ${book.title} in ${getLanguageLabel(lang)} on Verkli.`;
  const description =
    `${descSuffix} ${(book.description ?? "").slice(0, 120)}${(book.description ?? "").length > 120 ? "…" : ""}`.trim();
  const coverImage = (book as { cover_image?: string | null }).cover_image;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
  return {
    title,
    description: description || descSuffix,
    openGraph: {
      title: `${title} | Verkli`,
      description: description || descSuffix,
      url: `${siteUrl}/reader/books/${id}`,
      siteName: "Verkli",
      type: "book",
      ...(coverImage ? { images: [{ url: coverImage, alt: book.title }] } : {}),
    },
    twitter: {
      card: coverImage ? "summary_large_image" : "summary",
      title: `${title} | Verkli`,
      description: description || descSuffix,
      ...(coverImage ? { images: [coverImage] } : {}),
    },
    alternates: {
      canonical: `${siteUrl}/reader/books/${id}`,
    },
  };
}

export default async function ReaderBookDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lang?: string; purchase?: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id, language, original_language, original_url, audiobook_status, price_amount, price_currency, pricing_model")
    .eq("id", id)
    .maybeSingle();

  if (!book || (book.status && book.status !== "PUBLISHED")) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const priceAmount = Math.max(0, Math.trunc(Number((book as { price_amount?: number | null }).price_amount ?? 0)));
  const priceCurrency = String((book as { price_currency?: string | null }).price_currency ?? "USD").trim().toUpperCase() || "USD";
  const pricingModel = String((book as { pricing_model?: string | null }).pricing_model ?? "book_only");
  const isPerChapter = pricingModel === "per_chapter";
  const isFreeBook = priceAmount <= 0;
  const hasReadAccess = await canUserReadBook({
    supabase,
    userId: user?.id ?? null,
    bookId: book.id,
    bookAuthorId: String((book as { author_id?: string | null }).author_id ?? ""),
    bookPriceAmount: priceAmount,
    bookPricingModel: pricingModel,
  });

  try {
    await logAnalyticsEvent(supabase, {
      eventType: "book_view",
      userId: user?.id ?? null,
      bookId: book.id,
      path: `/reader/books/${book.id}`,
      props: { hasReadAccess },
    });
  } catch {
    // Non-blocking for reader flow.
  }

  const { data: versions } = await supabase
    .from("book_versions")
    .select("id, language_code, published_at")
    .eq("book_id", book.id)
    .order("created_at", { ascending: true });

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLang = resolvedSearchParams?.lang ? normalizeLanguage(resolvedSearchParams.lang) : null;
  const originalLang = normalizeLanguage((book as { original_language?: string | null }).original_language ?? book.language);
  const activeVersion =
    (requestedLang ? (versions ?? []).find((v) => normalizeLanguage(v.language_code) === requestedLang) : null) ??
    (versions ?? []).find((v) => normalizeLanguage(v.language_code) === originalLang) ??
    (versions ?? [])[0];

  if (!activeVersion || !activeVersion.published_at) {
    notFound();
  }
  const lang = normalizeLanguage(activeVersion.language_code);
  const availableLanguages = Array.from(
    new Map(
      (versions ?? [])
        .filter((version) => Boolean(version.published_at))
        .map((version) => {
          const code = normalizeLanguage(version.language_code);
          return [
            code,
            {
              languageCode: code,
              displayName: getLanguageLabel(code),
              isCurrentLanguage: code === lang,
            },
          ] as const;
        })
    ).values()
  );

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", book.author_id)
    .maybeSingle();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_version_id", activeVersion.id)
    .order("order", { ascending: true });

  const { data: ratingRows } = await supabase
    .from("reviews")
    .select("rating")
    .eq("book_id", book.id);

  const ratingsCount = ratingRows?.length ?? 0;
  const averageRating =
    ratingsCount > 0
      ? Number(
          (
            (ratingRows ?? []).reduce(
              (sum, row) => sum + Number((row as { rating?: number }).rating ?? 0),
              0
            ) / ratingsCount
          ).toFixed(2)
        )
      : null;

  const chaptersCount = chapters?.length ?? 0;
  const firstChapter = chapters?.[0];
  const contentPattern = /^(kapitel|chapter)\s+\d/i;
  const firstContentChapter = (chapters ?? []).find((c) => contentPattern.test(c.title ?? "")) ?? firstChapter;

  let lastChapterId: string | null = firstChapter?.id ?? null;
  let isBookmarked = false;
  if (user && hasReadAccess) {
    const [readingRes, bookmarkRes] = await Promise.all([
      supabase
        .from("readings")
        .select("chapter_id")
        .eq("user_id", user.id)
        .eq("book_id", book.id)
        .maybeSingle(),
      supabase
        .from("bookmarks")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", book.id)
        .maybeSingle(),
    ]);
    if (readingRes.data?.chapter_id) lastChapterId = readingRes.data.chapter_id;
    isBookmarked = !!bookmarkRes.data;
  }

  // For per_chapter books, load which chapters the user has purchased
  const purchasedChapterIds = new Set<string>();
  if (user && isPerChapter && !isFreeBook) {
    const { data: chapterEntitlements } = await supabase
      .from("entitlements")
      .select("chapter_id")
      .eq("user_id", user.id)
      .eq("book_id", book.id)
      .eq("source", "purchase")
      .not("chapter_id", "is", null);
    for (const ent of chapterEntitlements ?? []) {
      if (ent.chapter_id) purchasedChapterIds.add(String(ent.chapter_id));
    }
  }

  const authorName = authorProfile?.display_name || authorProfile?.username || "Author";
  const languageName = getLanguageLabel(lang);
  const originalUrl = (book as { original_url?: string | null }).original_url;
  const purchaseState = resolvedSearchParams?.purchase;
  const signInHref = `/reader/signin?next=${encodeURIComponent(`/reader/books/${book.id}`)}`;
  const chapterOptions = (chapters ?? []).map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    order: chapter.order,
  }));
  const bookAuthorId = String((book as { author_id?: string | null }).author_id ?? "");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: { "@type": "Person", name: authorName },
    ...(book.description ? { description: book.description } : {}),
    ...((book as { cover_image?: string | null }).cover_image
      ? { image: (book as { cover_image?: string | null }).cover_image }
      : {}),
    inLanguage: lang,
    url: `${siteUrl}/reader/books/${book.id}`,
    ...(averageRating !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: averageRating,
            ratingCount: ratingsCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="mx-auto max-w-[1100px] px-6 pt-10">
        <Link href="/reader/discover" className="text-[13px] text-slate-600 hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
          <span aria-hidden>←</span> Back to discover
        </Link>
      </header>

      <section className="mx-auto grid max-w-[1100px] gap-10 px-6 py-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative overflow-hidden rounded-[28px] border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/5">
          {(book as { cover_image?: string | null }).cover_image ? (
            <Image
              src={(book as { cover_image?: string | null }).cover_image!}
              alt={book.title}
              fill
              sizes="(min-width: 1024px) 420px, 100vw"
              className="object-cover"
              priority
              unoptimized
            />
          ) : (
            <div className="flex h-full min-h-[360px] w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
              <span className="text-[18px] font-semibold text-slate-700 dark:text-white/70">No cover</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div>
          <h1 className="text-[36px] font-semibold tracking-tight text-slate-900 dark:text-white md:text-[44px]">
            {book.title}
          </h1>
          <Link
            href={`/reader/authors/${book.author_id}`}
            className="mt-2 block text-[15px] text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/80"
          >
            {authorName}
          </Link>

          <div className="mt-4">
            <p className="text-[12px] font-medium text-slate-600 dark:text-white/60">Available languages:</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
              {availableLanguages.map((language) => (
                <Link
                  key={language.languageCode}
                  href={`/reader/books/${book.id}?lang=${encodeURIComponent(language.languageCode)}`}
                  aria-current={language.isCurrentLanguage ? "page" : undefined}
                  className={
                    language.isCurrentLanguage
                      ? "rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 text-slate-600 transition hover:border-black/20 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:border-white/20 dark:hover:text-white/80"
                  }
                >
                  {language.displayName}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-[12px] text-slate-600 dark:text-white/60">
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {chaptersCount ?? 0} chapters
            </span>
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">Published</span>
            <span className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300" aria-label={`Language: ${languageName}`}>
              {languageName}
            </span>
            {book.audiobook_status === "published" ? (
              <span className="rounded-full border border-violet-600/30 bg-violet-500/10 px-3 py-1 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300">
                Audiobook available
              </span>
            ) : book.audiobook_status === "generating" ? (
              <span className="rounded-full border border-blue-600/30 bg-blue-500/10 px-3 py-1 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300">
                Audiobook generating
              </span>
            ) : (
              <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">
                No audio yet
              </span>
            )}
            <span className="rounded-full border border-amber-600/30 bg-amber-500/10 px-3 py-1 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
              {averageRating !== null
                ? `Rating ${averageRating.toFixed(1)}/5 (${ratingsCount})`
                : "No ratings yet"}
            </span>
          </div>

          <p className="mt-4 text-[14px] font-medium text-slate-700 dark:text-white/80">
            Read in {languageName} on Verkli
          </p>

          <p className="mt-6 text-[15px] leading-relaxed text-slate-600 dark:text-white/60">
            {book.description || "No description yet."}
          </p>

          {purchaseState === "success" ? (
            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-200">
              <PurchaseSuccessRefresh />
            </div>
          ) : purchaseState === "failed" ? (
            <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
              <p className="font-semibold text-rose-700 dark:text-rose-300">Payment verification failed.</p>
              <p className="mt-1 text-rose-700 dark:text-rose-300">Try again or contact support.</p>
            </div>
          ) : purchaseState === "cancelled" ? (
            <div className="mt-6 rounded-2xl border border-slate-300/50 bg-slate-100 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
              Checkout cancelled. You can try again anytime.
            </div>
          ) : null}

          {!hasReadAccess && !isFreeBook && !isPerChapter ? (
            <div className="mt-6 rounded-[20px] border border-[#907AFF]/20 bg-[#907AFF]/5 p-5 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">This book requires purchase or Verkli Plus</p>
              <p className="mt-1 text-slate-600 dark:text-white/60">
                Chapter 1 is free to read. Unlock all chapters for {formatMoney(priceAmount, priceCurrency)} or with Verkli Plus.
              </p>
            </div>
          ) : null}

          {!hasReadAccess && !isFreeBook && isPerChapter ? (
            <div className="mt-6 rounded-[20px] border border-[#907AFF]/20 bg-[#907AFF]/5 p-5 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">Chapters available individually</p>
              <p className="mt-1 text-slate-600 dark:text-white/60">
                First chapter is free. Buy chapters individually for {formatMoney(priceAmount, priceCurrency)} each, or get all with Verkli Plus.
              </p>
            </div>
          ) : null}

          <div className="mt-9 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              {hasReadAccess ? (
                <StartReadingLink
                  bookId={book.id}
                  firstChapterId={firstChapter?.id ?? null}
                  serverChapterId={user ? lastChapterId : null}
                />
              ) : isPerChapter ? (
                <>
                  {firstContentChapter && (
                    <Link
                      href={`/reader/read/${firstContentChapter.id}`}
                      className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:shadow"
                    >
                      Read chapter 1 free
                    </Link>
                  )}
                  <Link
                    href="/reader/billing"
                    className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl border border-[#907AFF]/30 bg-[#907AFF]/10 px-5 text-sm font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/20 dark:text-[#B8A9FF] dark:hover:bg-[#907AFF]/15"
                  >
                    Verkli Plus
                  </Link>
                </>
              ) : (
                <>
                  {firstContentChapter && (
                    <Link
                      href={`/reader/read/${firstContentChapter.id}`}
                      className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:shadow"
                    >
                      Read chapter 1 free
                    </Link>
                  )}
                  {user ? (
                    <PurchaseBookButton bookId={book.id} amount={priceAmount} currency={priceCurrency} />
                  ) : (
                    <Link
                      href={signInHref}
                      className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl bg-[#907AFF] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8069EE] hover:shadow"
                    >
                      Sign in to purchase
                    </Link>
                  )}
                  <Link
                    href="/reader/billing"
                    className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl border border-[#907AFF]/30 bg-[#907AFF]/10 px-5 text-sm font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/20 dark:text-[#B8A9FF] dark:hover:bg-[#907AFF]/15"
                  >
                    Verkli Plus
                  </Link>
                </>
              )}
              {user && hasReadAccess && (
                <BookmarkButton bookId={book.id} initialBookmarked={isBookmarked} />
              )}
              {user && hasReadAccess && (
                <OfflineSaveButton
                  bookId={book.id}
                  userId={user.id}
                  languageCode={lang}
                />
              )}
              {originalUrl && (
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300 dark:border-white/15 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
                >
                  Original on Amazon
                  <span aria-hidden className="text-slate-400 dark:text-white/50">↗</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
      {isPerChapter && !isFreeBook && (chapters ?? []).length > 0 && (
        <section className="mx-auto max-w-[1100px] px-6 pb-8">
          <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white mb-4">Chapters</h2>
          <div className="space-y-2">
            {(chapters ?? []).map((ch, idx) => {
              const isPreviewChapter = idx === 0;
              const isPurchased = purchasedChapterIds.has(ch.id);
              return (
                <div key={ch.id} className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-white/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-medium text-slate-400 dark:text-white/40 w-6 text-right flex-shrink-0">{ch.order}</span>
                    <Link href={`/reader/read/${ch.id}`} className="text-sm text-slate-800 hover:text-slate-900 dark:text-white/80 dark:hover:text-white truncate">
                      {ch.title}
                    </Link>
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    {isPreviewChapter || hasReadAccess || isPurchased ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        {isPreviewChapter ? "Free" : "Unlocked"}
                      </span>
                    ) : user ? (
                      <PurchaseChapterButton bookId={book.id} chapterId={ch.id} amount={priceAmount} currency={priceCurrency} />
                    ) : (
                      <Link href={signInHref} className="text-xs font-medium text-[#907AFF] hover:text-[#8069EE]">
                        Sign in to buy
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Suspense fallback={<SimilarBooksRailSkeleton />}>
        <SimilarBooksRail
          bookId={book.id}
          authorId={book.author_id}
          language={book.language}
        />
      </Suspense>
      <BookReviewsSection
        bookId={book.id}
        isSignedIn={Boolean(user)}
        initialAverageRating={averageRating}
        initialRatingsCount={ratingsCount}
      />
      <CommentsSection
        bookId={book.id}
        bookAuthorId={bookAuthorId}
        currentUserId={user?.id ?? null}
        isSignedIn={Boolean(user)}
        signInHref={signInHref}
        chapterOptions={chapterOptions}
      />
    </main>
  );
}
