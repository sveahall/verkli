"use client";

import { useEffect, useState } from "react";

type BookRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  author_id: string;
  author_name: string;
  language: string;
  created_at: string;
};

export default function AdminBooksPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadBooks = async (pageNum = 1) => {
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum) });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/books?${params}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        setError(res.status === 403 ? "Access denied." : "Could not load books.");
        return;
      }

      const json = await res.json();
      setBooks(json.books ?? []);
      setTotal(json.total ?? 0);
      setPage(pageNum);
      setLoaded(true);
    } catch {
      setError("Could not load books.");
    } finally {
      setLoading(false);
    }
  };

  const deleteBook = async (bookId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

    setDeletingId(bookId);
    try {
      const res = await fetch("/api/admin/books", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookId }),
      });

      if (res.ok) {
        setBooks((prev) => prev.filter((b) => b.id !== bookId));
        setTotal((prev) => prev - 1);
      }
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    void loadBooks(1);
    // Initial load only; subsequent loads are user-driven search/pagination actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-white">
        Book Moderation
      </h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-white/50">
        Browse and remove books that violate content policy.
      </p>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadBooks(1)}
            placeholder="Search by title..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none dark:border-white/20 dark:bg-black/20 dark:text-white"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/20 dark:bg-black/20 dark:text-white"
          >
            <option value="">All statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
          </select>
          <button
            type="button"
            onClick={() => loadBooks(1)}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {!loaded ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-600 dark:border-white/20 dark:text-white/60">
          Loading books...
        </div>
      ) : books.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm dark:border-white/10 dark:bg-white/[0.02] dark:text-white/60">
          No books found.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500 dark:text-white/50">
            {total} book{total !== 1 ? "s" : ""} total
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 dark:border-white/10 dark:text-white/60">
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Author</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Language</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-slate-100 dark:border-white/5"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">
                      {b.title}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-white/70">
                      {b.author_name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.status === "PUBLISHED"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/50">
                      {b.language || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/50">
                      {new Date(b.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={deletingId === b.id}
                        onClick={() => deleteBook(b.id, b.title)}
                        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === b.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 50 && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => loadBooks(page - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/10"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-slate-500">
                Page {page}
              </span>
              <button
                type="button"
                disabled={page * 50 >= total}
                onClick={() => loadBooks(page + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/10"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
