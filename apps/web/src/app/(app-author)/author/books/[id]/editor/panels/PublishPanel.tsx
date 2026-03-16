"use client";

import Image from "next/image";
import { useMemo } from "react";
import { getLanguageLabel } from "@/lib/languages";

type PublishVisibility = "public" | "followers" | "private";

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
  book_version_id: string;
};

type BookVersion = {
  id: string;
  language_code: string;
  published_at?: string | null;
  published_chapter_count?: number | null;
};

const VISIBILITY_OPTIONS: Array<{
  value: PublishVisibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: "public",
    label: "Public",
    description: "Visible to everyone. Shown in Discover and on your profile.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.468.73-3.563" />
      </svg>
    ),
  },
  {
    value: "followers",
    label: "Followers only",
    description: "Visible only to readers who follow you.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    value: "private",
    label: "Private",
    description: "Only you can see this version.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
];

export type PublishPanelProps = {
  bookTitle: string;
  authorDisplayName: string;
  coverImageUrl: string | null;
  chapters: Chapter[];
  selectedChapterId: string | null;
  bookVersions: BookVersion[];
  isPublished: boolean;
  publishVisibility: PublishVisibility;
  publishedChapterCount: number | null;
  missingPublishRequirements: string[];
  publishDisabled: boolean;
  chapterPublishDisabled: boolean;
  selectedChapterAlreadyPublished: boolean;
  visibilityChanged: boolean;
  isPublishing: boolean;
  publishError: string | null;
  confirmPublishAction: "publish" | "update" | "unpublish" | null;
  confirmCopy: string | null;
  onVisibilityChange: (v: PublishVisibility) => void;
  onPublishFull: () => void;
  onPublishChapter: () => void;
  onUpdateSettings: () => void;
  onUnpublish: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onChapterPublishToggle: (chapter: Chapter, shouldPublish: boolean) => void;
  onSelectChapter: (id: string) => void;
  onOpenCover: () => void;
  genreSelector?: React.ReactNode;
};

function hasReadableContent(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    const text = extractTextSimple(parsed);
    return text.trim().length > 0;
  } catch {
    return content.trim().length > 0;
  }
}

function extractTextSimple(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return (n.content as unknown[]).map(extractTextSimple).join("");
  return "";
}

export default function PublishPanel({
  bookTitle,
  authorDisplayName,
  coverImageUrl,
  chapters,
  selectedChapterId,
  bookVersions,
  isPublished,
  publishVisibility,
  publishedChapterCount,
  missingPublishRequirements,
  publishDisabled,
  chapterPublishDisabled,
  selectedChapterAlreadyPublished,
  visibilityChanged,
  isPublishing,
  publishError,
  confirmPublishAction,
  confirmCopy,
  onVisibilityChange,
  onPublishFull,
  onPublishChapter,
  onUpdateSettings,
  onUnpublish,
  onConfirm,
  onCancelConfirm,
  onChapterPublishToggle,
  onSelectChapter,
  onOpenCover,
  genreSelector,
}: PublishPanelProps) {
  const liveCount = publishedChapterCount ?? (isPublished ? chapters.length : 0);
  const totalCount = chapters.length;
  const livePercent = totalCount > 0 ? Math.round((liveCount / totalCount) * 100) : 0;

  const versionLanguages = useMemo(
    () => bookVersions.map((v) => getLanguageLabel(v.language_code)),
    [bookVersions],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Hero card: book info + status ── */}
      <div className="grid items-start gap-6 rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] sm:grid-cols-[120px_1fr]">
        {/* Cover thumbnail */}
        <div className="relative mx-auto aspect-[3/4] w-[120px] overflow-hidden rounded-xl border border-black/[0.06] bg-slate-50 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02] sm:mx-0">
          {coverImageUrl ? (
            <Image
              src={coverImageUrl}
              alt="Book cover"
              fill
              sizes="120px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <button
              type="button"
              onClick={onOpenCover}
              className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-300 transition hover:text-slate-500 dark:text-white/20 dark:hover:text-white/40"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
              <span className="text-[10px] font-medium">Add cover</span>
            </button>
          )}
        </div>

        {/* Book info */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                isPublished
                  ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
              }`}
            >
              {isPublished ? "Published" : "Draft"}
            </span>
            {isPublished && (
              <span className="text-[11px] text-slate-400 dark:text-white/40">
                {publishVisibility === "public" ? "Visible to everyone" : publishVisibility === "followers" ? "Followers only" : "Private"}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">{bookTitle}</h2>
          <p className="text-sm text-slate-500 dark:text-white/50">{authorDisplayName}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400 dark:text-white/40">
            <span>{totalCount} chapters</span>
            {isPublished && <span>{liveCount}/{totalCount} live</span>}
            {versionLanguages.length > 0 && <span>{versionLanguages.join(", ")}</span>}
          </div>
        </div>
      </div>

      {/* ── Publish progress (when published) ── */}
      {isPublished && totalCount > 0 && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-white/80">Chapters live</span>
            <span className="tabular-nums text-slate-400 dark:text-white/40">{liveCount} of {totalCount} ({livePercent}%)</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500 dark:bg-emerald-400"
              style={{ width: `${livePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Requirements warning ── */}
      {!isPublished && missingPublishRequirements.length > 0 && (
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
          <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">Before you can publish</h3>
          <ul className="space-y-1.5">
            {missingPublishRequirements.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Visibility selector ── */}
      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Visibility</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = publishVisibility === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onVisibilityChange(option.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition ${
                  selected
                    ? "border-[#907AFF] bg-[#907AFF]/[0.06] dark:bg-[#907AFF]/10"
                    : "border-transparent bg-slate-50/50 hover:bg-slate-50 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className={`${selected ? "text-[#907AFF]" : "text-slate-400 dark:text-white/30"}`}>
                  {option.icon}
                </div>
                <span className={`text-sm font-medium ${selected ? "text-[#907AFF]" : "text-slate-700 dark:text-white/70"}`}>
                  {option.label}
                </span>
                <span className="text-[11px] leading-tight text-slate-400 dark:text-white/40">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Genre selector (if enabled) ── */}
      {genreSelector && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          {genreSelector}
        </div>
      )}

      {/* ── Chapter release control ── */}
      {isPublished && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="border-b border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Chapter release</h3>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {chapters.map((chapter, idx) => {
              const chapterOrder = typeof chapter.order === "number" ? chapter.order : -1;
              const isChapterPublished =
                publishedChapterCount === null || chapterOrder < (publishedChapterCount ?? 0);
              const isNextToPublish =
                publishedChapterCount !== null && chapterOrder === publishedChapterCount;
              const canToggle =
                !isPublishing &&
                (isChapterPublished
                  ? publishedChapterCount === null || chapterOrder === (publishedChapterCount ?? 0) - 1
                  : isNextToPublish);
              const isSelected = chapter.id === selectedChapterId;
              const hasContent = hasReadableContent(chapter.content);

              return (
                <div
                  key={chapter.id}
                  className={`flex items-center gap-3 border-b border-black/[0.03] px-5 py-2.5 last:border-b-0 dark:border-white/[0.03] ${
                    isSelected ? "bg-[#907AFF]/[0.04] dark:bg-[#907AFF]/[0.06]" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChapter(chapter.id)}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    <span className="mr-2 inline-block w-5 text-right text-xs tabular-nums text-slate-400 dark:text-white/30">
                      {idx + 1}
                    </span>
                    <span className={`text-[13px] ${isSelected ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-white/70"}`}>
                      {chapter.title}
                    </span>
                  </button>
                  {!hasContent && (
                    <span className="shrink-0 text-[10px] text-amber-500">empty</span>
                  )}
                  <button
                    type="button"
                    disabled={!canToggle || isPublishing}
                    onClick={() => onChapterPublishToggle(chapter, !isChapterPublished)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      isChapterPublished
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                        : canToggle
                          ? "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
                          : "bg-slate-50 text-slate-300 dark:bg-white/[0.03] dark:text-white/20"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={
                      isChapterPublished
                        ? canToggle ? "Unpublish" : "Unpublish later chapters first"
                        : canToggle ? "Publish" : "Publish earlier chapters first"
                    }
                  >
                    {isChapterPublished ? "Live" : "Draft"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {publishError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {publishError}
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirmPublishAction && confirmCopy && (
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-lg dark:border-white/[0.06] dark:bg-[#0b0b12]">
          <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Confirm action</h3>
          <p className="mb-4 text-sm text-slate-600 dark:text-white/60">{confirmCopy}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPublishing}
              className="rounded-xl bg-[#907AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c6ae6] disabled:opacity-60"
            >
              {isPublishing ? "Working..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={onCancelConfirm}
              className="rounded-xl border border-black/[0.08] px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      {!confirmPublishAction && (
        <div className="flex flex-wrap items-center gap-3">
          {!isPublished ? (
            <>
              <button
                type="button"
                onClick={onPublishFull}
                disabled={publishDisabled}
                className="rounded-xl bg-gradient-to-b from-[#907AFF] to-[#7c6ae6] px-6 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(144,122,255,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:shadow-[0_4px_12px_rgba(144,122,255,0.35)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPublishing ? "Publishing..." : "Publish book"}
              </button>
              <button
                type="button"
                onClick={onPublishChapter}
                disabled={chapterPublishDisabled}
                className="rounded-xl border border-black/[0.08] bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
              >
                {isPublishing
                  ? "Publishing..."
                  : selectedChapterAlreadyPublished
                    ? "Selected chapter already live"
                    : "Publish selected chapter only"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onPublishChapter}
                disabled={chapterPublishDisabled}
                className="rounded-xl bg-gradient-to-b from-[#907AFF] to-[#7c6ae6] px-6 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(144,122,255,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:shadow-[0_4px_12px_rgba(144,122,255,0.35)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPublishing
                  ? "Publishing..."
                  : selectedChapterAlreadyPublished
                    ? "Selected chapter already live"
                    : "Release next chapter"}
              </button>
              {visibilityChanged && (
                <button
                  type="button"
                  onClick={onUpdateSettings}
                  disabled={isPublishing}
                  className="rounded-xl border border-black/[0.08] bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                >
                  Update visibility
                </button>
              )}
              <button
                type="button"
                onClick={onUnpublish}
                disabled={isPublishing}
                className="rounded-xl border border-red-200/60 bg-white px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/30 dark:bg-white/[0.02] dark:text-red-400 dark:hover:bg-red-950/20"
              >
                Unpublish
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
