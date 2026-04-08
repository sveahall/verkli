import Link from "next/link";
import { BookOpen, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
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

/** Returns genreSlugs with slug toggled on or off */
function toggleGenre(current: string[], slug: string): string[] {
  return current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
}

function buildClearAllHref(language: string): string {
  if (language === "en") return "/reader/discover";
  return `/reader/discover?lang=${language}`;
}

/* ── Styled select with custom chevron ── */

function FilterSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 appearance-none rounded-xl border border-slate-200/80 bg-white py-0 pl-3 pr-8 text-sm font-medium text-[#0F172A] transition-colors focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B] dark:text-white/40" />
    </div>
  );
}

/* ── Main view ── */

export default function ReaderDiscoverPageView({
  languageLabel,
  languageOptions,
  books,
  genres,
  activeFilters,
  resultCount,
}: Props) {
  const hasActiveFilters =
    !!activeFilters.query ||
    activeFilters.genreSlugs.length > 0 ||
    (!!activeFilters.format && activeFilters.format !== "all");

  return (
    <div className="reader-stagger space-y-5">
      {/* ── Unified hero card: atmospheric depth + search + genres ── */}
      <div className="card-base relative overflow-hidden">
        {/* Clipping layer — prevents filter:blur from painting outside card bounds in Chrome */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          {/* Decorative purple glow — positioned inside so blur stays contained */}
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#907AFF]/[0.10] blur-[64px]" />
        </div>

        {/* ── Title + search ── */}
        <div className="relative p-6 sm:p-8">
          <div className="mb-5">
            <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
              Discover books
            </h1>
            <p className="mt-1 text-sm text-[#64748B] dark:text-white/50">
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
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-white/40" />
                <input
                  id="filter-q"
                  type="text"
                  name="q"
                  defaultValue={activeFilters.query}
                  placeholder="Search by title..."
                  className="h-12 w-full rounded-xl border border-slate-200/80 bg-slate-100/70 pl-10 pr-4 text-sm text-[#0F172A] placeholder:text-[#64748B]/60 transition-colors duration-150 focus:border-[#907AFF]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30 dark:focus:bg-white/[0.09]"
                />
              </div>
              <button type="submit" className="btn-primary shrink-0 text-sm">
                Search
              </button>
            </div>
          </form>
        </div>

        {/* ── Genre chips — multi-select, always-scroll rail ── */}
        {genres.length > 0 && (
          <div className="relative border-t border-slate-200/60 dark:border-white/[0.06]">
            <div className="px-6 pb-5 pt-3 sm:px-8">
              <div className="scrollbar-none flex gap-2 overflow-x-auto pb-0.5">
                {/* "All genres" clears selection */}
                <Link
                  href={buildFilterHref(activeFilters, { genreSlugs: [] })}
                  className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-out ${
                    activeFilters.genreSlugs.length === 0
                      ? "border-[#907AFF]/30 bg-[#907AFF]/[0.09] text-[#907AFF] dark:bg-[#907AFF]/[0.14] dark:text-[#B8AAFF]"
                      : "border-slate-200/80 bg-white/80 text-[#64748B] hover:border-[#907AFF]/20 hover:text-[#907AFF] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50 dark:hover:text-[#B8AAFF]"
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
                      className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-out ${
                        isActive
                          ? "border-[#907AFF]/30 bg-[#907AFF]/[0.09] text-[#907AFF] dark:bg-[#907AFF]/[0.14] dark:text-[#B8AAFF]"
                          : "border-slate-200/80 bg-white/80 text-[#64748B] hover:border-[#907AFF]/20 hover:text-[#907AFF] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50 dark:hover:text-[#B8AAFF]"
                      }`}
                    >
                      {g.icon ? `${g.icon} ` : ""}
                      {g.label}
                    </Link>
                  );
                })}
              </div>

              {/* Active genre summary — shown when 2+ genres selected */}
              {activeFilters.genreSlugs.length >= 2 && (
                <p className="mt-2 text-[11px] text-[#64748B] dark:text-white/40">
                  Showing books in{" "}
                  <span className="font-medium text-[#907AFF]">
                    {activeFilters.genreSlugs.length} genres
                  </span>
                  {" — "}
                  <Link
                    href={buildFilterHref(activeFilters, { genreSlugs: [] })}
                    className="underline underline-offset-2 hover:text-[#0F172A] dark:hover:text-white/70"
                  >
                    clear
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

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

        <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-[#64748B] dark:text-white/40" />

        <FilterSelect name="lang" defaultValue={activeFilters.language}>
          {languageOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect name="format" defaultValue={activeFilters.format}>
          <option value="all">All formats</option>
          <option value="ebook">E-book</option>
          <option value="audiobook">Audiobook</option>
        </FilterSelect>

        <FilterSelect name="sort" defaultValue={activeFilters.sort}>
          <option value="newest">Newest</option>
          <option value="popular">Popular</option>
          <option value="title">A &ndash; Z</option>
        </FilterSelect>

        <button type="submit" className="btn-secondary h-9 text-sm">
          Apply
        </button>

        {hasActiveFilters && (
          <Link
            href={buildClearAllHref(activeFilters.language)}
            className="text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A] dark:text-white/40 dark:hover:text-white/70"
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Results grid ── */}
      {books.length > 0 ? (
        <section>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <BookCard
                key={book.id}
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
            ))}
          </div>
        </section>
      ) : (
        <section className="card-base p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#907AFF]/10">
            <BookOpen className="h-6 w-6 text-[#907AFF]" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-[#0F172A] dark:text-white">
            No books match your filters
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#64748B] dark:text-white/50">
            Try a different search term or remove some filters.
          </p>
          <Link
            href={buildClearAllHref(activeFilters.language)}
            className="btn-primary mt-6 inline-flex items-center gap-2 text-sm"
          >
            Clear all filters
          </Link>
        </section>
      )}
    </div>
  );
}
