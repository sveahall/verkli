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
        defaultValue={defaultValue}
        className="h-8 appearance-none rounded-lg border border-slate-200/80 bg-white py-0 pl-3 pr-7 text-xs font-medium text-[#0F172A] transition-colors focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#64748B] dark:text-white/40" />
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
    <div className="flex items-center rounded-lg border border-slate-200/80 bg-white p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
      {options.map((opt) => {
        const isActive = activeFilters[field] === opt.value;
        return (
          <Link
            key={opt.value}
            href={buildFilterHref(activeFilters, { [field]: opt.value })}
            className={`rounded-md px-3.5 py-2.5 text-[13px] font-medium leading-[18px] transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
              isActive
                ? "bg-[#907AFF]/[0.09] text-[#907AFF] dark:bg-[#907AFF]/[0.14] dark:text-[#B8AAFF]"
                : "text-[#64748B] hover:text-[#0F172A] dark:text-white/40 dark:hover:text-white/70"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
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
    <div className="reader-stagger space-y-5">
      {/* ── Hero card: search + atmospheric depth + genre rail ── */}
      <div className="card-base relative overflow-hidden">
        {/* Atmospheric glows — contained within card bounds */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-[#907AFF]/[0.12] blur-[80px]" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-[#E29ED5]/[0.07] blur-[60px]" />
        </div>

        {/* Title + search */}
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
                  placeholder="Search by title or author..."
                  className="h-12 w-full rounded-xl border border-slate-200/80 bg-slate-100/70 pl-10 pr-4 text-sm text-[#0F172A] placeholder:text-[#64748B]/60 transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] focus:border-[#907AFF]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30 dark:focus:bg-white/[0.09]"
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
          <div className="relative border-t border-slate-200/60 dark:border-white/[0.06]">
            <div className="px-6 pb-5 pt-3 sm:px-8">
              <div className="scrollbar-none flex gap-2 overflow-x-auto pb-0.5">
                <Link
                  href={buildFilterHref(activeFilters, { genreSlugs: [] })}
                  className={`flex-shrink-0 rounded-full border px-4 py-3 text-sm font-medium transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
                      className={`flex-shrink-0 rounded-full border px-4 py-3 text-sm font-medium transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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

      {/* ── Featured authors rail ── */}
      {authors.length > 0 && !activeFilters.query && activeFilters.genreSlugs.length === 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0F172A] dark:text-white">
              Featured authors
            </h2>
          </div>
          <div className="scrollbar-none -mx-0.5 flex gap-3 overflow-x-auto px-0.5 pb-1">
            {authors.map((author) => (
              <Link
                key={author.id}
                href={author.href}
                className="group flex-shrink-0"
              >
                <div className="flex w-[88px] flex-col items-center gap-2">
                  {/* Avatar */}
                  <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-1 group-hover:shadow-md dark:border-white/10 dark:bg-white/[0.06]">
                    {author.avatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={author.avatar}
                        alt={author.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                        <span className="text-base font-semibold text-[#907AFF]">
                          {getInitials(author.name)}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Name + genre */}
                  <div className="w-full text-center">
                    <p className="truncate text-xs font-medium text-[#0F172A] dark:text-white">
                      {author.name}
                    </p>
                    {author.genre && (
                      <p className="truncate text-[10px] text-[#64748B] dark:text-white/40">
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

        <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-[#64748B] dark:text-white/40" />

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
            className="text-xs font-medium text-[#64748B] transition-colors duration-150 hover:text-[#0F172A] dark:text-white/40 dark:hover:text-white/70"
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Results grid ── */}
      {books.length > 0 ? (
        <section>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book, i) => (
              <div
                key={book.id}
                className="animate-[reader-fade-up_0.4s_cubic-bezier(0.23,1,0.32,1)_both]"
                style={{ animationDelay: `${Math.min(i * 35, 420)}ms` }}
              >
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
            className="btn-primary mt-6 inline-flex items-center gap-2 text-sm transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
          >
            Clear all filters
          </Link>
        </section>
      )}
    </div>
  );
}
