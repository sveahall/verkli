"use client";

import Link from "next/link";
import type { Tool } from "./editor/bookEditor.shared";
import { TOOL_META, TOOL_ORDER, getToolHref } from "./editor/bookEditor.shared";

/** Only the 6 linear flow steps appear in the stepper */
const STEPPER_TOOLS: Tool[] = TOOL_ORDER.filter(
  (t) => t !== "statistics" && t !== "import" && t !== "print" && t !== "pricing" && t !== "market"
);

type Props = {
  bookId: string;
  activeTool: Tool;
  tools: Tool[];
  /** When true, renders without the card wrapper (for embedding inside another card) */
  bare?: boolean;
  /** When true, reduces vertical spacing for sticky headers */
  compact?: boolean;
};

function StepperContent({ bookId, activeTool, tools, compact = false }: Omit<Props, "bare">) {
  const orderedTools = STEPPER_TOOLS.filter((t) => tools.includes(t));
  const currentIndex = Math.max(0, orderedTools.indexOf(activeTool));
  const prevTool = currentIndex > 0 ? orderedTools[currentIndex - 1] : null;
  const nextTool =
    currentIndex < orderedTools.length - 1
      ? orderedTools[currentIndex + 1]
      : null;
  const stepCount = orderedTools.length;
  const stepperInsetClass = "mx-2 sm:mx-6 lg:mx-16 xl:mx-20";

  return (
    <>
      <p className={`text-center my-6 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-white/35 ${compact ? "my-2" : "my-6"}`}>
        Step {currentIndex + 1} of {stepCount}
      </p>

      <div className={`flex items-center gap-4 ${compact ? "mt-0" : "mt-4"}`}>
        {prevTool ? (
          <Link
            href={getToolHref(bookId, prevTool)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#907AFF]/20 text-[#907AFF] transition-colors hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.06] dark:border-[#907AFF]/25 dark:hover:bg-[#907AFF]/10"
            aria-label={`Back to ${TOOL_META[prevTool].label}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <div className={`flex justify-between ${stepperInsetClass}`}>
            {orderedTools.map((t, idx) => {
              const isActive = t === activeTool;
              const isDone = idx < currentIndex;
              return (
                <Link
                  key={t}
                  href={getToolHref(bookId, t)}
                  className={`text-xs font-medium transition-colors ${
                    isActive
                      ? "font-semibold text-slate-800 dark:text-white/90"
                      : isDone
                        ? "text-slate-500 hover:text-slate-700 dark:text-white/50"
                        : "text-slate-300 hover:text-slate-500 dark:text-white/20 dark:hover:text-white/40"
                  }`}
                >
                  {TOOL_META[t].label}
                </Link>
              );
            })}
          </div>

          <div className={`relative mt-3 h-[2px] ${stepperInsetClass}`}>
            <div className="absolute inset-0 rounded-full bg-slate-200/70 dark:bg-white/[0.07]" />
            {stepCount > 1 && (
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-[#907AFF]"
                style={{
                  width: `${(currentIndex / (stepCount - 1)) * 100}%`,
                  transition: "width 500ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            )}
            {orderedTools.map((t, idx) => {
              const isActive = t === activeTool;
              const isDone = idx < currentIndex;
              const left = stepCount > 1 ? (idx / (stepCount - 1)) * 100 : 50;
              return (
                <Link
                  key={t}
                  href={getToolHref(bookId, t)}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%` }}
                  aria-label={`${TOOL_META[t].label}${isActive ? " (current)" : ""}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span
                    className={`block rounded-full transition-all duration-300 ${
                      isActive
                        ? "h-3 w-3 bg-[#907AFF] ring-[3px] ring-[#907AFF]/15"
                        : isDone
                          ? "h-2.5 w-2.5 bg-[#907AFF]"
                          : "h-2.5 w-2.5 bg-slate-300 dark:bg-white/15"
                    }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        {nextTool ? (
          <Link
            href={getToolHref(bookId, nextTool)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#907AFF]/20 text-[#907AFF] transition-colors hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.06] dark:border-[#907AFF]/25 dark:hover:bg-[#907AFF]/10"
            aria-label={`Continue to ${TOOL_META[nextTool].label}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        )}
      </div>
    </>
  );
}

export default function BookWorkflowHeader({ bookId, activeTool, tools, bare = false, compact = false }: Props) {
  if (bare) {
    return (
      <div className={compact ? "px-8 pb-2 pt-2" : "px-8 pb-8 pt-8"}>
        <StepperContent bookId={bookId} activeTool={activeTool} tools={tools} compact={compact} />
      </div>
    );
  }

  return (
    <header className="rounded-2xl border border-black/[0.04] bg-white px-6 pb-6 pt-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:bg-[#111318] dark:shadow-none">
      <StepperContent bookId={bookId} activeTool={activeTool} tools={tools} />
    </header>
  );
}
