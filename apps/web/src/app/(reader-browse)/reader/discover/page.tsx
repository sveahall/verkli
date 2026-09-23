import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicAuthorInfoMap } from "@/lib/authors/public-author";
import { AVATARS_BUCKET_PUBLIC } from "@/lib/supabase/config";
import { getDiscoveryEnabled } from "@/lib/flags";
import {
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  type SupportedLanguage,
} from "@/lib/languages";
import ReaderDiscoverPageView from "@/features/reader/reader-discover/ReaderDiscoverPageView";

/* ── Search param types ── */

type SearchParams = {
  lang?: string | string[];
  q?: string | string[];
  genre?: string | string[]; // comma-separated slugs, e.g. "fiction,romance"
  format?: string | string[];
  sort?: string | string[];
};

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Discover books",
  description:
    "Browse featured books, new releases, curated lists, and public authors on Verkli. Find your next read — no signup required.",
  openGraph: {
    title: "Discover books | Verkli",
    description:
      "Browse featured books, new releases, curated lists, and public authors on Verkli.",
    siteName: "Verkli",
  },
};

/* ── Valid filter values ── */

const VALID_FORMATS = ["all", "ebook", "audiobook"] as const;
type Format = (typeof VALID_FORMATS)[number];

const VALID_SORTS = ["newest", "popular", "title"] as const;
type Sort = (typeof VALID_SORTS)[number];

function parseFormat(raw: string | undefined): Format {
  if (raw && VALID_FORMATS.includes(raw as Format)) return raw as Format;
  return "all";
}

function parseSort(raw: string | undefined): Sort {
  if (raw && VALID_SORTS.includes(raw as Sort)) return raw as Sort;
  return "newest";
}

// Next.js returns arrays for repeated query keys. Scalar filters use the first
// value; genres combine repeated keys and comma-separated selections.
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ── Data fetching ── */

function checkDiscoveryError(operation: string, error: { message: string } | null) {
  if (!error) return;
  console.error(`[reader discover] ${operation} failed`, error.message);
  throw new Error("Could not load Discover. Please try again.");
}

async function fetchFilteredBooks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    language: SupportedLanguage;
    query: string;
    genreSlugs: string[];
    format: Format;
    sort: Sort;
    limit: number;
  }
) {
  const { language, query, genreSlugs, format, sort, limit } = opts;

  // Apply genre membership in the same query as the book filters. A capped
  // junction lookup can discard relevant books before language/title/format.
  let base = (genreSlugs.length > 0
    ? supabase.from("books")
      .select("id, title, cover_image, author_id, published_at, is_featured, audiobook_status, trailer_url, book_genres!inner(genres!inner(slug))")
      .in("book_genres.genres.slug", genreSlugs)
    : supabase.from("books")
      .select("id, title, cover_image, author_id, published_at, is_featured, audiobook_status, trailer_url"))
    .eq("status", "PUBLISHED");

  // Language filter
  if (language === "en") {
    base = base.or("language.eq.en,language.is.null");
  } else {
    base = base.eq("language", language);
  }

  // Text search
  if (query) {
    base = base.ilike("title", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
  }

  // Format filter
  if (format === "audiobook") {
    base = base.eq("audiobook_status", "published");
  }
  // Published books are ebooks even when they also have an audiobook.

  // Sort
  if (sort === "popular") {
    base = base
      .order("is_featured", { ascending: false })
      .order("published_at", { ascending: false });
  } else if (sort === "title") {
    base = base.order("title", { ascending: true });
  } else {
    // newest (default)
    base = base.order("published_at", { ascending: false });
  }

  const { data, error } = await base.limit(limit);
  checkDiscoveryError("books lookup", error);
  return data ?? [];
}

async function enrichBooksWithAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  books: Array<{
    id: string;
    title: string;
    cover_image: string | null;
    author_id: string;
    audiobook_status?: string | null;
    trailer_url?: string | null;
  }>
) {
  if (books.length === 0) return [];

  const bookIds = books.map((b) => b.id);
  const authorIds = [...new Set(books.map((b) => b.author_id))];

  const [authorInfoMap, genreJunctionRes] = await Promise.all([
    // Author attribution must bypass RLS the same way /reader/authors does. A
    // direct anon `profiles` read returns nothing for RLS-private profiles,
    // which left every card showing "Unknown author". See
    // lib/authors/public-author.ts for the rationale.
    getPublicAuthorInfoMap(authorIds),
    // No row cap: the multiplicative `limit(bookIds.length * 3)` returned rows
    // in unspecified order, so books tagged with many genres could consume the
    // budget before others, leaving later books with no genre chip. The book set
    // is already bounded (<=24 via .in()), so fetch all their junction rows.
    supabase
      .from("book_genres")
      .select("book_id, genres(name_en, icon)")
      .in("book_id", bookIds),
  ]);

  const authorMap = new Map(
    authorIds.map((id) => {
      const info = authorInfoMap.get(id);
      return [
        id,
        info?.display_name?.trim() || info?.username?.trim() || "Unknown author",
      ];
    })
  );

  checkDiscoveryError("book genres lookup", genreJunctionRes.error);

  // Pick the first genre per book as the display genre
  const genreMap = new Map<string, string>();
  for (const row of genreJunctionRes.data ?? []) {
    if (!genreMap.has(row.book_id)) {
      const g = Array.isArray(row.genres) ? row.genres[0] : row.genres;
      if (g && typeof g === "object" && "name_en" in g && g.name_en) {
        const icon = "icon" in g && g.icon ? `${g.icon} ` : "";
        genreMap.set(row.book_id, `${icon}${g.name_en}`);
      }
    }
  }

  return books.map((book) => ({
    id: book.id,
    title: book.title,
    author: authorMap.get(book.author_id) ?? "Unknown author",
    genre: genreMap.get(book.id) ?? null,
    cover: book.cover_image,
    href: `/reader/books/${book.id}`,
    hasAudiobook: book.audiobook_status === "published",
    hasTrailer: Boolean(book.trailer_url),
  }));
}

async function fetchGenres(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data, error } = await supabase
    .from("genres")
    .select("id, slug, name_en, name_sv, icon, display_order")
    .order("display_order", { ascending: true });

  checkDiscoveryError("genres lookup", error);

  return (data ?? []).map((g) => ({
    id: g.id,
    slug: g.slug,
    label: g.name_en || g.name_sv,
    icon: g.icon,
  }));
}

async function fetchAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, username, avatar_url, bio")
    .eq("role", "author")
    .eq("is_public", true)
    .limit(6);

  checkDiscoveryError("authors lookup", error);

  const avatarBucket = supabase.storage.from("avatars");

  return (profiles ?? []).map((p) => {
    let avatar: string | null = null;
    const avatarPath = p.avatar_url;
    if (avatarPath && typeof avatarPath === "string" && avatarPath.trim()) {
      if (
        avatarPath.startsWith("http://") ||
        avatarPath.startsWith("https://")
      ) {
        avatar = avatarPath;
      } else if (AVATARS_BUCKET_PUBLIC) {
        avatar = avatarBucket.getPublicUrl(avatarPath).data.publicUrl;
      }
    }

    return {
      id: p.user_id,
      name: p.display_name || p.username || "Author",
      avatar,
      genre: p.bio ? "Public author" : "Storyteller",
      href: `/reader/authors/${p.user_id}`,
    };
  });
}

/* ── Page component ── */

export default async function ReaderDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // When the discovery flag is off (default during cohort-gated soft launch),
  // /reader/discover is not part of the user-facing entry surface.
  // Set NEXT_PUBLIC_DISCOVERY_ENABLED=true to expose it. See lib/flags.ts.
  if (!getDiscoveryEnabled()) {
    notFound();
  }

  const params = await searchParams;
  const language = normalizeLanguage(firstParam(params?.lang));
  const langLabel = getLanguageLabel(language);
  const query = (firstParam(params?.q) ?? "").trim();
  const genreSlugs = [...new Set([params?.genre ?? ""].flat()
    .flatMap((value) => value.split(","))
    .map((s) => s.trim())
    .filter(Boolean))];
  const format = parseFormat(firstParam(params?.format));
  const sort = parseSort(firstParam(params?.sort));

  const supabase = await createClient();

  const [rawBooks, genres, authors] = await Promise.all([
    fetchFilteredBooks(supabase, {
      language,
      query,
      genreSlugs,
      format,
      sort,
      limit: 24,
    }),
    fetchGenres(supabase),
    fetchAuthors(supabase),
  ]);

  const books = await enrichBooksWithAuthor(supabase, rawBooks);

  // Build language option hrefs that preserve current filters
  const languageOptions = LANGUAGE_OPTIONS.map((opt) => {
    const p = new URLSearchParams();
    if (opt.value !== "en") p.set("lang", opt.value);
    if (query) p.set("q", query);
    if (genreSlugs.length > 0) p.set("genre", genreSlugs.join(","));
    if (format !== "all") p.set("format", format);
    if (sort !== "newest") p.set("sort", sort);
    const qs = p.toString();
    return {
      value: opt.value,
      label: opt.label,
      href: `/reader/discover${qs ? `?${qs}` : ""}`,
      active: opt.value === language,
    };
  });

  return (
    <div>
      <ReaderDiscoverPageView
        languageLabel={langLabel}
        languageOptions={languageOptions}
        books={books}
        authors={authors}
        genres={genres}
        activeFilters={{
          query,
          language,
          genreSlugs,
          format,
          sort,
        }}
        resultCount={books.length}
      />
    </div>
  );
}
