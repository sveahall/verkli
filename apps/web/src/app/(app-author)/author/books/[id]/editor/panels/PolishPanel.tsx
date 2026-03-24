"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { getLanguageLabel } from "@/lib/languages";

const TiptapRenderer = dynamic(
  () => import("@/components/editor/TiptapRenderer"),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded bg-slate-100 dark:bg-white/5" /> },
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

/* ── Text helpers ── */

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractText).join(" ");
  }
  return "";
}

function getPlainText(content: string | null): string {
  if (!content) return "";
  try {
    const parsed = JSON.parse(content);
    return extractText(parsed);
  } catch {
    return content;
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}

function avgWordsPerSentence(text: string): number {
  const words = countWords(text);
  const sentences = countSentences(text);
  if (sentences === 0) return 0;
  return Math.round((words / sentences) * 10) / 10;
}

function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 230));
}

function countParagraphs(content: string | null): number {
  if (!content) return 0;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.content)) {
      return parsed.content.filter(
        (node: Record<string, unknown>) => node.type === "paragraph" && node.content,
      ).length;
    }
  } catch {
    // plain text — count by double newlines
    return content.split(/\n\s*\n/).filter(Boolean).length;
  }
  return 0;
}

type CompareChapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
};

type ChapterAnalysis = {
  id: string;
  index: number;
  title: string;
  words: number;
  paragraphs: number;
  sentences: number;
  avgWps: number;
  readMin: number;
  hasContent: boolean;
};

export default function PolishPanel({
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
  const selectedChapter = useMemo(
    () => chapters.find((ch) => ch.id === selectedChapterId) ?? chapters[0] ?? null,
    [chapters, selectedChapterId],
  );

  const activeLanguage = activeVersion?.language_code ?? "sv";

  // ── Per-chapter analysis ──
  const chapterAnalyses: ChapterAnalysis[] = useMemo(
    () =>
      chapters.map((ch, i) => {
        const text = getPlainText(ch.content);
        const words = countWords(text);
        const sentences = countSentences(text);
        return {
          id: ch.id,
          index: i,
          title: ch.title,
          words,
          paragraphs: countParagraphs(ch.content),
          sentences,
          avgWps: avgWordsPerSentence(text),
          readMin: estimateReadingMinutes(words),
          hasContent: Boolean(ch.content),
        };
      }),
    [chapters],
  );

  // ── Book-level stats ──
  const bookStats = useMemo(() => {
    const totalWords = chapterAnalyses.reduce((s, ch) => s + ch.words, 0);
    const totalSentences = chapterAnalyses.reduce((s, ch) => s + ch.sentences, 0);
    const emptyChapters = chapterAnalyses.filter((ch) => !ch.hasContent).length;
    const shortChapters = chapterAnalyses.filter((ch) => ch.hasContent && ch.words < 200).length;
    const avgChapterLength = chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0;
    const avgWps = totalSentences > 0 ? Math.round((totalWords / totalSentences) * 10) / 10 : 0;
    return { totalWords, totalSentences, emptyChapters, shortChapters, avgChapterLength, avgWps, readMin: estimateReadingMinutes(totalWords) };
  }, [chapterAnalyses, chapters.length]);

  // ── Selected chapter analysis ──
  const selectedAnalysis = useMemo(
    () => chapterAnalyses.find((a) => a.id === selectedChapter?.id) ?? null,
    [chapterAnalyses, selectedChapter?.id],
  );

  // ── Compare mode ──
  const otherVersions = useMemo(
    () => bookVersions.filter((v) => v.id !== activeVersion?.id),
    [bookVersions, activeVersion?.id],
  );

  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [compareChapters, setCompareChapters] = useState<CompareChapter[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  const loadCompareChapters = useCallback(async (versionId: string) => {
    setCompareLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("chapters")
        .select("id, title, content, order")
        .eq("book_version_id", versionId)
        .order("order", { ascending: true });
      if (error) {
        console.error("[PolishPanel] compare chapters load failed", error.message);
        setCompareChapters([]);
        return;
      }
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

  const compareChapter = useMemo(() => {
    if (!selectedChapter || compareChapters.length === 0) return null;
    return compareChapters.find((ch) => ch.order === selectedChapter.order) ?? null;
  }, [selectedChapter, compareChapters]);

  const compareVersion = useMemo(
    () => bookVersions.find((v) => v.id === compareVersionId) ?? null,
    [bookVersions, compareVersionId],
  );

  // ── Word distribution bar (max chapter = 100%) ──
  const maxChapterWords = useMemo(
    () => Math.max(...chapterAnalyses.map((a) => a.words), 1),
    [chapterAnalyses],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Book overview stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Words", value: bookStats.totalWords.toLocaleString() },
          { label: "Chapters", value: chapters.length.toString() },
          { label: "Reading time", value: `${bookStats.readMin} min` },
          { label: "Avg words/sentence", value: bookStats.avgWps.toFixed(1) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-black/[0.05] bg-white/60 px-4 py-3 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40">
              {stat.label}
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Warnings ── */}
      {(bookStats.emptyChapters > 0 || bookStats.shortChapters > 0) && (
        <div className="space-y-2">
          {bookStats.emptyChapters > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/5">
              <span className="mt-0.5 text-sm text-amber-500">!</span>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{bookStats.emptyChapters} empty {bookStats.emptyChapters === 1 ? "chapter" : "chapters"}</span>
                {" "}without any content.
              </p>
            </div>
          )}
          {bookStats.shortChapters > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/5">
              <span className="mt-0.5 text-sm text-amber-500">!</span>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{bookStats.shortChapters} {bookStats.shortChapters === 1 ? "chapter is" : "chapters are"} under 200 words</span>
                {" "}&mdash; may feel too short for readers.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Chapter breakdown with word bars ── */}
      <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
            Chapter breakdown
          </h3>
        </div>
        <div className="max-h-[340px] overflow-y-auto">
          {chapterAnalyses.map((ch) => {
            const isActive = ch.id === selectedChapter?.id;
            const barWidth = ch.words > 0 ? Math.max(2, (ch.words / maxChapterWords) * 100) : 0;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChapter(ch.id)}
                className={`group flex w-full items-center gap-3 border-b border-black/[0.03] px-4 py-2.5 text-left transition last:border-b-0 dark:border-white/[0.03] ${
                  isActive
                    ? "bg-[#907AFF]/[0.06] dark:bg-[#907AFF]/10"
                    : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                }`}
              >
                <span className={`w-6 shrink-0 text-right text-xs tabular-nums ${isActive ? "font-bold text-[#907AFF]" : "text-slate-400 dark:text-white/30"}`}>
                  {ch.index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[13px] ${isActive ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-white/70"}`}>
                      {ch.title}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-white/30">
                      {ch.hasContent ? `${ch.words.toLocaleString()} w` : "empty"}
                    </span>
                  </div>
                  {ch.hasContent && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isActive ? "bg-[#907AFF]" : "bg-slate-300 dark:bg-white/20"
                        } ${ch.words < 200 ? "bg-amber-400 dark:bg-amber-500" : ""}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Selected chapter detail ── */}
      {selectedAnalysis && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
              Chapter {selectedAnalysis.index + 1}: {selectedAnalysis.title}
            </h3>
            <button
              type="button"
              onClick={onOpenEdit}
              className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-[#907AFF] transition hover:bg-[#907AFF]/10"
            >
              Edit
            </button>
          </div>
          {selectedAnalysis.hasContent ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <span className="text-slate-400 dark:text-white/40">Words</span>
                <p className="font-semibold tabular-nums text-slate-800 dark:text-white/80">{selectedAnalysis.words.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-slate-400 dark:text-white/40">Paragraphs</span>
                <p className="font-semibold tabular-nums text-slate-800 dark:text-white/80">{selectedAnalysis.paragraphs}</p>
              </div>
              <div>
                <span className="text-slate-400 dark:text-white/40">Sentences</span>
                <p className="font-semibold tabular-nums text-slate-800 dark:text-white/80">{selectedAnalysis.sentences}</p>
              </div>
              <div>
                <span className="text-slate-400 dark:text-white/40">Avg words/sentence</span>
                <p className="font-semibold tabular-nums text-slate-800 dark:text-white/80">{selectedAnalysis.avgWps}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-white/30">This chapter has no content yet.</p>
          )}
        </div>
      )}

      {/* ── Version status ── */}
      {bookVersions.length > 1 && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Versions</h3>
          <div className="space-y-2">
            {bookVersions.map((v) => {
              const lang = getLanguageLabel(v.language_code);
              const isEditing = v.language_code === activeLanguage;
              return (
                <div key={v.id} className="flex items-center justify-between">
                  <span className={`text-[13px] font-medium ${isEditing ? "text-[#907AFF]" : "text-slate-700 dark:text-white/70"}`}>
                    {lang}
                    {isEditing && <span className="ml-1.5 text-[10px] font-normal text-slate-400 dark:text-white/30">(editing)</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    {v.error_message && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">Error</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      v.published_at
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
                    }`}>
                      {v.published_at ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Compare translations ── */}
      {otherVersions.length > 0 && selectedChapter && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Compare translations</h3>
            <select
              value={compareVersionId ?? ""}
              onChange={(e) => setCompareVersionId(e.target.value || null)}
              className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
            >
              <option value="">Select language...</option>
              {otherVersions.map((v) => (
                <option key={v.id} value={v.id}>{getLanguageLabel(v.language_code)}</option>
              ))}
            </select>
          </div>

          {compareVersionId && (
            <div className="grid grid-cols-2 divide-x divide-black/[0.05] dark:divide-white/[0.06]">
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

      {/* ── Quick actions ── */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenEdit}
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white/70 px-3.5 py-2 text-xs font-medium text-slate-600 backdrop-blur-sm transition hover:border-black/[0.12] hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/60 dark:hover:border-white/[0.12] dark:hover:text-white"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
          Edit text
        </button>
        {otherVersions.length > 0 && (
          <button
            type="button"
            onClick={onOpenTranslate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white/70 px-3.5 py-2 text-xs font-medium text-slate-600 backdrop-blur-sm transition hover:border-black/[0.12] hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/60 dark:hover:border-white/[0.12] dark:hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" /></svg>
          Translations
          </button>
        )}
        <button
          type="button"
          onClick={onOpenAudiobook}
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white/70 px-3.5 py-2 text-xs font-medium text-slate-600 backdrop-blur-sm transition hover:border-black/[0.12] hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/60 dark:hover:border-white/[0.12] dark:hover:text-white"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
          {audiobookStatus === "generated" ? "Audio ready" : audiobookStatus === "generating" ? "Audio in progress" : "Generate audio"}
        </button>
      </div>
    </div>
  );
}
