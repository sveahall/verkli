"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Layers,
} from "lucide-react";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";

type BookItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
  coverImageUrl: string | null;
  audiobookStatus: string | null;
  chapterCount: number;
  translationCount: number;
};

type ProductionWorkspaceProps = {
  books: BookItem[];
};

/* ─── Helpers ─── */

function formatDateShort(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
  });
}

type PipelineStep = {
  label: string;
  done: boolean;
};

function getPipelineSteps(book: BookItem): PipelineStep[] {
  return [
    { label: "Skriv", done: book.chapterCount > 0 },
    { label: "Polera", done: book.chapterCount > 3 },
    { label: "Omslag", done: !!book.coverImageUrl },
    { label: "Översätt", done: book.translationCount > 0 },
    {
      label: "Ljudbok",
      done:
        book.audiobookStatus === "ready" ||
        book.audiobookStatus === "completed",
    },
    { label: "Publicera", done: book.status === "PUBLISHED" },
  ];
}

/* ─── Sub-components ─── */

function StatusBadge({ status }: { status: string }) {
  const isPublished = status === "PUBLISHED";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isPublished
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
      }`}
    >
      {isPublished ? "Published" : "Draft"}
    </span>
  );
}

/* ─── Book card ─── */

function BookProductionCard({
  book,
  index,
}: {
  book: BookItem;
  index: number;
}) {
  const steps = getPipelineSteps(book);

  return (
    <Link
      href={`/author/books/${book.id}`}
      className="ws-enter group relative block overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-slate-200/60 transition-[box-shadow,ring-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:ring-slate-300/80 active:scale-[0.995] dark:bg-white/[0.04] dark:shadow-none dark:ring-white/[0.08] dark:hover:ring-white/[0.14]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Book info row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Cover */}
        <div className="relative h-[88px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 shadow-[0_2px_8px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] dark:from-white/[0.06] dark:to-white/[0.02] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
          {book.coverImageUrl ? (
            <Image
              src={book.coverImageUrl}
              alt=""
              fill
              sizes="50px"
              className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.05]"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <BookOpen className="h-5 w-5 text-slate-200 dark:text-white/10" />
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-900 transition-colors duration-150 group-hover:text-[#5132de] dark:text-white dark:group-hover:text-[#cfbfff]">
            {book.title}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <StatusBadge status={book.status} />
            <span className="text-slate-300 dark:text-white/15">
              &middot;
            </span>
            <span className="tabular-nums text-slate-400 dark:text-white/30">
              {book.chapterCount} kap
            </span>
            {book.updatedAt && (
              <>
                <span className="text-slate-300 dark:text-white/15">
                  &middot;
                </span>
                <span className="text-slate-400 dark:text-white/30">
                  {formatDateShort(book.updatedAt)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5 group-hover:text-[#7c5cfc] dark:text-white/15 dark:group-hover:text-[#a78bfa]" />
      </div>

      {/* Pipeline: aligned labels + segmented bar */}
      <div className="grid grid-cols-6 gap-px px-1 pb-1.5">
        {steps.map((step) => (
          <span
            key={step.label}
            className={`text-center text-[10px] font-medium ${
              step.done
                ? "text-[#6B5CE7] dark:text-[#B4A0FF]"
                : "text-slate-400/70 dark:text-white/20"
            }`}
          >
            {step.label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-px">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`h-[3px] ${
              step.done
                ? "bg-[#8E79FF] dark:bg-[#8E79FF]/80"
                : "bg-slate-100 dark:bg-white/[0.06]"
            }`}
          />
        ))}
      </div>
    </Link>
  );
}

/* ─── Empty state ─── */

function EmptyState() {
  return (
    <div className="ws-enter mx-auto max-w-md py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/[0.06]">
        <Layers className="h-7 w-7 text-slate-300 dark:text-white/20" />
      </div>
      <h2 className="mt-5 text-[20px] font-semibold text-slate-800 dark:text-white">
        Inga böcker ännu
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
        Skapa din första bok i Library för att komma igång med produktion.
      </p>
      <div className="mt-6">
        <Link
          href="/author/library?action=create-book"
          className="inline-flex items-center rounded-full bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] px-5 py-2.5 text-[14px] font-medium text-white transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.97]"
        >
          Skapa bok
        </Link>
      </div>
    </div>
  );
}

/* ─── Main workspace ─── */

export default function ProductionWorkspace({
  books,
}: ProductionWorkspaceProps) {
  void useAuthorWorkspace();

  return (
    <WorkspaceLayout
      header={
        <header>
          <h1 className="text-[17px] font-medium uppercase tracking-[0.14em] text-[#8B92A5] dark:text-white/50">
            Production
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        books.length === 0 ? (
          <EmptyState />
        ) : (
          <div>
            <div className="ws-enter mb-6">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                Välj bok att arbeta med
              </h2>
              <p className="mt-1 text-[15px] text-slate-500 dark:text-white/45">
                Öppna en bok för att skriva, redigera, översätta, generera
                ljudbok och mer.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {books.map((book, i) => (
                <BookProductionCard key={book.id} book={book} index={i} />
              ))}
            </div>
          </div>
        )
      }
    />
  );
}
