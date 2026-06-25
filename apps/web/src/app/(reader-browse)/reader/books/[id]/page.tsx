import { cache, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLanguageLabel, getSeoLanguageLabel, normalizeLanguage } from "@/lib/languages";
import { canUserReadBook } from "@/lib/books/access";
import { logAnalyticsEvent } from "@/lib/analytics/events";
import { capturePostHog } from "@/lib/analytics/posthog-server";
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
import { formatMoney } from "@/lib/format-money";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPublicAuthorInfoMap,
  resolvePublicAuthorName,
} from "@/lib/authors/public-author";
import { isDemoModeActive } from "@/lib/flags";
import DemoReaderFinale, { type DemoChapterByLang } from "./DemoReaderFinale";



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

// React `cache()` dedupes the per-request fetches. generateMetadata and the
// page handler both need the same `book` row and `book_versions` list; without
// caching we hit Supabase twice per render.
const getBook = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id, language, original_language, original_url, audiobook_status, price_amount, price_currency, pricing_model, print_on_demand_settings, trailer_url")
    .eq("id", id)
    .maybeSingle();
  return data;
});

const getBookVersions = cache(async (bookId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("book_versions")
    .select("id, language_code, published_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });
  return data ?? [];
});

interface DemoFinaleData {
  chapters: DemoChapterByLang[];
  /** Per-language chapter ID for the "Read full →" link, when available. */
  readChapterByLang: Record<string, string>;
}

/**
 * Server-side fetch for the demo reader-finalen: pulls the first paragraph
 * of every translated chapter so the client component can morph between
 * languages without further round-trips. Returns null when the book's
 * author is not the demo profile or the demo flag is off.
 */
async function loadDemoFinaleData(
  bookId: string,
  authorId: string
): Promise<DemoFinaleData | null> {
  if (!authorId) return null;
  // Use the admin client because we need to read demo_mode bypassing RLS.
  // The check is read-only and cheap.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("demo_mode")
    .eq("user_id", authorId)
    .maybeSingle();
  const demoMode = (profile as { demo_mode?: boolean | null } | null)?.demo_mode;
  if (!isDemoModeActive({ demo_mode: demoMode })) return null;

  // One round-trip pulls all chapters for this book; we narrow to the
  // book_versions row that matches each chapter so we know the language.
  const { data: rows } = await admin
    .from("chapters")
    .select("id, content, book_version_id, book_versions(language_code)")
    .eq("book_id", bookId)
    .order("order", { ascending: true });

  const chapters: DemoChapterByLang[] = [];
  const readChapterByLang: Record<string, string> = {};
  for (const row of (rows ?? []) as Array<{
    id: string;
    content: string | null;
    book_versions?: { language_code?: string | null } | null;
  }>) {
    const lang = row.book_versions?.language_code;
    if (!lang) continue;
    const fullText = extractAllParagraphs(row.content);
    const excerpt =
      extractFirstParagraph(row.content) ?? fullText.split("\n\n")[0] ?? "";
    if (excerpt || fullText) {
      chapters.push({
        language_code: lang,
        excerpt,
        fullText: fullText || excerpt,
      });
      if (row.id) readChapterByLang[lang] = row.id;
    }
  }

  // De-dupe by language (we only want one excerpt per lang in case a
  // future seed adds multiple chapters per version) and sort with sv first
  // so the demo opens on the source language.
  const seen = new Set<string>();
  const ordered = chapters
    .filter((c) => {
      if (seen.has(c.language_code)) return false;
      seen.add(c.language_code);
      return true;
    })
    .sort((a, b) => {
      if (a.language_code === "sv") return -1;
      if (b.language_code === "sv") return 1;
      return a.language_code.localeCompare(b.language_code);
    });

  return ordered.length > 0
    ? { chapters: ordered, readChapterByLang }
    : null;
}

/**
 * Pull every paragraph plaintext out of a TipTap JSON document, joined
 * with double-newlines. Used to render the full chapter inline in the
 * demo reader-finalen.
 */
function extractAllParagraphs(raw: string | null): string {
  if (!raw) return "";
  try {
    const doc = JSON.parse(raw) as {
      content?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    const paragraphs: string[] = [];
    for (const node of doc.content ?? []) {
      if (node.type === "paragraph") {
        const text = (node.content ?? [])
          .map((t) => (t.type === "text" ? (t.text ?? "") : ""))
          .join("")
          .trim();
        if (text) paragraphs.push(text);
      }
    }
    return paragraphs.join("\n\n");
  } catch {
    return raw.trim();
  }
}

/** Pull the first paragraph plaintext out of a TipTap JSON document. */
function extractFirstParagraph(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw) as {
      content?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    for (const node of doc.content ?? []) {
      if (node.type === "paragraph") {
        const text = (node.content ?? [])
          .map((t) => (t.type === "text" ? (t.text ?? "") : ""))
          .join("")
          .trim();
        if (text) return text;
      }
    }
  } catch {
    // fall through — return raw text if not valid JSON
    const trimmed = raw.trim();
    if (trimmed) return trimmed.slice(0, 500);
  }
  return null;
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
  const versions = await getBookVersions(id);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLang = resolvedSearchParams?.lang ? normalizeLanguage(resolvedSearchParams.lang) : null;
  const originalLang = normalizeLanguage((book as { original_language?: string | null }).original_language ?? book.language);
  const version =
    (requestedLang ? versions.find((v) => normalizeLanguage(v.language_code) === requestedLang) : null) ??
    versions.find((v) => normalizeLanguage(v.language_code) === originalLang) ??
    versions[0];

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

  // Reuses the cached fetch from generateMetadata when the same request
  // already loaded the book row.
  const book = await getBook(id);

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

  if (user?.id) {
    capturePostHog({
      distinctId: user.id,
      event: "book_opened",
      properties: {
        book_id: book.id,
        book_title: book.title,
        has_read_access: hasReadAccess,
        path: `/reader/books/${book.id}`,
      },
    });
  }

  const versions = await getBookVersions(book.id);

  // Demo-finalen detection. If the book's author is the seeded demo
  // profile AND the deployment-level demo flag is on, we render the
  // pitch-tuned above-the-fold layout. Real users never trigger this
  // branch — `isDemoModeActive` short-circuits when either piece is off.
  const demoFinaleData = await loadDemoFinaleData(book.id, book.author_id ?? "");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLang = resolvedSearchParams?.lang ? normalizeLanguage(resolvedSearchParams.lang) : null;
  const originalLang = normalizeLanguage((book as { original_language?: string | null }).original_language ?? book.language);
  const activeVersion =
    (requestedLang ? versions.find((v) => normalizeLanguage(v.language_code) === requestedLang) : null) ??
    versions.find((v) => normalizeLanguage(v.language_code) === originalLang) ??
    versions[0];

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

  // These four reads are independent — fan them out so TTFB is bounded by
  // the slowest single round-trip instead of the sum.
  const [authorInfoMap, genreJunctionRes, chaptersRes, ratingRowsRes] =
    await Promise.all([
      // Resolve author attribution past RLS like /reader/authors does — an
      // anon `profiles` read returns nothing for RLS-private profiles, which
      // rendered a generic "Author". See lib/authors/public-author.ts.
      getPublicAuthorInfoMap(book.author_id ? [book.author_id] : []),
      supabase
        .from("book_genres")
        .select("genres(name, name_en)")
        .eq("book_id", book.id),
      supabase
        .from("chapters")
        .select("id, title, order")
        .eq("book_version_id", activeVersion.id)
        .order("order", { ascending: true }),
      supabase.from("reviews").select("rating").eq("book_id", book.id),
    ]);

  const authorProfile = book.author_id ? authorInfoMap.get(book.author_id) : null;
  const bookGenres = (genreJunctionRes.data ?? [])
    .map((row) => {
      const g = Array.isArray(row.genres) ? row.genres[0] : row.genres;
      if (!g || typeof g !== "object") return null;
      const value = ("name_en" in g && g.name_en) || ("name" in g && g.name) || null;
      return typeof value === "string" && value.trim() ? value.trim() : null;
    })
    .filter((g): g is string => Boolean(g));
  const chapters = chaptersRes.data;
  const ratingRows = ratingRowsRes.data;

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
  const purchasedChapterIds = new Set<string>();

  // Fan out the four user-scoped reads (readings, bookmarks, follows,
  // entitlements). They were previously serialized across three sequential
  // blocks; with hasReadAccess already known, none of them depend on each
  // other so a single Promise.all collapses three round-trips into one.
  if (user) {
    const [readingRes, bookmarkRes, followRes, entitlementsRes] =
      await Promise.all([
        hasReadAccess
          ? supabase
              .from("readings")
              .select("chapter_id")
              .eq("user_id", user.id)
              .eq("book_id", book.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        hasReadAccess
          ? supabase
              .from("bookmarks")
              .select("id")
              .eq("user_id", user.id)
              .eq("book_id", book.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", user.id)
          .eq("followee_id", book.author_id)
          .maybeSingle(),
        isPerChapter && !isFreeBook
          ? supabase
              .from("entitlements")
              .select("chapter_id")
              .eq("user_id", user.id)
              .eq("book_id", book.id)
              .eq("source", "purchase")
              .not("chapter_id", "is", null)
          : Promise.resolve({ data: [] as Array<{ chapter_id: string | null }> }),
      ]);

    if (readingRes.data?.chapter_id) lastChapterId = readingRes.data.chapter_id;
    isBookmarked = !!bookmarkRes.data;
    initialFollowing = !!followRes.data;
    for (const ent of entitlementsRes.data ?? []) {
      if (ent.chapter_id) purchasedChapterIds.add(String(ent.chapter_id));
    }
  }

  const authorName = resolvePublicAuthorName(authorProfile);
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
  const canonicalBookUrl = `${siteUrl}/reader/books/${book.id}`;
  const podSettings = normalizePrintOnDemandSettings(book.print_on_demand_settings);
  const bookFormats: string[] = ["https://schema.org/EBook"];
  if (book.audiobook_status === "published") bookFormats.push("https://schema.org/AudiobookFormat");
  if (podSettings.enabled) bookFormats.push("https://schema.org/Paperback");
  const jsonLdOffer = isFreeBook
    ? {
        "@type": "Offer",
        price: "0",
        priceCurrency: priceCurrency,
        availability: "https://schema.org/InStock",
        url: canonicalBookUrl,
      }
    : {
        "@type": "Offer",
        price: (priceAmount / 100).toFixed(2),
        priceCurrency: priceCurrency,
        availability: "https://schema.org/InStock",
        url: canonicalBookUrl,
      };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    "@id": canonicalBookUrl,
    name: book.title,
    author: {
      "@type": "Person",
      name: authorName,
      url: `${siteUrl}/reader/authors/${book.author_id}`,
    },
    ...(book.description ? { description: book.description } : {}),
    ...((book as { cover_image?: string | null }).cover_image
      ? { image: (book as { cover_image?: string | null }).cover_image }
      : {}),
    inLanguage: lang,
    url: canonicalBookUrl,
    bookFormat: bookFormats,
    offers: jsonLdOffer,
    ...(bookGenres.length > 0 ? { genre: bookGenres } : {}),
    ...(activeVersion.published_at ? { datePublished: activeVersion.published_at } : {}),
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
      {demoFinaleData ? (
        <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <DemoReaderFinale
            bookTitle={book.title}
            coverImageUrl={
              (book as { cover_image?: string | null }).cover_image ??
              // Demo book has no real cover_image yet; fall back to the
              // first pre-baked demo cover so the hero never renders empty.
              "/demo-assets/covers/01.jpg"
            }
            trailerUrl={(book as { trailer_url?: string | null }).trailer_url ?? null}
            chapters={demoFinaleData.chapters}
            readChapterByLang={demoFinaleData.readChapterByLang}
          />
        </div>
      ) : null}
      {/*
       * Hide the standard reader UI behind the demo hero. The pitch
       * lives entirely above the fold — comments, similar-books,
       * reviews etc. would only fragment the moment if shown.
       */}
      <div className={demoFinaleData ? "hidden" : "contents"}>
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
      </div>
    </main>
  );
}
