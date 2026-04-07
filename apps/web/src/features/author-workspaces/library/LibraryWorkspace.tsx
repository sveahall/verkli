"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Headphones,
  Plus,
} from "lucide-react";
import CreateBookDialog from "@/components/books/CreateBookDialog";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { useAuthorLocale } from "@/lib/author-locale";

type LibraryBook = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt: string | null;
  coverImageUrl: string | null;
  audiobookStatus: string | null;
  chapterCount: number;
};

type LibraryWorkspaceProps = {
  books: LibraryBook[];
  initialCreateOpen?: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* ─── Book cover card ─── */
function BookCoverCard({ book }: { book: LibraryBook }) {
  const isPublished = book.status === "PUBLISHED";
  const hasAudiobook =
    book.audiobookStatus === "ready" || book.audiobookStatus === "completed";

  const href = `/author/books/${book.id}`;
  const secondaryInfo = book.chapterCount > 0
    ? `${book.chapterCount} ${book.chapterCount === 1 ? "ch" : "ch"}`
    : formatDate(book.updatedAt);

  return (
    <div className="group">
      <Link href={href} className="block">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.1),0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] dark:group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
          {book.coverImageUrl ? (
            <Image
              src={book.coverImageUrl}
              alt=""
              fill
              sizes="180px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50 dark:from-white/[0.06] dark:to-white/[0.02]">
              <BookOpen className="h-6 w-6 text-slate-200 dark:text-white/10" />
            </div>
          )}
          {hasAudiobook && (
            <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow-sm dark:bg-black/60">
              <Headphones className="h-2.5 w-2.5 text-violet-600 dark:text-violet-400" />
            </div>
          )}
          {/* Delete — appears on hover */}
          <div className="absolute left-1.5 top-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100" onClick={(e) => e.preventDefault()}>
            <DeleteBookButton
              bookId={book.id}
              bookTitle={book.title}
              label=""
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm transition hover:bg-red-50 hover:text-red-500 dark:bg-black/60 dark:text-white/40 dark:hover:bg-red-950/80 dark:hover:text-red-400"
            />
          </div>
        </div>
        <div className="mt-2">
          <h3 className="truncate text-[14px] font-semibold text-slate-800 group-hover:text-[#5132de] dark:text-white/90 dark:group-hover:text-[#cfbfff]">
            {book.title}
          </h3>
          {book.description && (
            <p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.45] text-slate-400 dark:text-white/30">
              {book.description}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400 dark:text-white/30">
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                isPublished
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-400 dark:text-white/40"
              }`}
            >
              {isPublished && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden />
              )}
              {isPublished ? "Published" : "Draft"}
            </span>
            {" \u00B7 "}
            {secondaryInfo}
          </p>
        </div>
      </Link>
      {isPublished && (
        <a
          href={`/reader/books/${book.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-[11px] text-violet-600 transition-colors hover:text-violet-700 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
        >
          View as reader ↗
        </a>
      )}
    </div>
  );
}

/* ─── Add-book placeholder ─── */
function AddBookCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full text-left"
    >
      <div className="flex aspect-[2/3] items-center justify-center rounded-lg border border-dashed border-slate-300 transition-all duration-200 ease-out group-hover:border-[#8E79FF]/50 group-hover:bg-[#F2EDFF]/20 group-active:scale-[0.97] dark:border-white/[0.12] dark:group-hover:border-[#8E79FF]/30 dark:group-hover:bg-[#8E79FF]/5">
        <div className="text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 transition-colors group-hover:bg-[#F2EDFF] dark:bg-white/[0.04] dark:group-hover:bg-[#8E79FF]/15">
            <Plus className="h-4 w-4 text-slate-400 transition-colors group-hover:text-[#8E79FF] dark:text-white/25 dark:group-hover:text-[#cfbfff]" />
          </div>
          <p className="mt-2 text-[12px] font-medium text-slate-400 transition-colors group-hover:text-[#7c5cfc] dark:text-white/30 dark:group-hover:text-[#cfbfff]">
            New book
          </p>
        </div>
      </div>
    </button>
  );
}

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
                ? `${books.length} ${books.length === 1 ? "book" : "books"}`
                : t("library.subtitle")}
            </p>
          </header>
        }
        headerRight={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#907AFF] to-[#7C6CFF] px-4 py-2 text-[13px] font-medium text-white shadow-sm shadow-[#907AFF]/20 transition-all hover:opacity-90 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" />
              New book
            </button>
            <WorkspaceHeaderActions />
          </div>
        }
        main={
          books.length === 0 ? (
            <div className="mx-auto max-w-md py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/[0.06]">
                <BookOpen className="h-7 w-7 text-slate-300 dark:text-white/20" />
              </div>
              <h2 className="mt-5 text-[20px] font-semibold text-slate-800 dark:text-white">
                {t("library.emptyTitle")}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
                {t("library.emptyBody")}
              </p>
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
                  New book
                </button>
              </div>
            </div>
          ) : (
            /* Bookshelf surface — Create card always first */
            <div className="rounded-2xl bg-white px-4 py-5 sm:px-7 sm:py-7 dark:bg-white/[0.04]">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] items-start gap-x-4 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(130px,170px))] sm:gap-x-5 sm:gap-y-7">
                <AddBookCard onOpen={openCreate} />
                {books.map((book) => (
                  <BookCoverCard key={book.id} book={book} />
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
