"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";

type NewsletterItem = {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
};

type NewsletterListProps = {
  newsletters: NewsletterItem[];
};

export default function NewsletterList({ newsletters }: NewsletterListProps) {
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (newsletters.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-white/10">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200/80 bg-slate-50 dark:border-white/10 dark:bg-white/5">
            <th className="px-4 py-3 font-medium text-slate-500 dark:text-white/50">
              Ämne
            </th>
            <th className="px-4 py-3 font-medium text-slate-500 dark:text-white/50">
              Status
            </th>
            <th className="hidden px-4 py-3 font-medium text-slate-500 dark:text-white/50 sm:table-cell">
              Skickat
            </th>
            <th className="hidden px-4 py-3 font-medium text-slate-500 dark:text-white/50 sm:table-cell">
              Mottagare
            </th>
          </tr>
        </thead>
        <tbody>
          {newsletters.map((nl) => (
            <tr
              key={nl.id}
              className="border-b border-slate-100 last:border-0 dark:border-white/5"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/author/newsletters/${nl.id}`}
                  className="font-medium text-slate-900 hover:text-[#907AFF] dark:text-white dark:hover:text-[#907AFF]"
                >
                  {nl.subject}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    nl.status === "sent"
                      ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                      : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50"
                  }`}
                >
                  {nl.status === "sent" ? "Skickat" : "Utkast"}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-slate-500 dark:text-white/50 sm:table-cell">
                {nl.sent_at ? formatDate(nl.sent_at) : "—"}
              </td>
              <td className="hidden px-4 py-3 text-slate-500 dark:text-white/50 sm:table-cell">
                {nl.status === "sent" ? nl.recipient_count : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
