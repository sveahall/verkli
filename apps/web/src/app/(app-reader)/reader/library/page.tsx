"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import BookCard from "@/components/reader/BookCard";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";
import Tabs, { type TabItem } from "@/components/reader/Tabs";

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  cover: string;
  progress?: number;
};

const reading: LibraryBook[] = [
  {
    id: "midnight-atlas",
    title: "Midnight Atlas",
    author: "Lina Ko",
    cover:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80",
    progress: 62,
  },
  {
    id: "glass-tide",
    title: "The Glass Tide",
    author: "Marcus Vail",
    cover:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop&q=80",
    progress: 34,
  },
  {
    id: "northbound",
    title: "Northbound Letters",
    author: "Ari Sun",
    cover:
      "https://images.unsplash.com/photo-1473862170183-6f0baff9e0b1?w=600&auto=format&fit=crop&q=80",
    progress: 78,
  },
  {
    id: "garden-of-echoes",
    title: "Garden of Echoes",
    author: "June Park",
    cover:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&auto=format&fit=crop&q=80",
    progress: 18,
  },
];

const saved: LibraryBook[] = [
  {
    id: "opal-line",
    title: "Opal Line",
    author: "Drew Park",
    cover:
      "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "river-bound",
    title: "Riverbound",
    author: "Elena Grey",
    cover:
      "https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?w=600&auto=format&fit=crop&q=80",
  },
];

const finished: LibraryBook[] = [
  {
    id: "sunroom",
    title: "The Sunroom",
    author: "Ivy Lane",
    cover:
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "soft-edges",
    title: "Soft Edges",
    author: "Will Hart",
    cover:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "signal-in-the-snow",
    title: "Signal in the Snow",
    author: "Eva Thorne",
    cover:
      "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "harborlight",
    title: "Harborlight",
    author: "Miles Vega",
    cover:
      "https://images.unsplash.com/photo-1455885666381-2d876b8e6dcf?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "quiet-noon",
    title: "Quiet Noon",
    author: "Owen Price",
    cover:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "sea-glass",
    title: "Sea Glass Letters",
    author: "Nora Lark",
    cover:
      "https://images.unsplash.com/photo-1473862170183-6f0baff9e0b1?w=600&auto=format&fit=crop&q=80",
  },
];

const collections: Record<string, LibraryBook[]> = {
  reading,
  saved,
  finished,
};

const sortOptions = [
  { id: "recent", label: "Recent" },
  { id: "title", label: "Title" },
  { id: "progress", label: "Progress" },
] as const;

type SortOption = (typeof sortOptions)[number]["id"];

export default function ReaderLibraryPage() {
  const [activeTab, setActiveTab] = useState("reading");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const activeBooks = collections[activeTab] ?? [];

  const tabs: TabItem[] = useMemo(
    () => [
      { id: "reading", label: "Currently reading", badge: `${reading.length}` },
      { id: "saved", label: "Saved", badge: `${saved.length}` },
      { id: "finished", label: "Finished", badge: `${finished.length}` },
    ],
    []
  );

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeBooks;
    return activeBooks.filter((book) =>
      [book.title, book.author].some((field) => field.toLowerCase().includes(query))
    );
  }, [activeBooks, search]);

  const sortedBooks = useMemo(() => {
    if (sortBy === "recent") return filteredBooks;
    const copy = [...filteredBooks];
    if (sortBy === "title") {
      copy.sort((a, b) => a.title.localeCompare(b.title));
      return copy;
    }
    copy.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
    return copy;
  }, [filteredBooks, sortBy]);

  const hasSearch = search.trim().length > 0;

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Library"
        title="Your library"
        subtitle="Everything you have started, saved, or finished lives here."
        actions={
          <Link href="/reader/discover" className="btn-secondary">
            Add new books
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />
          <p className="text-xs text-slate-500 dark:text-white/50">
            Showing {sortedBooks.length} of {activeBooks.length}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-3">
            <label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
              Search
            </label>
            <div className="relative flex min-w-[220px] flex-1 items-center">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-h-[44px] w-full rounded-full border border-slate-200/80 bg-white/90 px-4 text-[14px] text-slate-700 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
                aria-label="Search your library"
              />
              {hasSearch && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 min-h-[32px] rounded-full px-3 text-[12px] font-medium text-slate-500 transition hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
              Sort by
            </span>
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
              {sortOptions.map((option) => {
                const active = option.id === sortBy;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSortBy(option.id)}
                    className={`min-h-[36px] rounded-full px-4 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12] ${
                      active
                        ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                        : "text-slate-600 hover:text-slate-900 dark:text-white/70 dark:hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {sortedBooks.length === 0 ? (
        <EmptyState
          title={hasSearch ? "No matches" : "Nothing here yet"}
          description={
            hasSearch
              ? "Try another title or clear your search."
              : "Save a story to keep it close. Your picks will show up in this tab."
          }
          action={
            hasSearch ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="btn-secondary"
              >
                Clear search
              </button>
            ) : (
              <Link href="/reader/discover" className="btn-primary rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95">
                Browse discovery
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
          {sortedBooks.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              cover={book.cover}
              progress={book.progress}
              size="lg"
              layout="grid"
            />
          ))}
        </div>
      )}
    </div>
  );
}
