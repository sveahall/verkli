"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileEdit,
  Headphones,
  Library,
  Plus,
} from "lucide-react";
import CreateBookDialog from "@/components/books/CreateBookDialog";
import CreateBookEntry from "@/app/(app-author)/author/books/CreateBookEntry";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";

type LibraryBook = {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
  coverImageUrl: string | null;
  audiobookStatus: string | null;
};

type LibraryWorkspaceProps = {
  books: LibraryBook[];
  initialCreateOpen?: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("sv-SE");
}

/* ─── Book cover card ─── */
function BookCoverCard({ book }: { book: LibraryBook }) {
  const isPublished = book.status === "PUBLISHED";
  const hasAudiobook =
    book.audiobookStatus === "ready" || book.audiobookStatus === "completed";

  const href = isPublished
    ? `/author/library/${book.id}`
    : `/author/books/${book.id}`;

  return (
    <Link href={href} className="group block">
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
        <h3 className="truncate text-[13px] font-semibold text-slate-800 group-hover:text-[#5132de] dark:text-white/90 dark:group-hover:text-[#cfbfff]">
          {book.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/30">
          <span
            className={`font-medium ${
              isPublished
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-500 dark:text-amber-400"
            }`}
          >
            {isPublished ? "Published" : "Draft"}
          </span>
          {" \u00B7 "}
          {formatDate(book.updatedAt)}
        </p>
      </div>
    </Link>
  );
}

/* ─── Add-book placeholder ─── */
function AddBookCard({ initialOpen = false }: { initialOpen?: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(initialOpen);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="group block w-full text-left"
      >
        <div className="flex aspect-[2/3] items-center justify-center rounded-lg border border-dashed border-slate-200 transition-all duration-200 ease-out group-hover:border-[#8E79FF]/50 group-hover:bg-[#F2EDFF]/20 group-active:scale-[0.97] dark:border-white/[0.08] dark:group-hover:border-[#8E79FF]/30 dark:group-hover:bg-[#8E79FF]/5">
          <div className="text-center">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 transition-colors group-hover:bg-[#F2EDFF] dark:bg-white/[0.04] dark:group-hover:bg-[#8E79FF]/15">
              <Plus className="h-4 w-4 text-slate-300 transition-colors group-hover:text-[#8E79FF] dark:text-white/15 dark:group-hover:text-[#cfbfff]" />
            </div>
            <p className="mt-2 text-[11px] font-medium text-slate-300 transition-colors group-hover:text-[#7c5cfc] dark:text-white/20 dark:group-hover:text-[#cfbfff]">
              New book
            </p>
          </div>
        </div>
      </button>
      <CreateBookDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

export default function LibraryWorkspace({
  books,
  initialCreateOpen = false,
}: LibraryWorkspaceProps) {
  const { setCurrentBookId } = useAuthorWorkspace();
  const recentBook = books[0] ?? null;

  const publishedCount = useMemo(
    () => books.filter((b) => b.status === "PUBLISHED").length,
    [books],
  );
  const draftCount = useMemo(
    () => books.filter((b) => b.status !== "PUBLISHED").length,
    [books],
  );

  useEffect(() => {
    setCurrentBookId(recentBook?.id ?? null);
  }, [recentBook?.id, setCurrentBookId]);

  return (
    <WorkspaceLayout
      header={
        <header>
          <h1 className="text-[17px] font-medium uppercase tracking-[0.14em] text-[#8B92A5] dark:text-white/50">
            Library
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        books.length === 0 ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/[0.06]">
              <BookOpen className="h-7 w-7 text-slate-300 dark:text-white/20" />
            </div>
            <h2 className="mt-5 text-[20px] font-semibold text-slate-800 dark:text-white">
              Skapa din första bok
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
              Börja med att skapa en bok för att öppna din skrivarbetsyta.
            </p>
            <div className="mt-6 flex justify-center">
              <CreateBookEntry initialOpen={initialCreateOpen} />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Metric strip */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 sm:gap-3 sm:px-5 sm:py-4 dark:bg-white/[0.04]">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7c5cfc]/10 sm:h-9 sm:w-9">
                  <Library className="h-4 w-4 text-[#7c5cfc]" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums leading-none text-slate-900 sm:text-[22px] dark:text-white">
                    {books.length}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400 sm:text-[11px] dark:text-white/35">
                    {books.length === 1 ? "Book" : "Books"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 sm:gap-3 sm:px-5 sm:py-4 dark:bg-white/[0.04]">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 sm:h-9 sm:w-9">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums leading-none text-slate-900 sm:text-[22px] dark:text-white">
                    {publishedCount}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400 sm:text-[11px] dark:text-white/35">
                    Published
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 sm:gap-3 sm:px-5 sm:py-4 dark:bg-white/[0.04]">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 sm:h-9 sm:w-9">
                  <FileEdit className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-lg font-bold tabular-nums leading-none text-slate-900 sm:text-[22px] dark:text-white">
                    {draftCount}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400 sm:text-[11px] dark:text-white/35">
                    {draftCount === 1 ? "Draft" : "Drafts"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bookshelf surface */}
            <div className="rounded-2xl bg-white px-4 py-5 sm:px-7 sm:py-7 dark:bg-white/[0.04]">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] items-start gap-x-4 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(130px,170px))] sm:gap-x-5 sm:gap-y-7">
                {books.map((book) => (
                  <BookCoverCard key={book.id} book={book} />
                ))}
                <AddBookCard initialOpen={initialCreateOpen} />
              </div>
            </div>
          </div>
        )
      }
    />
  );
}
