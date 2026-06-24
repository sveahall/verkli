"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type BookRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  author_id: string;
  author_name: string;
  language: string;
  created_at: string;
  // Returned by the list API once it selects cover_image (see report).
  cover_image?: string | null;
};

const PAGE_SIZE = 50;

function statusBadgeVariant(status: string): BadgeProps["variant"] {
  switch (status.toUpperCase()) {
    case "PUBLISHED":
      return "success";
    case "DRAFT":
      return "warning";
    default:
      return "neutral";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminBooksPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BookRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id: bookId, title } = pendingDelete;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/books", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookId }),
      });

      if (!res.ok) {
        // Surface the actual status — never optimistically remove a row that
        // the DB still holds (masks permission/RLS errors).
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const detail =
          body && typeof body.error === "string"
            ? body.error
            : `Delete failed (${res.status})`;
        setError(`Could not delete “${title}”: ${detail}`);
        return;
      }

      setBooks((prev) => prev.filter((b) => b.id !== bookId));
      setTotal((prev) => prev - 1);
      setPendingDelete(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not delete “${title}”: ${err.message}`
          : `Could not delete “${title}”.`
      );
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    void loadBooks(1);
    // Initial load only; subsequent loads are user-driven search/pagination actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Admin", href: "/admin" }, { label: "Books" }]}
      />
      <PageHeader
        eyebrow="Moderation"
        title="Books"
        description="Browse books, review their content, and remove anything that violates content policy."
      />

      <Card className="mt-8 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <SearchInput
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadBooks(1)}
              placeholder="Search by title…"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="status-filter"
              className="text-xs font-medium text-slate-500 dark:text-white/50"
            >
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white dark:focus:border-white/25 dark:focus:ring-white/15"
            >
              <option value="">All statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <Button
            type="button"
            onClick={() => loadBooks(1)}
            isLoading={loading}
            loadingText="Searching…"
          >
            Search
          </Button>
        </div>
      </Card>

      {error && (
        <ErrorState
          className="mt-6"
          title="Something went wrong"
          description={error}
        />
      )}

      <div className="mt-6">
        {!loaded ? (
          <LoadingState title="Loading books…" />
        ) : books.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" aria-hidden />}
            title="No books found"
            description="Try a different search term or status filter."
          />
        ) : (
          <>
            <p className="text-caption mb-3 tabular-nums text-slate-500 dark:text-white/50">
              {total} book{total !== 1 ? "s" : ""} total
            </p>
            <Card className="overflow-hidden p-0">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {books.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {b.cover_image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Supabase storage host, plain <img> matches existing cover usage.
                            <img
                              src={b.cover_image}
                              alt=""
                              className="h-12 w-8 shrink-0 rounded-md border border-slate-200/80 object-cover dark:border-white/10"
                            />
                          ) : (
                            <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-gradient-to-br from-[#907AFF]/20 via-[#E29ED5]/20 to-[#FCC997]/20 dark:border-white/10">
                              <BookOpen
                                className="h-3.5 w-3.5 text-slate-400 dark:text-white/40"
                                aria-hidden
                              />
                            </div>
                          )}
                          <Link
                            href={`/admin/books/${b.id}`}
                            className="min-w-0 truncate rounded-md font-medium text-slate-800 transition-colors hover:text-[var(--brand-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:text-white"
                          >
                            {b.title}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>{b.author_name}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(b.status)}>{b.status}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {b.language ? b.language.toUpperCase() : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(b.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/books/${b.id}`}
                            className="inline-flex min-h-[36px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            View
                          </Link>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setPendingDelete(b)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {total > PAGE_SIZE && (
              <div className="mt-4 flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => loadBooks(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-caption px-2 tabular-nums text-slate-500 dark:text-white/50">
                  Page {page}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page * PAGE_SIZE >= total}
                  onClick={() => loadBooks(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete book?</DialogTitle>
          <DialogDescription>
            {pendingDelete
              ? `“${pendingDelete.title}” and all of its chapters, audio, and related data will be permanently removed. This cannot be undone.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPendingDelete(null)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={confirmDelete}
            isLoading={deleting}
            loadingText="Deleting…"
          >
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
