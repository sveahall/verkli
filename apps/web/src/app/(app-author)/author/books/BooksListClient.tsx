"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import DeleteBookButton from "@/components/books/DeleteBookButton";

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface Book {
  id: string;
  title: string | null;
  status: string;
  updated_at: string | null;
  cover_image: string | null;
}

interface BooksListClientProps {
  books: Book[];
}

type SortOption = "recent" | "title" | "status";
type FilterOption = "all" | "DRAFT" | "PUBLISHED";

/* ─────────────────────────────────────────────────────────────────────────────
 * Status Badge
 * ───────────────────────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PUBLISHED: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
    DRAFT: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    ARCHIVED: "bg-[#f5f5f5] text-[#8a8a8a] dark:bg-white/5 dark:text-[#555]",
  };

  const labels: Record<string, string> = {
    PUBLISHED: "Published",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? styles.DRAFT}`}>
      {labels[status] ?? status}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Books List Client Component
 * ───────────────────────────────────────────────────────────────────────────── */

export default function BooksListClient({ books }: BooksListClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filterStatus, setFilterStatus] = useState<FilterOption>("all");

  const filteredBooks = useMemo(() => {
    let result = [...books];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((book) =>
        (book.title ?? "Untitled").toLowerCase().includes(query)
      );
    }

    if (filterStatus !== "all") {
      result = result.filter((book) => book.status === filterStatus);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "title":
          return (a.title ?? "Untitled").localeCompare(b.title ?? "Untitled");
        case "status":
          return a.status.localeCompare(b.status);
        case "recent":
        default:
          return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
      }
    });

    return result;
  }, [books, searchQuery, sortBy, filterStatus]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <svg className="mb-4 h-12 w-12 text-[#ccc] dark:text-[#333]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <p className="text-[15px] font-medium text-[#1a1a1a] dark:text-[#ededed]">
          Your bookshelf awaits
        </p>
        <p className="mt-1 max-w-sm text-[13px] text-[#8a8a8a] dark:text-[#555]">
          Create your first book to start writing. Import an existing manuscript or start fresh.
        </p>
        <button
          onClick={() => {
            const btn = document.querySelector("[data-create-book]") as HTMLButtonElement;
            btn?.click();
          }}
          className="mt-6 rounded-lg bg-[#1a1a1a] px-5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-80 dark:bg-[#ededed] dark:text-[#0A0A0B]"
        >
          Create your first book
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#bbb] dark:text-[#444]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search books..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#e8e8e8] bg-white py-2 pl-9 pr-3 text-[13px] text-[#1a1a1a] placeholder:text-[#bbb] focus:border-[#ccc] focus:outline-none focus:ring-1 focus:ring-[#e0e0e0] dark:border-[#1e1e1e] dark:bg-[#141415] dark:text-[#ededed] dark:placeholder:text-[#444] dark:focus:border-[#333] dark:focus:ring-[#333]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterOption)}
            className="appearance-none rounded-lg border border-[#e8e8e8] bg-white py-2 pl-3 pr-8 text-[13px] font-medium text-[#4a4a4a] focus:border-[#ccc] focus:outline-none focus:ring-1 focus:ring-[#e0e0e0] dark:border-[#1e1e1e] dark:bg-[#141415] dark:text-[#999] dark:focus:border-[#333] dark:focus:ring-[#333]"
          >
            <option value="all">All status</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="appearance-none rounded-lg border border-[#e8e8e8] bg-white py-2 pl-3 pr-8 text-[13px] font-medium text-[#4a4a4a] focus:border-[#ccc] focus:outline-none focus:ring-1 focus:ring-[#e0e0e0] dark:border-[#1e1e1e] dark:bg-[#141415] dark:text-[#999] dark:focus:border-[#333] dark:focus:ring-[#333]"
          >
            <option value="recent">Recent</option>
            <option value="title">Title A-Z</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* Results count when filtering */}
      {(searchQuery || filterStatus !== "all") && (
        <p className="text-[13px] text-[#8a8a8a] dark:text-[#555]">
          {filteredBooks.length} {filteredBooks.length === 1 ? "book" : "books"} found
          {searchQuery && ` for "${searchQuery}"`}
        </p>
      )}

      {/* Books Grid */}
      {filteredBooks.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[14px] text-[#8a8a8a] dark:text-[#555]">
            No books match your search.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setFilterStatus("all");
            }}
            className="mt-3 text-[13px] font-medium text-[#1a1a1a] hover:underline dark:text-[#ededed]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredBooks.map((book) => (
            <div key={book.id} className="group relative">
              <Link href={`/author/books/${book.id}`} className="block">
                <div className="relative aspect-[220/320] w-full overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-slate-50 to-slate-100 transition-all duration-300 group-hover:scale-[1.02] dark:border-white/5 dark:from-slate-900 dark:to-slate-800">
                  {/* Cover */}
                  {book.cover_image ? (
                    <Image
                      src={book.cover_image}
                      alt={book.title ?? "Untitled"}
                      fill
                      sizes="(min-width: 1024px) 220px, (min-width: 768px) 25vw, 45vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 via-[#E29ED5]/20 to-[#FCC997]/20">
                      <svg className="h-8 w-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                  {/* Status badge */}
                  <div className="absolute left-3 top-3">
                    <StatusBadge status={book.status} />
                  </div>

                  {/* Book info */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="mb-1 line-clamp-2 text-[15px] font-semibold leading-tight text-white drop-shadow-lg">
                      {book.title || "Untitled"}
                    </h3>
                    <p className="text-[12px] text-white/70">
                      Edited {formatDate(book.updated_at)}
                    </p>
                  </div>

                  {/* Hover actions */}
                  <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <DeleteBookButton
                      bookId={book.id}
                      bookTitle={book.title}
                      label=""
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md transition-colors hover:bg-red-600/80 hover:text-white"
                    />
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
