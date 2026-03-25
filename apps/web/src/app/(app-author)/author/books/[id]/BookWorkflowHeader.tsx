"use client";

import type { Tool } from "./editor/bookEditor.shared";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TOOL_META, TOOL_ORDER, getToolHref } from "./editor/bookEditor.shared";

type Props = {
  bookId: string;
  bookTitle: string;
  authorDisplayName: string;
  activeTool: Tool;
  tools: Tool[];
  isPublished: boolean;
  chapterCount: number;
  wordCount: number;
  activeLanguageLabel: string;
  versionCount: number;
};

export default function BookWorkflowHeader(_props: Props) {
  const {
    bookId,
    bookTitle,
    authorDisplayName,
    activeTool,
    tools,
    isPublished,
    chapterCount,
    wordCount,
    activeLanguageLabel,
    versionCount,
  } = _props;

  const orderedTools = TOOL_ORDER.filter((t) => tools.includes(t));
  const currentIndex = Math.max(0, orderedTools.indexOf(activeTool));
  const prevTool = currentIndex > 0 ? orderedTools[currentIndex - 1] : null;
  const nextTool = currentIndex < orderedTools.length - 1 ? orderedTools[currentIndex + 1] : null;
  const progress =
    orderedTools.length > 0 ? Math.min(100, Math.max(0, ((currentIndex + 1) / orderedTools.length) * 100)) : 0;

  const stage = TOOL_META[activeTool];
  const isLastStep = !nextTool;

  const wordText = wordCount > 0 ? `${wordCount.toLocaleString()} words` : "Draft in progress";
  const chapterText = `${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}`;
  const languageText = activeLanguageLabel ? activeLanguageLabel.toUpperCase() : "—";

  return (
    <header className="rounded-[28px] border border-black/[0.06] bg-white/70 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0f1117]/60">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/50 px-3 py-1 text-[12px] font-medium text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/80">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-[#907AFF] shadow-[0_0_0_3px_rgba(144,122,255,0.18)] dark:shadow-[0_0_0_3px_rgba(184,169,255,0.14)]"
              />
              {stage.shortLabel}
            </span>
            {isPublished ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                Published
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70">
                In production
              </span>
            )}
          </div>

          <h2 className="mt-2 truncate text-[16px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white/95">
            {bookTitle}
          </h2>

          <p className="mt-1 text-[13px] text-slate-500 dark:text-white/55">
            {authorDisplayName} • {languageText} • {chapterText} • {wordText} • {versionCount} versions
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="w-full md:w-[340px]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                Progress
              </p>
              <p className="text-[12px] font-semibold text-slate-600 dark:text-white/60">
                Step {currentIndex + 1} of {orderedTools.length || 1}
              </p>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-[#907AFF]"
                style={{ width: `${progress}%`, transition: "width 600ms cubic-bezier(0.23,1,0.32,1)" }}
              />
            </div>

            {/* Desktop-only stepper (compact but scannable) */}
            <div className="mt-3 hidden items-center gap-2 overflow-hidden md:flex" aria-label="Workflow steps">
              {orderedTools.map((t, idx) => {
                const active = t === activeTool;
                const done = idx < currentIndex;
                return (
                  <Link
                    key={t}
                    href={getToolHref(bookId, t)}
                    className={cn(
                      "group flex min-w-0 items-center gap-2 rounded-full px-2 py-1 transition-colors",
                      active
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "text-slate-500 hover:bg-slate-50 dark:text-white/55 dark:hover:bg-white/[0.05]",
                      done && !active
                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                        : ""
                    )}
                    aria-current={active ? "step" : undefined}
                    title={TOOL_META[t].label}
                  >
                    <span className="text-[11px] font-semibold tabular-nums">{idx + 1}</span>
                    <span className="truncate text-[11px] font-semibold">{TOOL_META[t].shortLabel}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-end">
            {prevTool ? (
              <Link
                href={getToolHref(bookId, prevTool)}
                className="hidden rounded-full border border-black/[0.06] bg-white/50 px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/80 md:inline-flex"
              >
                ← Back
              </Link>
            ) : null}

            {nextTool ? (
              <Link
                href={getToolHref(bookId, nextTool)}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#907AFF] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-[#7a67f2] hover:shadow-[0_18px_40px_rgba(144,122,255,0.22)] focus:outline-none focus:ring-2 focus:ring-[#907AFF]/40",
                  "md:w-auto"
                )}
              >
                Continue to {TOOL_META[nextTool].label}
              </Link>
            ) : (
              <span className="inline-flex w-full items-center justify-center rounded-full border border-black/[0.06] bg-white/50 px-5 py-2.5 text-[13px] font-semibold text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/80 md:w-auto">
                {isLastStep ? "Final review" : "Ready"}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
