"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TiptapEditor from "@/components/editor/TiptapEditor";
import WriterStatsBar from "@/components/editor/WriterStatsBar";
import CommandPalette from "@/components/editor/CommandPalette";

const STORAGE_PRESET = "verkli_editor_preset";

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
};

type Book = {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: string;
};

type Props = {
  book: Book;
  chapters: Chapter[];
};

export default function BookEditor({ book, chapters: initialChapters }: Props) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    initialChapters[0]?.id ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [preset, setPreset] = useState("novel");
  const [wordCount, setWordCount] = useState(0);
  const [sessionStartWords, setSessionStartWords] = useState<number | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const savingRef = useRef(false);

  const selectedChapter = chapters.find((ch) => ch.id === selectedChapterId);

  const handlePublish = async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to publish");
        return;
      }
      router.refresh();
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[publish failed]", err);
      }
      alert("Failed to publish");
    } finally {
      setIsPublishing(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_PRESET);
    if (stored && ["novel", "essay", "screenplay"].includes(stored)) setPreset(stored);
  }, []);

  useEffect(() => {
    if (preset) localStorage.setItem(STORAGE_PRESET, preset);
  }, [preset]);

  useEffect(() => {
    if (selectedChapterId && sessionStartWords === null) {
      const ch = chapters.find((c) => c.id === selectedChapterId);
      if (ch?.content) {
        try {
          const parsed = typeof ch.content === "string" ? JSON.parse(ch.content) : ch.content;
          const text = extractText(parsed);
          setSessionStartWords(text.trim().split(/\s+/).filter(Boolean).length);
        } catch {
          setSessionStartWords(0);
        }
      } else {
        setSessionStartWords(0);
      }
    }
  }, [selectedChapterId, chapters, sessionStartWords]);

  const sessionWords = sessionStartWords !== null ? Math.max(0, wordCount - sessionStartWords) : 0;

  const handleAutoSave = useCallback(async (chapterId: string, jsonContent: Record<string, unknown>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const supabase = createClient();
    const contentString = JSON.stringify(jsonContent);
    const { error } = await supabase.from("chapters").update({ content: contentString }).eq("id", chapterId);
    savingRef.current = false;
    setIsSaving(false);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[autosave failed]", error);
      }
      return;
    }
    setChapters((prev) => prev.map((ch) => (ch.id === chapterId ? { ...ch, content: contentString } : ch)));
    setLastSaved(new Date());
  }, []);

  const handleCreateChapter = async () => {
    setIsCreating(true);
    const supabase = createClient();
    const maxOrder = chapters.length > 0 ? Math.max(...chapters.map((ch) => ch.order)) : 0;
    const { data, error } = await supabase
      .from("chapters")
      .insert({
        book_id: book.id,
        title: `Chapter ${maxOrder + 1}`,
        content: "",
        order: maxOrder + 1,
      })
      .select("id, title, content, order")
      .single();
    setIsCreating(false);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[createChapter failed]", error);
      }
      alert(`Failed to create chapter: ${error.message || "Unknown error"}`);
      return;
    }
    if (data) {
      setChapters([...chapters, data]);
      setSelectedChapterId(data.id);
      setSessionStartWords(0);
      router.refresh();
    }
  };

  const handleStartEditTitle = (chapterId: string, currentTitle: string) => {
    setEditingTitleId(chapterId);
    setTempTitle(currentTitle);
  };

  const handleSaveTitle = async (chapterId: string) => {
    if (!tempTitle.trim()) {
      setEditingTitleId(null);
      return;
    }
    setIsSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("chapters").update({ title: tempTitle.trim() }).eq("id", chapterId);
    setIsSaving(false);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[updateChapterTitle failed]", error);
      }
      setEditingTitleId(null);
      return;
    }
    setChapters(chapters.map((ch) => (ch.id === chapterId ? { ...ch, title: tempTitle.trim() } : ch)));
    setEditingTitleId(null);
    router.refresh();
  };

  const handleCancelEditTitle = () => {
    setEditingTitleId(null);
    setTempTitle("");
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setFocusMode((f) => !f);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode]);

  const commands = [
    { id: "focus", label: "Toggle focus mode", shortcut: "⌘⇧F", run: () => setFocusMode((f) => !f) },
    { id: "new-chapter", label: "New chapter", run: handleCreateChapter },
    { id: "preset-novel", label: "Preset: Novel", run: () => setPreset("novel") },
    { id: "preset-essay", label: "Preset: Essay", run: () => setPreset("essay") },
    { id: "preset-screenplay", label: "Preset: Screenplay", run: () => setPreset("screenplay") },
  ];

  if (focusMode) {
    return (
      <>
        {/* z-[10001] so focus overlay is above navbar (z-9999) */}
        <div className="fixed inset-0 z-[10001] flex flex-col bg-background">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900">
            <span className="text-sm text-slate-500 dark:text-white/50">
              Focus mode — Esc or ⌘⇧F to exit
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">{wordCount.toLocaleString()} words</span>
              {sessionWords > 0 && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">+{sessionWords} this session</span>
              )}
              <button
                onClick={() => setFocusMode(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
              >
                Exit focus
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {selectedChapter ? (
              <div className="mx-auto max-w-3xl">
                <TiptapEditor
                  key={selectedChapter.id}
                  content={selectedChapter.content}
                  onUpdate={(json) => handleAutoSave(selectedChapter.id, json)}
                  placeholder="Start writing..."
                  bookId={book.id}
                  chapterId={selectedChapter.id}
                  preset={preset}
                  onWordCount={setWordCount}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-slate-500">Exit focus mode to select a chapter</p>
              </div>
            )}
          </div>
        </div>
        <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />
      </>
    );
  }

  return (
    <>
      <section className="mx-auto max-w-[1400px] px-6 py-12">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {book.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
              {book.status === "DRAFT" ? "Draft" : "Published"} • {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
            </p>
          </div>
          {book.status === "DRAFT" && (
            <button
              onClick={handlePublish}
              disabled={isPublishing || chapters.length === 0}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPublishing ? "Publishing..." : "Publish"}
            </button>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Chapters</h2>
              <button
                onClick={handleCreateChapter}
                disabled={isCreating}
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isCreating ? "..." : "+ New"}
              </button>
            </div>

            {chapters.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-white/50">No chapters yet. Create one to get started.</p>
            ) : (
              <ul className="space-y-1">
                {chapters.map((chapter) => (
                  <li key={chapter.id}>
                    {editingTitleId === chapter.id ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveTitle(chapter.id);
                            if (e.key === "Escape") handleCancelEditTitle();
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveTitle(chapter.id)}
                            className="flex-1 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEditTitle}
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedChapterId(chapter.id);
                          setSessionStartWords(null);
                        }}
                        onDoubleClick={() => handleStartEditTitle(chapter.id, chapter.title)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                          selectedChapterId === chapter.id
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-700 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/5"
                        }`}
                      >
                        <span className="block truncate font-medium">{chapter.title}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {chapters.length > 0 && (
              <p className="mt-4 text-xs text-slate-400 dark:text-white/40">Double-click to rename</p>
            )}
          </div>

          <div>
            {selectedChapter ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{selectedChapter.title}</h2>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-slate-500 dark:text-white/50">
                      {isSaving ? (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                          Saving...
                        </span>
                      ) : lastSaved ? (
                        <span className="text-green-600 dark:text-green-400">
                          Saved {lastSaved.toLocaleTimeString()}
                        </span>
                      ) : (
                        "Autosave enabled"
                      )}
                    </p>
                    <button
                      onClick={() => handleStartEditTitle(selectedChapter.id, selectedChapter.title)}
                      className="text-xs text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
                    >
                      Rename
                    </button>
                  </div>
                </div>

                <WriterStatsBar
                  wordCount={wordCount}
                  sessionWords={sessionWords}
                  onFocusToggle={() => setFocusMode(true)}
                  focusMode={false}
                  preset={preset}
                  onPresetChange={setPreset}
                  onNewChapter={handleCreateChapter}
                  onCommandPalette={() => setCommandPaletteOpen(true)}
                />

                <div className="mt-3">
                  <TiptapEditor
                    key={selectedChapter.id}
                    content={selectedChapter.content}
                    onUpdate={(json) => handleAutoSave(selectedChapter.id, json)}
                    placeholder="Start writing your chapter..."
                    bookId={book.id}
                    chapterId={selectedChapter.id}
                    preset={preset}
                    onWordCount={setWordCount}
                  />
                </div>
              </>
            ) : (
              <div className="flex h-[500px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/5">
                <p className="text-slate-500 dark:text-white/50">
                  {chapters.length === 0 ? "Create your first chapter to start writing" : "Select a chapter from the sidebar"}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />
    </>
  );
}

function extractText(node: { content?: unknown[]; text?: string }): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map((c) => extractText(c as { content?: unknown[]; text?: string })).join("");
  }
  return "";
}
