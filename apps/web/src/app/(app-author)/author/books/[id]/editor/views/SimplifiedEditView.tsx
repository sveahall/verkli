"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Check, ChevronLeft, ChevronRight, Maximize2, MoreHorizontal, PanelRight, Pencil, Plus, Trash2 } from "lucide-react";
import styles from "./SimplifiedEditView.module.css";
import type { Editor } from "@tiptap/react";
import BookWorkflowHeader from "../../BookWorkflowHeader";
import { countWordsInContent } from "../BookEditorView.helpers";
import type { Chapter, Tool } from "../BookEditorView.types";
import type { InlineAiAction } from "@/features/book-workspace/types";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const EditorSidePanel = dynamic(() => import("@/components/editor/EditorSidePanel"), { ssr: false });
const EditorStatusBar = dynamic(() => import("@/components/editor/EditorStatusBar"), { ssr: false });

const editorImport = () => import("@/components/editor/TiptapEditor");

// Start downloading the editor chunk immediately, don't wait for render
if (typeof window !== "undefined") editorImport();

const TiptapEditor = dynamic(editorImport, {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center rounded-xl bg-background dark:bg-card">
      <span className="text-sm text-muted-foreground dark:text-muted-foreground">Loading editor...</span>
    </div>
  ),
});


type SimplifiedEditViewProps = {
  bookId: string;
  activeLanguage?: string;
  bookTitle: string;
  chapters: Chapter[];
  visibleChapters: Chapter[];
  startIndex: number;
  totalPages: number;
  chapterPage: number;
  selectedChapterId: string | null;
  selectedChapter: Chapter | null;
  preset: string;
  onAgentEditorReady?: (editor: Editor | null, chapterId: string) => void;
  onPresetChange?: (value: string) => void;
  focusMode: boolean;
  isPublished?: boolean;
  activeTool: Tool;
  tools: Tool[];
  /** Bubble-menu AI actions on the current selection. */
  onInlineAiAction?: (action: InlineAiAction, selectedText: string) => void;
  onSetChapterPage: (page: number) => void;
  onSelectChapter: (chapterId: string) => void;
  onResetSessionWords: () => void;
  onWordCount: (count: number) => void;
  onAutoSave: (chapterId: string, jsonContent: Record<string, unknown>) => void;
  onDirty: () => void;
  onToggleFocusMode: () => void;
  onDeleteChapter?: (chapterId: string) => void;
  onCreateChapter?: () => void;
  isCreating?: boolean;
  // Book rename
  isRenamingBook?: boolean;
  bookTitleDraft?: string;
  onStartRenameBook?: () => void;
  onBookTitleDraftChange?: (value: string) => void;
  onSaveRenameBook?: () => void;
  onCancelRenameBook?: () => void;
  // Save status
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  lastSaved?: Date | null;
  saveError?: boolean;
  // Chapter rename
  editingTitleId?: string | null;
  tempTitle?: string;
  onStartEditTitle?: (chapterId: string, title: string) => void;
  onTempTitleChange?: (value: string) => void;
  onSaveTitle?: (chapterId: string) => void;
  onCancelEditTitle?: () => void;
};

export default function SimplifiedEditView({
  bookId,
  activeLanguage,
  bookTitle,
  chapters,
  visibleChapters,
  startIndex,
  totalPages,
  chapterPage,
  selectedChapterId,
  selectedChapter,
  preset,
  onPresetChange,
  onAgentEditorReady,
  focusMode,
  isPublished = false,
  activeTool,
  tools,
  onInlineAiAction,
  onSetChapterPage,
  onSelectChapter,
  onResetSessionWords,
  onWordCount,
  onAutoSave,
  onDirty,
  onToggleFocusMode,
  onDeleteChapter,
  onCreateChapter,
  isCreating = false,
  isSaving = false,
  hasUnsavedChanges = false,
  lastSaved = null,
  saveError = false,
  isRenamingBook = false,
  bookTitleDraft = "",
  onStartRenameBook,
  onBookTitleDraftChange,
  onSaveRenameBook,
  onCancelRenameBook,
  editingTitleId = null,
  tempTitle = "",
  onStartEditTitle,
  onTempTitleChange,
  onSaveTitle,
  onCancelEditTitle,
}: SimplifiedEditViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const chapterToDelete = confirmDeleteId
    ? chapters.find((ch) => ch.id === confirmDeleteId)
    : null;

  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const toolbarRefCb = useCallback((el: HTMLElement | null) => setToolbarTarget(el), []);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const chapterScrollerRef = useRef<HTMLDivElement>(null);
  const chapterActionsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const scroller = chapterScrollerRef.current;
    if (!scroller) return;
    const revealChapter = () => {
      const active = scroller.querySelector<HTMLElement>('[aria-current="true"]');
      if (!active) return;
      const rail = scroller.getBoundingClientRect();
      const bounds = active.getBoundingClientRect();
      if (bounds.left < rail.left || bounds.right > rail.right) {
        // Move only the chapter rail, never the manuscript or its selection.
        scroller.scrollLeft += bounds.left - rail.left - (rail.width - bounds.width) / 2;
      }
    };
    revealChapter();
    const observer = new ResizeObserver(revealChapter);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [selectedChapterId, chapterPage]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (chapterActionsRef.current && event.target instanceof Node && !chapterActionsRef.current.contains(event.target)) {
        chapterActionsRef.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !chapterActionsRef.current?.open) return;
      chapterActionsRef.current.open = false;
      chapterActionsRef.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const toggleSidePanel = () => setSidePanelOpen((open) => !open);
  const [tiptapEditor, setTiptapEditor] = useState<Editor | null>(null);
  const [liveWordCount, setLiveWordCount] = useState(0);
  const handleEditorReady = useCallback((ed: Editor) => {
    setTiptapEditor(ed);
    if (selectedChapterId) onAgentEditorReady?.(ed, selectedChapterId);
  }, [selectedChapterId, onAgentEditorReady]);
  useEffect(() => () => {
    if (selectedChapterId) onAgentEditorReady?.(null, selectedChapterId);
  }, [selectedChapterId, onAgentEditorReady]);
  const handleWordCountWrapped = useCallback((count: number) => { setLiveWordCount(count); onWordCount(count); }, [onWordCount]);

  // Stable ref for onAutoSave to prevent TiptapEditor re-renders
  const onAutoSaveRef = useRef(onAutoSave);
  useEffect(() => {
    onAutoSaveRef.current = onAutoSave;
  }, [onAutoSave]);

  /**
   * Bubble-menu AI actions navigate away from the editor, which unmounts
   * TiptapEditor.
   *
   * This used to be the only place that survived that unmount: the editor's
   * cleanup cleared the autosave debounce without flushing it, so an action
   * fired within 500 ms of the last keystroke dropped those characters, and
   * this call was the local patch for that one path. The cleanup now flushes
   * (see autosaveScheduler), which covers every unmount — chapter switches and
   * route changes included, not just this one.
   *
   * Kept anyway: it persists while the editor is still mounted and the
   * selection is still live, which is a little earlier than unmount, and a
   * duplicate write of identical content is harmless.
   */
  const handleInlineAiActionWithFlush = useCallback(
    (action: InlineAiAction, selectedText: string) => {
      if (tiptapEditor && !tiptapEditor.isDestroyed && selectedChapterId) {
        onAutoSaveRef.current(selectedChapterId, tiptapEditor.getJSON());
      }
      onInlineAiAction?.(action, selectedText);
    },
    [onInlineAiAction, selectedChapterId, tiptapEditor]
  );

  // Memoize word counts so JSON.parse isn't called on every render
  const wordCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ch of visibleChapters) {
      map.set(ch.id, countWordsInContent(ch.content));
    }
    return map;
  }, [visibleChapters]);

  // Stable callback that never changes identity — prevents TiptapEditor re-renders
  const handleAutoSave = useCallback(
    (json: Record<string, unknown>) => {
      if (selectedChapterId) onAutoSaveRef.current(selectedChapterId, json);
    },
    [selectedChapterId]
  );

  // Memoize editor to prevent unnecessary re-renders
  const editorElement = useMemo(() => {
    if (!selectedChapter) return null;
    return (
      <TiptapEditor
        key={selectedChapter.id}
        content={selectedChapter.content}
        onUpdate={handleAutoSave}
        onDirty={onDirty}
        placeholder="Start writing your chapter..."
        bookId={bookId}
        chapterId={selectedChapter.id}
        preset={preset}
        onWordCount={handleWordCountWrapped}
        onFocusModeToggle={onToggleFocusMode}
        focusMode={focusMode}
        toolbarPortalTarget={toolbarTarget}
        onEditorReady={handleEditorReady}
        onInlineAction={handleInlineAiActionWithFlush}
      />
    );
  }, [selectedChapter, handleAutoSave, onDirty, bookId, preset, handleWordCountWrapped, onToggleFocusMode, focusMode, toolbarTarget, handleEditorReady, handleInlineAiActionWithFlush]);

  const saveLabel = saveError
    ? "Changes not saved"
    : isSaving
      ? "Saving…"
      : hasUnsavedChanges
        ? "Unsaved changes"
        : lastSaved
          ? "All changes saved"
          : "";

  return (
    <section className={styles.workspace} aria-label="Book editor">
      <header className={styles.bookHeader}>
        <div className={styles.bookIdentity}>
          <div className={styles.bookMeta}>
            <span className={styles.stateDot} data-published={isPublished} aria-hidden="true" />
            <span>{isPublished ? "Published" : "Draft"}</span>
            <span aria-hidden="true">·</span>
            <span>{chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}</span>
          </div>
          {isRenamingBook && onSaveRenameBook && onCancelRenameBook && onBookTitleDraftChange ? (
            <input
              aria-label="Book title"
              value={bookTitleDraft}
              onChange={(event) => onBookTitleDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSaveRenameBook();
                if (event.key === "Escape") onCancelRenameBook();
              }}
              onBlur={onSaveRenameBook}
              autoFocus
              className={styles.bookTitleInput}
            />
          ) : (
            <h1 className={styles.bookTitle} aria-label={bookTitle}>
              {onStartRenameBook ? (
                <button type="button" onClick={onStartRenameBook} aria-label="Rename book" title="Rename book">
                  <span>{bookTitle}</span>
                  <Pencil size={15} aria-hidden="true" />
                </button>
              ) : bookTitle}
            </h1>
          )}
        </div>
        <div className={styles.headerActions}>
          <span className={styles.saveLabel} data-error={saveError}>
            {lastSaved && !saveError && !isSaving && !hasUnsavedChanges && <Check size={14} aria-hidden="true" />}
            {saveLabel}
          </span>
          <button type="button" className={styles.focusButton} onClick={onToggleFocusMode} aria-label="Focus mode">
            <Maximize2 size={16} aria-hidden="true" />
            <span>Focus</span>
          </button>
        </div>
      </header>

      <div className={styles.workflow}>
        <BookWorkflowHeader bookId={bookId} language={activeLanguage} activeTool={activeTool} tools={tools} bare compact />
      </div>

      <div className={styles.canvas}>
        <div className={styles.editingHeader}>
          <div className={styles.chapterBar}>
            <nav className={styles.chapterNavigation} aria-label="Chapters">
              {totalPages > 1 && (
                <button type="button" onClick={() => onSetChapterPage(Math.max(0, chapterPage - 1))}
                  disabled={chapterPage === 0} className={styles.iconButton} aria-label="Previous chapters">
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
              )}
              <div ref={chapterScrollerRef} className={styles.chapterScroller}>
                {visibleChapters.map((chapter, index) => {
                  const globalIndex = startIndex + index;
                  const isActive = chapter.id === selectedChapterId;
                  const chapterWords = wordCounts.get(chapter.id) ?? 0;
                  const isEmpty = chapterWords === 0;
                  return (
                    <button key={chapter.id} type="button" onClick={() => {
                      onSelectChapter(chapter.id);
                      onResetSessionWords();
                    }} className={styles.chapterTab}
                      aria-label={`Chapter ${globalIndex + 1}: ${chapter.title || "Untitled chapter"}${isEmpty ? " (empty)" : ""}`}
                      aria-current={isActive ? "true" : undefined}
                      title={`${chapter.title || "Untitled chapter"} · ${chapterWords.toLocaleString()} words`}>
                      <span className={styles.chapterNumber}>{String(globalIndex + 1).padStart(2, "0")}</span>
                      <span className={styles.chapterName}>{chapter.title || "Untitled chapter"}</span>
                    </button>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <button type="button" onClick={() => onSetChapterPage(Math.min(totalPages - 1, chapterPage + 1))}
                  disabled={chapterPage >= totalPages - 1} className={styles.iconButton} aria-label="Next chapters">
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </nav>
            {selectedChapter && (onStartEditTitle || (onDeleteChapter && chapters.length > 1)) && (
              <details ref={chapterActionsRef} className={styles.chapterActions}>
                <summary role="button" aria-label="Chapter actions" title="Chapter actions"><MoreHorizontal size={18} aria-hidden="true" /></summary>
                <div className={styles.chapterActionMenu}>
                  {onStartEditTitle && (
                    <button type="button" onClick={() => {
                      if (chapterActionsRef.current) chapterActionsRef.current.open = false;
                      onStartEditTitle(selectedChapter.id, selectedChapter.title);
                    }}><Pencil size={15} aria-hidden="true" />Rename chapter</button>
                  )}
                  {onDeleteChapter && chapters.length > 1 && (
                    <button type="button" onClick={() => {
                      if (chapterActionsRef.current) chapterActionsRef.current.open = false;
                      chapterActionsRef.current?.querySelector("summary")?.focus();
                      setConfirmDeleteId(selectedChapter.id);
                    }}><Trash2 size={15} aria-hidden="true" />Delete chapter</button>
                  )}
                </div>
              </details>
            )}
            {onCreateChapter && (
              <button type="button" onClick={onCreateChapter} disabled={isCreating}
                className={styles.addChapter} aria-label="Add chapter" title={isCreating ? "Creating…" : "Add chapter"}>
                <Plus size={17} aria-hidden="true" /><span>{isCreating ? "Creating…" : "Chapter"}</span>
              </button>
            )}
          </div>
          <div className={styles.toolbarRow}>
            <div ref={toolbarRefCb} className={styles.toolbarTarget} />
            <button ref={toolsButtonRef} type="button" onClick={toggleSidePanel}
              className={styles.toolsButton} aria-label="Writing tools" aria-expanded={sidePanelOpen} aria-controls={tiptapEditor ? `writing-tools-${bookId}` : undefined}>
              <PanelRight size={17} aria-hidden="true" /><span>Tools</span>
            </button>
          </div>
        </div>

        <div className={styles.writingLayout}>
          <div className={styles.manuscript}>
            {selectedChapter && editingTitleId === selectedChapter.id && onSaveTitle && onCancelEditTitle && onTempTitleChange && (
              <div className={styles.chapterHeading}>
                <label className={styles.renameLabel} htmlFor={`chapter-title-${bookId}`}>Chapter title</label>
                <input id={`chapter-title-${bookId}`} value={tempTitle}
                  onChange={(event) => onTempTitleChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSaveTitle(selectedChapter.id);
                    if (event.key === "Escape") onCancelEditTitle();
                  }}
                  onBlur={() => onSaveTitle(selectedChapter.id)} autoFocus className={styles.chapterTitleInput} />
              </div>
            )}
            {editorElement ?? (
              <div className={styles.emptyState}>
                <h2>{chapters.length === 0 ? "Your first chapter starts here." : "Choose a chapter."}</h2>
                <p>{chapters.length === 0 ? "Add a chapter and make room for your story." : "Select a chapter above to keep writing."}</p>
                {chapters.length === 0 && onCreateChapter && (
                  <button type="button" onClick={onCreateChapter} disabled={isCreating} className={styles.focusButton}>
                    <Plus size={16} aria-hidden="true" />{isCreating ? "Creating…" : "Add your first chapter"}
                  </button>
                )}
              </div>
            )}
          </div>
          {tiptapEditor && (
            <div id={`writing-tools-${bookId}`} className={styles.sidePanel} data-open={sidePanelOpen}>
              <EditorSidePanel editor={tiptapEditor} preset={preset} onPresetChange={onPresetChange ?? (() => {})}
                open={sidePanelOpen} onToggle={() => {
                  toggleSidePanel();
                  toolsButtonRef.current?.focus();
                }} />
            </div>
          )}
        </div>
        <div className={styles.statusBar}>
          <EditorStatusBar wordCount={liveWordCount} isSaving={isSaving} hasUnsavedChanges={hasUnsavedChanges}
            lastSaved={lastSaved} saveError={saveError} focusMode={focusMode} sidePanelOpen={sidePanelOpen}
            onToggleFocusMode={onToggleFocusMode} onToggleSidePanel={toggleSidePanel} />
        </div>
      </div>

      {/* Delete chapter confirmation */}
      {onDeleteChapter && (
        <Dialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
          <DialogHeader>
            <DialogTitle>Delete chapter</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{chapterToDelete?.title || "this chapter"}</strong>? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-background dark:border-border dark:text-foreground dark:hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDeleteId) {
                  onDeleteChapter(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
              className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Delete
            </button>
          </DialogFooter>
        </Dialog>
      )}

    </section>
  );
}
