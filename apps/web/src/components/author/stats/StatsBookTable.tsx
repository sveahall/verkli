"use client";

import { useState, useEffect } from "react";

type BookStat = {
  id: string;
  title: string;
  views: number;
  reads: number;
  purchases: number;
};

type StatsBookTableProps = {
  period: string;
};

export default function StatsBookTable({ period }: StatsBookTableProps) {
  const [books, setBooks] = useState<BookStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const fetchBooks = async () => {
      setLoading(true);
      try {
        // Fetch author's books with their individual stats
        const res = await fetch(`/api/author/stats/books?period=${period}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Book statistics unavailable");
        const json = await res.json();
        if (json.partial) throw new Error("Book statistics incomplete");
        if (controller.signal.aborted) return;
        setBooks(json.books ?? []);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchBooks();
    return () => controller.abort();
  }, [period, retry]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[#907AFF]" />
      </div>
    );
  }

  if (failed) {
    return (
      <div role="alert" className="py-4 text-sm text-muted-foreground">
        <p>Book statistics unavailable. Your purchase counts have not been loaded.</p>
        <button type="button" className="btn-secondary mt-3 min-h-11" onClick={() => setRetry((value) => value + 1)}>Retry book statistics</button>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground dark:text-muted-foreground">
        No books to display
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border/80 dark:border-border">
            <th className="pb-3 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
              Book
            </th>
            <th className="pb-3 text-right text-[12px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
              Views
            </th>
            <th className="pb-3 text-right text-[12px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
              Reads
            </th>
            <th className="pb-3 text-right text-[12px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
              Purchases
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border dark:divide-border">
          {books.map((book) => (
            <tr key={book.id}>
              <td className="py-3 text-[13px] font-medium text-foreground dark:text-foreground">
                {book.title}
              </td>
              <td className="py-3 text-right text-[13px] text-muted-foreground dark:text-muted-foreground">
                {book.views}
              </td>
              <td className="py-3 text-right text-[13px] text-muted-foreground dark:text-muted-foreground">
                {book.reads}
              </td>
              <td className="py-3 text-right text-[13px] text-muted-foreground dark:text-muted-foreground">
                {book.purchases}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
