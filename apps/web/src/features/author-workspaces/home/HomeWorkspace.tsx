"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const TIME_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "this-month", label: "This month" },
];

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

  return new Date(dateStr).toLocaleDateString("sv-SE");
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Today";

  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(value).toLocaleDateString("sv-SE");
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function DashboardFilter({
  ariaLabel,
  name,
  options,
}: {
  ariaLabel: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(options[0]?.value ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === selected)?.label ?? "";

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 min-w-[132px] items-center justify-between gap-2 rounded-full bg-white px-4 text-[14px] font-normal text-[#5C6375] outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-[#907AFF]/20 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/[0.1]"
      >
        <span>{selectedLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M5 7.5 10 12.5 15 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white py-1 shadow-lg shadow-black/[0.08] dark:border-white/10 dark:bg-[#111827]">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setSelected(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center px-4 py-2.5 text-[14px] transition ${
                option.value === selected
                  ? "bg-[#F2EDFF] font-medium text-[#7C6CFF] dark:bg-[#7C6CFF]/15"
                  : "text-[#5C6375] hover:bg-slate-50 dark:text-white/60 dark:hover:bg-white/[0.06]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
        growth: "34%",
        value: `€${formatCompactNumber(stats.sales)}`,
        icon: <Coins className="h-4 w-4" />,
        toneClassName: "bg-[#EEF4FF] text-[#4F74E7]",
        href: "/author/analytics/sales",
        description: "Totala intäkter från bokförsäljning, inklusive ordrar och donationer.",
      },
      {
        label: "Readers",
        growth: "25%",
        value: formatCompactNumber(stats.readers),
        icon: <Users className="h-4 w-4" />,
        toneClassName: "bg-[#F2EDFF] text-[#8A72FF]",
        href: "/author/analytics/readers",
        description: "Antal unika läsare som har börjat läsa dina böcker.",
      },
      {
        label: "Subscribers",
        growth: "17%",
        value: stats.subscribers.toLocaleString("en"),
        icon: <UserRoundPlus className="h-4 w-4" />,
        toneClassName: "bg-[#FCEFFF] text-[#E17AD5]",
        href: "/author/analytics/subscribers",
        description: "Aktiva prenumeranter som följer dina nyhetsbrev.",
      },
      {
        label: "Comments",
        growth: "19%",
        value: stats.comments.toLocaleString("en"),
        icon: <MessageSquareText className="h-4 w-4" />,
        toneClassName: "bg-[#FFF3E8] text-[#F0A75B]",
        href: "/author/analytics/comments",
        description: "Kommentarer från läsare på dina publicerade böcker.",
      },
      {
        label: "Reviews",
        growth: "9%",
        value: stats.reviews.toLocaleString("en"),
        icon: <ThumbsUp className="h-4 w-4" />,
        toneClassName: "bg-[#FFF8DB] text-[#D8B53D]",
        href: "/author/analytics/reviews",
        description: "Recensioner och betyg från läsare på dina böcker.",
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

  const bookFilterOptions = useMemo(
    () => [
      { value: "all", label: "All books" },
      ...books.map((book) => ({
        value: book.id,
        label: book.title || "Untitled",
      })),
    ],
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
            <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-3 sm:gap-4">
                <DashboardFilter
                  ariaLabel="Filter books"
                  name="books-filter"
                  options={bookFilterOptions}
                />
                <DashboardFilter
                  ariaLabel="Filter time range"
                  name="time-filter"
                  options={TIME_FILTER_OPTIONS}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  aria-label="Create new book"
                  onClick={openCreateDialog}
                  className="h-10 min-h-0 rounded-full border-0 bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] px-5 text-[14px] font-medium text-white hover:from-[#8570FF] hover:to-[#7062FF]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create new book
                </Button>

                <Link
                  href={resolveCommandHref("translate-book", {
                    bookId: primaryBook?.id ?? null,
                  })}
                  aria-label="Translate selected book"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-medium text-[#4E5669] transition hover:bg-slate-50 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.1]"
                >
                  <Languages className="h-4 w-4 text-[#7C6CFF]" aria-hidden="true" />
                  Translate book
                </Link>

                <Link
                  href={resolveCommandHref("generate-audiobook", {
                    bookId: primaryBook?.id ?? null,
                  })}
                  aria-label="Create audiobook for selected book"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-medium text-[#4E5669] transition hover:bg-slate-50 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.1]"
                >
                  <AudioLines className="h-4 w-4 text-[#7C6CFF]" aria-hidden="true" />
                  Create audiobook
                </Link>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              {statCards.map((stat) => (
                <StatsCard
                  key={stat.label}
                  icon={stat.icon}
                  label={stat.label}
                  growth={stat.growth}
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
