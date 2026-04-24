import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lock } from "lucide-react";
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
import OrderPhysicalCopyButton from "./OrderPhysicalCopyButton";
import BookReviewsSection from "./BookReviewsSection";
import CommentsSection from "./CommentsSection";
import FollowAuthorButton from "@/app/(reader-browse)/reader/authors/[id]/FollowAuthorButton";
import SimilarBooksRail from "@/components/reader/SimilarBooksRail";
import { Skeleton } from "@/components/ui/Skeleton";
import { normalizePrintOnDemandSettings } from "@/lib/print-on-demand";
import ReaderBookPageView from "@/features/reader/reader-book/ReaderBookPageView";



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
    .select("id, title, description, cover_image, status, author_id, language, original_language, original_url, audiobook_status, price_amount, price_currency, pricing_model, print_on_demand_settings, trailer_url")
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
    .select("id, title, description, cover_image, status, author_id, language, original_language, original_url, audiobook_status, price_amount, price_currency, pricing_model, print_on_demand_settings, trailer_url")
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

  logAnalyticsEvent(supabase, {
    eventType: "book_view",
    userId: user?.id ?? null,
    bookId: book.id,
    path: `/reader/books/${book.id}`,
    props: { hasReadAccess },
  }).catch(() => {});

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
  let initialFollowing = false;
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

  if (user) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .eq("followee_id", book.author_id)
      .maybeSingle();
    initialFollowing = !!followRow;
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

  const chipClass = "rounded-full border border-black/[0.06] bg-white/70 px-3 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60";
  const metaChips = (
    <>
      <span className={chipClass}>{chaptersCount} chapters</span>
      <span className={chipClass}>{languageName}</span>
      <span className={chipClass}>
        {book.audiobook_status === "published"
          ? "Audiobook available"
          : book.audiobook_status === "generating"
            ? "Audiobook generating"
            : "Text edition"}
      </span>
      <span className={chipClass}>
        {averageRating !== null ? `${averageRating.toFixed(1)} rating` : "No ratings yet"}
      </span>
    </>
  );

  const languageSwitcher = (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/35">
        Read in
      </p>
      <div className="flex flex-wrap gap-2">
        {availableLanguages.map((language) => (
          <Link
            key={language.languageCode}
            href={`/reader/books/${book.id}?lang=${encodeURIComponent(language.languageCode)}`}
            aria-current={language.isCurrentLanguage ? "page" : undefined}
            className={
              language.isCurrentLanguage
                ? "rounded-full bg-slate-900 px-3.5 py-1.5 text-[12px] font-semibold text-white dark:bg-white dark:text-slate-900"
                : "rounded-full border border-black/[0.06] bg-white/60 px-3.5 py-1.5 text-[12px] font-medium text-slate-600 transition-colors duration-150 ease-out hover:border-black/[0.12] hover:text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60 dark:hover:text-white"
            }
          >
            {language.displayName}
          </Link>
        ))}
      </div>
    </div>
  );

  const notices = (
    <>
      {purchaseState === "success" ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-200">
          <PurchaseSuccessRefresh />
        </div>
      ) : purchaseState === "failed" ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
          <p className="font-semibold text-rose-700 dark:text-rose-300">Payment verification failed.</p>
          <p className="mt-1 text-rose-700 dark:text-rose-300">Try again or contact support.</p>
        </div>
      ) : purchaseState === "cancelled" ? (
        <div className="rounded-2xl border border-slate-300/50 bg-slate-100 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
          Checkout cancelled. You can try again anytime.
        </div>
      ) : null}

      {!hasReadAccess && !isFreeBook && !isPerChapter ? (
        <div className="rounded-2xl border border-[#907AFF]/15 bg-[#907AFF]/[0.04] p-5 text-sm dark:border-[#907AFF]/20 dark:bg-[#907AFF]/[0.06]">
          <p className="font-semibold text-slate-900 dark:text-white">This book requires purchase or Verkli Plus</p>
          <p className="mt-1 text-slate-500 dark:text-white/50">
            Chapter 1 is free to read. Unlock all chapters for {formatMoney(priceAmount, priceCurrency)} or with Verkli Plus.
          </p>
        </div>
      ) : null}

      {!hasReadAccess && !isFreeBook && isPerChapter ? (
        <div className="rounded-2xl border border-[#907AFF]/15 bg-[#907AFF]/[0.04] p-5 text-sm dark:border-[#907AFF]/20 dark:bg-[#907AFF]/[0.06]">
          <p className="font-semibold text-slate-900 dark:text-white">Chapters available individually</p>
          <p className="mt-1 text-slate-500 dark:text-white/50">
            First chapter is free. Buy chapters individually for {formatMoney(priceAmount, priceCurrency)} each, or get all with Verkli Plus.
          </p>
        </div>
      ) : null}
    </>
  );

  const actionBar = (
    <>
      {hasReadAccess ? (
        <StartReadingLink
          bookId={book.id}
          firstChapterId={firstChapter?.id ?? null}
          serverChapterId={user ? lastChapterId : null}
        />
      ) : isPerChapter ? (
        <>
          {firstContentChapter ? (
            <Link
              href={`/reader/read/${firstContentChapter.id}`}
              className="btn-primary"
            >
              Read chapter 1 free
            </Link>
          ) : null}
          <Link href="/reader/billing" className="btn-secondary">
            Verkli Plus
          </Link>
        </>
      ) : (
        <>
          {firstContentChapter ? (
            <Link
              href={`/reader/read/${firstContentChapter.id}`}
              className="btn-primary"
            >
              Read chapter 1 free
            </Link>
          ) : null}
          {user ? (
            <PurchaseBookButton bookId={book.id} amount={priceAmount} currency={priceCurrency} />
          ) : (
            <Link href={signInHref} className="btn-primary">
              Sign in to purchase
            </Link>
          )}
          <Link href="/reader/billing" className="btn-secondary">
            Verkli Plus
          </Link>
        </>
      )}
    </>
  );

  const utilityBar = (
    <>
      {user && hasReadAccess ? (
        <BookmarkButton bookId={book.id} initialBookmarked={isBookmarked} />
      ) : null}
      {user && hasReadAccess ? (
        <OfflineSaveButton
          bookId={book.id}
          userId={user.id}
          languageCode={lang}
        />
      ) : null}
      {originalUrl ? (
        <a
          href={originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
        >
          Original on Amazon
        </a>
      ) : null}
    </>
  );

  const chapterRows = (
    <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
      {(chapters ?? []).map((chapterItem, index) => {
        const isPreviewChapter = index === 0;
        const isPurchased = purchasedChapterIds.has(chapterItem.id);
        const isUnlocked = hasReadAccess || isFreeBook || isPreviewChapter || (isPerChapter && isPurchased);

        return (
          <div
            key={chapterItem.id}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-slate-400 dark:text-white/30">
                {chapterItem.order}
              </span>
              <Link
                href={`/reader/read/${chapterItem.id}`}
                className="truncate text-[13px] font-medium text-slate-700 transition-colors duration-150 ease-out hover:text-[#907AFF] dark:text-white/70 dark:hover:text-[#b8a8ff]"
              >
                {chapterItem.title}
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-[11px]">
              {isUnlocked ? (
                isPreviewChapter && !hasReadAccess ? (
                  <Link
                    href={`/reader/read/${chapterItem.id}`}
                    className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1 font-semibold text-emerald-700 transition-[background-color,transform] duration-150 ease-out hover:bg-emerald-500/15 active:scale-[0.97] dark:text-emerald-400"
                  >
                    Preview
                  </Link>
                ) : (
                  <Link
                    href={`/reader/read/${chapterItem.id}`}
                    className="rounded-full border border-[#907AFF]/20 bg-[#907AFF]/[0.07] px-3 py-1 font-semibold text-[#907AFF] transition-[background-color,transform] duration-150 ease-out hover:bg-[#907AFF]/12 active:scale-[0.97] dark:text-[#B8AAFF]"
                  >
                    Read
                  </Link>
                )
              ) : user && isPerChapter ? (
                <PurchaseChapterButton
                  bookId={book.id}
                  chapterId={chapterItem.id}
                  amount={priceAmount}
                  currency={priceCurrency}
                />
              ) : user ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100/80 px-3 py-1 font-medium text-slate-400 dark:bg-white/[0.05] dark:text-white/30">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
              ) : (
                <Link
                  href={signInHref}
                  className="rounded-full bg-[#907AFF]/10 px-3 py-1 font-semibold text-[#907AFF] transition-colors duration-150 ease-out hover:bg-[#907AFF]/20"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const editionNotes = [
    { label: "Language", value: languageName },
    { label: "Access", value: isPerChapter ? "Per chapter" : isFreeBook ? "Free" : formatMoney(priceAmount, priceCurrency) },
    {
      label: "Audio",
      value:
        book.audiobook_status === "published"
          ? "Audiobook available"
          : book.audiobook_status === "generating"
            ? "Audiobook generating"
            : "Text only",
    },
    {
      label: "Rating",
      value: averageRating !== null ? `${averageRating.toFixed(1)} from ${ratingsCount} reviews` : "No ratings yet",
    },
  ];

  const podSection = (() => {
    const podSettings = normalizePrintOnDemandSettings(
      (book as { print_on_demand_settings?: unknown }).print_on_demand_settings
    );
    const FORMAT_LABELS: Record<string, string> = { softcover: "Softcover", hardcover: "Hardcover" };
    const podFormats = podSettings.enabled
      ? podSettings.formats
          .map((fmt) => {
            const priceMinor = fmt === "softcover" ? podSettings.softcoverPriceMinor : podSettings.hardcoverPriceMinor;
            if (!priceMinor || priceMinor <= 0) return null;
            return { format: fmt, label: FORMAT_LABELS[fmt] ?? fmt, priceMinor, currency: podSettings.priceCurrency };
          })
          .filter((format): format is NonNullable<typeof format> => format !== null)
      : [];

    if (podFormats.length === 0) return null;

    return (
      <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="border-b border-black/[0.05] px-6 py-4 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
            Physical copy
          </h3>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-500 dark:text-white/50">
            Printed and shipped on demand. Delivery usually takes 5–10 business days.
          </p>
          {user ? (
            <OrderPhysicalCopyButton bookId={book.id} formats={podFormats} />
          ) : (
            <Link href={signInHref} className="btn-secondary">
              Sign in to order
            </Link>
          )}
        </div>
      </div>
    );
  })();

  return (
    <main className="min-h-screen text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ReaderBookPageView
        coverUrl={(book as { cover_image?: string | null }).cover_image ?? null}
        backHref="/reader/discover"
        title={book.title}
        authorName={authorName}
        authorHref={`/reader/authors/${book.author_id}`}
        cover={
          <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] border border-black/[0.08] bg-black/[0.04] shadow-[0_26px_60px_-36px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/[0.05]">
            {(book as { cover_image?: string | null }).cover_image ? (
              <Image
                src={(book as { cover_image?: string | null }).cover_image!}
                alt={book.title}
                fill
                sizes="(min-width: 1024px) 280px, 220px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                <span className="text-[18px] font-semibold text-slate-700 dark:text-white/70">No cover</span>
              </div>
            )}
          </div>
        }
        followAction={
          <FollowAuthorButton
            authorId={String(book.author_id)}
            isSignedIn={Boolean(user)}
            signInHref={signInHref}
            initialFollowing={initialFollowing}
          />
        }
        metaChips={metaChips}
        languageSwitcher={languageSwitcher}
        description={book.description || "No description yet."}
        notices={notices}
        actionBar={actionBar}
        utilityBar={utilityBar}
        trailerSection={
          book.trailer_url ? (
            <section className="mx-auto mt-6 max-w-[1100px] px-6">
              <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-black/5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-black/30">
                <video
                  src={book.trailer_url}
                  controls
                  playsInline
                  preload="metadata"
                  poster={book.cover_image || undefined}
                  className="h-auto w-full"
                />
              </div>
            </section>
          ) : null
        }
        editionNotes={editionNotes}
        chaptersSection={chapterRows}
        podSection={podSection}
        relatedSection={
          <Suspense fallback={<SimilarBooksRailSkeleton />}>
            <SimilarBooksRail
              bookId={book.id}
              authorId={book.author_id}
              language={book.language}
            />
          </Suspense>
        }
        reviewsSection={
          <BookReviewsSection
            bookId={book.id}
            isSignedIn={Boolean(user)}
            initialAverageRating={averageRating}
            initialRatingsCount={ratingsCount}
          />
        }
        commentsSection={
          <CommentsSection
            bookId={book.id}
            bookAuthorId={bookAuthorId}
            currentUserId={user?.id ?? null}
            isSignedIn={Boolean(user)}
            signInHref={signInHref}
            chapterOptions={chapterOptions}
          />
        }
      />
    </main>
  );
}
