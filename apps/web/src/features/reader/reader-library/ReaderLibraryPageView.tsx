"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Bookmark, CheckCircle2, Library, Plus, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import BookCard from "@/components/reader/BookCard";
import type { LibraryBook, LibraryData } from "@/app/(app-reader)/reader/library/page";
import { ReaderContinueCard } from "@/features/reader/shared/ReaderScaffold";

type ReaderLibraryPageViewProps = {
  initialData: LibraryData;
};

function matchesQuery(book: LibraryBook, query: string) {
  if (!query) return true;
  return [book.title, book.author, book.chapterLabel ?? "", book.lastOpenedLabel ?? ""]
    .join(" ").toLowerCase().includes(query);
}

function StatBadge({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <span className={color}>{icon}</span>
      <span className="text-[13px] text-slate-500 dark:text-white/50">{label}</span>
      <span className="text-[15px] font-semibold text-slate-900 dark:text-white">{count}</span>
    </div>
  );
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="Your books"
        description={`${initialData.reading.length} reading · ${initialData.saved.length} saved · ${initialData.finished.length} completed`}
        actions={
          <Link href="/reader/discover" className="btn-primary inline-flex items-center gap-2 text-[13px]">
            <Plus className="h-4 w-4" /> Add books
          </Link>
        }
      />

      {/* ── Stats + Search ── */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <StatBadge icon={<Library className="h-3.5 w-3.5" />} label="Reading" count={initialData.reading.length} color="text-blue-500" />
            <StatBadge icon={<Bookmark className="h-3.5 w-3.5" />} label="Saved" count={initialData.saved.length} color="text-amber-500" />
            <StatBadge icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Completed" count={initialData.finished.length} color="text-emerald-500" />
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search library..."
                className="input-base w-full rounded-full pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Empty library ── */}
      {!hasAnyBooks ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#907AFF]/10">
              <BookOpen className="h-6 w-6 text-[#907AFF]" />
            </div>
            <h2 className="mt-4 text-[18px] font-semibold text-slate-900 dark:text-white">Your library is empty</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-slate-500 dark:text-white/50">
              Start reading from discovery and your books will be organized here.
            </p>
            <Link href="/reader/discover" className="btn-primary mt-5 inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Browse discovery
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {noSearchResults ? (
            <Card variant="subtle"><CardContent className="py-8 text-center"><p className="text-[15px] text-slate-500 dark:text-white/50">No books matching &ldquo;{search}&rdquo;</p></CardContent></Card>
          ) : null}

          {/* ── Currently reading ── */}
          {showReading ? (
            <Card>
              <CardContent>
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Currently reading</h2>
                  {filteredReading.length > 3 ? <span className="text-[12px] text-slate-400 dark:text-white/35">{filteredReading.length} books</span> : null}
                </div>
                <div className="mt-4 -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
                  {filteredReading.map((book) => (
                    <div key={book.id} className="snap-start">
                      <ReaderContinueCard title={book.title} author={book.author} href={book.href ?? `/reader/books/${book.id}`} cover={book.cover} progress={book.progress ?? 0} chapterLabel={book.chapterLabel} lastOpenedLabel={book.lastOpenedLabel} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* ── Saved books ── */}
          <Card>
            <CardContent>
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Saved for later</h2>
              {showSaved ? (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredSaved.map((book) => <BookCard key={book.id} id={book.id} title={book.title} author={book.author} cover={book.cover} href={book.href} layout="grid" size="lg" />)}
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed border-slate-200/80 px-5 py-5 dark:border-white/[0.08]">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10">
                    <Bookmark className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-slate-600 dark:text-white/60">No saved books yet</p>
                    <p className="text-[13px] text-slate-400 dark:text-white/35">Bookmark books from Discover to save them here.</p>
                  </div>
                  <Link href="/reader/discover" className="btn-secondary shrink-0 text-[13px]">
                    <Plus className="h-3.5 w-3.5" /> Browse
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Completed ── */}
          <Card>
            <CardContent>
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Completed</h2>
              {showFinished ? (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredFinished.map((book) => <BookCard key={book.id} id={book.id} title={book.title} author={book.author} cover={book.cover} href={book.href} progress={book.progress} ctaLabel="Open book" layout="grid" size="lg" />)}
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed border-slate-200/80 px-5 py-5 dark:border-white/[0.08]">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-slate-600 dark:text-white/60">No completed books yet</p>
                    <p className="text-[13px] text-slate-400 dark:text-white/35">Books you finish reading will appear here.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
