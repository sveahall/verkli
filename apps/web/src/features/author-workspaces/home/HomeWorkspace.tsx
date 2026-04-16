"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  Coins,
  Languages,
  MessageSquareText,
  Plus,
  ThumbsUp,
  Users,
  UserRoundPlus,
} from "lucide-react";
import CreateBookDialog from "@/components/books/CreateBookDialog";
import { Button } from "@/components/ui/button";
import { resolveCommandHref } from "@/features/author-shell/command-registry";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import ActivityList, {
  type ActivityListItem,
} from "@/features/author-workspaces/home/components/ActivityList";
import BooksTable, {
  type BooksTableItem,
} from "@/features/author-workspaces/home/components/BooksTable";
import CountrySalesCard from "@/features/author-workspaces/home/components/CountrySalesCard";
import StatsCard from "@/features/author-workspaces/home/components/StatsCard";
import type { DashboardStats, DashboardBook, DashboardActivity, CountrySale } from "./types";


type HomeWorkspaceProps = {
  stats: DashboardStats;
  books: DashboardBook[];
  activity: DashboardActivity[];
  countrySales: CountrySale[];
};

const ACTIVITY_HREF: Record<DashboardActivity["type"], string> = {
  translation: "/author/production",
  audiobook: "/author/production",
  publish: "/author/library",
};

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Today";

  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}


export default function HomeWorkspace({
  stats,
  books,
  activity,
  countrySales,
}: HomeWorkspaceProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { setCurrentBookId } = useAuthorWorkspace();

  const primaryBook = books[0] ?? null;

  const statCards = useMemo(
    () => [
      {
        label: "Sales",
        value: `${formatCompactNumber(stats.sales)} SEK`,
        icon: <Coins className="h-4 w-4" />,
        toneClassName: "bg-[#EEF4FF] text-[#4F74E7]",
        href: "/author/analytics/sales",
        description: "Total revenue from book sales, orders, and donations.",
      },
      {
        label: "Readers",
        value: formatCompactNumber(stats.readers),
        icon: <Users className="h-4 w-4" />,
        toneClassName: "bg-[#F2EDFF] text-[#8A72FF]",
        href: "/author/analytics/readers",
        description: "Unique readers who have started reading your books.",
      },
      {
        label: "Subscribers",
        value: stats.subscribers.toLocaleString("en"),
        icon: <UserRoundPlus className="h-4 w-4" />,
        toneClassName: "bg-[#FCEFFF] text-[#E17AD5]",
        href: "/author/analytics/subscribers",
        description: "Active subscribers following your newsletters.",
      },
      {
        label: "Comments",
        value: stats.comments.toLocaleString("en"),
        icon: <MessageSquareText className="h-4 w-4" />,
        toneClassName: "bg-[#FFF3E8] text-[#F0A75B]",
        href: "/author/analytics/comments",
        description: "Reader comments on your published books.",
      },
      {
        label: "Reviews",
        value: stats.reviews.toLocaleString("en"),
        icon: <ThumbsUp className="h-4 w-4" />,
        toneClassName: "bg-[#FFF8DB] text-[#D8B53D]",
        href: "/author/analytics/reviews",
        description: "Ratings and reviews from readers.",
      },
    ],
    [stats.comments, stats.readers, stats.reviews, stats.sales, stats.subscribers]
  );

  const activityItems: ActivityListItem[] = useMemo(
    () =>
      activity.map((item) => ({
        id: item.id,
        title: item.label,
        bookName: item.detail,
        timestamp: formatRelativeTime(item.timestamp),
        href: ACTIVITY_HREF[item.type],
      })),
    [activity]
  );

  const tableRows: BooksTableItem[] = useMemo(
    () =>
      books.map((book) => ({
        id: book.id,
        title: book.title,
        href: `/author/books/${book.id}`,
        type: "Book" as const,
        status: (book.status === "PUBLISHED"
          ? "Published"
          : "Draft") as BooksTableItem["status"],
        readers: formatCompactNumber(book.readers),
        updated: formatUpdatedAt(book.updatedAt),
      })),
    [books]
  );

  const openCreateDialog = useCallback(() => setCreateDialogOpen(true), []);
  const closeCreateDialog = useCallback(() => setCreateDialogOpen(false), []);

  useEffect(() => {
    setCurrentBookId(primaryBook?.id ?? null);
  }, [primaryBook?.id, setCurrentBookId]);

  return (
    <>
      <WorkspaceLayout
        header={
          <header>
            <h1 className="text-[17px] font-medium uppercase tracking-[0.14em] text-[#8B92A5] dark:text-white/50">
              Dashboard
            </h1>
          </header>
        }
        headerRight={<WorkspaceHeaderActions />}
        main={
          <div className="space-y-5">
            <section className="flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                aria-label="New book"
                onClick={openCreateDialog}
                className="h-10 min-h-0 rounded-full border-0 bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] px-5 text-[14px] font-medium text-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:from-[#8570FF] hover:to-[#7062FF]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New book
              </Button>

              <Link
                href={resolveCommandHref("translate-book", {
                  bookId: primaryBook?.id ?? null,
                })}
                aria-label="Translate selected book"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-medium text-[#4E5669] shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.1]"
              >
                <Languages className="h-4 w-4 text-[#7C6CFF]" aria-hidden="true" />
                Translate book
              </Link>

              <Link
                href={resolveCommandHref("generate-audiobook", {
                  bookId: primaryBook?.id ?? null,
                })}
                aria-label="Create audiobook for selected book"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-medium text-[#4E5669] shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.1]"
              >
                <AudioLines className="h-4 w-4 text-[#7C6CFF]" aria-hidden="true" />
                Create audiobook
              </Link>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              {statCards.map((stat) => (
                <StatsCard
                  key={stat.label}
                  icon={stat.icon}
                  label={stat.label}
                  value={stat.value}
                  toneClassName={stat.toneClassName}
                  href={stat.href}
                  description={stat.description}
                />
              ))}
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
              <CountrySalesCard items={countrySales} />
              <ActivityList items={activityItems} />
            </section>

            <section>
              <BooksTable items={tableRows} />
            </section>
          </div>
        }
      />

      <CreateBookDialog
        open={createDialogOpen}
        onClose={closeCreateDialog}
      />
    </>
  );
}
