"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  Headphones,
  PenLine,
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
};

type ProductionWorkspaceProps = {
  books: BookItem[];
};

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const isPublished = status === "PUBLISHED";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        isPublished
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/40"
      }`}
    >
      {isPublished ? "Published" : "Draft"}
    </span>
  );
}

function AudiobookBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
      <Headphones className="h-3 w-3" />
      Audiobook
    </span>
  );
}

function BookCard({ book }: { book: BookItem }) {
  const hasAudiobook = book.audiobookStatus === "ready" || book.audiobookStatus === "completed";

  return (
    <Link
      href={`/author/books/${book.id}`}
      className="group flex gap-4 rounded-xl border border-slate-200/70 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/[0.14]"
    >
      {/* Cover */}
      <div className="h-[88px] w-[60px] shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-white/[0.06]">
        {book.coverImageUrl ? (
          <Image
            src={book.coverImageUrl}
            alt=""
            width={60}
            height={88}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <BookOpen className="h-5 w-5 text-slate-300 dark:text-white/20" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <h3 className="truncate text-[15px] font-semibold text-slate-900 group-hover:text-[#5132de] dark:text-white dark:group-hover:text-[#cfbfff]">
            {book.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={book.status} />
            {hasAudiobook && <AudiobookBadge />}
          </div>
        </div>
        {book.updatedAt && (
          <p className="text-[12px] text-slate-400 dark:text-white/30">
            Uppdaterad {formatDate(book.updatedAt)}
          </p>
        )}
      </div>

      {/* Arrow */}
      <div className="flex shrink-0 items-center">
        <PenLine className="h-4 w-4 text-slate-300 transition-colors group-hover:text-[#7c5cfc] dark:text-white/15 dark:group-hover:text-[#a78bfa]" />
      </div>
    </Link>
  );
}

export default function ProductionWorkspace({ books }: ProductionWorkspaceProps) {
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
        <div>
          {/* Intro */}
          <div className="mb-8">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
              Välj bok att arbeta med
            </h2>
            <p className="mt-1 text-[15px] text-slate-500 dark:text-white/45">
              Öppna en bok för att skriva, redigera, översätta, generera ljudbok och mer.
            </p>
          </div>

          {books.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-white/10 dark:bg-white/[0.02]">
              <BookOpen className="mx-auto h-8 w-8 text-slate-300 dark:text-white/20" />
              <h3 className="mt-4 text-[16px] font-semibold text-slate-700 dark:text-white/70">
                Inga böcker ännu
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-white/40">
                Skapa din första bok i Library för att komma igång.
              </p>
              <Link
                href="/author/library?action=create-book"
                className="mt-5 inline-flex items-center rounded-full bg-gradient-to-r from-[#8E79FF] to-[#7A6EFF] px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90"
              >
                Skapa bok
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {books.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
