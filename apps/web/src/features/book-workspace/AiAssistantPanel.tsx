"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BookWorkspaceChapter,
  InlineAiAction,
  WriteInlineAiEventDetail,
} from "@/features/book-workspace/types";
import { WRITE_INLINE_AI_EVENT } from "@/features/book-workspace/types";

type AiAssistantPanelProps = {
  bookTitle: string;
  bookId: string;
  activeLanguage: string;
  selectedChapter: BookWorkspaceChapter | null;
  chapters: BookWorkspaceChapter[];
  totalBookWordCount: number;
  onOpenProduction: (kind: "audiobook" | "translation") => void;
  onOpenAudience: () => void;
  onOpenAnalytics: () => void;
};

export default function AiAssistantPanel({
  bookTitle,
  activeLanguage,
  selectedChapter,
  onOpenProduction,
  onOpenAnalytics,
}: AiAssistantPanelProps) {
  const [activeTool, setActiveTool] = useState<InlineAiAction>("rewrite");
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    const handleInlineAiEvent = (event: Event) => {
      const detail = (event as CustomEvent<WriteInlineAiEventDetail>).detail;
      if (!detail) return;
      setActiveTool(detail.action);
      setSelectedText(detail.selectedText);
    };

    window.addEventListener(WRITE_INLINE_AI_EVENT, handleInlineAiEvent as EventListener);
    return () => {
      window.removeEventListener(WRITE_INLINE_AI_EVENT, handleInlineAiEvent as EventListener);
    };
  }, []);

  const tools = useMemo(
    () => [
      {
        id: "rewrite" as const,
        label: "Rewrite",
        description: "Tighten selected copy or reshape the opening.",
        onClick: () => setActiveTool("rewrite"),
      },
      {
        id: "pacing" as const,
        label: "Improve pacing",
        description: "Shorten exposition and sharpen scene momentum.",
        onClick: () => setActiveTool("pacing"),
      },
      {
        id: "audiobook" as const,
        label: "Generate audiobook",
        description: "Open production for voice preview and rendering.",
        onClick: () => {
          setActiveTool("audiobook");
          onOpenProduction("audiobook");
        },
      },
      {
        id: "translate" as const,
        label: "Translate chapter",
        description: "Open production for translation flow.",
        onClick: () => {
          setActiveTool("translate");
          onOpenProduction("translation");
        },
      },
    ],
    [onOpenProduction]
  );

  return (
    <div className="flex h-full min-h-[calc(100vh-12rem)] flex-col">
      <div className="border-b border-slate-200/70 px-5 py-5 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
          AI Tools
        </p>
        <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
          {selectedChapter?.title || bookTitle}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
          {activeLanguage.toUpperCase()} writing support
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {selectedText ? (
          <div className="mb-5 border-l-2 border-[#907AFF] pl-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#907AFF]">
              Selection ready
            </p>
            <p className="mt-2 line-clamp-4 text-sm text-slate-600 dark:text-white/70">
              {selectedText}
            </p>
          </div>
        ) : (
          <div className="mb-5 border-l-2 border-slate-200 pl-3 dark:border-white/10">
            <p className="text-sm text-slate-500 dark:text-white/45">
              Select text in the editor to trigger inline rewrite and pacing actions.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {tools.map((tool) => {
            const isActive = activeTool === tool.id;

            return (
              <button
                key={tool.id}
                type="button"
                onClick={tool.onClick}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white/75 dark:text-white/75 dark:hover:border-white/10 dark:hover:bg-white/[0.03]"
                }`}
              >
                <span className="block text-sm font-medium">{tool.label}</span>
                <span
                  className={`mt-1 block text-xs ${
                    isActive ? "text-white/70 dark:text-slate-700" : "text-slate-500 dark:text-white/45"
                  }`}
                >
                  {tool.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 border-t border-slate-200/70 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
          >
            Open engagement signals
          </button>
        </div>
      </div>
    </div>
  );
}
