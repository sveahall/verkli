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
import { useTranslations } from "next-intl";

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
  /** When true the investor-pitch demo façade is active. Book cards must
   * land on the demo flow (Cover → Production → Distribute), never on the
   * real next-incomplete panel like audiobook/translate. */
  demoModeActive?: boolean;
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

function getBookHref(book: LibraryBook, demoModeActive = false): string {
  // Demo mode: the sidebar/stepper is reduced to Cover → Production →
  // Distribute. Always land on the first demo step regardless of pipeline
  // completion, so the investor never sees the legacy AudiobookPanel.
  if (demoModeActive) return `/author/books/${book.id}?panel=cover`;
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

function BookCoverCard({
  book,
  demoModeActive,
}: {
  book: LibraryBook;
  demoModeActive: boolean;
}) {
  const isPublished = book.status === "PUBLISHED";
  const hasAudiobook =
    book.audiobookStatus === "ready" || book.audiobookStatus === "completed";

  const href = getBookHref(book, demoModeActive);
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
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted dark:from-white/[0.06] dark:to-white/[0.02]">
              <BookOpen className="h-7 w-7 text-muted-foreground dark:text-muted-foreground" />
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
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-muted-foreground shadow-sm transition hover:bg-red-50 hover:text-red-500 dark:bg-black/70 dark:text-muted-foreground dark:hover:bg-red-950/80 dark:hover:text-red-400"
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
                <span className="h-1.5 w-1.5 rounded-full bg-card" aria-hidden />
              )}
              {isPublished ? "Published" : "Draft"}
            </span>
          </div>
        </div>

        {/* Text below cover */}
        <div className="mt-3">
          <h3 className="truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground transition-colors duration-150 group-hover:text-accent-foreground dark:text-foreground dark:group-hover:text-accent-foreground">
            {book.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-muted-foreground">
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
                  done ? "bg-[#907AFF]" : "bg-muted dark:bg-card"
                }`}
              />
            ))}
            <span className="ml-1 text-[10px] text-muted-foreground dark:text-muted-foreground">
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
    <button type="button" onClick={onOpen} className="group w-full rounded-xl text-left">
      <div className="flex aspect-[2/3] bg-card flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:border-[#907AFF]/40 group-hover:bg-[#907AFF]/[0.04] group-active:scale-[0.97] dark:border-border dark:group-hover:border-[#907AFF]/30 dark:group-hover:bg-[#907AFF]/[0.06]">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/80 transition-all duration-200 group-hover:bg-[#907AFF]/[0.12] dark:bg-card dark:group-hover:bg-[#907AFF]/[0.15]">
          <Plus className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent-foreground dark:text-muted-foreground dark:group-hover:text-accent-foreground" />
        </div>
        <span className="text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-accent-foreground dark:text-muted-foreground dark:group-hover:text-accent-foreground">
          New book
        </span>
      </div>
      <div className="mt-3 h-[13px]" /> {/* height spacer matching card text area */}
    </button>
  );
}

/* ─── Empty state ─── */

function EmptyState({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("author.library");
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-16 text-center sm:py-20">
      <div className="relative mb-6">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#907AFF]/15 bg-[#907AFF]/5">
          <PenLine className="h-7 w-7 text-accent-foreground" />
        </div>
      </div>
      <h2 className="author-section-title text-[20px] font-medium tracking-tight text-foreground dark:text-foreground">
        {t("emptyTitle")}
      </h2>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted-foreground dark:text-muted-foreground">
        {t("emptyBody")}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground shadow-sm shadow-[#0F172A]/25 transition-all hover:bg-primary/90 active:scale-[0.97]"
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
  demoModeActive = false,
}: LibraryWorkspaceProps) {
  const { setCurrentBookId } = useAuthorWorkspace();
  const t = useTranslations("author.library");
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
            <h1 className="author-page-title text-foreground">
              {t("title")}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground dark:text-muted-foreground">
              {books.length > 0
                ? `${books.length} ${books.length === 1 ? "book" : "books"}${totalChapters > 0 ? ` · ${totalChapters} chapters` : ""}`
                : t("subtitle")}
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
                  href={getBookHref(recentBook, demoModeActive)}
                  className="ws-enter group mb-7 flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[#907AFF]/30 hover:shadow-[0_8px_22px_rgba(15,23,42,0.08)] dark:border-border dark:bg-card dark:hover:border-[#907AFF]/25"
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
                      <BookOpen className="h-4 w-4 text-accent-foreground/60" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground dark:text-muted-foreground">
                      Continue editing
                    </p>
                    <p className="truncate text-[14px] font-medium text-foreground dark:text-foreground">
                      {recentBook.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-muted-foreground">
                      Last updated {formatDate(recentBook.updatedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent-foreground dark:text-muted-foreground" />
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
                    <BookCoverCard book={book} demoModeActive={demoModeActive} />
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
