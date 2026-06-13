import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AVATARS_BUCKET_PUBLIC } from "@/lib/supabase/config";
import { getDiscoveryEnabled } from "@/lib/flags";
import {
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  type SupportedLanguage,
} from "@/lib/languages";
import ReaderDiscoverPageView from "@/features/reader/reader-discover/ReaderDiscoverPageView";
import { getAuthorProStatusSet, getProAuthorIds } from "@/lib/billing/pro-status";

/* ── Search param types ── */

type SearchParams = {
  lang?: string;
  q?: string;
  genre?: string; // comma-separated slugs, e.g. "fiction,romance"
  format?: string;
  sort?: string;
  pro?: string; // "1" → restrict to books by PRO authors
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

/* ── Data fetching ── */

async function fetchFilteredBooks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    language: SupportedLanguage;
    query: string;
    genreSlugs: string[];
    format: Format;
    sort: Sort;
    proOnly: boolean;
    limit: number;
  }
) {
  const { language, query, genreSlugs, format, sort, proOnly, limit } = opts;

  // "PRO authors only" filter: restrict to books whose author holds an active
  // PRO subscription. Empty set → no results (return early so we don't run an
  // unfiltered query).
  let proAuthorIds: string[] | null = null;
  if (proOnly) {
    proAuthorIds = await getProAuthorIds();
    if (proAuthorIds.length === 0) return [];
  }

  // If filtering by genres, get all matching book IDs (union across selected genres)
  let genreBookIds: string[] | null = null;
  if (genreSlugs.length > 0) {
    const { data: genreRows } = await supabase
      .from("genres")
      .select("id")
      .in("slug", genreSlugs);

    if (genreRows && genreRows.length > 0) {
      const genreIds = genreRows.map((r) => r.id);
      const { data: junctionRows } = await supabase
        .from("book_genres")
        .select("book_id")
        .in("genre_id", genreIds)
        .limit(500);

      // Deduplicate — a book tagged with multiple selected genres appears once
      genreBookIds = [...new Set((junctionRows ?? []).map((r) => r.book_id))];
      if (genreBookIds.length === 0) {
        return [];
      }
    } else {
      // None of the requested slugs exist — return empty
      return [];
    }
  }

  // Build the main query
  let base = supabase
    .from("books")
    .select(
      "id, title, cover_image, author_id, published_at, is_featured, audiobook_status, trailer_url"
    )
    .eq("status", "PUBLISHED");

  // Language filter
  if (language === "en") {
    base = base.or("language.eq.en,language.is.null");
  } else {
    base = base.eq("language", language);
  }

  // Text search
  if (query) {
    base = base.ilike("title", `%${query}%`);
  }

  // Genre filter (restrict to matched book IDs)
  if (genreBookIds) {
    base = base.in("id", genreBookIds);
  }

  // PRO-authors-only filter (restrict to books by PRO authors)
  if (proAuthorIds) {
    base = base.in("author_id", proAuthorIds);
  }

  // Format filter
  if (format === "audiobook") {
    base = base.eq("audiobook_status", "published");
  } else if (format === "ebook") {
    base = base.or(
      "audiobook_status.is.null,audiobook_status.eq.not_started"
    );
  }

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

  const { data } = await base.limit(limit);
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

  const [profilesRes, genreJunctionRes, proSet] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", authorIds),
    supabase
      .from("book_genres")
      .select("book_id, genres(name_en, icon)")
      .in("book_id", bookIds)
      .limit(bookIds.length * 3), // at most 3 genres per book
    getAuthorProStatusSet(authorIds),
  ]);

  const authorMap = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.user_id,
      p.display_name || p.username || "Unknown author",
    ])
  );

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
    authorIsPro: proSet.has(book.author_id),
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
  const { data } = await supabase
    .from("genres")
    .select("id, slug, name_en, name_sv, icon, display_order")
    .order("display_order", { ascending: true });

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
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, username, avatar_url, bio")
    .eq("role", "author")
    .eq("is_public", true)
    .limit(6);

  const avatarBucket = supabase.storage.from("avatars");
  const proSet = await getAuthorProStatusSet((profiles ?? []).map((p) => p.user_id));

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
      isPro: proSet.has(p.user_id),
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
  const language = normalizeLanguage(params?.lang);
  const langLabel = getLanguageLabel(language);
  const query = (params?.q ?? "").trim();
  const genreSlugs = (params?.genre ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const format = parseFormat(params?.format);
  const sort = parseSort(params?.sort);
  const proOnly = params?.pro === "1" || params?.pro === "true";

  const supabase = await createClient();

  const [rawBooks, genres, authors] = await Promise.all([
    fetchFilteredBooks(supabase, {
      language,
      query,
      genreSlugs,
      format,
      sort,
      proOnly,
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
    if (proOnly) p.set("pro", "1");
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
          pro: proOnly,
        }}
        resultCount={books.length}
      />
    </div>
  );
}
