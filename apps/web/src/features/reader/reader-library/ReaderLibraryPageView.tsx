"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BookCard from "@/components/reader/BookCard";
import type { LibraryBook, LibraryData } from "@/app/(app-reader)/reader/library/page";
import {
  ReaderContextCard,
  ReaderContinueCard,
  ReaderEmptyBlock,
  ReaderHeroPanel,
  ReaderSectionHeader,
} from "@/features/reader/shared/ReaderScaffold";

type ReaderLibraryPageViewProps = {
  initialData: LibraryData;
};

function matchesQuery(book: LibraryBook, query: string) {
  if (!query) return true;
  const haystack = [
    book.title,
    book.author,
    book.chapterLabel ?? "",
    book.lastOpenedLabel ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function ReaderLibraryPageView({
  initialData,
}: ReaderLibraryPageViewProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const filteredReading = useMemo(
    () => initialData.reading.filter((book) => matchesQuery(book, query)),
    [initialData.reading, query]
  );
  const filteredSaved = useMemo(
    () => initialData.saved.filter((book) => matchesQuery(book, query)),
    [initialData.saved, query]
  );
  const filteredFinished = useMemo(
    () => initialData.finished.filter((book) => matchesQuery(book, query)),
    [initialData.finished, query]
  );

  const hasAnyBooks =
    initialData.reading.length > 0 ||
    initialData.saved.length > 0 ||
    initialData.finished.length > 0;

  return (
    <div className="section-gap">
      <ReaderHeroPanel
        eyebrow="Library"
        title="Your personal reading collection"
        description="Currently reading, saved for later, and completed books live in one place with the same calm layout language as the rest of the app."
        actions={
          <>
            <Link href="/reader/discover" className="btn-primary">
              Add new books
            </Link>
            <Link href="/reader/home" className="btn-secondary">
              Back to home
            </Link>
          </>
        }
      >
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
            In progress
          </p>
          <p className="mt-2 text-[14px] text-slate-600 dark:text-white/65">
            {initialData.reading.length === 0
              ? "Nothing in motion yet."
              : `${initialData.reading.length} active ${initialData.reading.length === 1 ? "book" : "books"} ready to resume.`}
          </p>
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-white/35">
            Saved
          </p>
          <p className="mt-2 text-[14px] text-slate-600 dark:text-white/65">
            {initialData.saved.length} saved picks, including {initialData.bookmarksCount} bookmarks.
          </p>
        </div>
      </ReaderHeroPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-10">
          <section className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-eyebrow" htmlFor="reader-library-search">
                Search library
              </label>
              <input
                id="reader-library-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title, author, or chapter"
                className="input-base max-w-xl rounded-full"
              />
            </div>
          </section>

          {!hasAnyBooks ? (
            <ReaderEmptyBlock
              title="Your library is empty"
              description="Start reading from discovery and your books will be organized here automatically."
              actionHref="/reader/discover"
              actionLabel="Browse discovery"
            />
          ) : (
            <>
              <section className="space-y-4" id="currently-reading">
                <ReaderSectionHeader
                  eyebrow="Currently reading"
                  title="Keep your active books moving"
                  description="Resume from the latest chapter with progress and last-opened context."
                />
                {filteredReading.length === 0 ? (
                  <ReaderEmptyBlock
                    title="No matching active reads"
                    description="Try another search term or clear the filter."
                  />
                ) : (
                  <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
                    {filteredReading.map((book) => (
                      <ReaderContinueCard
                        key={book.id}
                        title={book.title}
                        author={book.author}
                        href={book.href ?? `/reader/books/${book.id}`}
                        cover={book.cover}
                        progress={book.progress ?? 0}
                        chapterLabel={book.chapterLabel}
                        lastOpenedLabel={book.lastOpenedLabel}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-4" id="saved-books">
                <ReaderSectionHeader
                  eyebrow="Saved books"
                  title="A shelf for later"
                  description="Bookmarks, purchases, and books you wanted to keep close."
                />
                {filteredSaved.length === 0 ? (
                  <ReaderEmptyBlock
                    title="No saved matches"
                    description="Save books from discovery or while reading and they will show up here."
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredSaved.map((book) => (
                      <BookCard
                        key={book.id}
                        id={book.id}
                        title={book.title}
                        author={book.author}
                        cover={book.cover}
                        href={book.href}
                        length={book.lastOpenedLabel ?? "Saved to library"}
                        layout="grid"
                        size="lg"
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-4" id="completed-books">
                <ReaderSectionHeader
                  eyebrow="Completed books"
                  title="Finished stories"
                  description="Return to the books you have already completed and revisit them when you want."
                />
                {filteredFinished.length === 0 ? (
                  <ReaderEmptyBlock
                    title="Nothing completed yet"
                    description="Finish a book and it will move here automatically."
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
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
                        layout="grid"
                        size="lg"
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <ReaderContextCard
            title="Library actions"
            description="Stay close to the reading loop: discover, resume, and keep your shelves clean."
          >
            <Link href="/reader/discover" className="btn-secondary w-full justify-between">
              Discover books
            </Link>
            <Link href="/reader/home" className="btn-secondary w-full justify-between">
              Return home
            </Link>
          </ReaderContextCard>

          <ReaderContextCard
            title="Shelf snapshot"
            description="A quick textual overview instead of dashboard-style stat cards."
          >
            <div className="space-y-2 text-[14px] text-slate-600 dark:text-white/65">
              <p>{initialData.reading.length} currently reading</p>
              <p>{initialData.saved.length} saved books</p>
              <p>{initialData.finished.length} completed books</p>
            </div>
          </ReaderContextCard>
        </aside>
      </div>
    </div>
  );
}
