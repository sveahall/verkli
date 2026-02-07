"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type BookListItem = {
  id: string;
  title: string | null;
  status: string | null;
  updated_at?: string | null;
};

const sortOptions = [
  { value: "recent", label: "Most recent" },
  { value: "title", label: "Title" },
];

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export default function BookListClient({ books }: { books: BookListItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let result = books;

    if (normalizedQuery) {
      result = result.filter((book) => (book.title ?? "Untitled").toLowerCase().includes(normalizedQuery));
    }

    if (status !== "all") {
      result = result.filter((book) => String(book.status ?? "").toLowerCase() === status);
    }

    if (sort === "title") {
      result = [...result].sort((a, b) => (a.title ?? "Untitled").localeCompare(b.title ?? "Untitled"));
    } else {
      result = [...result].sort((a, b) => {
        const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bDate - aDate;
      });
    }

    return result;
  }, [books, query, status, sort]);

  const handleScrollToCreate = () => {
    const target = document.getElementById("create-book");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="space-y-2">
            <label htmlFor="book-search" className="text-[13px] font-medium text-slate-600 dark:text-white/60">
              Search
            </label>
            <Input
              id="book-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="book-status" className="text-[13px] font-medium text-slate-600 dark:text-white/60">
              Status
            </label>
            <Select id="book-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="book-sort" className="text-[13px] font-medium text-slate-600 dark:text-white/60">
              Sort
            </label>
            <Select id="book-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No books yet"
          description="Create a book to start writing and translating."
          action={<Button onClick={handleScrollToCreate}>Create your first book</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((book) => {
            const statusLabel = book.status?.toUpperCase() === "PUBLISHED" ? "Published" : "Draft";
            const statusClass =
              book.status?.toUpperCase() === "PUBLISHED"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60";

            const updatedLabel = book.updated_at
              ? new Intl.DateTimeFormat("en", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }).format(new Date(book.updated_at))
              : "";

            return (
              <li key={book.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Link
                        href={`/author/books/${book.id}`}
                        className="text-[16px] font-semibold text-slate-900 transition hover:text-slate-700 dark:text-white dark:hover:text-white/80"
                      >
                        {book.title || "Untitled"}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-500 dark:text-white/50">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                          {statusLabel}
                        </span>
                        {updatedLabel && <span>Updated {updatedLabel}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/author/books/${book.id}`} className="btn-secondary text-[13px]">
                        Open
                      </Link>
                      <DeleteBookButton
                        bookId={book.id}
                        bookTitle={book.title}
                        label="Delete"
                        size="sm"
                        className="text-[13px] text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200"
                      />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
