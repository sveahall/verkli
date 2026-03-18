import Link from "next/link";
import BookCard from "@/components/reader/BookCard";
import AuthorCard from "@/components/reader/AuthorCard";
import {
  ReaderContextCard,
  ReaderEmptyBlock,
  ReaderHeroPanel,
  ReaderSectionHeader,
} from "@/features/reader/shared/ReaderScaffold";

type DiscoverBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  href: string;
  tag?: string;
};

type DiscoverAuthor = {
  id: string;
  name: string;
  avatar: string | null;
  genre?: string;
  href: string;
};

type DiscoverList = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  items: DiscoverBook[];
};

type GenreFilter = {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
};

type LanguageOption = {
  value: string;
  label: string;
  href: string;
  active: boolean;
};

type ReaderDiscoverPageViewProps = {
  languageLabel: string;
  languageOptions: LanguageOption[];
  heroBook: DiscoverBook | null;
  trendingBooks: DiscoverBook[];
  newBooks: DiscoverBook[];
  popularBooks: DiscoverBook[];
  curatedLists: DiscoverList[];
  authors: DiscoverAuthor[];
  genres: GenreFilter[];
};

export default function ReaderDiscoverPageView({
  languageLabel,
  languageOptions,
  heroBook,
  trendingBooks,
  newBooks,
  popularBooks,
  curatedLists,
  authors,
  genres,
}: ReaderDiscoverPageViewProps) {
  const hasContent =
    trendingBooks.length > 0 ||
    newBooks.length > 0 ||
    popularBooks.length > 0 ||
    curatedLists.length > 0 ||
    authors.length > 0;

  return (
    <div className="section-gap">
      <ReaderHeroPanel
        eyebrow={`Discover in ${languageLabel}`}
        title={heroBook?.title ?? "Find the next story worth staying up for"}
        description={
          heroBook
            ? `${heroBook.author}. Explore what is trending, what is fresh, and which authors are gathering readers this week.`
            : "Browse with the same calm, premium interaction patterns as the author app, but tuned for reading-first discovery."
        }
        cover={heroBook?.cover ?? null}
        coverAlt={heroBook?.title ?? "Discover"}
        actions={
          <>
            <Link href={heroBook?.href ?? "/reader/discover"} className="btn-primary">
              {heroBook ? "Open spotlight" : "Browse catalog"}
            </Link>
            <Link href="/reader/library" className="btn-secondary">
              Open library
            </Link>
          </>
        }
      >
        <div className="rounded-2xl border border-black/[0.06] bg-white/82 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04] sm:col-span-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
            Language
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {languageOptions.map((option) => (
              <Link
                key={option.value}
                href={option.href}
                className={
                  option.active
                    ? "rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white dark:bg-white dark:text-slate-900"
                    : "rounded-full border border-black/[0.08] bg-white/80 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-black/[0.12] hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:text-white"
                }
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      </ReaderHeroPanel>

      {!hasContent ? (
        <ReaderEmptyBlock
          title="No discovery surfaces yet"
          description="There are no published books in this language right now. Check back soon as the catalog fills out."
          actionHref="/reader/home"
          actionLabel="Back to home"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-10">
            {trendingBooks.length > 0 ? (
              <section className="space-y-4">
                <ReaderSectionHeader
                  eyebrow="Trending now"
                  title="What readers are opening"
                  description="A discovery shelf built for intent, not analytics."
                />
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
                  {trendingBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      cover={book.cover}
                      href={book.href}
                      tag={book.tag}
                      layout="grid"
                      size="lg"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {popularBooks.length > 0 ? (
              <section className="space-y-4">
                <ReaderSectionHeader
                  eyebrow="Popular this week"
                  title="Momentum picks"
                  description="Books currently picking up the strongest signals from active readers."
                />
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
                  {popularBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      cover={book.cover}
                      href={book.href}
                      tag={book.tag}
                      layout="grid"
                      size="lg"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {newBooks.length > 0 ? (
              <section className="space-y-4">
                <ReaderSectionHeader
                  eyebrow="New releases"
                  title="Fresh to the catalog"
                  description="Recently published books, ready to open immediately."
                />
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
                  {newBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      cover={book.cover}
                      href={book.href}
                      tag={book.tag}
                      layout="grid"
                      size="lg"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {curatedLists.map((list) => (
              <section key={list.id} className="space-y-4">
                <ReaderSectionHeader
                  eyebrow="Curated list"
                  title={list.title}
                  description={list.description ?? "Hand-picked books grouped for a more guided discovery flow."}
                  actionHref={`/reader/lists/${list.slug}`}
                  actionLabel="Open list"
                />
                <div className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-2">
                  {list.items.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      cover={book.cover}
                      href={book.href}
                      size="lg"
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <ReaderContextCard
              title="Genres"
              description="Fast pivots into mood, theme, and format."
            >
              <div className="flex flex-wrap gap-2">
                {genres.length === 0 ? (
                  <p className="text-body">Genre filters appear here as the catalog grows.</p>
                ) : (
                  genres.map((genre) => (
                    <Link
                      key={genre.id}
                      href={`/reader/genres?genre=${genre.slug}`}
                      className="rounded-full border border-black/[0.08] bg-white/80 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:border-black/[0.12] hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:text-white"
                    >
                      {genre.icon ? `${genre.icon} ` : ""}
                      {genre.label}
                    </Link>
                  ))
                )}
              </div>
            </ReaderContextCard>

            <ReaderContextCard
              title="Recommended authors"
              description="Public author profiles with books already live for readers."
            >
              {authors.length === 0 ? (
                <p className="text-body">Author recommendations will appear here soon.</p>
              ) : (
                authors.map((author) => (
                  <AuthorCard
                    key={author.id}
                    name={author.name}
                    avatar={author.avatar}
                    genre={author.genre}
                    href={author.href}
                  />
                ))
              )}
            </ReaderContextCard>
          </aside>
        </div>
      )}
    </div>
  );
}
