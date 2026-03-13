"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { getLanguageLabel } from "@/lib/languages";
import { getAudiobookEnabled } from "@/lib/flags";

const TiptapRenderer = dynamic(
  () => import("@/components/editor/TiptapRenderer"),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded bg-slate-100 dark:bg-white/5" /> },
);

const ChapterAudiobookPlayer = dynamic(
  () => import("@/app/(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer"),
  { ssr: false },
);

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
  book_version_id: string;
};

type BookVersion = {
  id: string;
  book_id: string;
  language_code: string;
  status: string;
  published_at?: string | null;
  published_chapter_count?: number | null;
  error_message?: string | null;
};

export type PolishPanelProps = {
  bookId: string;
  chapters: Chapter[];
  selectedChapterId: string | null;
  bookVersions: BookVersion[];
  activeVersion: BookVersion | null;
  audiobookStatus: string | null;
  onSelectChapter: (id: string) => void;
  onOpenEdit: () => void;
  onOpenTranslate: () => void;
  onOpenAudiobook: () => void;
};

function wordCount(content: string | null): number {
  if (!content) return 0;
  let text = content;
  try {
    const parsed = JSON.parse(content);
    text = extractText(parsed);
  } catch {
    // plain text
  }
  return text.split(/\s+/).filter(Boolean).length;
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractText).join(" ");
  }
  return "";
}

type CompareChapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
};

export default function PolishPanel({
  bookId,
  chapters,
  selectedChapterId,
  bookVersions,
  activeVersion,
  audiobookStatus,
  onSelectChapter,
  onOpenEdit,
  onOpenTranslate,
  onOpenAudiobook,
}: PolishPanelProps) {
  const audiobookEnabled = getAudiobookEnabled();

  const selectedChapter = useMemo(
    () => chapters.find((ch) => ch.id === selectedChapterId) ?? chapters[0] ?? null,
    [chapters, selectedChapterId],
  );

  const totalWords = useMemo(
    () => chapters.reduce((sum, ch) => sum + wordCount(ch.content), 0),
    [chapters],
  );

  const activeLanguage = activeVersion?.language_code ?? "sv";

  // Other versions available for comparison
  const otherVersions = useMemo(
    () => bookVersions.filter((v) => v.id !== activeVersion?.id),
    [bookVersions, activeVersion?.id],
  );

  // Compare mode state
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [compareChapters, setCompareChapters] = useState<CompareChapter[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // Fetch chapters from compare version
  const loadCompareChapters = useCallback(async (versionId: string) => {
    setCompareLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("chapters")
        .select("id, title, content, order")
        .eq("book_version_id", versionId)
        .order("order", { ascending: true });
      setCompareChapters(
        (data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title ?? ""),
          content: typeof row.content === "string" ? row.content : null,
          order: typeof row.order === "number" ? row.order : 0,
        })),
      );
    } catch {
      setCompareChapters([]);
    } finally {
      setCompareLoading(false);
    }
  }, []);

  useEffect(() => {
    if (compareVersionId) {
      void loadCompareChapters(compareVersionId);
    } else {
      setCompareChapters([]);
    }
  }, [compareVersionId, loadCompareChapters]);

  // Match compare chapter by order
  const compareChapter = useMemo(() => {
    if (!selectedChapter || compareChapters.length === 0) return null;
    return compareChapters.find((ch) => ch.order === selectedChapter.order) ?? null;
  }, [selectedChapter, compareChapters]);

  const compareVersion = useMemo(
    () => bookVersions.find((v) => v.id === compareVersionId) ?? null,
    [bookVersions, compareVersionId],
  );

  // Per-chapter stats
  const chapterStats = useMemo(
    () => chapters.map((ch, i) => ({
      id: ch.id,
      index: i,
      title: ch.title,
      words: wordCount(ch.content),
      hasContent: Boolean(ch.content),
    })),
    [chapters],
  );

  const versionSummaries = useMemo(() => {
    return bookVersions.map((v) => ({
      id: v.id,
      language: getLanguageLabel(v.language_code),
      languageCode: v.language_code,
      isPublished: Boolean(v.published_at),
      publishedChapters: v.published_chapter_count,
      hasError: Boolean(v.error_message),
    }));
  }, [bookVersions]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Polish</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
          Review text, compare translations, and preview audio.
        </p>
      </div>

      {/* Status row */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onOpenEdit} className="rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2 text-left backdrop-blur-sm transition hover:border-black/[0.12] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.12]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Text</span>
          <span className="ml-2 text-xs font-medium text-slate-700 dark:text-white/70">{chapters.length} ch &middot; {totalWords.toLocaleString()} words</span>
        </button>
        <button type="button" onClick={onOpenTranslate} className="rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2 text-left backdrop-blur-sm transition hover:border-black/[0.12] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.12]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Languages</span>
          <span className="ml-2 text-xs font-medium text-slate-700 dark:text-white/70">{versionSummaries.map((v) => v.language).join(", ")}</span>
        </button>
        <button type="button" onClick={onOpenAudiobook} className="rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2 text-left backdrop-blur-sm transition hover:border-black/[0.12] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.12]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">Audio</span>
          <span className="ml-2 text-xs font-medium text-slate-700 dark:text-white/70">
            {audiobookStatus === "generated" ? "Ready" : audiobookStatus === "generating" ? "Generating..." : "Not started"}
          </span>
        </button>
      </div>

      {/* Version status */}
      {versionSummaries.length > 1 && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Versions</h3>
          <div className="space-y-1.5">
            {versionSummaries.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-xs">
                <span className={`font-medium ${v.languageCode === activeLanguage ? "text-[#907AFF]" : "text-slate-700 dark:text-white/70"}`}>
                  {v.language}
                  {v.languageCode === activeLanguage && (
                    <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-white/30">editing</span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  {v.hasError && (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">Error</span>
                  )}
                  {v.publishedChapters != null && (
                    <span className="text-[10px] text-slate-400 dark:text-white/30">{v.publishedChapters} ch live</span>
                  )}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    v.isPublished
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
                  }`}>
                    {v.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chapter quality overview */}
      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Chapters</h3>
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {chapterStats.map((ch) => {
            const isActive = ch.id === selectedChapter?.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChapter(ch.id)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  isActive
                    ? "bg-[#907AFF]/10 text-[#907AFF] dark:bg-[#907AFF]/15"
                    : "text-slate-600 hover:bg-slate-50 dark:text-white/60 dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="truncate">
                  <span className="mr-1.5 inline-block w-5 text-right font-medium tabular-nums text-slate-400 dark:text-white/30">{ch.index + 1}</span>
                  {ch.title}
                </span>
                <span className="ml-2 shrink-0 tabular-nums text-slate-400 dark:text-white/30">
                  {ch.hasContent ? `${ch.words.toLocaleString()} w` : "empty"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compare translations */}
      {otherVersions.length > 0 && selectedChapter && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Compare translations</h3>
            <select
              value={compareVersionId ?? ""}
              onChange={(e) => setCompareVersionId(e.target.value || null)}
              className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
            >
              <option value="">Select language...</option>
              {otherVersions.map((v) => (
                <option key={v.id} value={v.id}>{getLanguageLabel(v.language_code)}</option>
              ))}
            </select>
          </div>

          {compareVersionId && (
            <div className="grid grid-cols-2 divide-x divide-black/[0.05] dark:divide-white/[0.06]">
              {/* Current version */}
              <div className="p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#907AFF]">
                  {getLanguageLabel(activeLanguage)} (current)
                </p>
                <h4 className="mb-2 text-xs font-medium text-slate-900 dark:text-white">{selectedChapter.title}</h4>
                <div className="max-h-80 overflow-y-auto">
                  {selectedChapter.content ? (
                    <TiptapRenderer
                      content={selectedChapter.content}
                      className="text-xs leading-relaxed text-slate-600 dark:text-white/60"
                    />
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-white/30">No content</p>
                  )}
                </div>
              </div>

              {/* Compare version */}
              <div className="p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
                  {compareVersion ? getLanguageLabel(compareVersion.language_code) : "..."}
                </p>
                {compareLoading ? (
                  <div className="h-20 animate-pulse rounded bg-slate-100 dark:bg-white/5" />
                ) : compareChapter ? (
                  <>
                    <h4 className="mb-2 text-xs font-medium text-slate-900 dark:text-white">{compareChapter.title}</h4>
                    <div className="max-h-80 overflow-y-auto">
                      {compareChapter.content ? (
                        <TiptapRenderer
                          content={compareChapter.content}
                          className="text-xs leading-relaxed text-slate-600 dark:text-white/60"
                        />
                      ) : (
                        <p className="text-xs text-slate-400 dark:text-white/30">No content</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="py-4 text-xs text-slate-400 dark:text-white/30">No matching chapter found for this order.</p>
                )}
              </div>
            </div>
          )}

          {!compareVersionId && (
            <p className="px-4 py-4 text-xs text-slate-400 dark:text-white/30">
              Select a language to compare side-by-side with the current version.
            </p>
          )}
        </div>
      )}

      {/* Audio preview */}
      {audiobookEnabled && selectedChapter && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
            Audio: {selectedChapter.title}
          </h3>
          <ChapterAudiobookPlayer
            bookId={bookId}
            chapterId={selectedChapter.id}
            audiobookStatus={audiobookStatus}
            isAuthorView
          />
        </div>
      )}
    </div>
  );
}
