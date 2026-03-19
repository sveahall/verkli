"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import CreateBookEntry from "@/app/(app-author)/author/books/CreateBookEntry";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import { WorkspaceSurface } from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";

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

function statusClasses(status: string) {
  if (status === "PUBLISHED") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  }
  return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Recently created";
  return `Updated ${new Date(value).toLocaleDateString("sv-SE")}`;
}

export default function LibraryWorkspace({
  books,
  initialCreateOpen = false,
}: LibraryWorkspaceProps) {
  const { setCurrentBookId } = useAuthorWorkspace();
  const recentBook = books[0] ?? null;
  const visibleBooks = useMemo(() => books, [books]);

  useEffect(() => {
    setCurrentBookId(recentBook?.id ?? null);
  }, [recentBook?.id, setCurrentBookId]);

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Library"
          title="Your books"
          description="Continue the current manuscript, then open any book from the library."
          actions={<CreateBookEntry initialOpen={initialCreateOpen} />}
        />
      }
      main={
        books.length === 0 ? (
          <WorkspaceSurface className="p-8 text-center sm:p-10">
            <p className="text-eyebrow">Library</p>
            <h2 className="mt-4 text-[30px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Start your first book
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
              Create a book to open the writing workspace.
            </p>
            <div className="mt-8 flex justify-center">
              <CreateBookEntry initialOpen={initialCreateOpen} />
            </div>
          </WorkspaceSurface>
        ) : (
          <div className="space-y-10">
            {recentBook ? (
              <section>
                <WorkspaceSurface className="p-6 sm:p-8">
                  <p className="text-eyebrow">Continue writing</p>
                  <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-[32px] font-semibold tracking-tight text-slate-900 dark:text-white">
                        {recentBook.title}
                      </h2>
                      <p className="mt-2 text-[15px] text-slate-500 dark:text-white/45">
                        {formatUpdatedAt(recentBook.updatedAt)}
                      </p>
                    </div>
                    <Link href={`/author/books/${recentBook.id}`}>
                      <Button size="lg">Open workspace</Button>
                    </Link>
                  </div>
                </WorkspaceSurface>
              </section>
            ) : null}

            <section>
              <div>
                <div>
                  <p className="text-eyebrow">Your books</p>
                  <h2 className="mt-2 text-section-title">Library</h2>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleBooks.map((book) => (
                  <div
                    key={book.id}
                    className="rounded-2xl border border-slate-200/80 p-4 dark:border-white/10"
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 dark:border-white/10 dark:bg-white/[0.04]">
                        {book.coverImageUrl ? (
                          <Image
                            src={book.coverImageUrl}
                            alt={book.title}
                            fill
                            sizes="64px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                          {book.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses(book.status)}`}
                          >
                            {book.status === "PUBLISHED" ? "Published" : "Draft"}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-500 dark:text-white/45">
                          {formatUpdatedAt(book.updatedAt)}
                        </p>
                        <div className="mt-5">
                          <Link href={`/author/books/${book.id}`}>
                            <Button size="sm" variant="secondary">
                              Open
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )
      }
    />
  );
}
