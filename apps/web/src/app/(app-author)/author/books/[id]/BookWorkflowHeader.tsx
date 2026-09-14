"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
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

function StepperContent({ bookId, activeTool, tools, mini = false }: Omit<Props, "bare">) {
  // Order comes from the `tools` prop so demo-only entries like 'production'
  // appear in the position the parent inserts them at (between cover and
  // audiobook for the investor pitch). We then strip non-stepper tools.
  const orderedTools = tools.filter((t) => !NON_STEPPER_TOOLS.has(t));
  const currentIndex = Math.max(0, orderedTools.indexOf(activeTool));
  const prevTool = currentIndex > 0 ? orderedTools[currentIndex - 1] : null;
  const nextTool =
    currentIndex < orderedTools.length - 1
      ? orderedTools[currentIndex + 1]
      : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    const active = scroller?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!scroller || !active) return;
    // Only scroll the step rail; scrollIntoView would also move the manuscript.
    const railBounds = scroller.getBoundingClientRect();
    const bounds = active.getBoundingClientRect();
    if (bounds.left < railBounds.left || bounds.right > railBounds.right) {
      scroller.scrollLeft += bounds.left - railBounds.left - (railBounds.width - bounds.width) / 2;
    }
  }, [activeTool]);

  return (
    <nav aria-label="Book workflow" className="flex min-w-0 items-center gap-2 sm:gap-3">
      {prevTool ? (
        <Link href={getToolHref(bookId, prevTool)} aria-label={`Back to ${TOOL_META[prevTool].label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft size={16} aria-hidden />
        </Link>
      ) : <div className="w-11 shrink-0" aria-hidden />}
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain p-1">
        <ol className={`flex w-max min-w-full items-center ${mini ? "gap-1" : "gap-1 sm:gap-2"}`}>
          {orderedTools.map((t, index) => (
            <li key={t} className="flex-1">
              <Link href={getToolHref(bookId, t)} aria-current={t === activeTool ? "step" : undefined}
                className={`group flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring ${t === activeTool
                  ? "bg-primary text-primary-foreground shadow-surface-sm"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}>
                {!mini && <span className={`text-[11px] tabular-nums ${t === activeTool ? "opacity-65" : "text-muted-foreground/70"}`} aria-hidden>{String(index + 1).padStart(2, "0")}</span>}
                {TOOL_META[t].label}
              </Link>
            </li>
          ))}
        </ol>
      </div>
      {nextTool ? (
        <Link href={getToolHref(bookId, nextTool)} aria-label={`Continue to ${TOOL_META[nextTool].label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowRight size={16} aria-hidden />
        </Link>
      ) : <div className="w-11 shrink-0" aria-hidden />}
    </nav>
  );
}

export default function BookWorkflowHeader({ bookId, activeTool, tools, bare = false, compact = false, mini = false }: Props) {
  if (bare) {
    return (
      <div className={mini ? "px-2 py-2" : compact ? "border-b border-border bg-background/50 px-3 py-3 sm:px-5" : "border-b border-border px-3 py-4 sm:px-5"}>
        <StepperContent bookId={bookId} activeTool={activeTool} tools={tools} compact={compact} mini={mini} />
      </div>
    );
  }

  return (
    <header className="rounded-2xl border border-black/[0.04] bg-card px-6 pb-6 pt-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-border dark:bg-card dark:shadow-none">
      <StepperContent bookId={bookId} activeTool={activeTool} tools={tools} />
    </header>
  );
}
