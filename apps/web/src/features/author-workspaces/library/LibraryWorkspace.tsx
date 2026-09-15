"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, FileText, Globe, Headphones, LayoutGrid, List, MoreHorizontal, PenLine, Plus, Search, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import CreateBookDialog from "@/components/books/CreateBookDialog";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import NotificationBell from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import { filterAndSortBooks, formatLibraryDate, getBookHref, getPipelineDone, getStatusLabel, type LibraryBook, type LibraryFilter, type LibrarySort } from "./library-model";
import styles from "./LibraryWorkspace.module.css";

type LibraryWorkspaceProps = {
  books: LibraryBook[];
  initialCreateOpen?: boolean;
  demoModeActive?: boolean;
};

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

function editedLabel(value: string | null) {
  const date = formatLibraryDate(value);
  return date === "Date unavailable" ? "Last edit unavailable" : `Edited ${date}`;
}

function BookCover({ book, priority = false }: { book: LibraryBook; priority?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return book.coverImageUrl && failedUrl !== book.coverImageUrl ? (
    <Image src={book.coverImageUrl} alt="" fill sizes="(max-width: 640px) 80vw, (max-width: 1100px) 40vw, 280px"
      className={styles.coverImage} priority={priority} onError={() => setFailedUrl(book.coverImageUrl)} />
  ) : (
    <div className={styles.coverFallback}>
      <BookOpen size={28} aria-hidden="true" />
      <span>{book.title}</span>
      <small>{book.coverImageUrl ? "Cover unavailable" : "Cover not added yet"}</small>
    </div>
  );
}

function BookProgress({ book }: { book: LibraryBook }) {
  const done = getPipelineDone(book).filter(Boolean).length;
  return (
    <div className={styles.progress}>
      <div className={styles.progressTrack} role="progressbar" aria-label={`Workflow steps for ${book.title}`} aria-valuemin={0} aria-valuemax={6} aria-valuenow={done}>
        <span style={{ width: `${done / 6 * 100}%` }} />
      </div>
      <span>{done} of 6 steps</span>
    </div>
  );
}

function BookActions({ book, href }: { book: LibraryBook; href: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("dialog")) return;
      if (ref.current && !ref.current.contains(event.target)) ref.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]") || !ref.current?.open) return;
      ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return (
    <details ref={ref} className={styles.bookActions}>
      <summary role="button" aria-label={`Book actions for ${book.title}`}><MoreHorizontal size={20} aria-hidden="true" /></summary>
      <div className={styles.actionPopover}>
        <Link href={href}><PenLine size={16} aria-hidden="true" /> Open editor</Link>
        {book.status === "PUBLISHED" && <a href={`/reader/books/${book.id}`} target="_blank" rel="noopener noreferrer"><BookOpen size={16} aria-hidden="true" /> View as reader ↗</a>}
        <DeleteBookButton bookId={book.id} bookTitle={book.title} className={styles.deleteButton} />
      </div>
    </details>
  );
}

function BookCard({ book, demoModeActive }: { book: LibraryBook; demoModeActive: boolean }) {
  const href = getBookHref(book, demoModeActive);
  const audioReady = book.audiobookStatus === "ready" || book.audiobookStatus === "completed";
  return (
    <article className={styles.bookCard} data-book-id={book.id}>
      <Link href={href} className={styles.cardLink} aria-label={`Open ${book.title}`}>
        <div className={styles.cardCover}>
          <BookCover book={book} />
          <span className={styles.status} data-status={book.status}>{getStatusLabel(book.status)}</span>
        </div>
        <div className={styles.cardBody}>
          <h3 title={book.title}>{book.title}</h3>
          <p className={styles.chapterCount}>{book.chapterCount} {book.chapterCount === 1 ? "chapter" : "chapters"}{audioReady && <span><Headphones size={13} aria-hidden="true" /> Audio ready</span>}</p>
          <p className={styles.description}>{book.description?.trim() || "Every story starts somewhere. Add a description in your book’s publishing details."}</p>
          <BookProgress book={book} />
          <p className={styles.edited}><CalendarDays size={15} aria-hidden="true" />{editedLabel(book.updatedAt)}</p>
        </div>
      </Link>
      <BookActions book={book} href={href} />
    </article>
  );
}

function AddBookCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={styles.addBook} onClick={onOpen} aria-label="Create book">
      <span className={styles.addIcon}><Plus size={28} aria-hidden="true" /></span>
      <strong>New book</strong>
      <span>Start a new story, a new idea,<br />a new adventure.</span>
      <span className={styles.addCta}><Plus size={16} aria-hidden="true" /> Create book</span>
    </button>
  );
}

function LibraryCompanion({ books, demoModeActive, onCreate }: { books: LibraryBook[]; demoModeActive: boolean; onCreate: () => void }) {
  const activeBooks = books.filter(book => book.status !== "ARCHIVED");
  const published = activeBooks.filter(book => book.status === "PUBLISHED").length;
  const recent = filterAndSortBooks(books.filter(book => book.updatedAt && Number.isFinite(Date.parse(book.updatedAt))), "", "ALL", "recent").slice(0, 4);
  const percent = activeBooks.length ? Math.round(published / activeBooks.length * 100) : 0;
  return (
    <aside className={styles.companion} aria-label="Library overview">
      <section className={styles.sideCard}>
        <h2>Recently updated</h2>
        {recent.length ? <ul className={styles.activityList}>{recent.map(book => (
          <li key={book.id}>
            <span className={styles.activityIcon}><PenLine size={17} aria-hidden="true" /></span>
            <div><Link href={getBookHref(book, demoModeActive)} title={book.title}>{book.title}</Link><time dateTime={book.updatedAt!}>{formatLibraryDate(book.updatedAt)}</time></div>
          </li>
        ))}</ul> : <p className={styles.sideCopy}>Your books will appear here as your library grows.</p>}
      </section>
      <section className={styles.sideCard}>
        <h2>Your publishing journey</h2>
        <div className={styles.journey}>
          <svg viewBox="0 0 80 80" role="img" aria-label={`${published} of ${activeBooks.length} active books published`}>
            <circle cx="40" cy="40" r="33" className={styles.ringTrack} />
            <circle cx="40" cy="40" r="33" pathLength="100" strokeDasharray={`${percent} 100`} className={styles.ringValue} />
            <text x="40" y="45" textAnchor="middle">{percent}%</text>
          </svg>
          <div><strong>{published} <span>/ {activeBooks.length}</span></strong><p>active books published</p></div>
        </div>
        <p className={styles.sideCopy}>{published ? "Your stories are ready for readers." : "Every chapter brings you a little closer."}</p>
      </section>
      <section className={`${styles.sideCard} ${styles.inspiration}`}>
        <Sparkles size={22} className={styles.sparkle} aria-hidden="true" />
        <h2>Make room for your next idea.</h2>
        <p className={styles.sideCopy}>A character, a place, a first line. Give the story on your mind a place to begin.</p>
        <button type="button" onClick={onCreate}>Start a new story <ArrowRight size={16} aria-hidden="true" /></button>
      </section>
      <p className={styles.closingNote}>“A little more written.<br />A little more of your world.”<span>Your story starts with you.</span></p>
    </aside>
  );
}

export default function LibraryWorkspace({ books, initialCreateOpen = false, demoModeActive = false }: LibraryWorkspaceProps) {
  const { setCurrentBookId } = useAuthorWorkspace();
  const t = useTranslations("author.library");
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("ALL");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  // Keep the active book independent of the current view, sort and filter.
  const recentBook = books[0] ?? null;
  useEffect(() => { setCurrentBookId(recentBook?.id ?? null); }, [recentBook?.id, setCurrentBookId]);
  const totalChapters = books.reduce((sum, book) => sum + book.chapterCount, 0);
  const shownBooks = filterAndSortBooks(books, query, filter, sort);
  const metrics = [
    { label: "Total books", value: books.length, icon: BookOpen, note: "Stories in your library" },
    { label: "Total chapters", value: totalChapters, icon: FileText, note: "One chapter at a time" },
    { label: "Drafts", value: books.filter(book => book.status === "DRAFT").length, icon: PenLine, note: "Stories taking shape" },
    { label: "Published", value: books.filter(book => book.status === "PUBLISHED").length, icon: Globe, note: "Out in the world" },
  ];
  const clearFilters = () => { setQuery(""); setFilter("ALL"); searchRef.current?.focus(); };
  const openCreate = () => setCreateOpen(true);

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.heading}><h1 className="author-page-title">{t("title")}</h1><p>{books.length} {books.length === 1 ? "book" : "books"} · {totalChapters} {totalChapters === 1 ? "chapter" : "chapters"}</p></div>
        <div className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <label htmlFor={searchId} className="sr-only">Search books</label>
          <input ref={searchRef} id={searchId} type="search" placeholder="Search your books…" value={query} onChange={event => setQuery(event.target.value)} />
          <button type="button" aria-label="Open command palette" title="Search all workspaces (⌘K / Ctrl K)" onClick={() => window.dispatchEvent(new CustomEvent("author-shell:open-command-palette"))}><span aria-hidden="true">⌘ K</span></button>
        </div>
        <div className={styles.headerActions}><NotificationBell /><Button onClick={openCreate} className={styles.newBook}><Plus size={17} aria-hidden="true" />New book</Button></div>
      </header>
      <div className={styles.dashboard}>
        <div className={styles.canvas}>
          {recentBook ? (
            <section className={styles.hero} aria-label="Continue writing">
              <div className={styles.heroCover}><BookCover book={recentBook} priority /></div>
              <div className={styles.heroContent}><p className={styles.eyebrow}>Continue writing</p><h2 title={recentBook.title}>{recentBook.title}</h2><p className={styles.heroMeta}>{editedLabel(recentBook.updatedAt)} · {recentBook.chapterCount} {recentBook.chapterCount === 1 ? "chapter" : "chapters"}</p><BookProgress book={recentBook} /></div>
              <div className={styles.heroAction}><p>“A great story doesn’t write itself.<br />But you’re getting there.”</p><Link href={getBookHref(recentBook, demoModeActive)} aria-label={`Continue editing ${recentBook.title}`}>Open Editor <ArrowRight size={18} aria-hidden="true" /></Link></div>
            </section>
          ) : (
            <section className={styles.emptyLibrary}><span className={styles.addIcon}><PenLine size={28} aria-hidden="true" /></span><p className={styles.eyebrow}>A world of stories starts here</p><h2>{t("emptyTitle")}</h2><p>{t("emptyBody")}</p><Button onClick={openCreate}><Plus size={17} aria-hidden="true" />Write your first book</Button></section>
          )}
          <dl className={styles.metrics}>{metrics.map(({ label, value, icon: Icon, note }) => (
            <div key={label} className={styles.metric}><span className={styles.metricIcon}><Icon size={21} aria-hidden="true" /></span><div><dd>{value.toLocaleString("en-US")}</dd><dt>{label}</dt><p>{note}</p></div></div>
          ))}</dl>
          {books.length > 0 && <>
            <div className={styles.toolbar}>
              <div className={styles.filters} role="group" aria-label="Filter books">{FILTERS.map(item => (
                <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} ({item.value === "ALL" ? books.length : books.filter(book => book.status === item.value).length})</button>
              ))}</div>
              <div className={styles.viewTools}><label htmlFor={`${searchId}-sort`}>Sort by</label><select id={`${searchId}-sort`} aria-label="Sort books" value={sort} onChange={event => setSort(event.target.value as LibrarySort)}><option value="recent">Last edited</option><option value="title">Title A–Z</option><option value="chapters">Most chapters</option></select><div className={styles.viewToggle} role="group" aria-label="Library view"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={18} aria-hidden="true" /></button><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={20} aria-hidden="true" /></button></div></div>
            </div>
            <p className="sr-only" role="status" aria-live="polite">{shownBooks.length} {shownBooks.length === 1 ? "book" : "books"} shown</p>
            {shownBooks.length ? <div className={styles.books} data-view={view}>{shownBooks.map(book => <BookCard key={book.id} book={book} demoModeActive={demoModeActive} />)}<AddBookCard onOpen={openCreate} /></div> : <section className={styles.noResults}><Search size={28} aria-hidden="true" /><h2>No books found</h2><p>Try another title or description, or choose a different status.</p><button type="button" onClick={clearFilters}><X size={16} aria-hidden="true" />Clear filters</button></section>}
          </>}
          <p className={styles.libraryFootnote}><Check size={14} aria-hidden="true" />Your library. Your stories. Your next chapter.</p>
        </div>
        <LibraryCompanion books={books} demoModeActive={demoModeActive} onCreate={openCreate} />
      </div>
      <CreateBookDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
