"use client";

import Link from "next/link";

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
    <div className="overflow-hidden rounded-xl border border-border/80 dark:border-border">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border/80 bg-background dark:border-border dark:bg-card">
            <th className="px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">
              Ämne
            </th>
            <th className="px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">
              Status
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground sm:table-cell">
              Skickat
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground sm:table-cell">
              Mottagare
            </th>
          </tr>
        </thead>
        <tbody>
          {newsletters.map((nl) => (
            <tr
              key={nl.id}
              className="border-b border-border last:border-0 dark:border-border"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/author/newsletters/${nl.id}`}
                  className="font-medium text-foreground hover:text-accent-foreground dark:text-foreground dark:hover:text-accent-foreground"
                >
                  {nl.subject}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    nl.status === "sent"
                      ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground"
                  }`}
                >
                  {nl.status === "sent" ? "Skickat" : "Utkast"}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground dark:text-muted-foreground sm:table-cell">
                {nl.sent_at ? formatDate(nl.sent_at) : "—"}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground dark:text-muted-foreground sm:table-cell">
                {nl.status === "sent" ? nl.recipient_count : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
