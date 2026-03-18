"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import EmptyState, { BookIcon } from "@/components/reader/EmptyState";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import CreateBookEntry from "@/app/(app-author)/author/books/CreateBookEntry";

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

export default function LibraryWorkspace({
  books,
  initialCreateOpen = false,
}: LibraryWorkspaceProps) {
  const router = useRouter();
  const { setCurrentBookId, setContextPanelState, clearContextPanelState } = useAuthorWorkspace();
  const [items, setItems] = useState(books);
  const [query, setQuery] = useState("");
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingBookId, setSavingBookId] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState(books[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((book) => book.title.toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const selectedBook = filteredBooks.find((book) => book.id === selectedBookId) ?? filteredBooks[0] ?? null;

  const prefetchBookRoutes = (bookId: string) => {
    startTransition(() => {
      router.prefetch(`/author/write?bookId=${bookId}`);
      router.prefetch(`/author/production?bookId=${bookId}&kind=audiobook`);
      router.prefetch(`/author/audience?bookId=${bookId}&surface=beta-readers`);
      router.prefetch(`/author/analytics?bookId=${bookId}`);
    });
  };

  useEffect(() => {
    setCurrentBookId(selectedBook?.id ?? null);
    setContextPanelState(
      selectedBook
        ? {
            kind: "library-book",
            payload: {
              bookId: selectedBook.id,
              title: selectedBook.title,
              status: selectedBook.status,
              updatedAt: selectedBook.updatedAt,
            },
          }
        : null
    );
    return clearContextPanelState;
  }, [
    clearContextPanelState,
    selectedBook,
    setContextPanelState,
    setCurrentBookId,
  ]);

  const handleStartRename = (book: LibraryBook) => {
    setEditingBookId(book.id);
    setTitleDraft(book.title);
  };

  const handleSaveRename = async (bookId: string) => {
    const title = titleDraft.trim();
    if (!title) {
      setEditingBookId(null);
      return;
    }

    setSavingBookId(bookId);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("books")
      .update({ title })
      .eq("id", bookId);

    setSavingBookId(null);
    if (updateError) {
      setError("Could not rename book. Try again.");
      return;
    }

    setItems((current) =>
      current.map((book) => (book.id === bookId ? { ...book, title } : book))
    );
    setEditingBookId(null);
    router.refresh();
  };

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Library"
          title="All books"
          description="Manage every title from one place with inline edits and workflow actions."
          actions={<CreateBookEntry initialOpen={initialCreateOpen} />}
        />
      }
      main={
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search books..."
              className="min-h-[44px] w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/30 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          </div>

          {filteredBooks.length === 0 ? (
            <EmptyState
              title="No books found"
              description="Adjust the search query or create a new book."
              icon={<BookIcon className="h-10 w-10" />}
            />
          ) : (
            <div className="space-y-3">
              {filteredBooks.map((book) => {
                const isSelected = selectedBook?.id === book.id;
                return (
                  <Card
                    key={book.id}
                    className={isSelected ? "border-[#907AFF]/30 shadow-[0_0_0_1px_rgba(144,122,255,0.14)]" : undefined}
                  >
                    <CardContent className="group flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <button
                        type="button"
                        onMouseEnter={() => prefetchBookRoutes(book.id)}
                        onFocus={() => prefetchBookRoutes(book.id)}
                        onClick={() => setSelectedBookId(book.id)}
                        className="flex min-w-0 items-center gap-4 text-left"
                      >
                        <div className="relative h-16 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                          {book.coverImageUrl ? (
                            <Image
                              src={book.coverImageUrl}
                              alt={book.title}
                              fill
                              sizes="48px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {editingBookId === book.id ? (
                              <>
                                <input
                                  type="text"
                                  value={titleDraft}
                                  onChange={(event) => setTitleDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") void handleSaveRename(book.id);
                                    if (event.key === "Escape") setEditingBookId(null);
                                  }}
                                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/30 dark:border-white/10 dark:bg-white/5 dark:text-white"
                                />
                                <Button
                                  size="sm"
                                  isLoading={savingBookId === book.id}
                                  loadingText="Saving..."
                                  onClick={() => void handleSaveRename(book.id)}
                                >
                                  Save
                                </Button>
                              </>
                            ) : (
                              <>
                                <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                                  {book.title}
                                </p>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses(book.status)}`}>
                                  {book.status === "PUBLISHED" ? "Published" : "Draft"}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
                            {book.updatedAt ? `Updated ${new Date(book.updatedAt).toLocaleDateString("sv-SE")}` : "Recently created"}
                          </p>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                        <Button size="sm" variant="secondary" onClick={() => handleStartRename(book)}>
                          Rename
                        </Button>
                        <Link href={`/author/write?bookId=${book.id}`}>
                          <Button size="sm" variant="secondary">Edit</Button>
                        </Link>
                        <Link href={`/author/production?bookId=${book.id}&kind=audiobook`}>
                          <Button size="sm" variant="secondary">Generate audio</Button>
                        </Link>
                        <Link href={`/author/audience?bookId=${book.id}&surface=beta-readers`}>
                          <Button size="sm" variant="secondary">Publish</Button>
                        </Link>
                        <Link href={`/author/analytics?bookId=${book.id}`}>
                          <Button size="sm" variant="secondary">Analytics</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      }
    />
  );
}
