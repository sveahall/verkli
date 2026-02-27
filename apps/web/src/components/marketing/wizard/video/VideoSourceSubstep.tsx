"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChapterExcerpt = {
  id: string;
  title: string;
  text: string;
  order: number;
};

type ChaptersResponse = {
  chapters?: ChapterExcerpt[];
  error?: string;
};

type VideoSourceSubstepProps = {
  bookId: string | null;
  selectedChapterId: string | null;
  selectedText: string;
  onUseSelection: (chapterId: string, selectedText: string) => void;
};

export default function VideoSourceSubstep({
  bookId,
  selectedChapterId,
  selectedText,
  onUseSelection,
}: VideoSourceSubstepProps) {
  const [chapters, setChapters] = useState<ChapterExcerpt[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(selectedChapterId);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setChapterId(selectedChapterId);
  }, [selectedChapterId]);

  useEffect(() => {
    if (!bookId) {
      setChapters([]);
      setChapterId(null);
      return;
    }

    let ignore = false;
    setIsLoading(true);
    setErrorMessage(null);

    void fetch(`/api/books/${bookId}/chapters`, {
      method: "GET",
      credentials: "include",
    })
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => ({}))) as ChaptersResponse;
        if (ignore) return;
        if (!response.ok) {
          setChapters([]);
          setChapterId(null);
          setErrorMessage(payload.error ?? "Kunde inte hamta kapitel.");
          return;
        }
        const nextChapters = Array.isArray(payload.chapters) ? payload.chapters : [];
        setChapters(nextChapters);
        if (nextChapters.length === 0) {
          setChapterId(null);
          return;
        }
        if (
          selectedChapterId &&
          nextChapters.some((chapter) => chapter.id === selectedChapterId)
        ) {
          setChapterId(selectedChapterId);
          return;
        }
        setChapterId(nextChapters[0].id);
      })
      .catch(() => {
        if (ignore) return;
        setChapters([]);
        setChapterId(null);
        setErrorMessage("Natverksfel nar kapitel hamtades.");
      })
      .finally(() => {
        if (ignore) return;
        setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [bookId, selectedChapterId]);

  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === chapterId) ?? null,
    [chapters, chapterId]
  );

  const handleUseSelection = () => {
    if (!chapterId || !activeChapter) {
      setSelectionMessage("Valj ett kapitel forst.");
      return;
    }

    const element = textRef.current;
    if (!element) {
      setSelectionMessage("Textvyn kunde inte laddas.");
      return;
    }

    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = activeChapter.text.slice(start, end).trim();
    if (selected.length === 0) {
      setSelectionMessage("Markera ett textutdrag innan du klickar Use selection.");
      return;
    }

    onUseSelection(chapterId, selected);
    setSelectionMessage(null);
  };

  return (
    <section className="card-base p-5">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Source</h2>
        <p className="text-[13px] text-slate-500 dark:text-white/50">
          Valj kapitel, markera utdrag och anvand det som grund for videon.
        </p>
      </div>

      {isLoading ? (
        <p className="text-[13px] text-slate-500 dark:text-white/50">Laddar kapitel…</p>
      ) : errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/40 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </p>
      ) : chapters.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70">
          Inga kapitel hittades for vald bok.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-white/60">
              Chapter
            </label>
            <select
              className="input-base"
              value={chapterId ?? ""}
              onChange={(event) => setChapterId(event.target.value)}
            >
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-white/60">
              Chapter text
            </label>
            <textarea
              ref={textRef}
              readOnly
              className="input-base min-h-[220px] resize-y"
              value={activeChapter?.text ?? ""}
              placeholder="Inget innehall i valt kapitel."
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleUseSelection}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!chapterId || !activeChapter || activeChapter.text.trim().length === 0}
            >
              Use selection
            </button>
            <p className="text-[12px] text-slate-500 dark:text-white/50">
              Markera text i rutan ovan for att valja utdrag.
            </p>
          </div>

          {selectionMessage && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/20 dark:text-amber-300">
              {selectionMessage}
            </p>
          )}

          {selectedText.trim().length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              <p className="font-semibold">Valt utdrag</p>
              <p className="mt-1 max-h-[88px] overflow-hidden whitespace-pre-wrap">
                {selectedText}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
