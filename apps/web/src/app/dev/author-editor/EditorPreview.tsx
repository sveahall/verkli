"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import AuthorAppShell from "@/features/author-shell/AuthorAppShell";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import SimplifiedEditView from "@/app/(app-author)/author/books/[id]/editor/views/SimplifiedEditView";
import FocusModeEditorView from "@/app/(app-author)/author/books/[id]/editor/views/FocusModeEditorView";
import { TOOL_ORDER } from "@/app/(app-author)/author/books/[id]/editor/bookEditor.shared";
import type { Chapter, Tool } from "@/app/(app-author)/author/books/[id]/editor/BookEditorView.types";

const BOOK_ID = "editor-preview-ferry";
const CHAPTERS_PER_PAGE = 21;
const PREVIEW_PRESET_KEY = "verkli_editor_preview_preset";
type Scenario = "sample" | "empty" | "longtitle" | "many";
const PREVIEW_MESSAGE = "Local preview only. Your edits stay in this page; no book or file is saved to a server.";
const TOOLS: Tool[] = TOOL_ORDER;
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const heading = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
const SAMPLE_CHAPTERS: Chapter[] = [
  {
    id: "preview-chapter-1", title: "Den sista avgången", order: 1, book_version_id: "preview-version",
    content: JSON.stringify({ type: "doc", content: [
      heading("Hamnen i skymning"),
      paragraph("Färjan låg kvar vid kajen när Elin kom ner till hamnen. Regnet hade slutat, men repen glänste ännu och en tunn dimma steg från vattnet. Hon stannade vid den gamla biljettluckan, där någon hade skrivit sista avgången med blå penna på ett vikt papper."),
      paragraph("I fickan låg brevet hon inte hade öppnat. Det hade följt henne hela vägen från stationen, genom de smala gatorna och förbi bageriet där hennes far brukade köpa bröd på söndagar. Varje steg hade fört henne närmare ön. Ändå kändes det som om hon hade gått åt fel håll."),
      paragraph("En man i gul regnjacka lossade förtöjningen. Han såg upp och nickade mot landgången. Färjan väntade på henne, förstod hon. Eller kanske var det bara så hon ville minnas det senare: att någon hade väntat."),
      heading("Brevet i fickan"),
      paragraph("Elin tog fram kuvertet. Hennes namn stod skrivet med den välbekanta lutningen åt höger. Inget avsändarnamn, ingen förklaring. Bara en adress på ön och ett datum som redan hade passerat. Hon strök med tummen över papprets kant och kände hur en liten flik gav efter."),
      paragraph("Motorn startade med ett lågt, jämnt ljud. Hon stoppade tillbaka brevet och gick ombord. Bakom henne släcktes lampan i biljettluckan. Framför henne öppnade sig sundet, mörkt och stilla, och för första gången på flera år visste hon inte vad som väntade på andra sidan."),
    ] }),
  },
  {
    id: "preview-chapter-2", title: "Över sundet", order: 2, book_version_id: "preview-version",
    content: JSON.stringify({ type: "doc", content: [
      heading("Ljus på andra sidan"),
      paragraph("När hamnen försvann bakom dem kom vinden från norr. Elin drog jackan tätare kring sig och räknade de upplysta fönstren längs stranden. Ett efter ett gled de ihop till en enda blek linje. Kaptenen stod ensam i styrhytten med händerna vilande på ratten."),
      paragraph("Hon mindes samma överfart en sommarmorgon när hon var nio. Då hade hennes mor pekat ut fyrens vita torn och sagt att man alltid kunde hitta hem om man höll ljuset i sikte. Nu syntes ingen fyr. Bara mörker, vatten och en mås som följde båten en kort stund innan den vände tillbaka."),
      paragraph("På bänken bredvid låg en kvarglömd vante. Hon flyttade den försiktigt och satte sig. Brevet prasslade i fickan. Den här gången tog hon upp det och lät kuvertet öppna sig helt."),
    ] }),
  },
  {
    id: "preview-chapter-3", title: "Det vi lämnar kvar", order: 3, book_version_id: "preview-version",
    content: JSON.stringify({ type: "doc", content: [
      heading("Huset vid vattnet"),
      paragraph("Huset var mindre än hon mindes. Färgen hade flagnat kring dörren och äppelträdet lutade ut över stigen. Elin ställde väskan på det nedersta trappsteget. Inifrån hördes ett svagt tickande, samma ojämna rytm som hade fyllt hennes barndoms kvällar."),
      paragraph("Nyckeln låg fortfarande under den flata stenen. Hon höll den en stund i handen innan hon låste upp. Doften av trä, kaffe och gamla böcker mötte henne i hallen. Allt såg orört ut, och ändå hade någonting flyttats som hon ännu inte kunde sätta ord på."),
      paragraph("På köksbordet stod två koppar. Den ena var tom. I den andra hade teet mörknat. Bredvid dem låg ett fotografi, vänt med bilden nedåt, och en lapp med hennes namn. Hon drog ut stolen och satte sig innan hon vände på det."),
    ] }),
  },
];

type LocalSave = { chapterId: string; content: Record<string, unknown>; at: number };
type LocalAction = { type: string; chapterId?: string; at: number };

function PreviewWorkspace({ children }: { children: ReactNode }) {
  const { setCurrentBookId } = useAuthorWorkspace();
  useEffect(() => { setCurrentBookId(BOOK_ID); }, [setCurrentBookId]);
  return children;
}

/** Real editor views. Only their persistence callbacks are local to this fixture. */
export default function EditorPreview() {
  const [ready, setReady] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("sample");
  const [chapterPage, setChapterPage] = useState(0);
  const [blockedMessage, setBlockedMessage] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>(SAMPLE_CHAPTERS);
  const [selectedChapterId, setSelectedChapterId] = useState(SAMPLE_CHAPTERS[0].id);
  const [bookTitle, setBookTitle] = useState("Den sista färjan");
  const [bookTitleDraft, setBookTitleDraft] = useState(bookTitle);
  const [isRenamingBook, setIsRenamingBook] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [preset, setPreset] = useState("novel");
  const [wordCount, setWordCount] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saves, setSaves] = useState<LocalSave[]>([]);
  const [actions, setActions] = useState<LocalAction[]>([]);
  const nextChapter = useRef(4);
  const activeBookRename = useRef(false);
  const activeChapterRename = useRef<string | null>(null);
  const selectedChapterIndex = chapters.findIndex((chapter) => chapter.id === selectedChapterId);
  const selectedChapter = chapters[selectedChapterIndex] ?? null;

  useEffect(() => {
    const originalFetch = window.fetch;
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const isBlocked = (url: URL, method = "GET") => url.origin !== location.origin ||
      url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(method.toUpperCase()) ||
      (!url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/demo-assets/") && url.pathname !== location.pathname);
    const announceBlock = (message = PREVIEW_MESSAGE) => setBlockedMessage(message);
    // Install before the real shell and editors can mount or request anything.
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (url.origin === location.origin && method.toUpperCase() === "GET" && url.pathname === "/api/notifications/unread-count") return Response.json({ count: 0 });
      if (isBlocked(url, method)) {
        announceBlock();
        return Response.json({ error: "PREVIEW_ONLY", message: PREVIEW_MESSAGE }, { status: 403 });
      }
      return originalFetch(input, init);
    };
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      if (isBlocked(new URL(String(url), location.origin), method)) {
        announceBlock();
        throw new DOMException(PREVIEW_MESSAGE, "SecurityError");
      }
      originalXhrOpen.call(this, method, url, async, username, password);
    };
    const preventNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      const sidebarButton = event.target.closest("[data-author-sidebar] button");
      if (anchor || sidebarButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        announceBlock("Navigation stays in this local preview. Use chapters and writing tools to explore the editor.");
      }
    };
    const preventNativeWrite = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement) || event.target.method.toLowerCase() === "get") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      announceBlock();
    };
    const preventImageTransfer = (event: ClipboardEvent | DragEvent) => {
      const data = "clipboardData" in event ? event.clipboardData : event.dataTransfer;
      const imageFile = Array.from(data?.files ?? []).some((file) => file.type.startsWith("image/"));
      const imageItem = Array.from(data?.items ?? []).some((item) => item.type.startsWith("image/"));
      if (!imageFile && !imageItem && !/<img[\s>]/i.test(data?.getData("text/html") ?? "")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      announceBlock("Images are disabled in this local preview. Manuscript editing stays local.");
    };
    const preventCommandNavigation = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      announceBlock("Workspace navigation is disabled in this local editor preview.");
    };
    const preventCommandShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") preventCommandNavigation(event);
    };
    document.addEventListener("click", preventNavigation, true);
    document.addEventListener("submit", preventNativeWrite, true);
    document.addEventListener("paste", preventImageTransfer, true);
    document.addEventListener("drop", preventImageTransfer, true);
    window.addEventListener("author-shell:open-command-palette", preventCommandNavigation, true);
    window.addEventListener("keydown", preventCommandShortcut, true);
    const readyTimer = window.setTimeout(() => {
      const requested = new URLSearchParams(location.search).get("scenario");
      const initialScenario: Scenario = requested === "empty" || requested === "longtitle" || requested === "many" ? requested : "sample";
      const initialChapters = initialScenario === "empty" ? [] : initialScenario === "many" ? Array.from({ length: 24 }, (_, index) => ({ ...SAMPLE_CHAPTERS[index % 3], id: `preview-chapter-${index + 1}`, title: `Kapitel ${index + 1}: ${SAMPLE_CHAPTERS[index % 3].title}`, order: index + 1 })) : initialScenario === "longtitle" ? SAMPLE_CHAPTERS.map((chapter) => ({ ...chapter, title: "Den oväntat långa berättelsen om allt vi lämnade efter oss när den sista färjan försvann bortom horisonten" })) : SAMPLE_CHAPTERS;
      const storedPreset = localStorage.getItem(PREVIEW_PRESET_KEY);
      if (storedPreset && ["novel", "essay", "screenplay"].includes(storedPreset)) setPreset(storedPreset);
      setScenario(initialScenario);
      setChapters(initialChapters);
      setSelectedChapterId(initialChapters[0]?.id ?? "");
      nextChapter.current = initialChapters.length + 1;
      if (initialScenario === "longtitle") setBookTitle("Den sista färjan och alla berättelser som fortfarande väntade på att få komma hem till den lilla ön i det stora havet");
      setReady(true);
    }, 0);
    return () => {
      window.clearTimeout(readyTimer);
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXhrOpen;
      document.removeEventListener("click", preventNavigation, true);
      document.removeEventListener("submit", preventNativeWrite, true);
      document.removeEventListener("paste", preventImageTransfer, true);
      document.removeEventListener("drop", preventImageTransfer, true);
      window.removeEventListener("author-shell:open-command-palette", preventCommandNavigation, true);
      window.removeEventListener("keydown", preventCommandShortcut, true);
    };
  }, []);

  useEffect(() => {
    // Match the focus shortcuts supplied by BookEditorView in the real route.
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusMode) { event.preventDefault(); setFocusMode(false); }
      if ((event.metaKey || event.ctrlKey) && ((event.shiftKey && event.key.toLowerCase() === "f") || event.key === "\\")) {
        event.preventDefault(); setFocusMode((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [focusMode]);

  const saveChapter = useCallback((chapterId: string, content: Record<string, unknown>) => {
    // The callback's chapterId survives old-editor cleanup on selection/focus changes.
    // Using selectedChapterId here would save the old prose into the new chapter.
    const serialized = JSON.stringify(content);
    setChapters((current) => current.map((chapter) => chapter.id === chapterId ? { ...chapter, content: serialized } : chapter));
    setSaves((current) => [...current, { chapterId, content: JSON.parse(serialized), at: Date.now() }]);
    setHasUnsavedChanges(false);
    setLastSaved(new Date());
  }, []);
  const markDirty = useCallback(() => setHasUnsavedChanges(true), []);
  const toggleFocus = useCallback(() => setFocusMode((current) => !current), []);
  const resetSessionWords = useCallback(() => {}, []);
  const recordAction = (type: string, chapterId?: string) => setActions((current) => [...current, { type, chapterId, at: Date.now() }]);
  const createChapter = () => {
    const index = nextChapter.current++;
    const chapter: Chapter = { id: `preview-chapter-${index}`, title: "Untitled chapter", order: chapters.length + 1, book_version_id: "preview-version", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }) };
    setChapters((current) => [...current, chapter]);
    setSelectedChapterId(chapter.id);
    setChapterPage(Math.floor(chapters.length / CHAPTERS_PER_PAGE));
    recordAction("create", chapter.id);
  };
  const deleteChapter = (chapterId: string) => {
    const remaining = chapters.filter((chapter) => chapter.id !== chapterId);
    setChapters(remaining);
    setChapterPage((current) => Math.min(current, Math.max(0, Math.ceil(remaining.length / CHAPTERS_PER_PAGE) - 1)));
    if (selectedChapterId === chapterId) setSelectedChapterId(remaining[0]?.id ?? "");
    recordAction("delete", chapterId);
  };
  const saveBookTitle = () => {
    if (!activeBookRename.current) return;
    activeBookRename.current = false;
    setBookTitle(bookTitleDraft.trim() || bookTitle);
    setIsRenamingBook(false);
    recordAction("rename-book");
  };
  const saveChapterTitle = (chapterId: string) => {
    if (activeChapterRename.current !== chapterId) return;
    activeChapterRename.current = null;
    setChapters((current) => current.map((chapter) => chapter.id === chapterId ? { ...chapter, title: tempTitle.trim() || "Untitled chapter" } : chapter));
    setEditingTitleId(null);
    recordAction("rename-chapter", chapterId);
  };

  const editor = (
    <SimplifiedEditView bookId={BOOK_ID} bookTitle={bookTitle} chapters={chapters} visibleChapters={chapters.slice(chapterPage * CHAPTERS_PER_PAGE, (chapterPage + 1) * CHAPTERS_PER_PAGE)} startIndex={chapterPage * CHAPTERS_PER_PAGE} totalPages={Math.max(1, Math.ceil(chapters.length / CHAPTERS_PER_PAGE))} chapterPage={chapterPage}
      selectedChapterId={selectedChapterId} selectedChapter={selectedChapter} preset={preset} onPresetChange={(value) => { setPreset(value); localStorage.setItem(PREVIEW_PRESET_KEY, value); }} focusMode={focusMode} activeTool="edit" tools={TOOLS}
      onSetChapterPage={setChapterPage} onSelectChapter={setSelectedChapterId} onResetSessionWords={resetSessionWords} onWordCount={setWordCount}
      onAutoSave={saveChapter} onDirty={markDirty} onToggleFocusMode={toggleFocus} onDeleteChapter={deleteChapter} onCreateChapter={createChapter}
      isSaving={false} hasUnsavedChanges={hasUnsavedChanges} lastSaved={lastSaved}
      isRenamingBook={isRenamingBook} bookTitleDraft={bookTitleDraft}
      onStartRenameBook={() => { activeBookRename.current = true; setBookTitleDraft(bookTitle); setIsRenamingBook(true); }} onBookTitleDraftChange={setBookTitleDraft}
      onSaveRenameBook={saveBookTitle} onCancelRenameBook={() => { activeBookRename.current = false; setIsRenamingBook(false); }}
      editingTitleId={editingTitleId} tempTitle={tempTitle} onStartEditTitle={(chapterId, title) => { activeChapterRename.current = chapterId; setEditingTitleId(chapterId); setTempTitle(title); }}
      onTempTitleChange={setTempTitle} onSaveTitle={saveChapterTitle} onCancelEditTitle={() => { activeChapterRename.current = null; setEditingTitleId(null); }}
      onInlineAiAction={() => setBlockedMessage("AI actions are disabled in this local preview. Your manuscript stays in the editor.")} />
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground" aria-label="Local editor preview">
        <p>Synthetic manuscript · {PREVIEW_MESSAGE}</p>
        <label className="flex min-h-9 items-center gap-2">Preview scenario<select value={scenario} onChange={(event) => { location.search = `?scenario=${event.target.value}`; }} className="min-h-9 rounded border border-border bg-background px-2 text-xs text-foreground"><option value="sample">Sample manuscript</option><option value="empty">Empty book</option><option value="longtitle">Long titles</option><option value="many">24 chapters</option></select></label>
        <span>{saves.length} local saves</span>
        {blockedMessage && <p role="status" className="w-full text-foreground">{blockedMessage}</p>}
      </div>
      <output hidden data-testid="editor-preview-state">{JSON.stringify({ bookTitle, chapters, selectedChapterId, chapterPage, scenario, focusMode, wordCount, hasUnsavedChanges, saves, actions, blockedMessage })}</output>
      {ready ? (
        <NextIntlClientProvider locale="en" messages={messages}>
          <AuthorAppShell>
            <PreviewWorkspace>
              {focusMode ? (
                <FocusModeEditorView publishToast={null} bookTitle={bookTitle} authorDisplayName="Preview author" bookId={BOOK_ID} chapters={chapters}
                  selectedChapterId={selectedChapterId} selectedChapterIndex={selectedChapterIndex} selectedChapter={selectedChapter} preset={preset}
                  onSelectChapter={setSelectedChapterId} onSelectPreviousChapter={() => setSelectedChapterId(chapters[Math.max(0, selectedChapterIndex - 1)].id)}
                  onSelectNextChapter={() => setSelectedChapterId(chapters[Math.min(chapters.length - 1, selectedChapterIndex + 1)].id)}
                  onResetSessionWords={resetSessionWords} onAutoSave={saveChapter} onDirty={markDirty} onWordCount={setWordCount} onExitFocusMode={() => setFocusMode(false)}
                  topContent={<button type="button" onClick={() => setFocusMode(false)} className="mb-4 min-h-11 rounded-full border border-border px-4 text-sm text-foreground">Exit focus mode</button>} />
              ) : (
                <WorkspaceLayout header={<nav className="flex min-w-0 items-center gap-1.5 text-sm"><Link href="/author/library" className="text-muted-foreground">Library</Link><span aria-hidden="true" className="text-muted-foreground">/</span><span className="max-w-[220px] truncate font-medium text-foreground">{bookTitle}</span></nav>}
                  headerRight={<WorkspaceHeaderActions />} mainClassName="space-y-8 pb-16" main={editor} />
              )}
            </PreviewWorkspace>
          </AuthorAppShell>
        </NextIntlClientProvider>
      ) : <p role="status" className="p-6 text-sm text-muted-foreground">Preparing local editor…</p>}
    </>
  );
}
