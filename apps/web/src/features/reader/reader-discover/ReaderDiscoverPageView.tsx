import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import BookCard from "@/components/reader/BookCard";
import AuthorCard from "@/components/reader/AuthorCard";

/* ── Types ── */

type DiscoverBook = {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  href: string;
  hasAudiobook?: boolean;
};

type DiscoverAuthor = {
  id: string;
  name: string;
  avatar: string | null;
  genre?: string;
  href: string;
};

type GenreOption = {
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

type ActiveFilters = {
  query: string;
  language: string;
  genreSlug: string;
  genreLabel: string | null;
  format: string;
  sort: string;
};

type Props = {
  languageLabel: string;
  languageOptions: LanguageOption[];
  books: DiscoverBook[];
  authors: DiscoverAuthor[];
  genres: GenreOption[];
  activeFilters: ActiveFilters;
  resultCount: number;
};

/* ── Helpers ── */

/** Returns href that clears all filters except language. */
function buildClearAllHref(language: string): string {
  if (language === "en") return "/reader/discover";
  return `/reader/discover?lang=${language}`;
}

const SELECT_CLASS =
  "h-10 w-full appearance-none rounded-xl border border-black/[0.06] bg-white px-4 text-sm text-[#0F172A] focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white";

/* ── Main view ── */

export default function ReaderDiscoverPageView({
  languageLabel,
  languageOptions,
  books,
  authors,
  genres,
  activeFilters,
  resultCount,
}: Props) {
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#907AFF]">
          Discover
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
          Find your next read
        </h1>
        <p className="mt-1 text-sm text-[#64748B] dark:text-white/50">
          Search, filter, and browse books in {languageLabel}.
        </p>
      </header>

      {/* ── Filter panel ── */}
      <form
        method="get"
        action="/reader/discover"
        className="card-base p-6 space-y-4"
      >
        <h2 className="text-xl font-semibold text-[#0F172A] dark:text-white">
          Filter
        </h2>

        {/* Filter grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Language */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-lang"
              className="text-xs font-medium text-[#64748B] dark:text-white/50"
            >
              Language
            </label>
            <select
              id="filter-lang"
              name="lang"
              defaultValue={activeFilters.language}
              className={SELECT_CLASS}
            >
              {languageOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Genre */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-genre"
              className="text-xs font-medium text-[#64748B] dark:text-white/50"
            >
              Genre
            </label>
            <select
              id="filter-genre"
              name="genre"
              defaultValue={activeFilters.genreSlug}
              className={SELECT_CLASS}
            >
              <option value="">All genres</option>
              {genres.map((g) => (
                <option key={g.id} value={g.slug}>
                  {g.icon ? `${g.icon} ` : ""}{g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-format"
              className="text-xs font-medium text-[#64748B] dark:text-white/50"
            >
              Format
            </label>
            <select
              id="filter-format"
              name="format"
              defaultValue={activeFilters.format}
              className={SELECT_CLASS}
            >
              <option value="all">All formats</option>
              <option value="ebook">E-book</option>
              <option value="audiobook">Audiobook</option>
            </select>
          </div>

          {/* Sort */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-sort"
              className="text-xs font-medium text-[#64748B] dark:text-white/50"
            >
              Sort by
            </label>
            <select
              id="filter-sort"
              name="sort"
              defaultValue={activeFilters.sort}
              className={SELECT_CLASS}
            >
              <option value="newest">Newest</option>
              <option value="popular">Popular</option>
              <option value="title">A &ndash; Z</option>
            </select>
          </div>
        </div>

        {/* Search input */}
        <div className="space-y-1.5">
          <label
            htmlFor="filter-q"
            className="text-xs font-medium text-[#64748B] dark:text-white/50"
          >
            Search by title
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-white/40" />
            <input
              id="filter-q"
              type="text"
              name="q"
              defaultValue={activeFilters.query}
              placeholder="Search by title..."
              className="h-10 w-full rounded-xl border border-black/[0.06] bg-white pl-9 pr-4 text-sm text-[#0F172A] placeholder:text-[#64748B]/60 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/30"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="btn-primary h-10 rounded-xl px-6 text-sm"
          >
            Search
          </button>
          <Link
            href={buildClearAllHref(activeFilters.language)}
            className="text-sm font-medium text-[#64748B] hover:text-[#0F172A] dark:text-white/50 dark:hover:text-white"
          >
            Clear all filters
          </Link>
        </div>
      </form>

      {/* ── Result count ── */}
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-[#64748B] dark:text-white/50">
          {resultCount === 0
            ? "No books found"
            : resultCount === 1
              ? "1 book found"
              : `${resultCount} books found`}
        </p>
      </div>

      {/* ── Results grid ── */}
      {books.length > 0 ? (
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                cover={book.cover}
                href={book.href}
                tag={book.hasAudiobook ? "Audio" : undefined}
                layout="grid"
              />
            ))}
          </div>
        </section>
      ) : (
        /* ── Empty state ── */
        <section className="card-base p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#907AFF]/10">
            <BookOpen className="h-6 w-6 text-[#907AFF]" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[#0F172A] dark:text-white">
            No books match your filters
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#64748B] dark:text-white/50">
            Try adjusting your search or removing some filters to see more
            results.
          </p>
          <Link
            href={buildClearAllHref(activeFilters.language)}
            className="btn-primary mt-6 inline-flex items-center gap-2 text-sm"
          >
            Clear all filters
          </Link>
        </section>
      )}

      {/* ── Authors ── */}
      {authors.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h3 className="text-xl font-semibold text-[#0F172A] dark:text-white">
              Writers publishing now
            </h3>
            <Link
              href="/reader/authors"
              className="text-sm font-medium text-[#907AFF] transition-colors hover:text-[#7058DD]"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {authors.map((a) => (
              <AuthorCard
                key={a.id}
                name={a.name}
                avatar={a.avatar}
                genre={a.genre}
                href={a.href}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
