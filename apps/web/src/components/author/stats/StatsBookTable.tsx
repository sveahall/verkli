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

  useEffect(() => {
    const fetchBooks = async () => {
      setLoading(true);
      try {
        // Fetch author's books with their individual stats
        const res = await fetch(`/api/author/stats/books?period=${period}`);
        if (res.ok) {
          const json = await res.json();
          setBooks(json.books ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchBooks();
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#907AFF]" />
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-slate-400 dark:text-white/40">
        No books to display
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-white/10">
            <th className="pb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">
              Book
            </th>
            <th className="pb-3 text-right text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">
              Views
            </th>
            <th className="pb-3 text-right text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">
              Reads
            </th>
            <th className="pb-3 text-right text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">
              Purchases
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {books.map((book) => (
            <tr key={book.id}>
              <td className="py-3 text-[13px] font-medium text-slate-900 dark:text-white">
                {book.title}
              </td>
              <td className="py-3 text-right text-[13px] text-slate-600 dark:text-white/60">
                {book.views}
              </td>
              <td className="py-3 text-right text-[13px] text-slate-600 dark:text-white/60">
                {book.reads}
              </td>
              <td className="py-3 text-right text-[13px] text-slate-600 dark:text-white/60">
                {book.purchases}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
