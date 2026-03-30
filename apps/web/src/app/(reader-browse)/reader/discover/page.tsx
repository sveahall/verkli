import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AVATARS_BUCKET_PUBLIC } from "@/lib/supabase/config";
import {
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  type SupportedLanguage,
} from "@/lib/languages";
import ReaderDiscoverPageView from "@/features/reader/reader-discover/ReaderDiscoverPageView";

/* ── Search param types ── */

type SearchParams = {
  lang?: string;
  q?: string;
  genre?: string;
  format?: string;
  sort?: string;
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
    genreSlug: string;
    format: Format;
    sort: Sort;
    limit: number;
  }
) {
  const { language, query, genreSlug, format, sort, limit } = opts;

  // If filtering by genre, first get matching book IDs
  let genreBookIds: string[] | null = null;
  if (genreSlug) {
    const { data: genreRows } = await supabase
      .from("genres")
      .select("id")
      .eq("slug", genreSlug)
      .limit(1);

    if (genreRows && genreRows.length > 0) {
      const genreId = genreRows[0].id;
      const { data: junctionRows } = await supabase
        .from("book_genres")
        .select("book_id")
        .eq("genre_id", genreId)
        .limit(200);

      genreBookIds = (junctionRows ?? []).map((r) => r.book_id);
      if (genreBookIds.length === 0) {
        // No books in this genre — return empty
        return [];
      }
    } else {
      // Invalid genre slug — return empty
      return [];
    }
  }

  // Build the main query
  let base = supabase
    .from("books")
    .select(
      "id, title, cover_image, author_id, published_at, is_featured, audiobook_status"
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

  // Genre filter (restrict to genre book IDs)
  if (genreBookIds) {
    base = base.in("id", genreBookIds);
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
  }>
) {
  if (books.length === 0) return [];

  const authorIds = [...new Set(books.map((b) => b.author_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, username")
    .in("user_id", authorIds);

  const authorMap = new Map(
    (profiles ?? []).map((p) => [
      p.user_id,
      p.display_name || p.username || "Author",
    ])
  );

  return books.map((book) => ({
    id: book.id,
    title: book.title,
    author: authorMap.get(book.author_id) ?? "Author",
    cover: book.cover_image,
    href: `/reader/books/${book.id}`,
    hasAudiobook: book.audiobook_status === "published",
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
  const params = await searchParams;
  const language = normalizeLanguage(params?.lang);
  const langLabel = getLanguageLabel(language);
  const query = (params?.q ?? "").trim();
  const genreSlug = (params?.genre ?? "").trim();
  const format = parseFormat(params?.format);
  const sort = parseSort(params?.sort);

  const supabase = await createClient();

  const [rawBooks, genres, authors] = await Promise.all([
    fetchFilteredBooks(supabase, {
      language,
      query,
      genreSlug,
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
    if (genreSlug) p.set("genre", genreSlug);
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

  const activeGenre = genres.find((g) => g.slug === genreSlug) ?? null;

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
          genreSlug,
          genreLabel: activeGenre?.label ?? null,
          format,
          sort,
        }}
        resultCount={books.length}
      />
    </div>
  );
}
