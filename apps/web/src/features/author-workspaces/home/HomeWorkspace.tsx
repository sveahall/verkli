"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  ArrowUpRight,
  BookOpen,
  Coins,
  Languages,
  MessageSquareText,
  Plus,
  ThumbsUp,
  Users,
  UserRoundPlus,
} from "lucide-react";
import CreateBookDialog from "@/components/books/CreateBookDialog";
import AgentTeam from "@/features/ai-team/AgentTeam";
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
        value: `${formatCompactNumber(stats.sales)} ${stats.salesCurrency ?? "SEK"}`,
        icon: <Coins className="h-4 w-4" />,
        toneClassName: "bg-[#907AFF]/10 text-accent-foreground",
        href: "/author/analytics/sales",
        // Narrowed from "book sales, orders, and donations": this card counts
        // paid book orders only, and so does the sales drill-down it links to.
        // Donations and subscription MRR live in the analytics workspace, which
        // reads /api/author/stats/revenue. A label promising more than the
        // number covers is how two "revenue" figures end up disagreeing.
        description: "Revenue from paid book orders.",
      },
      {
        label: "Readers",
        value: formatCompactNumber(stats.readers),
        icon: <Users className="h-4 w-4" />,
        toneClassName: "bg-[#907AFF]/10 text-accent-foreground",
        href: "/author/analytics/readers",
        description: "Unique readers who have started reading your books.",
      },
      {
        label: "Subscribers",
        value: stats.subscribers.toLocaleString("en"),
        icon: <UserRoundPlus className="h-4 w-4" />,
        toneClassName: "bg-[#E29ED5]/15 text-[#99578c] dark:text-[#E29ED5]",
        href: "/author/analytics/subscribers",
        description: "Active subscribers following your newsletters.",
      },
      {
        label: "Comments",
        value: stats.comments.toLocaleString("en"),
        icon: <MessageSquareText className="h-4 w-4" />,
        toneClassName: "bg-[#FCC997]/20 text-[#a2672c] dark:text-[#FCC997]",
        href: "/author/analytics/comments",
        description: "Reader comments on your published books.",
      },
      {
        label: "Reviews",
        value: stats.reviews.toLocaleString("en"),
        icon: <ThumbsUp className="h-4 w-4" />,
        toneClassName: "bg-[#E29ED5]/15 text-[#99578c] dark:text-[#E29ED5]",
        href: "/author/analytics/reviews",
        description: "Ratings and reviews from readers.",
      },
    ],
    [stats.comments, stats.readers, stats.reviews, stats.sales, stats.salesCurrency, stats.subscribers]
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
            <h1 className="author-page-title">
              Dashboard
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Your stories, readers and next chapter.</p>
          </header>
        }
        headerRight={<WorkspaceHeaderActions />}
        main={
          <div className="space-y-6">
            <section className="flex flex-col gap-6 rounded-[22px] border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7" aria-label="Continue your story">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><BookOpen className="h-5 w-5" aria-hidden="true" /></div>
                <div className="min-w-0">
                  <p className="text-xs text-accent-foreground">{primaryBook ? "Continue your story" : "Your author studio"}</p>
                  <h2 className="mt-2 break-words font-display text-2xl font-normal leading-snug tracking-tight sm:text-[28px]">{primaryBook?.title ?? "Make room for your first story"}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{primaryBook ? `Last edited ${formatUpdatedAt(primaryBook.updatedAt).toLowerCase()}. Your manuscript and publishing tools are together.` : "Start with a new book or import a manuscript. Your writing, publishing and reader activity come together here."}</p>
                </div>
              </div>
              {primaryBook ? <Link href={`/author/books/${primaryBook.id}`} className="inline-flex min-h-11 shrink-0 items-center justify-between gap-5 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Open editor <ArrowUpRight size={17} aria-hidden="true" /></Link>
                : <Button onClick={openCreateDialog} className="min-h-11 shrink-0 rounded-full">Start your first book <Plus size={17} aria-hidden="true" /></Button>}
            </section>
            <section className="flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                aria-label="New book"
                onClick={openCreateDialog}
                className="h-11 min-h-11 rounded-full border-0 bg-primary px-5 text-[14px] font-medium text-primary-foreground shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New book
              </Button>

              <Link
                href={resolveCommandHref("translate-book", {
                  bookId: primaryBook?.id ?? null,
                })}
                aria-label={primaryBook ? `Translate ${primaryBook.title}` : "Choose a book to translate"}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-[14px] font-medium text-muted-foreground shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition hover:bg-background dark:bg-card dark:text-foreground dark:hover:bg-accent"
              >
                <Languages className="h-4 w-4 text-accent-foreground" aria-hidden="true" />
                Translate book
              </Link>

              <Link
                href={resolveCommandHref("generate-audiobook", {
                  bookId: primaryBook?.id ?? null,
                })}
                aria-label={primaryBook ? `Create audiobook for ${primaryBook.title}` : "Choose a book for an audiobook"}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-[14px] font-medium text-muted-foreground shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition hover:bg-background dark:bg-card dark:text-foreground dark:hover:bg-accent"
              >
                <AudioLines className="h-4 w-4 text-accent-foreground" aria-hidden="true" />
                Create audiobook
              </Link>
            </section>

            <AgentTeam workspace bookId={primaryBook?.id} bookTitle={primaryBook?.title} onCreateBook={openCreateDialog} />

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-medium tracking-tight">Your books</h2>
                <Link href="/author/library" className="inline-flex min-h-11 items-center gap-2 text-sm text-accent-foreground hover:underline">Open library <ArrowUpRight size={15} aria-hidden="true" /></Link>
              </div>
              <BooksTable items={tableRows} />
            </section>

            <section aria-label="Reader activity" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
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
