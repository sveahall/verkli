"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import EditorialReviewPanel from "@/app/(app-author)/author/books/[id]/editor/panels/EditorialReviewPanel";
import { useChapterCrud } from "@/app/(app-author)/author/books/[id]/editor/hooks/useChapterCrud";
import { ChapterContentConflictError } from "@/app/(app-author)/author/books/[id]/editor/hooks/useChapterCrud.review";
import type { Chapter } from "@/app/(app-author)/author/books/[id]/editor/BookEditorView.types";
import { reviewText } from "@/lib/editorial/content";

const TiptapEditor = dynamic(() => import("@/components/editor/TiptapEditor"), { ssr: false });
const BOOK_ID = "editorial-preview";
const CHAPTER_ID = "editorial-preview-chapter";
const VERSION_ID = "editorial-preview-version";
// Intentional whitespace checks that undo restores bytes rather than reserializing.
const ORIGINAL = '{ "type": "doc", "content": [{"type":"paragraph","content":[{"type":"text","text":"She walk home. The harbour was quiet."}]}] }';
const BOOK = { id: BOOK_ID, title: "The last ferry", description: null, cover_image: null, status: "draft" };
const VERSION = { id: VERSION_ID, book_id: BOOK_ID, language_code: "en", status: "draft" };
const initialChapter: Chapter = { id: CHAPTER_ID, title: "The harbour", order: 1, book_version_id: VERSION_ID, content: ORIGINAL };
const buttonClass = "min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-muted disabled:opacity-50";
const noop = () => {};

/** Actual review panel + editor + CRUD hook. Only transport is an in-memory fixture. */
export default function EditorialPreview() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"review" | "write">("review");
  const [chapters, setChapters] = useState([initialChapter]);
  const [savedText, setSavedText] = useState(ORIGINAL);
  const [holdWrites, setHoldWrites] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [failure, setFailure] = useState(false);
  const [blockedRequests, setBlockedRequests] = useState(0);
  const row = useRef({ content: ORIGINAL, revision: 1 });
  const hold = useRef(false);
  const failReview = useRef(false);
  const releases = useRef<Array<() => void>>([]);

  const persistContent = useCallback(async (_bookId: string, _chapterId: string, expected: string | null, next: Record<string, unknown> | string) => {
    const snapshot = { ...row.current };
    if (snapshot.content !== expected) throw new ChapterContentConflictError("This chapter changed. Run a new review before accepting changes.");
    if (hold.current) {
      setPendingWrites((count) => count + 1);
      await new Promise<void>((resolve) => releases.current.push(resolve));
      setPendingWrites((count) => count - 1);
    }
    if (row.current.revision !== snapshot.revision) throw new ChapterContentConflictError("This chapter changed while saving. Your newer text was kept.");
    const content = typeof next === "string" ? next : JSON.stringify(next);
    row.current = { content, revision: snapshot.revision + 1 };
    setSavedText(content);
    return content;
  }, []);

  const crud = useChapterCrud({
    book: BOOK, activeVersion: VERSION, chapters, selectedChapterId: CHAPTER_ID,
    setChapters, setSelectedChapterId: noop, setChapterPage: noop, setSessionStartWords: noop,
    chaptersPerPage: 20, getBookWorkspaceHref: () => "/dev/editorial-review", persistContent,
  });

  useEffect(() => {
    const originalFetch = window.fetch;
    const pendingReleases = releases.current;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.origin === location.origin && url.pathname === `/api/books/${BOOK_ID}/editorial/review` && method === "POST") {
        if (failReview.current) return Response.json({ error: "Editorial review is unavailable until its daily AI allowance is configured. Please contact support." }, { status: 503 });
        const body = JSON.parse(String(init?.body ?? "{}"));
        const content = row.current.content;
        const text = reviewText(content);
        return Response.json({ chapterId: CHAPTER_ID, chapterTitle: initialChapter.title, mode: body.mode, part: 0, partCount: 1, reviewedText: text, sourceText: null, originalContent: content,
          report: { summary: "Prepared local example. No AI request was made.", findings: [], corrections: text.includes("She walk home.") ? [{ original: "She walk home.", replacement: "She walks home.", reason: "Subject–verb agreement." }] : [] } });
      }
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(method)) {
        setBlockedRequests((count) => count + 1);
        return Response.json({ error: "LOCAL_PREVIEW_ONLY" }, { status: 403 });
      }
      return originalFetch(input, init);
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(frame);
      window.fetch = originalFetch;
      pendingReleases.splice(0).forEach((release) => release());
    };
  }, []);

  function externalEdit() {
    const content = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Newer text from another tab." }] }] });
    row.current = { content, revision: row.current.revision + 1 };
    setSavedText(content);
  }

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header className="space-y-2"><p className="text-sm text-muted-foreground">Local QA · no database or AI calls</p><h1 className="text-3xl">Editorial review</h1><p>Real review and writing controls, with a local simulated server. Reload to reset.</p></header>
    <section aria-label="QA controls" className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
      <button className={buttonClass} onClick={() => setView("review")}>Review view</button>
      <button className={buttonClass} onClick={() => setView("write")}>Write view</button>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={holdWrites} onChange={(event) => { hold.current = event.target.checked; setHoldWrites(event.target.checked); }} />Hold writes</label>
      <button className={buttonClass} disabled={!pendingWrites} onClick={() => { hold.current = false; setHoldWrites(false); releases.current.splice(0).forEach((release) => release()); }}>Release saves ({pendingWrites})</button>
      <button className={buttonClass} onClick={externalEdit}>Simulate another tab</button>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={failure} onChange={(event) => { failReview.current = event.target.checked; setFailure(event.target.checked); }} />Missing AI allowance</label>
      <button className={buttonClass} disabled={crud.isSaving || crud.hasUnsavedChanges} onClick={() => { row.current = { content: "", revision: row.current.revision + 1 }; setSavedText(""); setChapters([{ ...initialChapter, content: "" }]); }}>Empty chapter</button>
    </section>
    <p role="status">{crud.isSaving ? "Saving…" : crud.hasUnsavedChanges ? "Unsaved changes" : "Saved"} · blocked external/API requests: {blockedRequests}</p>
    {crud.hasSaveConflict && <div role="alert" className="space-y-3 rounded-lg border border-border p-4"><p>A newer chapter was saved elsewhere. Download your unsaved draft before leaving or reloading.</p><button className={buttonClass} onClick={crud.downloadUnsavedDrafts}>Download unsaved draft</button></div>}
    {ready && (view === "review" ? <EditorialReviewPanel bookId={BOOK_ID} chapters={chapters} activeVersionId={VERSION_ID} bookVersions={[VERSION]} onApplyReview={crud.handleApplyReview} saveBlocked={crud.isSaving || crud.hasUnsavedChanges} /> : crud.hasSaveConflict ? <p role="status">Editing is paused to protect your unsaved draft. Download it, then reload to open the latest saved chapter.</p> : crud.isApplyingReview ? <p role="status">Finishing your review change…</p> : <section aria-label="Writing surface" className="rounded-xl border border-border p-4"><TiptapEditor content={chapters[0].content} chapterId={CHAPTER_ID} onDirty={() => crud.markChapterDirty(CHAPTER_ID)} onUpdate={(content) => void crud.handleAutoSave(CHAPTER_ID, content)} /></section>)}
    <section className="space-y-2 border-t border-border pt-4"><h2 className="font-medium">Simulated server</h2><p data-testid="server-text">{reviewText(savedText) || "Empty"}</p><p className="text-sm text-muted-foreground">Original bytes restored: {savedText === ORIGINAL ? "yes" : "no"}</p></section>
  </main>;
}
