"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import EmptyState, { BookIcon } from "@/components/reader/EmptyState";

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface Book {
  id: string;
  title: string | null;
  status: string;
  updated_at: string | null;
}

interface BooksListClientProps {
  books: Book[];
}

type SortOption = "recent" | "title" | "status";
type FilterOption = "all" | "DRAFT" | "PUBLISHED";

/* ─────────────────────────────────────────────────────────────────────────────
 * Icons
 * ───────────────────────────────────────────────────────────────────────────── */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Status Badge Component
 * ───────────────────────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PUBLISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    DRAFT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    ARCHIVED: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60",
  };

  const labels: Record<string, string> = {
    PUBLISHED: "Published",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.DRAFT}`}>
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

  // Filter and sort books
  const filteredBooks = useMemo(() => {
    let result = [...books];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((book) =>
        (book.title ?? "Untitled").toLowerCase().includes(query)
      );
    }

    // Filter by status
    if (filterStatus !== "all") {
      result = result.filter((book) => book.status === filterStatus);
    }

    // Sort
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
      <EmptyState
        icon={<BookIcon />}
        title="Your bookshelf awaits"
        description="Create your first book to start writing. Import an existing manuscript or start fresh with a blank page."
        variant="centered"
        action={
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="#create"
              onClick={(e) => {
                e.preventDefault();
                // Trigger create dialog via parent - this will be improved with state management
                const btn = document.querySelector('[data-create-book]') as HTMLButtonElement;
                btn?.click();
              }}
              className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
            >
              Create your first book
            </a>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" />
          <input
            type="text"
            placeholder="Search books..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-white/10 dark:bg-white/5 dark:placeholder:text-white/40 dark:focus:border-white/30 dark:focus:ring-white/20"
          />
        </div>

        {/* Filter and Sort */}
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterOption)}
              className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/30 dark:focus:ring-white/20"
            >
              <option value="all">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-white/30 dark:focus:ring-white/20"
            >
              <option value="recent">Recent</option>
              <option value="title">Title A-Z</option>
              <option value="status">Status</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" />
          </div>
        </div>
      </div>

      {/* Results count */}
      {(searchQuery || filterStatus !== "all") && (
        <p className="text-sm text-slate-500 dark:text-white/50">
          {filteredBooks.length} {filteredBooks.length === 1 ? "book" : "books"} found
          {searchQuery && ` for "${searchQuery}"`}
        </p>
      )}

      {/* Books List */}
      {filteredBooks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 text-center dark:border-white/10 dark:bg-white/5">
          <p className="text-slate-600 dark:text-white/60">
            No books match your search.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setFilterStatus("all");
            }}
            className="mt-3 text-sm font-medium text-slate-900 hover:underline dark:text-white"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredBooks.map((book) => (
            <li
              key={book.id}
              className="group relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
            >
              <Link
                href={`/author/books/${book.id}`}
                className="flex flex-1 items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900 dark:text-white">
                    {book.title || "Untitled"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-white/50">
                    Edited {formatDate(book.updated_at)}
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-3">
                  <StatusBadge status={book.status} />
                </div>
              </Link>

              {/* Hover Actions */}
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Link
                  href={`/author/books/${book.id}`}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                  title="Edit"
                >
                  <EditIcon className="h-4 w-4" />
                </Link>
                <DeleteBookButton
                  bookId={book.id}
                  bookTitle={book.title}
                  label=""
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
