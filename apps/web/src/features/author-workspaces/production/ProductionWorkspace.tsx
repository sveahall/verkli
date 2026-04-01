"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  Layers,
} from "lucide-react";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import DeleteBookButton from "@/components/books/DeleteBookButton";

type BookItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
  coverImageUrl: string | null;
  audiobookStatus: string | null;
  chapterCount: number;
  translationCount: number;
  authorDisplayName?: string;
};

type ProductionWorkspaceProps = {
  books: BookItem[];
};

/* ─── Pipeline ─── */

const PIPELINE_STEPS = [
  { label: "Write",     panel: "edit" },
  { label: "Cover",     panel: "cover" },
  { label: "Audio",     panel: "audiobook" },
  { label: "Translate", panel: "translate" },
  { label: "Publish",   panel: "publish" },
  { label: "Review",    panel: "review" },
] as const;

function getPipelineDone(book: BookItem): boolean[] {
  return [
    book.chapterCount > 0,
    !!book.coverImageUrl,
    book.audiobookStatus === "ready" || book.audiobookStatus === "completed",
    book.translationCount > 0,
    book.status === "PUBLISHED",
    book.status === "PUBLISHED",
  ];
}

function getNextPanel(book: BookItem): string {
  const done = getPipelineDone(book);
  const firstIncomplete = done.findIndex((d) => !d);
  if (firstIncomplete === -1) return "review";
  return PIPELINE_STEPS[firstIncomplete].panel;
}

/* ─── Book card ─── */

function BookProductionCard({ book }: { book: BookItem }) {
  const done = getPipelineDone(book);
  const isPublished = book.status === "PUBLISHED";
  const nextPanel = getNextPanel(book);
  const href = `/author/books/${book.id}?panel=${nextPanel}`;

  return (
    <div className="group relative rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-150 ease-out hover:border-black/[0.08] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] active:scale-[0.99] dark:border-white/[0.06] dark:bg-[#111318] dark:hover:border-white/[0.10]">
      {/* Trash — top-right corner, stops link propagation */}
      <div className="absolute right-7 top-5 z-10" onClick={(e) => e.preventDefault()}>
        <DeleteBookButton
          bookId={book.id}
          bookTitle={book.title}
          label=""
          className="p-1 text-slate-300 transition-colors hover:text-slate-500 dark:text-white/15 dark:hover:text-white/40"
        />
      </div>

      <Link href={href} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-5">
        {/* Cover + Title row on mobile */}
        <div className="flex items-center gap-4 sm:contents">
          {/* Cover */}
          <div className="relative h-[80px] w-[56px] shrink-0 overflow-hidden rounded-lg bg-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:h-[100px] sm:w-[70px] dark:bg-white/[0.04]">
            {book.coverImageUrl ? (
              <Image src={book.coverImageUrl} alt="" fill sizes="70px" className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full items-center justify-center">
                <BookOpen className="h-5 w-5 text-slate-300 dark:text-white/10" />
              </div>
            )}
          </div>

          {/* Title + author + badge */}
          <div className="min-w-0 flex-1 sm:w-[200px] sm:flex-initial sm:shrink-0">
            <h3 className="truncate text-[15px] font-semibold text-slate-900 sm:text-base dark:text-white">
              {book.title}
            </h3>
            {book.authorDisplayName && (
              <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-white/45">
                {book.authorDisplayName}
              </p>
            )}
            <div className="mt-2 inline-flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  isPublished
                    ? "border-emerald-200 text-emerald-600 dark:border-emerald-800/30 dark:text-emerald-400"
                    : "border-slate-200 text-slate-500 dark:border-white/10 dark:text-white/40"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isPublished ? "bg-emerald-500" : "bg-[#907AFF]"}`} />
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex min-w-0 flex-1 flex-col items-start sm:items-center sm:justify-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400 sm:mb-8 dark:text-white/25">
            Progress
          </p>
          <div className="flex gap-4 sm:gap-7">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center gap-1.5">
                <span
                  className={`text-[10px] font-medium leading-none sm:text-[11px] ${
                    done[i] ? "text-slate-600 dark:text-white/60" : "text-slate-300 dark:text-white/15"
                  }`}
                >
                  {step.label}
                </span>
                <span
                  className={`block h-2 w-2 rounded-full sm:h-[10px] sm:w-[10px] ${
                    done[i] ? "bg-[#907AFF]" : "bg-slate-200 dark:bg-white/10"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Continue */}
        <div className="shrink-0 self-start sm:self-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 ease-out group-hover:border-[#907AFF]/30 group-hover:text-[#907AFF] dark:border-white/10 dark:text-white/50 dark:group-hover:border-[#907AFF]/30 dark:group-hover:text-[#907AFF]">
            Continue editing
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 transition-colors group-hover:border-[#907AFF]/40 dark:border-white/20">
              <ChevronRight className="h-3 w-3" />
            </span>
          </span>
        </div>
      </Link>
    </div>
  );
}

/* ─── Empty state ─── */

function EmptyState() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/[0.06]">
        <Layers className="h-7 w-7 text-slate-300 dark:text-white/20" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-slate-800 dark:text-white">
        Inga böcker ännu
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-white/45">
        Skapa din första bok i Library för att komma igång med produktion.
      </p>
      <div className="mt-6">
        <Link
          href="/author/library?action=create-book"
          className="inline-flex items-center rounded-full bg-[#907AFF] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#7a67f2]"
        >
          Skapa bok
        </Link>
      </div>
    </div>
  );
}

/* ─── Main ─── */

export default function ProductionWorkspace({ books }: ProductionWorkspaceProps) {
  void useAuthorWorkspace();

  return (
    <WorkspaceLayout
      header={
        <header>
          <h1 className="text-base font-medium uppercase tracking-widest text-slate-400 dark:text-white/50">
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
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Välj bok att arbeta med
              </h2>
              <p className="mt-2 text-base text-slate-500 dark:text-white/45">
                Öppna en bok för att skriva, redigera, översätta, generera ljudbok och mer.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {books.map((book) => (
                <BookProductionCard key={book.id} book={book} />
              ))}
            </div>
          </div>
        )
      }
    />
  );
}
