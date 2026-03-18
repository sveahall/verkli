"use client";

import Image from "next/image";
import type { BookSetupState } from "@/lib/books/setup-state";

type Book = {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: string;
  language?: string | null;
  audiobook_status?: string | null;
  print_on_demand_settings?: unknown | null;
  price_amount?: number | null;
  price_currency?: string | null;
};

type BookVersion = {
  id: string;
  language_code: string;
  status: string;
  published_at?: string | null;
};

type Props = {
  book: Book;
  bookVersions: BookVersion[];
  setupState: BookSetupState;
  onDrillIn: (panel: string) => void;
  onRerunSetup: () => void;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") {
    return (
      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[12px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
        Published
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[12px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
      Draft
    </span>
  );
}

function DashboardCard({
  title,
  children,
  action,
  onAction,
}: {
  title: string;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.06] dark:bg-[#0f1115]">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">{title}</h3>
        {action && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-[12px] font-medium text-[#907AFF] transition hover:text-[#7c6ae6]"
          >
            {action}
          </button>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function BookDashboard({ book, bookVersions, onDrillIn, onRerunSetup }: Props) {
  const publishedVersions = bookVersions.filter((v) => v.published_at);
  const languages = publishedVersions.map((v) => v.language_code);

  const audiobookStatus = book.audiobook_status ?? "none";
  const hasPod = Boolean(
    book.print_on_demand_settings &&
    typeof book.print_on_demand_settings === "object" &&
    (book.print_on_demand_settings as { enabled?: boolean }).enabled
  );

  const priceDisplay =
    book.price_amount && book.price_amount > 0
      ? `${(book.price_amount / 100).toFixed(0)} ${String(book.price_currency ?? "SEK")}`
      : "Free";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Hero */}
      <div className="flex items-start gap-6">
        <div className="h-32 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-black/10 bg-slate-50 dark:border-white/10 dark:bg-white/5">
          {book.cover_image ? (
            <Image
              src={book.cover_image}
              alt={book.title}
              width={96}
              height={128}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-[10px] text-slate-300 dark:text-white/20">No cover</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold text-slate-900 dark:text-white">{book.title}</h1>
            <StatusBadge status={book.status} />
          </div>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">
            {priceDisplay} &middot; {languages.length > 0 ? `${languages.length} language${languages.length > 1 ? "s" : ""}` : "No translations"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDrillIn("edit")}
              className="rounded-full bg-[#907AFF] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#7c6ae6]"
            >
              Edit chapters
            </button>
            <button
              type="button"
              onClick={() => onDrillIn("pricing")}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => onDrillIn("publish")}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
            >
              Publish settings
            </button>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardCard title="Translations" action="Manage" onAction={() => onDrillIn("translate")}>
          {languages.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {languages.map((lang) => (
                <span
                  key={lang}
                  className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                >
                  {lang.toUpperCase()}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-slate-400 dark:text-white/40">No translations yet</p>
          )}
        </DashboardCard>

        <DashboardCard title="Audiobook" action="Manage" onAction={() => onDrillIn("audiobook")}>
          <p className="text-[12px] text-slate-600 dark:text-white/60">
            {audiobookStatus === "published"
              ? "Published"
              : audiobookStatus === "generating"
                ? "Generating..."
                : "Not created"}
          </p>
        </DashboardCard>

        <DashboardCard title="Print on demand" action="Manage" onAction={() => onDrillIn("print")}>
          <p className="text-[12px] text-slate-600 dark:text-white/60">
            {hasPod ? "Active" : "Not enabled"}
          </p>
        </DashboardCard>

        <DashboardCard title="Cover" action="Edit" onAction={() => onDrillIn("cover")}>
          <p className="text-[12px] text-slate-600 dark:text-white/60">
            {book.cover_image ? "Cover set" : "No cover uploaded"}
          </p>
        </DashboardCard>

        <DashboardCard title="Marketing" action="Open" onAction={() => onDrillIn("market")}>
          <p className="text-[12px] text-slate-400 dark:text-white/40">Create marketing content</p>
        </DashboardCard>

        <DashboardCard title="Statistics" action="View" onAction={() => onDrillIn("statistics")}>
          <p className="text-[12px] text-slate-400 dark:text-white/40">Views, reads, and sales</p>
        </DashboardCard>
      </div>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={onRerunSetup}
          className="text-[12px] text-slate-400 transition hover:text-slate-600 dark:text-white/30 dark:hover:text-white/50"
        >
          Re-run setup wizard
        </button>
      </div>
    </div>
  );
}
