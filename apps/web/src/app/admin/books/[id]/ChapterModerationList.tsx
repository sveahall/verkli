"use client";

import { useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, FileText, Headphones } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import ChapterAudiobookPlayer from "@/app/(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer";

// Tiptap renderer is client-only (no SSR) — match the reader's usage.
const TiptapRenderer = dynamic(
  () => import("@/components/editor/TiptapRenderer"),
  { ssr: false }
);

export type ModerationChapter = {
  id: string;
  title: string;
  order: number;
  languageCode: string;
  content: string | null;
  sourceText: string | null;
  hasAudio: boolean;
};

type Props = {
  bookId: string;
  chapters: ModerationChapter[];
};

export function ChapterModerationList({ bookId, chapters }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const headingId = useId();

  const sorted = useMemo(
    () => [...chapters].sort((a, b) => a.order - b.order),
    [chapters]
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" aria-hidden />}
        title="No chapters"
        description="This book has no chapters to review yet."
      />
    );
  }

  return (
    <ul className="space-y-3" aria-labelledby={headingId}>
      <li className="sr-only" id={headingId}>
        Chapters
      </li>
      {sorted.map((chapter) => {
        const isExpanded = expandedId === chapter.id;
        const panelId = `chapter-panel-${chapter.id}`;
        const triggerId = `chapter-trigger-${chapter.id}`;
        const hasText = Boolean(
          (chapter.content && chapter.content.trim()) ||
            (chapter.sourceText && chapter.sourceText.trim())
        );
        const renderContent = chapter.content ?? chapter.sourceText ?? null;

        return (
          <li
            key={chapter.id}
            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.02]"
          >
            <button
              type="button"
              id={triggerId}
              aria-expanded={isExpanded}
              aria-controls={panelId}
              onClick={() =>
                setExpandedId((current) =>
                  current === chapter.id ? null : chapter.id
                )
              }
              className="flex w-full min-h-[44px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-inset dark:hover:bg-white/5"
            >
              <span className="text-caption w-8 shrink-0 tabular-nums text-slate-400 dark:text-white/40">
                {chapter.order + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-body font-medium text-slate-800 dark:text-white">
                {chapter.title || "Untitled chapter"}
              </span>
              {chapter.languageCode && (
                <Badge variant="neutral" dot={false}>
                  {chapter.languageCode.toUpperCase()}
                </Badge>
              )}
              {chapter.hasAudio && (
                <Badge
                  variant="info"
                  icon={<Headphones className="h-3 w-3" aria-hidden />}
                >
                  Audio
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 dark:text-white/40",
                  isExpanded && "rotate-180"
                )}
                aria-hidden
              />
            </button>

            {isExpanded && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className="border-t border-slate-200/80 px-4 py-5 dark:border-white/10"
              >
                {hasText ? (
                  <TiptapRenderer
                    content={renderContent}
                    className="text-slate-700 dark:text-white/80"
                  />
                ) : (
                  <p className="text-caption text-slate-400 dark:text-white/40">
                    This chapter has no text content.
                  </p>
                )}

                {chapter.hasAudio && (
                  <ChapterAudiobookPlayer
                    bookId={bookId}
                    chapterId={chapter.id}
                    isAuthorView
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
