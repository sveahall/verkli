import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AVATARS_BUCKET_PUBLIC } from "@/lib/supabase/config";
import { getDiscoveryEnabled, getRecommendationsEnabled } from "@/lib/flags";
import {
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  type SupportedLanguage,
} from "@/lib/languages";
import ReaderDiscoverPageView from "@/features/reader/reader-discover/ReaderDiscoverPageView";

type SearchParams = { lang?: string };

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

async function getFeaturedBooks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  language: SupportedLanguage
) {
  const now = new Date().toISOString();
  const base = supabase
    .from("books")
    .select("id, title, cover_image, author_id, published_at, featured_rank, featured_until")
    .eq("status", "PUBLISHED")
    .eq("is_featured", true)
    .order("featured_rank", { ascending: true, nullsFirst: false })
    .order("published_at", { ascending: false })
    .limit(12);
  const { data } =
    language === "en"
      ? await base.or("language.eq.en,language.is.null")
      : await base.eq("language", language);
  return (data ?? []).filter(
    (book) =>
      (book as { featured_until?: string | null }).featured_until == null ||
      (book as { featured_until?: string | null }).featured_until! > now
  );
}

async function getNewBooks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  language: SupportedLanguage,
  limit: number
) {
  const base = supabase
    .from("books")
    .select("id, title, cover_image, author_id, published_at")
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false })
    .limit(limit);
  const { data } =
    language === "en"
      ? await base.or("language.eq.en,language.is.null")
      : await base.eq("language", language);
  return data ?? [];
}

async function getCuratedListsWithItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  language: SupportedLanguage,
  itemsPerList: number
) {
  const { data: lists } = await supabase
    .from("curated_lists")
    .select("id, slug, title, description")
    .eq("language", language)
    .eq("is_active", true)
    .order("title");

  if (!lists?.length) return [];

  const listIds = lists.map((list) => list.id);
  const { data: allItems } = await supabase
    .from("curated_list_items")
    .select("list_id, book_id, rank")
    .in("list_id", listIds)
    .order("rank", { ascending: true });

  const itemsByList = new Map<string, Array<{ book_id: string; rank: number }>>();
  for (const item of allItems ?? []) {
    const existing = itemsByList.get(item.list_id) ?? [];
    if (existing.length < itemsPerList) {
      existing.push(item);
      itemsByList.set(item.list_id, existing);
    }
  }

  const allBookIds = [...new Set([...itemsByList.values()].flatMap((items) => items.map((item) => item.book_id)))];
  if (allBookIds.length === 0) {
    return lists.map((list) => ({
      id: list.id,
      slug: list.slug,
      title: list.title,
      description: list.description ?? null,
      items: [],
    }));
  }

  const { data: allBooks } = await supabase
    .from("books")
    .select("id, title, cover_image, author_id")
    .eq("status", "PUBLISHED")
    .in("id", allBookIds);

  const bookMap = new Map((allBooks ?? []).map((book) => [book.id, book]));
  const authorIds = [...new Set((allBooks ?? []).map((book) => book.author_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, username")
    .in("user_id", authorIds);

  const authorMap = new Map(
    (profiles ?? []).map((profile) => [profile.user_id, profile.display_name || profile.username || "Author"])
  );

  return lists.map((list) => {
    const listItems = itemsByList.get(list.id) ?? [];
    const items = listItems
      .map((item) => {
        const book = bookMap.get(item.book_id);
        if (!book) return null;
        return {
          id: book.id,
          title: book.title,
          author: authorMap.get(book.author_id) ?? "Author",
          cover: book.cover_image,
          href: `/reader/books/${book.id}`,
        };
      })
      .filter((book): book is NonNullable<typeof book> => book !== null);

    return {
      id: list.id,
      slug: list.slug,
      title: list.title,
      description: list.description ?? null,
      items,
    };
  });
}

async function enrichBooksWithAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  books: Array<{ id: string; title: string; cover_image: string | null; author_id: string }>
) {
  if (books.length === 0) return [];

  const authorIds = [...new Set(books.map((book) => book.author_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, username")
    .in("user_id", authorIds);

  const authorMap = new Map(
    (profiles ?? []).map((profile) => [profile.user_id, profile.display_name || profile.username || "Author"])
  );

  return books.map((book) => ({
    id: book.id,
    title: book.title,
    author: authorMap.get(book.author_id) ?? "Author",
    cover: book.cover_image,
    href: `/reader/books/${book.id}`,
  }));
}

function takeUniqueBooks<T extends { id: string }>(
  books: T[],
  seenIds: Set<string>,
  limit: number
): T[] {
  const unique: T[] = [];

  for (const book of books) {
    if (seenIds.has(book.id)) continue;
    seenIds.add(book.id);
    unique.push(book);
    if (unique.length >= limit) break;
  }

  return unique;
}

export default async function ReaderDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const language = normalizeLanguage(params?.lang);
  const langLabel = getLanguageLabel(language);

  const supabase = await createClient();
  const discoveryEnabled = getDiscoveryEnabled();
  const recommendationsEnabled = getRecommendationsEnabled();

  const [featuredRaw, newBooksRaw, curatedLists, profiles, genresResult] = await Promise.all([
    discoveryEnabled ? getFeaturedBooks(supabase, language) : Promise.resolve([]),
    discoveryEnabled ? getNewBooks(supabase, language, 16) : Promise.resolve([]),
    discoveryEnabled ? getCuratedListsWithItems(supabase, language, 6) : Promise.resolve([]),
    supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url, bio")
      .eq("role", "author")
      .eq("is_public", true)
      .limit(12)
      .then((result) => result.data ?? []),
    recommendationsEnabled
      ? supabase
          .from("genres")
          .select("id, slug, name_sv, name_en, icon, display_order")
          .order("display_order", { ascending: true })
          .then((result) => result.data ?? [])
      : Promise.resolve(
          [] as Array<{
            id: string;
            slug: string;
            name_sv: string;
            name_en: string | null;
            icon: string | null;
            display_order: number;
          }>
        ),
  ]);

  const [featuredBooks, newBooks] = await Promise.all([
    enrichBooksWithAuthor(supabase, featuredRaw),
    enrichBooksWithAuthor(supabase, newBooksRaw),
  ]);

  const avatarBucket = supabase.storage.from("avatars");
  const authorsWithAvatars = profiles.map((profile) => {
    let avatar: string | null = null;
    const avatarPath = profile.avatar_url;
    if (avatarPath && typeof avatarPath === "string" && avatarPath.trim()) {
      if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://")) {
        avatar = avatarPath;
      } else if (AVATARS_BUCKET_PUBLIC) {
        avatar = avatarBucket.getPublicUrl(avatarPath).data.publicUrl;
      }
    }

    return {
      id: profile.user_id,
      name: profile.display_name || profile.username || "Author",
      avatar,
      genre: profile.bio ? "Public author" : "Storyteller",
      href: `/reader/authors/${profile.user_id}`,
    };
  });

  const popularBooks = (
    curatedLists.flatMap((list) => list.items).length > 0
      ? curatedLists.flatMap((list) => list.items)
      : featuredBooks.length > 0
        ? featuredBooks
        : newBooks
  )
    .filter((book, index, self) => self.findIndex((candidate) => candidate.id === book.id) === index)
    .slice(0, 8);

  const heroBook = featuredBooks[0] ?? newBooks[0] ?? popularBooks[0] ?? null;
  const consumedBookIds = new Set(heroBook ? [heroBook.id] : []);
  const trendingBooks = takeUniqueBooks(featuredBooks, consumedBookIds, 6);
  const popularShelfBooks = takeUniqueBooks(popularBooks, consumedBookIds, 6);
  const latestBooks = takeUniqueBooks(newBooks, consumedBookIds, 6);

  return (
    <div>
      <ReaderDiscoverPageView
        languageLabel={langLabel}
        languageOptions={LANGUAGE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          href: option.value === "en" ? "/reader/discover" : `/reader/discover?lang=${option.value}`,
          active: option.value === language,
        }))}
        heroBook={heroBook}
        trendingBooks={trendingBooks.map((book) => ({ ...book, tag: "Trending" }))}
        newBooks={latestBooks.map((book) => ({ ...book, tag: "New" }))}
        popularBooks={popularShelfBooks.map((book, index) => ({ ...book, tag: `#${index + 1}` }))}
        curatedLists={curatedLists}
        authors={authorsWithAvatars.slice(0, 6)}
        genres={genresResult.map((genre) => ({
          id: genre.id,
          slug: genre.slug,
          label: genre.name_en || genre.name_sv,
          icon: genre.icon,
        }))}
      />
    </div>
  );
}
