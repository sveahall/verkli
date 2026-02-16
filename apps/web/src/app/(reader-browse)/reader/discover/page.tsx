import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import { getDiscoveryEnabled, getRecommendationsEnabled } from "@/lib/flags";
import { getLanguageLabel, LANGUAGE_OPTIONS, normalizeLanguage, type SupportedLanguage } from "@/lib/languages";
import AuthorCard from "@/components/reader/AuthorCard";
import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";

type SearchParams = { lang?: string };

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
  const filtered = (data ?? []).filter(
    (b) =>
      (b as { featured_until?: string | null }).featured_until == null ||
      (b as { featured_until?: string | null }).featured_until! > now
  );
  return filtered;
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

  const result: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    items: Array<{ id: string; title: string; author: string; cover: string | null }>;
  }> = [];

  for (const list of lists) {
    const { data: items } = await supabase
      .from("curated_list_items")
      .select("book_id, rank")
      .eq("list_id", list.id)
      .order("rank", { ascending: true })
      .limit(itemsPerList);

    if (!items?.length) {
      result.push({ id: list.id, slug: list.slug, title: list.title, description: list.description ?? null, items: [] });
      continue;
    }

    const bookIds = items.map((i) => i.book_id);
    const { data: books } = await supabase
      .from("books")
      .select("id, title, cover_image, author_id")
      .eq("status", "PUBLISHED")
      .in("id", bookIds);

    const bookMap = new Map((books ?? []).map((b) => [b.id, b]));
    const orderedBooks = items
      .map((i) => bookMap.get(i.book_id))
      .filter(Boolean) as Array<{ id: string; title: string; cover_image: string | null; author_id: string }>;

    const withAuthors = await Promise.all(
      orderedBooks.map(async (book) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username")
          .eq("user_id", book.author_id)
          .maybeSingle();
        return {
          id: book.id,
          title: book.title,
          author: profile?.display_name || profile?.username || "Author",
          cover: book.cover_image,
        };
      })
    );

    result.push({
      id: list.id,
      slug: list.slug,
      title: list.title,
      description: list.description ?? null,
      items: withAuthors,
    });
  }

  return result;
}

async function enrichBooksWithAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  books: Array<{ id: string; title: string; cover_image: string | null; author_id: string }>
) {
  return Promise.all(
    books.map(async (book) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("user_id", book.author_id)
        .maybeSingle();
      return {
        id: book.id,
        title: book.title,
        author: profile?.display_name || profile?.username || "Author",
        cover: book.cover_image,
      };
    })
  );
}

export default async function ReaderDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const langParam = params?.lang;
  const language = normalizeLanguage(langParam);

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
      .then((r) => r.data ?? []),
    recommendationsEnabled
      ? supabase
          .from("genres")
          .select("id, slug, name_sv, name_en, icon, display_order")
          .order("display_order", { ascending: true })
          .then((r) => r.data ?? [])
      : Promise.resolve([] as Array<{ id: string; slug: string; name_sv: string; name_en: string | null; icon: string | null; display_order: number }>),
  ]);

  const [featuredBooks, newBooks] = await Promise.all([
    enrichBooksWithAuthor(supabase, featuredRaw),
    enrichBooksWithAuthor(supabase, newBooksRaw),
  ]);

  const authorsWithAvatars = await Promise.all(
    profiles.map(async (p) => ({
      id: p.user_id,
      name: p.display_name || p.username || "author",
      genre: "Storyteller",
      avatar: await getAvatarUrlFromPathServer(p.avatar_url),
      href: `/reader/authors/${p.user_id}`,
    }))
  );

  const langLabel = getLanguageLabel(language);

  return (
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Discover"
        title="Find your next read"
        subtitle={discoveryEnabled ? "Browse by language, featured picks, and curated lists. No signup required." : "Browse authors. No signup required."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-white/50">Language</span>
            <div className="flex flex-wrap gap-1">
              {LANGUAGE_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={opt.value === "en" ? "/reader/discover" : `/reader/discover?lang=${opt.value}`}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    opt.value === language
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20"
                  }`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>
        }
      />

      {discoveryEnabled && featuredBooks.length > 0 && (
        <Rail
          title={`Featured in ${langLabel}`}
          subtitle="Editor’s picks"
          isEmpty={false}
        >
          {featuredBooks.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              cover={book.cover}
            />
          ))}
        </Rail>
      )}

      {discoveryEnabled && (
      <Rail
        title={`New in ${langLabel}`}
        subtitle="Latest releases"
        isEmpty={newBooks.length === 0}
        emptyState={
          <p className="text-[14px] text-slate-500 dark:text-white/50">
            No new books in this language yet.
          </p>
        }
      >
        {newBooks.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover={book.cover}
          />
        ))}
      </Rail>
      )}

      {discoveryEnabled && curatedLists.length > 0 && (
        <section className="space-y-8">
          <h2 className="text-section-title">Curated lists</h2>
          {curatedLists.map((list) => (
            <div key={list.id} className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <Link
                    href={`/reader/lists/${list.slug}`}
                    className="text-lg font-semibold text-slate-900 hover:text-[#7058DD] dark:text-white dark:hover:text-[#B8A8FF]"
                  >
                    {list.title}
                  </Link>
                  {list.description && (
                    <p className="mt-1 text-sm text-slate-500 dark:text-white/60">{list.description}</p>
                  )}
                </div>
                <Link
                  href={`/reader/lists/${list.slug}`}
                  className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  View all →
                </Link>
              </div>
              <div className="flex gap-5 overflow-x-auto pb-2 pr-2 -mx-1">
                {list.items.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-white/50">No books in this list.</p>
                ) : (
                  list.items.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      cover={book.cover}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {genresResult.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-section-title">Explore genres</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {genresResult.map((genre) => (
              <Link
                key={genre.id}
                href={`/reader/genres?genre=${genre.slug}`}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#907AFF]/40 hover:bg-[#907AFF]/5 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-[#B8A8FF]/40 dark:hover:bg-[#907AFF]/10"
              >
                {genre.icon && <span>{genre.icon}</span>}
                <span className="truncate">{genre.name_en || genre.name_sv}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {authorsWithAvatars.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-section-title">Public authors</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {authorsWithAvatars.map((author) => (
              <AuthorCard
                key={author.id}
                name={author.name}
                genre={author.genre}
                avatar={author.avatar}
                href={author.href}
              />
            ))}
          </div>
        </section>
      )}

      {featuredBooks.length === 0 && newBooks.length === 0 && curatedLists.length === 0 && authorsWithAvatars.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 px-8 py-16 text-center dark:border-white/10 dark:bg-white/5">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No books yet</h3>
          <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-white/60">
            There are no published books available right now. Check back soon as authors publish new stories.
          </p>
        </div>
      )}
    </div>
  );
}
