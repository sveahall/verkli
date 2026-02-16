"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import BookCard from "@/components/reader/BookCard";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";
import Tabs, { type TabItem } from "@/components/reader/Tabs";
import type { LibraryBook, LibraryData } from "./page";

const sortOptions = [
  { id: "recent", label: "Recent" },
  { id: "title", label: "Title" },
  { id: "progress", label: "Progress" },
] as const;

type SortOption = (typeof sortOptions)[number]["id"];

type ReaderLibraryClientProps = {
  initialData: LibraryData;
};

const EMPTY_BOOKS: LibraryBook[] = [];

export default function ReaderLibraryClient({ initialData }: ReaderLibraryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  // Derive activeTab directly from the URL search param instead of syncing
  // via useEffect, which triggers cascading renders.
  const activeTab = tabParam === "saved" || tabParam === "finished" || tabParam === "reading" ? tabParam : "reading";
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  const collections: Record<string, LibraryBook[]> = {
    reading: initialData.reading,
    saved: initialData.saved,
    finished: initialData.finished,
  };
  const activeBooks = collections[activeTab] ?? EMPTY_BOOKS;
  const cardCtaLabel =
    activeTab === "reading" ? "Resume" : activeTab === "saved" ? "Start reading" : "Re-read";

  const handleTabChange = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "reading") {
      params.delete("tab");
    } else {
      params.set("tab", id);
    }
    const query = params.toString();
    router.replace(`/reader/library${query ? `?${query}` : ""}`, { scroll: false });
  };

  const tabs: TabItem[] = useMemo(
    () => [
      { id: "reading", label: "Currently reading", badge: `${initialData.reading.length}` },
      { id: "saved", label: "Saved", badge: `${initialData.saved.length}` },
      { id: "finished", label: "Finished", badge: `${initialData.finished.length}` },
    ],
    [initialData.reading.length, initialData.saved.length, initialData.finished.length]
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
  const isEmpty = activeBooks.length === 0;
  const showEmptyState = sortedBooks.length === 0;

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Library"
        title="Your library"
        description="Everything you have started, saved, or finished lives here."
        actions={
          <Link href="/reader/discover" className="btn-secondary">
            Add new books
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs items={tabs} active={activeTab} onChange={handleTabChange} />
          {!isEmpty && (
            <p className="text-xs text-slate-500 dark:text-white/50">
              Showing {sortedBooks.length} of {activeBooks.length}
            </p>
          )}
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
                placeholder="Search title or author"
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

          {!isEmpty && (
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
          )}
        </div>
      </div>

      {showEmptyState ? (
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
              <Link
                href="/reader/discover"
                className="btn-primary rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95"
              >
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
              cover={book.cover ?? undefined}
              progress={book.progress}
              href={book.href}
              ctaLabel={cardCtaLabel}
              size="lg"
              layout="grid"
            />
          ))}
        </div>
      )}
    </div>
  );
}
