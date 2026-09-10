import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import BookCard from "@/components/reader/BookCard";

/* ── Types ── */

type DiscoverBook = {
  id: string;
  title: string;
  author: string;
  genre?: string | null;
  cover: string | null;
  href: string;
  hasAudiobook?: boolean;
  hasTrailer?: boolean;
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
  genreSlugs: string[];
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

function buildFilterHref(
  filters: ActiveFilters,
  overrides: Partial<Omit<ActiveFilters, "genreSlugs">> & { genreSlugs?: string[] }
): string {
  const f = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (f.language && f.language !== "en") params.set("lang", f.language);
  if (f.genreSlugs.length > 0) params.set("genre", f.genreSlugs.join(","));
  if (f.format && f.format !== "all") params.set("format", f.format);
  if (f.sort && f.sort !== "newest") params.set("sort", f.sort);
  if (f.query) params.set("q", f.query);
  const str = params.toString();
  return `/reader/discover${str ? `?${str}` : ""}`;
}

function toggleGenre(current: string[], slug: string): string[] {
  return current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
}

function buildClearAllHref(language: string): string {
  if (language === "en") return "/reader/discover";
  return `/reader/discover?lang=${language}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/* ── Language select (form-submitted) ── */

function LanguageSelect({
  defaultValue,
  options,
}: {
  defaultValue: string;
  options: LanguageOption[];
}) {
  return (
    <div className="relative">
      <select
        name="lang"
        aria-label="Book language"
        defaultValue={defaultValue}
        // 12px and 32px tall: found by the sweep, not by the manual audit.
        // The language filter on the primary book-finding surface.
        className="min-h-11 appearance-none rounded-lg border border-border bg-card py-0 pl-3 pr-7 text-[16px] sm:text-xs font-medium text-foreground transition-colors focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/* ── Pill toggle group (link-based, no form submit) ── */

function PillGroup({
  activeFilters,
  field,
  options,
}: {
  activeFilters: ActiveFilters;
  field: "format" | "sort";
  options: { value: string; label: string }[];
}) {
  return (
    <div aria-label={field === "format" ? "Book format" : "Sort books"}
      className="flex items-center rounded-xl border border-border bg-card p-0.5">
      {options.map((opt) => {
        const isActive = activeFilters[field] === opt.value;
        return (
          <Link
            key={opt.value}
            href={buildFilterHref(activeFilters, { [field]: opt.value })}
            aria-current={isActive ? "true" : undefined}
            className={`rounded-md px-4 py-3 text-[13px] font-medium leading-5 transition-[background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
              isActive
                ? "bg-[#907AFF]/[0.09] text-accent-foreground dark:bg-[#907AFF]/[0.14] "
                : "text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Curated layout fires only for a sparse, unfiltered catalog — with search
 * or genre filters active a plain grid reads as results, not curation. */
function isCuratedLayout(books: DiscoverBook[], filters: ActiveFilters): boolean {
  return (
    books.length <= 4 &&
    !filters.query &&
    filters.genreSlugs.length === 0
  );
}

/** Editorial feature card: cover + typeset metadata + CTA. Same visual
 * language as BookCard (brand wash fallback, violet accents, 3:4 cover). */
function FeaturedBookCard({ book }: { book: DiscoverBook }) {
  return (
    <Link
      href={book.href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
    >
      <div className="relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-[background-color,border-color,color,box-shadow] duration-300 group-hover:border-[#907AFF]/20 group-hover:shadow-[0_20px_40px_-12px_rgba(144,122,255,0.15)] sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        {/* Ambient corner wash — same brand language as the rest of the app */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#907AFF]/[0.08] blur-[70px]"
        />
        <div className="relative aspect-[3/4] w-40 flex-shrink-0 overflow-hidden rounded-2xl border border-border shadow-[0_8px_24px_rgba(15,23,42,0.10)] sm:w-48">
          {book.cover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={book.cover}
              alt={book.title}
              className="h-full w-full object-cover transition-transform duration-500"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/[0.16] via-[#E29ED5]/[0.10] to-[#FCC997]/[0.20] p-4 dark:from-[#907AFF]/25 dark:via-[#E29ED5]/10 dark:to-[#FCC997]/15">
              <span className="line-clamp-4 text-center text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                {book.title}
              </span>
            </div>
          )}
        </div>
        <div className="relative min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
            {book.genre ?? "Featured"}
          </p>
          <h2 className="mt-2 text-[28px] font-medium leading-tight tracking-tight text-foreground sm:text-[30px] font-display">
            {book.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {book.author}
            {book.hasAudiobook && (
              <span className="before:mx-1.5 before:content-['·'] before:text-muted-foreground before:dark:text-muted-foreground">
                Audiobook available
              </span>
            )}
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-semibold text-white transition-colors group-hover:bg-foreground dark:text-background">
            Open book
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

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
  const hasActiveFilters =
    !!activeFilters.query ||
    activeFilters.genreSlugs.length > 0 ||
    (!!activeFilters.format && activeFilters.format !== "all");

  return (
    <div className="space-y-8">
      {/* ── Hero card: search + atmospheric depth + genre rail ── */}
      <div className="card-base relative overflow-hidden">
        {/* Atmospheric glows — contained within card bounds */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-[#907AFF]/[0.12] blur-[80px]" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-[#E29ED5]/[0.07] blur-[60px]" />
        </div>

        {/* Title + search */}
        <div className="relative p-6 sm:p-8">
          <div className="mb-6">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-accent-foreground">The Verkli library</p>
            <h1 className="text-[clamp(30px,4vw,44px)] leading-[1.15] font-medium tracking-tight text-foreground font-display">
              Discover books
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {resultCount > 0
                ? `${resultCount.toLocaleString()} book${resultCount !== 1 ? "s" : ""} in ${languageLabel}`
                : `Browsing in ${languageLabel}`}
            </p>
          </div>

          <form method="get" action="/reader/discover">
            {activeFilters.language !== "en" && (
              <input type="hidden" name="lang" value={activeFilters.language} />
            )}
            {activeFilters.genreSlugs.length > 0 && (
              <input type="hidden" name="genre" value={activeFilters.genreSlugs.join(",")} />
            )}
            {activeFilters.format !== "all" && (
              <input type="hidden" name="format" value={activeFilters.format} />
            )}
            {activeFilters.sort !== "newest" && (
              <input type="hidden" name="sort" value={activeFilters.sort} />
            )}

            <div className="flex gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="filter-q"
                  type="text"
                  name="q"
                  defaultValue={activeFilters.query}
                  aria-label="Search books by title"
                  placeholder="Search by title..."
                  className="h-12 w-full rounded-xl border border-border bg-muted/70 pl-10 pr-4 text-[16px] sm:text-sm text-foreground placeholder:text-muted-foreground/60 transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] focus:border-[#907AFF]/40 focus:bg-card focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:bg-card dark:placeholder:text-muted-foreground dark:focus:bg-card"
                />
              </div>
              <button
                type="submit"
                className="btn-primary shrink-0 text-sm transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
              >
                Search
              </button>
            </div>
          </form>
        </div>

        {/* Genre chips — multi-select horizontal scroll rail */}
        {genres.length > 0 && (
          <div className="relative border-t border-border">
            <div className="px-6 pb-5 pt-3 sm:px-8">
              <div className="scrollbar-none flex gap-2 overflow-x-auto pb-0.5">
                <Link
                  href={buildFilterHref(activeFilters, { genreSlugs: [] })}
                  className={`flex-shrink-0 rounded-full border px-4 py-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                    activeFilters.genreSlugs.length === 0
                      ? "border-[#907AFF]/30 bg-[#907AFF]/[0.09] text-accent-foreground dark:bg-[#907AFF]/[0.14] "
                      : "border-border bg-card/80 text-muted-foreground hover:border-[#907AFF]/20 hover:text-accent-foreground dark:bg-card dark:hover:text-accent-foreground"
                  }`}
                >
                  All genres
                </Link>

                {genres.map((g) => {
                  const isActive = activeFilters.genreSlugs.includes(g.slug);
                  return (
                    <Link
                      key={g.id}
                      href={buildFilterHref(activeFilters, {
                        genreSlugs: toggleGenre(activeFilters.genreSlugs, g.slug),
                      })}
                      className={`flex-shrink-0 rounded-full border px-4 py-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                        isActive
                          ? "border-[#907AFF]/30 bg-[#907AFF]/[0.09] text-accent-foreground dark:bg-[#907AFF]/[0.14] "
                          : "border-border bg-card/80 text-muted-foreground hover:border-[#907AFF]/20 hover:text-accent-foreground dark:bg-card dark:hover:text-accent-foreground"
                      }`}
                    >
                      {g.icon ? `${g.icon} ` : ""}
                      {g.label}
                    </Link>
                  );
                })}
              </div>

              {activeFilters.genreSlugs.length >= 2 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Showing books in{" "}
                  <span className="font-medium text-accent-foreground">
                    {activeFilters.genreSlugs.length} genres
                  </span>
                  {" — "}
                  <Link
                    href={buildFilterHref(activeFilters, { genreSlugs: [] })}
                    className="underline underline-offset-2 hover:text-foreground dark:hover:text-muted-foreground"
                  >
                    clear
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Featured authors rail ── */}
      {authors.length > 0 && !activeFilters.query && activeFilters.genreSlugs.length === 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-medium text-foreground font-display">
              Featured authors
            </h2>
          </div>
          <div className="scrollbar-none -mx-0.5 flex gap-3 overflow-x-auto px-0.5 pb-1">
            {authors.map((author) => (
              <Link
                key={author.id}
                href={author.href}
                className="group flex-shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex w-[100px] flex-col items-center gap-3">
                  {/* Avatar */}
                  <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:shadow-md dark:bg-card">
                    {author.avatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={author.avatar}
                        alt={author.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                        <span className="text-base font-semibold text-accent-foreground">
                          {getInitials(author.name)}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Name + genre */}
                  <div className="w-full text-center">
                    <p className="truncate text-xs font-medium text-foreground">
                      {author.name}
                    </p>
                    {author.genre && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {author.genre}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Filter bar ── */}
      <form
        method="get"
        action="/reader/discover"
        className="flex flex-wrap items-center gap-2"
      >
        {activeFilters.query && (
          <input type="hidden" name="q" value={activeFilters.query} />
        )}
        {activeFilters.genreSlugs.length > 0 && (
          <input type="hidden" name="genre" value={activeFilters.genreSlugs.join(",")} />
        )}

        <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

        {/* Language: still a form-submitted select (many options) */}
        <LanguageSelect
          defaultValue={activeFilters.language}
          options={languageOptions}
        />

        {/* Format: link-based pill group */}
        <PillGroup
          activeFilters={activeFilters}
          field="format"
          options={[
            { value: "all", label: "All" },
            { value: "ebook", label: "E-book" },
            { value: "audiobook", label: "Audio" },
          ]}
        />

        {/* Sort: link-based pill group */}
        <PillGroup
          activeFilters={activeFilters}
          field="sort"
          options={[
            { value: "newest", label: "Newest" },
            { value: "popular", label: "Popular" },
            { value: "title", label: "A–Z" },
          ]}
        />

        {/* Language apply — only needed when language changes */}
        <button
          type="submit"
          className="btn-secondary text-[13px] transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
        >
          Apply
        </button>

        {hasActiveFilters && (
          <Link
            href={buildClearAllHref(activeFilters.language)}
            className="inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground dark:hover:text-muted-foreground"
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Results ── */}
      {books.length > 0 ? (
        isCuratedLayout(books, activeFilters) ? (
          /* Sparse catalog, no active filters: the first title gets an
             editorial feature treatment instead of a lonely thumbnail grid —
             a curated shelf, not an empty store. */
          <section className="space-y-6">
            <FeaturedBookCard book={books[0]} />
            {books.length > 1 && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {books.slice(1).map((book) => (
                  <div key={book.id}>
                    <BookCard
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      genre={book.genre ?? undefined}
                      cover={book.cover}
                      href={book.href}
                      tag={book.hasAudiobook ? "Audio" : undefined}
                      hasTrailer={book.hasTrailer}
                      layout="grid"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
        <section>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <div key={book.id}>
                <BookCard
                  id={book.id}
                  title={book.title}
                  author={book.author}
                  genre={book.genre ?? undefined}
                  cover={book.cover}
                  href={book.href}
                  tag={book.hasAudiobook ? "Audio" : undefined}
                  hasTrailer={book.hasTrailer}
                  layout="grid"
                />
              </div>
            ))}
          </div>
        </section>
        )
      ) : (
        <section className="card-base p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#907AFF]/10">
            <BookOpen className="h-6 w-6 text-accent-foreground" />
          </div>
          <h2 className="mt-4 text-xl font-medium text-foreground font-display">
            {hasActiveFilters ? "No books match your filters" : `No books in ${languageLabel} yet`}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try a different search term or remove some filters."
              : "Books appear here as authors publish them. Choose another language or explore the author directory."}
          </p>
          <Link
            href={hasActiveFilters ? buildClearAllHref(activeFilters.language) : "/reader/authors"}
            className="btn-primary mt-6 inline-flex items-center gap-2 text-sm transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
          >
            {hasActiveFilters ? "Clear all filters" : "Explore authors"}
          </Link>
        </section>
      )}
    </div>
  );
}
