"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Headphones,
  Plus,
  PenLine,
} from "lucide-react";
import CreateBookDialog from "@/components/books/CreateBookDialog";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { useAuthorLocale } from "@/lib/author-locale";

/* ─── Types ─── */

type LibraryBook = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt: string | null;
  coverImageUrl: string | null;
  audiobookStatus: string | null;
  chapterCount: number;
  translationCount: number;
};

type LibraryWorkspaceProps = {
  books: LibraryBook[];
  initialCreateOpen?: boolean;
};

/* ─── Pipeline ─── */

const PIPELINE_STEPS = [
  { label: "Write",     panel: null },
  { label: "Cover",     panel: "cover" },
  { label: "Audio",     panel: "audiobook" },
  { label: "Translate", panel: "translate" },
  { label: "Publish",   panel: "publish" },
  { label: "Review",    panel: "review" },
] as const;

function getPipelineDone(book: LibraryBook): boolean[] {
  return [
    book.chapterCount > 0,
    !!book.coverImageUrl,
    book.audiobookStatus === "ready" || book.audiobookStatus === "completed",
    book.translationCount > 0,
    book.status === "PUBLISHED",
    book.status === "PUBLISHED",
  ];
}

function getNextPanel(book: LibraryBook): string {
  const done = getPipelineDone(book);
  const firstIncomplete = done.findIndex((d) => !d);
  if (firstIncomplete === -1) return "review";
  return PIPELINE_STEPS[firstIncomplete].panel ?? "";
}

function getBookHref(book: LibraryBook): string {
  const panel = getNextPanel(book);
  return panel ? `/author/books/${book.id}?panel=${panel}` : `/author/books/${book.id}`;
}

/* ─── Helpers ─── */

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ─── Book cover card ─── */

function BookCoverCard({ book }: { book: LibraryBook }) {
  const isPublished = book.status === "PUBLISHED";
  const hasAudiobook =
    book.audiobookStatus === "ready" || book.audiobookStatus === "completed";

  const href = getBookHref(book);
  const pipelineDone = getPipelineDone(book);
  const doneCount = pipelineDone.filter(Boolean).length;
  const secondaryInfo =
    book.chapterCount > 0
      ? `${book.chapterCount} ch`
      : formatDate(book.updatedAt);

  return (
    <div className="group">
      <Link href={href} className="block">
        {/* Cover */}
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.07),0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-1 group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.12),0_16px_40px_rgba(0,0,0,0.10)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.35)] dark:group-hover:shadow-[0_10px_32px_rgba(0,0,0,0.55)]">
          {book.coverImageUrl ? (
            <Image
              src={book.coverImageUrl}
              alt=""
              fill
              sizes="200px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50 dark:from-white/[0.06] dark:to-white/[0.02]">
              <BookOpen className="h-7 w-7 text-slate-200 dark:text-white/10" />
            </div>
          )}

          {/* Audio badge */}
          {hasAudiobook && (
            <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow-sm dark:bg-black/70">
              <Headphones className="h-3 w-3 text-violet-600 dark:text-violet-400" />
            </div>
          )}

          {/* Delete — on hover */}
          <div
            className="absolute left-2 top-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            onClick={(e) => e.preventDefault()}
          >
            <DeleteBookButton
              bookId={book.id}
              bookTitle={book.title}
              label=""
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-slate-400 shadow-sm transition hover:bg-red-50 hover:text-red-500 dark:bg-black/70 dark:text-white/40 dark:hover:bg-red-950/80 dark:hover:text-red-400"
            />
          </div>

          {/* Status pill overlay — bottom */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 pb-2.5 pt-6">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isPublished
                  ? "bg-emerald-500/90 text-white"
                  : "bg-black/40 text-white/80"
              }`}
            >
              {isPublished && (
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
              )}
              {isPublished ? "Published" : "Draft"}
            </span>
          </div>
        </div>

        {/* Text below cover */}
        <div className="mt-3">
          <h3 className="truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] text-slate-800 transition-colors duration-150 group-hover:text-[#5132de] dark:text-white/90 dark:group-hover:text-[#cfbfff]">
            {book.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/30">
            {secondaryInfo}
          </p>

          {/* Pipeline dots */}
          <div
            className="mt-2 flex items-center gap-[3px]"
            title={`${doneCount}/6 steps complete`}
          >
            {pipelineDone.map((done, i) => (
              <span
                key={i}
                className={`block h-[3px] w-[3px] rounded-full transition-colors ${
                  done ? "bg-[#907AFF]" : "bg-slate-200 dark:bg-white/10"
                }`}
              />
            ))}
            <span className="ml-1 text-[10px] text-slate-300 dark:text-white/20">
              {doneCount}/6
            </span>
          </div>
        </div>
      </Link>

      {/* Reader link */}
      {isPublished && (
        <a
          href={`/reader/books/${book.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-violet-500 transition-colors hover:text-violet-700 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
        >
          View as reader ↗
        </a>
      )}
    </div>
  );
}

/* ─── Add-book card ─── */

function AddBookCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group w-full text-left">
      <div className="flex aspect-[2/3] bg-white flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200/80 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:border-[#907AFF]/40 group-hover:bg-[#907AFF]/[0.04] group-active:scale-[0.97] dark:border-white/[0.10] dark:group-hover:border-[#907AFF]/30 dark:group-hover:bg-[#907AFF]/[0.06]">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80 transition-all duration-200 group-hover:bg-[#907AFF]/[0.12] dark:bg-white/[0.04] dark:group-hover:bg-[#907AFF]/[0.15]">
          <Plus className="h-4 w-4 text-slate-400 transition-colors group-hover:text-[#907AFF] dark:text-white/25 dark:group-hover:text-[#cfbfff]" />
        </div>
        <span className="text-[12px] font-medium text-slate-400 transition-colors group-hover:text-[#907AFF] dark:text-white/30 dark:group-hover:text-[#cfbfff]">
          New book
        </span>
      </div>
      <div className="mt-3 h-[13px]" /> {/* height spacer matching card text area */}
    </button>
  );
}

/* ─── Empty state ─── */

function EmptyState({ onOpen }: { onOpen: () => void }) {
  const t = useAuthorLocale();
  return (
    <div className="flex flex-col items-center py-20 text-center">
      {/* Atmospheric glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-3xl bg-[#907AFF]/10 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-[#907AFF]/15 bg-white shadow-sm dark:bg-white/[0.04]">
          <PenLine className="h-9 w-9 text-[#907AFF]/60" />
        </div>
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight text-slate-800 dark:text-white">
        {t("library.emptyTitle")}
      </h2>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-slate-400 dark:text-white/45">
        {t("library.emptyBody")}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm shadow-[#0F172A]/25 transition-all hover:bg-[#1E293B] active:scale-[0.97]"
      >
        <Plus className="h-3.5 w-3.5" />
        Write your first book
      </button>
    </div>
  );
}

/* ─── Main component ─── */

export default function LibraryWorkspace({
  books,
  initialCreateOpen = false,
}: LibraryWorkspaceProps) {
  const { setCurrentBookId } = useAuthorWorkspace();
  const t = useAuthorLocale();
  const recentBook = books[0] ?? null;
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);

  useEffect(() => {
    setCurrentBookId(recentBook?.id ?? null);
  }, [recentBook?.id, setCurrentBookId]);

  const openCreate = () => setCreateOpen(true);
  const closeCreate = () => setCreateOpen(false);

  const totalChapters = books.reduce((sum, b) => sum + b.chapterCount, 0);

  return (
    <>
      <WorkspaceLayout
        header={
          <header>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {t("library.title")}
            </h1>
            <p className="mt-0.5 text-[13px] text-slate-400 dark:text-white/40">
              {books.length > 0
                ? `${books.length} ${books.length === 1 ? "book" : "books"}${totalChapters > 0 ? ` · ${totalChapters} chapters` : ""}`
                : t("library.subtitle")}
            </p>
          </header>
        }
        headerRight={<WorkspaceHeaderActions />}
        main={
          books.length === 0 ? (
            <EmptyState onOpen={openCreate} />
          ) : (
            <div>
              {/* ── Continue editing banner ── */}
              {recentBook && (
                <Link
                  href={getBookHref(recentBook)}
                  className="ws-enter group mb-7 flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[#907AFF]/30 hover:shadow-[0_8px_22px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-[#907AFF]/25"
                  style={{ animationDelay: "0ms" }}
                >
                  {recentBook.coverImageUrl ? (
                    <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded-md shadow-md">
                      <Image
                        src={recentBook.coverImageUrl}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md bg-[#907AFF]/10">
                      <BookOpen className="h-4 w-4 text-[#907AFF]/60" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium tracking-[0.02em] text-[#6D7386] dark:text-white/55">
                      Continue editing
                    </p>
                    <p className="truncate text-[14px] font-medium text-slate-900 dark:text-white">
                      {recentBook.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/40">
                      Last updated {formatDate(recentBook.updatedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#907AFF] dark:text-white/30" />
                </Link>
              )}

              {/* ── Book grid ── */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] items-start gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(168px,210px))] sm:gap-x-5 sm:gap-y-8">
                <div
                  className="ws-enter"
                  style={{ animationDelay: "40ms" }}
                >
                  <AddBookCard onOpen={openCreate} />
                </div>
                {books.map((book, i) => (
                  <div
                    key={book.id}
                    className="ws-enter"
                    style={{ animationDelay: `${(i + 1) * 55 + 40}ms` }}
                  >
                    <BookCoverCard book={book} />
                  </div>
                ))}
              </div>
            </div>
          )
        }
      />

      <CreateBookDialog open={createOpen} onClose={closeCreate} />
    </>
  );
}
