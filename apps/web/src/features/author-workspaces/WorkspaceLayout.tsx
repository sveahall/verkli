"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
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
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [hasDockSpace, setHasDockSpace] = useState(false);
  const docked = Boolean(aside) && asideOpen && hasDockSpace;

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    // Measure the workspace, not the viewport: the author navigation also
    // consumes space.
    const observer = new ResizeObserver(([entry]) => {
      setHasDockSpace(hasDockSpaceForContentWidth(entry.contentRect.width));
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

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
    <div className={cn("w-full", className)}>
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
        ref={contentRef}
        className={cn(
          "mx-auto max-w-[1520px] px-4 pb-12 pt-5 sm:px-6 lg:px-8",
          docked &&
            "grid grid-cols-[minmax(0,1fr)_360px] items-start gap-7"
        )}
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
          </dialog>
        ) : null}
      </div>
    </div>
  );
}
