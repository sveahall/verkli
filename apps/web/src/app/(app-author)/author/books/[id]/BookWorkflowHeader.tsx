"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Tool } from "./editor/bookEditor.shared";
import { BOOK_WORKFLOW_GROUPS, TOOL_META, getToolHref } from "./editor/bookEditor.shared";
import styles from "./BookWorkflowHeader.module.css";

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
  language?: string;
  activeTool: Tool;
  tools: Tool[];
  /** When true, renders without the card wrapper (for embedding inside another card) */
  bare?: boolean;
  /** When true, reduces vertical spacing for sticky headers */
  compact?: boolean;
  /** Ultra-compact: hides step counter, minimal padding (for collapsed sticky headers) */
  mini?: boolean;
};

function StepperContent({ bookId, language, activeTool, tools, mini = false }: Omit<Props, "bare">) {
  // Order comes from the `tools` prop so demo-only entries like 'production'
  // appear in the position the parent inserts them at (between cover and
  // audiobook for the investor pitch). We then strip non-stepper tools.
  const orderedTools = tools.filter((t) => !NON_STEPPER_TOOLS.has(t));
  const currentIndex = orderedTools.indexOf(activeTool);
  const groups: Array<{ label: string; tools: Tool[] }> = [];
  for (const tool of orderedTools) {
    const label = BOOK_WORKFLOW_GROUPS.find((group) => group.tools.includes(tool))?.label ?? "Production";
    const previous = groups[groups.length - 1];
    if (previous?.label === label) previous.tools.push(tool);
    else groups.push({ label, tools: [tool] });
  }
  const prevTool = currentIndex > 0 ? orderedTools[currentIndex - 1] : null;
  const nextTool =
    currentIndex >= 0 && currentIndex < orderedTools.length - 1
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
    <nav aria-label="Book workflow" className={styles.navigation}>
      <div className={styles.rail}>
        {prevTool && <Link href={getToolHref(bookId, prevTool, language)} aria-label={`Back to ${TOOL_META[prevTool].label}`} className={styles.arrow}><ArrowLeft size={16} aria-hidden /></Link>}
        <div ref={scrollRef} className={styles.scroller}>
          <div className={styles.groups}>
            {groups.map((group, index) => (
              <div key={`${group.label}-${index}`} className={styles.group}>
                {!mini && <span className={styles.label}>{group.label}</span>}
                <ol className={styles.list} aria-label={group.label}>
                  {group.tools.map((t) => (
                    <li key={t}><Link href={getToolHref(bookId, t, language)} aria-current={t === activeTool ? "step" : undefined} className={styles.link}>{TOOL_META[t].label}</Link></li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
        {nextTool && <Link href={getToolHref(bookId, nextTool, language)} aria-label={`Continue to ${TOOL_META[nextTool].label}`} className={styles.arrow}><ArrowRight size={16} aria-hidden /></Link>}
      </div>
      {!mini && (activeTool === "translate" || activeTool === "audiobook") && <p className={styles.note}>Optional edition. You can publish your written book without creating audio or translations.</p>}
    </nav>
  );
}

export default function BookWorkflowHeader({ bookId, language, activeTool, tools, bare = false, compact = false, mini = false }: Props) {
  if (bare) {
    return (
      <div className={mini ? "px-2 py-2" : compact ? "border-b border-border bg-background/50 px-3 py-3 sm:px-5" : "border-b border-border px-3 py-4 sm:px-5"}>
        <StepperContent bookId={bookId} language={language} activeTool={activeTool} tools={tools} compact={compact} mini={mini} />
      </div>
    );
  }

  return (
    <header className="rounded-2xl border border-black/[0.04] bg-card px-6 pb-6 pt-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-border dark:bg-card dark:shadow-none">
      <StepperContent bookId={bookId} language={language} activeTool={activeTool} tools={tools} />
    </header>
  );
}
