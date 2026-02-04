import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLanguageLabel, getSeoLanguageLabel, normalizeLanguageOrNull } from "@/lib/languages";
import type { Metadata } from "next";
import StartReadingLink from "./StartReadingLink";
import BookmarkButton from "./BookmarkButton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import LanguageTabs from "@/components/reader/LanguageTabs";

async function getBook(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id, language, original_language, original_url, audiobook_status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  if (!book || (book.status && book.status !== "PUBLISHED")) {
    return { title: "Book not found | Verkli" };
  }
  const supabase = await createClient();
  const { data: versions } = await supabase
    .from("book_versions")
    .select("id, language_code, published_at")
    .eq("book_id", id)
    .order("created_at", { ascending: true });

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLang = resolvedSearchParams?.lang ? normalizeLanguageOrNull(resolvedSearchParams.lang) : null;
  const originalLang = normalizeLanguageOrNull(
    (book as { original_language?: string | null; language?: string | null }).original_language ?? book.language
  );
  const version =
    (requestedLang ? (versions ?? []).find((v) => normalizeLanguageOrNull(v.language_code) === requestedLang) : null) ??
    (originalLang ? (versions ?? []).find((v) => normalizeLanguageOrNull(v.language_code) === originalLang) : null) ??
    (versions ?? [])[0];

  if (!version || !version.published_at) {
    return { title: "Book not found | Verkli" };
  }

  const lang = normalizeLanguageOrNull(version.language_code);
  const title = lang ? `${book.title} ${getSeoLanguageLabel(lang)}` : book.title;
  const descSuffix = lang
    ? `Read ${book.title} in ${getLanguageLabel(lang)} on Verkli.`
    : `Read ${book.title} on Verkli.`;
  const description =
    `${descSuffix} ${(book.description ?? "").slice(0, 120)}${(book.description ?? "").length > 120 ? "…" : ""}`.trim();
  return {
    title: `${title} | Verkli`,
    description: description || descSuffix,
  };
}

export default async function ReaderBookDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lang?: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_image, status, author_id, language, original_language, original_url, audiobook_status")
    .eq("id", id)
    .maybeSingle();

  if (!book || (book.status && book.status !== "PUBLISHED")) {
    notFound();
  }

  const { data: versions } = await supabase
    .from("book_versions")
    .select("id, language_code, published_at")
    .eq("book_id", book.id)
    .order("created_at", { ascending: true });

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLang = resolvedSearchParams?.lang ? normalizeLanguageOrNull(resolvedSearchParams.lang) : null;
  const originalLang = normalizeLanguageOrNull(
    (book as { original_language?: string | null; language?: string | null }).original_language ?? book.language
  );
  const activeVersion =
    (requestedLang ? (versions ?? []).find((v) => normalizeLanguageOrNull(v.language_code) === requestedLang) : null) ??
    (originalLang ? (versions ?? []).find((v) => normalizeLanguageOrNull(v.language_code) === originalLang) : null) ??
    (versions ?? [])[0];

  if (!activeVersion || !activeVersion.published_at) {
    notFound();
  }

  const publishedVersions = (versions ?? []).filter((version) => version.published_at);

  const { data: audiobookAsset } = await supabase
    .from("audiobook_assets")
    .select("id")
    .eq("book_id", book.id)
    .limit(1)
    .maybeSingle();

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

  const chaptersCount = chapters?.length ?? 0;
  const firstChapter = chapters?.[0];

  const { data: { user } } = await supabase.auth.getUser();
  let lastChapterId: string | null = firstChapter?.id ?? null;
  let isBookmarked = false;
  if (user) {
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

  const authorName = authorProfile?.display_name || authorProfile?.username || "Author";
  const lang = normalizeLanguageOrNull(activeVersion.language_code);
  const languageName = lang ? getLanguageLabel(lang) : "Unknown language";
  const originalUrl = (book as { original_url?: string | null }).original_url;
  const audiobookStatus = (book as { audiobook_status?: string | null }).audiobook_status;
  const audiobookAvailable = audiobookStatus === "published" && audiobookAsset != null;

  return (
    <div className="section-gap">
      <Breadcrumbs
        items={[{ label: "Discover", href: "/reader/discover" }, { label: book.title }]}
      />

      <LanguageTabs
        bookId={book.id}
        versions={publishedVersions}
        activeLanguage={normalizeLanguageOrNull(activeVersion.language_code) ?? "unknown"}
        originalLanguage={book.original_language ?? book.language}
      />

      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="relative overflow-hidden p-0">
          {(book as { cover_image?: string | null }).cover_image ? (
            <img src={(book as { cover_image?: string | null }).cover_image!} alt={book.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-[360px] w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
              <span className="text-[18px] font-semibold text-slate-700 dark:text-white/70">No cover</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </Card>

        <div className="space-y-6">
          <Link
            href={`/reader/authors/${book.author_id}`}
            className="block text-[14px] font-medium text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/80"
          >
            {authorName}
          </Link>

          <PageHeader
            title={book.title}
            description={book.description || "No description yet."}
            actions={
              <>
                <StartReadingLink
                  bookId={book.id}
                  firstChapterId={firstChapter?.id ?? null}
                  serverChapterId={user ? lastChapterId : null}
                />
                {user && <BookmarkButton bookId={book.id} initialBookmarked={isBookmarked} />}
                {originalUrl && (
                  <a
                    href={originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-[13px]"
                  >
                    Original on Amazon
                  </a>
                )}
              </>
            }
          />

          <div className="flex flex-wrap gap-2 text-[12px] text-slate-600 dark:text-white/60">
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">
              {chaptersCount ?? 0} chapters
            </span>
            <span className="rounded-full border border-black/10 bg-black/[0.02] px-3 py-1 dark:border-white/10 dark:bg-white/5">
              Published
            </span>
            <span
              className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              aria-label={`Language: ${languageName}`}
            >
              {languageName}
            </span>
          </div>

          <p className="text-[14px] font-medium text-slate-700 dark:text-white/80">
            Read in {languageName} on Verkli
          </p>

          {audiobookAvailable && (
            <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
              Audiobook available
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
