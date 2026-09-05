"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Tool } from "./editor/bookEditor.shared";
import { TOOL_META, getToolHref } from "./editor/bookEditor.shared";

/**
 * Tools that should never appear in the stepper, regardless of which tools
 * the parent passes in. The stepper is the linear "produce → publish" flow
 * surface; ancillary panels (analytics, import, marketing, etc.) live
 * elsewhere in the workspace navigation.
 *
 * `pricing` is deliberately NOT in this set: setting a price is part of the
 * linear flow (it is the step before `publish`), not an ancillary panel.
 */
const NON_STEPPER_TOOLS: ReadonlySet<Tool> = new Set([
  "statistics",
  "import",
  "print",
  "market",
  "trailer",
  "ai",
  "dashboard",
]);

type Props = {
  bookId: string;
  activeTool: Tool;
  tools: Tool[];
  /** When true, renders without the card wrapper (for embedding inside another card) */
  bare?: boolean;
  /** When true, reduces vertical spacing for sticky headers */
  compact?: boolean;
  /** Ultra-compact: hides step counter, minimal padding (for collapsed sticky headers) */
  mini?: boolean;
};

function scrollStepIntoView(element: HTMLAnchorElement, animate: boolean) {
  const scrollRegion = element.closest<HTMLElement>("[data-workflow-scroll]");
  if (!scrollRegion || scrollRegion.scrollWidth <= scrollRegion.clientWidth) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    behavior: animate && !reduceMotion ? "smooth" : "auto",
    block: "nearest",
    inline: "nearest",
  });
}

function StepperContent({ bookId, activeTool, tools, compact = false, mini = false }: Omit<Props, "bare">) {
  // Order comes from the `tools` prop so demo-only entries like 'production'
  // appear in the position the parent inserts them at (between cover and
  // audiobook for the investor pitch). We then strip non-stepper tools.
  const orderedTools = tools.filter((t) => !NON_STEPPER_TOOLS.has(t));
  const currentIndex = orderedTools.indexOf(activeTool);
  const prevTool = currentIndex > 0 ? orderedTools[currentIndex - 1] : null;
  const nextTool =
    currentIndex >= 0 && currentIndex < orderedTools.length - 1
      ? orderedTools[currentIndex + 1]
      : null;
  const stepCount = orderedTools.length;
  const workflowSignature = orderedTools.join("|");
  const stepperInsetClass = "mx-2 sm:mx-6 lg:mx-16 xl:mx-20";
  const activeStepRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const activeStep = activeStepRef.current;
    const scrollRegion = activeStep?.closest<HTMLElement>("[data-workflow-scroll]");
    if (!activeStep || !scrollRegion) return;

    const updateVisibility = () => scrollStepIntoView(activeStep, true);
    updateVisibility();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateVisibility);
      return () => window.removeEventListener("resize", updateVisibility);
    }

    const resizeObserver = new ResizeObserver(updateVisibility);
    resizeObserver.observe(scrollRegion);
    return () => resizeObserver.disconnect();
  }, [activeTool, workflowSignature]);

  return (
    <nav
      aria-label="Book workflow"
      className={`flex min-w-0 items-center ${mini ? "gap-2" : "gap-4"} ${mini || compact ? "mt-0" : "mt-4"}`}
    >
      {prevTool ? (
        <Link
          href={getToolHref(bookId, prevTool)}
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#907AFF]/20 text-[#907AFF] transition-colors hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF] focus-visible:ring-offset-2 lg:flex dark:border-[#907AFF]/25 dark:hover:bg-[#907AFF]/10"
          aria-label={`Back to ${TOOL_META[prevTool].label}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : (
        <div className="hidden h-11 w-11 shrink-0 lg:block" aria-hidden="true" />
      )}

      <div data-workflow-scroll className="-m-1 min-w-0 flex-1 overflow-x-auto overscroll-x-contain scroll-p-1 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className={`relative flex min-w-max justify-between gap-2 ${mini ? "" : stepperInsetClass}`}>
          <div
            className={`absolute left-12 right-12 ${mini ? "bottom-[9px]" : "bottom-[11px]"} h-[2px] rounded-full bg-slate-200/70 lg:left-0 lg:right-0 dark:bg-white/[0.07]`}
            aria-hidden="true"
          >
            {stepCount > 1 && (
              <div
                className="h-full rounded-full bg-[#907AFF]"
                style={{ width: `${(Math.max(0, currentIndex) / (stepCount - 1)) * 100}%` }}
              />
            )}
          </div>

          {orderedTools.map((tool) => {
            const isActive = tool === activeTool;
            return (
              <Link
                key={tool}
                ref={isActive ? activeStepRef : undefined}
                href={getToolHref(bookId, tool)}
                aria-label={`${TOOL_META[tool].label} workflow step`}
                aria-current={isActive ? "step" : undefined}
                onFocus={(event) => scrollStepIntoView(event.currentTarget, false)}
                className={`relative z-10 flex min-h-11 min-w-24 shrink-0 flex-col items-center justify-between gap-2 rounded-lg px-2 ${mini ? "py-1" : "py-1.5"} text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF] focus-visible:ring-offset-2 lg:min-w-11 ${
                  isActive
                    ? "font-semibold text-slate-800 dark:text-white/90"
                    : "text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/70"
                }`}
              >
                <span className="whitespace-nowrap">{TOOL_META[tool].label}</span>
                <span
                  className={`block rounded-full ${
                    isActive
                      ? "h-3 w-3 bg-[#907AFF] ring-[3px] ring-[#907AFF]/15"
                      : "h-2.5 w-2.5 bg-slate-300 dark:bg-white/15"
                  }`}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </div>

      {nextTool ? (
        <Link
          href={getToolHref(bookId, nextTool)}
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#907AFF]/20 text-[#907AFF] transition-colors hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF] focus-visible:ring-offset-2 lg:flex dark:border-[#907AFF]/25 dark:hover:bg-[#907AFF]/10"
          aria-label={`Continue to ${TOOL_META[nextTool].label}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : (
        <div className="hidden h-11 w-11 shrink-0 lg:block" aria-hidden="true" />
      )}
    </nav>
  );
}

export default function BookWorkflowHeader({ bookId, activeTool, tools, bare = false, compact = false, mini = false }: Props) {
  if (bare) {
    return (
      <div className={mini ? "px-4 py-1" : compact ? "px-8 pb-2 pt-2" : "px-8 pb-8 pt-8"}>
        <StepperContent bookId={bookId} activeTool={activeTool} tools={tools} compact={compact} mini={mini} />
      </div>
    );
  }

  return (
    <header className="rounded-2xl border border-black/[0.04] bg-white px-6 pb-6 pt-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:bg-[#111318] dark:shadow-none">
      <StepperContent bookId={bookId} activeTool={activeTool} tools={tools} />
    </header>
  );
}
