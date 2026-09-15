"use client";

import { useEffect, useRef, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import AuthorAppShell from "@/features/author-shell/AuthorAppShell";
import LibraryWorkspace from "@/features/author-workspaces/library/LibraryWorkspace";
import type { LibraryBook } from "@/features/author-workspaces/library/library-model";

const SAMPLE_BOOKS: LibraryBook[] = [
  {
    id: "library-ferry",
    title: "Den sista färjan",
    description: "A quiet town. A final crossing. Some goodbyes change everything.",
    status: "DRAFT",
    updatedAt: "2026-09-13T12:00:00.000Z",
    coverImageUrl: "/demo-assets/covers/01.jpg",
    audiobookStatus: null,
    chapterCount: 6,
    translationCount: 0,
  },
  {
    id: "library-another",
    title: "Another day, another slay",
    description: "Small victories, unexpected friendships, and a fresh start.",
    status: "DRAFT",
    updatedAt: "2026-09-10T12:00:00.000Z",
    coverImageUrl: "/demo-assets/covers/02.jpg",
    audiobookStatus: "ready",
    chapterCount: 4,
    translationCount: 1,
  },
  {
    id: "library-light",
    title: "The Light We Keep",
    description: "A story about the people who help us find our way home.",
    status: "PUBLISHED",
    updatedAt: "2026-08-14T12:00:00.000Z",
    coverImageUrl: "/demo-assets/covers/03.jpg",
    audiobookStatus: "ready",
    chapterCount: 12,
    translationCount: 2,
  },
];

const STRESS_BOOKS: LibraryBook[] = [
  {
    id: "library-archive",
    title: "The extraordinarily long title of an unfinished journey across a thousand islands, with an epilogue about finding a place to call home",
    description: null,
    status: "ARCHIVED",
    updatedAt: null,
    coverImageUrl: null,
    audiobookStatus: null,
    chapterCount: 0,
    translationCount: 0,
  },
  {
    id: "library-unknown",
    title: "An unfamiliar status",
    description: "A very long description that should remain readable without pushing the library beyond the screen. ".repeat(10),
    status: "UNRECOGNIZED",
    updatedAt: "invalid-date",
    coverImageUrl: null,
    audiobookStatus: "processing",
    chapterCount: 125,
    translationCount: 8,
  },
];

const EMPTY_BOOKS: LibraryBook[] = [];
const PREVIEW_MESSAGE = "Local preview only. No books are created, imported, deleted, or saved.";
type PreviewData = "sample" | "empty" | "stress";

/** Real library and shell, with synthetic data and no API mutations. */
export default function LibraryPreview() {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<PreviewData>("sample");
  const [demoRouting, setDemoRouting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState("");
  const books = data === "sample" ? SAMPLE_BOOKS : data === "stress" ? STRESS_BOOKS : EMPTY_BOOKS;
  const booksRef = useRef(books);

  useEffect(() => {
    booksRef.current = books;
    window.dispatchEvent(new CustomEvent("author-shell:refresh-books"));
  }, [books]);

  useEffect(() => {
    const originalFetch = window.fetch;
    // Install before mounting the real shell/forms, including Supabase reads.
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        setBlockedMessage(PREVIEW_MESSAGE);
        return Response.json({ error: "PREVIEW_ONLY", message: PREVIEW_MESSAGE }, { status: 403 });
      }
      if (url.pathname === "/api/books/imports") return Response.json({ imports: [] });
      if (url.pathname === "/api/notifications/unread-count") return Response.json({ count: 0 });
      if (url.pathname === "/api/notifications") return Response.json({ notifications: [], total: 0 });
      if (url.pathname === "/rest/v1/books") {
        return Response.json(booksRef.current.map((book) => ({
          id: book.id, title: book.title, status: book.status, updated_at: book.updatedAt,
        })));
      }
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) {
        return Response.json({ error: "PREVIEW_ONLY", message: PREVIEW_MESSAGE }, { status: 403 });
      }
      return originalFetch(input, init);
    };
    // The unchanged shell also contains a native POST form in development.
    const preventNativeWrite = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement) || event.target.method.toLowerCase() === "get") return;
      event.preventDefault();
      setBlockedMessage(PREVIEW_MESSAGE);
    };
    document.addEventListener("submit", preventNativeWrite, true);
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    return () => {
      window.clearTimeout(readyTimer);
      window.fetch = originalFetch;
      document.removeEventListener("submit", preventNativeWrite, true);
    };
  }, []);

  return (
    <>
      <section aria-label="Local library preview controls" className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex min-h-11 items-center gap-2">
            Preview data
            <select
              value={data}
              onChange={(event) => { setData(event.target.value as PreviewData); setBlockedMessage(""); }}
              className="min-h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="sample">Sample library</option>
              <option value="empty">Empty library</option>
              <option value="stress">Stress library</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={demoRouting} onChange={(event) => setDemoRouting(event.target.checked)} />
            Demo routing
          </label>
          <p>Synthetic data · {PREVIEW_MESSAGE}</p>
        </div>
        {blockedMessage && <p role="status" className="pb-1 text-foreground">{blockedMessage}</p>}
      </section>
      {ready ? (
        <NextIntlClientProvider locale="en" messages={messages}>
          <AuthorAppShell>
            <LibraryWorkspace key={data} books={books} demoModeActive={demoRouting} />
          </AuthorAppShell>
        </NextIntlClientProvider>
      ) : <p role="status" className="p-6 text-sm text-muted-foreground">Preparing local library…</p>}
    </>
  );
}
