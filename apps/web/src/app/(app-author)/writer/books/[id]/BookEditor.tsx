"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TiptapEditor from "@/components/editor/TiptapEditor";

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
  const savingRef = useRef(false);

  const selectedChapter = chapters.find((ch) => ch.id === selectedChapterId);

  const handleAutoSave = useCallback(async (chapterId: string, jsonContent: Record<string, unknown>) => {
    if (savingRef.current) return;
    
    savingRef.current = true;
    setIsSaving(true);
    
    const supabase = createClient();
    const contentString = JSON.stringify(jsonContent);
    
    const { error } = await supabase
      .from("chapters")
      .update({ content: contentString })
      .eq("id", chapterId);
    
    savingRef.current = false;
    setIsSaving(false);
    
    if (error) {
      console.error("Failed to autosave:", error);
      return;
    }
    
    setChapters((prev) =>
      prev.map((ch) =>
        ch.id === chapterId ? { ...ch, content: contentString } : ch
      )
    );
    setLastSaved(new Date());
  }, []);

  const handleCreateChapter = async () => {
    setIsCreating(true);
    const supabase = createClient();

    const maxOrder = chapters.length > 0 ? Math.max(...chapters.map((ch) => ch.order)) : 0;
    const newOrder = maxOrder + 1;

    const { data, error } = await supabase
      .from("chapters")
      .insert({
        book_id: book.id,
        title: `Chapter ${newOrder}`,
        content: "",
        order: newOrder,
      })
      .select("id, title, content, order")
      .single();

    setIsCreating(false);

    if (error) {
      console.error("Failed to create chapter:", error);
      alert(`Failed to create chapter: ${error.message || "Unknown error"}`);
      return;
    }

    if (data) {
      setChapters([...chapters, data]);
      setSelectedChapterId(data.id);
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

    const { error } = await supabase
      .from("chapters")
      .update({ title: tempTitle.trim() })
      .eq("id", chapterId);

    setIsSaving(false);

    if (error) {
      console.error("Failed to update title:", error);
      alert("Failed to update title");
      setEditingTitleId(null);
      return;
    }

    setChapters(
      chapters.map((ch) =>
        ch.id === chapterId ? { ...ch, title: tempTitle.trim() } : ch
      )
    );
    setEditingTitleId(null);
    router.refresh();
  };

  const handleCancelEditTitle = () => {
    setEditingTitleId(null);
    setTempTitle("");
  };

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {book.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
          {book.status === "DRAFT" ? "Draft" : "Published"} • {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Chapter list sidebar */}
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
            <p className="text-sm text-slate-500 dark:text-white/50">
              No chapters yet. Create one to get started.
            </p>
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
                      onClick={() => setSelectedChapterId(chapter.id)}
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
            <p className="mt-4 text-xs text-slate-400 dark:text-white/40">
              Double-click to rename
            </p>
          )}
        </div>

        {/* Editor panel */}
        <div>
          {selectedChapter ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {selectedChapter.title}
                </h2>
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
              <TiptapEditor
                key={selectedChapter.id}
                content={selectedChapter.content}
                onUpdate={(json) => handleAutoSave(selectedChapter.id, json)}
                placeholder="Start writing your chapter..."
                bookId={book.id}
                chapterId={selectedChapter.id}
              />
            </>
          ) : (
            <div className="flex h-[500px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/5">
              <p className="text-slate-500 dark:text-white/50">
                {chapters.length === 0
                  ? "Create your first chapter to start writing"
                  : "Select a chapter from the sidebar"}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
