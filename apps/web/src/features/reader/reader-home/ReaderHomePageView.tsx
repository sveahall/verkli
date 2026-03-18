import Link from "next/link";
import BookCard from "@/components/reader/BookCard";
import AuthorCard from "@/components/reader/AuthorCard";
import {
  ReaderContextCard,
  ReaderContinueCard,
  ReaderEmptyBlock,
  ReaderHeroPanel,
  ReaderSectionHeader,
} from "@/features/reader/shared/ReaderScaffold";

type ContinueReadingBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  progress: number;
  href: string;
  chapterLabel?: string | null;
  lastOpenedLabel?: string | null;
};

type ShelfBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  href: string;
  tag?: string;
  length?: string;
};

type AuthorHighlight = {
  id: string;
  name: string;
  avatar: string | null;
  genre: string;
  meta: string;
};

type Spotlight = {
  title: string;
  author: string;
  cover: string | null;
  href: string;
  badge: string;
  caption: string;
  progress?: number;
};

type ReaderHomePageViewProps = {
  greeting: string;
  spotlight: Spotlight | null;
  continueReading: ContinueReadingBook[];
  recommendedBooks: ShelfBook[];
  trendingBooks: ShelfBook[];
  latestReleases: ShelfBook[];
  authorHighlights: AuthorHighlight[];
};

export default function ReaderHomePageView({
  greeting,
  spotlight,
  continueReading,
  recommendedBooks,
  trendingBooks,
  latestReleases,
  authorHighlights,
}: ReaderHomePageViewProps) {
  const heroDescription = spotlight
    ? `${spotlight.author}. ${spotlight.caption}`
    : "Continue where you left off, discover a new voice, or rebuild your weekend reading stack.";

  return (
    <div className="section-gap">
      <ReaderHeroPanel
        eyebrow={spotlight?.badge ?? "Home"}
        title={spotlight?.title ?? greeting}
        description={heroDescription}
        cover={spotlight?.cover ?? null}
        coverAlt={spotlight?.title ?? greeting}
        actions={
          <>
            <Link href={spotlight?.href ?? "/reader/discover"} className="btn-primary">
              {spotlight?.progress != null ? "Resume reading" : "Open book"}
            </Link>
            <Link href="/reader/discover" className="btn-secondary">
              Discover books
            </Link>
            <Link href="/reader/library" className="btn-ghost">
              Open library
            </Link>
          </>
        }
      >
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
            Reading focus
          </p>
          <p className="mt-2 text-[14px] text-slate-600 dark:text-white/65">
            Discovery, progress, and a calm place to get back into the story.
          </p>
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
            Library state
          </p>
          <p className="mt-2 text-[14px] text-slate-600 dark:text-white/65">
            {continueReading.length > 0
              ? `${continueReading.length} books currently in motion.`
              : "No active books yet. Start with discovery and your next read will appear here."}
          </p>
        </div>
      </ReaderHeroPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-10">
          <section className="space-y-4">
            <ReaderSectionHeader
              eyebrow="Continue reading"
              title="Pick up the exact thread"
              description="Your active books stay in order, with progress and last-opened context."
              actionHref="/reader/library"
              actionLabel="View library"
            />

            {continueReading.length === 0 ? (
              <ReaderEmptyBlock
                title="No active reads yet"
                description="Open a book from discovery and it will appear here with chapter progress and quick resume."
                actionHref="/reader/discover"
                actionLabel="Browse discovery"
              />
            ) : (
              <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
                {continueReading.map((book) => (
                  <ReaderContinueCard
                    key={book.id}
                    title={book.title}
                    author={book.author}
                    href={book.href}
                    cover={book.cover}
                    progress={book.progress}
                    chapterLabel={book.chapterLabel}
                    lastOpenedLabel={book.lastOpenedLabel}
                  />
                ))}
              </div>
            )}
          </section>

          {recommendedBooks.length > 0 ? (
            <section className="space-y-4">
              <ReaderSectionHeader
                eyebrow="Recommended"
                title="Recommended for you"
                description="Picked from your current reading patterns and the books already pulling you in."
              />
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
                {recommendedBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    cover={book.cover}
                    href={book.href}
                    tag={book.tag}
                    length={book.length}
                    layout="grid"
                    size="lg"
                  />
                ))}
              </div>
            </section>
          ) : null}

          {trendingBooks.length > 0 ? (
            <section className="space-y-4">
              <ReaderSectionHeader
                eyebrow="Trending"
                title="Books readers are leaning into"
                description="Popular right now without turning your home screen into a chart dashboard."
              />
              <div className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-2">
                {trendingBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    cover={book.cover}
                    href={book.href}
                    tag={book.tag}
                    length={book.length}
                    size="lg"
                  />
                ))}
              </div>
            </section>
          ) : null}

          {latestReleases.length > 0 ? (
            <section className="space-y-4">
              <ReaderSectionHeader
                eyebrow="Latest releases"
                title="Freshly published"
                description="New stories that are ready to read right now."
              />
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
                {latestReleases.map((book) => (
                  <BookCard
                    key={book.id}
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    cover={book.cover}
                    href={book.href}
                    tag={book.tag}
                    length={book.length}
                    layout="grid"
                    size="lg"
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <ReaderContextCard
            title="Your reading stack"
            description="Keep the reader experience minimal: discovery, current books, and authors worth following."
          >
            <Link href="/reader/discover" className="btn-secondary w-full justify-between">
              Find your next read
            </Link>
            <Link href="/reader/library" className="btn-secondary w-full justify-between">
              Revisit your library
            </Link>
          </ReaderContextCard>

          <ReaderContextCard
            title="Author highlights"
            description="Voices gaining momentum across the platform."
          >
            {authorHighlights.length === 0 ? (
              <p className="text-body">Author spotlights will appear here as the catalog grows.</p>
            ) : (
              authorHighlights.map((author) => (
                <AuthorCard
                  key={author.id}
                  name={author.name}
                  avatar={author.avatar}
                  genre={author.genre}
                  meta={author.meta}
                  href={`/reader/authors/${author.id}`}
                />
              ))
            )}
          </ReaderContextCard>
        </aside>
      </div>
    </div>
  );
}
