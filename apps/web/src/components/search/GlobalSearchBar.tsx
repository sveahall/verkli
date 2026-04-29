"use client";

// Global search bar for the reader topbar (Phase 0.5).
//
// - Debounced 250ms after last keystroke.
// - Autocomplete dropdown showing top 6 books + 4 authors.
// - Pressing Enter navigates to /reader/discover?q=... for the full results page.
// - Closing on outside click + Escape.
//
// Server-side search is in `/api/search`, backed by tsvector + GIN indexes
// added in 20260429150000_search_fts.sql.

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

type BookHit = {
  kind: "book";
  id: string;
  title: string;
  cover: string | null;
  authorId: string | null;
  language: string | null;
};
type AuthorHit = {
  kind: "author";
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};
type Hit = BookHit | AuthorHit;

const DEBOUNCE_MS = 250;

export default function GlobalSearchBar({ placeholder = "Search books, authors…" }: { placeholder?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reqIdRef = useRef(0);

  const fetchHits = useCallback(async (query: string) => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const myReq = ++reqIdRef.current;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=all&limit=10`);
      if (!res.ok) return;
      const json = (await res.json()) as { hits?: Hit[] };
      // Drop result if a newer request has been issued in the meantime.
      if (myReq !== reqIdRef.current) return;
      setHits(json.hits ?? []);
    } catch {
      if (myReq !== reqIdRef.current) return;
      setHits([]);
    }
  }, []);

  useEffect(() => {
    if (!value.trim()) return;
    const handle = setTimeout(() => {
      void fetchHits(value);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, fetchHits]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    startTransition(() => {
      router.push(`/reader/discover?q=${encodeURIComponent(value.trim())}`);
    });
    setOpen(false);
  }

  const grouped = useMemo(() => {
    const books = hits.filter((h): h is BookHit => h.kind === "book").slice(0, 6);
    const authors = hits.filter((h): h is AuthorHit => h.kind === "author").slice(0, 4);
    return { books, authors };
  }, [hits]);

  const hasResults = grouped.books.length > 0 || grouped.authors.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <form onSubmit={onSubmit}>
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setOpen(true)}
          aria-label="Search Verkli"
          className="w-full rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </form>

      {open && value.trim() && hasResults ? (
        <div className="absolute left-0 right-0 z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-lg">
          {grouped.books.length > 0 ? (
            <Section title="Books">
              {grouped.books.map((h) => (
                <Link
                  key={`book-${h.id}`}
                  href={`/reader/books/${h.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted/40"
                >
                  {h.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.cover} alt="" className="h-10 w-7 rounded-sm object-cover" />
                  ) : (
                    <div className="h-10 w-7 rounded-sm bg-muted" />
                  )}
                  <span className="line-clamp-1 flex-1">{h.title}</span>
                  {h.language ? (
                    <span className="text-[10px] font-mono uppercase text-muted-foreground">
                      {h.language}
                    </span>
                  ) : null}
                </Link>
              ))}
            </Section>
          ) : null}

          {grouped.authors.length > 0 ? (
            <Section title="Authors">
              {grouped.authors.map((h) => (
                <Link
                  key={`author-${h.id}`}
                  href={`/reader/authors/${h.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted/40"
                >
                  {h.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted" />
                  )}
                  <span className="line-clamp-1 flex-1">
                    {h.displayName ?? h.username ?? "Unnamed"}
                  </span>
                  {h.username ? (
                    <span className="text-xs text-muted-foreground">@{h.username}</span>
                  ) : null}
                </Link>
              ))}
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 px-1 py-1">
      <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
