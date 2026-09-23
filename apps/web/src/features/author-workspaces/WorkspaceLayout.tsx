"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import styles from "./WorkspaceLayout.module.css";
import { cn } from "@/lib/utils";

type WorkspaceLayoutProps = {
  header: ReactNode;
  headerRight?: ReactNode;
  main: ReactNode;
  className?: string;
  mainClassName?: string;
  /**
   * Companion surface. Docks only when the workspace can fit both the canvas
   * and the assistant; otherwise it opens as a modal sheet. One mounted
   * transcript survives closing and switching between those placements.
   */
  aside?: ReactNode;
  asideOpen?: boolean;
  onAsideClose?: () => void;
  /** Accessible name for the slide-over dialog. */
  asideLabel?: string;
  asideId?: string;
};

type SurfaceProps = ComponentPropsWithoutRef<"div">;

type WorkspaceContextCardProps = SurfaceProps & {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
};

type WorkspaceMetricProps = {
  label: string;
  value: ReactNode;
  className?: string;
};

export function WorkspaceSurface({
  className,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgba(25,23,28,0.025)]",
        className
      )}
      {...props}
    />
  );
}

export function WorkspaceRightContextPanel({
  className,
  ...props
}: SurfaceProps) {
  return <div className={cn("space-y-4", className)} {...props} />;
}

export function WorkspaceContextCard({
  eyebrow,
  title,
  description,
  className,
  children,
  ...props
}: WorkspaceContextCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-[0_2px_10px_rgba(25,23,28,0.025)]",
        className
      )}
      {...props}
    >
      {(eyebrow || title || description) ? (
        <div className="space-y-1.5">
          {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
          {title ? (
            <h2 className="author-section-title text-sm text-foreground">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground dark:text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children ? (
        <div className={cn(eyebrow || title || description ? "mt-3" : undefined)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function WorkspaceMetric({
  label,
  value,
  className,
}: WorkspaceMetricProps) {
  return (
    <div className={cn("space-y-0", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground dark:text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground dark:text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Widest the canvas may shrink to before the assistant stops docking beside it
 * and becomes a modal sheet instead. Measured on the workspace content box, not
 * the viewport: the author navigation eats horizontal space too.
 *
 * 620px canvas + 360px dock + 28px gap = 1008, which is a 1072px browser window
 * once the 64px of horizontal padding is added back.
 *
 * This number decides whether the page behind the assistant stays scrollable.
 * Below the threshold the dialog opens with showModal() and the layout sets
 * `body { overflow: hidden }` — correct for a phone-sized sheet, wrong for a
 * laptop. The threshold used to demand an 820px canvas, putting the cutoff at a
 * 1280px window, so anyone whose browser was not maximised opened the assistant
 * and found the page frozen behind a panel that still looked docked.
 */
export const DOCK_MIN_CONTENT_WIDTH = 1008;

export function hasDockSpaceForContentWidth(contentWidth: number): boolean {
  return contentWidth >= DOCK_MIN_CONTENT_WIDTH;
}

/**
 * The docked assistant is a full-height column on the right edge, like an IDE
 * chat, and the author drags its left edge to resize it. The width is clamped
 * so the canvas never drops below MIN_CANVAS_WIDTH.
 */
export const DOCK_DEFAULT_WIDTH = 420;
export const DOCK_MIN_WIDTH = 340;
const MIN_CANVAS_WIDTH = 620;
const HORIZONTAL_PADDING = 64;
const WIDTH_STORAGE_KEY = "verkli:assistant-width";

export function clampDockWidth(width: number, workspaceWidth: number): number {
  const max = Math.max(DOCK_MIN_WIDTH, workspaceWidth - MIN_CANVAS_WIDTH - HORIZONTAL_PADDING);
  return Math.round(Math.min(max, Math.max(DOCK_MIN_WIDTH, width)));
}

function readStoredWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DOCK_DEFAULT_WIDTH;
  } catch { return DOCK_DEFAULT_WIDTH; }
}

export default function WorkspaceLayout({
  header,
  headerRight,
  main,
  className,
  mainClassName,
  aside,
  asideOpen = false,
  onAsideClose,
  asideLabel = "Assistant",
  asideId,
}: WorkspaceLayoutProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DOCK_DEFAULT_WIDTH);
  const workspaceWidthRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [hasDockSpace, setHasDockSpace] = useState(false);
  const docked = Boolean(aside) && asideOpen && hasDockSpace;

  // The width lives on the DOM as a CSS variable, not in React state, so a
  // drag repaints one column instead of re-rendering the whole editor.
  const applyWidth = (width: number, persist = false) => {
    const next = clampDockWidth(width, workspaceWidthRef.current || window.innerWidth);
    widthRef.current = next;
    // On <html> so page-level chrome (the floating theme toggle) can step aside.
    document.documentElement.style.setProperty("--assistant-width", `${next}px`);
    handleRef.current?.setAttribute("aria-valuenow", String(next));
    if (persist) { try { window.localStorage.setItem(WIDTH_STORAGE_KEY, String(next)); } catch { /* per-viewer nicety */ } }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    widthRef.current = readStoredWidth();
    // Measure the workspace including the padding the dock reserves, so docking
    // does not shrink the box it is measured on and flip itself back off. The
    // author navigation is excluded, which is why this is not the viewport.
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? root.getBoundingClientRect().width;
      workspaceWidthRef.current = width;
      applyWidth(widthRef.current);
      setHasDockSpace(hasDockSpaceForContentWidth(width - HORIZONTAL_PADDING));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const page = document.documentElement;
    page.dataset.resizingAssistant = "true";
    // Keep the resize cursor and stop text selection while the pointer
    // wanders over the manuscript mid-drag.
    const previous = { cursor: page.style.cursor, userSelect: page.style.userSelect };
    page.style.cursor = "col-resize";
    page.style.userSelect = "none";
    const move = (moveEvent: PointerEvent) => applyWidth(startWidth + startX - moveEvent.clientX);
    const end = () => {
      delete page.dataset.resizingAssistant;
      page.style.cursor = previous.cursor;
      page.style.userSelect = previous.userSelect;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      applyWidth(widthRef.current, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!asideOpen) {
      if (dialog.open) dialog.close();
      restoreFocusRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = null;
      return;
    }
    if (!restoreFocusRef.current) restoreFocusRef.current = document.activeElement as HTMLElement;
    // Keep one mounted transcript when resizing or closing the assistant.
    if (dialog.open) dialog.close();
    if (hasDockSpace) dialog.show();
    else dialog.showModal();
  }, [asideOpen, hasDockSpace]);

  useEffect(() => {
    if (!asideOpen || hasDockSpace) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [asideOpen, hasDockSpace]);

  return (
    <div ref={rootRef} className={cn("w-full", docked && styles.withDock, className)}>
      <div className="border-b border-border bg-background">
        {/* The book workspace bleeds to the edges: its layout pulls this bar up
            by 16px, and 24px from lg (`-mt-4 lg:-mt-6` in books/[id]/layout.tsx).
            A symmetric `py-4` therefore left the breadcrumb flush against the
            browser chrome with no air above it. Pad the top by the pull plus the
            28px the bar should actually have: 16+28=44, 24+28=52. */}
        <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-3 px-4 pb-4 pt-11 sm:px-6 lg:px-8 lg:pt-13">
          <div className="min-w-0">{header}</div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </div>
      </div>

      <div
        className="mx-auto max-w-[1520px] px-4 pb-12 pt-5 sm:px-6 lg:px-8"
      >
        {/* min-w-0 so a wide child (a table, a code block) shrinks the column
            instead of pushing the dock off-screen. */}
        <div className={cn("min-w-0", mainClassName)}>{main}</div>

        {aside ? (
          <dialog
            ref={dialogRef}
            id={asideId}
            aria-label={asideLabel}
            aria-modal={asideOpen && !hasDockSpace ? true : undefined}
            data-docked-assistant={hasDockSpace ? "" : undefined}
            className={cn(styles.assistant, hasDockSpace && styles.docked)}
            onCancel={(event) => { event.preventDefault(); onAsideClose?.(); }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && hasDockSpace) {
                event.preventDefault();
                onAsideClose?.();
              }
              if (event.key !== "Tab" || hasDockSpace) return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'
              )).filter((element) => element.getClientRects().length > 0);
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
              }
            }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (event.target === event.currentTarget &&
                (event.clientX < bounds.left || event.clientX > bounds.right ||
                  event.clientY < bounds.top || event.clientY > bounds.bottom)) onAsideClose?.();
            }}
          >
            {aside}
            {hasDockSpace && (
              <div
                ref={handleRef}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize assistant"
                aria-valuemin={DOCK_MIN_WIDTH}
                aria-valuenow={DOCK_DEFAULT_WIDTH}
                tabIndex={0}
                title="Drag to resize · double-click to reset"
                className={styles.resizeHandle}
                onPointerDown={startResize}
                onDoubleClick={() => applyWidth(DOCK_DEFAULT_WIDTH, true)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 64 : 16;
                  if (event.key === "ArrowLeft") { event.preventDefault(); applyWidth(widthRef.current + step, true); }
                  if (event.key === "ArrowRight") { event.preventDefault(); applyWidth(widthRef.current - step, true); }
                }}
              />
            )}
          </dialog>
        ) : null}
      </div>
    </div>
  );
}
