"use client";

import { useEffect, useRef } from "react";

/**
 * Typeauthor mode: keeps cursor vertically centered with smooth scroll.
 * Listens to selectionchange and scrolls so the caret stays in view center.
 */
export default function EditorContentWrapper({
  children,
  active,
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !scrollRef.current) return;

    const scrollEl = scrollRef.current;

    const scrollToCenter = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed === false) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();
      const viewHeight = scrollEl.clientHeight;
      const scrollHeight = scrollEl.scrollHeight;

      if (scrollHeight <= viewHeight) return;

      const cursorCenter = rect.top - scrollRect.top + rect.height / 2 + scrollEl.scrollTop;
      const targetScroll = cursorCenter - viewHeight / 2;
      const clamped = Math.max(0, Math.min(targetScroll, scrollHeight - viewHeight));

      scrollEl.scrollTo({ top: clamped, behavior: "smooth" });
    };

    const schedule = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        scrollToCenter();
        rafRef.current = null;
      });
    };

    document.addEventListener("selectionchange", schedule);

    return () => {
      document.removeEventListener("selectionchange", schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  if (!active) return <>{children}</>;

  /* Editor first so it's visible and clickable on load.
     Bottom spacer gives room for typeauthor scroll to center cursor. */
  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto overflow-x-hidden"
      style={{ scrollBehavior: "smooth" }}
    >
      {children}
      <div className="min-h-[50vh]" />
    </div>
  );
}
