import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SimplifiedEditView from "@/app/(app-author)/author/books/[id]/editor/views/SimplifiedEditView";
import { useChapterCrud } from "@/app/(app-author)/author/books/[id]/editor/hooks/useChapterCrud";
import { useChapterSelection } from "@/app/(app-author)/author/books/[id]/editor/hooks/useChapterSelection";
import { BookWorkspaceProvider } from "@/app/(app-author)/author/books/[id]/editor/workspace/BookWorkspaceProvider";
import type { Chapter } from "@/app/(app-author)/author/books/[id]/editor/BookEditorView.types";
import ChapterRail from "@/features/book-workspace/ChapterRail";

type Response = { data: { id: string }[] | null; error: { message: string } | null };
type Outcome = "held" | "error" | "missing" | "written";
type ChapterInsert = Omit<Chapter, "id"> & { book_id: string };
export type Harness = {
  writes: { id: string; content: string }[];
  deletes: { table: string; column: string; id: string }[];
  db: Record<string, string>;
  held: (() => void)[];
  heldDeletes: (() => void)[];
  heldMutations: (() => void)[];
  creates: ChapterInsert[];
  renames: { id: string; title: string }[];
  renameProjections: string[];
  deleteProjections: string[];
  dbTitles: Record<string, string>;
  dbOrder: Record<string, number>;
  orderWrites: { id: string; order: number }[];
  orderProjections: string[];
  orderReads: string[][];
  heldOrders: (() => void)[];
  refreshCalls: number;
  refreshSnapshots: Chapter[][];
  toasts: string[];
  successes: string[];
  chapters: Chapter[];
  selected: string | null;
  unchangedB: boolean;
  state: { isSaving: boolean; hasUnsavedChanges: boolean; saveError: boolean; lastSaved: boolean };
  release: () => void;
  releaseDelete: () => void;
  releaseMutation: () => void;
  releaseOrder: () => void;
  refresh: () => void;
  writeOrder: (id: string, order: number) => Promise<Response>;
  readOrders: (ids: string[]) => Promise<{ data: { id: string; order: number }[] | null; error: { message: string } | null }>;
  create: (payload: ChapterInsert) => Promise<{ data: Chapter; error: null }>;
  rename: (id: string, title: string) => Promise<Response>;
  persist: (id: string, content: string) => Promise<Response>;
  remove: (table: string, column: string, id: string) => Promise<Response>;
};

declare global {
  interface Window { autosaveHarness: Harness }
}

const doc = (text: string) => JSON.stringify({
  type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const mode = new URL(location.href).searchParams.get("mode");
const refreshEnabled = new URL(location.href).searchParams.has("refresh");
const initial: Chapter[] = [
  { id: "a", title: "A", order: 1, content: doc("A0"), book_version_id: "version" },
  { id: "b", title: "B", order: 2, content: doc("B0"), book_version_id: "version" },
  ...(mode === "delayed-delete" ? [{ id: "c", title: "C", order: 3, content: doc("C0"), book_version_id: "version" }] : []),
];
const outcomes: Outcome[] = mode === "error" ? ["error"]
  : mode === "missing" ? ["missing"]
  : mode === "older-ack" || new URL(location.href).searchParams.has("failure") ? ["held", "error"]
  : ["held"];

// Only transport responses are synthetic. The hook still serializes, scopes,
// checks affected rows, and drains its own real queue.
const harness: Harness = window.autosaveHarness = {
  writes: [], deletes: [], db: Object.fromEntries(initial.map((chapter) => [chapter.id, chapter.content!])),
  held: [], heldDeletes: [], heldMutations: [], creates: [], renames: [], renameProjections: [], deleteProjections: [], toasts: [], successes: [],
  dbTitles: Object.fromEntries(initial.map((chapter) => [chapter.id, chapter.title])),
  dbOrder: Object.fromEntries(initial.map((chapter) => [chapter.id, chapter.order])),
  orderWrites: [], orderProjections: [], orderReads: [], heldOrders: [], refreshCalls: 0, refreshSnapshots: [],
  chapters: initial, selected: "a", unchangedB: true,
  state: { isSaving: false, hasUnsavedChanges: false, saveError: false, lastSaved: false },
  release() { for (const resolve of this.held.splice(0)) resolve(); },
  releaseDelete() { for (const resolve of this.heldDeletes.splice(0)) resolve(); },
  releaseMutation() { for (const resolve of this.heldMutations.splice(0)) resolve(); },
  releaseOrder() { for (const resolve of this.heldOrders.splice(0)) resolve(); },
  refresh() {},
  async writeOrder(id, order) {
    this.orderWrites.push({ id, order });
    if (mode === "order-error" && this.orderWrites.length === Number(new URL(location.href).searchParams.get("order-fail-at") ?? 1)) return { data: null, error: { message: "synthetic order failure" } };
    if (!(id in this.dbOrder) || (mode === "order-zero" && this.orderWrites.length === Number(new URL(location.href).searchParams.get("order-zero-at") ?? 1))) return { data: [], error: null };
    if (mode?.startsWith("delayed-order") && this.orderWrites.length === 1) await new Promise<void>((resolve) => this.heldOrders.push(resolve));
    if (Object.entries(this.dbOrder).some(([otherId, value]) => otherId !== id && value === order)) return { data: null, error: { message: "synthetic duplicate order" } };
    this.dbOrder[id] = order;
    return { data: [{ id }], error: null };
  },
  async readOrders(ids) {
    this.orderReads.push(ids);
    if (new URL(location.href).searchParams.has("order-read-error")) return { data: null, error: { message: "synthetic order read failure" } };
    return { data: ids.filter((id) => id in this.dbOrder).map((id) => ({ id, order: this.dbOrder[id] })), error: null };
  },
  async create(payload) {
    this.creates.push(payload);
    if (mode === "delayed-create") await new Promise<void>((resolve) => this.heldMutations.push(resolve));
    const chapter = { id: "c", title: payload.title, content: payload.content, order: payload.order, book_version_id: payload.book_version_id };
    this.db.c = chapter.content ?? "";
    this.dbOrder.c = chapter.order;
    this.dbTitles.c = chapter.title;
    return { data: chapter, error: null };
  },
  async rename(id, title) {
    this.renames.push({ id, title });
    if (mode === "rename-zero") return { data: [], error: null };
    if (mode === "delayed-rename") await new Promise<void>((resolve) => this.heldMutations.push(resolve));
    this.dbTitles[id] = title;
    return { data: [{ id }], error: null };
  },
  async persist(id, content) {
    this.writes.push({ id, content });
    const outcome = outcomes.shift() ?? "written";
    if (outcome === "error") return { data: null, error: { message: "synthetic transient failure" } };
    if (outcome === "missing") return { data: [], error: null };
    if (outcome === "held") await new Promise<void>((resolve) => this.held.push(resolve));
    if (!(id in this.db)) return { data: [], error: null };
    this.db[id] = content;
    return { data: [{ id }], error: null };
  },
  async remove(table, column, id) {
    if (mode === "delayed-delete" && table === "ai_jobs") {
      await new Promise<void>((resolve) => this.heldDeletes.push(resolve));
    }
    this.deletes.push({ table, column, id });
    if (table === "chapters") {
      if (mode === "delete-zero") return { data: [], error: null };
      delete this.dbTitles[id];
      delete this.db[id];
      delete this.dbOrder[id];
    }
    return { data: table === "chapters" ? [{ id }] : [], error: null };
  },
};
const noop = () => {};
const href = () => "/synthetic";

function App({ initialChapters }: { initialChapters: Chapter[] }) {
  // This exact prop boundary is checked against BookEditorView by the server.
  // The authenticated route and complete publishing/AI shell are not mounted.
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);

  useEffect(() => {
    setChapters(initialChapters);
  }, [initialChapters]);
  const [, setWordCount] = useState(0);
  const selection = useChapterSelection({ chapters, initialSelectedChapterId: initialChapters[0]?.id ?? null });
  const crud = useChapterCrud({
    book: { id: "book", title: "Synthetic", language: "en", description: null, cover_image: null, status: "draft" },
    activeVersion: { id: "version", book_id: "book", language_code: "en", status: "draft" },
    chapters, selectedChapterId: selection.selectedChapterId, setChapters,
    setSelectedChapterId: selection.setSelectedChapterId,
    setChapterPage: selection.setChapterPage, setSessionStartWords: noop,
    chaptersPerPage: 21, getBookWorkspaceHref: href,
  });
  useEffect(() => {
    harness.chapters = chapters;
    harness.selected = selection.selectedChapterId;
    harness.unchangedB = chapters.find((chapter) => chapter.id === "b") === initial[1];
    harness.state = {
      isSaving: crud.isSaving, hasUnsavedChanges: crud.hasUnsavedChanges,
      saveError: crud.saveError, lastSaved: crud.lastSaved !== null,
    };
  }, [chapters, selection.selectedChapterId, crud.isSaving, crud.hasUnsavedChanges, crud.saveError, crud.lastSaved]);
  return <>
    <button type="button" onClick={() => harness.release()}>Release held save</button>
    {mode === "delayed-delete" && <button type="button" onClick={() => harness.releaseDelete()}>Release held deletion</button>}
    {mode?.startsWith("delayed-") && mode !== "delayed-delete" && <button type="button" onClick={() => harness.releaseMutation()}>Release held create or rename</button>}
    <output>{JSON.stringify({ isSaving: crud.isSaving, hasUnsavedChanges: crud.hasUnsavedChanges, saveError: crud.saveError })}</output>
    {mode?.includes("order") && <div data-testid="order-rail">
      <ChapterRail bookTitle="Synthetic" coverImageUrl={null} chapters={chapters}
        selectedChapterId={selection.selectedChapterId} onSelectChapter={selection.selectChapter}
        onCreateChapter={crud.handleCreateChapter} isCreating={crud.isCreating}
        onCoverChange={noop} coverUploading={false} coverError={null}
        onMoveChapter={crud.handleMoveChapter} onReorderChapter={crud.handleReorderChapters} />
    </div>}
    <SimplifiedEditView
      bookId="book" bookTitle="Synthetic" chapters={chapters}
      visibleChapters={selection.visibleChapters} startIndex={selection.startIndex}
      totalPages={selection.totalPages} chapterPage={selection.chapterPage}
      selectedChapterId={selection.selectedChapterId} selectedChapter={selection.selectedChapter}
      preset="novel" focusMode={false} activeTool="edit" tools={[]}
      onSetChapterPage={selection.setChapterPage} onSelectChapter={selection.selectChapter}
      onResetSessionWords={noop} onWordCount={setWordCount} onAutoSave={crud.handleAutoSave}
      onDirty={() => crud.setHasUnsavedChanges(true)} onToggleFocusMode={noop}
      onDeleteChapter={crud.handleDeleteChapter}
      onCreateChapter={crud.handleCreateChapter} isCreating={crud.isCreating}
      editingTitleId={crud.editingTitleId} tempTitle={crud.tempTitle}
      onStartEditTitle={crud.handleStartEditTitle} onTempTitleChange={crud.setTempTitle}
      onSaveTitle={crud.handleSaveTitle} onCancelEditTitle={crud.handleCancelEditTitle}
      isSaving={crud.isSaving} hasUnsavedChanges={crud.hasUnsavedChanges}
      lastSaved={crud.lastSaved} saveError={crud.saveError}
    />
  </>;
}

function ServerPropsHost() {
  const [serverChapters, setServerChapters] = useState(initial);
  useEffect(() => {
    harness.refresh = () => {
      harness.refreshCalls += 1;
      if (!refreshEnabled) return;
      const rows = Object.entries(harness.db).map(([id, content]) => {
        const existing = initial.find((chapter) => chapter.id === id);
        const inserted = harness.creates.at(-1);
        if (!existing && !inserted) throw new Error("Unexpected synthetic refresh row");
        const base = existing ?? { ...inserted!, id };
        return { id, title: harness.dbTitles[id], order: harness.dbOrder[id], book_version_id: base.book_version_id, content };
      }).sort((a, b) => a.order - b.order);
      harness.refreshSnapshots.push(rows);
      setServerChapters(rows);
    };
  }, []);
  return <App initialChapters={serverChapters} />;
}

createRoot(document.getElementById("root")!).render(
  <BookWorkspaceProvider bookId="book" initialSelectedChapterId="a" initialActivePanel="edit">
    <ServerPropsHost />
  </BookWorkspaceProvider>,
);
