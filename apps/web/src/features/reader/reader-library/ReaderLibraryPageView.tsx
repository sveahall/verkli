"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Clock3,
  Plus,
  Search,
} from "lucide-react";
import BookCard from "@/components/reader/BookCard";
import type { LibraryBook, LibraryData } from "@/app/(app-reader)/reader/library/page";

type ReaderLibraryPageViewProps = {
  initialData: LibraryData;
};

function matchesQuery(book: LibraryBook, query: string) {
  if (!query) return true;
  return [book.title, book.author, book.chapterLabel ?? "", book.lastOpenedLabel ?? ""]
    .join(" ").toLowerCase().includes(query);
}

export default function ReaderLibraryPageView({ initialData }: ReaderLibraryPageViewProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  const filteredReading = useMemo(() => initialData.reading.filter((b) => matchesQuery(b, query)), [initialData.reading, query]);
  const filteredSaved = useMemo(() => initialData.saved.filter((b) => matchesQuery(b, query)), [initialData.saved, query]);
  const filteredFinished = useMemo(() => initialData.finished.filter((b) => matchesQuery(b, query)), [initialData.finished, query]);

  const hasAnyBooks = initialData.reading.length > 0 || initialData.saved.length > 0 || initialData.finished.length > 0;
  const showReading = isSearching ? filteredReading.length > 0 : initialData.reading.length > 0;
  const showSaved = isSearching ? filteredSaved.length > 0 : initialData.saved.length > 0;
  const showFinished = isSearching ? filteredFinished.length > 0 : initialData.finished.length > 0;
  const noSearchResults = isSearching && !showReading && !showSaved && !showFinished;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#907AFF]">
            Library
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-white">
            Your books
          </h1>
          <p className="mt-1 text-sm text-[#64748B] dark:text-white/50">
            {initialData.reading.length} reading &middot; {initialData.saved.length} saved &middot; {initialData.finished.length} completed
          </p>
        </div>
        <Link
          href="/reader/discover"
          className="btn-primary inline-flex items-center gap-2 self-start text-sm sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Add books
        </Link>
      </header>

      {/* ── Search ── */}
      {hasAnyBooks && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library..."
            className="h-10 w-full rounded-xl border border-black/[0.06] bg-white pl-10 pr-4 text-sm text-[#0F172A] placeholder:text-[#64748B]/60 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/30"
          />
        </div>
      )}

      {/* ── Empty library ── */}
      {!hasAnyBooks ? (
        <section className="card-base p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#907AFF]/10">
            <BookOpen className="h-6 w-6 text-[#907AFF]" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[#0F172A] dark:text-white">
            Your library is empty
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#64748B] dark:text-white/50">
            Start reading from Discover and your books will be organized here.
          </p>
          <Link
            href="/reader/discover"
            className="btn-primary mt-6 inline-flex items-center gap-2 text-sm"
          >
            <BookOpen className="h-4 w-4" /> Browse Discover
          </Link>
        </section>
      ) : (
        <>
          {noSearchResults && (
            <section className="card-base p-6 text-center">
              <p className="text-sm text-[#64748B] dark:text-white/50">
                No books matching &ldquo;{search}&rdquo;
              </p>
            </section>
          )}

          {/* ── Continue reading ── */}
          {showReading && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-[#0F172A] dark:text-white">
                Continue reading
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredReading.map((book) => {
                  const pct = Math.max(0, Math.min(100, book.progress ?? 0));
                  return (
                    <Link
                      key={book.id}
                      href={book.href ?? `/reader/books/${book.id}`}
                      className="card-base group flex items-start gap-4 p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40"
                    >
                      <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-[#F8F9FB] dark:bg-white/10">
                        {book.cover ? (
                          <Image
                            src={book.cover}
                            alt={book.title}
                            fill
                            sizes="80px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <BookMarked className="h-5 w-5 text-[#64748B]/40 dark:text-white/25" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="truncate text-sm font-semibold text-[#0F172A] group-hover:text-[#907AFF] dark:text-white">
                            {book.title}
                          </p>
                          <p className="truncate text-xs text-[#64748B] dark:text-white/50">
                            {book.author}
                          </p>
                        </div>
                        {book.chapterLabel && (
                          <p className="truncate text-xs text-[#64748B] dark:text-white/50">
                            {book.chapterLabel}
                          </p>
                        )}
                        {book.lastOpenedLabel && (
                          <div className="flex items-center gap-1.5 text-xs text-[#64748B]/70 dark:text-white/35">
                            <Clock3 className="h-3 w-3" />
                            <span>{book.lastOpenedLabel}</span>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#F8F9FB] dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#907AFF] to-[#907AFF]/60"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span className="text-[#64748B] dark:text-white/50">
                              {Math.round(pct)}% complete
                            </span>
                            <span className="inline-flex items-center gap-1 text-[#907AFF] group-hover:text-[#7058DD]">
                              Resume
                              <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Saved for later ── */}
          {(showSaved || !isSearching) && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-[#0F172A] dark:text-white">
                Saved for later
              </h2>
              {showSaved ? (
                <div className="flex flex-wrap gap-4">
                  {filteredSaved.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      cover={book.cover}
                      href={book.href}
                      layout="rail"
                      size="md"
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state-base flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10">
                    <Bookmark className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#0F172A] dark:text-white/60">
                      No saved books yet
                    </p>
                    <p className="text-xs text-[#64748B] dark:text-white/40">
                      Bookmark books from Discover to save them here.
                    </p>
                  </div>
                  <Link
                    href="/reader/discover"
                    className="btn-secondary shrink-0 text-sm"
                  >
                    Browse
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* ── Completed ── */}
          {(showFinished || !isSearching) && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-[#0F172A] dark:text-white">
                Completed
              </h2>
              {showFinished ? (
                <div className="flex flex-wrap gap-4">
                  {filteredFinished.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      cover={book.cover}
                      href={book.href}
                      progress={book.progress}
                      ctaLabel="Open book"
                      layout="rail"
                      size="md"
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state-base flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#0F172A] dark:text-white/60">
                      No completed books yet
                    </p>
                    <p className="text-xs text-[#64748B] dark:text-white/40">
                      Books you finish reading will appear here.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
